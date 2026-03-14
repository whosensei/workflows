"use client"

import "@xyflow/react/dist/style.css"

import { Background, MarkerType, ReactFlow } from "@xyflow/react"
import type { Edge, Node } from "@xyflow/react"

type WorkflowStepVisit = {
  stepCode: string
  stepLabel: string
  status: string
}

type WorkflowGraphProps = {
  graphJson: {
    steps?: Array<{ stepCode: string; stepLabel: string }>
    transitions?: Array<{
      fromStepCode: string
      toStepCode?: string | null
      transitionLabel?: string
      actionType?: string
    }>
  }
  builderLayout: {
    nodes?: Node[]
    edges?: Edge[]
  }
  steps: WorkflowStepVisit[]
  currentStepCode: string | null
}

function statusForStep(
  stepCode: string,
  steps: WorkflowStepVisit[],
  currentStepCode: string | null,
) {
  const visit = steps.find((step) => step.stepCode === stepCode)
  if (!visit) {
    return "not_started"
  }
  if (
    visit.status === "waiting" ||
    visit.status === "active" ||
    (currentStepCode === stepCode && !["completed", "rejected", "failed"].includes(visit.status))
  ) {
    return "current"
  }
  if (visit.status === "completed") {
    return "completed"
  }
  if (visit.status === "rejected" || visit.status === "failed") {
    return "error"
  }
  return "not_started"
}

function nodeStyle(status: string) {
  if (status === "completed") {
    return {
      border: "1px solid rgb(34 197 94 / 0.45)",
      background: "rgb(34 197 94 / 0.14)",
      color: "rgb(21 128 61)",
    }
  }
  if (status === "current") {
    return {
      border: "1px solid rgb(249 115 22 / 0.5)",
      background: "rgb(249 115 22 / 0.16)",
      color: "rgb(194 65 12)",
    }
  }
  if (status === "error") {
    return {
      border: "1px solid rgb(239 68 68 / 0.45)",
      background: "rgb(239 68 68 / 0.14)",
      color: "rgb(185 28 28)",
    }
  }
  return {
    border: "1px solid color-mix(in oklab, var(--border) 90%, transparent)",
    background: "color-mix(in oklab, var(--muted) 72%, transparent)",
    color: "color-mix(in oklab, var(--muted-foreground) 92%, transparent)",
  }
}

function buildNodes(
  graphJson: WorkflowGraphProps["graphJson"],
  builderLayout: WorkflowGraphProps["builderLayout"],
  steps: WorkflowStepVisit[],
  currentStepCode: string | null,
): Node[] {
  const positionById = new Map(
    (builderLayout.nodes ?? []).map((node) => [node.id, node.position]),
  )

  return (graphJson.steps ?? []).map((step, index) => {
    const status = statusForStep(step.stepCode, steps, currentStepCode)
    const position =
      positionById.get(step.stepCode) ?? { x: index * 220, y: index % 2 === 0 ? 120 : 40 }

    return {
      id: step.stepCode,
      position,
      data: { label: step.stepLabel },
      draggable: false,
      selectable: false,
      style: {
        width: 180,
        borderRadius: 18,
        fontSize: 13,
        fontWeight: 600,
        padding: 12,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
        ...nodeStyle(status),
      },
    }
  })
}

function buildEdges(graphJson: WorkflowGraphProps["graphJson"]): Edge[] {
  return (graphJson.transitions ?? [])
    .filter((transition) => transition.fromStepCode && transition.toStepCode)
    .map((transition) => ({
      id: `${transition.fromStepCode}-${transition.actionType}-${transition.toStepCode}`,
      source: transition.fromStepCode,
      target: transition.toStepCode!,
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

export function WorkflowInstanceGraph({
  graphJson,
  builderLayout,
  steps,
  currentStepCode,
}: WorkflowGraphProps) {
  const nodes = buildNodes(graphJson, builderLayout, steps, currentStepCode)
  const edges = buildEdges(graphJson)

  return (
    <div className="h-[320px] overflow-hidden rounded-2xl border border-border/70">
      <ReactFlow
        defaultEdges={edges}
        defaultNodes={nodes}
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
  )
}
