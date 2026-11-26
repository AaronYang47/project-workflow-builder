import { expect, test } from "playwright/test";
import { createE2EWorkflow, seedE2EWorkflow } from "./support/e2e-workflow";

test("L4 shows the L5 Factory Production row title in red", async ({ page }) => {
  const file = createE2EWorkflow();
  const node = file.graph.nodes.find((item) => item.conditions.length)!;
  node.conditions.push({
    id: "factory-production",
    label: "Factory Production",
    duration: 8,
    durationUnit: "weeks",
  });
  await seedE2EWorkflow(page, file);
  await page.goto("/process-overview");
  const title = page.locator("[data-l5-driven]").filter({ hasText: "Factory Production" }).first();
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("color", "rgb(220, 38, 38)");
  // Ordinary steps keep the normal colour.
  await expect(page.locator("[data-l5-driven]")).toHaveCount(1);
});
