import "server-only"

import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { jwt } from "better-auth/plugins"
import { Pool } from "pg"

import { serverEnv } from "@/lib/server-env"

declare global {
  var __workflowAuthPool: Pool | undefined
}

const authPool =
  global.__workflowAuthPool ??
  new Pool({
    connectionString: serverEnv.databaseUrl,
  })

if (process.env.NODE_ENV !== "production") {
  global.__workflowAuthPool = authPool
}

export const auth = betterAuth({
  database: authPool,
  secret: serverEnv.betterAuthSecret,
  baseURL: serverEnv.betterAuthUrl,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      displayName: {
        type: "string",
        required: false,
        input: false,
      },
      isTestUser: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  plugins: [jwt(), nextCookies()],
})
