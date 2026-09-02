import { json, PROJECT_VERSION_RETENTION, requireUser } from "../../_lib";

type VersionRow = {
  id: string;
  project_id: string;
  version_number: number;
  name: string;
  project_number: string;
  content_hash: string;
  hash_algorithm: "SHA-256";
  change_kind: "baseline" | "created" | "updated" | "restored" | "approval";
  restored_from_version_id: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const projectId = String(params.id);
  const ownedProject = await env.DB.prepare(
    "SELECT id FROM projects WHERE id = ? AND user_id = ?",
  ).bind(projectId, auth.user!.id).first();
  if (!ownedProject) return json({ error: "Project not found." }, 404);

  const result = await env.DB.prepare(
    `SELECT
      versions.id,
      versions.project_id,
      versions.version_number,
      versions.name,
      versions.project_number,
      versions.content_hash,
      versions.hash_algorithm,
      versions.change_kind,
      versions.restored_from_version_id,
      versions.created_by_user_id,
      users.name AS created_by_name,
      versions.created_at
    FROM project_versions AS versions
    JOIN users ON users.id = versions.created_by_user_id
    WHERE versions.project_id = ? AND versions.owner_user_id = ?
    ORDER BY versions.version_number DESC
    LIMIT ?`,
  ).bind(projectId, auth.user!.id, PROJECT_VERSION_RETENTION).all<VersionRow>();

  return json({
    versions: result.results,
    retention: {
      max_versions: PROJECT_VERSION_RETENTION,
      retained_versions: result.results.length,
      policy: "latest",
    },
  });
};
