import {
  appendProjectAuditStatement,
  appendProjectVersionStatement,
  json,
  projectSnapshotHash,
  readJson,
  requireUser,
  secureEqual,
  trimProjectVersionsStatement,
} from "../../_lib";

type StoredVersion = {
  id: string;
  project_id: string;
  version_number: number;
  name: string;
  project_number: string;
  workflow_json: string;
  content_hash: string;
  hash_algorithm: "SHA-256";
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const projectId = String(params.id);
  const body = await readJson<{ versionId?: string; reason?: string }>(request);
  const sourceVersionId = body?.versionId?.trim() || "";
  if (!sourceVersionId) return json({ error: "A versionId is required." }, 400);

  const source = await env.DB.prepare(
    `SELECT
      versions.id,
      versions.project_id,
      versions.version_number,
      versions.name,
      versions.project_number,
      versions.workflow_json,
      versions.content_hash,
      versions.hash_algorithm
    FROM project_versions AS versions
    JOIN projects ON projects.id = versions.project_id
    WHERE versions.id = ?
      AND versions.project_id = ?
      AND versions.owner_user_id = ?
      AND projects.user_id = ?`,
  ).bind(sourceVersionId, projectId, auth.user!.id, auth.user!.id).first<StoredVersion>();
  if (!source) return json({ error: "Project version not found." }, 404);

  const verifiedHash = await projectSnapshotHash(
    source.name,
    source.project_number,
    source.workflow_json,
  );
  if (
    source.hash_algorithm !== "SHA-256" ||
    !secureEqual(verifiedHash, source.content_hash)
  ) {
    return json({
      error: "This backup failed its integrity check and cannot be restored.",
      code: "VERSION_INTEGRITY_FAILURE",
    }, 409);
  }

  let workflow: unknown;
  try {
    workflow = JSON.parse(source.workflow_json) as unknown;
  } catch {
    return json({
      error: "This backup contains damaged workflow data and cannot be restored.",
      code: "VERSION_WORKFLOW_DAMAGED",
    }, 409);
  }

  const restoredAt = new Date().toISOString();
  const restoredVersionId = crypto.randomUUID();
  const userId = auth.user!.id;
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE projects
       SET name = ?, project_number = ?, workflow_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(
      source.name,
      source.project_number,
      source.workflow_json,
      restoredAt,
      projectId,
      userId,
    ),
    appendProjectVersionStatement(env.DB, {
      id: restoredVersionId,
      projectId,
      ownerUserId: userId,
      name: source.name,
      projectNumber: source.project_number,
      workflowJson: source.workflow_json,
      contentHash: source.content_hash,
      changeKind: "restored",
      restoredFromVersionId: source.id,
      actorUserId: userId,
      createdAt: restoredAt,
    }),
    appendProjectAuditStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId,
      ownerUserId: userId,
      actorUserId: userId,
      actorRole: auth.user!.role,
      action: "project.restored",
      versionId: restoredVersionId,
      restoredFromVersionId: source.id,
      details: {
        sourceVersionNumber: source.version_number,
        sourceSnapshotHash: source.content_hash,
        reason: body?.reason?.trim().slice(0, 500) || null,
      },
      createdAt: restoredAt,
    }),
    trimProjectVersionsStatement(env.DB, projectId),
  ]);
  if (!results[0].meta.changes) return json({ error: "Project not found." }, 404);

  const version = await env.DB.prepare(
    `SELECT id, version_number, content_hash, hash_algorithm, change_kind,
      restored_from_version_id, created_at
     FROM project_versions
     WHERE id = ? AND project_id = ? AND owner_user_id = ?`,
  ).bind(restoredVersionId, projectId, userId).first();

  return json({
    project: {
      id: projectId,
      name: source.name,
      project_number: source.project_number,
      workflow,
      updated_at: restoredAt,
    },
    version,
  });
};
