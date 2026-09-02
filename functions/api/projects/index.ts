import {
  appendProjectAuditStatement,
  appendProjectVersionStatement,
  json,
  projectSnapshotHash,
  readJson,
  requireUser,
  trimProjectVersionsStatement,
} from "../_lib";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    "SELECT id, name, project_number, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
  ).bind(auth.user!.id).all();
  return json({ projects: result.results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const body = await readJson<{
    name?: string;
    projectNumber?: string;
    workflow?: unknown;
    changeReason?: string;
  }>(request);
  if (!body?.name?.trim() || !body.workflow) return json({ error: "Project name and workflow are required." }, 400);
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = body.name.trim();
  const projectNumber = body.projectNumber?.trim() || "";
  const workflowJson = JSON.stringify(body.workflow);
  if (!workflowJson) return json({ error: "Project workflow must be valid JSON." }, 400);
  const contentHash = await projectSnapshotHash(name, projectNumber, workflowJson);
  const userId = auth.user!.id;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO projects (id, user_id, name, project_number, workflow_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, userId, name, projectNumber, workflowJson, now, now),
    appendProjectVersionStatement(env.DB, {
      id: versionId,
      projectId: id,
      ownerUserId: userId,
      name,
      projectNumber,
      workflowJson,
      contentHash,
      changeKind: "created",
      actorUserId: userId,
      createdAt: now,
    }),
    appendProjectAuditStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId: id,
      ownerUserId: userId,
      actorUserId: userId,
      actorRole: auth.user!.role,
      action: "project.created",
      versionId,
      details: {
        snapshotHash: contentHash,
        changeReason: body.changeReason?.trim().slice(0, 500) || null,
      },
      createdAt: now,
    }),
    trimProjectVersionsStatement(env.DB, id),
  ]);

  return json({
    project: {
      id,
      name,
      project_number: projectNumber,
      created_at: now,
      updated_at: now,
    },
    version: {
      id: versionId,
      version_number: 1,
      content_hash: contentHash,
      hash_algorithm: "SHA-256",
      change_kind: "created",
      created_at: now,
    },
  }, 201);
};
