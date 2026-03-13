from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


ActionType = Literal["approve", "reject", "revert", "custom"]
AssociationType = Literal["user", "role", "group", "sql_rule"]
ApprovalMode = Literal["priority_chain", "approve_any_one", "approve_all", "notify_all"]
StepType = Literal["start", "end", "human_task", "system_task", "subworkflow", "decision"]


class WorkflowAssociationInput(BaseModel):
    associationType: AssociationType
    associationValue: str = Field(min_length=1)
    canApprove: bool = True
    canReject: bool = True
    canRevert: bool = True
    priority: int | None = None
    notificationOrder: int | None = None
    escalationAfterSeconds: int | None = None


class WorkflowAssignmentPolicyInput(BaseModel):
    approvalMode: ApprovalMode = "priority_chain"
    requiredApprovalsCount: int | None = None
    priorityEscalationEnabled: bool = False
    escalationTimeoutSeconds: int | None = None
    reminderIntervalSeconds: int | None = None
    maxEscalationCount: int | None = None


class WorkflowStepInput(BaseModel):
    stepCode: str = Field(min_length=1)
    stepLabel: str = Field(min_length=1)
    description: str = ""
    stepType: StepType
    sequenceHint: int = 0
    allowRevert: bool = True
    remarkRequiredOnApprove: bool = False
    remarkRequiredOnReject: bool = False
    remarkRequiredOnRevert: bool = False
    maxVisitsPerInstance: int | None = None
    formSchema: dict = Field(default_factory=dict)
    config: dict = Field(default_factory=dict)
    isTerminal: bool = False
    assignmentPolicy: WorkflowAssignmentPolicyInput = Field(
        default_factory=WorkflowAssignmentPolicyInput
    )
    associations: list[WorkflowAssociationInput] = Field(default_factory=list)


class WorkflowTransitionInput(BaseModel):
    fromStepCode: str = Field(min_length=1)
    toStepCode: str | None = None
    actionType: ActionType
    actionCode: str | None = None
    transitionLabel: str = ""
    description: str = ""
    conditionExpression: str | None = None
    priority: int = 0


class WorkflowDefinitionCreate(BaseModel):
    key: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str = ""
    builderLayout: dict = Field(default_factory=dict)
    steps: list[WorkflowStepInput]
    transitions: list[WorkflowTransitionInput]


class WorkflowAssociationResponse(WorkflowAssociationInput):
    id: UUID


class WorkflowAssignmentPolicyResponse(WorkflowAssignmentPolicyInput):
    id: UUID


class WorkflowStepResponse(BaseModel):
    id: UUID
    stepCode: str
    stepLabel: str
    description: str
    stepType: StepType
    sequenceHint: int | None
    allowRevert: bool
    remarkRequiredOnApprove: bool
    remarkRequiredOnReject: bool
    remarkRequiredOnRevert: bool
    maxVisitsPerInstance: int | None
    formSchema: dict
    config: dict
    isTerminal: bool
    assignmentPolicy: WorkflowAssignmentPolicyResponse | None = None
    associations: list[WorkflowAssociationResponse] = Field(default_factory=list)


class WorkflowTransitionResponse(BaseModel):
    id: UUID
    fromStepCode: str
    toStepCode: str | None
    actionType: ActionType
    actionCode: str | None = None
    transitionLabel: str
    description: str
    conditionExpression: str | None = None
    priority: int


class WorkflowDefinitionSummary(BaseModel):
    id: UUID
    key: str
    name: str
    description: str
    status: str
    latestVersionId: UUID | None
    latestVersionNo: int | None
    stepCount: int
    transitionCount: int


class WorkflowDefinitionDetail(BaseModel):
    id: UUID
    key: str
    name: str
    description: str
    status: str
    latestVersionId: UUID
    latestVersionNo: int
    graphJson: dict
    builderLayout: dict
    steps: list[WorkflowStepResponse]
    transitions: list[WorkflowTransitionResponse]


class WorkflowDefinitionListResponse(BaseModel):
    items: list[WorkflowDefinitionSummary]


class WorkflowDefinitionCreateResponse(BaseModel):
    item: WorkflowDefinitionDetail
