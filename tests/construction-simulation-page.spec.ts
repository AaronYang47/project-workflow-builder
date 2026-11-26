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

  // No scenario box: what is typed in is saved automatically.
  await expect(page.getByRole("region", { name: "Scenario" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            JSON.parse(localStorage.getItem("construction-simulation:scenarios:v1") ?? "[]") as {
              projects: unknown[];
            }[]
          )[0]?.projects.length,
      ),
    )
    .toBe(3);
  await page.screenshot({
    path: "/private/tmp/claude-501/-Users-aaronyanf-Desktop-Project-Workflow-Builder/478ea515-b380-447c-914e-93aa2d7d44b4/scratchpad/l5.png",
  });
  await page.reload();
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
  const scene = page.locator("[data-factory-scene]");
  await expect(scene.locator("[data-roller-track]")).toBeVisible();
  await expect(scene.locator("[data-yard-floor-plan]")).toBeVisible();
  await expect(page.getByRole("region", { name: "Production line 3D view" })).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom in factory" }).click();
  await expect(scene).toHaveCSS("width", /px$/);
  await expect(scene).toHaveAttribute("style", "width: 150%;");
  await page.getByRole("button", { name: "Reset factory zoom" }).click();
  await expect(scene).toHaveAttribute("style", "width: 100%;");
  await page.getByRole("button", { name: "Add virtual" }).click();

  const slider = page.getByRole("slider", { name: "Simulation day" });
  const max = Number(await slider.getAttribute("max"));
  expect(max).toBeGreaterThan(20);

  // Two weeks after the first module goes on, the line is busy.
  const first = Number(await slider.inputValue());
  await slider.fill(String(first + 14));
  await expect(page.locator("[data-line-module]").first()).toBeVisible();
  const onLine = Number(await page.locator("[data-playback-on-line]").textContent());
  expect(onLine).toBeGreaterThan(0);
  expect(onLine).toBeLessThanOrEqual(19);
  await expect(page.locator("[data-line-module]")).toHaveCount(onLine);
  await expect(page.locator("[data-inventory-line-count]")).toHaveText(String(onLine));
  const yardCount = Number(await page.locator("[data-inventory-yard-count]").textContent());
  await expect(page.locator("[data-yard-module]")).toHaveCount(yardCount);
  await expect(scene.locator("[data-scene-line-module]")).toHaveCount(onLine);
  await expect(page.locator("[data-line-module] image")).toHaveCount(onLine);
  await expect(
    page
      .locator('[data-line-module] image[href="/simulation-assets/module-building.webp"]')
      .first(),
  ).toBeVisible();
  expect((await page.request.get("/simulation-assets/module-building.webp")).ok()).toBe(true);

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
  const laterLine = Number(await page.locator("[data-playback-on-line]").textContent());
  const laterYard = Number(await page.locator("[data-inventory-yard-count]").textContent());
  await expect(page.locator("[data-line-module]")).toHaveCount(laterLine);
  await expect(page.locator("[data-yard-module]")).toHaveCount(laterYard);
  await expect(page.locator("[data-inventory-factory-count]")).toHaveText(
    String(laterLine + laterYard),
  );

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
  await expect(page.getByLabel("Simulation start")).toHaveCount(0);
  await expect(card.getByLabel("Due date")).toBeVisible();
  // Friday starts the time axis, while the first load is the next working day.
  await card.getByLabel("Earliest line start").fill("2027-02-05");

  // Opens with modules already on the line.
  await expect(page.locator("[data-line-module]").first()).toBeVisible();
  await expect(page.locator("[data-line-idle]")).toHaveCount(0);

  await page.getByRole("button", { name: "Back to start" }).click();
  await expect(page.locator("[data-line-idle]")).toContainText("production starts");
  await expect(page.locator("[data-playback-date]")).toContainText("05 Feb 2027");
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

  // Install crews only show for Ship & install.
  await expect(
    page.getByRole("region", { name: "Factory" }).getByLabel("Install crews", { exact: true }),
  ).toHaveCount(0);
  for (const label of ["Yard holds (modules)"]) {
    const field = page.getByLabel(label, { exact: true });
    await field.click();
    await field.press("ControlOrMeta+a");
    await field.pressSequentially("30");
    await expect(field).toHaveValue("30");
  }

  // Ship & install fields.
  await card.getByRole("radio", { name: "Ship & install" }).click();
  for (const [label, typed] of [
    ["Install crews", "4"],
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
});

