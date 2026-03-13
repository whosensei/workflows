"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { publicEnv } from "@/lib/public-env"
import { authClient } from "@/lib/auth-client"

type ApiState = {
  status: "idle" | "loading" | "success" | "error"
  message?: string
  payload?: unknown
}

export function ApiIdentityPanel() {
  const [state, setState] = useState<ApiState>({ status: "idle" })

  async function verifyIdentity() {
    setState({ status: "loading" })

    try {
      const tokenResponse = await authClient.token()

      if (tokenResponse.error || !tokenResponse.data?.token) {
        setState({
          status: "error",
          message: tokenResponse.error?.message ?? "No Better Auth token available.",
        })
        return
      }

      const response = await fetch(`${publicEnv.apiBaseUrl}/api/v1/me`, {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.token}`,
        },
      })

      const payload = (await response.json()) as unknown

      if (!response.ok) {
        setState({
          status: "error",
          message: "FastAPI rejected the Better Auth token.",
          payload,
        })
        return
      }

      setState({
        status: "success",
        payload,
      })
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to reach the FastAPI backend.",
      })
    }
  }

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>FastAPI identity handshake</CardTitle>
        <CardDescription>
          Fetch a Better Auth JWT in the browser and verify it against the Python API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={verifyIdentity} variant="outline">
          {state.status === "loading" ? "Verifying..." : "Verify token with FastAPI"}
        </Button>

        {state.message ? (
          <p className="rounded-lg border border-border/70 bg-muted px-3 py-2 text-sm text-muted-foreground">
            {state.message}
          </p>
        ) : null}

        <pre className="max-h-72 overflow-auto rounded-xl border border-border/70 bg-muted/60 p-4 text-xs leading-6 text-foreground">
          {JSON.stringify(
            state.payload ?? {
              status: "idle",
              hint: "Sign in first, then verify the token to inspect the FastAPI response.",
            },
            null,
            2,
          )}
        </pre>
      </CardContent>
    </Card>
  )
}
