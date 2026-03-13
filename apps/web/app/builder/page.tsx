import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { WorkflowBuilder } from "@/components/workflow-builder"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"

export default async function BuilderPage() {
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
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
              Workflow builder
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Create workflow definitions directly in Neon.
              </h1>
              <p className="max-w-3xl text-muted-foreground">
                This builder captures workflow metadata, step configuration, associations,
                assignment policy, transitions, and the visual graph preview in one place.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </section>

        <WorkflowBuilder />
      </div>
    </main>
  )
}
