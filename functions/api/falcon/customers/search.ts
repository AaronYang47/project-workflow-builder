import { falconDb, json, requireUser, searchFalconMaster } from "../../_falcon-customers";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;

  const db = falconDb(env);
  if (!db) {
    return json({ error: "FALCON_DB is not bound", query: "", total_matches: 0, results: [] }, 503);
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "12", 10) || 12, 25);
  if (q.length < 2) {
    return json({ query: q, total_matches: 0, results: [], source: "d1" });
  }

  const results = await searchFalconMaster(db, q, limit);
  return json({
    query: q,
    total_matches: results.length,
    results,
    source: "falcon-customer-master",
  });
};
