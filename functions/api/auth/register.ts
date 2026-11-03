import { createSession, hashPassword, json, readJson, sessionCookie } from "../_lib";
import { checkAuthRateLimit } from "./_rate-limit";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email?: string; name?: string; password?: string }>(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !name || name.length > 100 || password.length < 12 || password.length > 256)
    return json({ error: "Enter a valid email, name, and password of 12–256 characters." }, 400);
  const limited = await checkAuthRateLimit(request, env, "register", email);
  if (limited) return limited;
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
