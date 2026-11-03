import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { departmentDisplayName } from "../src/lib/department-label";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("L1 inspector displays departments in its selector and condition summary", async ({ page }) => {
  const file = createProjectWorkflow("Department inspector");
  const chapter = createDomainNode("general", "sales");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Sales";
  chapter.conditions = [{ id: "sales-condition", label: "Sales Agreement" }];
  file.graph.nodes = [chapter];
  file.highLevel!.graph.nodes = [{ id: "phase", type: "phase", title: "Phase 1", description: "",
    linkedLayer2NodeIds: [chapter.id], linkedDetailedNodeIds: [chapter.id] }];
  file.highLevel!.graph.edges = [];
  file.highLevel!.layout.nodes = { phase: { nodeId: "phase", x: 100, y: 100 } };
  await page.addInitScript(({ key, file }) => localStorage.setItem(key,
    JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 })),
    { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.locator('[data-id="phase"]').click();
  const inspector = page.locator("aside").filter({ hasText: "High-Level Inspector" });
  await expect(inspector.getByRole("checkbox", { name: "Department Sales CHAPTER 01", exact: true })).toBeVisible();
  await expect(inspector.getByText("Department Sales · 1", { exact: true })).toBeVisible();
  await expect(inspector.getByText("CHAPTER 01", { exact: true })).toHaveCount(2);
});

test("department labels use the department name instead of a Chapter title", () => {
  const chapter = createDomainNode("general", "sales-chapter");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Sales";

  expect(departmentDisplayName(chapter)).toBe("Department Sales");
});

test("department labels normalize department wording and preserve involvement", () => {
  const chapter = createDomainNode("general", "service-chapter");
  chapter.title = "SITE/AFTER SERVICE Department";
  chapter.config.stage = "Department Partially Involved";

  expect(departmentDisplayName(chapter)).toBe("Department SITE/AFTER SERVICE Partially Involved");
});
