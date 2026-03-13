"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

type AuthMode = "sign-in" | "sign-up"

type AuthCardProps = {
  mode: AuthMode
}

const copy = {
  "sign-in": {
    title: "Sign in to test workflow actors",
    description:
      "Use any Better Auth email/password user to verify inbox routing, approvals, and notifications.",
    cta: "Sign in",
    alternateHref: "/sign-up",
    alternateLabel: "Create an account",
  },
  "sign-up": {
    title: "Create a test user",
    description:
      "Register another actor account so you can test multi-user approvals and escalations locally.",
    cta: "Create account",
    alternateHref: "/sign-in",
    alternateLabel: "Already have an account?",
  },
} as const

export function AuthCard({ mode }: AuthCardProps) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const modeCopy = useMemo(() => copy[mode], [mode])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
        })

        if (result.error) {
          setError(result.error.message ?? "Unable to create the account.")
          return
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
          rememberMe: true,
        })

        if (result.error) {
          setError(result.error.message ?? "Unable to sign in with those credentials.")
          return
        }
      }

      router.push("/dashboard")
      router.refresh()
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Authentication failed. Check that Postgres and Better Auth are running.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md border-border/70 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">{modeCopy.title}</CardTitle>
        <CardDescription>{modeCopy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === "sign-up" ? (
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Workflow Manager"
                required
                value={name}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="reviewer@example.com"
              required
              type="email"
              value={email}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
              type="password"
              value={password}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Working..." : modeCopy.cta}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={modeCopy.alternateHref}>
              {modeCopy.alternateLabel}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
