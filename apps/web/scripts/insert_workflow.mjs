import fs from "fs"

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

async function insertWorkflow() {
  // 1. Sign in as admin to get token
  const loginRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { 
      "content-type": "application/json",
      origin: baseUrl,
      referer: `${baseUrl}/sign-in`
    },
    body: JSON.stringify({ email: "admin@example.com", password: "password1234" })
  })
  
  if (!loginRes.ok) {
    console.error("Failed to login as admin", await loginRes.text())
    return
  }
  const loginData = await loginRes.json()
  const token = loginData.token

  // 2. The Complex Workflow Payload
  const steps = [
    {
      stepCode: "start_node", stepLabel: "Submit Request", stepType: "start",
      description: "Entry point of the workflow process", sequenceHint: 0,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: false, notificationTemplate: null, subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: []
    },
    {
      stepCode: "form_validation", stepLabel: "Initial Form Validation", stepType: "human_task",
      description: "Any user can approve the initial form", sequenceHint: 1,
      allowRevert: true, remarkRequiredOnApprove: false, remarkRequiredOnReject: true, remarkRequiredOnRevert: true,
      maxVisitsPerInstance: 3, isTerminal: false,
      notificationTemplate: { titleTemplate: "Validation needed: {stepLabel}", bodyTemplate: "Please validate form.", allowActorOverride: true },
      subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "approve_any_one", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: [
        { associationType: "user", associationValue: "dipesh@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: true },
        { associationType: "user", associationValue: "ram@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: true },
        { associationType: "user", associationValue: "mohan@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: true }
      ]
    },
    {
      stepCode: "priority_review", stepLabel: "Priority Review", stepType: "human_task",
      description: "Review sequentially. Ram first, then Dipesh.", sequenceHint: 2,
      allowRevert: true, remarkRequiredOnApprove: false, remarkRequiredOnReject: true, remarkRequiredOnRevert: true,
      maxVisitsPerInstance: null, isTerminal: false,
      notificationTemplate: { titleTemplate: "Review Needed", bodyTemplate: "Waiting for your review.", allowActorOverride: true },
      subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: true, escalationTimeoutSeconds: 86400, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: [
        { associationType: "user", associationValue: "ram@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: 86400, canApprove: true, canReject: true, canRevert: true },
        { associationType: "user", associationValue: "dipesh@example.com", priority: 2, notificationOrder: 2, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: true }
      ]
    },
    {
      stepCode: "system_risk_check", stepLabel: "System Risk Check", stepType: "system_task",
      description: "Automated risk assessment logic", sequenceHint: 3,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: false, notificationTemplate: null, subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: []
    },
    {
      stepCode: "risk_decision", stepLabel: "High/Low Risk Decision", stepType: "decision",
      description: "Gateway router based on risk score.", sequenceHint: 4,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: false, notificationTemplate: null, subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: []
    },
    {
      stepCode: "high_risk_approval", stepLabel: "High Risk Multi-Approval", stepType: "human_task",
      description: "Requires ALL assignees to approve.", sequenceHint: 5,
      allowRevert: false, remarkRequiredOnApprove: true, remarkRequiredOnReject: true, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: false,
      notificationTemplate: { titleTemplate: "High Risk Action", bodyTemplate: "Please review high risk action.", allowActorOverride: true },
      subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "approve_all", requiredApprovalsCount: 3, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: [
        { associationType: "user", associationValue: "dipesh@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: false },
        { associationType: "user", associationValue: "ram@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: false },
        { associationType: "user", associationValue: "mohan@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: false }
      ]
    },
    {
      stepCode: "notify_stakeholders", stepLabel: "Notify Stakeholders", stepType: "human_task",
      description: "Just informs users, requires someone to acknowledge.", sequenceHint: 6,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: false,
      notificationTemplate: { titleTemplate: "FYI: Risk Approved", bodyTemplate: "Risk was approved.", allowActorOverride: false },
      subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "notify_all", requiredApprovalsCount: 1, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: [
        { associationType: "user", associationValue: "mohan@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: false, canRevert: false }
      ]
    },
    {
      stepCode: "background_subworkflow", stepLabel: "External Verifications", stepType: "subworkflow",
      description: "Spins up a vendor onboarding or similar workflow.", sequenceHint: 7,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: false, notificationTemplate: null,
      subworkflowMapping: { childWorkflowDefinitionId: null, childWorkflowVersionId: null, triggerMode: "sync_wait", inputMapping: { "reason": "background check" }, outputMapping: { "verified": "$.result" }, completionAction: "approve", failureAction: "reject" },
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: []
    },
    {
      stepCode: "final_signoff", stepLabel: "Final Sign-off", stepType: "human_task",
      description: "Final approval step purely by Dipesh.", sequenceHint: 8,
      allowRevert: true, remarkRequiredOnApprove: true, remarkRequiredOnReject: true, remarkRequiredOnRevert: true,
      maxVisitsPerInstance: null, isTerminal: false,
      notificationTemplate: { titleTemplate: "Final Sign Off Ready", bodyTemplate: "Proceed?", allowActorOverride: true },
      subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: [
        { associationType: "user", associationValue: "dipesh@example.com", priority: 1, notificationOrder: 1, escalationAfterSeconds: null, canApprove: true, canReject: true, canRevert: true }
      ]
    },
    {
      stepCode: "completed_success", stepLabel: "Fully Completed", stepType: "end",
      description: "Terminal success step.", sequenceHint: 9,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: true, notificationTemplate: null, subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: []
    },
    {
      stepCode: "aborted", stepLabel: "Aborted / Rejected", stepType: "end",
      description: "Terminal error step.", sequenceHint: 10,
      allowRevert: false, remarkRequiredOnApprove: false, remarkRequiredOnReject: false, remarkRequiredOnRevert: false,
      maxVisitsPerInstance: null, isTerminal: true, notificationTemplate: null, subworkflowMapping: null,
      assignmentPolicy: { approvalMode: "priority_chain", requiredApprovalsCount: null, priorityEscalationEnabled: false, escalationTimeoutSeconds: null, reminderIntervalSeconds: null, maxEscalationCount: null },
      associations: []
    }
  ]

  const transitions = [
    { fromStepCode: "start_node", toStepCode: "form_validation", actionType: "approve", actionCode: null, transitionLabel: "Submit", description: "Start the flow", conditionExpression: null, priority: 0 },
    { fromStepCode: "form_validation", toStepCode: "priority_review", actionType: "approve", actionCode: null, transitionLabel: "Valid", description: "Form looks good", conditionExpression: null, priority: 0 },
    { fromStepCode: "form_validation", toStepCode: "aborted", actionType: "reject", actionCode: null, transitionLabel: "Invalid", description: "Form is broken", conditionExpression: null, priority: 1 },
    { fromStepCode: "priority_review", toStepCode: "form_validation", actionType: "revert", actionCode: null, transitionLabel: "Needs Changes", description: "Send back for fixes", conditionExpression: null, priority: 0 },
    { fromStepCode: "priority_review", toStepCode: "system_risk_check", actionType: "approve", actionCode: null, transitionLabel: "Approved", description: "Agreed", conditionExpression: null, priority: 1 },
    { fromStepCode: "system_risk_check", toStepCode: "risk_decision", actionType: "approve", actionCode: null, transitionLabel: "Computed", description: "Risk evaluated", conditionExpression: null, priority: 0 },
    { fromStepCode: "risk_decision", toStepCode: "high_risk_approval", actionType: "approve", actionCode: null, transitionLabel: "High Risk", description: "Risk Score > 80", conditionExpression: "$.risk_score > 80", priority: 1 },
    { fromStepCode: "risk_decision", toStepCode: "background_subworkflow", actionType: "approve", actionCode: null, transitionLabel: "Low Risk", description: "Risk Score <= 80", conditionExpression: "$.risk_score <= 80", priority: 2 },
    { fromStepCode: "high_risk_approval", toStepCode: "notify_stakeholders", actionType: "approve", actionCode: null, transitionLabel: "All Assessed", description: "All 3 approved it", conditionExpression: null, priority: 0 },
    { fromStepCode: "notify_stakeholders", toStepCode: "background_subworkflow", actionType: "approve", actionCode: null, transitionLabel: "Acknowledged", description: "Move onto verification", conditionExpression: null, priority: 0 },
    { fromStepCode: "background_subworkflow", toStepCode: "final_signoff", actionType: "approve", actionCode: null, transitionLabel: "Verified OK", description: "Subworkflow ended", conditionExpression: null, priority: 0 },
    { fromStepCode: "background_subworkflow", toStepCode: "aborted", actionType: "reject", actionCode: null, transitionLabel: "Failed Check", description: "Vendor failed", conditionExpression: null, priority: 1 },
    { fromStepCode: "final_signoff", toStepCode: "completed_success", actionType: "approve", actionCode: null, transitionLabel: "Finalize Request", description: "Done", conditionExpression: null, priority: 0 },
    { fromStepCode: "final_signoff", toStepCode: "aborted", actionType: "reject", actionCode: null, transitionLabel: "Veto", description: "Killed at last step", conditionExpression: null, priority: 1 }
  ]

  // Graph Layout helper
  const nodes = steps.map((step, idx) => ({ id: step.stepCode, position: { x: (idx % 3) * 220, y: Math.floor(idx / 3) * 150 }, data: { label: step.stepLabel }, style: { width: 170, borderRadius: 18, border: "1px solid color-mix(in oklab, var(--border) 85%, transparent)", background: "var(--card)", color: "var(--card-foreground)", fontSize: 13, fontWeight: 600, padding: 12, boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)" } }))
  const edges = transitions.map(t => ({ id: `${t.fromStepCode}-${t.actionType}-${t.toStepCode}`, source: t.fromStepCode, target: t.toStepCode, label: t.transitionLabel, animated: t.actionType === "approve", style: { strokeWidth: 1.5 }, labelStyle: { fill: "white", fontSize: 12, fontWeight: 600 } }))

  const payload = {
    key: "complex_enterprise_process",
    name: "Complex Enterprise Process 2",
    description: "Multi-layered workflow demonstrating every step type, assignments, and API transitions.",
    builderLayout: { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } },
    steps,
    transitions
  }

  const pushRes = await fetch(`${apiBaseUrl}/api/v1/workflow-definitions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  if (!pushRes.ok) {
    console.error("Failed to save workflow definition:", pushRes.status, await pushRes.text())
  } else {
    const data = await pushRes.json()
    console.log(`Saved Workflow: ${data.item.name}`)
  }
}

insertWorkflow()
