# Async Workflow Engine Plan

## 1. Product goals

Build an async workflow engine with human-in-the-loop processing where:

- admins define reusable workflow templates,
- each template contains steps and transitions,
- some steps wait for a user to approve, reject, or revert,
- step notifications can use user-configured messages,
- remarks can be optional or mandatory per action,
- notifications are sent only when a workflow actually reaches a waiting step,
- assignees can be notified by priority, all at once, or according to approval policy,
- workflow state can remain paused for days with the database as the source of truth,
- a step can trigger a child workflow and resume the parent when the child completes,
- transitions have display labels for the visual builder,
- workflow definitions are validated so invalid graphs and unsafe loops are rejected,
- the builder stores a canonical JSON representation and a visual map for editing,
- every state change, action, and notification is persisted.

This first draft assumes:

- backend: Python + FastAPI,
- frontend: Next.js + shadcn/ui,
- package management: `uv` for Python and `pnpm` for the web app,
- queue: RabbitMQ for async dispatch,
- database: PostgreSQL as the system of record.

## 2. Recommended repo layout

Use a monorepo layout so the workflow schema, API contracts, and UI evolve together.

- `apps/api` - FastAPI app, SQLAlchemy models, Alembic migrations, workflow engine, workers
- `apps/web` - Next.js app, shadcn/ui workflow builder and runtime inbox
- `packages/contracts` - shared JSON schema or typed API contracts
- `packages/docs` - architecture notes, ADRs, sample workflow definitions
- `infra` - local Docker compose for Postgres and RabbitMQ

Recommended setup steps for the next implementation pass:

1. remove the placeholder Go starter files,
2. initialize the web app with `pnpm dlx shadcn@latest init --preset ac2FTn --template next`,
3. initialize the FastAPI app with `uv init`,
4. add Docker compose for PostgreSQL and RabbitMQ,
5. add Alembic migrations before building runtime logic.

## 3. Core domain model

The engine should separate **static definition data** from **runtime execution data**.

### Static side

Static tables describe what a workflow is:

- workflow definitions,
- definition versions,
- step definitions,
- step assignee rules,
- step approval and escalation policies,
- step-to-step transitions,
- optional child workflow mapping,
- form/action configuration,
- notification templates,
- visual builder layout and graph JSON.

### Runtime side

Runtime tables describe what is happening right now:

- workflow instances,
- step instances,
- pending human tasks,
- action history,
- workflow variables and outputs,
- notifications and outbox events,
- escalation schedules,
- execution counters and rollups,
- subworkflow links,
- pause/resume checkpoints.

This split is critical because definitions should be editable and versioned without corrupting in-flight workflows.

## 4. Execution model

### Step types

Support these step types from the beginning:

- `start`
- `end`
- `human_task`
- `system_task`
- `subworkflow`
- `decision`
- `sql_gate` (careful: gated and sandboxed)

### Transition actions

Model transitions as explicit actions from one step to another:

- `approve`
- `reject`
- `revert`
- `custom`

Your requested "From / To / description / approve type" maps directly to the transition definition table.
Each transition also gets a `transition_label` for the text shown above the arrow in the visual mapper.

### Human approval modes

Each human step should declare one approval delivery mode:

- `priority_chain` - notify highest priority first, then escalate to the next user after timeout,
- `approve_any_one` - notify all configured assignees, first valid approval completes the step,
- `approve_all` - notify all configured assignees, every required assignee must approve,
- `notify_all` - notify everyone, but policy determines whether one or all responses are required.

This policy belongs in the static workflow definition and is copied into runtime task rows when the workflow starts waiting.

### High-level runtime flow

1. A workflow instance is created from a published workflow version.
2. The engine creates the first step instance.
3. If the step is automatic, a worker executes it and advances immediately.
4. If the step is human, the engine:
   - marks the workflow as `waiting`,
   - creates one or more pending tasks,
   - resolves the step association and assignment policy,
   - renders the user-configured notification message,
   - writes notification events to the outbox,
   - publishes notification jobs to RabbitMQ.
