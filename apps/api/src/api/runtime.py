from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.types.json import Json

from api.auth import AuthenticatedUser, get_current_user
from api.db import get_db_connection
from api.runtime_schemas import (
    HumanTaskListResponse,
    HumanTaskResponse,
    NotificationListResponse,
    NotificationResponse,
    WorkflowInstanceDetail,
    WorkflowInstanceListResponse,
    WorkflowInstanceResponse,
    WorkflowInstanceStartRequest,
    WorkflowInstanceSummary,
    WorkflowTaskActionRequest,
    WorkflowTaskActionResponse,
)


router = APIRouter(tags=["workflow-runtime"])


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _json(value: Any) -> Any:
    return value or {}


def _record_outbox(
    cursor,
    aggregate_type: str,
    aggregate_id,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    cursor.execute(
        """
        INSERT INTO outbox_event (aggregate_type, aggregate_id, event_type, payload)
        VALUES (%s, %s, %s, %s)
        """,
        (aggregate_type, aggregate_id, event_type, Json(payload)),
    )


def _record_status_history(
    cursor,
    workflow_instance_id,
    old_status: str | None,
    new_status: str,
    reason: str | None = None,
    changed_by_action_id=None,
) -> None:
    cursor.execute(
        """
        INSERT INTO workflow_status_history (
            workflow_instance_id,
            old_status,
            new_status,
            reason,
            changed_by_action_id
        )
        VALUES (%s, %s, %s, %s, %s)
        """,
        (workflow_instance_id, old_status, new_status, reason, changed_by_action_id),
    )


def _create_notification(
    cursor,
    user_id: str,
    workflow_instance_id,
    step_instance_id,
    notification_type: str,
    title: str,
    body: str,
) -> None:
    cursor.execute(
        """
        INSERT INTO notification (
            user_id,
            workflow_instance_id,
            step_instance_id,
            notification_type,
            title,
            body
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (user_id, workflow_instance_id, step_instance_id, notification_type, title, body),
    )
    notification_id = cursor.fetchone()["id"]
    _record_outbox(
        cursor,
        "notification",
        notification_id,
        "notification.created",
        {
            "userId": user_id,
            "workflowInstanceId": str(workflow_instance_id),
            "stepInstanceId": str(step_instance_id),
            "notificationType": notification_type,
            "title": title,
            "body": body,
        },
    )


def _render_notification_template(
    title_template: str | None,
    body_template: str | None,
    context: dict[str, Any],
    fallback_title: str,
    fallback_body: str,
) -> tuple[str, str]:
    title = title_template or fallback_title
    body = body_template or fallback_body

    for key, value in context.items():
        title = title.replace(f"{{{key}}}", str(value))
        body = body.replace(f"{{{key}}}", str(value))

    return title, body


def _resolve_version(cursor, workflow_definition_id=None, workflow_key=None):
    if workflow_definition_id is not None:
        cursor.execute(
            """
            SELECT d.id AS workflow_definition_id, d.key, d.name, v.*
            FROM workflow_definition d
            JOIN LATERAL (
                SELECT *
                FROM workflow_definition_version v
                WHERE v.workflow_definition_id = d.id
                ORDER BY is_published DESC, version_no DESC
                LIMIT 1
            ) v ON TRUE
            WHERE d.id = %s
            """,
            (workflow_definition_id,),
        )
    else:
        cursor.execute(
            """
            SELECT d.id AS workflow_definition_id, d.key, d.name, v.*
            FROM workflow_definition d
            JOIN LATERAL (
                SELECT *
                FROM workflow_definition_version v
                WHERE v.workflow_definition_id = d.id
                ORDER BY is_published DESC, version_no DESC
                LIMIT 1
            ) v ON TRUE
            WHERE d.key = %s
            """,
            (workflow_key,),
        )

    version = cursor.fetchone()
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow definition not found.",
        )
    return version


def _get_start_step(cursor, workflow_version_id):
    cursor.execute(
        """
        SELECT *
        FROM workflow_step_definition
        WHERE workflow_version_id = %s AND step_type = 'start'
        ORDER BY sequence_hint, created_at
        LIMIT 1
        """,
        (workflow_version_id,),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Workflow version has no start step.",
        )
    return row


def _get_step_by_id(cursor, step_definition_id):
    cursor.execute(
        """
        SELECT *
        FROM workflow_step_definition
        WHERE id = %s
        """,
        (step_definition_id,),
    )
    return cursor.fetchone()


def _get_mapping(cursor, step_definition_id):
    cursor.execute(
        """
        SELECT *
        FROM workflow_step_mapping
        WHERE step_definition_id = %s
        """,
        (step_definition_id,),
    )
    return cursor.fetchone()


def _get_notification_template(cursor, workflow_version_id, step_definition_id, event_type="task_created"):
    cursor.execute(
        """
        SELECT *
        FROM notification_template
        WHERE workflow_version_id = %s
          AND step_definition_id = %s
          AND event_type = %s
        LIMIT 1
        """,
        (workflow_version_id, step_definition_id, event_type),
    )
    return cursor.fetchone()


def _get_step_by_code(cursor, workflow_version_id, step_code: str):
    cursor.execute(
        """
        SELECT *
        FROM workflow_step_definition
        WHERE workflow_version_id = %s AND step_code = %s
        """,
        (workflow_version_id, step_code),
    )
    return cursor.fetchone()


def _get_transitions(cursor, workflow_version_id, from_step_definition_id, action_type: str):
    cursor.execute(
        """
        SELECT *
        FROM workflow_transition_definition
        WHERE workflow_version_id = %s
          AND from_step_definition_id = %s
          AND action_type = %s
        ORDER BY priority, created_at
        """,
        (workflow_version_id, from_step_definition_id, action_type),
    )
    return cursor.fetchall()


def _get_next_visit_count(cursor, workflow_instance_id, step_definition_id) -> int:
    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM step_instance
        WHERE workflow_instance_id = %s AND step_definition_id = %s
        """,
        (workflow_instance_id, step_definition_id),
    )
    return cursor.fetchone()["count"] + 1


def _available_actions(cursor, workflow_version_id, from_step_definition_id, allow_revert: bool):
    cursor.execute(
        """
        SELECT DISTINCT action_type
        FROM workflow_transition_definition
        WHERE workflow_version_id = %s AND from_step_definition_id = %s
        ORDER BY action_type
        """,
        (workflow_version_id, from_step_definition_id),
    )
    actions = [row["action_type"] for row in cursor.fetchall()]
    if not allow_revert:
        actions = [action for action in actions if action != "revert"]
    return actions


def _resolve_task_assignees(cursor, associations):
    resolved = []
    for association in associations:
        if association["association_type"] == "user":
            value = association["association_value"]
            if "@" in value:
                cursor.execute(
                    'SELECT id, email FROM "user" WHERE email = %s',
                    (value,),
                )
                user_row = cursor.fetchone()
                if user_row is None:
                    continue
                resolved.append(
                    {
                        "assigned_user_id": user_row["id"],
                        "assigned_role_key": None,
                        "assigned_group_key": None,
                        "priority": association["priority"],
                        "notification_order": association["notification_order"],
                        "escalation_after_seconds": association["escalation_after_seconds"],
                    }
                )
            else:
                resolved.append(
                    {
                        "assigned_user_id": value,
                        "assigned_role_key": None,
                        "assigned_group_key": None,
                        "priority": association["priority"],
                        "notification_order": association["notification_order"],
                        "escalation_after_seconds": association["escalation_after_seconds"],
                    }
                )
        elif association["association_type"] == "role":
            resolved.append(
                {
                    "assigned_user_id": None,
                    "assigned_role_key": association["association_value"],
                    "assigned_group_key": None,
                    "priority": association["priority"],
                    "notification_order": association["notification_order"],
                    "escalation_after_seconds": association["escalation_after_seconds"],
                }
            )
        elif association["association_type"] == "group":
            resolved.append(
                {
                    "assigned_user_id": None,
                    "assigned_role_key": None,
                    "assigned_group_key": association["association_value"],
                    "priority": association["priority"],
                    "notification_order": association["notification_order"],
                    "escalation_after_seconds": association["escalation_after_seconds"],
                }
            )
    return resolved


def _create_human_tasks(cursor, workflow_instance, step_instance, step_definition):
    cursor.execute(
        """
        SELECT *
        FROM workflow_step_assignment_policy
        WHERE step_definition_id = %s
        """,
        (step_definition["id"],),
    )
    policy = cursor.fetchone()

    cursor.execute(
        """
        SELECT *
        FROM workflow_step_association
        WHERE step_definition_id = %s AND is_active = true
        ORDER BY notification_order NULLS LAST, priority NULLS LAST, created_at
        """,
        (step_definition["id"],),
    )
    associations = cursor.fetchall()

    resolved_assignees = _resolve_task_assignees(cursor, associations)
    available_actions = _available_actions(
        cursor,
        workflow_instance["workflow_version_id"],
        step_definition["id"],
        step_definition["allow_revert"],
    )
    approval_mode = policy["approval_mode"] if policy else "priority_chain"
    reminder_seconds = policy["reminder_interval_seconds"] if policy else None
    notification_template = _get_notification_template(
        cursor,
        workflow_instance["workflow_version_id"],
        step_definition["id"],
        "task_created",
    )

    active_user_ids = []
    now = _now()

    for index, assignee in enumerate(resolved_assignees):
        task_status = (
            "open"
            if approval_mode in {"approve_any_one", "approve_all", "notify_all"} or index == 0
            else "queued"
        )
        escalation_due_at = None
        if task_status == "queued":
            timeout_seconds = (
                assignee["escalation_after_seconds"]
                or (policy["escalation_timeout_seconds"] if policy else None)
                or 86400
            )
            escalation_due_at = now + timedelta(seconds=timeout_seconds * index)

        due_at = (
            now + timedelta(seconds=reminder_seconds)
            if reminder_seconds and task_status == "open"
            else None
        )

        cursor.execute(
            """
            INSERT INTO human_task (
                workflow_instance_id,
                step_instance_id,
                step_definition_id,
                assigned_user_id,
                assigned_role_key,
                assigned_group_key,
                approval_mode_snapshot,
                priority_rank,
                sequence_no,
                status,
                available_actions,
                due_at,
                escalation_due_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, assigned_user_id
            """,
            (
                workflow_instance["id"],
                step_instance["id"],
                step_definition["id"],
                assignee["assigned_user_id"],
                assignee["assigned_role_key"],
                assignee["assigned_group_key"],
                approval_mode,
                assignee["priority"],
                index + 1,
                task_status,
                Json(available_actions),
                due_at,
                escalation_due_at,
            ),
        )
        task_row = cursor.fetchone()

        if task_status == "open" and task_row["assigned_user_id"]:
            active_user_ids.append(task_row["assigned_user_id"])
            cursor.execute(
                'SELECT email FROM "user" WHERE id = %s',
                (task_row["assigned_user_id"],),
            )
            assignee_row = cursor.fetchone()
            notification_title, notification_body = _render_notification_template(
                notification_template["title_template"] if notification_template else None,
                notification_template["body_template"] if notification_template else None,
                {
                    "workflowName": workflow_instance["workflow_definition_name"],
                    "stepLabel": step_definition["step_label"],
                    "stepCode": step_definition["step_code"],
                    "actorEmail": assignee_row["email"] if assignee_row else "",
                },
                fallback_title=f"Action required: {step_definition['step_label']}",
                fallback_body=(
                    f"The workflow '{workflow_instance['workflow_definition_name']}' is waiting "
                    "for your action."
                ),
            )
            _create_notification(
                cursor,
                task_row["assigned_user_id"],
                workflow_instance["id"],
                step_instance["id"],
                "task_assigned",
                notification_title,
                notification_body,
            )
            _record_outbox(
                cursor,
                "human_task",
                task_row["id"],
                "human_task.assigned",
                {
                    "workflowInstanceId": str(workflow_instance["id"]),
                    "stepInstanceId": str(step_instance["id"]),
                    "stepCode": step_definition["step_code"],
                    "assignedUserId": task_row["assigned_user_id"],
                },
            )

    old_status = workflow_instance["status"]
    new_status = "waiting"
    cursor.execute(
        """
        UPDATE workflow_instance
        SET status = %s, current_step_instance_id = %s, updated_at = now()
        WHERE id = %s
        """,
        (new_status, step_instance["id"], workflow_instance["id"]),
    )
    _record_status_history(
        cursor,
        workflow_instance["id"],
        old_status,
        new_status,
        reason="workflow waiting on human task",
    )

    cursor.execute(
        """
        UPDATE step_instance
        SET status = 'waiting', waiting_since = now()
        WHERE id = %s
        """,
        (step_instance["id"],),
    )

    return active_user_ids


def _complete_workflow(cursor, workflow_instance, step_instance, result_action: str):
    old_status = workflow_instance["status"]
    new_status = "completed" if result_action == "approve" else "rejected"
    cursor.execute(
        """
        UPDATE workflow_instance_data
        SET output_data = context_data, updated_at = now()
        WHERE workflow_instance_id = %s
        """,
        (workflow_instance["id"],),
    )
    cursor.execute(
        """
        UPDATE step_instance
        SET status = %s, completed_at = now(), result_action = %s
        WHERE id = %s
        """,
        (
            "completed" if result_action == "approve" else "rejected",
            result_action,
            step_instance["id"],
        ),
    )
    cursor.execute(
        """
        UPDATE workflow_instance
        SET status = %s, current_step_instance_id = %s, completed_at = now(), updated_at = now()
        WHERE id = %s
        """,
        (new_status, step_instance["id"], workflow_instance["id"]),
    )
    _record_status_history(
        cursor,
        workflow_instance["id"],
        old_status,
        new_status,
        reason="terminal step reached",
    )

    if workflow_instance.get("parent_workflow_instance_id") and workflow_instance.get(
        "parent_step_instance_id"
    ):
        _resume_parent_from_child(cursor, workflow_instance, result_action)


def _cancel_other_tasks(cursor, step_instance_id, except_task_id):
    cursor.execute(
        """
        UPDATE human_task
        SET status = 'cancelled'
        WHERE step_instance_id = %s AND id <> %s AND status IN ('queued', 'open', 'claimed')
        """,
        (step_instance_id, except_task_id),
    )


def _transition_for_action(cursor, workflow_version_id, from_step_definition_id, action_type, action_code):
    transitions = _get_transitions(cursor, workflow_version_id, from_step_definition_id, action_type)
    if action_type == "custom" and action_code:
        for transition in transitions:
            if transition["action_code"] == action_code:
                return transition
        return None
    return transitions[0] if transitions else None


def _resolve_mapping_value(path: str, source: dict[str, Any]):
    if path.startswith("$."):
        path = path[2:]
    current: Any = source
    for part in path.split("."):
        if not part:
            continue
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _apply_output_mapping(output_mapping: dict[str, Any], payload: dict[str, Any], current_context: dict[str, Any]):
    updated = dict(current_context)
    for destination, source_path in (output_mapping or {}).items():
        value = (
            _resolve_mapping_value(source_path, payload)
            if isinstance(source_path, str)
            else source_path
        )
        updated[destination] = value
    return updated


def _start_child_workflow_instance(cursor, parent_workflow_instance, parent_step_instance, mapping):
    child_version = _resolve_version(
        cursor,
        workflow_definition_id=mapping["child_workflow_definition_id"],
    )
    business_key = (
        f"{parent_workflow_instance['id']}::{parent_step_instance['id']}::child"
    )
    cursor.execute(
        """
        INSERT INTO workflow_instance (
            workflow_version_id,
            business_key,
            run_number,
            status,
            started_by,
            parent_workflow_instance_id,
            parent_step_instance_id
        )
        VALUES (%s, %s, 1, 'running', %s, %s, %s)
        RETURNING *
        """,
        (
            child_version["id"],
            business_key,
            parent_workflow_instance.get("started_by"),
            parent_workflow_instance["id"],
            parent_step_instance["id"],
        ),
    )
    child_workflow_instance = cursor.fetchone()
    child_workflow_instance["workflow_definition_name"] = child_version["name"]

    cursor.execute(
        """
        SELECT context_data
        FROM workflow_instance_data
        WHERE workflow_instance_id = %s
        """,
        (parent_workflow_instance["id"],),
    )
    parent_data = cursor.fetchone()
    parent_context = parent_data["context_data"] if parent_data else {}
    child_input = {}
    for destination, source_path in (mapping["input_mapping"] or {}).items():
        if isinstance(source_path, str):
            child_input[destination] = _resolve_mapping_value(source_path, parent_context or {})
        else:
            child_input[destination] = source_path

    cursor.execute(
        """
        INSERT INTO workflow_instance_data (
            workflow_instance_id,
            input_data,
            context_data,
            output_data
        )
        VALUES (%s, %s, %s, '{}'::jsonb)
        """,
        (
            child_workflow_instance["id"],
            Json(child_input),
            Json(child_input),
        ),
    )
    cursor.execute(
        """
        INSERT INTO subworkflow_link (
            parent_workflow_instance_id,
            parent_step_instance_id,
            child_workflow_instance_id,
            link_status
        )
        VALUES (%s, %s, %s, 'running')
        """,
        (
            parent_workflow_instance["id"],
            parent_step_instance["id"],
            child_workflow_instance["id"],
        ),
    )

    start_step = _get_start_step(cursor, child_version["id"])
    _enter_step(cursor, child_workflow_instance, start_step, "approve")


def _resume_parent_from_child(cursor, child_workflow_instance, child_result_action: str):
    cursor.execute(
        """
        SELECT output_data, context_data
        FROM workflow_instance_data
        WHERE workflow_instance_id = %s
        """,
        (child_workflow_instance["id"],),
    )
    child_data = cursor.fetchone()
    output_payload = (
        (child_data["output_data"] if child_data and child_data["output_data"] else None)
        or (child_data["context_data"] if child_data and child_data["context_data"] else None)
        or {}
    )

    cursor.execute(
        """
        SELECT *
        FROM step_instance
        WHERE id = %s
        """,
        (child_workflow_instance["parent_step_instance_id"],),
    )
    parent_step_instance = cursor.fetchone()
    if parent_step_instance is None:
        return

    cursor.execute(
        """
        SELECT *
        FROM workflow_instance
        WHERE id = %s
        """,
        (child_workflow_instance["parent_workflow_instance_id"],),
    )
    parent_workflow_instance = cursor.fetchone()
    if parent_workflow_instance is None:
        return

    parent_step_definition = _get_step_by_id(cursor, parent_step_instance["step_definition_id"])
    mapping = _get_mapping(cursor, parent_step_definition["id"])
    if mapping is None:
        return

    cursor.execute(
        """
        UPDATE subworkflow_link
        SET link_status = %s, resume_action = %s, completed_at = now()
        WHERE child_workflow_instance_id = %s
        """,
        (
            "completed" if child_result_action == "approve" else "failed",
            mapping["completion_action"] if child_result_action == "approve" else mapping["failure_action"],
            child_workflow_instance["id"],
        ),
    )

    cursor.execute(
        """
        SELECT context_data
        FROM workflow_instance_data
        WHERE workflow_instance_id = %s
        """,
        (parent_workflow_instance["id"],),
    )
    parent_data = cursor.fetchone()
    parent_context = parent_data["context_data"] if parent_data else {}
    updated_context = _apply_output_mapping(
        mapping["output_mapping"] or {},
        output_payload,
        parent_context or {},
    )
    cursor.execute(
        """
        UPDATE workflow_instance_data
        SET context_data = %s, updated_at = now()
        WHERE workflow_instance_id = %s
        """,
        (Json(updated_context), parent_workflow_instance["id"]),
    )

    cursor.execute(
        """
        UPDATE step_instance
        SET status = %s, completed_at = now(), result_action = %s, result_payload = %s
        WHERE id = %s
        """,
        (
            "completed" if child_result_action == "approve" else "failed",
            mapping["completion_action"] if child_result_action == "approve" else mapping["failure_action"],
            Json(output_payload),
            parent_step_instance["id"],
        ),
    )

    action_to_apply = (
        mapping["completion_action"] if child_result_action == "approve" else mapping["failure_action"]
    )
    transition = _transition_for_action(
        cursor,
        parent_workflow_instance["workflow_version_id"],
        parent_step_definition["id"],
        action_to_apply,
        None,
    )
    if transition is None or transition["to_step_definition_id"] is None:
        _complete_workflow(cursor, parent_workflow_instance, parent_step_instance, action_to_apply)
        return

    cursor.execute(
        """
        UPDATE workflow_instance
        SET status = 'running', updated_at = now()
        WHERE id = %s
        """,
        (parent_workflow_instance["id"],),
    )
    _record_status_history(
        cursor,
        parent_workflow_instance["id"],
        "paused",
        "running",
        reason="subworkflow completed",
    )

    next_step = _get_step_by_id(cursor, transition["to_step_definition_id"])
    _enter_step(cursor, parent_workflow_instance, next_step, action_to_apply)


def _enter_step(cursor, workflow_instance, step_definition, trigger_action: str = "approve"):
    visit_count = _get_next_visit_count(cursor, workflow_instance["id"], step_definition["id"])

    cursor.execute(
        """
        INSERT INTO step_instance (
            workflow_instance_id,
            step_definition_id,
            attempt_no,
            visit_count,
            status,
            entered_at,
            started_at
        )
        VALUES (%s, %s, 1, %s, 'active', now(), now())
        RETURNING *
        """,
        (workflow_instance["id"], step_definition["id"], visit_count),
    )
    step_instance = cursor.fetchone()

    cursor.execute(
        """
        UPDATE workflow_instance
        SET current_step_instance_id = %s, updated_at = now()
        WHERE id = %s
        """,
        (step_instance["id"], workflow_instance["id"]),
    )

    if step_definition["step_type"] in {"end"} or step_definition["is_terminal"]:
        _complete_workflow(cursor, workflow_instance, step_instance, trigger_action)
        return {"step_instance_id": step_instance["id"], "next_step_code": None}

    if step_definition["step_type"] == "human_task":
        _create_human_tasks(cursor, workflow_instance, step_instance, step_definition)
        return {
            "step_instance_id": step_instance["id"],
            "next_step_code": step_definition["step_code"],
        }

    if step_definition["step_type"] == "subworkflow":
        mapping = _get_mapping(cursor, step_definition["id"])
        if mapping is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Subworkflow step '{step_definition['step_code']}' has no mapping.",
            )

        cursor.execute(
            """
            UPDATE workflow_instance
            SET status = 'paused', current_step_instance_id = %s, updated_at = now()
            WHERE id = %s
            """,
            (step_instance["id"], workflow_instance["id"]),
        )
        _record_status_history(
            cursor,
            workflow_instance["id"],
            workflow_instance["status"],
            "paused",
            reason="waiting on subworkflow",
        )
        cursor.execute(
            """
            UPDATE step_instance
            SET status = 'waiting', waiting_since = now()
            WHERE id = %s
            """,
            (step_instance["id"],),
        )
        _start_child_workflow_instance(cursor, workflow_instance, step_instance, mapping)
        return {
            "step_instance_id": step_instance["id"],
            "next_step_code": step_definition["step_code"],
        }

    cursor.execute(
        """
        UPDATE step_instance
        SET status = 'completed', completed_at = now(), result_action = %s
        WHERE id = %s
        """,
        (trigger_action, step_instance["id"]),
    )

    transition = _transition_for_action(
        cursor,
        workflow_instance["workflow_version_id"],
        step_definition["id"],
        "approve",
        None,
    )

    if transition is None or transition["to_step_definition_id"] is None:
        _complete_workflow(cursor, workflow_instance, step_instance, "approve")
        return {"step_instance_id": step_instance["id"], "next_step_code": None}

    next_step = _get_step_by_id(cursor, transition["to_step_definition_id"])
    return _enter_step(cursor, workflow_instance, next_step, "approve")


