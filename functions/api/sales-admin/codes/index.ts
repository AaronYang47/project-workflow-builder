import { json, readJson } from "../../_lib";
import { hashAccessCode, newAccessCode, requireTeam } from "../../_sales";

/** This account's Sales access codes and the Sales accounts that used each one. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const [codes, people] = await Promise.all([
    env.DB.prepare(
      "SELECT id, code_hint, label, created_at, revoked_at FROM sales_access_codes WHERE owner_user_id = ? ORDER BY created_at DESC",
    )
      .bind(auth.user.id)
      .all<{
        id: string;
        code_hint: string;
        label: string;
        created_at: string;
        revoked_at: string | null;
      }>(),
    env.DB.prepare(
      `SELECT sales_accounts.access_code_id, users.name, users.email, sales_accounts.linked_at
       FROM sales_accounts
       JOIN sales_access_codes AS codes ON codes.id = sales_accounts.access_code_id
       JOIN users ON users.id = sales_accounts.user_id
       WHERE codes.owner_user_id = ?
       ORDER BY sales_accounts.linked_at DESC`,
    )
      .bind(auth.user.id)
      .all<{ access_code_id: string; name: string; email: string; linked_at: string }>(),
  ]);
  return json({
    codes: codes.results.map((code) => ({
      id: code.id,
      hint: code.code_hint,
      label: code.label,
      createdAt: code.created_at,
      revokedAt: code.revoked_at,
      people: people.results
        .filter((person) => person.access_code_id === code.id)
        .map((person) => ({ name: person.name, email: person.email, linkedAt: person.linked_at })),
    })),
  });
};

/** Issues a new access code. The code itself is returned only here, once. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireTeam(request, env);
  if (auth.response) return auth.response;
  const body = await readJson<{ label?: string }>(request);
  const label = String(body?.label ?? "")
    .trim()
    .slice(0, 100);
  const code = newAccessCode();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO sales_access_codes (id, owner_user_id, code_hash, code_hint, label, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      auth.user.id,
      await hashAccessCode(code, env.SESSION_SECRET),
      code.slice(-4),
      label,
      createdAt,
    )
    .run();
  return json(
    { code, id, hint: code.slice(-4), label, createdAt, revokedAt: null, people: [] },
    201,
  );
};
