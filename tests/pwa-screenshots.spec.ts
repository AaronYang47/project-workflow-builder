import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "playwright/test";
import { seedE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

const screenshotDir = join(process.cwd(), "public", "store-screenshots");

test.use({ viewport: { width: 1600, height: 900 } });

test("capture a public demo of the Falcon workflow editor", async ({ page }) => {
  mkdirSync(screenshotDir, { recursive: true });
  await seedE2EWorkflow(page);
  await page.addInitScript((key) => {
    const stored = window.localStorage.getItem(key);
    if (!stored) return;
    const data = JSON.parse(stored);
    data.state.file.graph.metadata.name = "Falcon Demo Workflow";
    data.state.file.graph.metadata.version = "v1.0";
    const qualification = data.state.file.highLevel.graph.nodes.find((node: { id: string }) => node.id === "high-level-2");
    const production = data.state.file.highLevel.graph.nodes.find((node: { id: string }) => node.id === "high-level-3");
    if (qualification) qualification.title = "Qualification";
    if (production) production.title = "Production";
    window.localStorage.setItem(key, JSON.stringify(data));
  }, WORKFLOW_STORAGE_KEY);

  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(page.getByText("4 lifecycle steps · 0 primary gates")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Workflow name" })).toHaveValue("Falcon Demo Workflow");
  await page.locator('[data-id="high-level-2"]').click();
  await page.screenshot({
    path: join(screenshotDir, "falcon-workflow-overview.png"),
    animations: "disabled",
  });
});