5. The assignee receives an in-app notification.
6. The assignee clicks approve, reject, or revert and submits a remark when the step requires one.
7. The backend validates that the actor is allowed to act.
8. The action is written to the database in one transaction.
9. The engine resolves the matching transition and advances the workflow.
10. If the next step is a child workflow, the parent is paused until the child completes.

### Important principle

RabbitMQ must **not** be the source of truth. It is only a delivery mechanism.

The database must always contain:

- the current workflow state,
- the current step state,
- all pending work items,
- all emitted but unsent notifications,
- the currently active escalation stage,
- all completed actions,
- subworkflow linkage.

### Definition validation and loop safety

Before a workflow version can be published, run graph validation that checks:

- exactly one start node exists,
- at least one terminal node exists,
- every non-terminal step has at least one outgoing transition,
- every step is reachable from the start node,
- every transition target exists,
- every subworkflow mapping points to a valid published child workflow,
- every cycle has an exit path and a guard,
- unconditional self-loops are rejected,
- cycles are only allowed when the step or edge has an explicit visit bound such as `max_visits_per_instance`.

In practice, do not try to "prove" every possible conditional loop is safe. Instead, enforce structural rules so obviously unsafe infinite workflows cannot be published.

## 5. Static schema

## 5.1 `workflow_definition`

Top-level business workflow identity.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | stable definition id |
| key | text unique | machine key like `invoice_approval` |
| name | text | display name |
| description | text | business description |
| status | text | `draft`, `active`, `archived` |
| created_by | uuid | creator user id |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## 5.2 `workflow_definition_version`

Immutable versioned snapshot. Runtime instances point here, not to the mutable parent row.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_definition_id | uuid fk | parent definition |
| version_no | int | 1, 2, 3... |
| is_published | bool | only one published version at a time |
| version_label | text | optional semantic label |
| definition_snapshot | jsonb | optional denormalized export |
| graph_json | jsonb | canonical JSON generated from steps and transitions |
| builder_layout | jsonb | React Flow nodes, edges, labels, and viewport |
| created_by | uuid | |
| created_at | timestamptz | |

Unique key: `(workflow_definition_id, version_no)`.

## 5.3 `workflow_step_definition`

This is your "steps section".

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_version_id | uuid fk | |
| step_code | text | unique within a version |
| step_label | text | display label |
| description | text | |
| step_type | text | `human_task`, `system_task`, `subworkflow`, etc. |
| sequence_hint | int | builder ordering only |
| allow_revert | bool | whether revert is valid here |
| remark_required_on_approve | bool | |
| remark_required_on_reject | bool | |
| remark_required_on_revert | bool | |
| max_visits_per_instance | int nullable | loop guard for revisit-heavy steps |
| form_schema | jsonb | optional payload/UI schema |
| config | jsonb | handler config, retry policy, UI config |
| is_terminal | bool | |
| created_at | timestamptz | |

Unique key: `(workflow_version_id, step_code)`.

## 5.4 `workflow_step_association`

This models who can act on a step. Keep it rule-based instead of only direct-user based.
Yes, this associations table should absolutely exist. It is the static source for assignee resolution, while runtime task rows store the resolved assignments for a specific workflow execution.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| step_definition_id | uuid fk | |
| association_type | text | `user`, `role`, `group`, `sql_rule` |
| association_value | text | user id, role key, group key, etc. |
| can_approve | bool | |
| can_reject | bool | |
| can_revert | bool | |
| priority | int | lower number or higher rank based on convention |
| notification_order | int | explicit ordering if different from priority |
| escalation_after_seconds | int nullable | when to notify the next assignee |
| is_active | bool | |
| created_at | timestamptz | |

This makes the design future-proof for RBAC, teams, and dynamic assignees.

## 5.5 `workflow_step_assignment_policy`

This stores the step-level approval and notification strategy.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| step_definition_id | uuid fk unique | |
| approval_mode | text | `priority_chain`, `approve_any_one`, `approve_all`, `notify_all` |
| required_approvals_count | int nullable | useful for future quorum support |
| priority_escalation_enabled | bool | |
| escalation_timeout_seconds | int nullable | default timeout before next assignee is notified |
| reminder_interval_seconds | int nullable | |
| max_escalation_count | int nullable | |
| created_at | timestamptz | |

