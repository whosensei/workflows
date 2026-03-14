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

CREATE TABLE IF NOT EXISTS workflow_step_mapping (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    step_definition_id uuid NOT NULL UNIQUE REFERENCES workflow_step_definition(id) ON DELETE CASCADE,
    child_workflow_definition_id uuid REFERENCES workflow_definition(id) ON DELETE SET NULL,
    child_workflow_version_id uuid REFERENCES workflow_definition_version(id) ON DELETE SET NULL,
    trigger_mode text NOT NULL DEFAULT 'sync_wait',
    input_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    completion_action text,
    failure_action text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_template (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL REFERENCES workflow_definition_version(id) ON DELETE CASCADE,
    step_definition_id uuid REFERENCES workflow_step_definition(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    channel text NOT NULL DEFAULT 'in_app',
    title_template text NOT NULL,
    body_template text NOT NULL,
    allow_actor_override boolean NOT NULL DEFAULT true,
    supported_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
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

CREATE TABLE IF NOT EXISTS workflow_instance_data (
    workflow_instance_id uuid PRIMARY KEY REFERENCES workflow_instance(id) ON DELETE CASCADE,
    input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    context_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error jsonb,
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

CREATE TABLE IF NOT EXISTS workflow_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    old_status text,
    new_status text NOT NULL,
    reason text,
    changed_by_action_id uuid REFERENCES workflow_action(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subworkflow_link (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    parent_step_instance_id uuid NOT NULL REFERENCES step_instance(id) ON DELETE CASCADE,
    child_workflow_instance_id uuid NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    link_status text NOT NULL DEFAULT 'running',
    resume_action text,
    linked_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
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
    headers jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending',
    available_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    claimed_by text,
    published_at timestamptz,
    retry_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 20,
    last_error text,
    last_error_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outbox_event
    ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
    ALTER COLUMN status SET DEFAULT 'pending',
    ALTER COLUMN available_at SET DEFAULT now(),
    ALTER COLUMN retry_count SET DEFAULT 0;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS headers jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS claimed_by text;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 20;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

ALTER TABLE outbox_event
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE outbox_event
    DROP CONSTRAINT IF EXISTS outbox_event_status_check;

ALTER TABLE outbox_event
    ADD CONSTRAINT outbox_event_status_check
    CHECK (status IN ('pending', 'processing', 'retry_scheduled', 'published', 'dead_letter'));

CREATE INDEX IF NOT EXISTS idx_outbox_event_ready
    ON outbox_event (available_at, created_at)
    WHERE status IN ('pending', 'retry_scheduled');

CREATE INDEX IF NOT EXISTS idx_outbox_event_processing
    ON outbox_event (claimed_at)
    WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_outbox_event_aggregate
    ON outbox_event (aggregate_type, aggregate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS processed_message (
    consumer_name text NOT NULL,
    message_id uuid NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, message_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_message_processed_at
    ON processed_message (processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_human_task_priority_due
    ON human_task (escalation_due_at, step_instance_id, sequence_no)
    WHERE status = 'queued'
      AND approval_mode_snapshot = 'priority_chain'
      AND escalation_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_human_task_step_status
    ON human_task (step_instance_id, status);
