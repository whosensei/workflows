import { Pool } from "pg"

import { serverEnv } from "@/lib/server-env"

declare global {
  var __usersApiPool: Pool | undefined
}

const pool =
  global.__usersApiPool ??
  new Pool({ connectionString: serverEnv.databaseUrl })

if (process.env.NODE_ENV !== "production") {
  global.__usersApiPool = pool
}

export async function GET() {
  const result = await pool.query(
    'SELECT id, email, name FROM "user" ORDER BY name ASC',
  )

  return Response.json({ users: result.rows })
}
