import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

const outputDir = join(process.cwd(), "artifacts", "screenshots");

async function openLayer1(page: Page) {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(
    page.getByText("Start", { exact: true }).first(),
  ).toBeVisible();
}

async function openExecution(page: Page, nodeId: string) {
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.evaluate(
    ({ nodeId }) => {
      window.dispatchEvent(
        new CustomEvent("workflow:open-execution", {
          detail: { nodeId },
        }),
      );
    },
    { nodeId },
  );
  await expect(page.getByRole("button", { name: "Back to L2" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.beforeAll(() => mkdirSync(outputDir, { recursive: true }));
test.use({ viewport: { width: 1600, height: 1050 } });

test("capture L1 lifecycle", async ({ page }) => {
  await openLayer1(page);
  await expect(page.getByText("4 lifecycle steps · 0 primary gates")).toBeVisible();
  await page.screenshot({
    path: join(outputDir, "01-l1-project-lifecycle.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 2400, height: 800 });
  const overview = page.locator("[data-lifecycle-overview]");
  await expect(overview).toBeVisible();
  await overview.screenshot({
    path: join(outputDir, "01b-l1-4-step-overview.png"),
    animations: "disabled",
  });
});

test("capture L2 bounded process and distinct G1", async ({ page }) => {
  await openLayer1(page);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="gate-g1-qualified"]')).toBeVisible();
  await page.screenshot({
    path: join(outputDir, "02-l2-bounded-process.png"),
    animations: "disabled",
  });
});

test("capture the required-file checklist", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openLayer1(page);
  await openExecution(page, "pre-construction");
  const form = page
    .locator("section")
    .filter({ hasText: "Required files" })
    .first();
  await expect(form).toBeVisible();
  await form.screenshot({
    path: join(outputDir, "03-l3-required-file-checklist.png"),
    animations: "disabled",
  });
});

test("capture the Gate 1 required-file checklist", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1050 });
  await openLayer1(page);
  await openExecution(page, "gate-g1-qualified");
  await expect(page.getByText("Required files", { exact: true })).toBeVisible();
  await page.locator('[data-testid="required-file-checklist"]').screenshot({
    path: join(outputDir, "04-g1-required-file-checklist.png"),
    animations: "disabled",
  });
});
