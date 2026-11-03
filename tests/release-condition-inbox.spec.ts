import { expect, test } from "playwright/test";
import ExcelJS from "exceljs";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";
import { createExecutionItem } from "../src/lib/execution";

test("linked condition drags back to an empty Unassigned panel and can be restored", async ({ page }) => {
  await page.setViewportSize({ width: 1023, height: 928 });
  const file = createProjectWorkflow("Unassign linked condition");
  const chapter = createDomainNode("general", "sales");
  chapter.title = "Sales";
  chapter.conditions = [{ id: "opportunity", label: "Identify Customer Opportunity · EOI", linkedExecutionItemId: "eoi" }];
  file.graph.nodes = [chapter];
  file.releaseConditionInbox = [];
  file.execution = { items: [createExecutionItem("eoi", chapter.id)] };
  await page.addInitScript(({ key, workflow }) => {
    if (sessionStorage.getItem("unassign-linked-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("unassign-linked-seeded", "1");
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/release-conditions");
  const inbox = page.getByRole("region", { name: "Unassigned release conditions" });
  const card = page.getByRole("group", { name: "Sales Chapter", exact: true });
  await expect(card.getByRole("button", { name: "Return to unassigned" })).toBeVisible();
  await card.getByRole("button", { name: "Drag Sales release condition 1", exact: true }).hover();
  await page.mouse.down();
  const destination = (await inbox.boundingBox())!;
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 250, { steps: 12 });
  await page.mouse.up();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue("Identify Customer Opportunity · EOI");
  await expect(card.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo condition change" }).click();
  await expect(card.getByRole("textbox")).toHaveValue("Identify Customer Opportunity · EOI");
  await page.getByRole("button", { name: "Redo condition change" }).click();
  await page.reload();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue("Identify Customer Opportunity · EOI");
  await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).hover();
  await page.mouse.down();
  const heading = (await card.locator("h3").boundingBox())!;
  await page.mouse.move(heading.x + 20, heading.y + heading.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(card.getByRole("textbox")).toHaveValue("Identify Customer Opportunity · EOI");
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveCount(0);
});

test("bulk release conditions are assigned to Chapters and visible in L1, L2, and L3", async ({ page }) => {
  const file = createProjectWorkflow("Chapter process");
  const start = createDomainNode("projectStart", "project-start");
  const first = createDomainNode("general", "chapter-one");
  const second = createDomainNode("general", "chapter-two");
  first.title = "Design Chapter";
  second.title = "Delivery Chapter";
  first.conditions = [];
  second.conditions = [];
  file.graph.nodes = [start, first, second];
  file.layout.nodes = {
    "project-start": { nodeId: "project-start", x: 0, y: 220, width: 384, height: 420 },
    "chapter-one": { nodeId: "chapter-one", x: 450, y: 220, width: 384, height: 310 },
    "chapter-two": { nodeId: "chapter-two", x: 900, y: 220, width: 384, height: 310 },
  };
  file.highLevel!.graph.nodes = [{
    id: "l1-phase", type: "phase", title: "Project phase", description: "",
    linkedLayer2NodeIds: [first.id, second.id], linkedDetailedNodeIds: [first.id, second.id],
  }];
  file.highLevel!.layout.nodes = { "l1-phase": { nodeId: "l1-phase", x: 200, y: 220 } };
  await page.addInitScript(({ key, workflow }) => {
    if (sessionStorage.getItem("release-condition-inbox-seeded")) return;
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    sessionStorage.setItem("release-condition-inbox-seeded", "1");
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/");

  const sidebarLink = page.locator("aside").getByRole("link", { name: "Open Release Conditions Workspace" });
  const lastPaletteNode = page.locator("aside").getByRole("button", { name: /Final Close/ });
  await expect(sidebarLink).toBeVisible();
  expect((await sidebarLink.boundingBox())!.y).toBeGreaterThan((await lastPaletteNode.boundingBox())!.y);
  await page.getByRole("link", { name: "Open Release Conditions Workspace" }).first().click();
  await expect(page).toHaveURL(/\/release-conditions$/);
  const mainHeight = await page.locator("main").evaluate((element) => element.getBoundingClientRect().height);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(mainHeight).toBe(viewportHeight);
  const inbox = page.getByRole("region", { name: "Unassigned release conditions" });
  const board = page.getByRole("region", { name: "Chapter condition board" });
  await inbox.getByRole("textbox", { name: "Enter release conditions, one per line" }).fill("Permit drawing approved\nProduct data sheet received");
  await inbox.getByRole("button", { name: "Add conditions" }).click();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 2" })).toHaveValue("Product data sheet received");

  const firstCard = board.locator('[data-release-condition-drop-node-id="chapter-one"]');
  const secondCard = board.locator('[data-release-condition-drop-node-id="chapter-two"]');
  await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).hover();
  await page.mouse.down();
  const firstHeader = (await firstCard.locator("h3").boundingBox())!;
  await page.mouse.move(firstHeader.x + 24, firstHeader.y + firstHeader.height / 2, { steps: 12 });
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-release-condition-drop-node-id]")?.dataset.releaseConditionDropNodeId, { x: firstHeader.x + 24, y: firstHeader.y + firstHeader.height / 2 });
  expect(hit).toBe("chapter-one");
  await expect(inbox.locator('[data-release-condition-index="0"]')).toHaveAttribute("data-dragging", "true");
  await expect(firstCard).toHaveAttribute("data-drop-chapter", "true");
  await page.mouse.up();
  await expect(firstCard).not.toHaveAttribute("data-drop-chapter", "true");
  await expect(firstCard.getByRole("textbox", { name: "Text for Design Chapter release condition 1" })).toHaveValue("Permit drawing approved");
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue("Product data sheet received");
  await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).hover();
  await page.mouse.down();
  const secondHeader = (await secondCard.locator("h3").boundingBox())!;
  await page.mouse.move(secondHeader.x + 24, secondHeader.y + secondHeader.height / 2, { steps: 12 });
  await expect(secondCard).toHaveAttribute("data-drop-chapter", "true");
  await page.mouse.up();
  await expect(secondCard).toContainText("Product data sheet received");
  const firstText = firstCard.getByRole("textbox", { name: "Text for Design Chapter release condition 1" });
  await firstText.fill("Permit drawing revised");
  await firstText.blur();
  await page.getByRole("button", { name: "Undo condition change" }).click();
  await expect(firstText).toHaveValue("Permit drawing approved");
  await inbox.getByRole("textbox", { name: "Search release conditions" }).fill("Product");
  await expect(secondCard).toContainText("Product data sheet received");
  await expect(firstCard.getByText("No conditions match this search.")).toBeVisible();
  await inbox.getByRole("textbox", { name: "Search release conditions" }).fill("");

  await board.getByRole("button", { name: "New Chapter" }).click();
  const createChapter = board.getByRole("form", { name: "Create Chapter" });
  await createChapter.getByRole("textbox", { name: "Chapter name" }).fill("Review Chapter");
  await createChapter.getByRole("textbox", { name: "Chapter description" }).fill("Review the process");
  await createChapter.getByRole("combobox", { name: "L1 Chapter owner" }).selectOption("l1-phase");
  await createChapter.getByRole("button", { name: "Add Chapter" }).click();
  const reviewCard = board.getByRole("group", { name: "Review Chapter Chapter" });
  await expect(reviewCard).not.toContainText("L1 · Project phase");
  await reviewCard.getByRole("button", { name: "Edit Review Chapter Chapter" }).click();
  const editChapter = reviewCard.getByRole("form", { name: "Edit Chapter" });
  await editChapter.getByRole("textbox", { name: "Chapter name" }).fill("QA Chapter");
  await editChapter.getByRole("button", { name: "Save Chapter" }).click();
  await expect(board.getByRole("group", { name: "QA Chapter Chapter" })).toBeVisible();

  await page.getByRole("link", { name: "Back to workflow" }).click();
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const l1 = page.locator('[data-id="l1-phase"]');
  await expect(l1).toContainText("2 release conditions");
  await expect(l1).toContainText("QA Chapter");

  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const firstChapter = page.locator('[data-id="chapter-one"]');
  const secondChapter = page.locator('[data-id="chapter-two"]');
  await firstChapter.getByRole("button", { name: "Open L3 details for release condition 1" }).click();
  await expect(page.getByText("Release Conditions:")).toBeVisible();
  await expect(page.getByRole("button", { name: /Permit drawing approved/ })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(firstChapter).toContainText("Permit drawing approved");
  await expect(secondChapter).toContainText("Product data sheet received");
  await page.getByRole("link", { name: "Open Release Conditions Workspace" }).first().click();
  await page.getByRole("link", { name: "Back to workflow" }).click();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toHaveAttribute("aria-pressed", "true");
});

test("full-screen workspace remains usable with 92 release conditions", async ({ page }) => {
  const file = createProjectWorkflow("Large process");
  const chapters = ["Design", "Factory", "Delivery"].map((title, chapterIndex) => {
    const chapter = createDomainNode("general", `chapter-${chapterIndex}`);
    chapter.title = title;
    chapter.conditions = Array.from({ length: 30 }, (_, index) => ({
      id: `condition-${chapterIndex}-${index}`,
      label: `Condition ${String(chapterIndex * 30 + index + 1).padStart(3, "0")}`,
      required: true,
    }));
    return chapter;
  });
  file.graph.nodes = [
    createDomainNode("projectStart", "project-start"),
    createDomainNode("gate", "gate-one"),
    createDomainNode("phase", "setup-phase"),
    ...chapters,
  ];
  file.releaseConditionInbox = [
    { id: "pending-one", label: "Condition 091", required: true },
    { id: "pending-two", label: "Condition 092", required: true },
  ];
  await page.addInitScript(({ key, workflow }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/release-conditions");
  const board = page.getByRole("region", { name: "Chapter condition board" });
  await expect(page.getByRole("heading", { name: "L3 · Conditions" })).toBeVisible();
  await expect(board.locator("[data-release-condition-drop-node-id]")).toHaveCount(3);
  await expect(board.locator('[data-release-condition-drop-node-id="project-start"]')).toHaveCount(0);
  await expect(board.locator('[data-release-condition-drop-node-id="gate-one"]')).toHaveCount(0);
  await expect(board.locator('[data-release-condition-drop-node-id="setup-phase"]')).toHaveCount(0);
  await expect(board.locator("[data-release-condition-index]")).toHaveCount(90);
  await page.getByRole("textbox", { name: "Search release conditions" }).fill("Condition 089");
  await expect(board.locator("[data-release-condition-index]")).toHaveCount(1);
  await expect(board).toContainText("Condition 089");
  await page.getByRole("textbox", { name: "Search release conditions" }).fill("");
  await expect(board.locator("[data-release-condition-index]")).toHaveCount(90);
});

test("Excel template imports conditions into matching Chapters and leaves unknown Chapters unassigned", async ({ page }) => {
  const file = createProjectWorkflow("Excel import process");
  const chapter = createDomainNode("general", "design-chapter");
  chapter.title = "Design";
  chapter.conditions = [];
  file.graph.nodes = [createDomainNode("projectStart", "project-start"), createDomainNode("gate", "setup-gate"), chapter];
  file.releaseConditionInbox = [];
  await page.addInitScript(({ key, workflow }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/release-conditions");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel template" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("release-conditions-template.xlsx");
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(await download.path());
  expect(template.getWorksheet("Conditions")?.getCell("A1").value).toBe("Release Condition");
  expect(template.getWorksheet("Conditions")?.getCell("C1").value).toBe("Condition ID (keep for existing rows)");
  expect(template.getWorksheet("How to use")?.getCell("A8").value).toBe("Permit drawing approved");
  expect(template.getWorksheet("How to use")?.getCell("B8").value).toBe("Design");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Conditions");
  sheet.addRow(["Release Condition", "Chapter (optional)"]);
  sheet.addRow(["Permit drawing approved", "Design"]);
  sheet.addRow(["Site survey complete", ""]);
  sheet.addRow(["Procurement ready", "Unknown Chapter"]);
  const buffer = await workbook.xlsx.writeBuffer();
  await page.locator('input[type="file"][aria-label="Select release conditions Excel file"]').setInputFiles({
    name: "conditions.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(buffer),
  });
  await expect(page.getByRole("status")).toContainText("Processed 3 rows: 1 added to Chapters, 2 added to Unassigned");
  const designCard = page.getByRole("group", { name: "Design Chapter" });
  await expect(designCard).toContainText("Permit drawing approved");
  await expect(designCard.getByRole("textbox", { name: "Text for Design release condition 1" })).toHaveCSS("resize", "none");
  await expect(page.getByRole("region", { name: "Unassigned release conditions" })).toContainText("Site survey complete");
  await expect(page.getByRole("region", { name: "Unassigned release conditions" })).toContainText("Procurement ready");
  await expect(page.locator('[data-release-condition-drop-node-id="setup-gate"]')).toHaveCount(0);
  await designCard.getByRole("button", { name: "Delete Design release condition 1" }).click();
  await expect(designCard).not.toContainText("Permit drawing approved");
  await page.getByRole("button", { name: "Undo condition change" }).click();
  await expect(designCard).toContainText("Permit drawing approved");
  await page.getByRole("button", { name: "Undo condition change" }).click();
  await expect(designCard).not.toContainText("Permit drawing approved");
  await expect(page.getByRole("region", { name: "Unassigned release conditions" })).not.toContainText("Site survey complete");
});

test("populated Excel template updates existing conditions without duplication", async ({ page }) => {
  const file = createProjectWorkflow("Existing Excel process");
  const design = createDomainNode("general", "excel-design");
  const delivery = createDomainNode("general", "excel-delivery");
  design.title = "Design";
  delivery.title = "Delivery";
  design.conditions = [
    { id: "existing-permit", label: "Old permit", required: true, checked: true },
    { label: "Legacy condition without ID", required: true },
  ];
  delivery.conditions = [];
  file.graph.nodes = [createDomainNode("projectStart", "project-start"), design, delivery];
  file.releaseConditionInbox = [{ id: "existing-inbox", label: "Pending intake", required: true }];
  await page.addInitScript(({ key, workflow }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/release-conditions");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel template" }).click();
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(await (await downloadPromise).path());
  const sheet = template.getWorksheet("Conditions")!;
  expect(sheet.getRow(2).values).toMatchObject([, "Pending intake", "", "existing-inbox"]);
  expect(sheet.getCell("A3").value).toBe("Old permit");
  expect(sheet.getCell("B3").value).toBe("Design");
  expect(sheet.getCell("C3").value).toBe("existing-permit");
  expect(sheet.getCell("A4").value).toBe("Legacy condition without ID");
  expect(String(sheet.getCell("C4").value)).toMatch(/^condition-/);

  const upload = async () => {
    const buffer = await template.xlsx.writeBuffer();
    await page.locator('input[type="file"][aria-label="Select release conditions Excel file"]').setInputFiles({
      name: "current-conditions.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(buffer),
    });
  };
  await upload();
  await expect(page.getByRole("status")).toContainText("3 unchanged");
  await expect(page.getByRole("group", { name: "Design Chapter" }).locator("[data-release-condition-index]")).toHaveCount(2);

  sheet.getCell("A3").value = "Revised permit";
  sheet.getCell("B3").value = "Delivery";
  sheet.addRow(["New inspection", "Design", ""]);
  await upload();
  await expect(page.getByRole("status")).toContainText("1 added to Chapters");
  const designCard = page.getByRole("group", { name: "Design Chapter" });
  const deliveryCard = page.getByRole("group", { name: "Delivery Chapter" });
  await expect(designCard.locator("[data-release-condition-index]")).toHaveCount(2);
  await expect(deliveryCard.locator("[data-release-condition-index]")).toHaveCount(1);
  await expect(deliveryCard).toContainText("Revised permit");
  await expect(deliveryCard.locator('[aria-label="Completed in workflow"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo condition change" }).click();
  await expect(designCard).toContainText("Old permit");
  await expect(deliveryCard).not.toContainText("Revised permit");
});

test("mobile workspace supports touch dragging into a Chapter", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const file = createProjectWorkflow("Mobile process");
    const first = createDomainNode("general", "mobile-chapter-one");
    const second = createDomainNode("general", "mobile-chapter-two");
    first.title = "Mobile Design";
    second.title = "Mobile Delivery";
    first.conditions = [];
    second.conditions = Array.from({ length: 25 }, (_, index) => ({ id: `mobile-existing-${index}`, label: `Existing condition ${index + 1}`, required: true }));
    file.graph.nodes = [createDomainNode("projectStart", "project-start"), first, second];
    file.releaseConditionInbox = [{ id: "touch-condition", label: "Touch approval", required: true }];
    await page.addInitScript(({ key, workflow }) => {
      localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
    await page.goto("/release-conditions");
    const inbox = page.getByRole("region", { name: "Unassigned release conditions" });
    const board = page.getByRole("region", { name: "Chapter condition board" });
    const inboxRect = (await inbox.boundingBox())!;
    const chapterBoardRect = (await board.boundingBox())!;
    expect(chapterBoardRect.x).toBeGreaterThan(inboxRect.x + inboxRect.width - 2);
    expect(Math.abs(chapterBoardRect.y - inboxRect.y)).toBeLessThan(2);
    await expect(inbox.getByRole("textbox", { name: "Enter release conditions, one per line" })).toBeHidden();
    await inbox.getByRole("button", { name: "Add or import conditions" }).click();
    await expect(inbox.getByRole("textbox", { name: "Enter release conditions, one per line" })).toBeVisible();
    await page.getByRole("button", { name: "Close add or import panel" }).click();
    const boardSize = await board.locator("[data-release-condition-board]").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(boardSize.scroll).toBeGreaterThan(boardSize.client);

    const source = (await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).boundingBox())!;
    const destination = (await board.locator('[data-release-condition-drop-node-id="mobile-chapter-one"] h3').boundingBox())!;
    const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const end = { x: destination.x + 25, y: destination.y + destination.height / 2 };
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12, id: 1 }] });
    }
    await expect(board.locator('[data-release-condition-drop-node-id="mobile-chapter-one"]')).toHaveAttribute("data-drop-chapter", "true");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(board.getByRole("group", { name: "Mobile Design Chapter" })).toContainText("Touch approval");

    const firstHandle = (await board.getByRole("button", { name: "Drag Mobile Design release condition 1" }).boundingBox())!;
    const boardRect = (await board.locator("[data-release-condition-board]").boundingBox())!;
    const startAgain = { x: firstHandle.x + firstHandle.width / 2, y: firstHandle.y + firstHandle.height / 2 };
    const edge = { x: boardRect.x + boardRect.width - 9, y: startAgain.y };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...startAgain, id: 2 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startAgain.x + (edge.x - startAgain.x) * step / 8, y: edge.y, id: 2 }] });
    }
    await expect.poll(() => board.locator("[data-release-condition-board]").evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
    const secondHeader = (await board.locator('[data-release-condition-drop-node-id="mobile-chapter-two"] h3').boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: secondHeader.x + 25, y: secondHeader.y + secondHeader.height / 2, id: 2 }] });
    await expect(board.locator('[data-release-condition-drop-node-id="mobile-chapter-two"]')).toHaveAttribute("data-drop-chapter", "true");
    const secondList = board.locator('[data-release-condition-drop-node-id="mobile-chapter-two"] [data-release-condition-list]');
    const listRect = (await secondList.boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: listRect.x + 35, y: listRect.y + listRect.height - 10, id: 2 }] });
    await expect.poll(() => secondList.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(board.getByRole("group", { name: "Mobile Delivery Chapter" })).toContainText("Touch approval");
  } finally {
    await context.close();
  }
});
