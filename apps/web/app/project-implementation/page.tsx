import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"

export const metadata: Metadata = {
  title: "Project Implementation | Workflow Engine Platform",
  description:
    "Implementation reference for the current workflow engine platform: architecture, APIs, update flows, RabbitMQ, and Neon schema.",
}

type NavItem = {
  id: string
  label: string
}

type EndpointDoc = {
  method: "GET" | "POST" | "PUT"
  path: string
  summary: string
  auth: string
  why: string
  requestBody: string | null
  responseBody: string
  notes?: string[]
}

type EndpointGroup = {
  id: string
  title: string
  intro: string
  endpoints: EndpointDoc[]
}

type SchemaTableDoc = {
  name: string
  purpose: string
  columns: string[]
  notes?: string[]
}

type SchemaGroup = {
  id: string
  title: string
  intro: string
  tables: SchemaTableDoc[]
}

const navItems: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "auth-flow", label: "Authentication" },
  { id: "update-handling", label: "Update Handling" },
  { id: "api-system", label: "System APIs" },
  { id: "api-definitions", label: "Workflow Definition APIs" },
  { id: "api-runtime", label: "Runtime APIs" },
  { id: "rabbitmq", label: "RabbitMQ and Outbox" },
  { id: "database-schema", label: "Database Schema" },
  { id: "operations", label: "Operational Commands" },
  { id: "notes", label: "Current Notes" },
]

const workflowDefinitionRequestExample = `{
  "key": "vendor-onboarding",
  "name": "Vendor Onboarding",
  "description": "Collect approvals and risk review before onboarding a vendor.",
  "builderLayout": {
    "nodes": [
      {
        "id": "start",
        "position": { "x": 0, "y": 120 },
        "data": { "label": "Start", "stepType": "start" }
      }
    ],
    "edges": [],
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  },
  "steps": [
    {
      "stepCode": "start",
      "stepLabel": "Start",
      "description": "Entry step",
      "stepType": "start",
      "sequenceHint": 1,
      "allowRevert": false,
      "remarkRequiredOnApprove": false,
      "remarkRequiredOnReject": false,
      "remarkRequiredOnRevert": false,
      "maxVisitsPerInstance": 1,
      "formSchema": {},
      "config": {},
      "isTerminal": false,
      "notificationTemplate": null,
      "subworkflowMapping": null,
      "assignmentPolicy": {
        "approvalMode": "priority_chain",
        "requiredApprovalsCount": null,
        "priorityEscalationEnabled": false,
        "escalationTimeoutSeconds": null,
        "reminderIntervalSeconds": null,
        "maxEscalationCount": null
      },
      "associations": []
    },
    {
      "stepCode": "risk_review",
      "stepLabel": "Risk Review",
      "description": "Assigned to a reviewer",
      "stepType": "human_task",
      "sequenceHint": 2,
      "allowRevert": true,
      "remarkRequiredOnApprove": false,
      "remarkRequiredOnReject": true,
      "remarkRequiredOnRevert": true,
      "maxVisitsPerInstance": 3,
      "formSchema": {},
      "config": {},
      "isTerminal": false,
      "notificationTemplate": {
        "titleTemplate": "Action required: {stepLabel}",
        "bodyTemplate": "Workflow {workflowName} is waiting for {actorEmail}.",
        "allowActorOverride": true
      },
      "subworkflowMapping": null,
      "assignmentPolicy": {
        "approvalMode": "priority_chain",
        "requiredApprovalsCount": null,
        "priorityEscalationEnabled": true,
        "escalationTimeoutSeconds": 86400,
        "reminderIntervalSeconds": 3600,
        "maxEscalationCount": 3
      },
      "associations": [
        {
          "associationType": "user",
          "associationValue": "reviewer1@example.com",
          "canApprove": true,
          "canReject": true,
          "canRevert": true,
          "priority": 1,
          "notificationOrder": 1,
          "escalationAfterSeconds": 86400
        }
      ]
    }
  ],
  "transitions": [
    {
      "fromStepCode": "start",
      "toStepCode": "risk_review",
      "actionType": "approve",
      "actionCode": null,
      "transitionLabel": "Begin review",
      "description": "Start the workflow",
      "conditionExpression": null,
      "priority": 0
    },
    {
      "fromStepCode": "risk_review",
      "toStepCode": null,
      "actionType": "approve",
      "actionCode": null,
      "transitionLabel": "Approved",
      "description": "Workflow completes",
      "conditionExpression": null,
      "priority": 0
    },
    {
      "fromStepCode": "risk_review",
      "toStepCode": null,
      "actionType": "reject",
      "actionCode": null,
      "transitionLabel": "Rejected",
      "description": "Workflow rejects",
      "conditionExpression": null,
      "priority": 0
    }
  ]
}`

const workflowDefinitionResponseExample = `{
  "item": {
    "id": "2de2f9ad-5fb0-4e86-8fcb-03c2952a8d18",
    "key": "vendor-onboarding",
    "name": "Vendor Onboarding",
    "description": "Collect approvals and risk review before onboarding a vendor.",
    "status": "draft",
    "latestVersionId": "d060e9ab-a8c1-4ab9-bf59-f28a535ab76d",
    "latestVersionNo": 1,
    "graphJson": {
      "workflow": {
        "key": "vendor-onboarding",
        "name": "Vendor Onboarding",
        "description": "Collect approvals and risk review before onboarding a vendor."
      },
      "steps": [],
      "transitions": []
    },
    "builderLayout": {
      "nodes": [],
      "edges": [],
      "viewport": { "x": 0, "y": 0, "zoom": 1 }
    },
    "steps": [
      {
        "id": "6f25289f-6535-46ad-99d6-88699f489df3",
        "stepCode": "risk_review",
        "stepLabel": "Risk Review",
        "description": "Assigned to a reviewer",
        "stepType": "human_task",
        "sequenceHint": 2,
        "allowRevert": true,
        "remarkRequiredOnApprove": false,
        "remarkRequiredOnReject": true,
        "remarkRequiredOnRevert": true,
        "maxVisitsPerInstance": 3,
        "formSchema": {},
        "config": {},
        "isTerminal": false,
        "notificationTemplate": {
          "id": "45fcb730-e5bb-476a-b0f4-416227dbb3b9",
          "titleTemplate": "Action required: {stepLabel}",
          "bodyTemplate": "Workflow {workflowName} is waiting for {actorEmail}.",
          "allowActorOverride": true
        },
        "subworkflowMapping": null,
        "assignmentPolicy": {
          "id": "bc1738be-6b8f-4cd9-a0cf-ec7cf6dc6d11",
          "approvalMode": "priority_chain",
          "requiredApprovalsCount": null,
          "priorityEscalationEnabled": true,
          "escalationTimeoutSeconds": 86400,
          "reminderIntervalSeconds": 3600,
          "maxEscalationCount": 3
        },
        "associations": [
          {
            "id": "e417dbd6-7e29-40f6-822d-d869d647d258",
            "associationType": "user",
            "associationValue": "reviewer1@example.com",
            "canApprove": true,
            "canReject": true,
            "canRevert": true,
            "priority": 1,
            "notificationOrder": 1,
            "escalationAfterSeconds": 86400
          }
        ]
      }
    ],
    "transitions": [
      {
        "id": "96927815-5d11-4582-aecc-063f521948f2",
        "fromStepCode": "risk_review",
        "toStepCode": null,
        "actionType": "approve",
        "actionCode": null,
        "transitionLabel": "Approved",
        "description": "Workflow completes",
        "conditionExpression": null,
        "priority": 0
      }
    ]
  }
}`

