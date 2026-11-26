import { json, readJson } from "../_lib";
import { checkRateLimits } from "../auth/_rate-limit";
import { hashAccessCode, normalizeAccessCode, requireSales } from "../_sales";

/** Links this Sales account to the team that issued the access code. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireSales(request, env, { linked: false });
  if (auth.response) return auth.response;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const limited = await checkRateLimits(env, [
    { scope: "sales-code-user", identity: auth.user.id, limit: 10, windowSeconds: 900 },
    { scope: "sales-code-ip", identity: ip, limit: 30, windowSeconds: 900 },
  ]);
  if (limited) return limited;
  const body = await readJson<{ code?: string }>(request);
  const code = normalizeAccessCode(body?.code);
  if (code.length !== 8) return json({ error: "The access code has 8 letters and numbers." }, 400);
  const row = await env.DB.prepare(
    `SELECT codes.id, users.name AS team FROM sales_access_codes AS codes
     JOIN users ON users.id = codes.owner_user_id
     WHERE codes.code_hash = ? AND codes.revoked_at IS NULL`,
  )
    .bind(await hashAccessCode(code, env.SESSION_SECRET))
    .first<{ id: string; team: string }>();
  if (!row) return json({ error: "This access code is not valid. Check it with your team." }, 404);
  await env.DB.prepare(
    "UPDATE sales_accounts SET access_code_id = ?, linked_at = ? WHERE user_id = ?",
  )
    .bind(row.id, new Date().toISOString(), auth.user.id)
    .run();
  return json({ linked: true, team: row.team });
};
