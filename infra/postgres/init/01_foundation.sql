CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "user" (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    image text,
    role text DEFAULT 'user',
    "displayName" text,
    "isTestUser" boolean NOT NULL DEFAULT false,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    "expiresAt" timestamptz NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account (
    id text PRIMARY KEY,
    "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    scope text,
    password text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS verification (
    id text PRIMARY KEY,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jwks (
    id text PRIMARY KEY,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "expiresAt" timestamptz
);

CREATE TABLE IF NOT EXISTS workflow_definition (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'draft',
    created_by text REFERENCES "user"(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_definition_version (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_definition_id uuid NOT NULL REFERENCES workflow_definition(id) ON DELETE CASCADE,
    version_no integer NOT NULL,
    is_published boolean NOT NULL DEFAULT false,
    version_label text,
    definition_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    graph_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    builder_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by text REFERENCES "user"(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_definition_id, version_no)
);

CREATE TABLE IF NOT EXISTS workflow_step_definition (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL REFERENCES workflow_definition_version(id) ON DELETE CASCADE,
    step_code text NOT NULL,
    step_label text NOT NULL,
    description text,
    step_type text NOT NULL,
    sequence_hint integer,
    allow_revert boolean NOT NULL DEFAULT true,
    remark_required_on_approve boolean NOT NULL DEFAULT false,
    remark_required_on_reject boolean NOT NULL DEFAULT false,
    remark_required_on_revert boolean NOT NULL DEFAULT false,
    max_visits_per_instance integer,
    form_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_terminal boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_version_id, step_code)
);

CREATE TABLE IF NOT EXISTS workflow_step_association (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    step_definition_id uuid NOT NULL REFERENCES workflow_step_definition(id) ON DELETE CASCADE,
    association_type text NOT NULL,
    association_value text NOT NULL,
    can_approve boolean NOT NULL DEFAULT true,
    can_reject boolean NOT NULL DEFAULT true,
    can_revert boolean NOT NULL DEFAULT true,
    priority integer,
    notification_order integer,
    escalation_after_seconds integer,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_step_assignment_policy (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    step_definition_id uuid NOT NULL UNIQUE REFERENCES workflow_step_definition(id) ON DELETE CASCADE,
    approval_mode text NOT NULL DEFAULT 'priority_chain',
    required_approvals_count integer,
    priority_escalation_enabled boolean NOT NULL DEFAULT false,
    escalation_timeout_seconds integer,
    reminder_interval_seconds integer,
    max_escalation_count integer,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_transition_definition (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL REFERENCES workflow_definition_version(id) ON DELETE CASCADE,
    from_step_definition_id uuid NOT NULL REFERENCES workflow_step_definition(id) ON DELETE CASCADE,
    to_step_definition_id uuid REFERENCES workflow_step_definition(id) ON DELETE SET NULL,
    action_type text NOT NULL,
    action_code text,
    transition_label text,
    description text,
    condition_expression text,
    priority integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_instance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL REFERENCES workflow_definition_version(id) ON DELETE RESTRICT,
    business_key text,
    run_number integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'running',
    current_step_instance_id uuid,
    started_by text REFERENCES "user"(id) ON DELETE SET NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    parent_workflow_instance_id uuid,
    parent_step_instance_id uuid,
    lock_version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS step_instance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    step_definition_id uuid NOT NULL REFERENCES workflow_step_definition(id) ON DELETE RESTRICT,
    attempt_no integer NOT NULL DEFAULT 1,
    visit_count integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'pending',
    entered_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    waiting_since timestamptz,
    actor_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
    result_action text,
    result_payload jsonb,
    error_payload jsonb
);

CREATE TABLE IF NOT EXISTS human_task (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    step_instance_id uuid NOT NULL REFERENCES step_instance(id) ON DELETE CASCADE,
    step_definition_id uuid NOT NULL REFERENCES workflow_step_definition(id) ON DELETE RESTRICT,
    assigned_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
    assigned_role_key text,
    assigned_group_key text,
    approval_mode_snapshot text NOT NULL DEFAULT 'priority_chain',
    priority_rank integer,
    sequence_no integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'open',
    available_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
    due_at timestamptz,
    escalation_due_at timestamptz,
    claimed_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_action (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    step_instance_id uuid REFERENCES step_instance(id) ON DELETE SET NULL,
    action_type text NOT NULL,
    action_code text,
    actor_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
    actor_type text NOT NULL DEFAULT 'user',
    remark_text text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    idempotency_key text UNIQUE
);

CREATE TABLE IF NOT EXISTS notification (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    workflow_instance_id uuid REFERENCES workflow_instance(id) ON DELETE CASCADE,
    step_instance_id uuid REFERENCES step_instance(id) ON DELETE CASCADE,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending',
    available_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    retry_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
