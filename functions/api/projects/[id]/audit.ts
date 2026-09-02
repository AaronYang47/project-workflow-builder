import { json, requireUser } from "../../_lib";

type AuditRow = {
  id: string;
  project_id: string;
  actor_user_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  version_id: string | null;
  restored_from_version_id: string | null;
  details_json: string;
  created_at: string;
};

const parseDetails = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const projectId = String(params.id);
  const ownedProject = await env.DB.prepare(
    "SELECT id FROM projects WHERE id = ? AND user_id = ?",
  ).bind(projectId, auth.user!.id).first();
  if (!ownedProject) return json({ error: "Project not found." }, 404);

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(200, Math.floor(requestedLimit)))
    : 100;
  const result = await env.DB.prepare(
    `SELECT
      audit.id,
      audit.project_id,
      audit.actor_user_id,
      users.name AS actor_name,
      audit.actor_role,
      audit.action,
      audit.version_id,
      audit.restored_from_version_id,
      audit.details_json,
      audit.created_at
    FROM project_audit_log AS audit
    JOIN users ON users.id = audit.actor_user_id
    WHERE audit.project_id = ? AND audit.owner_user_id = ?
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT ?`,
  ).bind(projectId, auth.user!.id, limit).all<AuditRow>();

  return json({
    audit: result.results.map(({ details_json, ...entry }) => ({
      ...entry,
      details: parseDetails(details_json),
    })),
    limit,
  });
};
