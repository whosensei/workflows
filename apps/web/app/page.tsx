import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth"

const highlights = [
  {
    title: "Better Auth users",
    description: "Email/password sign-in so you can test approvals as different actors.",
  },
  {
    title: "FastAPI boundary",
    description: "Python handles the workflow engine and trusts Better Auth bearer tokens.",
  },
  {
    title: "React Flow builder",
    description: "The visual workflow mapping shell is now part of the UI foundation.",
  },
]

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="min-h-svh bg-gradient-to-b from-background via-background to-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 lg:px-8">
        <section className="grid gap-10 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
              Async workflow engine foundation
            </p>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                Human-in-the-loop workflow orchestration with a live FastAPI + Next.js shell.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                The repo now starts from the requested stack, includes Better Auth email/password login,
                and gives us a clean place to build the workflow designer, runtime inbox, and approval engine.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">Create a test user</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/builder">Open workflow builder</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/operations">Open runtime console</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>

          <Card className="border-border/70 bg-card/70 shadow-sm backdrop-blur">
            <CardHeader>
              <CardTitle>First execution slice</CardTitle>
              <CardDescription>
                This scaffold targets the highest-risk integration points first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <p className="font-medium text-foreground">Included now</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Next.js app with the requested shadcn preset</li>
                  <li>Better Auth email/password login shell</li>
                  <li>FastAPI service with token verification entry point</li>
                  <li>Workflow builder forms with Neon-backed persistence</li>
                  <li>Neon database and local RabbitMQ queue config</li>
                </ul>
              </div>
              <p className="text-xs">
                Press <kbd className="rounded border px-1.5 py-0.5">d</kbd> to toggle theme.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <Card className="border-border/70" key={item.title}>
              <CardHeader>
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </div>
    </main>
  )
}