def _load_step_instances(cursor, workflow_instance_id):
    cursor.execute(
        """
        SELECT
            si.*,
            sd.step_code,
            sd.step_label,
            sd.step_type
        FROM step_instance si
        JOIN workflow_step_definition sd ON sd.id = si.step_definition_id
        WHERE si.workflow_instance_id = %s
        ORDER BY si.entered_at
        """,
        (workflow_instance_id,),
    )
    rows = cursor.fetchall()
    return [
        {
            "id": row["id"],
            "stepCode": row["step_code"],
            "stepLabel": row["step_label"],
            "stepType": row["step_type"],
            "status": row["status"],
            "visitCount": row["visit_count"],
            "enteredAt": _to_iso(row["entered_at"]),
            "completedAt": _to_iso(row["completed_at"]),
            "waitingSince": _to_iso(row["waiting_since"]),
            "resultAction": row["result_action"],
        }
        for row in rows
    ]


def _load_actions(cursor, workflow_instance_id):
    cursor.execute(
        """
        SELECT *
        FROM workflow_action
        WHERE workflow_instance_id = %s
        ORDER BY created_at
        """,
        (workflow_instance_id,),
    )
    rows = cursor.fetchall()
    return [
        {
            "id": row["id"],
            "actionType": row["action_type"],
            "actionCode": row["action_code"],
            "actorUserId": row["actor_user_id"],
            "actorType": row["actor_type"],
            "remarkText": row["remark_text"],
            "payload": _json(row["payload"]),
            "createdAt": _to_iso(row["created_at"]),
        }
        for row in rows
    ]


