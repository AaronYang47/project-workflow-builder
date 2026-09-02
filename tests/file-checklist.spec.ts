import { expect, test, type Page } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

async function openExecution(page: Page, nodeId: string) {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(page.getByText("Start", { exact: true }).first()).toBeVisible();
  await page.evaluate(
    ({ targetNodeId }) => {
      window.dispatchEvent(
        new CustomEvent("workflow:open-execution", {
          detail: { nodeId: targetNodeId },
        }),
      );
    },
    { targetNodeId: nodeId },
  );
  await expect(page.getByRole("button", { name: "Back to L2" })).toBeVisible();
}

test("L3 is a required-file checklist and all checks release the node", async ({
  page,
}) => {
  await openExecution(page, "pre-construction");

  await expect(page.getByTestId("required-file-checklist")).toBeVisible();
  await expect(page.getByText("Required files", { exact: true })).toBeVisible();
  await expect(page.getByText("Execution Item", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit execution item/ })).toHaveCount(0);

  const files = page.getByTestId("required-file-checklist").locator('input[type="checkbox"]');
  const count = await files.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await files.nth(index).check();
  }
  await expect(page.getByText("PRE-CONSTRUCTION is ready to release.", { exact: true })).toBeVisible();
});

test("a release-condition checkbox stays in L2", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const node = page.locator('[data-id="pre-construction"]');
  await expect(node).toBeVisible();
  await node.getByRole("button", { name: "Check release condition 1" }).click();
  await expect(page.getByText("L3 · Execution Layer", { exact: true })).toHaveCount(0);
});

test("every L2 node uses the file checklist view", async ({ page }) => {
  for (const nodeId of [
    "project-start",
    "gate-g1-qualified",
    "pre-construction",
    "gate-g2-technical-commitment",
    "production-readiness",
    "gate-g3-production-authorization",
    "factory-production",
    "gate-g4-factory-release",
    "delivery-project-completion",
    "gate-g5-warranty-start",
    "commissioning-warranty",
    "close-out",
  ]) {
    await openExecution(page, nodeId);
    await expect(
      page.getByTestId("required-file-checklist"),
      nodeId,
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit execution item/ })).toHaveCount(0);
  }
});
