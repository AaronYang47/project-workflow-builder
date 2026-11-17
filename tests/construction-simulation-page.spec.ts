import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

test("L5 opens from the toolbar, simulates projects and saves a scenario", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/process-overview");
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  await expect(page).toHaveURL(/construction-simulation/);
  await expect(page.getByRole("heading", { name: "Construction Simulation" })).toBeVisible();

  // The open project is already in the simulation.
  await expect(page.locator("[data-sim-project]")).toHaveCount(1);
  await page.getByRole("button", { name: "Add virtual" }).click();
  await page.getByRole("button", { name: "Add virtual" }).click();
  await expect(page.locator("[data-sim-project]")).toHaveCount(3);
  await expect(page.locator("[data-sim-row]")).toHaveCount(3);
  await expect(page.locator('[data-sim-bar="line"]')).toHaveCount(3);

  await page.getByRole("button", { name: "Auto schedule" }).click();
  await expect(page.locator("[data-sim-notice]")).toContainText(/Best order found/);

  await page.getByLabel("Scenario name").fill("Plan A");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-sim-notice]")).toContainText("Saved “Plan A”");
  await page.screenshot({
    path: "/private/tmp/claude-501/-Users-aaronyanf-Desktop-Project-Workflow-Builder/478ea515-b380-447c-914e-93aa2d7d44b4/scratchpad/l5.png",
  });
  await page.reload();
  await expect(page.getByLabel("Saved scenarios")).toHaveValue(/scenario-/);
  await expect(page.getByLabel("Scenario name")).toHaveValue("Plan A");
  await expect(page.locator("[data-sim-project]")).toHaveCount(3);
});

test("the factory plays day by day: modules move along the line into the yard", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/construction-simulation");
  const playback = page.locator("[data-factory-playback]");
  await expect(playback).toBeVisible();
  await page.getByRole("button", { name: "Add virtual" }).click();

  const slider = page.getByRole("slider", { name: "Simulation day" });
  const max = Number(await slider.getAttribute("max"));
  expect(max).toBeGreaterThan(20);

  // About a third of the way in, the line is busy.
  await slider.fill(String(Math.round(max * 0.3)));
  await expect(page.locator("[data-line-module]").first()).toBeVisible();
  const onLine = Number(await page.locator("[data-playback-on-line]").textContent());
  expect(onLine).toBeGreaterThan(0);
  expect(onLine).toBeLessThanOrEqual(19);
  await page.waitForTimeout(400);
  await playback.screenshot({
    path: "/private/tmp/claude-501/-Users-aaronyanf-Desktop-Project-Workflow-Builder/478ea515-b380-447c-914e-93aa2d7d44b4/scratchpad/l5-anim-1.png",
  });

  // Play moves the day forward.
  const before = await page.locator("[data-playback-date]").textContent();
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause" }).click();
  expect(await page.locator("[data-playback-date]").textContent()).not.toBe(before);

  await slider.fill(String(Math.round(max * 0.65)));
  await page.waitForTimeout(400);
  await playback.screenshot({
    path: "/private/tmp/claude-501/-Users-aaronyanf-Desktop-Project-Workflow-Builder/478ea515-b380-447c-914e-93aa2d7d44b4/scratchpad/l5-anim-2.png",
  });
});

test("playback opens on the first production day and explains an idle line before it", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/construction-simulation");
  const card = page.locator("[data-sim-project]").first();
  const start = await page.getByLabel("Simulation start").inputValue();
  const later = new Date(Date.parse(`${start}T00:00:00Z`) + 60 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await card.getByLabel("Earliest line start").fill(later);
  await page.reload();
  await card.getByLabel("Earliest line start").fill(later);

  // Opens with modules already on the line.
  await expect(page.locator("[data-line-module]").first()).toBeVisible();
  await expect(page.locator("[data-line-idle]")).toHaveCount(0);

  await page.getByRole("button", { name: "Back to start" }).click();
  await expect(page.locator("[data-line-idle]")).toContainText("production starts");
  await page.getByRole("button", { name: "Jump to first module" }).click();
  await expect(page.locator("[data-line-idle]")).toHaveCount(0);
  await expect(page.locator("[data-line-module]").first()).toBeVisible();
});
