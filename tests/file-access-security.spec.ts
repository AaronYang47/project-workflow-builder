import { expect, test } from "playwright/test";
import { onRequestGet as listFiles, onRequestDelete } from "../functions/api/files/index";
import { onRequestGet as downloadFile } from "../functions/api/files/download";
import { onRequestPost as uploadFile } from "../functions/api/files/upload";

const makeEnv = (userId: string | null) => {
  const objects = new Map<string, { body: string; customMetadata: Record<string, string> }>([
    ["users/alice/supporting/a-secret.pdf", { body: "alice secret", customMetadata: { fileName: "a-secret.pdf", category: "supporting" } }],
    ["users/bob/supporting/b-secret.pdf", { body: "bob secret", customMetadata: { fileName: "b-secret.pdf", category: "supporting" } }],
    ["supporting/legacy.pdf", { body: "legacy secret", customMetadata: { fileName: "legacy.pdf", category: "supporting" } }],
  ]);
  const env = {
    SESSION_SECRET: "test-secret",
    DB: {
      prepare(sql: string) {
        return {
          bind() { return this; },
          async first() {
            if (sql.includes("FROM sessions")) return userId ? { id: userId, email: `${userId}@example.com`, name: userId, role: "Coordinator" } : null;
            if (sql.includes("FROM legacy_file_owner")) return { user_id: "alice" };
            return null;
          },
        };
      },
    },
    R2_BUCKET: {
      async list({ prefix = "" }: { prefix?: string }) {
        return { objects: [...objects.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, size: value.body.length, uploaded: new Date(), httpMetadata: { contentType: "application/pdf" }, customMetadata: value.customMetadata })) };
      },
      async get(key: string) {
        const item = objects.get(key);
        return item ? { body: item.body, httpEtag: "etag", customMetadata: item.customMetadata, writeHttpMetadata(headers: Headers) { headers.set("content-type", "application/pdf"); } } : null;
      },
      async put(key: string, body: ReadableStream, options: { customMetadata: Record<string, string> }) {
        objects.set(key, { body: await new Response(body).text(), customMetadata: options.customMetadata });
      },
      async delete(key: string) { objects.delete(key); },
    },
  };
  return { env, objects };
};

const request = (path: string, method = "GET", body?: BodyInit) =>
  new Request(`https://example.com${path}`, { method, headers: { cookie: "pwb_session=token" }, body });

test("file endpoints require a session and isolate each account", async () => {
  const anonymous = makeEnv(null);
  expect((await listFiles({ request: request("/api/files"), env: anonymous.env } as never)).status).toBe(401);
  expect((await downloadFile({ request: request("/api/files/download?key=users/alice/supporting/a-secret.pdf"), env: anonymous.env } as never)).status).toBe(401);
  expect((await onRequestDelete({ request: request("/api/files?key=users/alice/supporting/a-secret.pdf", "DELETE"), env: anonymous.env } as never)).status).toBe(401);

  const alice = makeEnv("alice");
  const bob = makeEnv("bob");
  const aliceList = await (await listFiles({ request: request("/api/files"), env: alice.env } as never)).json();
  const bobList = await (await listFiles({ request: request("/api/files"), env: bob.env } as never)).json();
  expect(aliceList.files.map((file: { key: string }) => file.key)).toEqual(expect.arrayContaining(["users/alice/supporting/a-secret.pdf", "supporting/legacy.pdf"]));
  expect(aliceList.files.map((file: { key: string }) => file.key)).not.toContain("users/bob/supporting/b-secret.pdf");
  expect(bobList.files.map((file: { key: string }) => file.key)).toEqual(["users/bob/supporting/b-secret.pdf"]);
  expect((await downloadFile({ request: request("/api/files/download?key=users/alice/supporting/a-secret.pdf"), env: bob.env } as never)).status).toBe(404);
  expect((await onRequestDelete({ request: request("/api/files?key=users/alice/supporting/a-secret.pdf", "DELETE"), env: bob.env } as never)).status).toBe(404);
  expect(alice.objects.has("users/alice/supporting/a-secret.pdf")).toBe(true);
});

test("new uploads use a private owner prefix", async () => {
  const { env, objects } = makeEnv("alice");
  const form = new FormData();
  form.set("category", "supporting");
  form.set("file", new File(["hello"], "report.pdf", { type: "application/pdf" }));
  const response = await uploadFile({ request: request("/api/files/upload", "POST", form), env } as never);
  expect(response.status).toBe(200);
  const uploaded = await response.json();
  expect(uploaded.key).toMatch(/^users\/alice\/supporting\/[^/]+-report\.pdf$/);
  expect(objects.has(uploaded.key)).toBe(true);
  expect(uploaded.ownerUserId).toBe("alice");
  expect(objects.get(uploaded.key)?.customMetadata.ownerUserId).toBe("alice");
});

test("known file links cannot be downloaded, replaced or deleted by another account", async () => {
  for (const [userId, other] of [["alice", "bob"], ["bob", "alice"]]) {
    const { env, objects } = makeEnv(userId);
    const key = `users/${other}/supporting/${other[0]}-secret.pdf`;
    const original = structuredClone(objects.get(key));
    expect((await downloadFile({ request: request(`/api/files/download?key=${encodeURIComponent(key)}`), env } as never)).status).toBe(404);
    expect((await onRequestDelete({ request: request(`/api/files?key=${encodeURIComponent(key)}`, "DELETE"), env } as never)).status).toBe(404);
    const form = new FormData();
    form.set("file", new File(["overwritten"], `${other[0]}-secret.pdf`));
    form.set("category", "supporting");
    form.set("replaceKey", key);
    expect((await uploadFile({ request: request("/api/files/upload", "POST", form), env } as never)).status).toBe(404);
    expect(objects.get(key)).toEqual(original);
  }
});

test("file requests from a stale browser tab reject the new session account", async () => {
  const { env, objects } = makeEnv("bob");
  const staleRequest = (path: string, method = "GET") => new Request(`https://example.com${path}`, {
    method, headers: { cookie: "pwb_session=token", "x-workflow-account": "alice" },
  });
  expect((await listFiles({ request: staleRequest("/api/files"), env } as never)).status).toBe(409);
  expect((await uploadFile({ request: staleRequest("/api/files/upload", "POST"), env } as never)).status).toBe(409);
  expect((await onRequestDelete({ request: staleRequest("/api/files?key=users/bob/supporting/b-secret.pdf", "DELETE"), env } as never)).status).toBe(409);
  expect(objects.size).toBe(3);
});

test("legacy files stay with their fixed owner, and downloads cannot be cached", async () => {
  const alice = makeEnv("alice");
  const own = await downloadFile({ request: request("/api/files/download?key=users/alice/supporting/a-secret.pdf"), env: alice.env } as never);
  expect(own.status).toBe(200);
  expect(await own.text()).toBe("alice secret");
  expect(own.headers.get("cache-control")).toBe("private, no-store");
  const bob = makeEnv("bob");
  expect((await downloadFile({ request: request("/api/files/download?key=supporting/legacy.pdf"), env: bob.env } as never)).status).toBe(404);
  expect((await onRequestDelete({ request: request("/api/files?key=supporting/legacy.pdf", "DELETE"), env: bob.env } as never)).status).toBe(404);
  const anonymous = makeEnv(null);
  expect((await uploadFile({ request: request("/api/files/upload", "POST"), env: anonymous.env } as never)).status).toBe(401);
});
