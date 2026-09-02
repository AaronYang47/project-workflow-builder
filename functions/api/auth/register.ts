import { createSession, hashPassword, json, readJson, sessionCookie } from "../_lib";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email?: string; name?: string; password?: string }>(request);
  const email = body?.email?.trim().toLowerCase() || "";
  const name = body?.name?.trim() || "";
  const password = body?.password || "";
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 8)
    return json({ error: "Enter a valid email, name, and password of at least 8 characters." }, 400);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) return json({ error: "An account already exists for this email." }, 409);
  const userId = crypto.randomUUID();
  const passwordValue = await hashPassword(password);
  try {
    await env.DB.prepare(
      "INSERT INTO users (id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(userId, email, name, passwordValue.hash, passwordValue.salt, new Date().toISOString()).run();
  } catch {
    return json({ error: "An account already exists for this email." }, 409);
  }
  const token = await createSession(env.DB, userId, env.SESSION_SECRET);
  return json({ user: { id: userId, email, name, role: "Coordinator" } }, 201, { "set-cookie": sessionCookie(token) });
};
