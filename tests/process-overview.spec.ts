import { expect, test, type Page } from "playwright/test";
import { createProjectWorkflow } from "../src/lib/project-template";
import { createDomainNode } from "../src/lib/create-domain-node";
import { buildProcessSchedule, schedulePredecessorCandidates, salesHandoffTime } from "../src/lib/process-schedule";
import { processGanttPdfHtml } from "../src/lib/process-gantt-pdf";
import { planGanttPlacement } from "../src/lib/gantt-placement";
import { ganttBarLabel, ganttDurationText } from "../src/lib/gantt-bar-label";
import { calendarDurationParts } from "../src/lib/condition-duration";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function fixture() {
  const file = createProjectWorkflow("Process schedule test");
  const sales = createDomainNode("general", "sales");
  sales.config.stage = "Sales";
  sales.conditions = [{ id: "entry", label: "Sales entry", duration: 2 }];
  const tech = createDomainNode("general", "tech");
  tech.title = "CHAPTER 02";
  tech.config.stage = "Technical";
  tech.conditions = [{ id: "design", label: "Design review", duration: 3 }, { id: "agreement", label: "Technical agreement", duration: 1, durationUnit: "weeks" }];
  file.graph.nodes = [sales, tech];
  file.highLevel!.graph.nodes = [
    { id: "phase-1", type: "phase", title: "Qualification", description: "", linkedLayer2NodeIds: [sales.id] },
    { id: "phase-2", type: "phase", title: "Pre-Construction", description: "", linkedLayer2NodeIds: [tech.id] },
  ];
  file.highLevel!.graph.edges = [{ id: "next", source: "phase-1", target: "phase-2" }];
  return file;
}

async function dragBarByDays(page: Page, title: string, days: number) {
  const bar = page.getByRole("slider", { name: `Start day for ${title}` });
  await bar.scrollIntoViewIfNeeded();
  const track = bar.locator("xpath=..");
  const total = Number(await track.getAttribute("data-gantt-total"));
  const trackBox = (await track.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  const x = barBox.x + Math.min(barBox.width / 2, Math.max(4, barBox.width - 16));
  const y = barBox.y + barBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + days * trackBox.width / total, y, { steps: 8 });
  await page.mouse.up();
}

test("calendar duration labels use seven-day weeks and four-week months", () => {
  const label = (days: number) => calendarDurationParts(days).map((part) => `${part.value} ${part.unit}`).join(" ");
  expect(label(7)).toBe("1 WEEK");
  expect(label(21)).toBe("3 WEEKS");
  expect(label(28)).toBe("1 MONTH");
  expect(label(42)).toBe("1 MONTH 2 WEEKS");
  expect(label(56)).toBe("2 MONTHS");
  expect(label(29)).toBe("1 MONTH 0.1 WEEKS");
});

test("Gantt duration labels display weeks throughout", () => {
  expect([7, 8, 9, 14, 17, 19, 25].map((duration) => ganttDurationText({ duration, durationUnit: "days" }, true)))
    .toEqual(["1w", "1.1w", "1.3w", "2w", "2.4w", "2.7w", "3.6w"]);
  expect(ganttBarLabel("Department Technical", { duration: 9, durationUnit: "days" })).toBe("TECH 1.3w");
  expect(ganttDurationText({ duration: 1, durationUnit: "weeks" })).toBe("1 week");
  const file = fixture();
  file.graph.nodes[1].conditions[0].duration = 9;
  const pdf = processGanttPdfHtml(file, new Map());
  expect(pdf).toContain("TECH 1.3w");
  expect(pdf).toContain("TECH 1w");
});

test("parallel conditions overlap and predecessor scheduling extends the phase", () => {
  const file = fixture();
  let schedule = buildProcessSchedule(file);
  expect(schedule.tasks.map((task) => [task.start, task.end])).toEqual([[0, 2], [2, 5], [2, 9]]);
  expect(schedule.totalDays).toBe(9);
  file.graph.nodes[1].conditions[1].predecessor = { nodeId: "tech", conditionId: "design" };
  schedule = buildProcessSchedule(file);
  expect(schedule.tasks[2].start).toBe(5);
  expect(schedule.totalDays).toBe(12);
});

