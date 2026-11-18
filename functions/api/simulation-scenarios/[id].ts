import { json, requireUser } from "../_lib";

/** Deletes one of the signed-in user's saved L5 scenarios. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    "DELETE FROM simulation_scenarios WHERE id = ? AND user_id = ?",
  )
    .bind(String(params.id), auth.user!.id)
    .run();
  if (!result.meta.changes) return json({ error: "Scenario not found." }, 404);
  return json({ deleted: true });
};
