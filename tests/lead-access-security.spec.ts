import { expect, test } from "playwright/test";
import { onRequestGet, onRequestPut } from "../functions/api/falcon/leads/[leadNumber]";

test("a signed-in user cannot read or overwrite a lead linked to another account's project", async () => {
  const lead = {
    lead_number: "27001",
    pwb_project_id: "owner-project",
    company_json: JSON.stringify({ organizationName: "Private customer" }),
    form_json: "{}",
    updated_at: "2026-10-27T00:00:00Z",
  };
  const env = {
    SESSION_SECRET: "test",
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...input: unknown[]) { values = input; return this; },
          async first() {
            if (sql.includes("FROM sessions")) return { id: "other-user", email: "other@example.com", name: "Other", role: "Coordinator" };
            if (sql.includes("FROM projects")) return values[0] === "other-project" ? { id: "other-project" } : null;
            return null;
          },
        };
      },
    },
    FALCON_DB: {
      prepare(sql: string) {
        return {
          bind() { return this; },
          async run() { return {}; },
          async first() { return sql.includes("FROM sales_qualification_leads") ? lead : null; },
        };
      },
    },
  };
  const base = "https://example.com/api/falcon/leads/27001";
  const headers = { cookie: "pwb_session=token", "content-type": "application/json" };
  const read = await onRequestGet({ env, params: { leadNumber: "27001" }, request: new Request(base, { headers }) } as never);
  expect(read.status).toBe(404);
  const write = await onRequestPut({ env, params: { leadNumber: "27001" }, request: new Request(base, { method: "PUT", headers, body: JSON.stringify({ projectId: "other-project", customer: { organizationName: "Changed" } }) }) } as never);
  expect(write.status).toBe(409);
});
