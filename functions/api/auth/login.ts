import { createSession, hashPassword, json, readJson, secureEqual, sessionCookie } from "../_lib";
import { checkAuthRateLimit } from "./_rate-limit";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email?: string; password?: string }>(request);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || typeof body?.password !== "string" || body.password.length > 256)
    return json({ error: "Incorrect email or password." }, 401);
  const limited = await checkAuthRateLimit(request, env, "login", email);
  if (limited) return limited;
  const record = await env.DB.prepare(
    "SELECT id, email, name, role, password_hash, password_salt FROM users WHERE email = ?",
  ).bind(email).first<{
    id: string;
    email: string;
    name: string;
    role: "Coordinator" | "Project Manager" | "Estimator" | "Engineering" | "Finance" | "CRO" | "CEO" | "Client";
    password_hash: string;
    password_salt: string;
  }>();
  const candidate = await hashPassword(body.password, record?.password_salt || "00000000000000000000000000000000");
  if (!record || !secureEqual(candidate.hash, record.password_hash))
    return json({ error: "Incorrect email or password." }, 401);
  const token = await createSession(env.DB, record.id, env.SESSION_SECRET);
  return json({
    user: { id: record.id, email: record.email, name: record.name, role: record.role },
  }, 200, { "set-cookie": sessionCookie(token) });
};
