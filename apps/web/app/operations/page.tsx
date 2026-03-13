import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { RuntimeConsole } from "@/components/runtime-console"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"

export default async function OperationsPage() {
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
              Runtime operations
            </p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Start workflows, action tasks, and inspect notifications.
              </h1>
              <p className="max-w-3xl text-muted-foreground">
                This screen is the execution console for the workflow platform. It launches saved
                definitions, shows in-app notifications, and lets signed-in users approve, reject,
                or revert human tasks.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/builder">Open builder</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </section>

        <RuntimeConsole />
      </div>
    </main>
  )
}
