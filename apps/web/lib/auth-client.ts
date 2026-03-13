import { createAuthClient } from "better-auth/react"
import { jwtClient } from "better-auth/client/plugins"

import { publicEnv } from "@/lib/public-env"

export const authClient = createAuthClient({
  baseURL: publicEnv.appUrl,
  plugins: [jwtClient()],
})
