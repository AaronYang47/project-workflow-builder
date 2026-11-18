import { expect, test } from "playwright/test";
import { createE2EWorkflow, seedE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

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

test("typing into every L5 number and date box works like a normal form", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/construction-simulation");
  const card = page.locator("[data-sim-project]").first();
  const box = (label: string) => card.getByLabel(label, { exact: true });

  // Replace a value by clearing and typing, key by key.
  for (const [label, typed] of [
    ["Modules", "25"],
    ["Weeks per module", "6.5"],
  ] as const) {
    await box(label).click();
    await box(label).press("ControlOrMeta+a");
    await box(label).press("Backspace");
    // Empty while typing: kept empty, marked invalid, nothing recalculated.
    await expect(box(label)).toHaveValue("");
    await expect(box(label)).toHaveAttribute("aria-invalid", "true");
    await box(label).pressSequentially(typed);
    await expect(box(label)).toHaveValue(typed);
    await expect(box(label)).toHaveAttribute("aria-invalid", "false");
  }
  // The new values drive the simulation: 25 modules at a 6.5-week pace.
  await page.getByRole("button", { name: "Jump to end" }).click();
  await expect(page.locator("[data-sim-row]").first()).toBeVisible();

  // Leaving a box with nonsense puts the last good value back.
  await box("Modules").fill("abc");
  await box("Modules").blur();
  await expect(box("Modules")).toHaveValue("25");

  for (const label of ["Yard holds (modules)", "Install crews"]) {
    const field = page.getByLabel(label, { exact: true });
    await field.click();
    await field.press("ControlOrMeta+a");
    await field.pressSequentially("30");
    await expect(field).toHaveValue("30");
  }

  // Ship & install fields.
  await card.getByRole("radio", { name: "Ship & install" }).click();
  for (const [label, typed] of [
    ["Transport days", "3"],
    ["Modules shipped per day", "2"],
    ["Installed per day", "5"],
    ["Finishing days", "7"],
  ] as const) {
    await box(label).click();
    await box(label).press("ControlOrMeta+a");
    await box(label).pressSequentially(typed);
    await expect(box(label)).toHaveValue(typed);
  }

  // A date outside 2000–2100 (for example a half-typed year) is not used.
  const before = await page.locator("[data-sim-row]").first().textContent();
  await box("Earliest line start").fill("0002-05-02");
  await expect(page.locator("[data-sim-row]").first()).toHaveText(before!);
  await box("Earliest line start").blur();
  await expect(box("Earliest line start")).not.toHaveValue("0002-05-02");
  await box("Due date").fill("2030-06-30");
  await expect(box("Due date")).toHaveValue("2030-06-30");
});

test("the production calendar ticks off finished work and flags problems", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Add virtual" }).click();
  const calendar = page.locator("[data-production-calendar]");
  await expect(calendar).toBeVisible();

  await page.getByRole("button", { name: "Back to start" }).click();
  await expect(calendar.locator('[data-done="true"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Jump to end" }).click();
  const doneDays = await calendar.locator('[data-done="true"]').count();
  expect(doneDays).toBeGreaterThan(5);
  await expect(calendar.locator("[data-calendar-built]")).toContainText("30/30 modules built");

  // A tiny yard stops the line, and the virtual project then misses its date.
  const yard = page.getByLabel("Yard holds (modules)", { exact: true });
  await yard.click();
  await yard.press("ControlOrMeta+a");
  await yard.pressSequentially("1");
  await page.getByRole("button", { name: "Jump to end" }).click();
  await expect(calendar.locator('[data-warning="true"]').first()).toBeVisible();
  await expect(calendar).toContainText(/warnings so far/);

  // Clicking a calendar day moves the playback there.
  const day = calendar.locator('[data-done="true"]').first();
  const date = await day.getAttribute("data-calendar-day");
  await day.click();
  await expect(page.locator("[data-playback-date]")).toContainText(
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" }),
  );
  await calendar.screenshot({
    path: "/private/tmp/claude-501/-Users-aaronyanf-Desktop-Project-Workflow-Builder/478ea515-b380-447c-914e-93aa2d7d44b4/scratchpad/l5-calendar.png",
  });
});

test("modules and weeks set on L4 carry into L5", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/process-overview");
  await page.getByRole("button", { name: "Factory line inputs" }).click();
  const modules = page.getByLabel("Project modules", { exact: true });
  await modules.click();
  await modules.press("ControlOrMeta+a");
  await modules.pressSequentially("30");
  const weeks = page.getByLabel("Project weeks per module", { exact: true });
  await weeks.click();
  await weeks.press("ControlOrMeta+a");
  await weeks.pressSequentially("5");
  await expect(page.getByRole("button", { name: "Factory line inputs" })).toContainText(
    "30 modules · 5 wk",
  );
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  const card = page.locator("[data-sim-project]").first();
  await expect(card.getByLabel("Modules", { exact: true })).toHaveValue("30");
  await expect(card.getByLabel("Weeks per module", { exact: true })).toHaveValue("5");
});