const workflowCloneRequestExample = `{
  "key": "vendor-onboarding-copy",
  "name": "Vendor Onboarding Copy",
  "description": "Cloned definition for experimentation."
}`

const workflowInstanceStartExample = `{
  "workflowDefinitionId": "2de2f9ad-5fb0-4e86-8fcb-03c2952a8d18",
  "workflowKey": null,
  "businessKey": "vendor-2026-001",
  "inputData": {
    "source": "runtime-console",
    "requesterEmail": "requester@example.com"
  },
  "contextData": {
    "startedFromUi": true,
    "riskLevel": "high"
  }
}`

const workflowInstanceResponseExample = `{
  "item": {
    "id": "eb9ce5f9-8158-4401-9c47-3787d6d7f4c3",
    "workflowDefinitionId": "2de2f9ad-5fb0-4e86-8fcb-03c2952a8d18",
    "workflowDefinitionKey": "vendor-onboarding",
    "workflowDefinitionName": "Vendor Onboarding",
    "workflowVersionId": "d060e9ab-a8c1-4ab9-bf59-f28a535ab76d",
    "businessKey": "vendor-2026-001",
    "runNumber": 1,
    "status": "waiting",
    "currentStepCode": "risk_review",
    "currentStepLabel": "Risk Review",
    "startedBy": "user_123",
    "startedAt": "2026-03-14T11:45:10.171014+00:00",
    "completedAt": null,
    "inputData": {
      "source": "runtime-console",
      "requesterEmail": "requester@example.com"
    },
    "contextData": {
      "startedFromUi": true,
      "riskLevel": "high"
    },
    "outputData": {},
    "graphJson": {},
    "builderLayout": {},
    "steps": [
      {
        "id": "84956d5f-5fa8-4ca7-98d7-7e4d3b286e17",
        "stepCode": "risk_review",
        "stepLabel": "Risk Review",
        "stepType": "human_task",
        "status": "waiting",
        "visitCount": 1,
        "enteredAt": "2026-03-14T11:45:10.211194+00:00",
        "completedAt": null,
        "waitingSince": "2026-03-14T11:45:10.247271+00:00",
        "resultAction": null
      }
    ],
    "actions": [
      {
        "id": "a02a6eaf-0165-42b3-9899-7f11e801506c",
        "actionType": "start",
        "actionCode": null,
        "actorUserId": "user_123",
        "actorType": "user",
        "remarkText": null,
        "payload": {
          "workflowDefinitionKey": "vendor-onboarding",
          "businessKey": "vendor-2026-001"
        },
        "createdAt": "2026-03-14T11:45:10.189728+00:00"
      }
    ]
  }
}`

const workflowInstancesListResponseExample = `{
  "items": [
    {
      "id": "eb9ce5f9-8158-4401-9c47-3787d6d7f4c3",
      "workflowDefinitionId": "2de2f9ad-5fb0-4e86-8fcb-03c2952a8d18",
      "workflowDefinitionKey": "vendor-onboarding",
      "workflowDefinitionName": "Vendor Onboarding",
      "workflowVersionId": "d060e9ab-a8c1-4ab9-bf59-f28a535ab76d",
      "businessKey": "vendor-2026-001",
      "runNumber": 1,
      "status": "waiting",
      "currentStepCode": "risk_review",
      "currentStepLabel": "Risk Review",
      "startedBy": "user_123",
      "startedAt": "2026-03-14T11:45:10.171014+00:00",
      "completedAt": null
    }
  ]
}`

const taskActionRequestExample = `{
  "actionType": "approve",
  "remark": "Approved after risk validation.",
  "payload": {
    "source": "runtime-console"
  },
  "actionCode": null
}`

const taskActionResponseExample = `{
  "workflowInstanceId": "eb9ce5f9-8158-4401-9c47-3787d6d7f4c3",
  "stepInstanceId": "84956d5f-5fa8-4ca7-98d7-7e4d3b286e17",
  "actionType": "approve",
  "workflowStatus": "completed",
  "nextStepCode": null
}`

const tasksListResponseExample = `{
  "items": [
    {
      "id": "e35c1f9d-914c-4ed6-a85b-75e5d4056d60",
      "workflowInstanceId": "eb9ce5f9-8158-4401-9c47-3787d6d7f4c3",
      "stepInstanceId": "84956d5f-5fa8-4ca7-98d7-7e4d3b286e17",
      "stepDefinitionId": "6f25289f-6535-46ad-99d6-88699f489df3",
      "stepCode": "risk_review",
      "stepLabel": "Risk Review",
      "assignedUserId": "user_reviewer_1",
      "assignedRoleKey": null,
      "assignedGroupKey": null,
      "approvalModeSnapshot": "priority_chain",
      "priorityRank": 1,
      "sequenceNo": 1,
      "status": "open",
      "availableActions": ["approve", "reject", "revert"],
      "dueAt": null,
      "escalationDueAt": null,
      "createdAt": "2026-03-14T11:45:10.236128+00:00"
    }
  ]
}`

const notificationsListResponseExample = `{
  "items": [
    {
      "id": "1c78133d-a270-46d8-a08e-0b9252255b85",
      "workflowInstanceId": "eb9ce5f9-8158-4401-9c47-3787d6d7f4c3",
      "stepInstanceId": "84956d5f-5fa8-4ca7-98d7-7e4d3b286e17",
      "notificationType": "task_assigned",
      "title": "Action required: Risk Review",
      "body": "Workflow Vendor Onboarding is waiting for reviewer1@example.com.",
      "isRead": false,
      "readAt": null,
      "createdAt": "2026-03-14T11:45:10.244109+00:00"
    }
  ]
}`