test("Day 1 and PDF labels start at the end of Sales Department work", () => {
  const file = fixture();
  const schedule = buildProcessSchedule(file);
  expect(salesHandoffTime(schedule)).toEqual({ originDay: 2, elapsedDays: 7, hasSalesDepartment: true });
  expect(schedule.tasks[0]).toMatchObject({ start: 0, end: 2 });
  const html = processGanttPdfHtml(file, new Map());
  expect(html).toContain("Estimated span after Sales handoff: 1 week");
  expect(html).toContain("Week 1 begins at the formal Sales-to-Technical handover");
  expect(html).toContain("Sales lead · customer qualification");
  expect(html).toContain('data-day-one-origin="2"');
  expect(html).toMatch(/<span style="left:[^"]+">W1<\/span>/);
});

test("Day 1 remains at Sales handoff when Technical work has no duration yet", () => {
  const file = fixture();
  file.graph.nodes[1].conditions.forEach((condition) => { delete condition.duration; });
  const handoff = salesHandoffTime(buildProcessSchedule(file));
  expect(handoff).toEqual({ originDay: 2, elapsedDays: null, hasSalesDepartment: true });
  const html = processGanttPdfHtml(file, new Map());
  expect(html).toContain('data-day-one-origin="2"');
  expect(html).toContain("Estimated span after Sales handoff: pending");
});

test("Gantt PDF omits departments without release conditions", () => {
  const file = fixture();
  const purchasing = createDomainNode("general", "purchasing-empty");
  purchasing.config.stage = "Purchasing";
  purchasing.conditions = [];
  file.graph.nodes.push(purchasing);
  file.highLevel!.graph.nodes[1].linkedLayer2NodeIds!.push(purchasing.id);
  const html = processGanttPdfHtml(file, new Map());
  expect(html).toContain('class="gantt-department">Department Technical');
  expect(html).not.toContain('class="gantt-department">Department Purchasing');
  expect(html).not.toContain("No release conditions");
});

test("Technical work can stay in Phase 1 while beginning at the Sales handoff", () => {
  const file = fixture();
  const sales = file.graph.nodes[0];
  const technical = file.graph.nodes[1];
  file.highLevel!.graph.nodes[0].linkedLayer2NodeIds!.push(technical.id);
  file.highLevel!.graph.nodes[1].linkedLayer2NodeIds = [];
  technical.conditions.forEach((condition) => {
    condition.predecessor = { nodeId: sales.id, conditionId: sales.conditions[0].id, relation: "finish", lagDays: 0 };
  });
  const schedule = buildProcessSchedule(file);
  expect(schedule.tasks.map((task) => [task.phaseIndex, task.start, task.end])).toEqual([[0, 0, 2], [0, 2, 5], [0, 2, 9]]);
  const html = processGanttPdfHtml(file, new Map());
  expect(html).toContain('data-pdf-gantt-task="Design review" data-pdf-gantt-phase="phase-1"');
  expect(html).toContain('data-day-one-origin="2"');
});

test("Gantt bar placement snaps to handoff and can start inside a preceding task", () => {
  const file = fixture();
  const sales = file.graph.nodes[0];
  const technical = file.graph.nodes[1];
  sales.conditions[0].duration = 4;
  technical.conditions[0].duration = 8;
  technical.conditions[1].duration = 7;
  technical.conditions[1].durationUnit = "days";
  technical.conditions.forEach((condition) => { condition.predecessor = { nodeId: sales.id, conditionId: "entry", relation: "finish", lagDays: 0 }; });
  file.highLevel!.graph.nodes[0].linkedLayer2NodeIds!.push(technical.id);
  file.highLevel!.graph.nodes[1].linkedLayer2NodeIds = [];
  const schedule = buildProcessSchedule(file);
  const design = schedule.tasks.find((task) => task.conditionId === "design")!;
  const agreement = schedule.tasks.find((task) => task.conditionId === "agreement")!;
  const insideSales = planGanttPlacement(schedule, design, 2, 0.3)!;
  expect(insideSales).toMatchObject({ startDay: 2, patch: { predecessor: { nodeId: "sales", conditionId: "entry", relation: "start", lagDays: 2 } } });
  const handoff = planGanttPlacement(schedule, design, 3.8, 0.45)!;
  expect(handoff).toMatchObject({ startDay: 4, patch: { predecessor: { nodeId: "sales", relation: "finish", lagDays: 0 } } });
  const insideDesign = planGanttPlacement(schedule, agreement, 6, 0.3)!;
  expect(insideDesign).toMatchObject({ startDay: 6, patch: { predecessor: { nodeId: "tech", conditionId: "design", relation: "start", lagDays: 2 } } });
});