This table keeps approval strategy separate from the associations themselves. The policy says how the step behaves; the associations say who can participate.

## 5.6 `workflow_transition_definition`

This is your "From / To / description / approve type" section.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_version_id | uuid fk | |
| from_step_definition_id | uuid fk | source step |
| to_step_definition_id | uuid fk nullable | null allowed for terminal transitions |
| action_type | text | `approve`, `reject`, `revert`, `custom` |
| action_code | text | needed for custom actions |
| transition_label | text | label rendered above the edge in the visual builder |
| description | text | |
| condition_expression | text nullable | optional expression on workflow vars |
| priority | int | deterministic resolution |
| created_at | timestamptz | |

Validation rules:

- one transition action can fan out with conditions,
- only one unconditional transition per `from_step + action_type`,
- `custom` requires `action_code`.

## 5.7 `workflow_step_mapping`

This supports your requirement that a step can trigger another workflow.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| step_definition_id | uuid fk unique | only for `subworkflow` steps |
| child_workflow_definition_id | uuid fk | target workflow family |
| child_workflow_version_id | uuid fk nullable | fixed version if needed |
| trigger_mode | text | `sync_wait`, `async_wait` |
| input_mapping | jsonb | parent vars -> child input |
| output_mapping | jsonb | child output -> parent vars |
| completion_action | text | action used on parent when child ends |
| failure_action | text | action used if child fails |
| created_at | timestamptz | |

Default behavior:

- parent step enters `waiting_subworkflow`,
- child instance starts immediately,
- parent resumes only after child reaches a terminal state,
- child output is copied back into parent variables.

## 5.8 `notification_template`

Optional but useful even in the first version.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_version_id | uuid fk | |
| step_definition_id | uuid fk nullable | |
| event_type | text | `task_created`, `reminder`, `completed` |
| channel | text | `in_app` for now |
| title_template | text | user-configurable default title |
| body_template | text | user-configurable default body |
| allow_actor_override | bool | allow builder/user to customize the message |
| supported_variables | jsonb | allowed template placeholders |
| created_at | timestamptz | |

## 6. Runtime schema

## 6.1 `workflow_instance`

Main runtime row for every started workflow.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_version_id | uuid fk | immutable definition reference |
| business_key | text nullable | external correlation id |
| run_number | int | nth execution count for this workflow family/business key |
| status | text | `running`, `waiting`, `paused`, `completed`, `rejected`, `failed`, `cancelled` |
| current_step_instance_id | uuid nullable | current pointer |
| started_by | uuid | actor who started it |
| started_at | timestamptz | |
| completed_at | timestamptz nullable | |
| parent_workflow_instance_id | uuid nullable | for subworkflow |
| parent_step_instance_id | uuid nullable | for subworkflow |
| lock_version | int | optimistic concurrency |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indexes:

- `(status, updated_at)`
- `(business_key)`
- `(parent_workflow_instance_id)`

## 6.2 `workflow_instance_data`

Keep runtime variables separate to avoid bloating the main row.

| column | type | notes |
| --- | --- | --- |
| workflow_instance_id | uuid pk fk | |
| input_data | jsonb | original request payload |
| context_data | jsonb | mutable state bag |
| output_data | jsonb | terminal result |
| last_error | jsonb nullable | |
| updated_at | timestamptz | |

## 6.3 `step_instance`

One row per runtime visit of a step. This is essential because a workflow can revisit the same step after revert.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_instance_id | uuid fk | |
| step_definition_id | uuid fk | |
| attempt_no | int | increment on retries/revisits |
| visit_count | int | count of times this step definition has been entered in the workflow |
| status | text | `pending`, `active`, `waiting`, `completed`, `rejected`, `reverted`, `failed`, `cancelled` |
| entered_at | timestamptz | |
| started_at | timestamptz nullable | |
| completed_at | timestamptz nullable | |
| waiting_since | timestamptz nullable | |
| actor_user_id | uuid nullable | actor who completed the step |
| result_action | text nullable | approve/reject/revert/custom |
| result_payload | jsonb nullable | |
| error_payload | jsonb nullable | |

