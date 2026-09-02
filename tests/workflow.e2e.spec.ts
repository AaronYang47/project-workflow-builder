import { expect, test, type Page } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

async function openLayer1(page: Page) {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(page.getByText("Start", { exact: true }).first()).toBeVisible();
}

async function openLayer2(page: Page) {
  await openLayer1(page);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="gate-g1-qualified"]')).toBeVisible();
}

async function openExecution(page: Page, nodeId: string) {
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

test("app loads the exact L1 lifecycle without browser, request, or collaboration errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await openLayer1(page);
  await expect(page.getByText("4 lifecycle steps · 0 primary gates")).toBeVisible();
  await expect(page.getByText("Phase-01", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Collab Off", { exact: true })).toBeVisible();
  await page.waitForTimeout(500);

  expect(failedResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("L1, L2, and the execution view are connected and G1 cannot be bypassed visually", async ({ page }) => {
  await openLayer2(page);
  await expect(page.locator('[data-id="pre-construction"]')).toBeVisible();

  await page.locator('[data-id="pre-construction"]').click();
  await expect(page.getByRole("button", { name: "L3 · Execution View" })).toBeEnabled();
  await page.getByRole("button", { name: "L3 · Execution View" }).click();

  await expect(page.getByText("PRE-CONSTRUCTION", { exact: true })).toBeVisible();
  await expect(page.getByText("Required files", { exact: true })).toBeVisible();
  await expect(page.getByTestId("required-file-checklist")).toBeVisible();
  await expect(page.getByText("Execution Item", { exact: true })).toHaveCount(0);
});

test("L3 Detailed Workflow minimap keeps the lifecycle order and excludes retired matrix nodes", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await openExecution(page, "pre-construction");

  await page.getByRole("button", { name: "Open minimap and process locator" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Process locator pyramid diagram",
  });
  await expect(dialog).toBeVisible();

  // Expand L1 to see L2 nodes
  const l2Toggles = dialog.locator("[data-process-locator-l2-toggle]");
  for (let index = 0; index < (await l2Toggles.count()); index += 1) {
    if ((await l2Toggles.nth(index).getAttribute("aria-expanded")) === "false") {
      await l2Toggles.nth(index).click();
    }
  }

  // Verify L2 nodes are present and retired matrix nodes are excluded
  await expect(dialog.locator('button[title^="Open L2 · PRE-CONSTRUCTION"]')).toBeVisible();
  await expect(dialog.locator('button[title*="commercial-pathway"]')).toHaveCount(0);
  await expect(dialog.locator('button[title*="approval-matrix"]')).toHaveCount(0);
  await expect(dialog.locator('button[title*="responsibility-lane"]')).toHaveCount(0);
});

test("the pyramid starts with L2 collapsed and exposes only L1-to-L2 navigation", async ({
  page,
}) => {
  await openLayer1(page);
  const processLocator = page.getByRole("button", {
    name: "Open minimap and process locator",
  });
  await expect(processLocator).toBeVisible();
  await processLocator.click();

  const dialog = page.getByRole("dialog", {
    name: "Process locator pyramid diagram",
  });
  await expect(dialog).toBeVisible();

  const l2Toggles = dialog.locator("[data-process-locator-l2-toggle]");
  expect(await l2Toggles.count()).toBeGreaterThan(0);
  expect(
    await l2Toggles.evaluateAll((elements) =>
      elements.every((element) => element.getAttribute("aria-expanded") === "false"),
    ),
  ).toBe(true);
  await expect(dialog.locator('button[title^="Open L2 ·"]')).toHaveCount(0);

  const firstL1Card = dialog.locator('button[title="Open L1 · Start"]');
  const firstL2Toggle = dialog.locator(
    '[data-process-locator-l2-toggle="high-level-1"]',
  );
  const [l1Box, toggleBox] = await Promise.all([
    firstL1Card.boundingBox(),
    firstL2Toggle.boundingBox(),
  ]);
  expect(l1Box).toBeTruthy();
  expect(toggleBox).toBeTruthy();
  expect(Math.abs((l1Box?.x || 0) - (toggleBox?.x || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((l1Box?.width || 0) - (toggleBox?.width || 0))).toBeLessThanOrEqual(1);

  for (let index = 0; index < (await l2Toggles.count()); index += 1) {
    if ((await l2Toggles.nth(index).getAttribute("aria-expanded")) === "false") {
      await l2Toggles.nth(index).click();
    }
  }

  // Verify L3 toggle buttons are present on L2 nodes and start collapsed
  const l3Toggles = dialog.locator("[data-process-locator-l3-toggle]");
  expect(await l3Toggles.count()).toBeGreaterThan(0);
  expect(
    await l3Toggles.evaluateAll((elements) =>
      elements.every((element) => element.getAttribute("aria-expanded") === "false"),
    ),
  ).toBe(true);

  // Expand the first L3 toggle
  await l3Toggles.first().click();
  expect(await l3Toggles.first().getAttribute("aria-expanded")).toBe("true");

  // Verify L3 cards are displayed
  const l3Cards = dialog.locator('button[title^="Open L3 ·"]');
  expect(await l3Cards.count()).toBeGreaterThan(0);
});

test("L1 zooms with an ordinary mouse wheel", async ({ page }) => {
  await openLayer1(page);
  const viewport = page.locator(
    '[data-high-level-workflow-view] .react-flow__viewport',
  );
  await expect(viewport).toBeVisible();
  const before = await viewport.getAttribute("style");
  const canvas = page.locator('[data-high-level-workflow-view] .react-flow__pane');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(
    (box?.x || 0) + (box?.width || 0) / 2,
    (box?.y || 0) + (box?.height || 0) / 2,
  );
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(450);
  const after = await viewport.getAttribute("style");
  expect(after).not.toBe(before);
});

test("Opportunity Qualification is completely removed from the workflow", async ({ page }) => {
  await openLayer2(page);
  await expect(
    page.getByRole("button", { name: "Opportunity Qualification" }),
  ).toHaveCount(0);
  await expect(page.locator('[data-id^="opportunity"]')).toHaveCount(0);
});

test("retired matrix nodes are not addable or present in L2", async ({ page }) => {
  await openLayer2(page);
  await expect(page.getByRole("button", { name: /Approval Matrix/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Responsibility Matrix/ })).toHaveCount(0);
  await expect(page.locator('[data-id="approval-matrix"]')).toHaveCount(0);
  await expect(page.locator('[data-id="responsibility-lane"]')).toHaveCount(0);
});

test("the execution view releases when every required file is checked", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await openExecution(page, "pre-construction");
  const checklist = page.getByTestId("required-file-checklist");
  const files = checklist.locator('input[type="checkbox"]');
  const count = await files.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await files.nth(index).check();
  }
  await expect(page.getByText("PRE-CONSTRUCTION is ready to release.", { exact: true })).toBeVisible();
});

test("the execution view does not expose execution-item editing", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await openExecution(page, "pre-construction");
  await expect(page.getByTestId("required-file-checklist")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit execution item/ })).toHaveCount(0);
  await expect(page.getByLabel("Applicability decision")).toHaveCount(0);
});


test("mobile L1 and L3 remain within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLayer1(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  await openExecution(page, "pre-construction");
  await expect(page.getByText("L3 · Execution Layer")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test("L2 release condition text click opens L3 with 3-box architecture: Legal, Customer, Supporting", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  // Open L2
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();

  // Find a release condition text button in L2 and click it
  const conditionBtn = page.getByRole("button", { name: /Open L3 details for release condition/ }).first();
  await expect(conditionBtn).toBeVisible();
  await conditionBtn.click();

  // Verify L3 interface is displayed with the 3 boxes
  await expect(page.getByText("L3 · Execution Layer")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Legal Documents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customer Information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supporting Documents" })).toBeVisible();

  // Verify Customer Information is a Form list with Add button
  await expect(page.getByRole("button", { name: "Add Customer Information Form" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Legal Document" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Supporting Document" })).toBeVisible();

  // Verify Add Legal Document works to add a form to the clean L3 list
  await page.getByRole("button", { name: "Add Legal Document" }).click();
  await expect(page.getByRole("heading", { name: "Add Legal Document" })).toBeVisible();
  await page.getByPlaceholder("e.g. Master Services Agreement").fill("Test Contract Document");
  await page.getByRole("button", { name: "Add to L3 List" }).click();
  await expect(page.getByText("Test Contract Document")).toBeVisible();

  // Verify navigation Back to L2 works
  await page.getByRole("button", { name: "Back to L2" }).click();
  await expect(page.locator('[data-id="gate-g1-qualified"]')).toBeVisible();

  // Verify Upload Forms button in top toolbar opens dialog
  await page.getByRole("button", { name: "Upload Forms" }).click();
  await expect(page.getByText("Cloudflare R2 Document Center")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
});

test("L2 node palette includes Phase and Gate, and supports adding them", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/");
  // Open L2
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();

  // Verify Phase and Gate exist in the palette
  const phaseBtn = page.getByRole("button", { name: /Phase Phase frame covering workflow steps/ });
  const gateBtn = page.getByRole("button", { name: /Gate Phase completion gate & signoff/ });
  await expect(phaseBtn).toBeVisible();
  await expect(gateBtn).toBeVisible();

  // Double clicking Phase adds a Phase node
  await phaseBtn.dblclick();
  await expect(page.locator(".l2-phase-card")).toBeVisible();

  // Click on the Phase header to select it and open Inspector
  await page.locator(".phase-drag-handle").first().click();

  // Verify Inspector displays Included Steps section
  await expect(page.getByText(/Included Steps in Phase/)).toBeVisible();
  await expect(page.getByText(/Select independent steps/)).toBeVisible();

  // Double clicking Gate adds a Gate node
  await gateBtn.dblclick();
  await expect(page.locator('[data-testid="gate-card"]').first()).toBeVisible();
});