test("Gantt free placement persists relative to its phase start", () => {
  const file = fixture();
  file.graph.nodes[1].conditions = [{ id: "design", label: "Design review", duration: 3 }];
  const production = createDomainNode("general", "production-after-tech");
  production.config.stage = "Production";
  production.conditions = [{ id: "production-work", label: "Production work", duration: 2 }];
  file.graph.nodes.push(production);
  file.highLevel!.graph.nodes.push({ id: "phase-3", type: "phase", title: "Construction", description: "", linkedLayer2NodeIds: [production.id] });
  file.highLevel!.graph.edges.push({ id: "next-3", source: "phase-2", target: "phase-3" });
  const schedule = buildProcessSchedule(file);
  const task = schedule.tasks.find((item) => item.conditionId === "design")!;
  const placement = planGanttPlacement(schedule, task, 8, 0.3)!;
  expect(placement).toMatchObject({ startDay: 8, patch: { predecessor: undefined, startOffsetDays: 6 } });
  Object.assign(file.graph.nodes[1].conditions[0], placement.patch);
  const updated = buildProcessSchedule(file);
  expect(updated.tasks.find((item) => item.conditionId === "design")).toMatchObject({ start: 8, end: 11 });
  expect(updated.tasks.find((item) => item.conditionId === "production-work")).toMatchObject({ start: 11, end: 13 });
  expect(processGanttPdfHtml(file, new Map())).toMatch(/data-pdf-gantt-task="Design review"[^]*?data-start="8" data-end="11"/);
});

function threePhaseFixture() {
  const file = fixture();
  const production = createDomainNode("general", "production");
  production.config.stage = "Production";
  production.conditions = [{ id: "production-review", label: "Production review", duration: 3, predecessor: { nodeId: "sales", conditionId: "entry" } }];
  const purchasing = createDomainNode("general", "purchasing");
  purchasing.config.stage = "Purchasing";
  purchasing.conditions = [{ id: "purchase-review", label: "Purchase review", duration: 2 }];
  file.graph.nodes.push(production, purchasing);
  file.highLevel!.graph.nodes.push({ id: "phase-3", type: "phase", title: "PHASE 3", description: "Construction", linkedLayer2NodeIds: [production.id, purchasing.id] });
  file.highLevel!.graph.edges.push({ id: "next-3", source: "phase-2", target: "phase-3" });
  return file;
}

test("phase barriers wait for the entire preceding phase and replace redundant older-phase dependencies", () => {
  const file = threePhaseFixture();
  file.graph.nodes[0].conditions.push({ id: "slow", label: "Long qualification", duration: 8 });
  file.graph.nodes[1].conditions[1].predecessor = { nodeId: "tech", conditionId: "design" };
  const schedule = buildProcessSchedule(file);
  const production = schedule.tasks.find((task) => task.conditionId === "production-review")!;
  expect(production.condition.predecessor).toBeUndefined();
  expect(production).toMatchObject({ start: 18, end: 21 });
  expect(schedule.phaseRanges).toEqual([{ start: 0, end: 8 }, { start: 8, end: 18 }, { start: 18, end: 21 }]);
  expect(schedulePredecessorCandidates(schedule.tasks, production).map((task) => task.conditionId)).toEqual(["purchase-review"]);
  // Deriving the schedule must not mutate the source document.
  expect(file.graph.nodes[2].conditions[0].predecessor).toEqual({ nodeId: "sales", conditionId: "entry" });
});

test("an incomplete preceding phase blocks later phases and cyclic predecessor choices are excluded", () => {
  const file = threePhaseFixture();
  delete file.graph.nodes[1].conditions[0].duration;
  let schedule = buildProcessSchedule(file);
  expect(schedule.tasks.find((task) => task.conditionId === "production-review")).toMatchObject({ issue: "Waiting for preceding phase schedule" });
  expect(schedule.tasks.find((task) => task.conditionId === "production-review")?.start).toBeUndefined();
  file.graph.nodes[1].conditions[0].duration = 3;
  file.graph.nodes[1].conditions[1].predecessor = { nodeId: "tech", conditionId: "design" };
  schedule = buildProcessSchedule(file);
  const design = schedule.tasks.find((task) => task.conditionId === "design")!;
  expect(schedulePredecessorCandidates(schedule.tasks, design)).toEqual([]);
  const agreement = schedule.tasks.find((task) => task.conditionId === "agreement")!;
  expect(schedulePredecessorCandidates(schedule.tasks, agreement).map((task) => task.conditionId)).toEqual(["design"]);
});

