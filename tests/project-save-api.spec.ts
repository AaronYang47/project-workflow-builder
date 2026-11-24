import { expect, test } from "playwright/test";
import { onRequestGet, onRequestPut } from "../functions/api/projects/[id]";
import { createProjectWorkflow } from "../src/lib/project-template";
import { createDomainNode } from "../src/lib/create-domain-node";

test("saving and reading the PROFAB project preserves user changes without applying fixed process rules", async () => {
  const id = "c2668760-cf63-4574-8806-02247b206579";
  const workflow = createProjectWorkflow("User process");
  const chapter = createDomainNode("general", "profab-ch-03");
  chapter.title = "My edited chapter";
  chapter.description = "My edited scope";
  chapter.metadata.processSteps = JSON.stringify([
    { id: "03.05", title: "Original step", documents: "RM" },
  ]);
  chapter.conditions = [
    {
      id: "profab-condition-03.05",
      label: "My new release condition · CUSTOM",
      description: "Forms / Documents: CUSTOM",
    },
  ];
  workflow.graph.nodes = [chapter];
  workflow.releaseConditionInbox = [{ id: "parked", label: "My unassigned condition" }];
  workflow.highLevel!.graph.nodes = [
    {
      id: "profab-l1-phase-1",
      type: "phase",
      title: "My phase name",
      description: "My phase description",
    },
  ];
  let row = {
    id,
    name: "Before",
    project_number: "27000",
    workflow_json: JSON.stringify(createProjectWorkflow("Before")),
    created_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
  };
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        sql,
        get values() {
          return values;
        },
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async first() {
          if (sql.includes("FROM sessions"))
            return {
              id: "owner",
              email: "owner@example.com",
              name: "Owner",
              role: "Project Manager",
            };
          if (sql.includes("FROM projects")) return row;
          return { id: "version", version_number: 1 };
        },
      };
    },
    async batch(statements: { sql: string; values: unknown[] }[]) {
      for (const statement of statements)
        if (statement.sql.startsWith("UPDATE projects SET name")) {
          const [name, number, json, updated] = statement.values as string[];
          row = { ...row, name, project_number: number, workflow_json: json, updated_at: updated };
        }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const env = { DB: db, SESSION_SECRET: "test" };
  const headers = { cookie: "pwb_session=test-session", "content-type": "application/json" };
  const saved = await onRequestPut({
    env,
    params: { id },
    request: new Request(`https://example.com/api/projects/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        name: "User process",
        projectNumber: "27000",
        workflow,
        baseUpdatedAt: row.updated_at,
      }),
    }),
  } as never);
  expect(saved.status).toBe(200);
  expect(JSON.parse(row.workflow_json)).toEqual(workflow);
  const loaded = await onRequestGet({
    env,
    params: { id },
    request: new Request(`https://example.com/api/projects/${id}`, { headers }),
  } as never);
  expect(loaded.status).toBe(200);
  expect((await loaded.json()).project.workflow).toEqual(workflow);
});

test("an older copy of a project cannot overwrite a newer save", async () => {
  const id = "stale-project";
  const newer = createProjectWorkflow("Saved on the office PC");
  let row = {
    id,
    name: "Saved on the office PC",
    project_number: "27001",
    workflow_json: JSON.stringify(newer),
    created_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-11-23T21:51:31.874Z",
  };
  let writes = 0;
  const db = {
    prepare(sql: string) {
      return {
        sql,
        values: [] as unknown[],
        bind(...args: unknown[]) {
          this.values = args;
          return this;
        },
        async first() {
          if (sql.includes("FROM sessions"))
            return { id: "owner", email: "owner@example.com", name: "Owner", role: "Coordinator" };
          if (sql.includes("FROM projects")) return row;
          return { id: "version", version_number: 2 };
        },
      };
    },
    async batch(statements: { sql: string; values: unknown[] }[]) {
      writes += 1;
      for (const statement of statements)
        if (statement.sql.startsWith("UPDATE projects SET name")) {
          const [name, number, json, updated] = statement.values as string[];
          row = { ...row, name, project_number: number, workflow_json: json, updated_at: updated };
        }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  const env = { DB: db, SESSION_SECRET: "test" };
  const headers = { cookie: "pwb_session=test-session", "content-type": "application/json" };
  const put = (baseUpdatedAt: string | undefined, name: string) =>
    onRequestPut({
      env,
      params: { id },
      request: new Request(`https://example.com/api/projects/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name,
          projectNumber: "27001",
          workflow: createProjectWorkflow(name),
          baseUpdatedAt,
        }),
      }),
    } as never);

  // A laptop still holding the October copy, and an old tab that sends no base at all.
  for (const base of ["2026-10-28T20:41:39.478Z", undefined]) {
    const stale = await put(base, "Old laptop copy");
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: "STALE_PROJECT",
      updated_at: "2026-11-23T21:51:31.874Z",
    });
  }
  expect(writes).toBe(0);
  expect(row.name).toBe("Saved on the office PC");

  // A copy based on the latest save goes through and becomes the new base.
  const fresh = await put("2026-11-23T21:51:31.874Z", "Edited on the office PC");
  expect(fresh.status).toBe(200);
  expect(row.name).toBe("Edited on the office PC");
  expect((await fresh.json()).project.updated_at).toBe(row.updated_at);
});
