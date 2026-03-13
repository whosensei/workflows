# AGENTS.md

## General instructions

- Use `pnpm`, not `npm`.
- Use `uv` for Python package and run commands.
- Keep PostgreSQL on Neon, not in local Docker.
- Use local Docker only for RabbitMQ unless a task explicitly needs something else.

## Cursor Cloud specific instructions

### Tooling expectations

- `pnpm` 10.x should be available in the agent environment.
- `uv` should be available on `PATH`.
- If `uv` is missing in the current session, install it with:
  - `python3 -m pip install --user uv`
  - then export `PATH="$HOME/.local/bin:$PATH"` for the shell session.

### Environment setup

- Web app env file: `apps/web/.env.local`
- API env file: `apps/api/.env`
- Both apps must point at the same Neon database:
  - `DATABASE_URL` in `apps/web/.env.local`
  - `WORKFLOW_DATABASE_URL` in `apps/api/.env`

### Common commands

- Bootstrap Neon schema:
  - `pnpm bootstrap:db`
- Start RabbitMQ:
  - `docker compose -f infra/docker-compose.yml up -d`
- Start FastAPI:
  - `pnpm dev:api`
- Start Next.js:
  - `pnpm dev:web`
- Seed Better Auth test users:
  - `pnpm --dir apps/web seed:users`

### Local test users

- `admin@example.com`
- `manager@example.com`
- `reviewer1@example.com`
- `reviewer2@example.com`
- `requester@example.com`

Password for seeded local users:

- `password1234`
