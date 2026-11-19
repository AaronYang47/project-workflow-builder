import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { processGanttPdfHtml } from "../src/lib/process-gantt-pdf";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("long weekly work switches to monthly axis and later conditions follow edits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 620, height: 900 });
  const file = createProjectWorkflow("Long Gantt schedule");
  const chapter = createDomainNode("general", "technical");
  chapter.config.stage = "Technical";
  chapter.conditions = [
    { id: "delineation", label: "Delineation", duration: 16, durationUnit: "weeks" },
    { id: "scope", label: "Scope of Work", duration: 2, durationUnit: "weeks" },
  ];
  file.graph.nodes = [chapter];
  file.highLevel!.graph.nodes = [
    {
      id: "phase-1",
      type: "phase",
      title: "PHASE 1",
      description: "Qualification",
      linkedLayer2NodeIds: [chapter.id],
    },
  ];
  file.highLevel!.graph.edges = [];
  const pdfHtml = processGanttPdfHtml(file, new Map());
  expect(pdfHtml).toContain(">M1<");
  expect(pdfHtml).toContain(">M2<");
  await page.addInitScript(
    ({ key, file }) => {
      if (sessionStorage.getItem("long-gantt-seeded")) return;
      sessionStorage.setItem("long-gantt-seeded", "yes");
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

  await page.goto("/process-overview");
  await page.getByRole("button", { name: "Timeline" }).click();
  expect(
    await page
      .locator('[data-gantt-task="Delineation"] [data-gantt-track]')
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThan(3400);
  const board = page.locator("[data-release-condition-board]");
  const firstRow = page.locator('[data-gantt-task="Delineation"]');
  const firstLabel = firstRow.locator("[data-gantt-label]");
  const fixedLeft = (await firstLabel.boundingBox())!.x;
  const header = board.getByText("Department / step");
  const headerLeft = (await header.boundingBox())!.x;
  const departmentHeading = board.locator("[data-gantt-department] h3 span").first();
  const departmentLeft = (await departmentHeading.boundingBox())!.x;
  await board.evaluate((element) => {
    element.scrollLeft = 450;
  });
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(Math.abs((await firstLabel.boundingBox())!.x - fixedLeft)).toBeLessThan(1);
  expect(Math.abs((await header.boundingBox())!.x - headerLeft)).toBeLessThan(1);
  expect(Math.abs((await departmentHeading.boundingBox())!.x - departmentLeft)).toBeLessThan(1);
  await firstLabel.click();
  await expect(firstRow).not.toHaveAttribute("data-gantt-selected", /true/);
  await expect(page.getByRole("dialog", { name: "Edit timing" })).toHaveCount(0);
  await page.getByRole("button", { name: "Auto follow previous: Off" }).click();
  await expect(
    page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]'),
  ).toHaveAttribute("data-gantt-start", "112");
  await page.getByRole("button", { name: "Edit timing for Delineation" }).click();
  await expect(page.getByRole("spinbutton", { name: "Start week for Delineation" })).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Duration weeks for Delineation" }).fill("20");
  await page.getByRole("button", { name: "Save timing" }).click();
  await expect(
    page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]'),
  ).toHaveAttribute("data-gantt-start", "140");
  await page.getByRole("button", { name: "Auto follow previous: On" }).click();
  await expect(
    page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]'),
  ).toHaveAttribute("data-gantt-start", "0");
  await page.getByRole("button", { name: "Edit timing for Scope of Work" }).click();
  await expect(page.getByText("Start · after Delineation finishes")).toBeVisible();
  await page.getByRole("button", { name: "Save timing" }).click();
  await expect(
    page.locator('[data-gantt-task="Scope of Work"] [data-gantt-start]'),
  ).toHaveAttribute("data-gantt-start", "140");
  const saved = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).state.file.graph.nodes.find(
        (node: { id: string }) => node.id === "technical",
      ).conditions[1].predecessor,
    WORKFLOW_STORAGE_KEY,
  );
  expect(saved).toEqual({
    nodeId: "technical",
    conditionId: "delineation",
    relation: "finish",
    lagDays: 0,
  });
});

