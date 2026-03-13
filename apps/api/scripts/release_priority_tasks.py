from __future__ import annotations

from api.db import get_db_connection
from api.runtime import _create_notification, _record_outbox


def main() -> None:
    released = 0

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH due_tasks AS (
                    SELECT DISTINCT ON (queued.step_instance_id)
                        queued.id,
                        queued.step_instance_id,
                        queued.workflow_instance_id,
                        queued.assigned_user_id,
                        queued.step_definition_id,
                        queued.sequence_no
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
                )
                SELECT
                    due_tasks.id,
                    due_tasks.step_instance_id,
                    due_tasks.workflow_instance_id,
                    due_tasks.assigned_user_id,
                    due_tasks.step_definition_id,
                    sd.step_label,
                    wd.name AS workflow_definition_name
                FROM due_tasks
                JOIN workflow_step_definition sd ON sd.id = due_tasks.step_definition_id
                JOIN workflow_instance wi ON wi.id = due_tasks.workflow_instance_id
                JOIN workflow_definition_version wdv ON wdv.id = wi.workflow_version_id
                JOIN workflow_definition wd ON wd.id = wdv.workflow_definition_id
                """
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
                    """,
                    (row["id"],),
                )

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

        connection.commit()

    print(f"Released {released} queued priority-chain tasks.")


if __name__ == "__main__":
    main()
