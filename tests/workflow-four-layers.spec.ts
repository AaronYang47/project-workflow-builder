import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";
import { seedE2EWorkflow } from "./support/e2e-workflow";

test("four layers navigate without a selected node and preserve L2 return context", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  const toolbar = page.locator("[data-workflow-toolbar]");
  await expect(toolbar.getByRole("link", { name: "Open Release Conditions Workspace" })).toHaveText("L3 · Conditions");
  await expect(toolbar.getByRole("link", { name: "Open Process Overview" })).toHaveText("L4 · Process & Gantt");
  await expect(toolbar.getByRole("button", { name: "L3 · Execution View" })).toHaveCount(0);
  await toolbar.getByRole("link", { name: "Open Release Conditions Workspace" }).click();
  await expect(page.getByRole("heading", { name: "L3 · Conditions", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workflow layers" });
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Open Release Conditions Workspace" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Open Process Overview" }).click();
  await expect(page.getByRole("heading", { name: "L4 · Process & Gantt", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workflow layers" }).getByRole("link", { name: "Open Process Overview" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "L2 · Department Workflow", exact: true }).click();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByRole("link", { name: "Open Release Conditions Workspace" }).click();
  await page.getByRole("link", { name: "L1 · Process", exact: true }).click();
  await expect(page.getByRole("button", { name: "L1 · High Level" })).toHaveAttribute("aria-pressed", "true");
});


test("L3 condition details retain the existing forms editor and L4 stays separate", async ({ page }) => {
  const file = createProjectWorkflow("Four layer details");
  const node = createDomainNode("general", "detail-node");
  node.title = "CHAPTER 01";
  node.config.stage = "Sales";
  node.conditions = [{ id: "detail-rc", label: "Inspect contract", duration: 3, required: true }];
  file.graph.nodes = [node];
  file.highLevel!.graph.nodes = [{ id: "phase", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: [node.id] }];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("details-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("details-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/release-conditions");
  await expect(page.getByRole("heading", { name: "L3 · Conditions", exact: true })).toBeVisible();
  await page.screenshot({ path: "tmp/four-layer-conditions.png", fullPage: true });
  await page.getByRole("button", { name: /Inspect contract/ }).click();
  await page.getByRole("link", { name: "Forms & execution details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add Legal Document", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("condition")).toBe("detail-rc");
  await page.locator("[data-workflow-toolbar]").getByRole("link", { name: "Open Process Overview" }).click();
  await expect(page.getByRole("heading", { name: "L4 · Process & Gantt", exact: true })).toBeVisible();
  await page.screenshot({ path: "tmp/four-layer-gantt.png", fullPage: true });
});
