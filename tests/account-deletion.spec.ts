import { expect, test } from "playwright/test";
import { onRequestDelete } from "../functions/api/auth/account";
import { hashPassword } from "../functions/api/_lib";

async function fixture(userId: string | null = "alice", failStorage = false) {
  const password = await hashPassword("correct-password", "fixed-test-salt");
  const files = new Set([
    "users/alice/supporting/a.pdf",
    "users/bob/supporting/b.pdf",
    "supporting/legacy.pdf",
  ]);
  const queries: string[] = [];
  const env = {
    SESSION_SECRET: "test-secret",
    DB: {
      prepare(sql: string) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("FROM sessions")) return userId ? { id: userId, email: `${userId}@example.com`, name: userId, role: "Coordinator" } : null;
            if (sql.includes("password_hash")) return { password_hash: password.hash, password_salt: password.salt };
            if (sql.includes("FROM legacy_file_owner")) return { user_id: "alice" };
            if (sql.includes("SELECT attempts")) return { attempts: 1 };
            return null;
          },
          async run() { queries.push(sql); return { success: true }; },
          async all() { return { results: [{ id: "project-alice" }] }; },
        };
      },
    },
    FALCON_DB: {
      prepare(sql: string) {
        return {
          bind() { return this; },
          async run() { queries.push(sql); return { success: true }; },
        };
      },
    },
    R2_BUCKET: {
      async list({ prefix = "" }: { prefix?: string }) {
        return { objects: [...files].filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: false };
      },
      async delete(keys: string[]) {
        if (failStorage) throw new Error("Storage failure");
        for (const key of keys) files.delete(key);
      },
    },
  };
  const request = (enteredPassword = "correct-password", confirmation = "DELETE") => new Request("https://example.com/api/auth/account", {
    method: "DELETE",
    headers: { cookie: "pwb_session=token", "content-type": "application/json" },
    body: JSON.stringify({ password: enteredPassword, confirmation }),
  });
  return { env, files, queries, request };
}

test("account deletion requires a signed-in user, password, and typed confirmation", async () => {
  const anonymous = await fixture(null);
  expect((await onRequestDelete({ request: anonymous.request(), env: anonymous.env } as never)).status).toBe(401);
  const account = await fixture();
  expect((await onRequestDelete({ request: account.request("wrong"), env: account.env } as never)).status).toBe(403);
  expect((await onRequestDelete({ request: account.request("correct-password", "NO"), env: account.env } as never)).status).toBe(400);
  expect(account.files.size).toBe(3);
  expect(account.queries.some((sql) => sql.includes("DELETE FROM users"))).toBe(false);
});

test("deletion removes own and legacy uploads, then account records and cookie", async () => {
  const account = await fixture();
  const result = await onRequestDelete({ request: account.request(), env: account.env } as never);
  expect(result.status).toBe(200);
  expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
  expect([...account.files]).toEqual(["users/bob/supporting/b.pdf"]);
  expect(account.queries.some((sql) => sql.includes("DELETE FROM sales_qualification_leads"))).toBe(true);
  expect(account.queries.some((sql) => sql.includes("DELETE FROM users"))).toBe(true);
});

test("storage failure keeps the account in the database for retry", async () => {
  const account = await fixture("bob", true);
  const result = await onRequestDelete({ request: account.request(), env: account.env } as never);
  expect(result.status).toBe(500);
  expect(account.queries.some((sql) => sql.includes("DELETE FROM users"))).toBe(false);
  expect(account.files.size).toBe(3);
});
