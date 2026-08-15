import { json, readJson, requireUser } from "../_lib";

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
  const body = await readJson<{ name?: string; projectNumber?: string; workflow?: unknown }>(request);
  if (!body?.name?.trim() || !body.workflow) return json({ error: "Project name and workflow are required." }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO projects (id, user_id, name, project_number, workflow_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, auth.user!.id, body.name.trim(), body.projectNumber?.trim() || "", JSON.stringify(body.workflow), now, now).run();
  return json({ project: { id, name: body.name.trim(), project_number: body.projectNumber?.trim() || "", created_at: now, updated_at: now } }, 201);
};
