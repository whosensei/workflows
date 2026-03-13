"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { authClient } from "@/lib/auth-client"
import { publicEnv } from "@/lib/public-env"

type ApprovalMode = "priority_chain" | "approve_any_one" | "approve_all" | "notify_all"
type StepType = "start" | "end" | "human_task" | "system_task" | "subworkflow" | "decision"
type ActionType = "approve" | "reject" | "revert" | "custom"
type AssociationType = "user" | "role" | "group" | "sql_rule"

type BuilderAssociation = {
  associationType: AssociationType
  associationValue: string
  priority: string
  notificationOrder: string
  escalationAfterSeconds: string
  canApprove: boolean
  canReject: boolean
  canRevert: boolean
}

type BuilderAssignmentPolicy = {
  approvalMode: ApprovalMode
  requiredApprovalsCount: string
  priorityEscalationEnabled: boolean
  escalationTimeoutSeconds: string
  reminderIntervalSeconds: string
  maxEscalationCount: string
}

type BuilderStep = {
  stepCode: string
  stepLabel: string
  description: string
  stepType: StepType
  sequenceHint: number
  allowRevert: boolean
  remarkRequiredOnApprove: boolean
  remarkRequiredOnReject: boolean
  remarkRequiredOnRevert: boolean
  maxVisitsPerInstance: string
  isTerminal: boolean
  assignmentPolicy: BuilderAssignmentPolicy
  associations: BuilderAssociation[]
}

type BuilderTransition = {
  fromStepCode: string
  toStepCode: string
  actionType: ActionType
  actionCode: string
  transitionLabel: string
  description: string
  conditionExpression: string
  priority: string
}

type WorkflowDefinitionSummary = {
  id: string
  key: string
  name: string
  description: string
  status: string
  latestVersionId: string | null
  latestVersionNo: number | null
  stepCount: number
  transitionCount: number
}

type WorkflowDefinitionDetail = {
  id: string
  key: string
  name: string
  description: string
  status: string
  latestVersionId: string
  latestVersionNo: number
  graphJson: {
    steps: Array<{
      stepCode: string
      stepLabel: string
      description: string
      stepType: StepType
      sequenceHint: number
      allowRevert: boolean
      remarkRequiredOnApprove: boolean
      remarkRequiredOnReject: boolean
      remarkRequiredOnRevert: boolean
      maxVisitsPerInstance?: number | null
      isTerminal?: boolean
      assignmentPolicy?: Partial<BuilderAssignmentPolicy>
      associations?: Array<Partial<BuilderAssociation>>
    }>
    transitions: Array<{
      fromStepCode: string
      toStepCode?: string | null
      actionType: ActionType
      actionCode?: string | null
      transitionLabel: string
      description: string
      conditionExpression?: string | null
      priority: number
    }>
  }
  builderLayout: {
    nodes?: Node[]
    edges?: Edge[]
  }
  steps: Array<{
    stepCode: string
    stepLabel: string
    description: string
    stepType: StepType
    sequenceHint: number | null
    allowRevert: boolean
    remarkRequiredOnApprove: boolean
    remarkRequiredOnReject: boolean
    remarkRequiredOnRevert: boolean
    maxVisitsPerInstance: number | null
    isTerminal: boolean
    assignmentPolicy?: {
      approvalMode: ApprovalMode
      requiredApprovalsCount: number | null
      priorityEscalationEnabled: boolean
      escalationTimeoutSeconds: number | null
      reminderIntervalSeconds: number | null
      maxEscalationCount: number | null
    } | null
    associations: Array<{
      associationType: AssociationType
      associationValue: string
      priority: number | null
      notificationOrder: number | null
      escalationAfterSeconds: number | null
      canApprove: boolean
      canReject: boolean
      canRevert: boolean
    }>
  }>
  transitions: Array<{
    fromStepCode: string
    toStepCode: string | null
    actionType: ActionType
    actionCode?: string | null
    transitionLabel: string
    description: string
    conditionExpression?: string | null
    priority: number
  }>
}

const emptyAssociation = (): BuilderAssociation => ({
  associationType: "user",
  associationValue: "",
  priority: "",
  notificationOrder: "",
  escalationAfterSeconds: "",
  canApprove: true,
  canReject: true,
  canRevert: true,
})