test("the production calendar opens as a glass popup, ticks off work and flags problems", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Add virtual" }).click();
  const calendar = page.locator("[data-production-calendar]");
  const openCalendar = () => page.getByRole("button", { name: "Production calendar" }).click();
  const closeCalendar = () =>
    page.getByRole("button", { name: "Close production calendar" }).click();
  await expect(calendar).toHaveCount(0);

  await page.getByRole("button", { name: "Back to start" }).click();
  await openCalendar();
  await expect(page.locator("[data-production-calendar-dialog]")).toHaveClass(/liquid-glass-panel/);
  await expect(calendar.locator('[data-done="true"]')).toHaveCount(0);
  await closeCalendar();

  await page.getByRole("button", { name: "Jump to end" }).click();
  await openCalendar();
  expect(await calendar.locator('[data-done="true"]').count()).toBeGreaterThan(5);
  await expect(calendar.locator("[data-calendar-built]")).toContainText("30/30 modules built");
  await closeCalendar();

  // A tiny yard stops the line, and the virtual project then misses its date.
  const yard = page.getByLabel("Yard holds (modules)", { exact: true });
  await yard.click();
  await yard.press("ControlOrMeta+a");
  await yard.pressSequentially("1");
  await page.getByRole("button", { name: "Jump to end" }).click();
  await openCalendar();
  await expect(calendar.locator('[data-warning="true"]').first()).toBeVisible();
  await expect(calendar).toContainText(/warnings so far/);

  // Clicking a calendar day moves the playback there.
  const day = calendar.locator('[data-done="true"]').first();
  const date = await day.getAttribute("data-calendar-day");
  await day.click();
  await expect(page.locator("[data-production-calendar-dialog]")).toContainText(date!);
});

test("the inputs collapse with the same edge toggle as L1 and L2", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  const inputs = page.getByRole("complementary", { name: "Simulation inputs" });
  await expect(inputs).toBeVisible();
  // No panel buttons in the toolbar on L5.
  await expect(page.getByRole("button", { name: "Toggle inputs" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle node library" })).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse simulation inputs" }).click();
  await expect(inputs).toBeHidden();
  // With the inputs hidden, the playback sits to the right of the charts.
  const charts = await page.locator("[data-simulation-results]").boundingBox();
  const playback = await page.locator("[data-factory-playback]").boundingBox();
  expect(playback!.x).toBeGreaterThan(charts!.x + charts!.width - 1);
  await page.getByRole("button", { name: "Open simulation inputs" }).click();
  await expect(inputs).toBeVisible();
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
  // The browser-only scenario is uploaded, and changes are saved to the account.
  await expect.poll(() => stored.has("local-1")).toBe(true);
  await page.getByRole("button", { name: "Add virtual" }).click();
  await expect
    .poll(() => (stored.get("local-1") as unknown as { projects: unknown[] }).projects.length)
    .toBe(1);
  expect(calls.some((call) => call.startsWith("PUT"))).toBe(true);
});

test("the factory calendar can customise single years", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Factory calendar years" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Factory working days");
  await expect(dialog.getByLabel("Simulation start", { exact: true })).toHaveCount(0);
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

