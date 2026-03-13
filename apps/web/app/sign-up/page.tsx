import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth-card"
import { auth } from "@/lib/auth"

export default async function SignUpPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-4xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
            Better Auth sign up
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Create another actor so you can test multi-user approvals.
          </h1>
          <p className="text-muted-foreground">
            Each new email/password user becomes another workflow participant you can assign to
            human steps, escalation chains, or approve-all flows.
          </p>
          <Link className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/">
            Back to the platform overview
          </Link>
        </div>

        <AuthCard mode="sign-up" />
      </div>
    </main>
  )
}
