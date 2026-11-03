import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { processGanttPdfHtml } from "../src/lib/process-gantt-pdf";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("long weekly work switches to monthly axis and later conditions follow edits", async ({ page }) => {
  await page.setViewportSize({ width: 620, height: 900 });
  const file = createProjectWorkflow("Long Gantt schedule");
  const chapter = createDomainNode("general", "technical");
  chapter.config.stage = "Technical";
  chapter.conditions = [
    { id: "delineation", label: "Delineation", duration: 16, durationUnit: "weeks" },
    { id: "scope", label: "Scope of Work", duration: 2, durationUnit: "weeks" },
  ];
  file.graph.nodes = [chapter];
  file.highLevel!.graph.nodes = [{ id: "phase-1", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: [chapter.id] }];
  file.highLevel!.graph.edges = [];
  const pdfHtml = processGanttPdfHtml(file, new Map());
  expect(pdfHtml).toContain(">M1<");
  expect(pdfHtml).toContain(">M2<");
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("long-gantt-seeded")) return;
    sessionStorage.setItem("long-gantt-seeded", "yes");
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });

  await page.goto("/process-overview");
  await expect(page.getByLabel("Gantt time scale")).toContainText("Months");
  expect(await page.locator('[data-gantt-task="Delineation"] [data-gantt-track]').evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(3400);
  const board = page.locator("[data-release-condition-board]");
  const firstRow = page.locator('[data-gantt-task="Delineation"]');
  const firstLabel = firstRow.locator("[data-gantt-label]");
  const fixedLeft = (await firstLabel.boundingBox())!.x;
  const header = board.getByText("Department / release condition");
  const headerLeft = (await header.boundingBox())!.x;
  const departmentHeading = board.locator("[data-gantt-department] h3 span").first();
  const departmentLeft = (await departmentHeading.boundingBox())!.x;
  await board.evaluate((element) => { element.scrollLeft = 450; });
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(Math.abs((await firstLabel.boundingBox())!.x - fixedLeft)).toBeLessThan(1);
  expect(Math.abs((await header.boundingBox())!.x - headerLeft)).toBeLessThan(1);
  expect(Math.abs((await departmentHeading.boundingBox())!.x - departmentLeft)).toBeLessThan(1);
  await firstLabel.click();
  await expect(firstRow).toHaveAttribute("data-gantt-selected", "true");
  await page.locator('[data-gantt-task="Scope of Work"] [data-gantt-label]').click();
  await expect(firstRow).toHaveAttribute("data-gantt-selected", "false");
  await expect(page.locator('[data-gantt-task="Scope of Work"]')).toHaveAttribute("data-gantt-selected", "true");
  await page.getByRole("button", { name: "Auto follow previous: Off" }).click();
  await expect(page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]')).toHaveAttribute("data-gantt-start", "112");
  await page.getByRole("button", { name: "Edit timing for Delineation" }).click();
  await expect(page.getByRole("spinbutton", { name: "Start week for Delineation" })).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Duration weeks for Delineation" }).fill("20");
  await page.getByRole("button", { name: "Save timing" }).click();
  await expect(page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]')).toHaveAttribute("data-gantt-start", "140");
  await page.getByRole("button", { name: "Auto follow previous: On" }).click();
  await expect(page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]')).toHaveAttribute("data-gantt-start", "0");
  await page.getByRole("button", { name: "Edit timing for Scope of Work" }).click();
  await expect(page.getByText("Start · after Delineation finishes")).toBeVisible();
  await page.getByRole("button", { name: "Save timing" }).click();
  await expect(page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]')).toHaveAttribute("data-gantt-start", "140");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find((node: { id: string }) => node.id === "technical").conditions[1].predecessor, WORKFLOW_STORAGE_KEY);
  expect(saved).toEqual({ nodeId: "technical", conditionId: "delineation", relation: "finish", lagDays: 0 });
});

test("Gantt timeline can move horizontally from the top while browsing many conditions", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const file = createProjectWorkflow("Many Gantt conditions");
  const chapter = createDomainNode("general", "technical");
  chapter.config.stage = "Technical";
  chapter.conditions = Array.from({ length: 40 }, (_, index) => ({
    id: `condition-${index}`, label: `Technical condition ${index + 1}`,
    duration: 16, durationUnit: "weeks" as const,
  }));
  file.graph.nodes = [chapter];
  file.highLevel!.graph.nodes = [{ id: "phase-1", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: [chapter.id] }];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const board = page.locator("[data-release-condition-board]");
  const control = page.locator("[data-gantt-horizontal-control]");
  const slider = page.getByRole("slider", { name: "Gantt horizontal position" });
  await expect(control).toBeVisible();
  const mainScroll = page.locator("[data-release-condition-scroll]");
  expect(await mainScroll.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await mainScroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const rect = await control.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(600);
  const maxScroll = Number(await slider.getAttribute("max"));
  expect(maxScroll).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Scroll Gantt right" }).click();
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0);
  await board.evaluate((element) => { element.scrollLeft = 0; });
  await expect.poll(async () => Number(await slider.inputValue())).toBe(0);
  await mainScroll.evaluate((element) => { element.scrollTop = element.scrollHeight / 2; });
  expect((await control.boundingBox())!.y).toBe(rect!.y);
  await page.getByRole("button", { name: "Scroll Gantt right" }).click();
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});