test("a saved project can be refreshed from its L4", async ({ page }) => {
  const file = createE2EWorkflow();
  file.factoryProduction = { modules: 22, weeksPerModule: 3 };
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false, activeProjectId: "p1" },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  const card = page.locator('[data-sim-project="cloud-p1"]');
  const modules = card.getByLabel("Modules", { exact: true });
  await expect(modules).toHaveValue("22");
  await modules.click();
  await modules.press("ControlOrMeta+a");
  await modules.pressSequentially("10");
  await expect(modules).toHaveValue("10");
  await card.getByRole("button", { name: /Refresh .* from L4/ }).click();
  await expect(modules).toHaveValue("22");
  await expect(card.getByLabel("Production Phase")).toBeVisible();
  await expect(page.locator("[data-sim-notice]")).toContainText("refreshed from its L4");
});

test("scenarios are saved to and loaded from the account", async ({ page }) => {
  const stored = new Map<string, { id: string; name: string }>();
  stored.set("cloud-1", {
    id: "cloud-1",
    name: "Cloud plan",
    factory: {
      targetOnLine: 18,
      normalMax: 19,
      crowdedMax: 23,
      yardCapacity: 24,
      installCrews: 2,
      startDate: "2027-01-04",
    },
    projects: [],
  } as never);
  const calls: string[] = [];
  await page.route("**/api/simulation-scenarios**", async (route) => {
    const request = route.request();
    calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (request.method() === "GET")
      return route.fulfill({ json: { scenarios: [...stored.values()] } });
    if (request.method() === "PUT") {
      const { scenario } = request.postDataJSON();
      stored.set(scenario.id, scenario);
      return route.fulfill({ json: { saved: true, id: scenario.id } });
    }
    stored.delete(decodeURIComponent(new URL(request.url()).pathname.split("/").pop()!));
    return route.fulfill({ json: { deleted: true } });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "construction-simulation:scenarios:v1",
      JSON.stringify([
        {
          id: "local-1",
          name: "Browser plan",
          factory: {
            targetOnLine: 18,
            normalMax: 19,
            crowdedMax: 23,
            yardCapacity: 24,
            installCrews: 2,
            startDate: "2027-01-04",
          },
          projects: [],
        },
      ]),
    );
  });
  await seedE2EWorkflow(page);
  await page.goto("/construction-simulation");
  const picker = page.getByLabel("Saved scenarios");
  await expect(picker.locator("option", { hasText: "Cloud plan" })).toHaveCount(1);
  await expect(picker.locator("option", { hasText: "Browser plan" })).toHaveCount(1);
  // The browser-only scenario is uploaded.
  await expect.poll(() => stored.has("local-1")).toBe(true);

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Scenario name").fill("Plan B");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-sim-notice]")).toContainText("Saved “Plan B” to your account");
  expect([...stored.values()].some((item) => item.name === "Plan B")).toBe(true);

  await page.getByRole("button", { name: "Delete scenario" }).click();
  await expect.poll(() => [...stored.values()].some((item) => item.name === "Plan B")).toBe(false);
  expect(calls.some((call) => call.startsWith("DELETE"))).toBe(true);
});

test("the factory calendar can customise single years", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Factory calendar years" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Factory working days");
  await expect(dialog.getByLabel("Simulation start", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Customize a year", exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "Shutdown year" })).toBeVisible();
  await page.getByRole("button", { name: "Apply calendar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("L5 exports a two-page PDF: results, then the production calendar", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^L5-simulation-.*\.pdf$/);
  const path = testInfo.outputPath("l5.pdf");
  await download.saveAs(path);
  const { readFile } = await import("node:fs/promises");
  const pdf = (await readFile(path)).toString("latin1");
  expect((pdf.match(/\/Type\s*\/Page\b/g) || []).length).toBe(2);
  expect(pdf).toContain("L5 Construction Simulation");
});