Indexes:

- `(workflow_instance_id, entered_at)`
- `(status, waiting_since)`

## 6.4 `human_task`

Represents actionable work for users. This is the operational inbox table.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_instance_id | uuid fk | |
| step_instance_id | uuid fk | |
| step_definition_id | uuid fk | |
| assigned_user_id | uuid nullable | direct user assignment |
| assigned_role_key | text nullable | role assignment |
| assigned_group_key | text nullable | group assignment |
| approval_mode_snapshot | text | copied from step policy |
| priority_rank | int nullable | resolved rank for this task |
| sequence_no | int | notification/escalation order |
| status | text | `open`, `claimed`, `completed`, `expired`, `cancelled` |
| available_actions | jsonb | approve/reject/revert/custom |
| due_at | timestamptz nullable | |
| escalation_due_at | timestamptz nullable | |
| claimed_at | timestamptz nullable | |
| completed_at | timestamptz nullable | |
| created_at | timestamptz | |

Indexes:

- `(status, assigned_user_id)`
- `(status, assigned_role_key)`
- `(step_instance_id)`

## 6.5 `workflow_action`

Full immutable audit trail of actions.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_instance_id | uuid fk | |
| step_instance_id | uuid fk nullable | |
| action_type | text | `start`, `approve`, `reject`, `revert`, `system_complete`, etc. |
| action_code | text nullable | custom action code |
| actor_user_id | uuid nullable | null for system actions |
| actor_type | text | `user`, `system`, `worker`, `subworkflow` |
| remark_text | text nullable | user remark captured from the action form |
| payload | jsonb | form data, comments, metadata |
| created_at | timestamptz | |
| idempotency_key | text nullable | protects retries |

Unique key on non-null `idempotency_key`.

## 6.6 `workflow_status_history`

Tracks top-level lifecycle changes for reporting.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_instance_id | uuid fk | |
| old_status | text | |
| new_status | text | |
| reason | text nullable | |
| changed_by_action_id | uuid fk nullable | |
| created_at | timestamptz | |

## 6.7 `subworkflow_link`

Explicit parent-child linkage for resumptions and traceability.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| parent_workflow_instance_id | uuid fk | |
| parent_step_instance_id | uuid fk | |
| child_workflow_instance_id | uuid fk | |
| link_status | text | `running`, `completed`, `failed`, `cancelled` |
| resume_action | text nullable | action applied back to parent |
| linked_at | timestamptz | |
| completed_at | timestamptz nullable | |

## 6.8 `notification`

User-visible in-app notification store.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid | recipient |
| workflow_instance_id | uuid fk nullable | |
| step_instance_id | uuid fk nullable | |
| notification_type | text | `task_assigned`, `reminder`, etc. |
| title | text | |
| body | text | |
| is_read | bool | |
| read_at | timestamptz nullable | |
| created_at | timestamptz | |

## 6.9 `outbox_event`

Required if the database is the source of truth and RabbitMQ is only delivery infrastructure.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| aggregate_type | text | `workflow_instance`, `human_task`, etc. |
| aggregate_id | uuid | |
| event_type | text | |
| payload | jsonb | |
| status | text | `pending`, `published`, `failed` |
| available_at | timestamptz | supports delayed retries |
| published_at | timestamptz nullable | |
| retry_count | int | |
| created_at | timestamptz | |

Workers poll this table, publish to RabbitMQ, then mark published.

## 6.10 `engine_checkpoint`

Optional but recommended for deterministic resume/debugging.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_instance_id | uuid fk | |
| step_instance_id | uuid fk nullable | |
| checkpoint_type | text | `entered_step`, `waiting_user`, `resumed`, etc. |
| snapshot | jsonb | small state snapshot |
| created_at | timestamptz | |

## 6.11 `workflow_counter_rollup`

