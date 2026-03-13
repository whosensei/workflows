"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { authClient } from "@/lib/auth-client"
import { publicEnv } from "@/lib/public-env"

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

type WorkflowInstanceSummary = {
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
}

type WorkflowAction = {
  id: string
  actionType: string
  actionCode: string | null
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

type WorkflowInstanceDetail = WorkflowInstanceSummary & {
  inputData: Record<string, unknown>
  contextData: Record<string, unknown>
  outputData: Record<string, unknown>
  steps: WorkflowStepVisit[]
  actions: WorkflowAction[]
}

type HumanTask = {
  id: string
  workflowInstanceId: string
  stepInstanceId: string
  stepDefinitionId: string
  stepCode: string
  stepLabel: string
  assignedUserId: string | null
  assignedRoleKey: string | null
  assignedGroupKey: string | null
  approvalModeSnapshot: string
  priorityRank: number | null
  sequenceNo: number
  status: string
  availableActions: string[]
  dueAt: string | null
  escalationDueAt: string | null
  createdAt: string
}

type Notification = {
  id: string
  workflowInstanceId: string | null
  stepInstanceId: string | null
  notificationType: string
  title: string
  body: string
  isRead: boolean
  readAt: string | null
  createdAt: string
}

type TaskActionType = "approve" | "reject" | "revert" | "custom"

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

export function RuntimeConsole() {
  const [definitions, setDefinitions] = useState<WorkflowDefinitionSummary[]>([])
  const [instances, setInstances] = useState<WorkflowInstanceSummary[]>([])
  const [tasks, setTasks] = useState<HumanTask[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>("")
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstanceDetail | null>(null)
  const [businessKey, setBusinessKey] = useState("")
  const [taskRemarks, setTaskRemarks] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("Loading workflow runtime data...")
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const summary = useMemo(
    () => ({
      definitions: definitions.length,
      running: instances.filter((instance) => ["running", "waiting", "paused"].includes(instance.status))
        .length,
      openTasks: tasks.filter((task) => task.status === "open").length,
      unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
    }),
    [definitions, instances, notifications, tasks],
  )

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

  const loadDefinitions = useCallback(async () => {
    const response = await authedFetch("/api/v1/workflow-definitions", { method: "GET" })
    const payload = (await response.json()) as { items: WorkflowDefinitionSummary[] }
    if (!response.ok) {
      throw new Error("Unable to load workflow definitions.")
    }
    setDefinitions(payload.items)
    if (!selectedDefinitionId && payload.items[0]) {
      setSelectedDefinitionId(payload.items[0].id)
    }
  }, [authedFetch, selectedDefinitionId])

  const loadInstances = useCallback(async () => {
    const response = await authedFetch("/api/v1/workflow-instances", { method: "GET" })
    const payload = (await response.json()) as { items: WorkflowInstanceSummary[] }
    if (!response.ok) {
      throw new Error("Unable to load workflow instances.")
    }
    setInstances(payload.items)
  }, [authedFetch])

  const loadTasks = useCallback(async () => {
    const response = await authedFetch("/api/v1/me/tasks", { method: "GET" })
    const payload = (await response.json()) as { items: HumanTask[] }
    if (!response.ok) {
      throw new Error("Unable to load tasks.")
    }
    setTasks(payload.items)
  }, [authedFetch])

  const loadNotifications = useCallback(async () => {
    const response = await authedFetch("/api/v1/me/notifications", { method: "GET" })
    const payload = (await response.json()) as { items: Notification[] }
    if (!response.ok) {
      throw new Error("Unable to load notifications.")
    }
    setNotifications(payload.items)
  }, [authedFetch])

  const refreshAll = useCallback(async () => {
    setError(null)
    await Promise.all([loadDefinitions(), loadInstances(), loadTasks(), loadNotifications()])
    setStatus("Workflow runtime data refreshed from Neon.")
  }, [loadDefinitions, loadInstances, loadNotifications, loadTasks])

  useEffect(() => {
    void refreshAll().catch((refreshError) => {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to load runtime data.")
      setStatus("Runtime data load failed.")
    })
  }, [refreshAll])

  async function startInstance() {
    if (!selectedDefinitionId) {
      setError("Select a workflow definition first.")
      return
    }

    setIsBusy(true)
    setError(null)
    setStatus("Starting workflow instance...")

    try {
      const response = await authedFetch("/api/v1/workflow-instances", {
        method: "POST",
        body: JSON.stringify({
          workflowDefinitionId: selectedDefinitionId,
          businessKey: businessKey || null,
          inputData: {
            source: "runtime-console",
          },
          contextData: {
            startedFromUi: true,
          },
        }),
      })

      const payload = (await response.json()) as { item?: WorkflowInstanceDetail; detail?: string }
      if (!response.ok || !payload.item) {
        throw new Error(payload.detail ?? "Unable to start workflow instance.")
      }

      setSelectedInstance(payload.item)
      setStatus(`Started workflow instance ${payload.item.id}.`)
      await refreshAll()
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start workflow.")
      setStatus("Workflow instance start failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function loadInstanceDetail(instanceId: string) {
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
      setSelectedInstance(payload.item)
      setStatus(`Loaded workflow instance ${instanceId}.`)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load workflow instance.")
    } finally {
      setIsBusy(false)
    }
  }

  async function submitTaskAction(task: HumanTask, actionType: TaskActionType) {
    setIsBusy(true)
    setError(null)
    setStatus(`Submitting ${actionType} action for ${task.stepLabel}...`)

    try {
      const response = await authedFetch(`/api/v1/human-tasks/${task.id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          actionType,
          remark: taskRemarks[task.id] || null,
          payload: {
            source: "runtime-console",
          },
        }),
      })

      const payload = (await response.json()) as {
        workflowInstanceId?: string
        nextStepCode?: string | null
        workflowStatus?: string
        detail?: string
      }
      if (!response.ok) {
        throw new Error(payload.detail ?? "Unable to submit task action.")
      }

      setStatus(
        `Task action ${actionType} recorded. Workflow is now ${payload.workflowStatus ?? "updated"}.`,
      )
      setTaskRemarks((current) => ({ ...current, [task.id]: "" }))
      await Promise.all([refreshAll(), loadInstanceDetail(task.workflowInstanceId)])
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to action task.")
      setStatus("Task action failed.")
    } finally {
      setIsBusy(false)
    }
  }

  async function markNotificationRead(notificationId: string) {
    setIsBusy(true)
    setError(null)

    try {
      const response = await authedFetch(`/api/v1/notifications/${notificationId}/read`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      if (!response.ok) {
        throw new Error("Unable to mark notification as read.")
      }
      setStatus("Notification marked as read.")
      await loadNotifications()
    } catch (notificationError) {
      setError(
        notificationError instanceof Error
          ? notificationError.message
          : "Unable to mark notification as read.",
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-4">
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Definitions</CardDescription>
            <CardTitle className="text-3xl">{summary.definitions}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Neon-backed workflow definitions available to launch.
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Running or waiting</CardDescription>
            <CardTitle className="text-3xl">{summary.running}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Active workflow instances visible to the signed-in user.
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Open tasks</CardDescription>
            <CardTitle className="text-3xl">{summary.openTasks}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Human tasks waiting for an approve, reject, or revert action.
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardDescription>Unread notifications</CardDescription>
            <CardTitle className="text-3xl">{summary.unreadNotifications}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            In-app notifications written from runtime events and outbox fan-out.
          </CardContent>
        </Card>
      </section>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Start workflow instance</CardTitle>
            <CardDescription>
              Launch a runtime execution from any saved definition and persist it in Neon.
            </CardDescription>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => void refreshAll()} variant="outline">
              Refresh data
            </Button>
            <Button disabled={isBusy} onClick={startInstance}>
              {isBusy ? "Working..." : "Start instance"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_0.8fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium">Workflow definition</label>
            <select
              className="flex h-9 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) => setSelectedDefinitionId(event.target.value)}
              value={selectedDefinitionId}
            >
              <option value="">Select a definition</option>
              {definitions.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.name} ({definition.key})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Business key</label>
            <Input
              onChange={(event) => setBusinessKey(event.target.value)}
              placeholder="invoice-2026-001"
              value={businessKey}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {status}
            </div>
          </div>
          {error ? (
            <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-3">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs className="space-y-6" defaultValue="tasks">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="tasks">My tasks</TabsTrigger>
          <TabsTrigger value="instances">Instances</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="detail">Selected instance</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Human task inbox</CardTitle>
              <CardDescription>
                Approve, reject, or revert tasks with remarks and watch the workflow advance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Step</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.stepLabel}</p>
                            <p className="text-xs text-muted-foreground">{task.stepCode}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={task.status === "open" ? "secondary" : "outline"}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{task.approvalModeSnapshot}</TableCell>
                        <TableCell className="min-w-64">
                          <Input
                            onChange={(event) =>
                              setTaskRemarks((current) => ({
                                ...current,
                                [task.id]: event.target.value,
                              }))
                            }
                            placeholder="Add approval or rejection remark"
                            value={taskRemarks[task.id] ?? ""}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {task.availableActions.includes("approve") ? (
                              <Button
                                disabled={task.status !== "open" || isBusy}
                                onClick={() => void submitTaskAction(task, "approve")}
                                size="sm"
                              >
                                Approve
                              </Button>
                            ) : null}
                            {task.availableActions.includes("reject") ? (
                              <Button
                                disabled={task.status !== "open" || isBusy}
                                onClick={() => void submitTaskAction(task, "reject")}
                                size="sm"
                                variant="destructive"
                              >
                                Reject
                              </Button>
                            ) : null}
                            {task.availableActions.includes("revert") ? (
                              <Button
                                disabled={task.status !== "open" || isBusy}
                                onClick={() => void submitTaskAction(task, "revert")}
                                size="sm"
                                variant="outline"
                              >
                                Revert
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No tasks are currently assigned.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instances">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Workflow instances</CardTitle>
              <CardDescription>
                Review instance status and drill into the step/action timeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {instances.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current step</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instances.map((instance) => (
                      <TableRow key={instance.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{instance.workflowDefinitionName}</p>
                            <p className="text-xs text-muted-foreground">{instance.businessKey ?? instance.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={instance.status === "completed" ? "outline" : "secondary"}>
                            {instance.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{instance.currentStepLabel ?? "-"}</TableCell>
                        <TableCell>{formatDate(instance.startedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => void loadInstanceDetail(instance.id)}
                            size="sm"
                            variant="outline"
                          >
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No workflow instances yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>In-app notifications</CardTitle>
              <CardDescription>
                Notifications are persisted in Neon and can be marked read from the UI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {notifications.length > 0 ? (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div
                      className="flex flex-col gap-3 rounded-2xl border border-border/70 p-4 md:flex-row md:items-start md:justify-between"
                      key={notification.id}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{notification.title}</p>
                          <Badge variant={notification.isRead ? "outline" : "secondary"}>
                            {notification.isRead ? "Read" : "Unread"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{notification.body}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.isRead ? (
                        <Button
                          disabled={isBusy}
                          onClick={() => void markNotificationRead(notification.id)}
                          size="sm"
                          variant="outline"
                        >
                          Mark read
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No notifications yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Selected instance detail</CardTitle>
              <CardDescription>
                Steps and workflow actions are shown in table-first format for quick debugging.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {selectedInstance ? (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground">Workflow</p>
                      <p className="font-medium">{selectedInstance.workflowDefinitionName}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-medium">{selectedInstance.status}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground">Current step</p>
                      <p className="font-medium">{selectedInstance.currentStepLabel ?? "-"}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground">Run number</p>
                      <p className="font-medium">{selectedInstance.runNumber}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium">Step visits</p>
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
                        {selectedInstance.steps.map((step) => (
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
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium">Action history</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Remark</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedInstance.actions.map((action) => (
                          <TableRow key={action.id}>
                            <TableCell>{action.actionType}</TableCell>
                            <TableCell>{action.actorUserId ?? action.actorType}</TableCell>
                            <TableCell>{action.remarkText ?? "-"}</TableCell>
                            <TableCell>{formatDate(action.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Start or inspect a workflow instance to view step visits and action history.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
