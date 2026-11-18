import { expect, test } from "playwright/test";
import { onRequestGet, onRequestPut } from "../functions/api/simulation-scenarios/index";
import { onRequestDelete } from "../functions/api/simulation-scenarios/[id]";

type Row = { id: string; user_id: string; name: string; scenario_json: string; updated_at: string };

function fakeDb(userId: string, rows: Map<string, Row>) {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async first() {
          if (sql.includes("FROM sessions"))
            return {
              id: userId,
              email: `${userId}@example.com`,
              name: userId,
              role: "Coordinator",
            };
          if (sql.startsWith("SELECT user_id FROM simulation_scenarios")) {
            const row = rows.get(String(values[0]));
            return row ? { user_id: row.user_id } : null;
          }
          return null;
        },
        async all() {
          return {
            results: [...rows.values()]
              .filter((row) => row.user_id === values[0])
              .map((row) => ({ scenario_json: row.scenario_json })),
          };
        },
        async run() {
          if (sql.startsWith("INSERT INTO simulation_scenarios")) {
            const [id, user, name, json, updated] = values as string[];
            rows.set(id, { id, user_id: user, name, scenario_json: json, updated_at: updated });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("DELETE FROM simulation_scenarios")) {
            const row = rows.get(String(values[0]));
            if (row && row.user_id === values[1]) {
              rows.delete(row.id);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

const headers = { cookie: "pwb_session=test-session", "content-type": "application/json" };
const put = (userId: string, rows: Map<string, Row>, scenario: unknown) =>
  onRequestPut({
    env: { DB: fakeDb(userId, rows), SESSION_SECRET: "test" },
    request: new Request("https://example.com/api/simulation-scenarios", {
      method: "PUT",
      headers,
      body: JSON.stringify({ scenario }),
    }),
  } as never);

test("each user saves, lists and deletes only their own scenarios", async () => {
  const rows = new Map<string, Row>();
  expect((await put("alice", rows, { id: "s1", name: "Plan A", projects: [] })).status).toBe(200);
  expect(rows.get("s1")?.user_id).toBe("alice");

  const listed = await onRequestGet({
    env: { DB: fakeDb("alice", rows), SESSION_SECRET: "test" },
    request: new Request("https://example.com/api/simulation-scenarios", { headers }),
  } as never);
  expect((await listed.json()).scenarios).toEqual([{ id: "s1", name: "Plan A", projects: [] }]);

  // Another user can't overwrite or delete it.
  expect((await put("bob", rows, { id: "s1", name: "Taken over" })).status).toBe(404);
  expect(rows.get("s1")?.name).toBe("Plan A");
  const bobDelete = await onRequestDelete({
    env: { DB: fakeDb("bob", rows), SESSION_SECRET: "test" },
    params: { id: "s1" },
    request: new Request("https://example.com/api/simulation-scenarios/s1", {
      method: "DELETE",
      headers,
    }),
  } as never);
  expect(bobDelete.status).toBe(404);
  expect(rows.has("s1")).toBe(true);

  const aliceDelete = await onRequestDelete({
    env: { DB: fakeDb("alice", rows), SESSION_SECRET: "test" },
    params: { id: "s1" },
    request: new Request("https://example.com/api/simulation-scenarios/s1", {
      method: "DELETE",
      headers,
    }),
  } as never);
  expect(aliceDelete.status).toBe(200);
  expect(rows.has("s1")).toBe(false);
  expect((await put("alice", rows, { name: "No id" })).status).toBe(400);
});