def _load_instance_detail(workflow_instance_id) -> WorkflowInstanceDetail:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    wi.*,
                    wd.id AS workflow_definition_id,
                    wd.key AS workflow_definition_key,
                    wd.name AS workflow_definition_name,
                    wdv.graph_json,
                    wdv.builder_layout,
                    sd.step_code AS current_step_code,
                    sd.step_label AS current_step_label,
                    wid.input_data,
                    wid.context_data,
                    wid.output_data
                FROM workflow_instance wi
                JOIN workflow_definition_version wdv ON wdv.id = wi.workflow_version_id
                JOIN workflow_definition wd ON wd.id = wdv.workflow_definition_id
                LEFT JOIN step_instance si ON si.id = wi.current_step_instance_id
                LEFT JOIN workflow_step_definition sd ON sd.id = si.step_definition_id
                LEFT JOIN workflow_instance_data wid ON wid.workflow_instance_id = wi.id
                WHERE wi.id = %s
                """,
                (workflow_instance_id,),
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workflow instance not found.",
                )

            steps = _load_step_instances(cursor, workflow_instance_id)
            actions = _load_actions(cursor, workflow_instance_id)

    return WorkflowInstanceDetail(
        id=row["id"],
        workflowDefinitionId=row["workflow_definition_id"],
        workflowDefinitionKey=row["workflow_definition_key"],
        workflowDefinitionName=row["workflow_definition_name"],
        workflowVersionId=row["workflow_version_id"],
        businessKey=row["business_key"],
        runNumber=row["run_number"],
        status=row["status"],
        currentStepCode=row["current_step_code"],
        currentStepLabel=row["current_step_label"],
        startedBy=row["started_by"],
        startedAt=_to_iso(row["started_at"]),
        completedAt=_to_iso(row["completed_at"]),
        inputData=_json(row["input_data"]),
        contextData=_json(row["context_data"]),
        outputData=_json(row["output_data"]),
        graphJson=_json(row["graph_json"]),
        builderLayout=_json(row["builder_layout"]),
        steps=steps,
        actions=actions,
    )


@router.post(
    "/api/v1/workflow-instances",
    response_model=WorkflowInstanceResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_workflow_instance(
    payload: WorkflowInstanceStartRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowInstanceResponse:
    if not payload.workflowDefinitionId and not payload.workflowKey:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="workflowDefinitionId or workflowKey is required.",
        )

    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            version = _resolve_version(
                cursor,
                workflow_definition_id=payload.workflowDefinitionId,
                workflow_key=payload.workflowKey,
            )

            cursor.execute(
                """
                SELECT COALESCE(MAX(run_number), 0) AS max_run_number
                FROM workflow_instance
                WHERE workflow_version_id = %s AND business_key IS NOT DISTINCT FROM %s
                """,
                (version["id"], payload.businessKey),
            )
            run_number = cursor.fetchone()["max_run_number"] + 1

            cursor.execute(
                """
                INSERT INTO workflow_instance (
                    workflow_version_id,
                    business_key,
                    run_number,
                    status,
                    started_by
                )
                VALUES (%s, %s, %s, 'running', %s)
                RETURNING *
                """,
                (version["id"], payload.businessKey, run_number, user.user_id),
            )
            workflow_instance = cursor.fetchone()
            workflow_instance["workflow_definition_name"] = version["name"]

            cursor.execute(
                """
                INSERT INTO workflow_instance_data (
                    workflow_instance_id,
                    input_data,
                    context_data,
                    output_data
                )
                VALUES (%s, %s, %s, '{}'::jsonb)
                """,
                (
                    workflow_instance["id"],
                    Json(payload.inputData),
                    Json(payload.contextData),
                ),
            )

            cursor.execute(
                """
                INSERT INTO workflow_action (
                    workflow_instance_id,
                    action_type,
                    actor_user_id,
                    actor_type,
                    payload
                )
                VALUES (%s, 'start', %s, 'user', %s)
                RETURNING id
                """,
                (
                    workflow_instance["id"],
                    user.user_id,
                    Json(
                        {
                            "workflowDefinitionKey": version["key"],
                            "businessKey": payload.businessKey,
                        }
                    ),
                ),
            )
            action_id = cursor.fetchone()["id"]

            _record_status_history(
                cursor,
                workflow_instance["id"],
                None,
                "running",
                reason="workflow started",
                changed_by_action_id=action_id,
            )

            start_step = _get_start_step(cursor, version["id"])
            _enter_step(cursor, workflow_instance, start_step, "approve")
            connection.commit()

    return WorkflowInstanceResponse(item=_load_instance_detail(workflow_instance["id"]))


@router.get("/api/v1/workflow-instances", response_model=WorkflowInstanceListResponse)
def list_workflow_instances(
    _: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowInstanceListResponse:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    wi.*,
                    wd.id AS workflow_definition_id,
                    wd.key AS workflow_definition_key,
                    wd.name AS workflow_definition_name,
                    sd.step_code AS current_step_code,
                    sd.step_label AS current_step_label
                FROM workflow_instance wi
                JOIN workflow_definition_version wdv ON wdv.id = wi.workflow_version_id
                JOIN workflow_definition wd ON wd.id = wdv.workflow_definition_id
                LEFT JOIN step_instance si ON si.id = wi.current_step_instance_id
                LEFT JOIN workflow_step_definition sd ON sd.id = si.step_definition_id
                ORDER BY wi.started_at DESC
                """
            )
            rows = cursor.fetchall()

    return WorkflowInstanceListResponse(
        items=[
            WorkflowInstanceSummary(
                id=row["id"],
                workflowDefinitionId=row["workflow_definition_id"],
                workflowDefinitionKey=row["workflow_definition_key"],
                workflowDefinitionName=row["workflow_definition_name"],
                workflowVersionId=row["workflow_version_id"],
                businessKey=row["business_key"],
                runNumber=row["run_number"],
                status=row["status"],
                currentStepCode=row["current_step_code"],
                currentStepLabel=row["current_step_label"],
                startedBy=row["started_by"],
                startedAt=_to_iso(row["started_at"]),
                completedAt=_to_iso(row["completed_at"]),
            )
            for row in rows
        ]
    )