test("FOB yard projects take a batch size and truck delay", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Add virtual" }).click();
  const card = page.locator("[data-sim-project]").last();
  const fob = card.locator("[data-fob-pickup]");
  // Worked out from the line, or set by hand.
  const pickup = fob.getByLabel("Earliest pickup date");
  await expect(pickup).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  const auto = await pickup.textContent();
  await expect(fob).toContainText("(12 modules + 18 line places − 1) × 4 weeks ÷ 18");
  await fob.getByLabel("Set my own pickup date").check();
  await expect(fob.getByLabel("Earliest pickup date")).toHaveValue(auto!);
  await expect(fob).toContainText(`Auto would be ${auto}`);
  await fob.getByLabel("Set my own pickup date").uncheck();
  await expect(fob.getByLabel("Earliest pickup date")).toHaveText(auto!);
  const batch = fob.getByLabel("Customer collects every (modules)");
  await batch.click();
  await batch.press("ControlOrMeta+a");
  await batch.pressSequentially("4");
  await expect(fob).toContainText("collects 4 at a time");
  await expect(fob.getByLabel("Days until the truck arrives")).toHaveCount(0);
});

test("the charts and timeline follow the playback day, and clicking a chart jumps there", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Add virtual" }).click();
  const lineChart = page.locator('[data-daily-chart="Modules on the line each day"]');
  const label = lineChart.locator("[data-chart-current]");
  const pen = lineChart.locator("[data-chart-pen]");
  const leftOf = async () =>
    Number((await pen.getAttribute("style"))!.match(/left: ([\d.]+)%/)![1]);
  // Like an ECG: the trace is only drawn up to the playback day.
  const tracePoints = async () =>
    (await lineChart.locator("[data-chart-trace]").getAttribute("points"))!.trim().split(/\s+/)
      .length;

  await page.getByRole("button", { name: "Back to start" }).click();
  expect(await leftOf()).toBe(0);
  expect(await tracePoints()).toBe(1);
  const startLabel = await label.textContent();
  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  expect(await tracePoints()).toBe(3);
  await page.getByRole("button", { name: "Jump to end" }).click();
  expect(await leftOf()).toBe(100);
  const days = Number(
    await page.getByRole("slider", { name: "Simulation day" }).getAttribute("max"),
  );
  expect(await tracePoints()).toBe(days + 1);
  await expect(label).not.toHaveText(startLabel!);
  await expect(page.locator("[data-timeline-playhead]").first()).toBeVisible();
  await expect(page.locator("[data-timeline-playhead-label]")).toBeVisible();

  // Clicking the middle of the chart moves the factory there.
  const box = (await lineChart.locator(".cursor-crosshair").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const middle = await leftOf();
  expect(middle).toBeGreaterThan(40);
  expect(middle).toBeLessThan(60);
  const date = (await label.textContent())!.split(" · ")[0];
  await expect(page.locator("[data-playback-date]")).toContainText(date.slice(0, 6));

  // The Today card follows too.
  await expect(page.locator("[data-day-activity]")).toBeVisible();
});

test("the event list scrolls, keeps the newest on top and merges repeats; columns line up", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await page.getByRole("button", { name: "Add virtual" }).click();
  const yard = page.getByLabel("Yard holds (modules)", { exact: true });
  await yard.click();
  await yard.press("ControlOrMeta+a");
  await yard.pressSequentially("1");
  await page.getByRole("button", { name: "Collapse simulation inputs" }).click();
  await page.getByRole("button", { name: "Jump to end" }).click();
  const list = page.locator("[data-event-list]");
  await expect(list).toHaveCSS("overflow-y", "auto");
  await expect(list.locator("li").first()).toHaveClass(/font-semibold/);
  // Days in a row of "Line stopped" become one row with a count.
  await expect(list).toContainText("×");
  // The factory column reaches as far down as the charts column.
  const left = (await page.locator("[data-day-activity]").boundingBox())!;
  const right = (await page.locator("[data-factory-playback]").boundingBox())!;
  expect(Math.abs(left.y + left.height - (right.y + right.height))).toBeLessThan(4);
});