const notificationReadResponseExample = `{
  "id": "1c78133d-a270-46d8-a08e-0b9252255b85",
  "workflowInstanceId": "eb9ce5f9-8158-4401-9c47-3787d6d7f4c3",
  "stepInstanceId": "84956d5f-5fa8-4ca7-98d7-7e4d3b286e17",
  "notificationType": "task_assigned",
  "title": "Action required: Risk Review",
  "body": "Workflow Vendor Onboarding is waiting for reviewer1@example.com.",
  "isRead": true,
  "readAt": "2026-03-14T12:04:15.110129+00:00",
  "createdAt": "2026-03-14T11:45:10.244109+00:00"
}`

const systemEndpointGroups: EndpointGroup[] = [
  {
    id: "api-system",
    title: "System and Foundation APIs",
    intro:
      "These endpoints expose service health, identity introspection, and a small stack snapshot used by the UI.",
    endpoints: [
      {
        method: "GET",
        path: "/",
        summary: "Service root endpoint.",
        auth: "Public",
        why: "Confirms the FastAPI service is up and reports the configured app metadata.",
        requestBody: null,
        responseBody: `{
  "service": "workflow-engine-api",
  "environment": "development",
  "message": "Workflow Engine API foundation is running."
}`,
      },
      {
        method: "GET",
        path: "/healthz",
        summary: "Health check endpoint.",
        auth: "Public",
        why: "Exposes health and whether the core dependencies are configured at the environment level.",
        requestBody: null,
        responseBody: `{
  "status": "ok",
  "webAppUrl": "http://localhost:3000",
  "rabbitmqConfigured": true,
  "databaseConfigured": true
}`,
      },
      {
        method: "GET",
        path: "/api/v1/me",
        summary: "Returns the current Better Auth identity as seen by FastAPI.",
        auth: "Bearer JWT required",
        why: "Used to verify that Better Auth JWT issuance from Next.js and JWT validation inside FastAPI are aligned.",
        requestBody: null,
        responseBody: `{
  "userId": "user_123",
  "email": "manager@example.com",
  "claims": {
    "sub": "user_123",
    "email": "manager@example.com",
    "aud": "http://localhost:3000",
    "iss": "http://localhost:3000"
  }
}`,
      },
      {
        method: "GET",
        path: "/api/v1/foundation",
        summary: "Returns a static foundation capability snapshot.",
        auth: "Public",
        why: "Gives the web app and developers a quick declaration of the current foundation slice.",
        requestBody: null,
        responseBody: `{
  "status": "active",
  "stack": {
    "api": "FastAPI",
    "frontend": "Next.js",
    "auth": "Better Auth",
    "queue": "RabbitMQ",
    "database": "PostgreSQL"
  },
  "capabilities": [
    "better-auth-jwt-verification",
    "react-flow-workflow-preview",
    "email-password-login-shell",
    "workflow-definition-crud",
    "runtime-task-actions",
    "docker-compose-infra"
  ],
  "webAppUrl": "http://localhost:3000"
}`,
      },
    ],
  },
]

const workflowEndpointGroups: EndpointGroup[] = [
  {
    id: "api-definitions",
    title: "Workflow Definition APIs",
    intro:
      "These endpoints manage the design-time model. The API stores canonical JSON snapshots, derived graph JSON, and builder layout state independently so UX changes do not change execution semantics.",
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/workflow-definitions",
        summary: "List workflow definitions with latest version summary.",
        auth: "Bearer JWT required",
        why: "Used by the builder and runtime console to list all saved workflow definitions.",
        requestBody: null,
        responseBody: `{
  "items": [
    {
      "id": "2de2f9ad-5fb0-4e86-8fcb-03c2952a8d18",
      "key": "vendor-onboarding",
      "name": "Vendor Onboarding",
      "description": "Collect approvals and risk review before onboarding a vendor.",
      "status": "active",
      "latestVersionId": "d060e9ab-a8c1-4ab9-bf59-f28a535ab76d",
      "latestVersionNo": 3,
      "stepCount": 6,
      "transitionCount": 8
    }
  ]
}`,
      },
      {
        method: "GET",
        path: "/api/v1/workflow-definitions/{definition_id}",
        summary: "Get a fully expanded workflow definition.",
        auth: "Bearer JWT required",
        why: "Loads the latest version with steps, transitions, assignment policies, notification templates, and associations.",
        requestBody: null,
        responseBody: workflowDefinitionResponseExample,
      },
      {
        method: "POST",
        path: "/api/v1/workflow-definitions",
        summary: "Create a workflow definition and insert version 1.",
        auth: "Bearer JWT required",
        why: "Creates the definition row, validates the graph, stores the definition snapshot, and inserts all step-level records.",
        requestBody: workflowDefinitionRequestExample,
        responseBody: workflowDefinitionResponseExample,
        notes: [
          "Returns HTTP 201 on success.",
          "Returns HTTP 409 if the workflow key already exists.",
          "Returns HTTP 422 if validation fails, for example duplicate step codes or invalid transitions.",
        ],
      },
      {
        method: "PUT",
        path: "/api/v1/workflow-definitions/{definition_id}",
        summary: "Update a workflow definition and create a new version.",
        auth: "Bearer JWT required",
        why: "Preserves version history by inserting a new workflow_definition_version instead of mutating prior versions in place.",
        requestBody: workflowDefinitionRequestExample,
        responseBody: workflowDefinitionResponseExample,
        notes: [
          "The definition row key, name, and description are updated.",
          "A brand new version is inserted with its own steps and transitions.",
        ],
      },
      {
        method: "POST",
        path: "/api/v1/workflow-definitions/{definition_id}/publish",
        summary: "Publish the latest version for a definition.",
        auth: "Bearer JWT required",
        why: "Marks all previous versions as unpublished, sets the newest version as published, and flips the definition status to active.",
        requestBody: null,
        responseBody: workflowDefinitionResponseExample,
      },
      {
        method: "POST",
        path: "/api/v1/workflow-definitions/{definition_id}/clone",
        summary: "Clone the latest definition into a new draft definition.",
        auth: "Bearer JWT required",
        why: "Provides a safe way to fork an existing workflow without mutating the original definition history.",
        requestBody: workflowCloneRequestExample,
        responseBody: workflowDefinitionResponseExample,
        notes: [
          "Returns HTTP 201 on success.",
          "The cloned definition starts in draft status.",
        ],
      },
    ],
  },
]

