import {
  appendBaselineIfMissingStatement,
  appendProjectAuditStatement,
  appendProjectVersionStatement,
  json,
  projectSnapshotHash,
  readJson,
  requireUser,
  trimProjectVersionsStatement,
} from "../_lib";

type StoredProject = {
  id: string;
  name: string;
  project_number: string;
  workflow_json: string;
  created_at: string;
  updated_at: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const approvalRequests = (workflow: unknown) => {
  if (!isRecord(workflow) || !isRecord(workflow.operations)) return [];
  const operations = workflow.operations;
  if (!isRecord(operations.approvals) || !Array.isArray(operations.approvals.requests)) return [];
  return operations.approvals.requests.filter(isRecord);
};

const validateApprovalLedgerUpdate = (
  existingWorkflowJson: string,
  nextWorkflow: unknown,
) => {
  let existingWorkflow: unknown;
  try {
    existingWorkflow = JSON.parse(existingWorkflowJson) as unknown;
  } catch {
    // A damaged legacy workflow may still be replaced through PUT.
    return null;
  }
  const existingRequests = approvalRequests(existingWorkflow);
  const nextRequests = approvalRequests(nextWorkflow);
  const nextById = new Map(
    nextRequests
      .filter((item) => typeof item.id === "string")
      .map((item) => [item.id as string, item]),
  );
  const existingIds = new Set<string>();
  const lockedFields = ["status", "decidedBy", "decidedByRole", "decidedAt"] as const;

  for (const existingRequest of existingRequests) {
    if (typeof existingRequest.id !== "string") continue;
    existingIds.add(existingRequest.id);
    const nextRequest = nextById.get(existingRequest.id);
    if (!nextRequest) {
      return {
        requestId: existingRequest.id,
        message: "Existing approval requests cannot be removed through project save.",
      };
    }
    const changedField = lockedFields.find(
      (field) => nextRequest[field] !== existingRequest[field],
    );
    if (changedField) {
      return {
        requestId: existingRequest.id,
        message: `${changedField} can only be changed through the approval decision endpoint.`,
      };
    }
  }

  for (const nextRequest of nextRequests) {
    if (typeof nextRequest.id !== "string" || existingIds.has(nextRequest.id)) continue;
    if (nextRequest.status !== "Draft" && nextRequest.status !== "Pending") {
      return {
        requestId: nextRequest.id,
        message: "New approval requests must start as Draft or Pending.",
      };
    }
  }
  return null;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const project = await env.DB.prepare(
    "SELECT id, name, project_number, workflow_json, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?",
  ).bind(String(params.id), auth.user!.id).first<Record<string, string>>();
  if (!project) return json({ error: "Project not found." }, 404);
  try {
    return json({ project: { ...project, workflow: JSON.parse(project.workflow_json), workflow_json: undefined } });
  } catch {
    return json({ error: "This project's saved workflow is damaged and cannot be opened." }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const body = await readJson<{
    name?: string;
    projectNumber?: string;
    workflow?: unknown;
    changeReason?: string;
  }>(request);
  if (!body?.name?.trim() || !body.workflow) return json({ error: "Project name and workflow are required." }, 400);
  const id = String(params.id);
  const userId = auth.user!.id;
  const existing = await env.DB.prepare(
    "SELECT id, name, project_number, workflow_json, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?",
  ).bind(id, userId).first<StoredProject>();
  if (!existing) return json({ error: "Project not found." }, 404);

  const updatedAt = new Date().toISOString();
  const name = body.name.trim();
  const projectNumber = body.projectNumber?.trim() || "";
  const approvalViolation = validateApprovalLedgerUpdate(existing.workflow_json, body.workflow);
  if (approvalViolation) {
    return json({
      error: approvalViolation.message,
      code: "APPROVAL_DECISION_REQUIRES_ENDPOINT",
      request_id: approvalViolation.requestId,
    }, 409);
  }
  const workflowJson = JSON.stringify(body.workflow);
  if (!workflowJson) return json({ error: "Project workflow must be valid JSON." }, 400);
  const [contentHash, baselineHash] = await Promise.all([
    projectSnapshotHash(name, projectNumber, workflowJson),
    projectSnapshotHash(existing.name, existing.project_number, existing.workflow_json),
  ]);
  const versionId = crypto.randomUUID();

  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE projects SET name = ?, project_number = ?, workflow_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    ).bind(name, projectNumber, workflowJson, updatedAt, id, userId),
    appendBaselineIfMissingStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId: id,
      ownerUserId: userId,
      name: existing.name,
      projectNumber: existing.project_number,
      workflowJson: existing.workflow_json,
      contentHash: baselineHash,
      actorUserId: userId,
      createdAt: updatedAt,
    }),
    appendProjectVersionStatement(env.DB, {
      id: versionId,
      projectId: id,
      ownerUserId: userId,
      name,
      projectNumber,
      workflowJson,
      contentHash,
      changeKind: "updated",
      actorUserId: userId,
      createdAt: updatedAt,
    }),
    appendProjectAuditStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId: id,
      ownerUserId: userId,
      actorUserId: userId,
      actorRole: auth.user!.role,
      action: "project.updated",
      versionId,
      details: {
        previousSnapshotHash: baselineHash,
        snapshotHash: contentHash,
        changeReason: body.changeReason?.trim().slice(0, 500) || null,
      },
      createdAt: updatedAt,
    }),
    trimProjectVersionsStatement(env.DB, id),
  ]);
  if (!results[0].meta.changes) return json({ error: "Project not found." }, 404);

  const version = await env.DB.prepare(
    `SELECT id, version_number, content_hash, hash_algorithm, change_kind, created_at
     FROM project_versions WHERE id = ? AND project_id = ? AND owner_user_id = ?`,
  ).bind(versionId, id, userId).first();
  return json({
    project: { id, name, project_number: projectNumber, updated_at: updatedAt },
    version,
  });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const id = String(params.id);
  const userId = auth.user!.id;
  const existing = await env.DB.prepare(
    "SELECT id, name, project_number, workflow_json, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?",
  ).bind(id, userId).first<StoredProject>();
  if (!existing) return json({ error: "Project not found." }, 404);
  const deletedAt = new Date().toISOString();
  const finalSnapshotHash = await projectSnapshotHash(
    existing.name,
    existing.project_number,
    existing.workflow_json,
  );
  const auditId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO project_audit_log (
        id, project_id, owner_user_id, actor_user_id, actor_role, action,
        version_id, restored_from_version_id, details_json, created_at
      )
      SELECT ?, id, user_id, ?, ?, 'project.deleted', NULL, NULL, ?, ?
      FROM projects WHERE id = ? AND user_id = ?`,
    ).bind(
      auditId,
      userId,
      auth.user!.role,
      JSON.stringify({ finalSnapshotHash }),
      deletedAt,
      id,
      userId,
    ),
    env.DB.prepare(
      "DELETE FROM projects WHERE id = ? AND user_id = ?",
    ).bind(id, userId),
  ]);
  if (!results[1].meta.changes) return json({ error: "Project not found." }, 404);
  return json({ deleted: true, id });
};
