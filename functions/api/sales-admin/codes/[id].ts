import { json } from "../../_lib";
import { requireTeam } from "../../_sales";

/** Stops a code: every Sales account that used it loses access at once. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    "UPDATE sales_access_codes SET revoked_at = ? WHERE id = ? AND owner_user_id = ? AND revoked_at IS NULL",
  )
    .bind(new Date().toISOString(), String(params.id), auth.user.id)
    .run();
  if (!result.meta.changes) return json({ error: "Code not found." }, 404);
  return json({ revoked: true });
};
