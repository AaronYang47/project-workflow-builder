import { falconDb, getFalconMasterCompany, json, requireUser } from "../../_falcon-customers";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;

  const db = falconDb(env);
  if (!db) return json({ error: "FALCON_DB is not bound" }, 503);

  const id = decodeURIComponent(String(params.id || "")).trim();
  if (!id) return json({ error: "Missing company id" }, 400);

  const company = await getFalconMasterCompany(db, id);
  if (!company) return json({ error: "Company not found" }, 404);
  return json(company);
};