Optional but recommended for dashboards and quick counts.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| workflow_definition_id | uuid fk | |
| workflow_version_id | uuid fk nullable | |
| started_count | bigint | |
| completed_count | bigint | |
| rejected_count | bigint | |
| failed_count | bigint | |
| active_count | bigint | |
| updated_at | timestamptz | |

## 6.12 `workflow_step_counter_rollup`

Tracks how many times each step has been entered and how it finishes.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| step_definition_id | uuid fk | |
| entered_count | bigint | |
| approved_count | bigint | |
| rejected_count | bigint | |
| reverted_count | bigint | |
| waiting_count | bigint | |
| updated_at | timestamptz | |

## 7. Static vs runtime split

### Static tables

- `workflow_definition`
- `workflow_definition_version`
- `workflow_step_definition`
- `workflow_step_association`
- `workflow_step_assignment_policy`
- `workflow_transition_definition`
- `workflow_step_mapping`
- `notification_template`

### Runtime tables

- `workflow_instance`
- `workflow_instance_data`
- `step_instance`
- `human_task`
- `workflow_action`
- `workflow_status_history`
- `subworkflow_link`
- `notification`
- `outbox_event`
- `engine_checkpoint`
- `workflow_counter_rollup`
- `workflow_step_counter_rollup`

## 8. FastAPI service design

## 8.1 API modules

- `POST /workflow-definitions`
- `POST /workflow-definitions/{id}/versions`
- `POST /workflow-definitions/{id}/publish`
- `GET /workflow-definitions/{id}`
- `POST /workflow-instances`
- `GET /workflow-instances/{id}`
- `GET /workflow-instances/{id}/history`
- `POST /human-tasks/{id}/approve`
- `POST /human-tasks/{id}/reject`
- `POST /human-tasks/{id}/revert`
- `POST /human-tasks/{id}/actions/{action_code}`
- `GET /me/tasks`
- `GET /me/notifications`
- `POST /notifications/{id}/read`

## 8.2 Backend modules

- `app/api` - route handlers
- `app/models` - SQLAlchemy models
- `app/schemas` - Pydantic schemas
- `app/engine` - workflow executor and transition resolver
- `app/workers` - outbox publisher, task reminder worker, system-step worker
- `app/services` - notification service, assignee resolution service
- `app/db` - session and migration wiring

## 8.3 Engine rules

Core rules for correctness:

- all state changes happen inside transactions,
- action handlers use idempotency keys,
- only one active step instance at a time unless parallelism is explicitly added later,
- a human action updates task, step, workflow, history, and outbox in the same transaction,
- resume logic always reads fresh state from the database,
- queue consumers are retriable and stateless.

## 9. RabbitMQ usage

RabbitMQ should handle asynchronous work such as:

- create in-app notifications,
- send reminders,
- run automatic system steps,
- resume parent workflows after child completion,
- fan out analytics/audit events.

Recommended queues:

- `workflow.engine`
- `workflow.notifications`
- `workflow.reminders`
- `workflow.subworkflow`
- `workflow.dead_letter`

Recommended pattern:

1. commit state to PostgreSQL,
2. insert an `outbox_event`,
3. outbox worker publishes to RabbitMQ,
4. consumer processes event,
5. consumer writes any result back to PostgreSQL.

This prevents losing work if RabbitMQ is unavailable at commit time.

## 10. Next.js frontend plan

Initialize the UI with the requested shadcn preset and build these first screens:

### Admin screens

- workflow definition list
- workflow builder
- workflow visual map tab
- step editor
- transition editor
- version publish page

### Runtime screens

- workflow instance list
- workflow instance detail with timeline
- workflow action history table
- my tasks inbox
- task action drawer with approve/reject/revert
- notification center

### Builder fields

For the step editor, include:

- `step_code`
- `step_label`
- `description`
- `step_type`
- `associations`
- `assignment_policy`
- `notification_message`
- `remark_required_on_approve/reject/revert`
- `max_visits_per_instance`
- `mapping_step` config for child workflow linkage
- optional form payload schema

For the transition editor, include:

- `from_step`
- `to_step`
- `description`
- `approve_type` / `action_type`
- `transition_label`
- optional action code
- optional condition

