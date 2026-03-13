import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth-card"
import { auth } from "@/lib/auth"

export default async function SignInPage() {
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
            Better Auth sign in
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Log in as a reviewer, manager, or requester.
          </h1>
          <p className="text-muted-foreground">
            This is the first real auth shell for the workflow platform. Use separate accounts to
            validate assignment order, action history, and notification routing.
          </p>
          <Link className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href="/">
            Back to the platform overview
          </Link>
        </div>

        <AuthCard mode="sign-in" />
      </div>
    </main>
  )
}