const runtimeEndpointGroups: EndpointGroup[] = [
  {
    id: "api-runtime",
    title: "Runtime APIs",
    intro:
      "These endpoints operate on live workflow instances, human tasks, notifications, and action history. All runtime writes use PostgreSQL as the source of truth and append audit rows alongside the main state changes.",
    endpoints: [
      {
        method: "POST",
        path: "/api/v1/workflow-instances",
        summary: "Start a workflow instance.",
        auth: "Bearer JWT required",
        why: "Creates a workflow_instance row, stores input and context, records a start action, appends status history, and enters the first step.",
        requestBody: workflowInstanceStartExample,
        responseBody: workflowInstanceResponseExample,
        notes: [
          "Either workflowDefinitionId or workflowKey must be present.",
          "Run number increments for the same business key and version.",
        ],
      },
      {
        method: "GET",
        path: "/api/v1/workflow-instances",
        summary: "List workflow instances.",
        auth: "Bearer JWT required",
        why: "Used by the runtime console to show the current execution fleet.",
        requestBody: null,
        responseBody: workflowInstancesListResponseExample,
      },
      {
        method: "GET",
        path: "/api/v1/workflow-instances/{workflow_instance_id}",
        summary: "Get a full workflow instance detail view.",
        auth: "Bearer JWT required",
        why: "Returns builder graph, input/context/output payloads, step visit history, and action history for investigation or UI drill-down.",
        requestBody: null,
        responseBody: workflowInstanceResponseExample,
      },
      {
        method: "GET",
        path: "/api/v1/me/tasks",
        summary: "List the current user inbox of human tasks.",
        auth: "Bearer JWT required",
        why: "Drives the runtime console task inbox and respects direct user assignment, email assignment, and the generic role key user.",
        requestBody: null,
        responseBody: tasksListResponseExample,
      },
      {
        method: "POST",
        path: "/api/v1/human-tasks/{task_id}/actions",
        summary: "Submit an action against an open human task.",
        auth: "Bearer JWT required",
        why: "This is the canonical runtime action endpoint and handles approval mode logic, workflow transitions, notification creation, and outbox recording.",
        requestBody: taskActionRequestExample,
        responseBody: taskActionResponseExample,
        notes: [
          "Reject and revert can fail with HTTP 422 if no matching transition exists.",
          "HTTP 409 is returned if the task is not open.",
          "HTTP 403 is returned if the authenticated user is not the task assignee.",
        ],
      },
      {
        method: "POST",
        path: "/api/v1/human-tasks/{task_id}/approve",
        summary: "Approve a task through the alias endpoint.",
        auth: "Bearer JWT required",
        why: "Provides a semantic shortcut endpoint. The server overwrites payload.actionType with approve.",
        requestBody: taskActionRequestExample,
        responseBody: taskActionResponseExample,
        notes: [
          "Same response contract as the generic actions endpoint.",
        ],
      },
      {
        method: "POST",
        path: "/api/v1/human-tasks/{task_id}/reject",
        summary: "Reject a task through the alias endpoint.",
        auth: "Bearer JWT required",
        why: "Provides a semantic shortcut endpoint. The server overwrites payload.actionType with reject.",
        requestBody: taskActionRequestExample.replace('"approve"', '"reject"'),
        responseBody: taskActionResponseExample.replace('"approve"', '"reject"').replace('"completed"', '"rejected"'),
      },
      {
        method: "POST",
        path: "/api/v1/human-tasks/{task_id}/revert",
        summary: "Revert a task through the alias endpoint.",
        auth: "Bearer JWT required",
        why: "Provides a semantic shortcut endpoint. The server overwrites payload.actionType with revert.",
        requestBody: taskActionRequestExample.replace('"approve"', '"revert"'),
        responseBody: taskActionResponseExample.replace('"approve"', '"revert"').replace('"completed"', '"waiting"'),
      },
      {
        method: "GET",
        path: "/api/v1/me/notifications",
        summary: "List in-app notifications for the authenticated user.",
        auth: "Bearer JWT required",
        why: "The runtime console reads this endpoint to show notification history created by workflow actions and escalation handling.",
        requestBody: null,
        responseBody: notificationsListResponseExample,
      },
      {
        method: "POST",
        path: "/api/v1/notifications/{notification_id}/read",
        summary: "Mark a notification as read.",
        auth: "Bearer JWT required",
        why: "Updates the read state in Neon so the runtime console can render unread counts correctly.",
        requestBody: null,
        responseBody: notificationReadResponseExample,
      },
    ],
  },
]

