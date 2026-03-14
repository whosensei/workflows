from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


WorkflowStatus = Literal[
    "running",
    "waiting",
    "paused",
    "completed",
    "rejected",
    "failed",
    "cancelled",
]

TaskStatus = Literal["queued", "open", "claimed", "completed", "expired", "cancelled"]
StepStatus = Literal[
    "pending",
    "active",
    "waiting",
    "completed",
    "rejected",
    "reverted",
    "failed",
    "cancelled",
]
TaskActionType = Literal["approve", "reject", "revert", "custom"]


class WorkflowInstanceStartRequest(BaseModel):
    workflowDefinitionId: UUID | None = None
    workflowKey: str | None = None
    businessKey: str | None = None
    inputData: dict[str, Any] = Field(default_factory=dict)
    contextData: dict[str, Any] = Field(default_factory=dict)


class WorkflowTaskActionRequest(BaseModel):
    actionType: TaskActionType
    remark: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    actionCode: str | None = None


class WorkflowActionResponse(BaseModel):
    id: UUID
    actionType: str
    actionCode: str | None = None
    actorUserId: str | None = None
    actorType: str
    remarkText: str | None = None
    payload: dict[str, Any]
    createdAt: str


class HumanTaskResponse(BaseModel):
    id: UUID
    workflowInstanceId: UUID
    stepInstanceId: UUID
    stepDefinitionId: UUID
    stepCode: str
    stepLabel: str
    assignedUserId: str | None = None
    assignedRoleKey: str | None = None
    assignedGroupKey: str | None = None
    approvalModeSnapshot: str
    priorityRank: int | None = None
    sequenceNo: int
    status: str
    availableActions: list[str]
    dueAt: str | None = None
    escalationDueAt: str | None = None
    createdAt: str


class NotificationResponse(BaseModel):
    id: UUID
    workflowInstanceId: UUID | None = None
    stepInstanceId: UUID | None = None
    notificationType: str
    title: str
    body: str
    isRead: bool
    readAt: str | None = None
    createdAt: str


class WorkflowInstanceSummary(BaseModel):
    id: UUID
    workflowDefinitionId: UUID
    workflowDefinitionKey: str
    workflowDefinitionName: str
    workflowVersionId: UUID
    businessKey: str | None = None
    runNumber: int
    status: WorkflowStatus
    currentStepCode: str | None = None
    currentStepLabel: str | None = None
    startedBy: str | None = None
    startedAt: str
    completedAt: str | None = None


class WorkflowInstanceDetail(WorkflowInstanceSummary):
    inputData: dict[str, Any]
    contextData: dict[str, Any]
    outputData: dict[str, Any]
    graphJson: dict[str, Any]
    builderLayout: dict[str, Any]
    steps: list[dict[str, Any]]
    actions: list[WorkflowActionResponse]


class WorkflowInstanceListResponse(BaseModel):
    items: list[WorkflowInstanceSummary]


class WorkflowInstanceResponse(BaseModel):
    item: WorkflowInstanceDetail


class HumanTaskListResponse(BaseModel):
    items: list[HumanTaskResponse]


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]


class WorkflowTaskActionResponse(BaseModel):
    workflowInstanceId: UUID
    stepInstanceId: UUID
    actionType: str
    workflowStatus: str
    nextStepCode: str | None = None
