import { json, readJson, requireUser } from "../_lib";

const MAX_SCENARIO_BYTES = 1_000_000;

/** The signed-in user's saved L5 scenarios, newest first. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const result = await env.DB.prepare(
    "SELECT scenario_json FROM simulation_scenarios WHERE user_id = ? ORDER BY updated_at DESC",
  )
    .bind(auth.user!.id)
    .all<{ scenario_json: string }>();
  const scenarios = result.results.flatMap((row) => {
    try {
      return [JSON.parse(row.scenario_json)];
    } catch {
      return [];
    }
  });
  return json({ scenarios });
};

/** Saves (creates or replaces) one scenario owned by the signed-in user. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const body = await readJson<{ scenario?: { id?: unknown; name?: unknown } }>(request);
  const scenario = body?.scenario;
  if (!scenario || typeof scenario.id !== "string" || !scenario.id.trim())
    return json({ error: "A scenario with an id is required." }, 400);
  const scenarioJson = JSON.stringify(scenario);
  if (scenarioJson.length > MAX_SCENARIO_BYTES)
    return json({ error: "Scenario is too large to save." }, 413);
  const userId = auth.user!.id;
  const owner = await env.DB.prepare("SELECT user_id FROM simulation_scenarios WHERE id = ?")
    .bind(scenario.id)
    .first<{ user_id: string }>();
  if (owner && owner.user_id !== userId) return json({ error: "Scenario not found." }, 404);
  const name =
    typeof scenario.name === "string" && scenario.name.trim() ? scenario.name.trim() : "Scenario";
  await env.DB.prepare(
    `INSERT INTO simulation_scenarios (id, user_id, name, scenario_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, scenario_json = excluded.scenario_json, updated_at = excluded.updated_at`,
  )
    .bind(scenario.id, userId, name.slice(0, 200), scenarioJson, new Date().toISOString())
    .run();
  return json({ saved: true, id: scenario.id });
};