test("Earliest line start can't be before the production Phase starts in L4", async ({ page }) => {
  const file = createE2EWorkflow();
  file.calendar = { startDate: "2027-01-04", shutdowns: [] };
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
  // Pick a later production Phase so its L4 start is after the calendar start.
  const phase = card.getByLabel("Production Phase");
  const options = await phase
    .locator("option")
    .evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
  await phase.selectOption(options.at(-1)!);
  const hint = card.locator("[data-l4-start-limit]");
  await expect(hint).toContainText("earlier dates can't be chosen");
  const start = card.getByLabel("Earliest line start", { exact: true });
  const limit = (await start.getAttribute("min"))!;
  expect(await start.inputValue()).toBe(limit);

  // An earlier date is refused and the box returns to the L4 date.
  const before = new Date(Date.parse(`${limit}T00:00:00Z`) - 10 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await start.fill(before);
  await expect(start).toHaveAttribute("aria-invalid", "true");
  await start.blur();
  await expect(start).toHaveValue(limit);
  // A later date is fine.
  const after = new Date(Date.parse(`${limit}T00:00:00Z`) + 10 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await start.fill(after);
  await expect(start).toHaveValue(after);
  await expect(hint).not.toContainText("Before L4 allows");
});

test("factory inventory counts each finished module waiting in the yard", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "construction-simulation:scenarios:v1",
      JSON.stringify([
        {
          id: "yard-count-check",
          name: "Yard count check",
          factory: {
            startDate: "2027-01-01",
            targetOnLine: 18,
            normalMax: 19,
            crowdedMax: 23,
            yardCapacity: 24,
            installCrews: 2,
          },
          projects: [
            {
              id: "inventory-project",
              name: "Inventory project",
              color: "#2563eb",
              source: { kind: "virtual" },
              modules: 4,
              weeksPerModule: 1,
              splittable: false,
              earliestStart: "2027-01-01",
              dueDate: "2027-02-10",
              delivery: { kind: "fob", pickupDate: "2027-02-01", pickupCustom: true },
            },
          ],
        },
      ]),
    );
  });
  await page.goto("/construction-simulation");
  await page.getByRole("slider", { name: "Simulation day" }).fill("20");
  await expect(page.locator("[data-inventory-line-count]")).toHaveText("0");
  await expect(page.locator("[data-inventory-yard-count]")).toHaveText("4");
  await expect(page.locator("[data-inventory-factory-count]")).toHaveText("4");
  await expect(page.locator("[data-yard-module]")).toHaveCount(4);
  await expect(page.locator("[data-scene-yard-module]")).toHaveCount(4);
  await expect(page.locator("[data-yard-bay]")).toHaveCount(24);
  await expect(page.locator("[data-line-module]")).toHaveCount(0);
  await expect(page.locator("[data-truck-departure]")).toHaveCount(0);
  await page.getByRole("button", { name: "Jump to end" }).click();
  const truck = page.locator("[data-truck-departure]");
  await expect(truck).toHaveAttribute("data-departure-count", "4");
  await expect(truck.locator("title")).toHaveText(/4 modules picked up/);
  await expect(truck.locator("[data-loaded-flatbed]")).toBeVisible();
  const movement = truck.locator(":scope > g");
  await expect(movement).toHaveCSS("animation-name", "factory-truck-departure");
  // The pickup follows the playback speed: 2.6 s at 1 day/s, a third of that at 3 days/s.
  await expect(movement).toHaveCSS("animation-duration", "0.867s");
  await page.getByRole("radio", { name: "1 d/s" }).click();
  await expect(movement).toHaveCSS("animation-duration", "2.6s");
  // At 1 day/s the pickup day stays on screen until the truck has left.
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(truck).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("the dashboard and playback stay within the viewport on desktop and phone", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/construction-simulation");

  const fit = async (selector: string) => {
    const item = page.locator(selector).first();
    await expect(item).toBeVisible();
    const box = (await item.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  };
  const noPageScroll = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
  };

  await expect(page.getByRole("complementary", { name: "Simulation inputs" })).toBeVisible();
  await fit("[data-simulation-results]");
  await fit("[data-day-activity]");
  await fit("[data-factory-playback]");
  await fit('input[aria-label="Simulation day"]');
  await noPageScroll();

  const slider = page.getByRole("slider", { name: "Simulation day" });
  const lastDay = Number(await slider.getAttribute("max"));
  await slider.fill(String(Math.round(lastDay * 0.35)));
  const cards = page.locator("[data-line-module]");
  expect(await cards.count()).toBeGreaterThan(10);
  const inventory = page.getByRole("region", { name: "Production modules" });
  const list = inventory.locator("h3 + div");
  const checkFullCard = async (card: typeof cards) => {
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    const image = (await card.locator("svg").boundingBox())!;
    const frame = (await list.boundingBox())!;
    expect(image.y + image.height).toBeLessThan(box.y + box.height);
    expect(image.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(image.y + image.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  };
  await checkFullCard(cards.first());
  await checkFullCard(cards.last());
  await noPageScroll();

  await page.setViewportSize({ width: 390, height: 844 });
  await fit("[data-factory-scene]");
  await fit('input[aria-label="Simulation day"]');
  await page
    .getByRole("navigation", { name: "Simulation view" })
    .getByRole("button", { name: "Results" })
    .click();
  await fit("[data-simulation-results]");
  await fit("[data-day-activity]");
  await page
    .getByRole("navigation", { name: "Simulation view" })
    .getByRole("button", { name: "Inputs" })
    .click();
  await expect(page.getByRole("complementary", { name: "Simulation inputs" })).toBeVisible();
  await noPageScroll();
});

test("factory days off show their Calendar type and the scene keeps its size", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "construction-simulation:scenarios:v1",
      JSON.stringify([
        {
          id: "day-off-check",
          name: "Day off check",
          factory: {
            targetOnLine: 18,
            normalMax: 19,
            crowdedMax: 23,
            yardCapacity: 50,
            installCrews: 2,
            calendar: {
              startDate: "2027-09-01",
              workWeek: "mon-thu",
              holidayRegion: "CA-ON",
              shutdowns: [],
            },
          },
          projects: [
            {
              id: "day-off-project",
              name: "Day off project",
              color: "#2563eb",
              source: { kind: "virtual" },
              modules: 18,
              weeksPerModule: 4,
              splittable: false,
              earliestStart: "2027-09-01",
              dueDate: "2027-12-31",
              delivery: { kind: "fob", pickupDate: "2027-09-01" },
            },
          ],
        },
      ]),
    );
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  const slider = page.getByRole("slider", { name: "Simulation day" });
  await expect(slider).toBeVisible();
  // Day 0 is 2027-09-01, so Thanksgiving (Mon 11 Oct 2027) is day 40.
  // One bay per yard space, all inside the scene.
  await expect(page.locator("[data-yard-bay]")).toHaveCount(50);
  const sceneBox = (await page.locator("[data-factory-scene]").boundingBox())!;
  const lastBay = (await page.locator('[data-yard-bay="50"]').boundingBox())!;
  expect(lastBay.x + lastBay.width).toBeLessThanOrEqual(sceneBox.x + sceneBox.width);
  // The scene fills its box side to side as well as top to bottom.
  const frameBox = (await page.locator("[data-factory-scene]").locator("xpath=..").boundingBox())!;
  const drawn = await page.locator("[data-roller-track] rect").first().boundingBox();
  expect(drawn!.width).toBeGreaterThan(frameBox.width * 0.9);
  await slider.fill("40");
  await expect(page.locator("[data-playback-date]")).toContainText("11 Oct 2027");
  await expect(page.locator("[data-playback-day-off]")).toHaveText(
    "Day off · Stat holiday · Thanksgiving Day",
  );
  await expect(page.locator('[data-scene-day-off="statutory"]')).toContainText(
    "DAY OFF · STAT HOLIDAY · THANKSGIVING DAY",
  );
  // Friday is the Mon–Thu week's weekend.
  await slider.fill("44");
  await expect(page.locator('[data-scene-day-off="weekend"]')).toContainText("DAY OFF · WEEKEND");
  // The scene keeps its size; the inventory lists scroll inside it.
  const scene = (await page.locator("[data-factory-scene]").boundingBox())!;
  await slider.fill("10");
  expect((await page.locator("[data-factory-scene]").boundingBox())!.height).toBeCloseTo(
    scene.height,
    0,
  );
  const cards = page.locator("[data-line-module]");
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last()).toBeInViewport();
});