test("Gantt timeline can move horizontally from the top while browsing many conditions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 600 });
  const file = createProjectWorkflow("Many Gantt conditions");
  const chapter = createDomainNode("general", "technical");
  chapter.config.stage = "Technical";
  chapter.conditions = Array.from({ length: 40 }, (_, index) => ({
    id: `condition-${index}`,
    label: `Technical condition ${index + 1}`,
    duration: 16,
    durationUnit: "weeks" as const,
  }));
  file.graph.nodes = [chapter];
  file.highLevel!.graph.nodes = [
    {
      id: "phase-1",
      type: "phase",
      title: "PHASE 1",
      description: "Qualification",
      linkedLayer2NodeIds: [chapter.id],
    },
  ];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(
    ({ key, file }) => {
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
  await page.goto("/process-overview");
  const board = page.locator("[data-release-condition-board]");
  const control = page.locator("[data-gantt-horizontal-control]");
  const slider = page.getByRole("slider", { name: "Gantt horizontal position" });
  await expect(control).toBeVisible();
  const mainScroll = page.locator("[data-release-condition-scroll]");
  expect(await mainScroll.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await mainScroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  const rect = await control.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(600);
  const maxScroll = Number(await slider.getAttribute("max"));
  expect(maxScroll).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Scroll Gantt right" }).click();
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0);
  await board.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await expect.poll(async () => Number(await slider.inputValue())).toBe(0);
  await mainScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
  });
  expect((await control.boundingBox())!.y).toBe(rect!.y);
  await page.getByRole("button", { name: "Scroll Gantt right" }).click();
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("mobile Gantt leaves room for the timeline and opens a touch-friendly editor", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const file = createProjectWorkflow("Mobile Gantt");
  const chapter = createDomainNode("general", "technical");
  chapter.config.stage = "Technical";
  chapter.conditions = [
    { id: "delineation", label: "Delineation", duration: 2, durationUnit: "weeks" },
  ];
  file.graph.nodes = [chapter];
  file.highLevel!.graph.nodes = [
    {
      id: "phase-1",
      type: "phase",
      title: "PHASE 1",
      description: "Qualification",
      linkedLayer2NodeIds: [chapter.id],
    },
  ];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(
    ({ key, file }) => {
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
  await page.goto("/process-overview");
  const toolbar = page.locator("[data-workflow-toolbar]");
  await expect(page.getByRole("button", { name: "Show toolbar" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Export Excel" })).toBeHidden();
  await page.getByRole("button", { name: "Show toolbar" }).click();
  await expect(toolbar.getByRole("button", { name: "Export Excel" })).toBeVisible();
  await page.getByRole("button", { name: "Hide toolbar" }).click();
  await expect(toolbar.getByRole("button", { name: "Export Excel" })).toBeHidden();
  await expect(page.getByLabel("Mobile schedule")).toBeVisible();
  await expect(page.getByRole("button", { name: "Move Delineation later one week" })).toBeVisible();
  await page.getByRole("button", { name: "Move Delineation later one week" }).click();
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.locator('[data-gantt-task="Delineation"] [data-gantt-start]')).toHaveAttribute(
    "data-gantt-start",
    "7",
  );
  const label = page.locator('[data-gantt-task="Delineation"] [data-gantt-label]');
  await expect(label).toBeVisible();
  expect((await label.boundingBox())!.width).toBeLessThan(200);
  await page.getByRole("button", { name: "Edit timing for Delineation" }).click();
  await expect(page.getByRole("dialog", { name: "Edit timing" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Duration weeks for Delineation" })).toHaveCSS(
    "height",
    "48px",
  );
  await page.getByRole("button", { name: "Close timing editor" }).click();
  const board = page.locator("[data-release-condition-board]");
  await board.evaluate((element) => {
    element.scrollLeft = 180;
  });
  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(label).toBeVisible();
  await context.close();
});

test("mobile conditions board uses a full-width canvas with an unassigned drawer", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const file = createProjectWorkflow("Mobile conditions");
  const chapter = createDomainNode("general", "technical");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Technical";
  chapter.conditions = [
    { id: "delineation", label: "Delineation", duration: 2, durationUnit: "weeks" },
  ];
  file.graph.nodes = [chapter];
  file.releaseConditionInbox = [
    { id: "unassigned-review", label: "Unassigned review", duration: 1, durationUnit: "weeks" },
    { id: "unassigned-approval", label: "Unassigned approval", duration: 1, durationUnit: "weeks" },
  ];
  await page.addInitScript(
    ({ key, file }) => {
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
  await page.goto("/release-conditions");
  await expect(page.getByRole("button", { name: /Open unassigned conditions/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Unassigned steps" })).toBeHidden();
  await page.getByRole("button", { name: /Open unassigned conditions/ }).click();
  await expect(page.getByRole("region", { name: "Unassigned steps" })).toBeVisible();
  await page.getByRole("button", { name: "Assign Unassigned review" }).click();
  const assignment = page.getByRole("dialog", { name: "Assign step" });
  await expect(assignment).toBeVisible();
  await assignment
    .getByRole("button", { name: "Assign to Technical Department CHAPTER 01" })
    .click();
  await expect(assignment).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Unassigned steps" })).toBeHidden();
  await expect(page.locator('[data-release-condition-chapter-id="technical"]')).toHaveAttribute(
    "data-release-condition-count",
    "2",
  );
  await page.setViewportSize({ width: 932, height: 430 });
  await page.getByRole("button", { name: /Open unassigned conditions/ }).click();
  await expect(page.getByRole("button", { name: "Assign Unassigned approval" })).toBeVisible();
  await context.close();
});

test("landscape phone can collapse the toolbar and keeps collaboration on one line", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 932, height: 430 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/process-overview");
  expect(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches)).toBe(
    true,
  );
  const toolbar = page.locator("[data-workflow-toolbar]");
  await expect(page.getByRole("button", { name: "Show toolbar" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Export Excel" })).toBeHidden();
  await page.getByRole("button", { name: "Show toolbar" }).click();
  await expect(toolbar.getByRole("button", { name: "Export Excel" })).toBeVisible();
  const collaboration = page.locator("[data-toolbar-search-group] button").last();
  await expect(collaboration).toBeVisible();
  expect(await collaboration.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
    "nowrap",
  );
  await page.getByRole("button", { name: "Hide toolbar" }).click();
  await expect(toolbar.getByRole("button", { name: "Export Excel" })).toBeHidden();
  await context.close();
});
