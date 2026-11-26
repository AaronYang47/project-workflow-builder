import { json, projectTooLarge, readJson } from "../_lib";
import { requireTeam } from "../_sales";
import { parseWorkflowValue } from "@/lib/serialization";
import { templateFromWorkflow } from "@/lib/sales-intake";

/** This account's project templates. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    "SELECT id, name, sales_default, created_at, updated_at FROM project_templates WHERE user_id = ? ORDER BY updated_at DESC",
  )
    .bind(auth.user.id)
    .all<{
      id: string;
      name: string;
      sales_default: number;
      created_at: string;
      updated_at: string;
    }>();
  return json({
    templates: result.results.map((row) => ({
      id: row.id,
      name: row.name,
      salesDefault: Boolean(row.sales_default),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
};

/**
 * Saves a project as a template, without anything that belongs to that one
 * project. The first template becomes the one Sales use for new projects.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const body = await readJson<{ name?: string; workflow?: unknown }>(request);
  const name = String(body?.name ?? "")
    .trim()
    .slice(0, 200);
  if (!name || !body?.workflow)
    return json({ error: "Template name and project are required." }, 400);
  let workflowJson: string;
  try {
    workflowJson = JSON.stringify(templateFromWorkflow(parseWorkflowValue(body.workflow)));
  } catch {
    return json({ error: "This project cannot be saved as a template." }, 400);
  }
  const tooLarge = projectTooLarge(name, "", workflowJson);
  if (tooLarge) return tooLarge;
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM project_templates WHERE user_id = ? AND sales_default = 1",
  )
    .bind(auth.user.id)
    .first<{ count: number }>();
  const salesDefault = !existing?.count;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO project_templates (id, user_id, name, workflow_json, sales_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, auth.user.id, name, workflowJson, salesDefault ? 1 : 0, now, now)
    .run();
  return json({ template: { id, name, salesDefault, createdAt: now, updatedAt: now } }, 201);
};
