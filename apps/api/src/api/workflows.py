from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.errors import UniqueViolation
from psycopg.types.json import Json

from api.auth import AuthenticatedUser, get_current_user
from api.db import get_db_connection
from api.workflow_schemas import (
    WorkflowDefinitionCreate,
    WorkflowDefinitionCreateResponse,
    WorkflowDefinitionDetail,
    WorkflowDefinitionListResponse,
)


router = APIRouter(prefix="/api/v1/workflow-definitions", tags=["workflow-definitions"])


def _derive_builder_layout(payload: WorkflowDefinitionCreate) -> dict:
    nodes = []
    edges = []

    for index, step in enumerate(payload.steps):
        nodes.append(
            {
                "id": step.stepCode,
                "position": {"x": index * 220, "y": 120 if index % 2 == 0 else 40},
                "data": {
                    "label": step.stepLabel,
                    "stepType": step.stepType,
                },
            }
        )

    for transition in payload.transitions:
        edges.append(
            {
                "id": f"{transition.fromStepCode}-{transition.actionType}-{transition.toStepCode or 'terminal'}",
                "source": transition.fromStepCode,
                "target": transition.toStepCode,
                "label": transition.transitionLabel,
                "data": {
                    "actionType": transition.actionType,
                    "description": transition.description,
                },
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def _build_graph_json(payload: WorkflowDefinitionCreate) -> dict:
    return {
        "workflow": {
            "key": payload.key,
            "name": payload.name,
            "description": payload.description,
        },
        "steps": [step.model_dump(mode="json") for step in payload.steps],
        "transitions": [transition.model_dump(mode="json") for transition in payload.transitions],
    }


def _validate_workflow(payload: WorkflowDefinitionCreate) -> tuple[dict, dict]:
    errors: list[str] = []
    steps_by_code = {step.stepCode: step for step in payload.steps}

    if len(steps_by_code) != len(payload.steps):
        errors.append("Step codes must be unique.")

    start_steps = [step.stepCode for step in payload.steps if step.stepType == "start"]
    if len(start_steps) != 1:
        errors.append("Exactly one start step is required.")

    terminal_steps = [
        step.stepCode for step in payload.steps if step.isTerminal or step.stepType == "end"
    ]
    if not terminal_steps:
        errors.append("At least one terminal or end step is required.")

    outgoing: dict[str, list] = defaultdict(list)
    seen_unconditional: set[tuple[str, str]] = set()

    for transition in payload.transitions:
        if transition.fromStepCode not in steps_by_code:
            errors.append(f"Transition source step '{transition.fromStepCode}' does not exist.")
            continue

        if transition.toStepCode and transition.toStepCode not in steps_by_code:
            errors.append(f"Transition target step '{transition.toStepCode}' does not exist.")
            continue

        if transition.actionType == "custom" and not transition.actionCode:
            errors.append(
                f"Transition '{transition.fromStepCode}' -> '{transition.toStepCode}' requires an actionCode."
            )

        if (
            transition.toStepCode == transition.fromStepCode
            and transition.conditionExpression is None
        ):
            errors.append(
                f"Unconditional self-loop detected on step '{transition.fromStepCode}'."
            )

        if transition.conditionExpression is None:
            signature = (transition.fromStepCode, transition.actionType)
            if signature in seen_unconditional:
                errors.append(
                    "Only one unconditional transition is allowed per source step and action type."
                )
            seen_unconditional.add(signature)

        outgoing[transition.fromStepCode].append(transition)

    for step in payload.steps:
        if step.stepType == "end" or step.isTerminal:
            continue
        if not outgoing.get(step.stepCode):
            errors.append(f"Step '{step.stepCode}' must have at least one outgoing transition.")

    if start_steps:
        reachable: set[str] = set()
        stack = [start_steps[0]]

        while stack:
            current = stack.pop()
            if current in reachable:
                continue
            reachable.add(current)
            for transition in outgoing.get(current, []):
                if transition.toStepCode:
                    stack.append(transition.toStepCode)

        unreachable = set(steps_by_code) - reachable
        if unreachable:
            errors.append(
                "Every step must be reachable from the start step. Unreachable: "
                + ", ".join(sorted(unreachable))
            )

        visited: set[str] = set()
        active_stack: list[str] = []
        active_lookup: set[str] = set()

        def dfs(step_code: str) -> None:
            visited.add(step_code)
            active_lookup.add(step_code)
            active_stack.append(step_code)

            for transition in outgoing.get(step_code, []):
                next_step = transition.toStepCode
                if not next_step:
                    continue

                if next_step in active_lookup:
                    cycle = active_stack[active_stack.index(next_step) :]
                    if not any(
                        steps_by_code[item].maxVisitsPerInstance is not None for item in cycle
                    ):
                        errors.append(
                            "Detected a cycle without a maxVisitsPerInstance guard on steps: "
                            + ", ".join(cycle)
                        )
                    continue

                if next_step not in visited:
                    dfs(next_step)

            active_stack.pop()
            active_lookup.remove(step_code)

        dfs(start_steps[0])

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"errors": errors},
        )

    builder_layout = payload.builderLayout or _derive_builder_layout(payload)
    return _build_graph_json(payload), builder_layout