test("Phase 3 bar can follow a same-phase task and persists after reload", async ({ page }) => {
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("phase-dependency-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("phase-dependency-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file: threePhaseFixture() });
  await page.goto("/process-overview");
  const bar = page.locator('[data-gantt-task="Production review"] [data-gantt-start]');
  await expect(bar).toHaveAttribute("data-gantt-start", "9");
  await dragBarByDays(page, "Production review", 2);
  await expect(bar).toHaveAttribute("data-gantt-start", "11");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "production").conditions[0].predecessor, WORKFLOW_STORAGE_KEY);
  expect(saved).toMatchObject({ nodeId: "purchasing", conditionId: "purchase-review", relation: "finish", lagDays: 0 });
  await page.reload();
  await expect(bar).toHaveAttribute("data-gantt-start", "11");
});

test("start-to-start delays overlap tasks while phase boundaries still wait for every task", () => {
  const file = threePhaseFixture();
  file.graph.nodes[1].conditions[0].duration = 8;
  file.graph.nodes[1].conditions[1] = { id: "agreement", label: "Technical agreement", duration: 2,
    predecessor: { nodeId: "tech", conditionId: "design", relation: "start", lagDays: 3 } };
  let schedule = buildProcessSchedule(file);
  expect(schedule.tasks.find((task) => task.conditionId === "design")).toMatchObject({ start: 2, end: 10 });
  expect(schedule.tasks.find((task) => task.conditionId === "agreement")).toMatchObject({ start: 5, end: 7 });
  expect(schedule.tasks.find((task) => task.conditionId === "production-review")).toMatchObject({ start: 10 });
  file.graph.nodes[1].conditions[1].predecessor!.relation = "finish";
  file.graph.nodes[1].conditions[1].predecessor!.lagDays = 2;
  schedule = buildProcessSchedule(file);
  expect(schedule.tasks.find((task) => task.conditionId === "agreement")).toMatchObject({ start: 12, end: 14 });
  expect(schedule.tasks.find((task) => task.conditionId === "production-review")).toMatchObject({ start: 14 });
  file.graph.nodes[1].conditions[1].predecessor!.lagDays = -1;
  expect(buildProcessSchedule(file).tasks.find((task) => task.conditionId === "agreement")?.issue).toContain("non-negative whole number");
  file.graph.nodes[1].conditions[1].predecessor!.lagDays = 1.5;
  expect(buildProcessSchedule(file).tasks.find((task) => task.conditionId === "agreement")?.start).toBeUndefined();
});

test("overlap controls persist start delays and export matching PDF positions", async ({ page }, testInfo) => {
  const file = fixture();
  file.graph.nodes[1].conditions[0].duration = 8;
  file.graph.nodes[1].conditions[1].duration = 2;
  file.graph.nodes[1].conditions[1].durationUnit = "days";
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("overlap-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("overlap-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const bar = page.locator('[data-gantt-task="Technical agreement"] [data-gantt-start]');
  await expect(bar).toHaveAttribute("data-gantt-start", "2");
  await dragBarByDays(page, "Technical agreement", 3);
  await expect(bar).toHaveAttribute("data-gantt-start", "5");
  await expect(bar).toHaveAttribute("data-gantt-end", "7");
  await page.reload();
  await expect(bar).toHaveAttribute("data-gantt-start", "5");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[1].predecessor, WORKFLOW_STORAGE_KEY);
  expect(saved).toEqual({ nodeId: "tech", conditionId: "design", relation: "start", lagDays: 3 });
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const bar = document.querySelector('[data-pdf-gantt-task="Technical agreement"] .gantt-bar');
      if (bar) (window as unknown as { pdfOverlap: string[] }).pdfOverlap = [bar.getAttribute("data-start")!, bar.getAttribute("data-end")!];
      const salesPhase = document.querySelector('[data-pdf-phase-id="phase-1"] .phase-duration');
      if (salesPhase) (window as unknown as { pdfHandoff: string }).pdfHandoff = salesPhase.textContent || "";
      return original.apply(this, args);
    };
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF", exact: true }).click();
  await (await pending).saveAs(testInfo.outputPath("overlap-gantt.pdf"));
  expect(await page.evaluate(() => (window as unknown as { pdfOverlap: string[] }).pdfOverlap)).toEqual(["5", "7"]);
  expect(await page.evaluate(() => (window as unknown as { pdfHandoff: string }).pdfHandoff)).not.toContain("Tech handoff pending");
  await dragBarByDays(page, "Technical agreement", -3);
  await expect(bar).toHaveAttribute("data-gantt-start", "2");
  const cleared = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[1].predecessor, WORKFLOW_STORAGE_KEY);
  expect(cleared).toBeUndefined();
});

