import { expect, test } from "playwright/test";
import { highLevelCardWidth } from "../src/lib/high-level-card-width";
import { createE2EWorkflow, seedE2EWorkflow } from "./support/e2e-workflow";

test("Phase card width responds to its longest linked department", () => {
  expect(highLevelCardWidth("phase", [])).toBe(288);
  expect(
    highLevelCardWidth("phase", [{ title: "Department TECHNICAL", hasSteps: true }]),
  ).toBeGreaterThan(288);
  expect(
    highLevelCardWidth("phase", [{ title: "Department TECHNICAL", hasSteps: true }]),
  ).toBeLessThanOrEqual(560);
});

test("Department TECHNICAL stays on one line inside an expanded Phase", async ({ page }) => {
  const file = createE2EWorkflow();
  const technical = file.graph.nodes.find((node) => node.id === "pre-construction")!;
  technical.config.stage = "TECHNICAL";
  file.highLevel!.graph.nodes.find((node) => node.id === "high-level-2")!.linkedLayer2NodeIds = [
    technical.id,
  ];
  await seedE2EWorkflow(page, file);
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('.react-flow__node[data-id="high-level-2"]');
  const label = phase.getByRole("button", { name: "Department TECHNICAL", exact: true });
  await expect(label).toBeVisible();
  await expect
    .poll(() =>
      label.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          element.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 2 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => phase.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(288);
});