@router.get("/api/v1/workflow-instances/{workflow_instance_id}", response_model=WorkflowInstanceResponse)
def get_workflow_instance(
    workflow_instance_id: str,
    _: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowInstanceResponse:
    return WorkflowInstanceResponse(item=_load_instance_detail(workflow_instance_id))


def _current_user_matches_task(user: AuthenticatedUser, task_row) -> bool:
    if task_row["assigned_user_id"] and task_row["assigned_user_id"] == user.user_id:
        return True
    if task_row["assigned_user_email"] and task_row["assigned_user_email"] == user.email:
        return True
    return False


def _remark_required(task_row, action_type: str) -> bool:
    if action_type == "approve":
        return task_row["remark_required_on_approve"]
    if action_type == "reject":
        return task_row["remark_required_on_reject"]
    if action_type == "revert":
        return task_row["remark_required_on_revert"]
    return False


def _apply_task_action(
    cursor,
    task_row,
    user: AuthenticatedUser,
    payload: WorkflowTaskActionRequest,
) -> WorkflowTaskActionResponse:
    if task_row["status"] != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only open tasks can be actioned.",
        )

    if not _current_user_matches_task(user, task_row):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this task.",
        )

    if _remark_required(task_row, payload.actionType) and not payload.remark:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A remark is required for this action.",
        )

    action_type = payload.actionType
    transition = _transition_for_action(
        cursor,
        task_row["workflow_version_id"],
        task_row["step_definition_id"],
        action_type,
        payload.actionCode,
    )
    if transition is None and action_type != "approve":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No matching transition exists for this action.",
        )

    cursor.execute(
        """
        INSERT INTO workflow_action (
            workflow_instance_id,
            step_instance_id,
            action_type,
            action_code,
            actor_user_id,
            actor_type,
            remark_text,
            payload
        )
        VALUES (%s, %s, %s, %s, %s, 'user', %s, %s)
        RETURNING id
        """,
        (
            task_row["workflow_instance_id"],
            task_row["step_instance_id"],
            action_type,
            payload.actionCode,
            user.user_id,
            payload.remark,
            Json(payload.payload),
        ),
    )
    action_id = cursor.fetchone()["id"]

    cursor.execute(
        """
        UPDATE human_task
        SET status = 'completed', completed_at = now()
        WHERE id = %s
        """,
        (task_row["id"],),
    )

    advance = True
    if action_type == "approve" and task_row["approval_mode_snapshot"] == "approve_all":
        cursor.execute(
            """
            SELECT COUNT(*) AS remaining
            FROM human_task
            WHERE step_instance_id = %s AND status IN ('open', 'queued', 'claimed') AND id <> %s
            """,
            (task_row["step_instance_id"], task_row["id"]),
        )
        remaining = cursor.fetchone()["remaining"]
        if remaining > 0:
            advance = False
            cursor.execute(
                """
                UPDATE step_instance
                SET result_action = 'approve'
                WHERE id = %s
                """,
                (task_row["step_instance_id"],),
            )

    if not advance:
        return WorkflowTaskActionResponse(
            workflowInstanceId=task_row["workflow_instance_id"],
            stepInstanceId=task_row["step_instance_id"],
            actionType=action_type,
            workflowStatus="waiting",
            nextStepCode=None,
        )

    _cancel_other_tasks(cursor, task_row["step_instance_id"], task_row["id"])

    step_status = {
        "approve": "completed",
        "reject": "rejected",
        "revert": "reverted",
        "custom": "completed",
    }[action_type]
    cursor.execute(
        """
        UPDATE step_instance
        SET status = %s, completed_at = now(), actor_user_id = %s, result_action = %s, result_payload = %s
        WHERE id = %s
        """,
        (
            step_status,
            user.user_id,
            action_type,
            Json(payload.payload),
            task_row["step_instance_id"],
        ),
    )

    next_step_code = None
    new_status = task_row["workflow_status"]
    old_status = task_row["workflow_status"]

    if transition is None or transition["to_step_definition_id"] is None:
        new_status = "completed" if action_type == "approve" else "rejected"
        cursor.execute(
            """
            UPDATE workflow_instance
            SET status = %s, completed_at = now(), updated_at = now()
            WHERE id = %s
            """,
            (new_status, task_row["workflow_instance_id"]),
        )
        _record_status_history(
            cursor,
            task_row["workflow_instance_id"],
            old_status,
            new_status,
            reason=f"task action {action_type}",
            changed_by_action_id=action_id,
        )
    else:
        next_step = _get_step_by_id(cursor, transition["to_step_definition_id"])
        cursor.execute(
            """
            SELECT *
            FROM workflow_instance
            WHERE id = %s
            """,
            (task_row["workflow_instance_id"],),
        )
        workflow_instance = cursor.fetchone()
        workflow_instance["workflow_definition_name"] = task_row["workflow_definition_name"]
        entry = _enter_step(cursor, workflow_instance, next_step, action_type)
        next_step_code = entry["next_step_code"]
        cursor.execute(
            """
            SELECT status
            FROM workflow_instance
            WHERE id = %s
            """,
            (task_row["workflow_instance_id"],),
        )
        new_status = cursor.fetchone()["status"]

    _record_outbox(
        cursor,
        "workflow_action",
        action_id,
        "workflow.action.recorded",
        {
            "workflowInstanceId": str(task_row["workflow_instance_id"]),
            "stepInstanceId": str(task_row["step_instance_id"]),
            "actionType": action_type,
            "actorUserId": user.user_id,
        },
    )

    return WorkflowTaskActionResponse(
        workflowInstanceId=task_row["workflow_instance_id"],
        stepInstanceId=task_row["step_instance_id"],
        actionType=action_type,
        workflowStatus=new_status,
        nextStepCode=next_step_code,
    )


