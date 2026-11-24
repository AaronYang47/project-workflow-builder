import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";
import { authBypassEnabled, NEEDS_REAL_AUTH } from "./support/auth-mode";

test("an old copy left in another browser loads the newer cloud save instead of overwriting it", async ({
  page,
}) => {
  test.skip(authBypassEnabled(), NEEDS_REAL_AUTH);
  const user = { id: "test-owner", name: "Owner", email: "owner@example.com" };
  const chapter = (title: string) => {
    const node = createDomainNode("general", "sales");
    node.title = title;
    node.conditions = [];
    return node;
  };
  const newer = createProjectWorkflow("Office PC copy");
  newer.graph.nodes = [chapter("Saved on the office PC")];
  newer.layout.nodes = { sales: { nodeId: "sales", x: 0, y: 0, width: 384, height: 400 } };
  const older = createProjectWorkflow("Old laptop copy");
  older.graph.nodes = [chapter("Old laptop copy")];
  older.layout.nodes = newer.layout.nodes;
  const cloud = {
    id: "shared-project",
    name: "Office PC copy",
    project_number: "27001",
    created_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-11-23T21:51:31.874Z",
    workflow: newer,
  };
  const puts: { baseUpdatedAt?: string }[] = [];
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/projects/shared-project", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      puts.push(body);
      if (body.baseUpdatedAt !== cloud.updated_at)
        return route.fulfill({
          status: 409,
          json: { error: "stale", code: "STALE_PROJECT", updated_at: cloud.updated_at },
        });
    }
    await route.fulfill({ json: { project: structuredClone(cloud) } });
  });
  // The laptop's browser still holds unsaved October work based on an older save.
  await page.addInitScript(
    ({ key, workflow, owner }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            file: workflow,
            activeProjectId: "shared-project",
            cloudUpdatedAt: "2026-10-28T20:41:39.478Z",
            workspaceOwnerId: owner.id,
            dirty: true,
          },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, workflow: older, owner: user },
  );
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect.poll(() => dialogs.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(dialogs[0]).toContain("saved more recently");
  // The newer cloud save is now on screen and was never overwritten.
  await expect(page.getByText("Saved on the office PC").first()).toBeVisible();
  expect(cloud.workflow.graph.nodes[0].title).toBe("Saved on the office PC");
  expect(puts.every((body) => body.baseUpdatedAt !== cloud.updated_at)).toBe(true);
});