test("legacy fractional durations are rounded up to whole days", () => {
  const file = fixture();
  file.graph.nodes[0].conditions = Array.from({ length: 14 }, (_, index) => ({
    id: `fraction-${index}`, label: `Fraction ${index}`, duration: 1.7,
    ...(index ? { predecessor: { nodeId: "sales", conditionId: `fraction-${index - 1}` } } : {}),
  }));
  file.graph.nodes[1].conditions = [];
  expect(buildProcessSchedule(file).totalDays).toBe(28);
  file.graph.nodes[0].conditions = [{ id: "a", duration: 0.1 }, { id: "b", duration: 0.2, predecessor: { nodeId: "sales", conditionId: "a" } }, { id: "c", duration: 0.7, predecessor: { nodeId: "sales", conditionId: "b" } }];
  const schedule = buildProcessSchedule(file);
  expect(schedule.tasks.map((task) => task.end)).toEqual([1, 2, 3]);
  expect(schedule.totalDays).toBe(3);
  file.graph.nodes[0].conditions = [{ id: "weeks", duration: 1.1, durationUnit: "weeks" }];
  expect(buildProcessSchedule(file).tasks[0]).toMatchObject({ days: 8, end: 8, condition: { duration: 8, durationUnit: "days" } });
});

test("missing estimates and dependency cycles remain visibly unscheduled", () => {
  const file = fixture();
  file.graph.nodes[1].conditions[0].predecessor = { nodeId: "tech", conditionId: "agreement" };
  file.graph.nodes[1].conditions[1].predecessor = { nodeId: "tech", conditionId: "design" };
  expect(buildProcessSchedule(file).unscheduled).toBe(2);
  delete file.graph.nodes[1].conditions[0].duration;
  expect(buildProcessSchedule(file).tasks[1].issue).toBe("Duration needed");
});