const schemaGroups: SchemaGroup[] = [
  {
    id: "database-schema",
    title: "Database Schema",
    intro:
      "The schema is bootstrapped from infra/postgres/init/01_foundation.sql into Neon. The platform keeps authentication, definition modeling, runtime state, and messaging records in the same database.",
    tables: [],
  },
  {
    id: "schema-auth",
    title: "Authentication Tables",
    intro: "Better Auth persists its own identity, session, provider, verification, and key material tables.",
    tables: [
      {
        name: "user",
        purpose: "Primary identity table used by Better Auth and referenced by workflow records.",
        columns: [
          "id text primary key",
          "name text not null",
          "email text unique not null",
          "emailVerified boolean",
          "image text",
          "role text default user",
          "displayName text",
          "isTestUser boolean",
          "createdAt / updatedAt timestamptz",
        ],
      },
      {
        name: "session",
        purpose: "Stores active Better Auth sessions.",
        columns: [
          "id text primary key",
          "userId text references user(id)",
          "token text unique",
          "expiresAt timestamptz",
          "ipAddress text",
          "userAgent text",
          "createdAt / updatedAt timestamptz",
        ],
      },
      {
        name: "account",
        purpose: "Stores provider-level account bindings and credential material.",
        columns: [
          "id text primary key",
          "userId text references user(id)",
          "accountId text",
          "providerId text",
          "accessToken / refreshToken / idToken text",
          "accessTokenExpiresAt / refreshTokenExpiresAt timestamptz",
          "scope text",
          "password text",
          "unique(providerId, accountId)",
        ],
      },
      {
        name: "verification",
        purpose: "Stores verification tokens and expiry metadata for Better Auth flows.",
        columns: [
          "id text primary key",
          "identifier text",
          "value text",
          "expiresAt timestamptz",
          "createdAt / updatedAt timestamptz",
        ],
      },
      {
        name: "jwks",
        purpose: "Stores public and private key material for Better Auth JWT signing.",
        columns: [
          "id text primary key",
          "publicKey text",
          "privateKey text",
          "createdAt timestamptz",
          "expiresAt timestamptz",
        ],
      },
    ],
  },
  {
    id: "schema-definitions",
    title: "Workflow Definition Modeling Tables",
    intro:
      "These tables hold the design-time workflow model, including versioning, step metadata, transitions, assignee policy, subworkflow mappings, and notification templates.",
    tables: [
      {
        name: "workflow_definition",
        purpose: "Root definition record for a workflow key.",
        columns: [
          "id uuid primary key",
          "key text unique not null",
          "name text not null",
          "description text",
          "status text default draft",
          "created_by text references user(id)",
          "created_at / updated_at timestamptz",
        ],
        notes: [
          "One logical workflow can have many versions.",
        ],
      },
      {
        name: "workflow_definition_version",
        purpose: "Immutable version rows for each definition.",
        columns: [
          "id uuid primary key",
          "workflow_definition_id uuid references workflow_definition(id)",
          "version_no integer",
          "is_published boolean",
          "version_label text",
          "definition_snapshot jsonb",
          "graph_json jsonb",
          "builder_layout jsonb",
          "created_by text references user(id)",
          "unique(workflow_definition_id, version_no)",
        ],
        notes: [
          "definition_snapshot stores the original request payload.",
          "graph_json stores execution-friendly graph content.",
          "builder_layout stores node positions and viewport state.",
        ],
      },
      {
        name: "workflow_step_definition",
        purpose: "Step records for a specific workflow version.",
        columns: [
          "id uuid primary key",
          "workflow_version_id uuid references workflow_definition_version(id)",
          "step_code text",
          "step_label text",
          "description text",
          "step_type text",
          "sequence_hint integer",
          "allow_revert boolean",
          "remark_required_on_approve / reject / revert boolean",
          "max_visits_per_instance integer",
          "form_schema jsonb",
          "config jsonb",
          "is_terminal boolean",
          "unique(workflow_version_id, step_code)",
        ],
      },
      {
        name: "workflow_step_association",
        purpose: "Assignee routing rows for each step.",
        columns: [
          "id uuid primary key",
          "step_definition_id uuid references workflow_step_definition(id)",
          "association_type text",
          "association_value text",
          "can_approve / can_reject / can_revert boolean",
          "priority integer",
          "notification_order integer",
          "escalation_after_seconds integer",
          "is_active boolean",
          "created_at timestamptz",
        ],
      },
      {
        name: "workflow_step_assignment_policy",
        purpose: "Approval strategy metadata for a step.",
        columns: [
          "id uuid primary key",
          "step_definition_id uuid unique references workflow_step_definition(id)",
          "approval_mode text",
          "required_approvals_count integer",
          "priority_escalation_enabled boolean",
          "escalation_timeout_seconds integer",
          "reminder_interval_seconds integer",
          "max_escalation_count integer",
          "created_at timestamptz",
        ],
      },
      {
        name: "workflow_transition_definition",
        purpose: "Transition edges for a workflow version.",
        columns: [
          "id uuid primary key",
          "workflow_version_id uuid references workflow_definition_version(id)",
          "from_step_definition_id uuid",
          "to_step_definition_id uuid nullable",
          "action_type text",
          "action_code text",
          "transition_label text",
          "description text",
          "condition_expression text",
          "priority integer",
          "created_at timestamptz",
        ],
        notes: [
          "A nullable to_step_definition_id represents a terminal outcome.",
        ],
      },
      {
        name: "workflow_step_mapping",
        purpose: "Subworkflow mapping configuration for subworkflow steps.",
        columns: [
          "id uuid primary key",
          "step_definition_id uuid unique references workflow_step_definition(id)",
          "child_workflow_definition_id uuid nullable",
          "child_workflow_version_id uuid nullable",
          "trigger_mode text",
          "input_mapping jsonb",
          "output_mapping jsonb",
          "completion_action text",
          "failure_action text",
          "created_at timestamptz",
        ],
      },
      {
        name: "notification_template",
        purpose: "Step-level notification templates used for task creation alerts.",
        columns: [
          "id uuid primary key",
          "workflow_version_id uuid references workflow_definition_version(id)",
          "step_definition_id uuid nullable",
          "event_type text",
          "channel text default in_app",
          "title_template text",
          "body_template text",
          "allow_actor_override boolean",
          "supported_variables jsonb",
          "created_at timestamptz",
        ],
      },
    ],
  },
  {
    id: "schema-runtime",
    title: "Runtime Execution Tables",
    intro:
      "These tables are the source of truth for every running workflow, step visit, human task, action, notification, and subworkflow relationship.",
    tables: [
      {
        name: "workflow_instance",
        purpose: "One row per workflow execution.",
        columns: [
          "id uuid primary key",
          "workflow_version_id uuid references workflow_definition_version(id)",
          "business_key text",
          "run_number integer",
          "status text",
          "current_step_instance_id uuid",
          "started_by text references user(id)",
          "started_at / completed_at timestamptz",
          "parent_workflow_instance_id uuid nullable",
          "parent_step_instance_id uuid nullable",
          "lock_version integer",
          "created_at / updated_at timestamptz",
        ],
      },
      {
        name: "workflow_instance_data",
        purpose: "Payload store for workflow input, evolving context, output, and last error.",
        columns: [
          "workflow_instance_id uuid primary key references workflow_instance(id)",
          "input_data jsonb",
          "context_data jsonb",
          "output_data jsonb",
          "last_error jsonb nullable",
          "updated_at timestamptz",
        ],
      },
      {
        name: "step_instance",
        purpose: "One row per visit of a step during a workflow instance.",
        columns: [
          "id uuid primary key",
          "workflow_instance_id uuid references workflow_instance(id)",
          "step_definition_id uuid references workflow_step_definition(id)",
          "attempt_no integer",
          "visit_count integer",
          "status text",
          "entered_at / started_at / completed_at timestamptz",
          "waiting_since timestamptz",
          "actor_user_id text references user(id)",
          "result_action text",
          "result_payload jsonb",
          "error_payload jsonb",
        ],
      },
      {
        name: "human_task",
        purpose: "User-facing action items generated when a workflow waits on human work.",
        columns: [
          "id uuid primary key",
          "workflow_instance_id uuid references workflow_instance(id)",
          "step_instance_id uuid references step_instance(id)",
          "step_definition_id uuid references workflow_step_definition(id)",
          "assigned_user_id text nullable references user(id)",
          "assigned_role_key text",
          "assigned_group_key text",
          "approval_mode_snapshot text",
          "priority_rank integer",
          "sequence_no integer",
          "status text",
          "available_actions jsonb",
          "due_at timestamptz",
          "escalation_due_at timestamptz",
          "claimed_at / completed_at timestamptz",
          "created_at timestamptz",
        ],
      },
      {
        name: "workflow_action",
        purpose: "Auditable action history for starts and user actions.",
        columns: [
          "id uuid primary key",
          "workflow_instance_id uuid references workflow_instance(id)",
          "step_instance_id uuid nullable references step_instance(id)",
          "action_type text",
          "action_code text",
          "actor_user_id text nullable references user(id)",
          "actor_type text",
          "remark_text text",
          "payload jsonb",
          "created_at timestamptz",
          "idempotency_key text unique",
        ],
      },
      {
        name: "workflow_status_history",
        purpose: "Tracks workflow-level status changes over time.",
        columns: [
          "id uuid primary key",
          "workflow_instance_id uuid references workflow_instance(id)",
          "old_status text",
          "new_status text",
          "reason text",
          "changed_by_action_id uuid nullable references workflow_action(id)",
          "created_at timestamptz",
        ],
      },
      {
        name: "subworkflow_link",
        purpose: "Connects parent and child workflow instances when a subworkflow step is used.",
        columns: [
          "id uuid primary key",
          "parent_workflow_instance_id uuid references workflow_instance(id)",
          "parent_step_instance_id uuid references step_instance(id)",
          "child_workflow_instance_id uuid references workflow_instance(id)",
          "link_status text",
          "resume_action text",
          "linked_at timestamptz",
          "completed_at timestamptz",
        ],
      },
      {
        name: "notification",
        purpose: "In-app notification center records for users.",
        columns: [
          "id uuid primary key",
          "user_id text references user(id)",
          "workflow_instance_id uuid nullable references workflow_instance(id)",
          "step_instance_id uuid nullable references step_instance(id)",
          "notification_type text",
          "title text",
          "body text",
          "is_read boolean",
          "read_at timestamptz",
          "created_at timestamptz",
        ],
      },
    ],
  },
  {
    id: "schema-messaging",
    title: "Messaging and Integration Tables",
    intro:
      "RabbitMQ is not the primary state store. The database remains authoritative, and the outbox table acts as the handoff point into the queue.",
    tables: [
      {
        name: "outbox_event",
        purpose: "Durable event handoff table for asynchronous publishing to RabbitMQ.",
        columns: [
          "id uuid primary key",
          "aggregate_type text",
          "aggregate_id uuid",
          "event_type text",
          "payload jsonb",
          "status text default pending",
          "available_at timestamptz",
          "published_at timestamptz",
          "retry_count integer",
          "created_at timestamptz",
        ],
        notes: [
          "Pending rows are published by apps/api/scripts/publish_outbox.py.",
        ],
      },
    ],
  },
]

