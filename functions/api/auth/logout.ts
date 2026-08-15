import { json, sessionCookie } from "../_lib";
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = request.headers.get("cookie")?.match(/(?:^|; )pwb_session=([^;]+)/)?.[1];
  if (token) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
  }
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
};