### Visual builder

Add a separate visual mapping tab that uses React Flow to edit and display:

- nodes from `workflow_step_definition`,
- edges from `workflow_transition_definition`,
- edge labels from `transition_label`,
- node metadata such as pending assignee mode and subworkflow mapping.

The builder should generate a canonical JSON document from steps and transitions and save React Flow coordinates separately so layout changes do not alter workflow semantics.

## 11. Suggested first implementation phases

### Phase 1 - foundation

- remove placeholder Go code,
- set up monorepo,
- create FastAPI app with `uv`,
- create Next.js app with the requested shadcn theme,
- provision Postgres and RabbitMQ locally,
- add base auth/user model assumptions.

### Phase 2 - definition builder

- implement workflow definition tables,
- implement versioning and publishing,
- generate and persist canonical graph JSON plus React Flow layout JSON,
- build the step and transition admin UI,
- add validation to prevent broken graphs and unsafe loops.

### Phase 3 - runtime engine

- implement workflow instance creation,
- implement step entry/exit execution engine,
- implement human task creation,
- implement approve/reject/revert actions,
- persist history and status changes.

### Phase 4 - notifications and waiting

- implement outbox table,
- add RabbitMQ publisher/consumer,
- create in-app notifications,
- add reminder, escalation, and priority-chain notification jobs.

### Phase 5 - subworkflow mapping

- implement subworkflow step type,
- create parent-child linkage,
- map child output back to parent,
- resume parent automatically on child completion.

### Phase 6 - observability and hardening

- metrics and tracing,
- audit reports,
- dead-letter handling,
- concurrency tests,
- retry and idempotency validation.

## 12. Important improvements to add

These are not all required on day one, but they will improve the system significantly.

### Must-have improvements

- workflow versioning with immutable runtime references
- optimistic locking on runtime rows
- idempotency keys for all action endpoints
- full audit log for every action and status change
- outbox pattern instead of direct queue-only publishing
- reminder and SLA support for long-paused workflows
- sequential priority escalation for assignees
- optional remark requirements per action
- role/group assignees instead of only direct-user assignees

### Very valuable next improvements

- delegation and reassignment
- comments and attachments on approvals
- due dates and escalation rules
- workflow simulation/validation before publish
- visual workflow diff and graph validation errors in the builder
- search/filter by workflow status, assignee, and age
- re-open/replay tooling for failed system steps
- webhook integration for external systems

### Enterprise-grade improvements

- multi-tenant partitioning
- row-level security
- encrypted sensitive payload fields
- audit export
- retention/archive policies
- parallel branches and join steps
- BPMN-style visual builder

## 13. Opinions and constraints

### On custom SQL query actions

Treat `custom sql query` with care. Letting arbitrary SQL drive transitions is powerful but risky.

Safer options:

- allow stored function references instead of free-form SQL,
- allow parameterized read-only predicates,
- run custom evaluation in a restricted engine layer,
- audit every configured expression.

Recommended first version:

- support `custom` actions,
- support conditional transitions,
- postpone arbitrary SQL execution until after the rest of the engine is stable.

### On user associations

Do not store only raw user ids in the static design. Store both:

- static assignment rules on definitions,
- resolved assignments on runtime tasks.

That gives flexibility for:

- teams,
- roles,
- future org structures,
- dynamic assignment from workflow data.

## 14. Recommended MVP scope

For the first working MVP, I would ship exactly this:

1. workflow definition + versioning,
2. human task steps,
3. approve/reject/revert transitions,
4. runtime persistence,
5. in-app notifications,
6. RabbitMQ-backed outbox delivery,
7. subworkflow mapping with parent pause/resume,
8. timeline/history screen,
9. my tasks inbox.

That scope is already enough to support long-running business approval flows safely.

## 15. Suggested next implementation move

The clean next step is to scaffold the monorepo and create the database schema and migrations first.

If you want, the next pass can implement:

1. repository cleanup,
2. FastAPI + Next.js scaffolding,
3. initial Postgres schema,
4. first workflow builder screens,
5. first runtime action endpoints.
