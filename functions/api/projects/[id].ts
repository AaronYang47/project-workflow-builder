import { json, readJson, requireUser } from "../_lib";

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
  const body = await readJson<{ name?: string; projectNumber?: string; workflow?: unknown }>(request);
  if (!body?.name?.trim() || !body.workflow) return json({ error: "Project name and workflow are required." }, 400);
  const updatedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE projects SET name = ?, project_number = ?, workflow_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  ).bind(body.name.trim(), body.projectNumber?.trim() || "", JSON.stringify(body.workflow), updatedAt, String(params.id), auth.user!.id).run();
  if (!result.meta.changes) return json({ error: "Project not found." }, 404);
  return json({ project: { id: String(params.id), name: body.name.trim(), project_number: body.projectNumber?.trim() || "", updated_at: updatedAt } });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const id = String(params.id);
  const result = await env.DB.prepare(
    "DELETE FROM projects WHERE id = ? AND user_id = ?",
  ).bind(id, auth.user!.id).run();
  if (!result.meta.changes) return json({ error: "Project not found." }, 404);
  return json({ deleted: true, id });
};
