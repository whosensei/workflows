import "server-only"

export const serverEnv = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://USER:PASSWORD@YOUR_NEON_HOST/neondb?sslmode=require",
  betterAuthSecret:
    process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me",
  betterAuthUrl:
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000",
}