def _load_workflow_detail(definition_id: str) -> WorkflowDefinitionDetail:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    d.id,
                    d.key,
                    d.name,
                    d.description,
                    d.status,
                    v.id AS latest_version_id,
                    v.version_no AS latest_version_no,
                    v.graph_json,
                    v.builder_layout
                FROM workflow_definition d
                JOIN LATERAL (
                    SELECT *
                    FROM workflow_definition_version v
                    WHERE v.workflow_definition_id = d.id
                    ORDER BY v.version_no DESC
                    LIMIT 1
                ) v ON TRUE
                WHERE d.id = %s
                """,
                (definition_id,),
            )
            definition_row = cursor.fetchone()

            if definition_row is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Workflow definition not found.",
                )

            version_id = definition_row["latest_version_id"]

            cursor.execute(
                """
                SELECT *
                FROM workflow_step_definition
                WHERE workflow_version_id = %s
                ORDER BY sequence_hint, created_at
                """,
                (version_id,),
            )
            step_rows = cursor.fetchall()

            step_ids = [row["id"] for row in step_rows]

            if step_ids:
                cursor.execute(
                    """
                    SELECT *
                    FROM workflow_step_assignment_policy
                    WHERE step_definition_id = ANY(%s)
                    """,
                    (step_ids,),
                )
                policy_rows = cursor.fetchall()
            else:
                policy_rows = []
            policy_by_step = {row["step_definition_id"]: row for row in policy_rows}

            if step_ids:
                cursor.execute(
                    """
                    SELECT *
                    FROM workflow_step_association
                    WHERE step_definition_id = ANY(%s)
                    ORDER BY notification_order NULLS LAST, priority NULLS LAST, created_at
                    """,
                    (step_ids,),
                )
                association_rows = cursor.fetchall()
            else:
                association_rows = []
            associations_by_step: dict = defaultdict(list)
            for row in association_rows:
                associations_by_step[row["step_definition_id"]].append(
                    {
                        "id": row["id"],
                        "associationType": row["association_type"],
                        "associationValue": row["association_value"],
                        "canApprove": row["can_approve"],
                        "canReject": row["can_reject"],
                        "canRevert": row["can_revert"],
                        "priority": row["priority"],
                        "notificationOrder": row["notification_order"],
                        "escalationAfterSeconds": row["escalation_after_seconds"],
                    }
                )

            step_code_by_id = {row["id"]: row["step_code"] for row in step_rows}

            cursor.execute(
                """
                SELECT *
                FROM workflow_transition_definition
                WHERE workflow_version_id = %s
                ORDER BY priority, created_at
                """,
                (version_id,),
            )
            transition_rows = cursor.fetchall()

    steps = []
    for row in step_rows:
        policy = policy_by_step.get(row["id"])
        steps.append(
            {
                "id": row["id"],
                "stepCode": row["step_code"],
                "stepLabel": row["step_label"],
                "description": row["description"] or "",
                "stepType": row["step_type"],
                "sequenceHint": row["sequence_hint"],
                "allowRevert": row["allow_revert"],
                "remarkRequiredOnApprove": row["remark_required_on_approve"],
                "remarkRequiredOnReject": row["remark_required_on_reject"],
                "remarkRequiredOnRevert": row["remark_required_on_revert"],
                "maxVisitsPerInstance": row["max_visits_per_instance"],
                "formSchema": row["form_schema"] or {},
                "config": row["config"] or {},
                "isTerminal": row["is_terminal"],
                "assignmentPolicy": (
                    {
                        "id": policy["id"],
                        "approvalMode": policy["approval_mode"],
                        "requiredApprovalsCount": policy["required_approvals_count"],
                        "priorityEscalationEnabled": policy["priority_escalation_enabled"],
                        "escalationTimeoutSeconds": policy["escalation_timeout_seconds"],
                        "reminderIntervalSeconds": policy["reminder_interval_seconds"],
                        "maxEscalationCount": policy["max_escalation_count"],
                    }
                    if policy
                    else None
                ),
                "associations": associations_by_step[row["id"]],
            }
        )

    transitions = [
        {
            "id": row["id"],
            "fromStepCode": step_code_by_id[row["from_step_definition_id"]],
            "toStepCode": (
                step_code_by_id[row["to_step_definition_id"]]
                if row["to_step_definition_id"] is not None
                else None
            ),
            "actionType": row["action_type"],
            "actionCode": row["action_code"],
            "transitionLabel": row["transition_label"] or "",
            "description": row["description"] or "",
            "conditionExpression": row["condition_expression"],
            "priority": row["priority"],
        }
        for row in transition_rows
    ]

    return WorkflowDefinitionDetail(
        id=definition_row["id"],
        key=definition_row["key"],
        name=definition_row["name"],
        description=definition_row["description"] or "",
        status=definition_row["status"],
        latestVersionId=definition_row["latest_version_id"],
        latestVersionNo=definition_row["latest_version_no"],
        graphJson=definition_row["graph_json"] or {},
        builderLayout=definition_row["builder_layout"] or {},
        steps=steps,
        transitions=transitions,
    )


@router.get("", response_model=WorkflowDefinitionListResponse)
def list_workflow_definitions(
    _: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowDefinitionListResponse:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    d.id,
                    d.key,
                    d.name,
                    d.description,
                    d.status,
                    v.id AS latest_version_id,
                    v.version_no AS latest_version_no,
                    COUNT(DISTINCT sd.id) AS step_count,
                    COUNT(DISTINCT td.id) AS transition_count
                FROM workflow_definition d
                LEFT JOIN LATERAL (
                    SELECT *
                    FROM workflow_definition_version v
                    WHERE v.workflow_definition_id = d.id
                    ORDER BY v.version_no DESC
                    LIMIT 1
                ) v ON TRUE
                LEFT JOIN workflow_step_definition sd ON sd.workflow_version_id = v.id
                LEFT JOIN workflow_transition_definition td ON td.workflow_version_id = v.id
                GROUP BY d.id, d.key, d.name, d.description, d.status, v.id, v.version_no
                ORDER BY d.created_at DESC
                """
            )
            rows = cursor.fetchall()

    return WorkflowDefinitionListResponse(
        items=[
            {
                "id": row["id"],
                "key": row["key"],
                "name": row["name"],
                "description": row["description"] or "",
                "status": row["status"],
                "latestVersionId": row["latest_version_id"],
                "latestVersionNo": row["latest_version_no"],
                "stepCount": row["step_count"],
                "transitionCount": row["transition_count"],
            }
            for row in rows
        ]
    )


