import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { conditionIsSatisfied, nodeReleaseReady } from "../src/lib/workflow-progress";
import { syncProjectNameIdentity } from "../src/lib/project-id";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("missing Job Number and unchecked legacy condition do not block the chapter", () => {
  const node = createDomainNode("projectStart", "start");
  node.conditions = [{ id: "project-id-required", label: "Job Number is entered", required: true, checked: false, locked: true }];
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(false);
  expect(nodeReleaseReady(node, node, [], undefined)).toBe(true);
  node.conditions[0].checked = true;
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(false);
  node.customFields.projectId = "L-27-001";
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(true);
  expect(syncProjectNameIdentity("PROF Address 1 St 1 Su", "27001")).toBe("27001 PROF Address 1 St 1 Su");
});

test("Job Number condition is automatic and missing number does not block", async ({ page }) => {
  const file = createProjectWorkflow("No Job Number");
  const start = createDomainNode("projectStart", "start");
  start.conditions[0].required = true; // A previously saved project.
  file.graph.nodes = [start];
  file.layout.nodes[start.id] = { nodeId: start.id, x: 0, y: 0, width: 420, height: 550 };
  await page.addInitScript(({ key, file }) => localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 })), { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator('[data-id="start"]');
  await expect(card.getByText("Job Number not set. You can add it later.")).toBeVisible();
  await expect(card).toContainText("Ready");
  await expect(card.getByRole("button", { name: "Check release condition 1" })).toBeDisabled();
  await card.getByRole("textbox", { name: "Job Number (5 digits)" }).fill("2700");
  await expect(card.getByRole("button", { name: "Check release condition 1" })).toBeDisabled();
  await card.getByRole("textbox", { name: "Job Number (5 digits)" }).fill("27001");
  await expect(card.getByText("Job Number not set. You can add it later.")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Uncheck release condition 1" })).toBeDisabled();
  await card.getByRole("textbox", { name: "Job Number (5 digits)" }).fill("");
  await expect(card.getByRole("button", { name: "Check release condition 1" })).toBeDisabled();
});

test("a cloud project can be created without a Job Number", async ({ page }) => {
  const user = { id: "owner", name: "Owner", email: "owner@example.com" };
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  let saved: { name: string; projectNumber: string } | undefined;
  await page.route("**/api/projects", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { project: { id: "new", name: saved!.name, project_number: "", created_at: "", updated_at: "" } } });
    }
    return route.fulfill({ json: { projects: [] } });
  });
  await page.addInitScript(({ key, user }) => localStorage.setItem(key, JSON.stringify({ state: { authUser: user, workspaceOwnerId: user.id, dirty: false }, version: 0 })), { key: WORKFLOW_STORAGE_KEY, user });
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Job Number not set. You can add it later.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Company code" }).fill("PROF");
  await dialog.getByRole("textbox", { name: "Project address" }).fill("Test Street");
  await dialog.getByRole("textbox", { name: "Storeys" }).fill("1");
  await dialog.getByRole("textbox", { name: "Suites" }).fill("1");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect.poll(() => saved?.projectNumber).toBe("");
  expect(saved?.name).toBe("PROF Test Street 1 St 1 Su");
});
