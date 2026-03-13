# Workflow Engine Platform

Foundation for the async workflow engine described in `docs/async-workflow-engine-plan.md`.

## Stack

- `apps/web`: Next.js 16 + shadcn/ui + Better Auth
- `apps/api`: FastAPI + uv
- Neon Postgres for persistent data
- `infra/docker-compose.yml`: RabbitMQ only

## Quick start

1. Copy the example env files:
   - `cp apps/web/.env.example apps/web/.env.local`
   - `cp apps/api/.env.example apps/api/.env`
2. Put your Neon connection string into both:
   - `apps/web/.env.local` as `DATABASE_URL`
   - `apps/api/.env` as `WORKFLOW_DATABASE_URL`
3. Bootstrap the Neon database schema:
   - `bash -lc 'export PATH="$HOME/.local/bin:$PATH" && uv run --project apps/api python apps/api/scripts/bootstrap_neon.py'`
4. Start queue infra:
   - `docker compose -f infra/docker-compose.yml up -d`
5. Start the API:
   - `pnpm dev:api`
6. Start the web app:
   - `pnpm dev:web`
7. Seed local users after the web app is running:
   - `pnpm --dir apps/web seed:users`
8. Publish queued outbox events to RabbitMQ when needed:
   - `pnpm queue:publish`
9. Release next priority-chain assignees whose escalation timers expired:
   - `pnpm queue:release`

## Current implementation slice

- Better Auth email/password login shell
- FastAPI service with Better Auth JWT verification
- Workflow definition builder saved in Neon
- Runtime console for instances, tasks, notifications, and action history
- RabbitMQ outbox publisher and priority-chain release worker
- Bootstrap SQL for Better Auth core tables and first workflow tables on Neon