const emptyPolicy = (): BuilderAssignmentPolicy => ({
  approvalMode: "priority_chain",
  requiredApprovalsCount: "",
  priorityEscalationEnabled: false,
  escalationTimeoutSeconds: "",
  reminderIntervalSeconds: "",
  maxEscalationCount: "",
})

const initialSteps = (): BuilderStep[] => [
  {
    stepCode: "start_request",
    stepLabel: "Start request",
    description: "Entry point for the workflow instance.",
    stepType: "start",
    sequenceHint: 0,
    allowRevert: false,
    remarkRequiredOnApprove: false,
    remarkRequiredOnReject: false,
    remarkRequiredOnRevert: false,
    maxVisitsPerInstance: "",
    isTerminal: false,
    assignmentPolicy: emptyPolicy(),
    associations: [],
  },
  {
    stepCode: "manager_approval",
    stepLabel: "Manager approval",
    description: "Human review with sequential escalation.",
    stepType: "human_task",
    sequenceHint: 1,
    allowRevert: true,
    remarkRequiredOnApprove: false,
    remarkRequiredOnReject: true,
    remarkRequiredOnRevert: true,
    maxVisitsPerInstance: "3",
    isTerminal: false,
    assignmentPolicy: {
      ...emptyPolicy(),
      approvalMode: "priority_chain",
      priorityEscalationEnabled: true,
      escalationTimeoutSeconds: "86400",
      reminderIntervalSeconds: "43200",
      maxEscalationCount: "2",
    },
    associations: [
      {
        ...emptyAssociation(),
        associationValue: "manager@example.com",
        priority: "1",
        notificationOrder: "1",
        escalationAfterSeconds: "86400",
      },
      {
        ...emptyAssociation(),
        associationValue: "reviewer1@example.com",
        priority: "2",
        notificationOrder: "2",
        escalationAfterSeconds: "172800",
      },
    ],
  },
  {
    stepCode: "completed",
    stepLabel: "Completed",
    description: "Terminal success step.",
    stepType: "end",
    sequenceHint: 2,
    allowRevert: false,
    remarkRequiredOnApprove: false,
    remarkRequiredOnReject: false,
    remarkRequiredOnRevert: false,
    maxVisitsPerInstance: "",
    isTerminal: true,
    assignmentPolicy: emptyPolicy(),
    associations: [],
  },
]

const initialTransitions = (): BuilderTransition[] => [
  {
    fromStepCode: "start_request",
    toStepCode: "manager_approval",
    actionType: "approve",
    actionCode: "",
    transitionLabel: "submit",
    description: "Start the approval path.",
    conditionExpression: "",
    priority: "0",
  },
  {
    fromStepCode: "manager_approval",
    toStepCode: "completed",
    actionType: "approve",
    actionCode: "",
    transitionLabel: "approve",
    description: "Manager approves the request.",
    conditionExpression: "",
    priority: "0",
  },
]

function numberOrNull(value: string) {
  return value.trim() === "" ? null : Number(value)
}

