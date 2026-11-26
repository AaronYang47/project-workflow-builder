import { json } from "../_lib";
import { requireSales } from "../_sales";

/**
 * Project names of the team account, and this Sales account's unsent drafts.
 * Nothing else about a project is sent to Sales.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireSales(request, env);
  if (auth.response) return auth.response;
  const owner = auth.sales.ownerUserId;
  const [projects, drafts, template] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM projects WHERE user_id = ? ORDER BY updated_at DESC")
      .bind(owner)
      .all<{ id: string; name: string }>(),
    env.DB.prepare(
      "SELECT draft_key, draft_json, updated_at FROM sales_drafts WHERE user_id = ? AND owner_user_id = ? ORDER BY updated_at DESC",
    )
      .bind(auth.user.id, owner)
      .all<{ draft_key: string; draft_json: string; updated_at: string }>(),
    env.DB.prepare(
      "SELECT id FROM project_templates WHERE user_id = ? AND sales_default = 1 LIMIT 1",
    )
      .bind(owner)
      .first(),
  ]);
  return json({
    team: auth.sales.ownerName || "",
    projects: projects.results,
    drafts: drafts.results.map((row) => {
      let projectName = "";
      try {
        projectName = String(JSON.parse(row.draft_json).projectName || "");
      } catch {
        // A damaged draft still lists, under its key.
      }
      return { key: row.draft_key, projectName, updatedAt: row.updated_at };
    }),
    canCreate: Boolean(template),
  });
};
