import {
  appendBaselineIfMissingStatement,
  appendProjectAuditStatement,
  appendProjectVersionStatement,
  json,
  projectSnapshotHash,
  readJson,
  requireUser,
  trimProjectVersionsStatement,
  type UserRole,
} from "../../../_lib";

type StoredProject = {
  id: string;
  name: string;
  project_number: string;
  workflow_json: string;
};

type ApprovalKind =
  | "LOI"
  | "Change"
  | "Credit"
  | "Payment Release"
  | "Estimate"
  | "Production Release";

const APPROVAL_KINDS = new Set<ApprovalKind>([
  "LOI",
  "Change",
  "Credit",
  "Payment Release",
  "Estimate",
  "Production Release",
]);

const APPROVAL_ROLES = new Set<UserRole>([
  "Coordinator",
  "Project Manager",
  "Estimator",
  "Engineering",
  "Finance",
  "CRO",
  "CEO",
  "Client",
]);

const ROLE_RANK: Record<UserRole, number> = {
  Coordinator: 1,
  Estimator: 2,
  Engineering: 2,
  "Project Manager": 3,
  Finance: 4,
  CRO: 4,
  CEO: 5,
  Client: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const finiteNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const canonicalRequiredRole = (
  kind: ApprovalKind,
  approval: Record<string, unknown>,
  operations: Record<string, unknown>,
): UserRole => {
  if (kind === "LOI") return "CRO";
  if (kind === "Change") {
    const percent = Math.abs(finiteNumber(approval.contractPercent));
    if (percent >= 10) return "CEO";
    if (percent >= 5) return "CRO";
    return "Project Manager";
  }
  if (kind === "Credit") {
    const amount = Math.abs(finiteNumber(approval.amount));
    const cumulativeCredit = Math.abs(finiteNumber(approval.cumulativeCreditAmount));
    const commercial = isRecord(operations.commercial) ? operations.commercial : {};
    const contractValue = Math.abs(finiteNumber(commercial.contractValue));
    const cumulativePercent = contractValue > 0
      ? cumulativeCredit / contractValue * 100
      : 100;
    if (amount >= 25_000 || cumulativePercent >= 2) return "CEO";
    if (amount >= 5_000) return "CRO";
    return "Finance";
  }
  if (kind === "Payment Release") return "Finance";
  if (kind === "Production Release") return "CRO";
  return "Project Manager";
};

const stricterRequiredRole = (
  storedRole: UserRole,
  calculatedRole: UserRole,
  kind: ApprovalKind,
) => {
  // Client sign-off is supported for estimates only. Internal release,
  // financial, and executive request kinds always keep their server minimum.
  if (storedRole === "Client") return kind === "Estimate" ? storedRole : calculatedRole;
  return ROLE_RANK[storedRole] >= ROLE_RANK[calculatedRole]
    ? storedRole
    : calculatedRole;
};

const canDecide = (
  actualRole: UserRole,
  requiredRole: UserRole,
  kind: ApprovalKind,
) => {
  if (kind === "LOI") return actualRole === "CEO" || actualRole === "CRO";
  if (requiredRole === "Client") return actualRole === "Client";
  if (actualRole === "Client") return false;
  return ROLE_RANK[actualRole] >= ROLE_RANK[requiredRole];
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const projectId = String(params.id);
  const requestId = String(params.requestId);
  const body = await readJson<{
    decision?: "Approved" | "Rejected";
    approve?: boolean;
    evidence?: string;
    reason?: string;
  }>(request);
  const decision = body?.decision || (
    typeof body?.approve === "boolean"
      ? body.approve ? "Approved" : "Rejected"
      : null
  );
  if (decision !== "Approved" && decision !== "Rejected") {
    return json({ error: "decision must be Approved or Rejected." }, 400);
  }

  const userId = auth.user!.id;
  const project = await env.DB.prepare(
    `SELECT id, name, project_number, workflow_json
     FROM projects WHERE id = ? AND user_id = ?`,
  ).bind(projectId, userId).first<StoredProject>();
  if (!project) return json({ error: "Project not found." }, 404);

  let workflow: Record<string, unknown>;
  try {
    const parsed = JSON.parse(project.workflow_json) as unknown;
    if (!isRecord(parsed)) throw new Error("Workflow root must be an object.");
    workflow = parsed;
  } catch {
    return json({ error: "This project's saved workflow is damaged and cannot be approved." }, 409);
  }
  if (!isRecord(workflow.operations)) {
    return json({ error: "This project does not contain an operational approval ledger." }, 409);
  }
  const operations = workflow.operations;
  if (!isRecord(operations.approvals)) {
    return json({ error: "This project does not contain an approval control." }, 409);
  }
  const approvals = operations.approvals;
  if (!Array.isArray(approvals.requests)) {
    return json({ error: "This project's approval request list is damaged." }, 409);
  }
  const approval = approvals.requests.find(
    (candidate) => isRecord(candidate) && candidate.id === requestId,
  );
  if (!isRecord(approval)) return json({ error: "Approval request not found." }, 404);
  if (approval.status !== "Pending") {
    return json({ error: "Only a pending approval request can be decided." }, 409);
  }
  if (
    typeof approval.kind !== "string" ||
    !APPROVAL_KINDS.has(approval.kind as ApprovalKind) ||
    typeof approval.requiredRole !== "string" ||
    !APPROVAL_ROLES.has(approval.requiredRole as UserRole)
  ) {
    return json({ error: "This approval request has an invalid server-side authority definition." }, 409);
  }

  const kind = approval.kind as ApprovalKind;
  const storedRequiredRole = approval.requiredRole as UserRole;
  const calculatedRequiredRole = canonicalRequiredRole(kind, approval, operations);
  const enforcedRequiredRole = kind === "LOI"
    ? calculatedRequiredRole
    : stricterRequiredRole(storedRequiredRole, calculatedRequiredRole, kind);
  if (!canDecide(auth.user!.role, enforcedRequiredRole, kind)) {
    return json({
      error: `${auth.user!.role} cannot decide this ${kind} request.`,
      code: "APPROVAL_ROLE_FORBIDDEN",
      required_role: kind === "LOI" ? "CEO or CRO" : enforcedRequiredRole,
    }, 403);
  }

  const decidedAt = new Date().toISOString();
  const decidedApproval = {
    ...approval,
    requiredRole: enforcedRequiredRole,
    status: decision,
    decidedBy: auth.user!.name,
    decidedByRole: auth.user!.role,
    decidedAt,
    evidence: typeof body?.evidence === "string"
      ? body.evidence.trim().slice(0, 2_000)
      : approval.evidence,
    reason: typeof body?.reason === "string"
      ? body.reason.trim().slice(0, 2_000)
      : approval.reason,
  };
  const workflowAudit = Array.isArray(operations.auditLog)
    ? operations.auditLog.filter(isRecord).slice(-499)
    : [];
  const updatedOperations = {
    ...operations,
    approvals: {
      ...approvals,
      requests: approvals.requests.map((candidate) =>
        isRecord(candidate) && candidate.id === requestId ? decidedApproval : candidate
      ),
    },
    auditLog: [
      ...workflowAudit,
      {
        id: `audit-${crypto.randomUUID()}`,
        timestamp: decidedAt,
        actor: auth.user!.name,
        actorRole: auth.user!.role,
        action: decision === "Approved" ? "APPROVE_REQUEST" : "REJECT_REQUEST",
        entityType: "ApprovalRequest",
        entityId: requestId,
        summary: `${kind} ${String(approval.reference || requestId)} ${decision.toLowerCase()} by ${auth.user!.role}.`,
      },
    ],
    updatedAt: decidedAt,
  };
  const updatedWorkflow = { ...workflow, operations: updatedOperations };
  const workflowJson = JSON.stringify(updatedWorkflow);
  const [baselineHash, contentHash] = await Promise.all([
    projectSnapshotHash(project.name, project.project_number, project.workflow_json),
    projectSnapshotHash(project.name, project.project_number, workflowJson),
  ]);
  const versionId = crypto.randomUUID();

  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE projects SET workflow_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).bind(workflowJson, decidedAt, projectId, userId),
    appendBaselineIfMissingStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId,
      ownerUserId: userId,
      name: project.name,
      projectNumber: project.project_number,
      workflowJson: project.workflow_json,
      contentHash: baselineHash,
      actorUserId: userId,
      createdAt: decidedAt,
    }),
    appendProjectVersionStatement(env.DB, {
      id: versionId,
      projectId,
      ownerUserId: userId,
      name: project.name,
      projectNumber: project.project_number,
      workflowJson,
      contentHash,
      changeKind: "approval",
      actorUserId: userId,
      createdAt: decidedAt,
    }),
    appendProjectAuditStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId,
      ownerUserId: userId,
      actorUserId: userId,
      actorRole: auth.user!.role,
      action: decision === "Approved" ? "approval.approved" : "approval.rejected",
      versionId,
      details: {
        requestId,
        kind,
        reference: String(approval.reference || ""),
        storedRequiredRole,
        enforcedRequiredRole: kind === "LOI" ? "CEO or CRO" : enforcedRequiredRole,
        actorRole: auth.user!.role,
        decision,
        previousSnapshotHash: baselineHash,
        snapshotHash: contentHash,
        hasEvidence: Boolean(decidedApproval.evidence),
        reason: decidedApproval.reason || null,
      },
      createdAt: decidedAt,
    }),
    trimProjectVersionsStatement(env.DB, projectId),
  ]);
  if (!results[0].meta.changes) return json({ error: "Project not found." }, 404);

  const version = await env.DB.prepare(
    `SELECT id, version_number, content_hash, hash_algorithm, change_kind, created_at
     FROM project_versions WHERE id = ? AND project_id = ? AND owner_user_id = ?`,
  ).bind(versionId, projectId, userId).first();
  return json({ approval: decidedApproval, version, updated_at: decidedAt });
};
