import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("workspace manual save and autosave survive a fresh cloud reload", async ({ page }) => {
  const file = createProjectWorkflow("Cloud persistence");
  const chapter = createDomainNode("general", "sales");
  chapter.title = "Sales";
  chapter.conditions = [{ id: "c1", label: "Original condition" }];
  file.graph.nodes = [chapter];
  file.layout.nodes = { sales: { nodeId: "sales", x: 0, y: 0, width: 384, height: 500 } };
  const user = { id: "test-owner", name: "Owner", email: "owner@example.com" };
  let cloud = { id: "saved-project", name: "Cloud persistence", project_number: "27000", created_at: "2026-10-27T10:00:00Z", updated_at: "2026-10-27T10:00:00Z", workflow: file };
  let saves = 0;
  let holdNextRead = false;
  let releaseRead: (() => void) | undefined;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/projects/saved-project", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      cloud = { ...cloud, name: body.name, workflow: body.workflow, updated_at: new Date().toISOString() };
      saves++;
    }
    const response = structuredClone(cloud);
    if (route.request().method() === "GET" && holdNextRead) {
      holdNextRead = false;
      await new Promise<void>((resolve) => { releaseRead = resolve; });
    }
    await route.fulfill({ json: { project: response } });
  });
  await page.addInitScript(({ key, workflow, owner }) => {
    if (sessionStorage.getItem("cloud-save-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, activeProjectId: "saved-project", workspaceOwnerId: owner.id, authUser: owner, dirty: false }, version: 0 }));
    sessionStorage.setItem("cloud-save-seeded", "1");
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file, owner: user });
  await page.goto("/release-conditions");
  const input = page.getByRole("textbox", { name: "Text for Sales release condition 1" });
  await expect(input).toHaveValue("Original condition");
  await input.fill("Manual edited condition · EOI");
  await input.blur();
  await page.getByRole("button", { name: "Save project to cloud" }).click();
  await expect.poll(() => cloud.workflow.graph.nodes.find((node) => node.id === "sales")?.conditions[0].label).toBe("Manual edited condition · EOI");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  // Deliberately seed an older clean local snapshot so the refresh must read
  // the cloud value rather than just restoring localStorage.
  await page.evaluate(({ key, workflow, owner }) => localStorage.setItem(key, JSON.stringify({ state: { file: workflow, activeProjectId: "saved-project", workspaceOwnerId: owner.id, authUser: owner, dirty: false }, version: 0 })), { key: WORKFLOW_STORAGE_KEY, workflow: file, owner: user });
  await page.reload();
  await expect(input).toHaveValue("Manual edited condition · EOI");
  await input.fill("Automatically saved condition · NDA");
  await expect.poll(() => cloud.workflow.graph.nodes.find((node) => node.id === "sales")?.conditions[0].label).toBe("Automatically saved condition · NDA");
  await expect(input).toBeFocused();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(saves).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(input).toHaveValue("Automatically saved condition · NDA");
  holdNextRead = true;
  await page.reload();
  await expect.poll(() => Boolean(releaseRead)).toBe(true);
  await input.fill("Edit made while the cloud request was still loading");
  await input.blur();
  releaseRead!();
  await expect.poll(() => cloud.workflow.graph.nodes.find((node) => node.id === "sales")?.conditions[0].label).toBe("Edit made while the cloud request was still loading");
  await expect(input).toHaveValue("Edit made while the cloud request was still loading");
});
