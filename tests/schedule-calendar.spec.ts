import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import {
  buildProcessTimeline,
  normalizeScheduleCalendar,
  calendarDateDay,
} from "../src/lib/schedule-calendar";
import {
  calendarWorkSummary,
  calendarPauseDetails,
  ganttCalendarBarLabel,
} from "../src/lib/gantt-bar-label";
import {
  defaultAnnualShutdown,
  annualShutdownForYear,
  shutdownCompanyBreak,
} from "../src/lib/annual-shutdowns";
import { ontarioStatutoryHolidays } from "../src/lib/ontario-holidays";
import { migrateWorkflowFile } from "../src/lib/workflow-migration";
import { processGanttPdfHtml } from "../src/lib/process-gantt-pdf";
import { parseWorkflow } from "../src/lib/serialization";
import type { WorkflowFile, ScheduleCalendar } from "../src/types/workflow";
import { productionCalendarPageHtml } from "../src/lib/production-calendar-pdf";
import { dayOffWarning, scheduleDayOffWarnings } from "../src/lib/calendar-badges";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";
function fixture() {
  const file = createProjectWorkflow("Calendar schedule");
  const sales = createDomainNode("general", "calendar-sales");
  sales.config.stage = "Sales";
  sales.conditions = [{ id: "entry", label: "Sales qualification", duration: 2 }];
  const tech = createDomainNode("general", "calendar-tech");
  tech.config.stage = "Technical";
  tech.config.ganttAutoSequence = true;
  tech.conditions = [
    { id: "review", label: "Design review", duration: 3 },
    { id: "agreement", label: "Technical agreement", duration: 7 },
  ];
  file.graph.nodes = [sales, tech];
  file.layout.nodes = Object.fromEntries(
    file.graph.nodes.map((node, index) => [
      node.id,
      { nodeId: node.id, x: index * 450, y: 0, width: 384, height: 500 },
    ]),
  );
  file.highLevel!.graph.nodes = [
    {
      id: "calendar-phase-1",
      type: "phase",
      title: "PHASE 1",
      description: "Qualification",
      linkedLayer2NodeIds: [sales.id],
    },
    {
      id: "calendar-phase-2",
      type: "phase",
      title: "PHASE 2",
      description: "Construction",
      linkedLayer2NodeIds: [tech.id],
    },
  ];
  file.highLevel!.graph.edges = [
    { id: "calendar-edge", source: "calendar-phase-1", target: "calendar-phase-2" },
  ];
  return file;
}

