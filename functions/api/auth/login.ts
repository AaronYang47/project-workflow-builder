import { createSession, hashPassword, json, readJson, secureEqual, sessionCookie } from "../_lib";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = body?.email?.trim().toLowerCase() || "";
  const record = await env.DB.prepare(
    "SELECT id, email, name, password_hash, password_salt FROM users WHERE email = ?",
  ).bind(email).first<{ id: string; email: string; name: string; password_hash: string; password_salt: string }>();
  if (!record) return json({ error: "Incorrect email or password." }, 401);
  const candidate = await hashPassword(body?.password || "", record.password_salt);
  if (!secureEqual(candidate.hash, record.password_hash))
    return json({ error: "Incorrect email or password." }, 401);
  const token = await createSession(env.DB, record.id, env.SESSION_SECRET);
  return json({ user: { id: record.id, email: record.email, name: record.name } }, 200, { "set-cookie": sessionCookie(token) });
};