test("overview links to the current process and persists department task dependencies", async ({ page }) => {
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("process-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("process-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file: fixture() });
  await page.goto("/");
  await page.getByRole("link", { name: "Open Process Overview" }).click();
  await expect(page.getByRole("heading", { name: "L4 · Process & Gantt", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Complete process flowchart" })).toContainText("Pre-Construction");
  const flow = page.getByRole("region", { name: "Complete process flowchart" });
  await expect(flow).not.toContainText("STEP");
  expect((await flow.boundingBox())!.height).toBeLessThan(130);
  await expect(page.getByText("Durations are entered in weeks", { exact: false })).toBeVisible();
  await expect(page.getByText("1 week estimated from Sales handoff", { exact: false })).toBeVisible();
  await expect(page.locator('[data-release-condition-drop-node-id="tech"] [data-phase-department-label]')).toContainText("Pre-Construction");
  await expect(page.locator('[data-release-condition-drop-node-id="tech"] [data-phase-department-label]')).toContainText("Department Technical");
  const department = page.locator('[data-gantt-department="Department Technical"]');
  const agreement = department.locator('[data-gantt-task="Technical agreement"]');
  await expect(agreement.locator("[data-gantt-start]")).toHaveAttribute("data-gantt-start", "2");
  await expect(agreement.locator("[data-gantt-start]")).toHaveText("TECH 1w");
  await expect(page.locator('[data-gantt-task="Sales entry"] [data-gantt-start]')).toHaveText("SALE");
  const centered = await agreement.locator("[data-gantt-start]").evaluate((element) => getComputedStyle(element).justifyContent);
  expect(centered).toBe("center");
  await dragBarByDays(page, "Technical agreement", 3);
  await expect(agreement.locator("[data-gantt-start]")).toHaveAttribute("data-gantt-start", "5");
  await page.reload();
  await expect(agreement.locator("[data-gantt-end]")).toHaveAttribute("data-gantt-end", "12");
  await expect(page.getByText("W1 · handoff", { exact: true })).toBeVisible();
  const heights = await page.locator("[data-gantt-task]").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  heights.forEach((height) => expect(height).toBeLessThanOrEqual(33));
  await page.screenshot({ path: "tmp/process-overview-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("managed condition content stays locked while its bar can be resized and scheduled", async ({ page }) => {
  const file = fixture();
  file.graph.nodes[1].conditions[0].locked = true;
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("locked-schedule-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("locked-schedule-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const duration = page.getByRole("slider", { name: "Duration in days for Design review" });
  await duration.focus();
  await duration.press("ArrowRight");
  await expect(duration).toHaveAttribute("aria-valuenow", "4");
  await dragBarByDays(page, "Design review", 7);
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-end]')).toHaveAttribute("data-gantt-end", "13");
  await page.reload();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[0], WORKFLOW_STORAGE_KEY);
  expect(saved.locked).toBe(true);
  expect(saved.label).toBe("Design review");
  expect(saved.duration).toBe(4);
  expect(saved.predecessor).toMatchObject({ nodeId: "tech", conditionId: "agreement", relation: "finish", lagDays: 0 });
});

test("overview viewers can recover offline control before editing the schedule", async ({ page }) => {
  await page.addInitScript(({ key, file }) => localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 })), { key: WORKFLOW_STORAGE_KEY, file: fixture() });
  await page.goto(`/process-overview?room=overview-recovery-${Date.now()}&editor=offline-computer`);
  const duration = page.getByRole("slider", { name: "Duration in days for Design review" });
  await expect(page.getByText(/View only — another participant/)).toBeVisible();
  await expect(duration).toHaveCount(0);
  const takeControl = page.getByRole("button", { name: "Take Control", exact: true });
  await expect(takeControl).toBeEnabled({ timeout: 15000 });
  await takeControl.click();
  await expect(duration).toBeVisible();
  await duration.focus();
  await duration.press("ArrowRight");
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-end]')).toHaveAttribute("data-gantt-end", "6");
});

test("Gantt drag reorders, crosses phases into empty departments, and synchronizes other layers", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1600 });
  const file = fixture();
  const empty = createDomainNode("general", "delivery");
  empty.title = "CHAPTER 03";
  empty.config.stage = "Delivery";
  empty.conditions = [];
  file.graph.nodes.push(empty);
  file.graph.nodes.forEach((node, index) => {
    file.layout.nodes[node.id] = { nodeId: node.id, x: index * 500, y: 200, width: 400, height: 400 };
  });
  file.highLevel!.graph.nodes.push({ id: "phase-3", type: "phase", title: "Delivery phase", description: "", linkedLayer2NodeIds: [empty.id] });
  file.highLevel!.graph.edges.push({ id: "delivery-edge", source: "phase-2", target: "phase-3" });
  file.highLevel!.graph.nodes.forEach((node, index) => {
    file.highLevel!.layout.nodes[node.id] = { nodeId: node.id, x: index * 360, y: 200 };
  });
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("drag-schedule-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("drag-schedule-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const gantt = page.getByRole("region", { name: "Department Gantt chart" });
  const tech = gantt.locator('[data-release-condition-drop-node-id="tech"]');
  const source = gantt.getByRole("slider", { name: "Start day for Technical agreement" });
  await source.hover();
  const before = (await tech.locator('[data-gantt-task="Design review"]').boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(before.x + 350, before.y + 3, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => tech.locator("[data-gantt-task]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-gantt-task")))).toEqual(["Technical agreement", "Design review"]);
  const target = gantt.locator('[data-release-condition-drop-node-id="delivery"]');
  await gantt.getByRole("slider", { name: "Start day for Design review" }).hover();
  const destination = (await target.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(destination.x + 100, destination.y + destination.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(target.locator('[data-gantt-task="Design review"]')).toBeVisible();
  await expect(tech.locator('[data-gantt-task="Design review"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Undo process change" }).click();
  await expect(tech.locator('[data-gantt-task="Design review"]')).toBeVisible();
  await page.getByRole("button", { name: "Redo process change" }).click();
  await expect(target.locator('[data-gantt-task="Design review"]')).toBeVisible();
  await page.getByRole("link", { name: "Back to workflow" }).click();
  await expect(page.locator('[data-id="phase-3"]')).toContainText("1 release conditions");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="delivery"]')).toContainText("Design review");
  await expect(page.locator('[data-id="tech"]')).not.toContainText("Design review");
  await page.getByRole("link", { name: "Open Release Conditions Workspace" }).first().click();
  await expect(page.locator('[data-release-condition-chapter-id="delivery"]')).toContainText("Design review");
  await page.reload();
  await expect(page.locator('[data-release-condition-chapter-id="delivery"]')).toContainText("Design review");
});

test("dragging a bar to a valid same-phase edge sets its predecessor", async ({ page }) => {
  const file = fixture();
  file.graph.nodes[1].conditions.push({ id: "signoff", label: "Review signoff", duration: 1 });
  file.graph.nodes[1].conditions[1].predecessor = { nodeId: "tech", conditionId: "design", relation: "start", lagDays: 2 };
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  await dragBarByDays(page, "Technical agreement", -1);
  await expect(page.locator('[data-gantt-task="Technical agreement"] [data-gantt-start]')).toHaveAttribute("data-gantt-start", "3");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[1].predecessor, WORKFLOW_STORAGE_KEY);
  expect(saved).toEqual({ nodeId: "tech", conditionId: "signoff", relation: "finish", lagDays: 0 });
});