function resolveApiBaseUrl() {
  if (typeof window === "undefined") {
    return publicEnv.apiBaseUrl
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`
}

function createNodes(steps: BuilderStep[]): Node[] {
  return steps.map((step, index) => ({
    id: step.stepCode,
    position: { x: index * 220, y: index % 2 === 0 ? 120 : 30 },
    data: { label: step.stepLabel || step.stepCode },
    style: {
      width: step.stepType === "subworkflow" ? 200 : 170,
      borderRadius: 18,
      border: "1px solid color-mix(in oklab, var(--border) 85%, transparent)",
      background: "var(--card)",
      color: "var(--card-foreground)",
      fontSize: 13,
      fontWeight: 600,
      padding: 12,
      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    },
  }))
}

function createEdges(transitions: BuilderTransition[]): Edge[] {
  return transitions
    .filter((transition) => transition.fromStepCode && transition.toStepCode)
    .map((transition) => ({
      id: `${transition.fromStepCode}-${transition.actionType}-${transition.toStepCode}`,
      source: transition.fromStepCode,
      target: transition.toStepCode,
      label: transition.transitionLabel,
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: transition.actionType === "approve",
      style: { strokeWidth: 1.5 },
      labelStyle: {
        fill: "var(--foreground)",
        fontSize: 12,
        fontWeight: 600,
      },
    }))
}

function toPayload(
  key: string,
  name: string,
  description: string,
  steps: BuilderStep[],
  transitions: BuilderTransition[],
) {
  return {
    key,
    name,
    description,
    builderLayout: {
      nodes: createNodes(steps),
      edges: createEdges(transitions),
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    steps: steps.map((step) => ({
      stepCode: step.stepCode,
      stepLabel: step.stepLabel,
      description: step.description,
      stepType: step.stepType,
      sequenceHint: step.sequenceHint,
      allowRevert: step.allowRevert,
      remarkRequiredOnApprove: step.remarkRequiredOnApprove,
      remarkRequiredOnReject: step.remarkRequiredOnReject,
      remarkRequiredOnRevert: step.remarkRequiredOnRevert,
      maxVisitsPerInstance: numberOrNull(step.maxVisitsPerInstance),
      isTerminal: step.isTerminal,
      assignmentPolicy: {
        approvalMode: step.assignmentPolicy.approvalMode,
        requiredApprovalsCount: numberOrNull(step.assignmentPolicy.requiredApprovalsCount),
        priorityEscalationEnabled: step.assignmentPolicy.priorityEscalationEnabled,
        escalationTimeoutSeconds: numberOrNull(step.assignmentPolicy.escalationTimeoutSeconds),
        reminderIntervalSeconds: numberOrNull(step.assignmentPolicy.reminderIntervalSeconds),
        maxEscalationCount: numberOrNull(step.assignmentPolicy.maxEscalationCount),
      },
      associations: step.associations
        .filter((association) => association.associationValue.trim() !== "")
        .map((association) => ({
          associationType: association.associationType,
          associationValue: association.associationValue,
          priority: numberOrNull(association.priority),
          notificationOrder: numberOrNull(association.notificationOrder),
          escalationAfterSeconds: numberOrNull(association.escalationAfterSeconds),
          canApprove: association.canApprove,
          canReject: association.canReject,
          canRevert: association.canRevert,
        })),
    })),
    transitions: transitions.map((transition) => ({
      fromStepCode: transition.fromStepCode,
      toStepCode: transition.toStepCode || null,
      actionType: transition.actionType,
      actionCode: transition.actionCode || null,
      transitionLabel: transition.transitionLabel,
      description: transition.description,
      conditionExpression: transition.conditionExpression || null,
      priority: Number(transition.priority || "0"),
    })),
  }
}

function fromDetail(detail: WorkflowDefinitionDetail) {
  return {
    key: detail.key,
    name: detail.name,
    description: detail.description,
    steps: detail.steps.map((step) => ({
      stepCode: step.stepCode,
      stepLabel: step.stepLabel,
      description: step.description,
      stepType: step.stepType,
      sequenceHint: step.sequenceHint ?? 0,
      allowRevert: step.allowRevert,
      remarkRequiredOnApprove: step.remarkRequiredOnApprove,
      remarkRequiredOnReject: step.remarkRequiredOnReject,
      remarkRequiredOnRevert: step.remarkRequiredOnRevert,
      maxVisitsPerInstance: step.maxVisitsPerInstance?.toString() ?? "",
      isTerminal: step.isTerminal,
      assignmentPolicy: {
        approvalMode: step.assignmentPolicy?.approvalMode ?? "priority_chain",
        requiredApprovalsCount: step.assignmentPolicy?.requiredApprovalsCount?.toString() ?? "",
        priorityEscalationEnabled:
          step.assignmentPolicy?.priorityEscalationEnabled ?? false,
        escalationTimeoutSeconds:
          step.assignmentPolicy?.escalationTimeoutSeconds?.toString() ?? "",
        reminderIntervalSeconds:
          step.assignmentPolicy?.reminderIntervalSeconds?.toString() ?? "",
        maxEscalationCount: step.assignmentPolicy?.maxEscalationCount?.toString() ?? "",
      },
      associations:
        step.associations.length > 0
          ? step.associations.map((association) => ({
              associationType: association.associationType,
              associationValue: association.associationValue,
              priority: association.priority?.toString() ?? "",
              notificationOrder: association.notificationOrder?.toString() ?? "",
              escalationAfterSeconds: association.escalationAfterSeconds?.toString() ?? "",
              canApprove: association.canApprove,
              canReject: association.canReject,
              canRevert: association.canRevert,
            }))
          : [],
    })),
    transitions: detail.transitions.map((transition) => ({
      fromStepCode: transition.fromStepCode,
      toStepCode: transition.toStepCode ?? "",
      actionType: transition.actionType,
      actionCode: transition.actionCode ?? "",
      transitionLabel: transition.transitionLabel,
      description: transition.description,
      conditionExpression: transition.conditionExpression ?? "",
      priority: transition.priority.toString(),
    })),
  }
}

export function WorkflowBuilder() {
  const [key, setKey] = useState("vendor_onboarding")
  const [name, setName] = useState("Vendor onboarding")
  const [description, setDescription] = useState(
    "Approve onboarding with human review, escalation, and a terminal completion step.",
  )
  const [steps, setSteps] = useState<BuilderStep[]>(initialSteps)
  const [transitions, setTransitions] = useState<BuilderTransition[]>(initialTransitions)
  const [definitions, setDefinitions] = useState<WorkflowDefinitionSummary[]>([])
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("Ready to create a workflow definition.")
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDefinitions, setIsLoadingDefinitions] = useState(true)

  const graphNodes = useMemo(() => createNodes(steps), [steps])
  const graphEdges = useMemo(() => createEdges(transitions), [transitions])
  const payloadPreview = useMemo(
    () => toPayload(key, name, description, steps, transitions),
    [description, key, name, steps, transitions],
  )

  async function getToken() {
    const tokenResponse = await authClient.token()
    if (tokenResponse.error || !tokenResponse.data?.token) {
      throw new Error(tokenResponse.error?.message ?? "No Better Auth token available.")
    }

    return tokenResponse.data.token
  }

  const loadDefinitions = useCallback(async () => {
    setIsLoadingDefinitions(true)
    setError(null)

    try {
      const token = await getToken()
      const response = await fetch(`${resolveApiBaseUrl()}/api/v1/workflow-definitions`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = (await response.json()) as { items: WorkflowDefinitionSummary[] }

      if (!response.ok) {
        throw new Error("Unable to load workflow definitions.")
      }

      setDefinitions(payload.items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load definitions.")
    } finally {
      setIsLoadingDefinitions(false)
    }
  }, [])

  useEffect(() => {
    void loadDefinitions()
  }, [loadDefinitions])

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    setStatus("Saving workflow definition to Neon...")

    try {
      const token = await getToken()
      const response = await fetch(`${resolveApiBaseUrl()}/api/v1/workflow-definitions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payloadPreview),
      })

      const payload = (await response.json()) as
        | { item: WorkflowDefinitionDetail }
        | { detail?: { errors?: string[] } | string }

      if (!response.ok) {
        const errorDetail = "detail" in payload ? payload.detail : undefined

        if (
          typeof errorDetail === "object" &&
          errorDetail !== null &&
          "errors" in errorDetail &&
          Array.isArray(errorDetail.errors)
        ) {
          throw new Error(errorDetail.errors.join(" "))
        }

        if (typeof errorDetail === "string") {
          throw new Error(errorDetail)
        }

        throw new Error("Unable to save workflow definition.")
      }

      if (!("item" in payload)) {
        throw new Error("The API did not return the created workflow definition.")
      }

      setSelectedDefinitionId(payload.item.id)
      setStatus(`Saved '${payload.item.name}' as version ${payload.item.latestVersionNo}.`)
      await loadDefinitions()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.")
      setStatus("Workflow save failed.")
    } finally {
      setIsSaving(false)
    }
  }

  async function loadDefinitionIntoForm(definitionId: string) {
    setError(null)
    setStatus("Loading workflow definition from Neon...")

    try {
      const token = await getToken()
      const response = await fetch(
        `${resolveApiBaseUrl()}/api/v1/workflow-definitions/${definitionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const payload = (await response.json()) as WorkflowDefinitionDetail
      if (!response.ok) {
        throw new Error("Unable to load workflow detail.")
      }

      const normalized = fromDetail(payload)
      setKey(normalized.key)
      setName(normalized.name)
      setDescription(normalized.description)
      setSteps(normalized.steps)
      setTransitions(normalized.transitions)
      setSelectedDefinitionId(definitionId)
      setStatus(`Loaded '${normalized.name}' from Neon into the builder.`)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load definition.")
    }
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      {
        stepCode: `step_${current.length + 1}`,
        stepLabel: `Step ${current.length + 1}`,
        description: "",
        stepType: "human_task",
        sequenceHint: current.length,
        allowRevert: true,
        remarkRequiredOnApprove: false,
        remarkRequiredOnReject: false,
        remarkRequiredOnRevert: false,
        maxVisitsPerInstance: "",
        isTerminal: false,
        assignmentPolicy: emptyPolicy(),
        associations: [],
      },
    ])
  }

  function addTransition() {
    setTransitions((current) => [
      ...current,
      {
        fromStepCode: steps[0]?.stepCode ?? "",
        toStepCode: steps[1]?.stepCode ?? "",
        actionType: "approve",
        actionCode: "",
        transitionLabel: "",
        description: "",
        conditionExpression: "",
        priority: "0",
      },
    ])
  }

  function updateStep(index: number, patch: Partial<BuilderStep>) {
    setSteps((current) =>
      current.map((step, currentIndex) =>
        currentIndex === index ? { ...step, ...patch } : step,
      ),
    )
  }

  function updateStepPolicy(index: number, patch: Partial<BuilderAssignmentPolicy>) {
    setSteps((current) =>
      current.map((step, currentIndex) =>
        currentIndex === index
          ? { ...step, assignmentPolicy: { ...step.assignmentPolicy, ...patch } }
          : step,
      ),
    )
  }

  function removeStep(index: number) {
    setSteps((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function addAssociation(stepIndex: number) {
    setSteps((current) =>
      current.map((step, currentIndex) =>
        currentIndex === stepIndex
          ? { ...step, associations: [...step.associations, emptyAssociation()] }
          : step,
      ),
    )
  }

  function updateAssociation(
    stepIndex: number,
    associationIndex: number,
    patch: Partial<BuilderAssociation>,
  ) {
    setSteps((current) =>
      current.map((step, currentIndex) =>
        currentIndex === stepIndex
          ? {
              ...step,
              associations: step.associations.map((association, currentAssociationIndex) =>
                currentAssociationIndex === associationIndex
                  ? { ...association, ...patch }
                  : association,
              ),
            }
          : step,
      ),
    )
  }

  function removeAssociation(stepIndex: number, associationIndex: number) {
    setSteps((current) =>
      current.map((step, currentIndex) =>
        currentIndex === stepIndex
          ? {
              ...step,
              associations: step.associations.filter(
                (_, currentAssociationIndex) => currentAssociationIndex !== associationIndex,
              ),
            }
          : step,
      ),
    )
  }

  function updateTransition(index: number, patch: Partial<BuilderTransition>) {
    setTransitions((current) =>
      current.map((transition, currentIndex) =>
        currentIndex === index ? { ...transition, ...patch } : transition,
      ),
    )
  }

  function removeTransition(index: number) {
    setTransitions((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Workflow metadata</CardTitle>
            <CardDescription>
              Create a workflow definition with steps, assignee rules, transition labels, and a
              live React Flow map.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="workflow-key">Workflow key</Label>
              <Input
                id="workflow-key"
                onChange={(event) => setKey(event.target.value)}
                value={key}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Workflow name</Label>
              <Input
                id="workflow-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="workflow-description">Description</Label>
              <textarea
                className="min-h-24 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                id="workflow-description"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </div>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <Button disabled={isSaving} onClick={handleSave}>
                {isSaving ? "Saving..." : "Save workflow to Neon"}
              </Button>
              <Badge variant="outline">
                {selectedDefinitionId ? `Loaded: ${selectedDefinitionId}` : "New definition"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground md:col-span-2">{status}</p>
            {error ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Live graph preview</CardTitle>
            <CardDescription>
              Preview how the stored builder layout will render before you persist it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[360px] overflow-hidden rounded-2xl border border-border/70">
              <ReactFlow
                defaultEdges={graphEdges}
                defaultNodes={graphNodes}
                fitView
                nodesDraggable={false}
                nodesFocusable={false}
                panOnDrag={false}
                proOptions={{ hideAttribution: true }}
                zoomOnDoubleClick={false}
                zoomOnPinch={false}
                zoomOnScroll={false}
              >
                <Background gap={20} size={1} />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Steps section</CardTitle>
            <CardDescription>
              Add step code, label, description, type, remark requirements, and assignee rules.
            </CardDescription>
          </div>
          <Button onClick={addStep} variant="outline">
            Add step
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((step, stepIndex) => (
            <div className="space-y-4 rounded-2xl border border-border/70 p-4" key={stepIndex}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{step.stepLabel || `Step ${stepIndex + 1}`}</p>
                  <p className="text-sm text-muted-foreground">{step.stepCode}</p>
                </div>
                <Button
                  disabled={steps.length <= 2}
                  onClick={() => removeStep(stepIndex)}
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label>Step code</Label>
                  <Input
                    onChange={(event) => updateStep(stepIndex, { stepCode: event.target.value })}
                    value={step.stepCode}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Step label</Label>
                  <Input
                    onChange={(event) => updateStep(stepIndex, { stepLabel: event.target.value })}
                    value={step.stepLabel}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Step type</Label>
                  <select
                    className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    onChange={(event) =>
                      updateStep(stepIndex, { stepType: event.target.value as StepType })
                    }
                    value={step.stepType}
                  >
                    <option value="start">start</option>
                    <option value="human_task">human_task</option>
                    <option value="system_task">system_task</option>
                    <option value="subworkflow">subworkflow</option>
                    <option value="decision">decision</option>
                    <option value="end">end</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Max visits per instance</Label>
                  <Input
                    onChange={(event) =>
                      updateStep(stepIndex, { maxVisitsPerInstance: event.target.value })
                    }
                    placeholder="Optional loop guard"
                    value={step.maxVisitsPerInstance}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onChange={(event) => updateStep(stepIndex, { description: event.target.value })}
                  value={step.description}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={step.allowRevert}
                    onChange={(event) => updateStep(stepIndex, { allowRevert: event.target.checked })}
                    type="checkbox"
                  />
                  Allow revert
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={step.remarkRequiredOnApprove}
                    onChange={(event) =>
                      updateStep(stepIndex, {
                        remarkRequiredOnApprove: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Approve remark required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={step.remarkRequiredOnReject}
                    onChange={(event) =>
                      updateStep(stepIndex, {
                        remarkRequiredOnReject: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Reject remark required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={step.isTerminal}
                    onChange={(event) => updateStep(stepIndex, { isTerminal: event.target.checked })}
                    type="checkbox"
                  />
                  Terminal step
                </label>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div>
                  <p className="font-medium">Assignment policy</p>
                  <p className="text-sm text-muted-foreground">
                    Configure priority chain, approve-any, approve-all, or notify-all behavior.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Approval mode</Label>
                    <select
                      className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onChange={(event) =>
                        updateStepPolicy(stepIndex, {
                          approvalMode: event.target.value as ApprovalMode,
                        })
                      }
                      value={step.assignmentPolicy.approvalMode}
                    >
                      <option value="priority_chain">priority_chain</option>
                      <option value="approve_any_one">approve_any_one</option>
                      <option value="approve_all">approve_all</option>
                      <option value="notify_all">notify_all</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Required approvals</Label>
                    <Input
                      onChange={(event) =>
                        updateStepPolicy(stepIndex, {
                          requiredApprovalsCount: event.target.value,
                        })
                      }
                      value={step.assignmentPolicy.requiredApprovalsCount}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Escalation timeout (s)</Label>
                    <Input
                      onChange={(event) =>
                        updateStepPolicy(stepIndex, {
                          escalationTimeoutSeconds: event.target.value,
                        })
                      }
                      value={step.assignmentPolicy.escalationTimeoutSeconds}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reminder interval (s)</Label>
                    <Input
                      onChange={(event) =>
                        updateStepPolicy(stepIndex, {
                          reminderIntervalSeconds: event.target.value,
                        })
                      }
                      value={step.assignmentPolicy.reminderIntervalSeconds}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Associations</p>
                    <p className="text-sm text-muted-foreground">
                      Map users, roles, groups, or rules to this step with priority and escalation.
                    </p>
                  </div>
                  <Button onClick={() => addAssociation(stepIndex)} size="sm" variant="outline">
                    Add association
                  </Button>
                </div>

                {step.associations.length > 0 ? (
                  <div className="space-y-3">
                    {step.associations.map((association, associationIndex) => (
                      <div
                        className="grid gap-3 rounded-xl border border-border/70 p-3 md:grid-cols-2 xl:grid-cols-6"
                        key={`${stepIndex}-${associationIndex}`}
                      >
                        <select
                          className="flex h-9 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                          onChange={(event) =>
                            updateAssociation(stepIndex, associationIndex, {
                              associationType: event.target.value as AssociationType,
                            })
                          }
                          value={association.associationType}
                        >
                          <option value="user">user</option>
                          <option value="role">role</option>
                          <option value="group">group</option>
                          <option value="sql_rule">sql_rule</option>
                        </select>
                        <Input
                          onChange={(event) =>
                            updateAssociation(stepIndex, associationIndex, {
                              associationValue: event.target.value,
                            })
                          }
                          placeholder="manager@example.com"
                          value={association.associationValue}
                        />
                        <Input
                          onChange={(event) =>
                            updateAssociation(stepIndex, associationIndex, {
                              priority: event.target.value,
                            })
                          }
                          placeholder="priority"
                          value={association.priority}
                        />
                        <Input
                          onChange={(event) =>
                            updateAssociation(stepIndex, associationIndex, {
                              notificationOrder: event.target.value,
                            })
                          }
                          placeholder="notify order"
                          value={association.notificationOrder}
                        />
                        <Input
                          onChange={(event) =>
                            updateAssociation(stepIndex, associationIndex, {
                              escalationAfterSeconds: event.target.value,
                            })
                          }
                          placeholder="escalate in seconds"
                          value={association.escalationAfterSeconds}
                        />
                        <Button
                          onClick={() => removeAssociation(stepIndex, associationIndex)}
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No associations yet. Add one for any human or review step.
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Transitions section</CardTitle>
            <CardDescription>
              Define source, target, label, action type, and optional conditions for each edge.
            </CardDescription>
          </div>
          <Button onClick={addTransition} variant="outline">
            Add transition
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {transitions.map((transition, transitionIndex) => (
            <div
              className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-2 xl:grid-cols-7"
              key={transitionIndex}
            >
              <select
                className="flex h-9 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onChange={(event) =>
                  updateTransition(transitionIndex, { fromStepCode: event.target.value })
                }
                value={transition.fromStepCode}
              >
                {steps.map((step) => (
                  <option key={`${transitionIndex}-from-${step.stepCode}`} value={step.stepCode}>
                    {step.stepCode}
                  </option>
                ))}
              </select>
              <select
                className="flex h-9 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onChange={(event) =>
                  updateTransition(transitionIndex, { toStepCode: event.target.value })
                }
                value={transition.toStepCode}
              >
                <option value="">terminal / none</option>
                {steps.map((step) => (
                  <option key={`${transitionIndex}-to-${step.stepCode}`} value={step.stepCode}>
                    {step.stepCode}
                  </option>
                ))}
              </select>
              <select
                className="flex h-9 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onChange={(event) =>
                  updateTransition(transitionIndex, { actionType: event.target.value as ActionType })
                }
                value={transition.actionType}
              >
                <option value="approve">approve</option>
                <option value="reject">reject</option>
                <option value="revert">revert</option>
                <option value="custom">custom</option>
              </select>
              <Input
                onChange={(event) =>
                  updateTransition(transitionIndex, { transitionLabel: event.target.value })
                }
                placeholder="Transition label"
                value={transition.transitionLabel}
              />
              <Input
                onChange={(event) =>
                  updateTransition(transitionIndex, { description: event.target.value })
                }
                placeholder="Description"
                value={transition.description}
              />
              <Input
                onChange={(event) =>
                  updateTransition(transitionIndex, { conditionExpression: event.target.value })
                }
                placeholder="Condition"
                value={transition.conditionExpression}
              />
              <Button onClick={() => removeTransition(transitionIndex)} variant="ghost">
                Remove
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Definitions stored in Neon</CardTitle>
            <CardDescription>
              Existing workflow definitions are read from the FastAPI API and loaded from Neon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDefinitions ? (
              <p className="text-sm text-muted-foreground">Loading definitions...</p>
            ) : definitions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Steps</TableHead>
                    <TableHead>Transitions</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {definitions.map((definition) => (
                    <TableRow key={definition.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{definition.name}</p>
                          <p className="text-xs text-muted-foreground">{definition.status}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{definition.key}</TableCell>
                      <TableCell>{definition.stepCount}</TableCell>
                      <TableCell>{definition.transitionCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => loadDefinitionIntoForm(definition.id)}
                          size="sm"
                          variant="outline"
                        >
                          Load
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No definitions yet. Save the current builder state to create the first one.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Canonical JSON preview</CardTitle>
            <CardDescription>
              This is the payload that will be stored as the workflow definition snapshot and graph.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[520px] overflow-auto rounded-2xl border border-border/70 bg-muted/30 p-4 text-xs leading-6 text-foreground">
              {JSON.stringify(payloadPreview, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