@router.get("/{definition_id}", response_model=WorkflowDefinitionDetail)
def get_workflow_definition(
    definition_id: str,
    _: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowDefinitionDetail:
    return _load_workflow_detail(definition_id)


@router.post("", response_model=WorkflowDefinitionCreateResponse, status_code=status.HTTP_201_CREATED)
def create_workflow_definition(
    payload: WorkflowDefinitionCreate,
    user: AuthenticatedUser = Depends(get_current_user),
) -> WorkflowDefinitionCreateResponse:
    graph_json, builder_layout = _validate_workflow(payload)

    try:
        with get_db_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO workflow_definition (key, name, description, status, created_by)
                    VALUES (%s, %s, %s, 'draft', %s)
                    RETURNING id
                    """,
                    (payload.key, payload.name, payload.description, user.user_id),
                )
                definition_id = cursor.fetchone()["id"]

                cursor.execute(
                    """
                    INSERT INTO workflow_definition_version (
                        workflow_definition_id,
                        version_no,
                        is_published,
                        version_label,
                        definition_snapshot,
                        graph_json,
                        builder_layout,
                        created_by
                    )
                    VALUES (%s, 1, false, 'v1', %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        definition_id,
                        Json(payload.model_dump(mode="json")),
                        Json(graph_json),
                        Json(builder_layout),
                        user.user_id,
                    ),
                )
                version_id = cursor.fetchone()["id"]

                step_id_by_code: dict[str, str] = {}
                for step in payload.steps:
                    cursor.execute(
                        """
                        INSERT INTO workflow_step_definition (
                            workflow_version_id,
                            step_code,
                            step_label,
                            description,
                            step_type,
                            sequence_hint,
                            allow_revert,
                            remark_required_on_approve,
                            remark_required_on_reject,
                            remark_required_on_revert,
                            max_visits_per_instance,
                            form_schema,
                            config,
                            is_terminal
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            version_id,
                            step.stepCode,
                            step.stepLabel,
                            step.description,
                            step.stepType,
                            step.sequenceHint,
                            step.allowRevert,
                            step.remarkRequiredOnApprove,
                            step.remarkRequiredOnReject,
                            step.remarkRequiredOnRevert,
                            step.maxVisitsPerInstance,
                            Json(step.formSchema),
                            Json(step.config),
                            step.isTerminal,
                        ),
                    )
                    step_id = cursor.fetchone()["id"]
                    step_id_by_code[step.stepCode] = step_id

                    policy = step.assignmentPolicy
                    cursor.execute(
                        """
                        INSERT INTO workflow_step_assignment_policy (
                            step_definition_id,
                            approval_mode,
                            required_approvals_count,
                            priority_escalation_enabled,
                            escalation_timeout_seconds,
                            reminder_interval_seconds,
                            max_escalation_count
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            step_id,
                            policy.approvalMode,
                            policy.requiredApprovalsCount,
                            policy.priorityEscalationEnabled,
                            policy.escalationTimeoutSeconds,
                            policy.reminderIntervalSeconds,
                            policy.maxEscalationCount,
                        ),
                    )

                    for association in step.associations:
                        cursor.execute(
                            """
                            INSERT INTO workflow_step_association (
                                step_definition_id,
                                association_type,
                                association_value,
                                can_approve,
                                can_reject,
                                can_revert,
                                priority,
                                notification_order,
                                escalation_after_seconds,
                                is_active
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, true)
                            """,
                            (
                                step_id,
                                association.associationType,
                                association.associationValue,
                                association.canApprove,
                                association.canReject,
                                association.canRevert,
                                association.priority,
                                association.notificationOrder,
                                association.escalationAfterSeconds,
                            ),
                        )

                for transition in payload.transitions:
                    cursor.execute(
                        """
                        INSERT INTO workflow_transition_definition (
                            workflow_version_id,
                            from_step_definition_id,
                            to_step_definition_id,
                            action_type,
                            action_code,
                            transition_label,
                            description,
                            condition_expression,
                            priority
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            version_id,
                            step_id_by_code[transition.fromStepCode],
                            (
                                step_id_by_code[transition.toStepCode]
                                if transition.toStepCode
                                else None
                            ),
                            transition.actionType,
                            transition.actionCode,
                            transition.transitionLabel,
                            transition.description,
                            transition.conditionExpression,
                            transition.priority,
                        ),
                    )

            connection.commit()
    except UniqueViolation as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workflow key already exists.",
        ) from error

    return WorkflowDefinitionCreateResponse(item=_load_workflow_detail(str(definition_id)))