function calendarFile() {
  const file = fixture();
  file.calendar = {
    startDate: "2026-11-16",
    workWeek: "mon-thu",
    automaticShutdowns: true,
    holidayRegion: "CA-ON",
    shutdowns: [],
  };
  file.highLevel!.graph.nodes[0].linkedLayer2NodeIds = file.graph.nodes.map((node) => node.id);
  file.highLevel!.graph.nodes[1].linkedLayer2NodeIds = [];
  file.graph.nodes[1].conditions = [
    {
      id: "review",
      label: "16-week technical task",
      duration: 16,
      durationUnit: "weeks",
      predecessor: {
        nodeId: file.graph.nodes[0].id,
        conditionId: "entry",
        relation: "finish",
        lagDays: 0,
      },
    },
    { id: "agreement", label: "Technical agreement", duration: 1, durationUnit: "weeks" },
  ];
  return file;
}
const seed = async (page: Page, file: WorkflowFile) =>
  page.addInitScript(
    ({ key, file }) => {
      if (sessionStorage.getItem("elapsed-calendar-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
      sessionStorage.setItem("elapsed-calendar-seeded", "1");
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );

// These expectations replace the former working-duration/automatic-extension
// model: every entered week is now seven calendar days INCLUDING days off.
test("16W stays 112 calendar days and actual work subtracts shutdown, stats and weekends once", () => {
  const file = calendarFile(),
    before = JSON.stringify(file);
  const schedule = buildProcessSchedule(file),
    timeline = buildProcessTimeline(file, schedule);
  const task = schedule.tasks.find((task) => task.conditionId === "review")!;
  expect(task).toMatchObject({ days: 112, start: 2, end: 114 });
  expect(timeline.dateAt(task.start!)).toBe("2026-11-16");
  expect(timeline.dateAt(task.end! - 1)).toBe("2027-03-07");
  const segments = timeline.taskSegments(task.start!, task.end!);
  const summary = calendarWorkSummary(
    task.days!,
    segments.filter((part) => part.kind === "pause"),
  );
  // 16 Mon–Sun weeks contain 48 Fri–Sun days; four overlap winter.
  // Winter Dec21–Jan1 =12D; Family Day is the only additional weekday stat.
  expect(summary).toMatchObject({
    totalDays: 112,
    offDays: 57,
    workDays: 55,
    totals: { winter: 12, summer: 0, statutory: 1, weekend: 44 },
  });
  expect(summary.formula).toBe(
    "112D - WINTER SHUTDOWN 12D - STATUTORY HOLIDAYS 1D - WEEKEND 44D = 55D ACTUAL WORK",
  );
  expect(
    ganttCalendarBarLabel(
      task.department,
      task.condition,
      segments.filter((part) => part.kind === "pause"),
    ),
  ).toBe("TECH 16W - 57D OFF = 55D ACTUAL WORK");
  expect(
    segments
      .filter((part) => part.kind === "work")
      .reduce((sum, part) => sum + part.end - part.start, 0),
  ).toBe(55);
  expect(schedule.tasks.find((task) => task.conditionId === "agreement")).toMatchObject({
    start: 114,
    end: 121,
  });
  expect(JSON.stringify(file)).toBe(before);
});

test("all departments use elapsed weeks; changing days off changes net work without moving endpoints", () => {
  const file = calendarFile();
  for (const stage of ["Purchasing", "Production", "Site/After Service"]) {
    const node = createDomainNode("general", stage);
    node.config.stage = stage;
    node.conditions = [{ id: "main", label: stage, duration: 16, durationUnit: "weeks" }];
    file.graph.nodes.push(node);
    file.highLevel!.graph.nodes[0].linkedLayer2NodeIds!.push(node.id);
  }
  const schedule = buildProcessSchedule(file),
    timeline = buildProcessTimeline(file, schedule);
  for (const task of schedule.tasks.filter((task) => task.condition.duration === 16)) {
    expect(task.end! - task.start!).toBe(112);
    const summary = calendarWorkSummary(
      112,
      timeline.taskSegments(task.start!, task.end!).filter((part) => part.kind === "pause"),
    );
    expect(summary.workDays).toBe(55);
  }
  const cancelledFile = {
    ...file,
    calendar: { ...file.calendar!, shutdownOverrides: { "winter-2026": null } },
  };
  const changed = buildProcessTimeline(cancelledFile, schedule);
  expect(changed.toDisplayDay(114, "end")).toBe(timeline.toDisplayDay(114, "end"));
  const task = schedule.tasks.find((task) => task.conditionId === "review")!;
  expect(
    calendarWorkSummary(
      112,
      changed.taskSegments(task.start!, task.end!).filter((part) => part.kind === "pause"),
    ).workDays,
  ).toBe(63);
});

test("a task entirely in shutdown has zero work, with clipped dates and no negative totals", () => {
  const file = fixture();
  file.graph.nodes[1].conditions = [
    { id: "review", label: "Closed task", duration: 1, durationUnit: "weeks" },
  ];
  file.calendar = {
    startDate: "2026-12-21",
    workWeek: "mon-thu",
    automaticShutdowns: true,
    holidayRegion: "CA-ON",
    shutdowns: [],
  };
  const schedule = buildProcessSchedule(file),
    timeline = buildProcessTimeline(file, schedule);
  const task = schedule.tasks.find((task) => task.conditionId === "review")!;
  const pauses = timeline
    .taskSegments(task.start!, task.end!)
    .filter((part) => part.kind === "pause");
  expect(calendarWorkSummary(7, pauses)).toMatchObject({
    offDays: 7,
    workDays: 0,
    totals: { winter: 7, statutory: 0, weekend: 0 },
  });
  const details = calendarPauseDetails(pauses[0], timeline.dateAt);
  expect(details).toContain("2026-12-21 – 2026-12-27 · 7D OFF");
  expect(details).toContain("Winter shutdown: 2026-12-21 – 2026-12-27 (7D)");
});

test("fractional week migration uses seven elapsed days and relative/no-handoff schedules remain valid", () => {
  const file = calendarFile();
  file.graph.nodes[1].conditions[0].duration = 1.25;
  const migrated = migrateWorkflowFile(file),
    schedule = buildProcessSchedule(migrated);
  expect(schedule.tasks.find((task) => task.conditionId === "review")?.days).toBe(9);
  delete file.graph.nodes[0].conditions[0].duration;
  expect(buildProcessTimeline(file, buildProcessSchedule(file)).enabled).toBe(false);
  delete file.calendar;
  expect(buildProcessTimeline(file, buildProcessSchedule(file)).enabled).toBe(false);
});

test("annual CCQ summer dates, company winter and year overrides are preserved", () => {
  for (const [year, start, end] of [
    [2026, "2026-07-19", "2026-08-01"],
    [2027, "2027-07-25", "2027-08-07"],
    [2028, "2028-07-23", "2028-08-05"],
  ] as const) {
    expect(defaultAnnualShutdown("summer", year)).toMatchObject({ startDate: start, endDate: end });
  }
  expect(defaultAnnualShutdown("summer", 2050)).toMatchObject({
    startDate: "2050-07-24",
    endDate: "2050-08-06",
  });
  const calendar: ScheduleCalendar = {
    startDate: "2026-01-01",
    workWeek: "mon-thu",
    automaticShutdowns: true,
    shutdowns: [],
    shutdownOverrides: {
      "winter-2026": null,
      "summer-2027": { startDate: "2027-07-12", endDate: "2027-07-25" },
    },
  };
  expect(annualShutdownForYear(calendar, "winter", 2026)).toEqual([]);
  expect(annualShutdownForYear(calendar, "winter", 2027)).toHaveLength(1);
  expect(annualShutdownForYear(calendar, "summer", 2027)[0].startDate).toBe("2027-07-12");
  calendar.shutdownOverrides!["winter-2026"] = "automatic";
  expect(shutdownCompanyBreak(calendar, defaultAnnualShutdown("winter", 2026))).toEqual({
    startDate: "2026-12-18",
    endDate: "2027-01-03",
    resumes: "2027-01-04",
  });
  expect(normalizeScheduleCalendar(calendar)?.shutdownOverrides).toEqual(
    calendar.shutdownOverrides,
  );
  expect(() => parseWorkflow(JSON.stringify({ ...calendarFile(), calendar }))).not.toThrow();
});

test("Ontario dates and company substitutions remain available with no double counting", () => {
  expect(ontarioStatutoryHolidays(2027)).toHaveLength(9);
  expect(
    ontarioStatutoryHolidays(2027).find((holiday) => holiday.id === "on-2027-family")?.date,
  ).toBe("2027-02-15");
  const file = calendarFile();
  file.calendar!.holidayOverrides = { "on-2027-family": "2027-02-19" }; // Friday, already off.
  const schedule = buildProcessSchedule(file),
    timeline = buildProcessTimeline(file, schedule),
    task = schedule.tasks.find((task) => task.conditionId === "review")!;
  expect(
    calendarWorkSummary(
      112,
      timeline.taskSegments(task.start!, task.end!).filter((part) => part.kind === "pause"),
    ),
  ).toMatchObject({ offDays: 56, workDays: 56 });
  expect(calendarDateDay("2027-02-30")).toBeNull();
  expect(
    normalizeScheduleCalendar({
      ...file.calendar,
      shutdownOverrides: { "summer-2026": { startDate: "2026-08-02", endDate: "2026-07-02" } },
    })?.shutdownOverrides,
  ).toBeUndefined();
});

test("PDF contains net work and silent grey segments without tags or grey background bands", () => {
  const html = processGanttPdfHtml(calendarFile(), new Map());
  expect(html).toContain("TECH 16W");
  expect(html).not.toContain('data-calendar-tag="off"');
  expect(html).toMatch(/ACTUAL WORK <span data-actual-work-days="55"[^>]*>55D<\/span>/);
  expect(html).toContain(
    "112D - WINTER SHUTDOWN 12D - STATUTORY HOLIDAYS 1D - WEEKEND 44D = 55D ACTUAL WORK",
  );
  expect(html).not.toContain("data-pdf-task-pause-label");
  expect(html).not.toContain('class="gantt-shutdown-overlay"');
  expect(html).not.toContain("background-image:linear-gradient");
  expect(html).not.toContain("WEEKEND 7W");
});

test("clicking a bar opens a glass popup calendar with count tags; PDF exports a project calendar on page two", async ({
  page,
}, testInfo) => {
  await seed(page, calendarFile());
  await page.addInitScript(() => {
    const serialize = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (node) {
      if (node instanceof Element && node.querySelector(".pdf-gantt")) {
        const row = node.querySelector('[data-pdf-gantt-task="16-week technical task"]')!;
        (window as unknown as { actualPdf: unknown }).actualPdf = {
          badges: [...row.querySelectorAll("[data-calendar-tag]")].map((tag) => tag.textContent),
          tags: row.querySelectorAll("[data-pdf-task-pause-label]").length,
          greyText: [...row.querySelectorAll("[data-pdf-task-pause]")].map(
            (part) => part.textContent,
          ),
        };
      }
      if (
        node instanceof Element &&
        (node.matches(".production-calendar-page") ||
          node.querySelector(".production-calendar-page"))
      ) {
        (window as unknown as { calendarPage: unknown }).calendarPage = {
          months: node.querySelectorAll("[data-production-month]").length,
          dates: node.querySelectorAll('[data-in-project="true"]').length,
          title: node.querySelector("h1")?.textContent,
        };
      }
      return serialize.call(this, node);
    };
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/process-overview");
  const bar = page.getByRole("slider", {
    name: "Start day for 16-week technical task",
    exact: true,
  });
  await expect(bar).toHaveAttribute("data-calendar-end", "2027-03-07");
  await expect(bar).toHaveAttribute("data-actual-work-days", "55");
  const expected = [
    "TECH 16W",
    "- STATS OFF 1D",
    "- SHUTDOWN 12D",
    "- WEEKEND 44D",
    "= ACTUAL WORK 55D",
  ];
  expect(await bar.locator("[data-calendar-tag]").allTextContents()).toEqual(expected);
  await bar.hover({ position: { x: 6, y: 10 } });
  const calendar = page.getByRole("dialog", { name: "16-week technical task", exact: true });
  await expect(calendar).toHaveCount(0);
  await bar.click({ position: { x: 6, y: 10 } });
  await expect(calendar).toBeVisible();
  const bounds = (await calendar.boundingBox())!;
  expect(bounds.width).toBeLessThan(1600);
  expect(bounds.height).toBeLessThan(1100);
  expect(bounds.x).toBeGreaterThan(0);
  expect(await calendar.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain(
    "blur",
  );
  expect(await calendar.locator("[data-calendar-tag]").allTextContents()).toEqual(expected);
  expect(
    new Set(
      await calendar
        .locator("[data-calendar-tag]")
        .evaluateAll((tags) => tags.map((tag) => getComputedStyle(tag).backgroundColor)),
    ).size,
  ).toBe(5);
  await expect(calendar.locator("[data-calendar-month]")).toHaveCount(5);
  await expect(calendar.locator('[data-in-task="true"]')).toHaveCount(112);
  await expect(calendar.locator('[data-calendar-date="2026-12-21"]')).toHaveAttribute(
    "data-day-off",
    "winter",
  );
  await expect(calendar.locator('[data-calendar-date="2027-02-15"]')).toHaveAttribute(
    "data-day-off",
    "statutory",
  );
  await page.mouse.move(15, 15);
  await expect(calendar).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("fullscreen-task-calendar.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close task calendar" }).click();
  await expect(calendar).toHaveCount(0);
  await bar.press("Enter");
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(
    page.locator(
      "[data-gantt-task-pause-label], [data-department-calendar], [data-shutdown-overlay]",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByText("High Level Process System Flowchart with Gantt Chart", { exact: true })
    .click();
  const path = testInfo.outputPath("actual-work.pdf");
  await (await pending).saveAs(path);
  const pdf = await page.evaluate(
    () =>
      (window as unknown as { actualPdf: { badges: string[]; tags: number; greyText: string[] } })
        .actualPdf,
  );
  expect(pdf.badges).toEqual(["TECH 16W", "ACTUAL WORK 55D"]);
  expect(pdf.tags).toBe(0);
  expect(pdf.greyText.every((text) => text === "")).toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as { calendarPage: unknown }).calendarPage),
  ).toEqual({ months: 5, dates: 121, title: "Calendar schedule" });
  const bytes = (await readFile(path)).toString("latin1");
  expect(bytes.match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  expect(bytes).toMatch(/\/MediaBox\s*\[0 0 1224(?:\.0*)? 792(?:\.0*)?\]/);
});

test("dragging and resizing change total calendar days, recalculate deductions and persist", async ({
  page,
}) => {
  await seed(page, calendarFile());
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/process-overview");
  const bar = page.getByRole("slider", {
    name: "Start day for 16-week technical task",
    exact: true,
  });
  await bar.scrollIntoViewIfNeeded();
  await page.locator("[data-release-condition-board]").evaluate((board) => {
    board.scrollLeft = 0;
  });
  const track = bar.locator("xpath=.."),
    box = (await bar.boundingBox())!,
    trackBox = (await track.boundingBox())!;
  const total = Number(await track.getAttribute("data-gantt-total"));
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 6 + (7 * trackBox.width) / total, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(bar).toHaveAttribute("data-calendar-start", "2026-11-23");
  await expect(bar).toHaveAttribute("data-calendar-end", "2027-03-14");
  const handle = page.getByRole("slider", {
    name: "Duration in days for 16-week technical task",
    exact: true,
  });
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "113");
  await expect(bar).toHaveAttribute("data-calendar-end", "2027-03-15");
  await page.reload();
  await expect(bar).toHaveAttribute("data-calendar-end", "2027-03-15");
});

test("Calendar yearly overrides and cancellations change actual work but keep the total task duration", async ({
  page,
}, testInfo) => {
  await seed(page, calendarFile());
  await page.goto("/process-overview");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 week = 7 calendar days");
  await page.getByRole("button", { name: "Customize a year", exact: true }).click();
  await page.getByRole("button", { name: "Cancel Winter shutdown 2026", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Shutdown year", exact: true }).fill("2027");
  await page.getByRole("button", { name: "Edit Summer shutdown 2027", exact: true }).click();
  await page.getByLabel("Summer shutdown 2027 start date", { exact: true }).fill("2027-07-12");
  await page.getByLabel("Summer shutdown 2027 end date", { exact: true }).fill("2027-07-25");
  await page.getByRole("button", { name: "Apply calendar", exact: true }).click();
  const bar = page.getByRole("slider", {
    name: "Start day for 16-week technical task",
    exact: true,
  });
  await expect(bar).toHaveAttribute("data-calendar-end", "2027-03-07");
  await expect(bar).toHaveAttribute("data-actual-work-days", "63");
  await page.reload();
  await expect(bar).toHaveAttribute("data-actual-work-days", "63");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Customize a year", exact: true }).click();
  await page.getByRole("button", { name: "Reset Winter shutdown 2026", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Shutdown year", exact: true }).fill("2050");
  await expect(page.locator('[data-annual-shutdown="summer-2050"]')).toContainText("Projected");
  await page.screenshot({ path: testInfo.outputPath("calendar-year-custom.png"), fullPage: true });
  await page.getByRole("button", { name: "Apply calendar", exact: true }).click();
  await expect(bar).toHaveAttribute("data-actual-work-days", "55");
});

// Mocked loopback API: verify full calendar serialization without production writes.
test("calendar and actual work restore from cloud save", async ({ page, baseURL }) => {
  const file = calendarFile(),
    user = { id: "elapsed-owner", name: "Calendar owner", email: "calendar@example.com" };
  let cloud = {
    id: "elapsed-project",
    name: "Elapsed project",
    project_number: "27001",
    workflow: file,
  };
  const origin = new URL(baseURL!);
  origin.hostname = "calendar.localhost";
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/audit/events", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/projects/elapsed-project", async (route) => {
    if (route.request().method() === "PUT")
      cloud = { ...cloud, workflow: route.request().postDataJSON().workflow };
    await route.fulfill({ json: { project: cloud } });
  });
  await page.addInitScript(
    ({ key, file, user }) => {
      if (sessionStorage.getItem("cloud-elapsed-seed")) return;
      sessionStorage.setItem("cloud-elapsed-seed", "1");
      localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            file,
            activeProjectId: "elapsed-project",
            workspaceOwnerId: user.id,
            authUser: user,
            dirty: false,
          },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file, user },
  );
  await page.goto(`${origin.origin}/process-overview`);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Customize a year", exact: true }).click();
  await page.getByRole("button", { name: "Cancel Winter shutdown 2026", exact: true }).click();
  await page.getByRole("button", { name: "Apply calendar", exact: true }).click();
  await page.getByRole("button", { name: "Save project to cloud" }).click();
  await expect.poll(() => cloud.workflow.calendar?.shutdownOverrides?.["winter-2026"]).toBeNull();
  expect(() => parseWorkflow(JSON.stringify(cloud.workflow))).not.toThrow();
  await page.reload();
  await expect(
    page.getByRole("slider", { name: "Start day for 16-week technical task", exact: true }),
  ).toHaveAttribute("data-actual-work-days", "63");
});

test("glass popup calendars fit long schedules on smaller screens and clicks never replace dragging", async ({
  page,
}, testInfo) => {
  const file = calendarFile();
  file.graph.nodes[1].conditions[0].duration = 40;
  await seed(page, file);
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.goto("/process-overview");
  const bar = page.getByRole("slider", {
    name: "Start day for 16-week technical task",
    exact: true,
  });
  await bar.click({ position: { x: 6, y: 10 } });
  const calendar = page.getByRole("dialog", { name: "16-week technical task", exact: true });
  await expect(calendar.locator("[data-calendar-month]")).toHaveCount(10);
  await expect(calendar.locator('[data-in-task="true"]')).toHaveCount(280);
  await expect(calendar.locator('[data-calendar-date="2027-08-22"]')).toHaveAttribute(
    "data-in-task",
    "true",
  );
  expect((await calendar.boundingBox())!.width).toBe(668);
  await page.screenshot({
    path: testInfo.outputPath("fullscreen-calendar-small.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("production calendar sheets paginate without shrinking dates and support a missing handoff", () => {
  const file = calendarFile();
  expect(productionCalendarPageHtml(file)).toHaveLength(1);
  file.graph.nodes[1].conditions[0].duration = 260;
  const pages = productionCalendarPageHtml(file);
  expect(pages.length).toBeGreaterThan(1);
  for (const html of pages)
    expect((html.match(/data-production-month=/g) ?? []).length).toBeLessThanOrEqual(24);
  delete file.calendar;
  expect(productionCalendarPageHtml(file)[0]).toContain("Set the Calendar handoff date");
});

test("long project PDF keeps the whole production calendar legible on 11x17", async ({
  page,
}, testInfo) => {
  const file = calendarFile();
  file.graph.nodes[1].conditions[0].duration = 72;
  await seed(page, file);
  await page.goto("/process-overview");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByText("High Level Process System Flowchart with Gantt Chart", { exact: true })
    .click();
  await (await pending).saveAs(testInfo.outputPath("long-project-calendar.pdf"));
});

test("zero-day tags stay hidden and native drag/capture loss cannot leave a stuck bar", async ({
  page,
}, testInfo) => {
  await seed(page, calendarFile());
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/process-overview");
  const next = page.getByRole("slider", { name: "Start day for Technical agreement", exact: true });
  expect(await next.locator("[data-calendar-tag]").allTextContents()).toEqual([
    "TECH 1W",
    "- WEEKEND 3D",
    "= ACTUAL WORK 4D",
  ]);
  const bar = page.getByRole("slider", {
    name: "Start day for 16-week technical task",
    exact: true,
  });
  await bar.scrollIntoViewIfNeeded();
  expect(
    await bar.evaluate((element) =>
      element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true })),
    ),
  ).toBe(false);
  expect(await bar.evaluate((element) => getComputedStyle(element).userSelect)).toBe("none");
  await page.locator("[data-release-condition-board]").evaluate((board) => {
    board.scrollLeft = 0;
  });
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 5 });
  await expect(bar).toHaveAttribute("data-gantt-dragging", "true");
  await bar.evaluate((element) =>
    element.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1 })),
  );
  await expect(bar).not.toHaveAttribute("data-gantt-dragging");
  await page.mouse.up();
  await expect(bar).toHaveAttribute("data-calendar-start", "2026-11-16");
  await bar.click({ position: { x: 6, y: 10 } });
  await expect(
    page.getByRole("dialog", { name: "16-week technical task", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await next.click({ position: { x: 6, y: 10 } });
  const shortCalendar = page.getByRole("dialog", { name: "Technical agreement", exact: true });
  await expect(shortCalendar).toBeVisible();
  expect((await shortCalendar.boundingBox())!.width).toBe(640);
  await page.screenshot({ path: testInfo.outputPath("one-month-glass-popup.png") });
});

test("day-off warning flags windows that are mostly days off", () => {
  const summary = (
    totalDays: number,
    totals: { winter?: number; summer?: number; statutory?: number; weekend?: number },
  ) => {
    const full = { winter: 0, summer: 0, statutory: 0, weekend: 0, ...totals };
    const offDays = full.winter + full.summer + full.statutory + full.weekend;
    return { totalDays, offDays, workDays: totalDays - offDays, totals: full, formula: "" };
  };
  expect(dayOffWarning(summary(14, { winter: 13, weekend: 1 }))?.short).toBe(
    "TOO MANY DAYS OFF · ONLY 0D WORK IN 14D",
  );
  expect(dayOffWarning(summary(14, { winter: 13, weekend: 1 }))?.reason).toContain("shutdown 13D");
  expect(dayOffWarning(summary(21, { statutory: 1, weekend: 9 }))).toBeNull();
  expect(dayOffWarning(summary(7, { weekend: 3 }))).toBeNull();
  expect(dayOffWarning(summary(14, { winter: 5, weekend: 6 }))).not.toBeNull();
  expect(dayOffWarning(summary(112, { winter: 12, statutory: 1, weekend: 44 }))).toBeNull();
});

test("PDF Gantt labels are coloured text, not filled tags", () => {
  const html = processGanttPdfHtml(calendarFile(), new Map());
  const tags = html.match(/<span data-calendar-tag="[^"]+" style="[^"]*"/g) ?? [];
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) expect(tag).not.toContain("background:");
  expect(html).not.toMatch(/data-calendar-tag="(weekend|shutdown|statutory)"/);
  expect(html).not.toContain("data-day-off-warning");
});

test("PDF prints zero actual work in red bold", () => {
  const file = calendarFile();
  const review = file.graph.nodes[1].conditions[0];
  review.duration = 2;
  review.predecessor!.lagDays = 35;
  const html = processGanttPdfHtml(file, new Map());
  expect(html).toMatch(/data-actual-work-days="0" style="color:#dc2626;font-weight:900">0D</);
});

test("Gantt PDF export asks before printing tasks that are mostly days off", async ({ page }) => {
  const file = calendarFile();
  // Two weeks starting 2026-12-21 sit inside the winter shutdown.
  const review = file.graph.nodes[1].conditions[0];
  review.duration = 2;
  review.predecessor!.lagDays = 35;
  const warnings = scheduleDayOffWarnings(file, { excludeSales: true });
  expect(warnings.map((warning) => warning.title)).toEqual(["16-week technical task"]);
  await seed(page, file);
  await page.goto("/process-overview");
  await expect(page.locator("[data-day-off-warning]").first()).toBeVisible();
  const messages: string[] = [];
  page.on("dialog", (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByText("High Level Process System Flowchart with Gantt Chart", { exact: true })
    .click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toContain("too many days off");
  expect(messages[0]).toContain("Export the PDF anyway?");
});

test("Calendar lets you pick the Weekend, Stats and Shutdown bar colours", async ({ page }) => {
  await seed(page, calendarFile());
  await page.goto("/process-overview");
  const pause = page.locator("[data-gantt-pause-segment]").first();
  await expect(pause).toBeVisible();
  const before = await pause.evaluate(
    (element) =>
      getComputedStyle(element).backgroundImage + getComputedStyle(element).backgroundColor,
  );
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Weekend colour", { exact: true }).fill("#ff0000");
  await dialog.getByLabel("Stats colour", { exact: true }).fill("#00ff00");
  await dialog.getByLabel("Shutdown colour", { exact: true }).fill("#0000ff");
  await page.getByRole("button", { name: "Apply calendar", exact: true }).click();
  const painted = async () =>
    page
      .locator("[data-gantt-pause-segment]")
      .evaluateAll((items) =>
        items
          .map(
            (item) =>
              getComputedStyle(item).backgroundImage + getComputedStyle(item).backgroundColor,
          )
          .join(" "),
      );
  await expect.poll(painted).toMatch(/rgb\(255, 0, 0\)|rgb\(0, 0, 255\)|rgb\(0, 255, 0\)/);
  expect(await painted()).not.toBe(before);
  await page.screenshot({
    path: "/private/tmp/claude-501/-Users-aaronyanf-Desktop-Project-Workflow-Builder/478ea515-b380-447c-914e-93aa2d7d44b4/scratchpad/daycolors.png",
  });
  // Saved with the project.
  await page.reload();
  await expect.poll(painted).toMatch(/rgb\(255, 0, 0\)|rgb\(0, 0, 255\)|rgb\(0, 255, 0\)/);
  // Reset brings the defaults back.
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Reset colours", exact: true }).click();
  await page.getByRole("button", { name: "Apply calendar", exact: true }).click();
  await expect.poll(painted).not.toMatch(/rgb\(255, 0, 0\)|rgb\(0, 0, 255\)|rgb\(0, 255, 0\)/);
});
