import { expect, test } from "playwright/test";
import { execFileSync } from "node:child_process";
import { useWorkflowStore } from "../src/store/workflow-store";
import { deleteUploadedFile, fetchUploadedFilesFromR2, getUploadedFiles, saveUploadedFile, uploadFileToR2, type UploadedFileRecord } from "../src/lib/file-storage";

const alice = { id: "alice", name: "Alice", email: "alice@example.com" };
const bob = { id: "bob", name: "Bob", email: "bob@example.com" };
const record: UploadedFileRecord = { id: "private", key: "users/alice/legal/private.pdf", fileName: "private.pdf", title: "Alice private", fileType: "application/pdf", fileSize: 10, category: "legal", description: "", uploadedAt: "2026-10-30", url: "/api/files/download?key=users%2Falice%2Flegal%2Fprivate.pdf" };
const originalFetch = globalThis.fetch;

test.beforeEach(() => {
  const storage = new Map<string, string>();
  const local = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } };
  Object.assign(globalThis, { localStorage: local, window: { localStorage: local, dispatchEvent() {} } });
  useWorkflowStore.setState({ authUser: alice, workspaceOwnerId: alice.id });
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("account switching hides cached uploads and clears workspace, undo history and project", () => {
  saveUploadedFile(record);
  localStorage.setItem("falcon_uploaded_files", JSON.stringify([record]));
  useWorkflowStore.setState({ activeProjectId: "alice-project", past: [useWorkflowStore.getState().file], future: [useWorkflowStore.getState().file] });
  useWorkflowStore.getState().setAuthUser(bob);
  expect(getUploadedFiles("legal")).toEqual([]);
  expect(useWorkflowStore.getState()).toMatchObject({ activeProjectId: undefined, past: [], future: [], workspaceOwnerId: "bob" });
  expect(useWorkflowStore.getState().file.graph.nodes).toEqual([]);
  expect(localStorage.getItem("falcon_uploaded_files_alice")).toBeNull();
  expect(localStorage.getItem("falcon_uploaded_files")).toBeNull();
  useWorkflowStore.getState().setAuthUser(alice);
  expect(getUploadedFiles("legal")).toEqual([]);
});

test("a delayed library response cannot be returned or cached under the next account", async () => {
  let release!: (response: Response) => void;
  globalThis.fetch = async (_url, options) => {
    expect(new Headers(options?.headers).get("x-workflow-account")).toBe("alice");
    return new Promise<Response>((resolve) => { release = resolve; });
  };
  const pending = fetchUploadedFilesFromR2("legal");
  useWorkflowStore.getState().setAuthUser(bob);
  release(Response.json({ ok: true, ownerUserId: "alice", files: [record] }));
  expect(await pending).toEqual([]);
  expect(localStorage.getItem("falcon_uploaded_files_bob")).toBeNull();
});

test("mismatched session responses and expired sessions never reveal cached files", async () => {
  saveUploadedFile(record);
  globalThis.fetch = async () => Response.json({ ok: true, ownerUserId: "bob", files: [{ ...record, title: "Bob private" }] });
  expect(await fetchUploadedFilesFromR2("legal")).toEqual([]);
  expect(getUploadedFiles("legal")).toEqual([record]);
  globalThis.fetch = async () => Response.json({ error: "Please sign in" }, { status: 401 });
  expect(await fetchUploadedFilesFromR2("legal")).toEqual([]);
});

test("uploads finishing after a logout never enter another account's library", async () => {
  let release!: (response: Response) => void;
  globalThis.fetch = async () => new Promise<Response>((resolve) => { release = resolve; });
  const pending = uploadFileToR2(new File(["private"], "private.pdf"), { category: "legal", title: "Private", description: "" });
  useWorkflowStore.getState().setAuthUser(bob);
  release(Response.json({ ok: true, ownerUserId: "alice", ...record }));
  await expect(pending).rejects.toThrow("account changed");
  expect(localStorage.getItem("falcon_uploaded_files_bob")).toBeNull();
});

test("denied deletion leaves local file metadata intact", async () => {
  saveUploadedFile(record);
  globalThis.fetch = async () => Response.json({ error: "File not found" }, { status: 404 });
  await expect(deleteUploadedFile(record.id, record.key)).rejects.toThrow("Could not delete");
  expect(getUploadedFiles("legal")).toEqual([record]);
});

test("legacy ownership never moves to the next user after its original owner is deleted", () => {
  const result = execFileSync("python3", ["-c", `
import sqlite3
from pathlib import Path
c = sqlite3.connect(':memory:')
c.executescript("CREATE TABLE users (id TEXT, created_at TEXT); INSERT INTO users VALUES ('alice', '2025'), ('bob', '2026');")
sql = Path('migrations/0004_pin_legacy_file_owner.sql').read_text()
c.executescript(sql)
c.execute("DELETE FROM users WHERE id='alice'")
c.executescript(sql)
print(c.execute('SELECT user_id FROM legacy_file_owner').fetchone()[0])
`], { encoding: "utf8" });
  expect(result.trim()).toBe("alice");
});
