import { json, readJson } from "../_lib";
import { requireTeam } from "../_sales";

/** Renames a template, or makes it the one Sales use for new projects. */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const id = String(params.id);
  const body = await readJson<{ name?: string; salesDefault?: boolean }>(request);
  const found = await env.DB.prepare(
    "SELECT id FROM project_templates WHERE id = ? AND user_id = ?",
  )
    .bind(id, auth.user.id)
    .first();
  if (!found) return json({ error: "Template not found." }, 404);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (name)
    statements.push(
      env.DB.prepare("UPDATE project_templates SET name = ?, updated_at = ? WHERE id = ?").bind(
        name,
        now,
        id,
      ),
    );
  if (body?.salesDefault === true)
    statements.push(
      env.DB.prepare(
        "UPDATE project_templates SET sales_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?",
      ).bind(id, auth.user.id),
    );
  if (body?.salesDefault === false)
    statements.push(
      env.DB.prepare("UPDATE project_templates SET sales_default = 0 WHERE id = ?").bind(id),
    );
  if (statements.length) await env.DB.batch(statements);
  return json({ updated: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare("DELETE FROM project_templates WHERE id = ? AND user_id = ?")
    .bind(String(params.id), auth.user.id)
    .run();
  if (!result.meta.changes) return json({ error: "Template not found." }, 404);
  return json({ deleted: true });
};
