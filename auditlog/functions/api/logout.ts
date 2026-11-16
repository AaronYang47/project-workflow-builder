import { writeAuditEvents } from "../../../functions/api/_audit";
import { clearedCookie, json } from "./_auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (env.AUDIT_DB) waitUntil(writeAuditEvents(env.AUDIT_DB, request, [{ source: "console", category: "console", action: "console.logout", outcome: "success", method: "POST", path: "/api/logout", status: 200 }]));
  return json({ ok: true }, 200, { "set-cookie": clearedCookie });
};