def _fetch_task_for_action(cursor, task_id):
    cursor.execute(
        """
        SELECT
            ht.*,
            wi.workflow_version_id,
            wi.status AS workflow_status,
            wd.name AS workflow_definition_name,
            sd.step_code,
            sd.step_label,
            sd.remark_required_on_approve,
            sd.remark_required_on_reject,
            sd.remark_required_on_revert,
            assigned.email AS assigned_user_email
        FROM human_task ht
        JOIN workflow_instance wi ON wi.id = ht.workflow_instance_id
        JOIN workflow_definition_version wdv ON wdv.id = wi.workflow_version_id
        JOIN workflow_definition wd ON wd.id = wdv.workflow_definition_id
        JOIN workflow_step_definition sd ON sd.id = ht.step_definition_id
        LEFT JOIN "user" assigned ON assigned.id = ht.assigned_user_id
        WHERE ht.id = %s
        """,
        (task_id,),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )
    return row


@router.get("/api/v1/me/tasks", response_model=HumanTaskListResponse)
def list_my_tasks(user: AuthenticatedUser = Depends(get_current_user)) -> HumanTaskListResponse:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    ht.*,
                    sd.step_code,
                    sd.step_label
                FROM human_task ht
                JOIN workflow_step_definition sd ON sd.id = ht.step_definition_id
                LEFT JOIN "user" assigned ON assigned.id = ht.assigned_user_id
                WHERE (
                    ht.assigned_user_id = %s
                    OR assigned.email = %s
                    OR ht.assigned_role_key = 'user'
                )
                ORDER BY ht.created_at DESC
                """,
                (user.user_id, user.email),
            )
            rows = cursor.fetchall()

    return HumanTaskListResponse(
        items=[
            HumanTaskResponse(
                id=row["id"],
                workflowInstanceId=row["workflow_instance_id"],
                stepInstanceId=row["step_instance_id"],
                stepDefinitionId=row["step_definition_id"],
                stepCode=row["step_code"],
                stepLabel=row["step_label"],
                assignedUserId=row["assigned_user_id"],
                assignedRoleKey=row["assigned_role_key"],
                assignedGroupKey=row["assigned_group_key"],
                approvalModeSnapshot=row["approval_mode_snapshot"],
                priorityRank=row["priority_rank"],
                sequenceNo=row["sequence_no"],
                status=row["status"],
                availableActions=row["available_actions"] or [],
                dueAt=_to_iso(row["due_at"]),
                escalationDueAt=_to_iso(row["escalation_due_at"]),
                createdAt=_to_iso(row["created_at"]),
            )
            for row in rows
        ]
    )


@router.post("/api/v1/human-tasks/{task_id}/actions", response_model=WorkflowTaskActionResponse)
def action_human_task(
    task_id: str,
    payload: WorkflowTaskActionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowTaskActionResponse:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            task_row = _fetch_task_for_action(cursor, task_id)
            response = _apply_task_action(cursor, task_row, user, payload)
            connection.commit()
            return response


@router.post("/api/v1/human-tasks/{task_id}/approve", response_model=WorkflowTaskActionResponse)
def approve_human_task(
    task_id: str,
    payload: WorkflowTaskActionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowTaskActionResponse:
    payload.actionType = "approve"
    return action_human_task(task_id, payload, user)


@router.post("/api/v1/human-tasks/{task_id}/reject", response_model=WorkflowTaskActionResponse)
def reject_human_task(
    task_id: str,
    payload: WorkflowTaskActionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowTaskActionResponse:
    payload.actionType = "reject"
    return action_human_task(task_id, payload, user)


@router.post("/api/v1/human-tasks/{task_id}/revert", response_model=WorkflowTaskActionResponse)
def revert_human_task(
    task_id: str,
    payload: WorkflowTaskActionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowTaskActionResponse:
    payload.actionType = "revert"
    return action_human_task(task_id, payload, user)


@router.get("/api/v1/me/notifications", response_model=NotificationListResponse)
def list_my_notifications(
    user: AuthenticatedUser = Depends(get_current_user),
) -> NotificationListResponse:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT *
                FROM notification
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user.user_id,),
            )
            rows = cursor.fetchall()

    return NotificationListResponse(
        items=[
            NotificationResponse(
                id=row["id"],
                workflowInstanceId=row["workflow_instance_id"],
                stepInstanceId=row["step_instance_id"],
                notificationType=row["notification_type"],
                title=row["title"],
                body=row["body"],
                isRead=row["is_read"],
                readAt=_to_iso(row["read_at"]),
                createdAt=_to_iso(row["created_at"]),
            )
            for row in rows
        ]
    )


@router.post("/api/v1/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> NotificationResponse:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE notification
                SET is_read = true, read_at = now()
                WHERE id = %s AND user_id = %s
                RETURNING *
                """,
                (notification_id, user.user_id),
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Notification not found.",
                )
            connection.commit()

    return NotificationResponse(
        id=row["id"],
        workflowInstanceId=row["workflow_instance_id"],
        stepInstanceId=row["step_instance_id"],
        notificationType=row["notification_type"],
        title=row["title"],
        body=row["body"],
        isRead=row["is_read"],
        readAt=_to_iso(row["read_at"]),
        createdAt=_to_iso(row["created_at"]),
    )