test("dragging a Gantt bar into Sales work saves a start-to-start overlap", async ({ page }) => {
  const file = fixture();
  file.graph.nodes[0].conditions[0].duration = 4;
  file.graph.nodes[1].conditions[0].predecessor = { nodeId: "sales", conditionId: "entry", relation: "finish", lagDays: 0 };
  file.highLevel!.graph.nodes[0].linkedLayer2NodeIds!.push("tech");
  file.highLevel!.graph.nodes[1].linkedLayer2NodeIds = [];
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("gantt-bar-drag-seeded")) return;
    sessionStorage.setItem("gantt-bar-drag-seeded", "yes");
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const bar = page.getByRole("slider", { name: "Start day for Design review" });
  const track = bar.locator("xpath=..");
  await expect(bar).toHaveAttribute("data-gantt-start", "4");
  await bar.scrollIntoViewIfNeeded();
  const total = Number(await track.getAttribute("data-gantt-total"));
  const trackBox = await track.boundingBox();
  const barBox = await bar.boundingBox();
  expect(trackBox && barBox).toBeTruthy();
  const x = barBox!.x + barBox!.width / 2;
  const y = barBox!.y + barBox!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 2 * trackBox!.width / total, y, { steps: 8 });
  await page.mouse.up();
  await expect(bar).toHaveAttribute("data-gantt-start", "2");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[0], WORKFLOW_STORAGE_KEY);
  expect(saved.predecessor).toEqual({ nodeId: "sales", conditionId: "entry", relation: "start", lagDays: 2 });
  await page.reload();
  await expect(page.getByRole("slider", { name: "Start day for Design review" })).toHaveAttribute("data-gantt-start", "2");
});

test("dragging a bar into open phase time saves an offset without a predecessor", async ({ page }) => {
  const file = fixture();
  file.graph.nodes[1].conditions = [{ id: "design", label: "Design review", duration: 3 }];
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("gantt-free-drag-seeded")) return;
    sessionStorage.setItem("gantt-free-drag-seeded", "yes");
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const bar = page.getByRole("slider", { name: "Start day for Design review" });
  await bar.scrollIntoViewIfNeeded();
  const track = bar.locator("xpath=..");
  const total = Number(await track.getAttribute("data-gantt-total"));
  const trackBox = await track.boundingBox();
  const barBox = await bar.boundingBox();
  expect(trackBox && barBox).toBeTruthy();
  const x = barBox!.x + barBox!.width / 2;
  const y = barBox!.y + barBox!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3 * trackBox!.width / total, y, { steps: 8 });
  await page.mouse.up();
  await expect(bar).toHaveAttribute("data-gantt-start", "5");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[0], WORKFLOW_STORAGE_KEY);
  expect(saved.startOffsetDays).toBe(3);
  expect(saved.predecessor).toBeUndefined();
  await page.reload();
  await expect(page.getByRole("slider", { name: "Start day for Design review" })).toHaveAttribute("data-gantt-start", "5");
});