test("L5 adds a Factory Production row below the chosen L4 release condition", async ({ page }) => {
  const file = createE2EWorkflow();
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
  await page.goto("/process-overview");
  const firstTitle = (await page.locator("[data-gantt-task]").allTextContents()).length;
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  const card = page.locator('[data-sim-project="cloud-p1"]');
  await expect(card.getByLabel("Add below")).toBeDisabled();
  await card.getByLabel("Department").selectOption({ label: "Department Lifecycle Phase" });
  await card.getByLabel("Add below").selectOption({ index: 1 });
  const anchor = (await card.getByLabel("Add below").locator("option:checked").textContent())!;
  await expect(card.locator("[data-l4-start-text]")).toContainText("finishes.");
  const status = card.locator("[data-l4-target-status]");
  await expect(status).toContainText(/a Factory Production row below .*: \d+ days on the line/);
  const days = Number((await status.textContent())!.match(/: (\d+) days on the line/)![1]);
  await expect(card.getByRole("button", { name: /Write .* to L4/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Open Process Overview" }).click();
  const tasks = page.locator("[data-gantt-task]");
  await expect(tasks).toHaveCount(firstTitle + 1);
  const titles = await tasks.evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-gantt-task")),
  );
  expect(titles[titles.indexOf(anchor) + 1]).toBe("Factory Production");
  const row = page.locator('[data-gantt-task="Factory Production"]');
  await expect(row).toContainText(`L5 · ${days} days on the line · follows L5`);
  await expect(row.getByRole("button", { name: /Edit timing|Remove L5 data/ })).toHaveCount(0);
  // The chosen release condition itself has no L5 data.
  await expect(page.locator(`[data-gantt-task="${anchor}"] [data-l5-simulated-days]`)).toHaveCount(
    0,
  );

  // Choosing no Department in L5 takes the row out of L4.
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  await card.getByLabel("Department").selectOption("");
  await expect(status).toContainText("Choose a Department and a step");
  await page.getByRole("link", { name: "Open Process Overview" }).click();
  await expect(tasks).toHaveCount(firstTitle);
  await expect(row).toHaveCount(0);

  // Removing the project from L5 takes its row out of L4 straight away.
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  await card.getByLabel("Department").selectOption({ label: "Department Lifecycle Phase" });
  await card.getByLabel("Add below").selectOption({ index: 1 });
  await page.getByRole("link", { name: "Open Process Overview" }).click();
  await expect(row).toHaveCount(1);
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  await card.getByRole("button", { name: /^Remove / }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("link", { name: "Open Process Overview" }).click();
  await expect(row).toHaveCount(0);
});

test("a big FOB project collected one at a time finishes; a stuck one still shows its line bar", async ({
  page,
}) => {
  const scenario = (batchSize: number) => ({
    id: `big-${batchSize}`,
    name: `Big ${batchSize}`,
    factory: { targetOnLine: 18, normalMax: 19, crowdedMax: 23, yardCapacity: 50, installCrews: 2 },
    projects: [
      {
        id: "big",
        name: "Big project",
        color: "#2563eb",
        source: { kind: "virtual" },
        modules: 200,
        weeksPerModule: 2,
        splittable: false,
        earliestStart: "2027-08-25",
        dueDate: "2028-12-31",
        delivery: { kind: "fob", pickupDate: "2027-08-25", batchSize },
      },
    ],
  });
  await page.addInitScript(
    (scenarios) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("construction-simulation:scenarios:v1", JSON.stringify(scenarios));
    },
    [scenario(1)],
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  const row = page.locator('[data-sim-row="big"]');
  await expect(row).toContainText("On time");
  await expect(row.locator('[data-sim-bar="line"]')).toHaveCount(1);
  await expect(page.locator("[data-fob-pickup]")).toContainText(
    "starts when the first module comes off the line",
  );

  // The same project collected all at once gets stuck behind a full yard.
  await page.evaluate(
    (scenario) =>
      localStorage.setItem("construction-simulation:scenarios:v1", JSON.stringify([scenario])),
    scenario(0),
  );
  await page.reload();
  await expect(row).toContainText("Does not finish · line stopped");
  await expect(row.locator('[data-sim-bar="line"][data-sim-bar-stopped="true"]')).toHaveCount(1);
});

test("Auto schedule splits a project to fit another in and explains it", async ({ page }) => {
  const project = (id: string, patch: Record<string, unknown>) => ({
    id,
    name: id,
    color: id === "Blue" ? "#2563eb" : "#16a34a",
    source: { kind: "virtual" },
    weeksPerModule: 4,
    splittable: true,
    delivery: { kind: "fob", pickupDate: "2027-08-25" },
    ...patch,
  });
  await page.addInitScript(
    (scenarios) =>
      localStorage.setItem("construction-simulation:scenarios:v1", JSON.stringify(scenarios)),
    [
      {
        id: "split",
        name: "Split",
        factory: {
          targetOnLine: 18,
          normalMax: 19,
          crowdedMax: 23,
          yardCapacity: 50,
          installCrews: 2,
          calendar: {
            startDate: "2027-01-01",
            workWeek: "mon-thu",
            holidayRegion: "CA-ON",
            automaticShutdowns: true,
            shutdowns: [],
          },
        },
        projects: [
          project("Blue", { modules: 30, earliestStart: "2027-08-25", dueDate: "2027-12-31" }),
          project("Green", { modules: 12, earliestStart: "2027-09-15", dueDate: "2027-11-15" }),
        ],
      },
    ],
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await expect(page.locator('[data-sim-row="Green"]')).toContainText("late");
  await page.getByRole("button", { name: "Auto schedule" }).click();
  const notice = page.locator("[data-sim-notice]");
  await expect(notice).toContainText("every project is on time");
  await expect(notice).toContainText(/Split on the line: Blue ×\d+ → Green ×12 → Blue ×\d+\./);
  await expect(page.locator('[data-sim-row="Green"]')).toContainText("On time");
});

test("Auto schedule suggests fixes when the line is too full, and Apply uses one", async ({
  page,
}) => {
  const project = (id: string, patch: Record<string, unknown>) => ({
    id,
    name: id,
    color: id === "27001" ? "#2563eb" : "#16a34a",
    source: { kind: "virtual" },
    splittable: true,
    delivery: { kind: "fob", pickupDate: "2027-08-25", batchSize: 2 },
    ...patch,
  });
  await page.addInitScript(
    (scenarios) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("construction-simulation:scenarios:v1", JSON.stringify(scenarios));
    },
    [
      {
        id: "full",
        name: "Full line",
        factory: {
          targetOnLine: 18,
          normalMax: 19,
          crowdedMax: 23,
          yardCapacity: 24,
          installCrews: 2,
          calendar: {
            startDate: "2027-01-01",
            workWeek: "mon-thu",
            holidayRegion: "CA-ON",
            automaticShutdowns: true,
            shutdowns: [],
          },
        },
        projects: [
          project("Virtual 2", {
            modules: 60,
            weeksPerModule: 4,
            earliestStart: "2027-08-25",
            dueDate: "2028-04-01",
          }),
          project("27001", {
            modules: 200,
            weeksPerModule: 2,
            earliestStart: "2027-08-26",
            dueDate: "2028-05-30",
          }),
        ],
      },
    ],
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  const row = page.locator('[data-sim-row="27001"]');
  await expect(row).toContainText("late");
  await page.getByRole("button", { name: "Auto schedule" }).click();
  const fixes = page.getByRole("region", { name: "Suggested fixes" });
  await expect(fixes).toContainText("Allow a tight line for 27001");
  await expect(fixes).toContainText("modules fit before the due date");
  await expect(fixes).toContainText("move the due date to");
  await fixes
    .getByRole("listitem")
    .filter({ hasText: "Allow a tight line for 27001" })
    .getByRole("button", { name: "Apply" })
    .click();
  await expect(page.locator("[data-sim-notice]")).toContainText(
    "Applied: Allow a tight line for 27001.",
  );
  await expect(page.locator("[data-sim-notice]")).toContainText("every project is on time");
  await expect(row).toContainText("On time");
  await expect(fixes).toHaveCount(0);
  await expect(
    page.locator('[data-sim-project="27001"]').getByLabel(/Allow a tight line/),
  ).toBeChecked();
});

test("Earliest line start follows the production schedule: the Factory Production row's L4 start", async ({
  page,
}) => {
  const file = createE2EWorkflow();
  file.calendar = { startDate: "2027-01-04", shutdowns: [] };
  // Give every release condition a length so L4 has dates for each row.
  file.graph.nodes = file.graph.nodes.map((node) => ({
    ...node,
    conditions: node.conditions.map((condition) => ({
      ...condition,
      duration: 5,
      durationUnit: "days" as const,
    })),
  }));
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
  const start = card.getByLabel("Earliest line start", { exact: true });
  const hint = card.locator("[data-l4-start-limit]");
  await expect(hint).toContainText("Choose a Department above to follow the production schedule");
  const phaseStart = (await start.getAttribute("min"))!;

  await card.getByLabel("Department").selectOption({ label: "Department Lifecycle Phase" });
  await card.getByLabel("Add below").selectOption({ index: 1 });
  await expect(hint).toContainText(
    "Earliest line start follows the production schedule: L4's Factory Production row starts",
  );
  await expect(hint).toContainText("finishes)");
  const factoryStart = (await start.getAttribute("min"))!;
  expect(factoryStart > phaseStart).toBe(true);
  // The box moves up to that date by itself.
  await expect(start).toHaveValue(factoryStart);
});

test("the factory calendar is the L4 calendar: a change on either side shows on the other", async ({
  page,
}) => {
  const file = createE2EWorkflow();
  file.calendar = {
    startDate: "2027-01-04",
    shutdowns: [],
    holidayRegion: "CA-ON",
    automaticShutdowns: false,
  };
  await page.addInitScript(
    ({ key, file }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  const l4Calendar = () =>
    page.evaluate(
      (key) =>
        (JSON.parse(localStorage.getItem(key)!) as { state: { file: { calendar: unknown } } }).state
          .file.calendar as Record<string, unknown>,
      WORKFLOW_STORAGE_KEY,
    );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await expect(page.getByText("Factory calendar · same as L4")).toBeVisible();
  const workWeek = page.getByRole("checkbox", { name: /Work Monday–Thursday/ });
  const holidays = page.getByRole("checkbox", { name: "Ontario statutory holidays off" });
  const shutdowns = page.getByRole("checkbox", { name: "Summer and winter shutdowns" });
  // L5 opens with L4's settings, not its own defaults.
  await expect(workWeek).not.toBeChecked();
  await expect(holidays).toBeChecked();
  await expect(shutdowns).not.toBeChecked();

  // Changed in L5: L4's calendar takes it too, and keeps its own start date.
  await workWeek.check();
  await shutdowns.check();
  await expect.poll(async () => (await l4Calendar()).workWeek).toBe("mon-thu");
  expect(await l4Calendar()).toMatchObject({
    startDate: "2027-01-04",
    automaticShutdowns: true,
    holidayRegion: "CA-ON",
  });

  // Changed in L4: L5 follows it.
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    delete saved.state.file.calendar.holidayRegion;
    localStorage.setItem(key, JSON.stringify(saved));
  }, WORKFLOW_STORAGE_KEY);
  await page.reload();
  await expect(holidays).not.toBeChecked();
  await expect(workWeek).toBeChecked();
  await expect(shutdowns).toBeChecked();
});