function methodClasses(method: EndpointDoc["method"]) {
  if (method === "GET") {
    return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
  }
  if (method === "POST") {
    return "bg-sky-500/10 text-sky-700 ring-sky-500/20"
  }
  return "bg-amber-500/10 text-amber-700 ring-amber-500/20"
}

function CodePanel({ title, code }: { title: string; code: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <pre className="overflow-x-auto rounded-2xl border border-zinc-900/80 bg-zinc-950 px-4 py-4 text-[13px] leading-6 text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function EndpointCard({ endpoint }: { endpoint: EndpointDoc }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${methodClasses(endpoint.method)}`}
            >
              {endpoint.method}
            </span>
            <code className="rounded-md bg-muted px-2 py-1 text-sm">{endpoint.path}</code>
          </div>
          <h3 className="text-xl font-semibold tracking-tight">{endpoint.summary}</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">{endpoint.why}</p>
        </div>
        <Badge variant="outline">{endpoint.auth}</Badge>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          {endpoint.requestBody ? (
            <CodePanel title="Request body" code={endpoint.requestBody} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
              This endpoint does not accept a request body.
            </div>
          )}
        </div>
        <CodePanel title="Response body" code={endpoint.responseBody} />
      </div>

      {endpoint.notes?.length ? (
        <div className="mt-5 rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Notes
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {endpoint.notes.map((note) => (
              <li key={note} className="list-inside list-disc">
                {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function SchemaCard({ table }: { table: SchemaTableDoc }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm">
      <div className="space-y-2 border-b border-border/60 pb-4">
        <code className="text-sm text-primary">{table.name}</code>
        <p className="text-base text-foreground">{table.purpose}</p>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Key columns
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {table.columns.map((column) => (
            <li key={column} className="list-inside list-disc">
              {column}
            </li>
          ))}
        </ul>
        {table.notes?.length ? (
          <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Notes
            </p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {table.notes.map((note) => (
                <li key={note} className="list-inside list-disc">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</p>
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-4xl text-base leading-7 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default async function ProjectImplementationPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/sign-in")
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.10),_transparent_30%)] px-4 py-8 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[32px] border border-border/70 bg-background/90 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="border-b border-border/70 px-6 py-6 md:px-8 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Internal Implementation Reference</Badge>
                  <Badge variant="outline">Neon + FastAPI + Next.js + RabbitMQ</Badge>
                  <Badge variant="outline">Signed in as {session.user.email}</Badge>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
                    Project Implementation
                  </p>
                  <h1 className="max-w-4xl text-4xl font-semibold tracking-tight">
                    Current implementation documentation for the workflow engine platform.
                  </h1>
                  <p className="max-w-4xl text-base leading-7 text-muted-foreground">
                    This page documents the live implementation in this repository: the current
                    architecture, every HTTP API, request and response bodies, Neon schema, RabbitMQ
                    outbox flow, and how the web application updates runtime state today.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/operations">Runtime operations</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/builder">Builder</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-10 px-6 py-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-10">
            <aside className="lg:sticky lg:top-8 lg:self-start">
              <div className="rounded-3xl border border-border/70 bg-muted/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  On this page
                </p>
                <nav className="mt-4 space-y-1">
                  {navItems.map((item) => (
                    <a
                      className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground"
                      href={`#${item.id}`}
                      key={item.id}
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            <article className="space-y-16">
              <section className="scroll-mt-24 space-y-8" id="overview">
                <SectionHeader
                  eyebrow="Overview"
                  title="What is implemented right now"
                  description="The platform is a modular workflow engine foundation. Next.js handles session-based product UI, FastAPI exposes protected workflow APIs, Neon stores all durable state, and RabbitMQ is used as a downstream event transport through an outbox pattern."
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-5">
                    <p className="text-sm font-medium text-muted-foreground">Frontend</p>
                    <p className="mt-2 text-lg font-semibold">Next.js 16 + shadcn/ui</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Builder, runtime console, and authenticated pages live in the web app.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-5">
                    <p className="text-sm font-medium text-muted-foreground">API</p>
                    <p className="mt-2 text-lg font-semibold">FastAPI + Better Auth JWT verification</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      FastAPI verifies Better Auth JWTs emitted by the Next.js app and serves all workflow APIs.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-5">
                    <p className="text-sm font-medium text-muted-foreground">Database</p>
                    <p className="mt-2 text-lg font-semibold">Neon PostgreSQL</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The database is the source of truth for design-time, runtime, notifications, and outbox events.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-5">
                    <p className="text-sm font-medium text-muted-foreground">Queue</p>
                    <p className="mt-2 text-lg font-semibold">RabbitMQ topic exchange</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Queue delivery is fed by the outbox publisher script rather than direct writes inside request transactions.
                    </p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-card/90 p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Design choices
                  </p>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                    <li className="list-inside list-disc">
                      Workflow definitions are versioned so edits create new immutable versions.
                    </li>
                    <li className="list-inside list-disc">
                      Builder layout is stored separately from execution graph data so visual edits
                      do not change runtime semantics.
                    </li>
                    <li className="list-inside list-disc">
                      Runtime writes append audit tables such as workflow_action and
                      workflow_status_history in addition to updating current state.
                    </li>
                    <li className="list-inside list-disc">
                      RabbitMQ is treated as delivery infrastructure, while PostgreSQL remains the
                      authoritative source of truth.
                    </li>
                  </ul>
                </div>
              </section>

              <section className="scroll-mt-24 space-y-8" id="architecture">
                <SectionHeader
                  eyebrow="Architecture"
                  title="Architecture followed in the current implementation"
                  description="The current codebase follows a modular monolith shape with a separate web app and API service over a shared Neon database. Runtime state changes happen in the API transaction first, and asynchronous delivery is split into explicit worker scripts."
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Request path</h3>
                    <ol className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-decimal">
                        The user signs in through Better Auth in Next.js.
                      </li>
                      <li className="list-inside list-decimal">
                        The client obtains a Better Auth JWT via authClient.token().
                      </li>
                      <li className="list-inside list-decimal">
                        The web app calls FastAPI with an Authorization bearer token.
                      </li>
                      <li className="list-inside list-decimal">
                        FastAPI validates the token against the Better Auth JWKS endpoint.
                      </li>
                      <li className="list-inside list-decimal">
                        FastAPI mutates Neon and optionally writes outbox rows in the same transaction.
                      </li>
                    </ol>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Runtime path</h3>
                    <ol className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-decimal">
                        A workflow instance starts from the latest version of a definition.
                      </li>
                      <li className="list-inside list-decimal">
                        The engine creates step_instance rows as it enters steps.
                      </li>
                      <li className="list-inside list-decimal">
                        Human task steps generate human_task rows and in-app notification rows.
                      </li>
                      <li className="list-inside list-decimal">
                        User actions update tasks, step state, workflow state, action audit rows,
                        and outbox records.
                      </li>
                      <li className="list-inside list-decimal">
                        Separate scripts publish pending outbox rows to RabbitMQ or release queued
                        priority-chain tasks.
                      </li>
                    </ol>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-muted/20 p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Storage model
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                      <p className="font-medium">Design-time</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        workflow_definition, workflow_definition_version, steps, transitions, policies, associations, mappings, and notification templates.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                      <p className="font-medium">Runtime</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        workflow_instance, step_instance, human_task, workflow_action, status history, notifications, and subworkflow links.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                      <p className="font-medium">Integration</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        outbox_event stores pending integration messages before publish_outbox.py forwards them to RabbitMQ.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="scroll-mt-24 space-y-8" id="auth-flow">
                <SectionHeader
                  eyebrow="Authentication"
                  title="How authentication is wired"
                  description="The web layer and API are intentionally decoupled. Next.js owns session management, while FastAPI only trusts bearer tokens signed by Better Auth."
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Web application behavior</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        Server-rendered pages call auth.api.getSession() and redirect to sign-in when no session exists.
                      </li>
                      <li className="list-inside list-disc">
                        Client components call authClient.token() to mint a Better Auth JWT for the API.
                      </li>
                      <li className="list-inside list-disc">
                        The runtime console sends the token in the Authorization header on each API call.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">FastAPI behavior</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        HTTPBearer extracts the bearer token from incoming requests.
                      </li>
                      <li className="list-inside list-disc">
                        PyJWKClient loads the JWKS from the Better Auth route configured in settings.better_auth_jwks_url.
                      </li>
                      <li className="list-inside list-disc">
                        The token is validated against issuer and audience before the request reaches the business logic.
                      </li>
                      <li className="list-inside list-disc">
                        FastAPI exposes the decoded subject and email through the AuthenticatedUser dataclass.
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="scroll-mt-24 space-y-8" id="update-handling">
                <SectionHeader
                  eyebrow="Update Handling"
                  title="How every update is handled today"
                  description="The current implementation uses explicit request-driven updates. State changes happen inside FastAPI request transactions, and the web UI refreshes after the relevant mutation completes."
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Definition updates</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        Create inserts workflow_definition and version 1.
                      </li>
                      <li className="list-inside list-disc">
                        Update modifies the root metadata and inserts a new version rather than rewriting the latest one.
                      </li>
                      <li className="list-inside list-disc">
                        Publish marks the newest version as published and sets the definition status to active.
                      </li>
                      <li className="list-inside list-disc">
                        Clone copies the latest definition_snapshot into a new draft definition with a new key and name.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Runtime updates</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        Starting an instance writes workflow_instance, workflow_instance_data,
                        workflow_action, workflow_status_history, and the first step visit.
                      </li>
                      <li className="list-inside list-disc">
                        Entering a human step writes human_task rows, notification rows, and outbox rows for assignment events.
                      </li>
                      <li className="list-inside list-disc">
                        Acting on a task writes workflow_action, updates task status, advances or completes the workflow, and records workflow.action.recorded in the outbox.
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-card/90 p-6">
                  <h3 className="text-xl font-semibold">Approval mode handling</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="font-medium">priority_chain</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        The first assignee opens immediately and later assignees stay queued. A
                        reject can open the next queued assignee. The release script can also move
                        the chain forward after escalation timeouts.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="font-medium">approve_all</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        All assignees can be open at once, but the workflow does not advance until
                        the last required approval completes.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="font-medium">approve_any_one</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Any single approval can advance the workflow. A reject can keep the step in
                        waiting status while other assignees remain available.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-muted/20 p-6">
                  <h3 className="text-xl font-semibold">Current web update model</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                    <li className="list-inside list-disc">
                      The runtime console loads definitions, instances, tasks, and notifications on
                      initial mount.
                    </li>
                    <li className="list-inside list-disc">
                      Starting a workflow instance triggers a full runtime refresh after the API returns.
                    </li>
                    <li className="list-inside list-disc">
                      Submitting a task action refreshes runtime data and then reloads the selected
                      instance detail view.
                    </li>
                    <li className="list-inside list-disc">
                      Marking a notification as read reloads the notifications list.
                    </li>
                    <li className="list-inside list-disc">
                      There is a manual Refresh data button in the runtime console.
                    </li>
                    <li className="list-inside list-disc">
                      The current implementation does not expose an SSE or WebSocket channel; updates
                      are request-driven rather than push-driven.
                    </li>
                  </ul>
                </div>
              </section>

              {systemEndpointGroups.map((group) => (
                <section className="scroll-mt-24 space-y-8" id={group.id} key={group.id}>
                  <SectionHeader
                    eyebrow="API Reference"
                    title={group.title}
                    description={group.intro}
                  />
                  <div className="space-y-6">
                    {group.endpoints.map((endpoint) => (
                      <EndpointCard endpoint={endpoint} key={`${endpoint.method}-${endpoint.path}`} />
                    ))}
                  </div>
                </section>
              ))}

              {workflowEndpointGroups.map((group) => (
                <section className="scroll-mt-24 space-y-8" id={group.id} key={group.id}>
                  <SectionHeader
                    eyebrow="API Reference"
                    title={group.title}
                    description={group.intro}
                  />
                  <div className="space-y-6">
                    {group.endpoints.map((endpoint) => (
                      <EndpointCard endpoint={endpoint} key={`${endpoint.method}-${endpoint.path}`} />
                    ))}
                  </div>
                </section>
              ))}

              {runtimeEndpointGroups.map((group) => (
                <section className="scroll-mt-24 space-y-8" id={group.id} key={group.id}>
                  <SectionHeader
                    eyebrow="API Reference"
                    title={group.title}
                    description={group.intro}
                  />
                  <div className="space-y-6">
                    {group.endpoints.map((endpoint) => (
                      <EndpointCard endpoint={endpoint} key={`${endpoint.method}-${endpoint.path}`} />
                    ))}
                  </div>
                </section>
              ))}

              <section className="scroll-mt-24 space-y-8" id="rabbitmq">
                <SectionHeader
                  eyebrow="RabbitMQ"
                  title="How RabbitMQ is implemented"
                  description="RabbitMQ is currently downstream infrastructure fed by the outbox pattern. The API itself writes outbox rows inside database transactions, and a separate script publishes pending rows to a durable topic exchange."
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Pattern followed</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        PostgreSQL is the source of truth.
                      </li>
                      <li className="list-inside list-disc">
                        outbox_event is the durable handoff table for asynchronous delivery.
                      </li>
                      <li className="list-inside list-disc">
                        publish_outbox.py reads pending rows in batches and publishes them to RabbitMQ.
                      </li>
                      <li className="list-inside list-disc">
                        This avoids coupling database commits directly to queue availability.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">RabbitMQ details</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        Connection URL comes from settings.rabbitmq_url.
                      </li>
                      <li className="list-inside list-disc">
                        The publisher declares exchange workflow.events.
                      </li>
                      <li className="list-inside list-disc">
                        Exchange type is topic and durable is true.
                      </li>
                      <li className="list-inside list-disc">
                        routing_key is the event_type stored in outbox_event.
                      </li>
                      <li className="list-inside list-disc">
                        Messages are published as JSON with delivery_mode 2 for persistence.
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-card/90 p-6">
                  <h3 className="text-xl font-semibold">Outbox event types currently emitted</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <code className="text-sm">notification.created</code>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Emitted when _create_notification inserts an in-app notification row.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <code className="text-sm">human_task.assigned</code>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Emitted when a human task is assigned during step entry or priority-chain progression.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <code className="text-sm">workflow.action.recorded</code>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Emitted after a user task action is committed to runtime state.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <code className="text-sm">human_task.escalated</code>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Emitted by release_priority_tasks.py when the next queued assignee is released.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-border/70 bg-muted/20 p-6">
                  <h3 className="text-xl font-semibold">Current operational shape</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                    <li className="list-inside list-disc">
                      RabbitMQ is started locally with docker compose from infra/docker-compose.yml.
                    </li>
                    <li className="list-inside list-disc">
                      Outbox publish is currently run as an explicit command, not as a long-running background daemon.
                    </li>
                    <li className="list-inside list-disc">
                      Priority-chain escalation release is also command-driven through a script.
                    </li>
                  </ul>
                </div>
              </section>

              <section className="scroll-mt-24 space-y-8" id="database-schema">
                <SectionHeader
                  eyebrow="Schema"
                  title="Neon database schema"
                  description="The schema is intentionally normalized enough to preserve runtime history, auditability, versioned definitions, and durable queue handoff while still being simple to query from the current application."
                />

                {schemaGroups
                  .filter((group) => group.tables.length > 0)
                  .map((group) => (
                    <div className="space-y-6" id={group.id} key={group.id}>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-semibold tracking-tight">{group.title}</h3>
                        <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
                          {group.intro}
                        </p>
                      </div>
                      <div className="space-y-5">
                        {group.tables.map((table) => (
                          <SchemaCard key={table.name} table={table} />
                        ))}
                      </div>
                    </div>
                  ))}
              </section>

              <section className="scroll-mt-24 space-y-8" id="operations">
                <SectionHeader
                  eyebrow="Operations"
                  title="Operational commands and configuration"
                  description="The repository exposes a small set of top-level commands for bootstrapping Neon, starting the API and web app, and running the current queue-related worker scripts."
                />

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Environment files</h3>
                    <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                      <li className="list-inside list-disc">
                        Web app env file: <code>apps/web/.env.local</code>
                      </li>
                      <li className="list-inside list-disc">
                        API env file: <code>apps/api/.env</code>
                      </li>
                      <li className="list-inside list-disc">
                        Both must point to the same Neon database: DATABASE_URL in web and WORKFLOW_DATABASE_URL in api.
                      </li>
                      <li className="list-inside list-disc">
                        Better Auth issuer, audience, and JWKS URL default to the local web app origin.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-border/70 bg-card/90 p-6">
                    <h3 className="text-xl font-semibold">Command reference</h3>
                    <pre className="mt-4 overflow-x-auto rounded-2xl border border-zinc-900/80 bg-zinc-950 px-4 py-4 text-[13px] leading-6 text-zinc-100">
                      <code>{`pnpm bootstrap:db
pnpm dev:api
pnpm dev:web
pnpm --dir apps/web seed:users
pnpm queue:publish
pnpm queue:release
docker compose -f infra/docker-compose.yml up -d`}</code>
                    </pre>
                  </div>
                </div>
              </section>

              <section className="scroll-mt-24 space-y-8" id="notes">
                <SectionHeader
                  eyebrow="Current Notes"
                  title="Important implementation notes"
                  description="These notes describe the current behavior exactly as implemented today so future changes can be documented against a clear baseline."
                />

                <div className="rounded-[28px] border border-border/70 bg-card/90 p-6">
                  <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
                    <li className="list-inside list-disc">
                      The web client currently relies on direct fetches after mutations and a manual refresh action. There is no push channel from FastAPI to the browser in the live code.
                    </li>
                    <li className="list-inside list-disc">
                      RabbitMQ publishing is explicit and batch-based through publish_outbox.py, not continuously streamed by a resident worker process.
                    </li>
                    <li className="list-inside list-disc">
                      Priority-chain escalation release is also explicit and command-driven through release_priority_tasks.py.
                    </li>
                    <li className="list-inside list-disc">
                      All runtime data is stored in Neon first, then optionally propagated downstream through the outbox.
                    </li>
                    <li className="list-inside list-disc">
                      The current APIs are authenticated by Better Auth JWTs, but most runtime list endpoints are not yet scoped by business tenant or organization boundary.
                    </li>
                  </ul>
                </div>
              </section>
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}
