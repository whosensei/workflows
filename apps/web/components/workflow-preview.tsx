"use client"

import "@xyflow/react/dist/style.css"

import { Background, MarkerType, ReactFlow } from "@xyflow/react"
import type { Edge, Node } from "@xyflow/react"

const nodes: Node[] = [
  {
    id: "start",
    position: { x: 0, y: 110 },
    data: { label: "Start request" },
    style: nodeStyle("Start request"),
  },
  {
    id: "manager",
    position: { x: 220, y: 60 },
    data: { label: "Manager approval" },
    style: nodeStyle("Manager approval"),
  },
  {
    id: "subworkflow",
    position: { x: 470, y: 60 },
    data: { label: "Vendor risk subworkflow" },
    style: nodeStyle("Vendor risk subworkflow"),
  },
  {
    id: "end",
    position: { x: 760, y: 110 },
    data: { label: "Completed" },
    style: nodeStyle("Completed"),
  },
  {
    id: "reject",
    position: { x: 470, y: 220 },
    data: { label: "Rejected" },
    style: nodeStyle("Rejected"),
  },
] 

const edges: Edge[] = [
  edge("start", "manager", "submit"),
  edge("manager", "subworkflow", "approve"),
  edge("manager", "reject", "reject"),
  edge("subworkflow", "end", "complete"),
]

function edge(source: string, target: string, label: string) {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
    animated: target !== "reject",
    markerEnd: {
      type: MarkerType.ArrowClosed,
    },
    style: { strokeWidth: 1.5 },
    labelStyle: {
      fill: "var(--foreground)",
      fontSize: 12,
      fontWeight: 600,
    },
  }
}

function nodeStyle(label: string) {
  return {
    width: label.includes("subworkflow") ? 200 : 160,
    borderRadius: 18,
    border: "1px solid color-mix(in oklab, var(--border) 85%, transparent)",
    background: "var(--card)",
    color: "var(--card-foreground)",
    fontSize: 13,
    fontWeight: 600,
    padding: 12,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  }
}

export function WorkflowPreview() {
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
