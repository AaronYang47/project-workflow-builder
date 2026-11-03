import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("release condition duration replaces date and persists in weeks", async ({ page }) => {
  const file = createProjectWorkflow("Condition duration");
  const node = createDomainNode("general", "sales-duration");
  node.title = "Sales";
  node.conditions = [{ id: "agreement", label: "Sales Agreement", displayDate: "2026-10-29" }];
  file.graph.nodes = [node];
  file.layout.nodes = { [node.id]: { nodeId: node.id, x: 100, y: 100, width: 400, height: 400 } };
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("duration-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("duration-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator('[data-id="sales-duration"]');
  await card.getByRole("button", { name: "Edit release condition 1 in Inspector", exact: true }).first().click();
  await expect(page.getByText("Display date", { exact: true })).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Release condition 1 duration", exact: true }).fill("2");
  await page.getByRole("combobox", { name: "Release condition 1 duration unit" }).selectOption("weeks");
  await expect(card).toContainText("2 weeks");
  await expect(card).not.toContainText("2026-10-29");
  await page.reload();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(card).toContainText("2 weeks");
});
