from __future__ import annotations

import logging
import signal
from threading import Event
from typing import Any

from api.config import Settings, get_settings
from api.db import get_db_connection
from api.realtime import publish_realtime_event
from api.runtime import _create_notification, _record_outbox


logger = logging.getLogger(__name__)


def _acquire_iteration_lock(cursor, lock_id: int) -> bool:
    cursor.execute(
        "SELECT pg_try_advisory_xact_lock(%s) AS acquired",
        (lock_id,),
    )
    row = cursor.fetchone()
    return bool(row["acquired"])


def run_once(settings: Settings | None = None) -> int:
    active_settings = settings or get_settings()
    released = 0

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            if not _acquire_iteration_lock(
                cursor,
                active_settings.priority_release_advisory_lock_id,
            ):
                connection.rollback()
                logger.debug("Skipped priority release iteration because another worker is active.")
                return 0

            cursor.execute(
                """
                WITH due_tasks AS (
                    SELECT DISTINCT ON (queued.step_instance_id)
                        queued.id,
                        queued.step_instance_id,
                        queued.workflow_instance_id,
                        queued.assigned_user_id,
                        queued.step_definition_id,
                        queued.sequence_no,
                        queued.escalation_due_at
                    FROM human_task queued
                    WHERE queued.status = 'queued'
                      AND queued.approval_mode_snapshot = 'priority_chain'
                      AND queued.escalation_due_at IS NOT NULL
                      AND queued.escalation_due_at <= now()
                      AND NOT EXISTS (
                          SELECT 1
                          FROM human_task active
                          WHERE active.step_instance_id = queued.step_instance_id
                            AND active.status IN ('open', 'claimed')
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM human_task completed
                          WHERE completed.step_instance_id = queued.step_instance_id
                            AND completed.status = 'completed'
                      )
                    ORDER BY queued.step_instance_id, queued.sequence_no
                ),
                selected_due_tasks AS (
                    SELECT *
                    FROM due_tasks
                    ORDER BY escalation_due_at, step_instance_id, sequence_no
                    LIMIT %s
                )
                SELECT
                    selected_due_tasks.id,
                    selected_due_tasks.step_instance_id,
                    selected_due_tasks.workflow_instance_id,
                    selected_due_tasks.assigned_user_id,
                    selected_due_tasks.step_definition_id,
                    sd.step_label,
                    wd.name AS workflow_definition_name
                FROM selected_due_tasks
                JOIN workflow_step_definition sd ON sd.id = selected_due_tasks.step_definition_id
                JOIN workflow_instance wi ON wi.id = selected_due_tasks.workflow_instance_id
                JOIN workflow_definition_version wdv ON wdv.id = wi.workflow_version_id
                JOIN workflow_definition wd ON wd.id = wdv.workflow_definition_id
                """,
                (active_settings.priority_release_batch_size,),
            )
            rows = cursor.fetchall()

            for row in rows:
                cursor.execute(
                    """
                    UPDATE human_task
                    SET status = 'expired'
                    WHERE step_instance_id = %s AND status IN ('open', 'claimed')
                    """,
                    (row["step_instance_id"],),
                )
                cursor.execute(
                    """
                    UPDATE human_task
                    SET status = 'open', due_at = now()
                    WHERE id = %s
                      AND status = 'queued'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM human_task active
                          WHERE active.step_instance_id = %s
                            AND active.id <> %s
                            AND active.status IN ('open', 'claimed')
                      )
                      AND NOT EXISTS (
                          SELECT 1
                          FROM human_task completed
                          WHERE completed.step_instance_id = %s
                            AND completed.status = 'completed'
                      )
                    RETURNING id
                    """,
                    (
                        row["id"],
                        row["step_instance_id"],
                        row["id"],
                        row["step_instance_id"],
                    ),
                )
                released_row = cursor.fetchone()
                if released_row is None:
                    continue

                if row["assigned_user_id"]:
                    _create_notification(
                        cursor,
                        row["assigned_user_id"],
                        row["workflow_instance_id"],
                        row["step_instance_id"],
                        "task_escalated",
                        f"Escalated task: {row['step_label']}",
                        (
                            f"The workflow '{row['workflow_definition_name']}' moved to the next "
                            "priority assignee."
                        ),
                    )
                    _record_outbox(
                        cursor,
                        "human_task",
                        row["id"],
                        "human_task.escalated",
                        {
                            "workflowInstanceId": str(row["workflow_instance_id"]),
                            "stepInstanceId": str(row["step_instance_id"]),
                            "assignedUserId": row["assigned_user_id"],
                        },
                    )

                released += 1

            if released > 0:
                publish_realtime_event(
                    cursor,
                    "runtime.priority_release.changed",
                    channels=["instances", "tasks"],
                    broadcast=True,
                )

        connection.commit()

    logger.info("Processed priority release batch.", extra={"released_count": released})
    return released


def run_forever(settings: Settings | None = None) -> None:
    active_settings = settings or get_settings()
    stop_event = Event()

    def handle_signal(signum: int, _frame: Any) -> None:
        logger.info("Stopping priority release worker.", extra={"signal": signum})
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info(
        "Starting priority release worker.",
        extra={
            "batch_size": active_settings.priority_release_batch_size,
            "poll_interval_seconds": active_settings.priority_release_poll_interval_seconds,
        },
    )

    while not stop_event.is_set():
        try:
            released = run_once(active_settings)
            if released > 0:
                continue
        except Exception:
            logger.exception("Priority release worker iteration failed.")

        if stop_event.wait(active_settings.priority_release_poll_interval_seconds):
            break
