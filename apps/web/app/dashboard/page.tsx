import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { ApiIdentityPanel } from "@/components/api-identity-panel"
import { SignOutButton } from "@/components/sign-out-button"
import { WorkflowPreview } from "@/components/workflow-preview"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"

const activityRows = [
  {
    actor: "requester@example.com",
    action: "Submitted",
    remark: "Need approval before vendor onboarding.",
    outcome: "Advanced to manager approval",
  },
  {
    actor: "manager@example.com",
    action: "Approved",
    remark: "Approved with risk review required.",
    outcome: "Triggered vendor risk subworkflow",
  },
  {
    actor: "reviewer1@example.com",
    action: "Pending",
    remark: "Priority chain waiting on first reviewer.",
    outcome: "Notification scheduled",
  },
]

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/sign-in")
  }

  return (
    <main className="min-h-svh px-6 py-10 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Foundation running</Badge>
              <Badge variant="outline">Signed in as {session.user.email}</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Welcome back, {session.user.name}.
              </h1>
              <p className="max-w-3xl text-muted-foreground">
                This dashboard is the first execution shell for the workflow platform: auth is
                wired, FastAPI can verify Better Auth tokens, and the builder direction is visible
                through the initial React Flow map.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/builder">Open builder</Link>
            </Button>
            <SignOutButton />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>Workflow definitions</CardDescription>
              <CardTitle className="text-3xl">1</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Use the builder page to create and persist real definitions in Neon.
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>Human actors</CardDescription>
              <CardTitle className="text-3xl">5</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The target local test-user set is documented and the auth flow is in place.
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>Approval modes</CardDescription>
              <CardTitle className="text-3xl">3</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Priority chain, approve-any, and approve-all are represented in the runtime plan.
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardDescription>Queue backbone</CardDescription>
              <CardTitle className="text-3xl">RabbitMQ</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              RabbitMQ stays local while PostgreSQL runs in Neon.
            </CardContent>
          </Card>
        </section>

        <Tabs className="space-y-6" defaultValue="builder">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="runtime">Runtime history</TabsTrigger>
            <TabsTrigger value="api">API handshake</TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-6" value="builder">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>React Flow visual map</CardTitle>
                <CardDescription>
                  The foundation already reserves a visual mapping surface for step nodes, arrow
                  labels, and subworkflow links.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <WorkflowPreview />
                <Separator />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="font-medium">Step metadata</p>
                    <p className="text-sm text-muted-foreground">
                      Step code, label, description, assignees, notification message, and remark
                      requirements all map into the next builder pass.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="font-medium">Transition labels</p>
                    <p className="text-sm text-muted-foreground">
                      Edge labels sit above the arrows so approval paths are readable directly on
                      the canvas.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="font-medium">Canonical graph JSON</p>
                    <p className="text-sm text-muted-foreground">
                      The visual layout and canonical workflow JSON will be stored separately so
                      moving nodes never changes execution semantics.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent className="space-y-6" value="runtime">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Approval history table</CardTitle>
                <CardDescription>
                  Runtime actions are intended to be readable in a table-first format before deeper
                  drill-down views.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityRows.map((row) => (
                      <TableRow key={`${row.actor}-${row.action}`}>
                        <TableCell className="font-medium">{row.actor}</TableCell>
                        <TableCell>{row.action}</TableCell>
                        <TableCell>{row.remark}</TableCell>
                        <TableCell>{row.outcome}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api">
            <ApiIdentityPanel />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