test("dragging a bar right edge changes duration in whole days and persists", async ({ page }) => {
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("resize-seeded")) return;
    sessionStorage.setItem("resize-seeded", "yes");
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file: fixture() });
  await page.goto("/process-overview");
  const handle = page.getByRole("slider", { name: "Duration in days for Design review" });
  await handle.scrollIntoViewIfNeeded();
  const track = page.locator('[data-gantt-task="Design review"] [data-gantt-track]');
  const total = Number(await track.getAttribute("data-gantt-total"));
  const trackBox = (await track.boundingBox())!;
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2 * trackBox.width / total, y, { steps: 8 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "5");
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-end]')).toHaveAttribute("data-gantt-end", "7");
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", "5");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "tech").conditions[0], WORKFLOW_STORAGE_KEY);
  expect(saved).toMatchObject({ duration: 5, durationUnit: "days" });
});

test("a condition without duration gets a one-day starter bar that can be resized", async ({ page }) => {
  const file = fixture();
  file.graph.nodes[1].conditions[0].duration = undefined;
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("missing-duration-seeded")) return;
    sessionStorage.setItem("missing-duration-seeded", "yes");
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const handle = page.getByRole("slider", { name: "Duration in days for Design review" });
  await expect(handle).toHaveAttribute("aria-valuenow", "1");
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-start]')).toHaveAttribute("data-gantt-start", "2");
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-end]')).toHaveAttribute("data-gantt-end", "4");
});

test("create a duration-based condition, assign by dragging, and synchronize the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1600 });
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("create-schedule-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("create-schedule-seeded", "yes");
  }, { key: WORKFLOW_STORAGE_KEY, file: fixture() });
  await page.goto("/process-overview");
  await page.getByRole("button", { name: "Open Create Release Condition" }).click();
  const creator = page.getByRole("complementary", { name: "Create and assign release conditions" });
  await creator.getByRole("textbox", { name: "New release condition", exact: true }).fill("Approve shop drawings");
  await creator.getByRole("spinbutton", { name: "New condition duration in weeks", exact: true }).fill("2");
  await creator.getByRole("button", { name: "Create release condition", exact: true }).click();
  const inbox = creator.getByRole("region", { name: "Unassigned release conditions" });
  await expect(inbox).toContainText("2 weeks");
  await page.screenshot({ path: "tmp/process-create-condition.png" });
  const destination = page.getByRole("region", { name: "Department Gantt chart" }).locator('[data-release-condition-drop-node-id="tech"]');
  await creator.getByRole("button", { name: "Drag unassigned Approve shop drawings", exact: true }).hover();
  const target = (await destination.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  const assigned = page.locator('[data-gantt-task="Approve shop drawings"]');
  await expect(assigned).toBeVisible();
  await expect(assigned).toContainText("Approve shop drawings");
  await expect(assigned.locator("[data-gantt-end]")).toHaveAttribute("data-gantt-end", "16");
  await expect(inbox.getByText("Approve shop drawings", { exact: true })).toHaveCount(0);
  await assigned.getByRole("slider", { name: "Start day for Approve shop drawings" }).hover();
  const inboxBox = (await inbox.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(inboxBox.x + 100, inboxBox.y + 70, { steps: 12 });
  await page.mouse.up();
  await expect(inbox.getByText("Approve shop drawings", { exact: true })).toBeVisible();
  await expect(assigned).toHaveCount(0);
  await page.getByRole("button", { name: "Undo process change" }).click();
  await expect(assigned).toBeVisible();
  await page.reload();
  await expect(assigned).toBeVisible();
  await expect(assigned.getByRole("slider", { name: "Duration in days for Approve shop drawings" })).toHaveAttribute("aria-valuenow", "14");
  await page.getByRole("link", { name: "Open Release Conditions Workspace", exact: true }).click();
  await expect(page.locator('[data-release-condition-chapter-id="tech"]')).toContainText("Approve shop drawings");
});
