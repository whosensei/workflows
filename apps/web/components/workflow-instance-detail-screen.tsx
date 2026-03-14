"use client"

import type { Edge, Node } from "@xyflow/react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { WorkflowInstanceGraph } from "@/components/workflow-instance-graph"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type WorkflowAction = {
  id: string
  actionType: string
  actionCode: string | null
  stepInstanceId: string | null
  stepCode: string | null
  stepLabel: string | null
  actorUserId: string | null
  actorType: string
  remarkText: string | null
  payload: Record<string, unknown>
  createdAt: string
}

type WorkflowStepVisit = {
  id: string
  stepCode: string
  stepLabel: string
  stepType: string
  status: string
  visitCount: number
  enteredAt: string
  completedAt: string | null
  waitingSince: string | null
  resultAction: string | null
}

type WorkflowInstanceDetail = {
  id: string
  workflowDefinitionId: string
  workflowDefinitionKey: string
  workflowDefinitionName: string
  workflowVersionId: string
  businessKey: string | null
  runNumber: number
  status: string
  currentStepCode: string | null
  currentStepLabel: string | null
  startedBy: string | null
  startedAt: string
  completedAt: string | null
  inputData: Record<string, unknown>
  contextData: Record<string, unknown>
  outputData: Record<string, unknown>
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
  actions: WorkflowAction[]
}

function resolveApiBaseUrl() {
  if (typeof window === "undefined") {
    return publicEnv.apiBaseUrl
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`
}

function formatDate(value: string | null) {
  if (!value) {
    return "-"
  }

  return new Date(value).toLocaleString()
}

export function WorkflowInstanceDetailScreen({ instanceId }: { instanceId: string }) {
  const [instance, setInstance] = useState<WorkflowInstanceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  async function getToken() {
    const tokenResponse = await authClient.token()
    if (tokenResponse.error || !tokenResponse.data?.token) {
      throw new Error(tokenResponse.error?.message ?? "No Better Auth token available.")
    }
    return tokenResponse.data.token
  }

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken()
    return fetch(`${resolveApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    })
  }, [])

  const loadInstance = useCallback(async () => {
    setIsBusy(true)
    setError(null)

    try {
      const response = await authedFetch(`/api/v1/workflow-instances/${instanceId}`, {
        method: "GET",
      })
      const payload = (await response.json()) as { item?: WorkflowInstanceDetail; detail?: string }
      if (!response.ok || !payload.item) {
        throw new Error(payload.detail ?? "Unable to load workflow instance detail.")
      }
      setInstance(payload.item)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load workflow instance.")
    } finally {
      setIsBusy(false)
    }
  }, [authedFetch, instanceId])

  useEffect(() => {
    void loadInstance()
  }, [loadInstance])

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
            Workflow instance
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {instance?.workflowDefinitionName ?? "Loading instance detail"}
            </h1>
            <p className="max-w-3xl text-muted-foreground">
              Review the full workflow graph, step visits, and action history for instance{" "}
              {instance?.businessKey ?? instanceId}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/operations">Back to operations</Link>
          </Button>
          <Button disabled={isBusy} onClick={() => void loadInstance()} variant="outline">
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {instance ? (
        <>
          <WorkflowInstanceGraph
            builderLayout={instance.builderLayout}
            currentStepCode={instance.currentStepCode}
            graphJson={instance.graphJson}
            steps={instance.steps}
          />

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Workflow</p>
              <p className="font-medium">{instance.workflowDefinitionName}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-medium">{instance.status}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Current step</p>
              <p className="font-medium">{instance.currentStepLabel ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Run number</p>
              <p className="font-medium">{instance.runNumber}</p>
            </div>
          </div>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Step visits</CardTitle>
              <CardDescription>Each step entry for this workflow instance in execution order.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visit</TableHead>
                    <TableHead>Entered</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instance.steps.map((step) => (
                    <TableRow key={step.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{step.stepLabel}</p>
                          <p className="text-xs text-muted-foreground">{step.stepCode}</p>
                        </div>
                      </TableCell>
                      <TableCell>{step.status}</TableCell>
                      <TableCell>{step.visitCount}</TableCell>
                      <TableCell>{formatDate(step.enteredAt)}</TableCell>
                      <TableCell>{formatDate(step.completedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Action history</CardTitle>
              <CardDescription>Workflow actions in the order they were recorded.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instance.actions.map((action) => (
                    <TableRow key={action.id}>
                      <TableCell>{action.actionType}</TableCell>
                      <TableCell>
                        {action.stepLabel ? (
                          <div>
                            <p className="font-medium">{action.stepLabel}</p>
                            <p className="text-xs text-muted-foreground">{action.stepCode ?? "-"}</p>
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{action.actorUserId ?? action.actorType}</TableCell>
                      <TableCell>{action.remarkText ?? "-"}</TableCell>
                      <TableCell>{formatDate(action.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-border/70">
          <CardContent className="py-8 text-sm text-muted-foreground">
            {isBusy ? "Loading workflow instance detail..." : "Workflow instance detail is unavailable."}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
