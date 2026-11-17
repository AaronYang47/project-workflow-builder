import { expect, test } from "playwright/test";
import ExcelJS from "exceljs";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";
import { createExecutionItem } from "../src/lib/execution";

test("linked condition drags back to an empty Unassigned panel and can be restored", async ({
  page,
}) => {
  // Below 1024px the Unassigned panel is a drawer; this covers the docked desktop panel.
  await page.setViewportSize({ width: 1280, height: 928 });
  const file = createProjectWorkflow("Unassign linked condition");
  const chapter = createDomainNode("general", "sales");
  chapter.title = "Sales";
  chapter.conditions = [
    {
      id: "opportunity",
      label: "Identify Customer Opportunity · EOI",
      linkedExecutionItemId: "eoi",
    },
  ];
  file.graph.nodes = [chapter];
  file.releaseConditionInbox = [];
  file.execution = { items: [createExecutionItem("eoi", chapter.id)] };
  await page.addInitScript(
    ({ key, workflow }) => {
      if (sessionStorage.getItem("unassign-linked-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
      sessionStorage.setItem("unassign-linked-seeded", "1");
    },
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.goto("/release-conditions");
  const inbox = page.getByRole("region", { name: "Unassigned release conditions" });
  const card = page.locator('[data-release-condition-chapter-id="sales"]');
  const row = card.getByRole("group", {
    name: "Release condition 1: Identify Customer Opportunity · EOI",
  });
  await expect(row).toBeVisible();
  await card.getByRole("button", { name: "Drag release condition 1", exact: true }).hover();
  await page.mouse.down();
  const destination = (await inbox.boundingBox())!;
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 250, { steps: 12 });
  await page.mouse.up();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue(
    "Identify Customer Opportunity · EOI",
  );
  await expect(row).toHaveCount(0);
  // Undo / Redo live in the toolbar.
  await page.getByRole("button", { name: "Undo (⌘Z)" }).click();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Redo (⇧⌘Z)" }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue(
    "Identify Customer Opportunity · EOI",
  );
  await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).hover();
  await page.mouse.down();
  const cardBox = (await card.boundingBox())!;
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + 60, { steps: 12 });
  await page.mouse.up();
  await expect(row).toBeVisible();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveCount(0);
});

test("bulk release conditions are assigned to Departments and visible in L1, L2, and L3", async ({
  page,
}) => {
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
  file.highLevel!.graph.nodes = [
    {
      id: "l1-phase",
      type: "phase",
      title: "Project phase",
      description: "",
      linkedLayer2NodeIds: [first.id, second.id],
      linkedDetailedNodeIds: [first.id, second.id],
    },
  ];
  file.highLevel!.layout.nodes = { "l1-phase": { nodeId: "l1-phase", x: 200, y: 220 } };
  await page.addInitScript(
    ({ key, workflow }) => {
      if (sessionStorage.getItem("release-condition-inbox-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
      sessionStorage.setItem("release-condition-inbox-seeded", "1");
    },
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.goto("/");

  const sidebarLink = page
    .locator("aside")
    .getByRole("link", { name: "Open Release Conditions Workspace" });
  const lastPaletteNode = page.locator("aside").getByRole("button", { name: /Final Close/ });
  await expect(sidebarLink).toBeVisible();
  expect((await sidebarLink.boundingBox())!.y).toBeGreaterThan(
    (await lastPaletteNode.boundingBox())!.y,
  );
  await page.getByRole("link", { name: "Open Release Conditions Workspace" }).first().click();
  await expect(page).toHaveURL(/\/release-conditions$/);
  const mainHeight = await page
    .locator("main")
    .evaluate((element) => element.getBoundingClientRect().height);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(mainHeight).toBe(viewportHeight);
  const inbox = page.getByRole("region", { name: "Unassigned release conditions" });
  const board = page.getByRole("region", { name: "Department condition board" });
  await inbox
    .getByRole("textbox", { name: "Enter release conditions, one per line" })
    .fill("Permit drawing approved\nProduct data sheet received");
  await inbox.getByRole("button", { name: "Add conditions" }).click();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 2" })).toHaveValue(
    "Product data sheet received",
  );

  const firstCard = board.locator('[data-release-condition-drop-node-id="chapter-one"]');
  const secondCard = board.locator('[data-release-condition-drop-node-id="chapter-two"]');
  await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).hover();
  await page.mouse.down();
  const firstHeader = (await firstCard.locator("h3").boundingBox())!;
  await page.mouse.move(firstHeader.x + 24, firstHeader.y + firstHeader.height / 2, { steps: 12 });
  const hit = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-release-condition-drop-node-id]")
        ?.dataset.releaseConditionDropNodeId,
    { x: firstHeader.x + 24, y: firstHeader.y + firstHeader.height / 2 },
  );
  expect(hit).toBe("chapter-one");
  await expect(inbox.locator('[data-release-condition-index="0"]')).toHaveAttribute(
    "data-dragging",
    "true",
  );
  await expect(firstCard).toHaveAttribute("data-drop-chapter", "true");
  await page.mouse.up();
  await expect(firstCard).not.toHaveAttribute("data-drop-chapter", "true");
  await expect(
    firstCard.getByRole("group", { name: "Release condition 1: Permit drawing approved" }),
  ).toBeVisible();
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue(
    "Product data sheet received",
  );
  await inbox.getByRole("button", { name: "Drag unassigned release condition 1" }).hover();
  await page.mouse.down();
  const secondHeader = (await secondCard.locator("h3").boundingBox())!;
  await page.mouse.move(secondHeader.x + 24, secondHeader.y + secondHeader.height / 2, {
    steps: 12,
  });
  await expect(secondCard).toHaveAttribute("data-drop-chapter", "true");
  await page.mouse.up();
  await expect(secondCard).toContainText("Product data sheet received");
  // Toolbar Undo / Redo reverse the last assignment.
  await page.getByRole("button", { name: "Undo (⌘Z)" }).click();
  await expect(secondCard).not.toContainText("Product data sheet received");
  await expect(inbox.getByRole("textbox", { name: "Unassigned condition text 1" })).toHaveValue(
    "Product data sheet received",
  );
  await page.getByRole("button", { name: "Redo (⇧⌘Z)" }).click();
  await expect(secondCard).toContainText("Product data sheet received");
  await inbox.getByRole("textbox", { name: "Search release conditions" }).fill("Product");
  await expect(secondCard).toContainText("Product data sheet received");
  await expect(firstCard).toContainText("No release conditions or forms match");
  await inbox.getByRole("textbox", { name: "Search release conditions" }).fill("");

  await board.getByRole("button", { name: "New Department" }).click();
  const createDepartment = board.getByRole("form", { name: "Create Department" });
  await createDepartment.getByRole("textbox", { name: "Department name" }).fill("Review Chapter");
  await createDepartment
    .getByRole("textbox", { name: "Department description" })
    .fill("Review the process");
  await createDepartment
    .getByRole("combobox", { name: "L1 Department owner" })
    .selectOption("l1-phase");
  await createDepartment.getByRole("button", { name: "Add Department" }).click();
  const reviewCard = board
    .locator("[data-release-condition-chapter]")
    .filter({ hasText: "Review Chapter" });
  await expect(reviewCard).toHaveCount(1);
  await expect(reviewCard).not.toContainText("L1 · Project phase");
  await reviewCard.getByRole("button", { name: "Edit Review Chapter Department" }).click();
  const editDepartment = reviewCard.getByRole("form", { name: "Edit Department" });
  await editDepartment.getByRole("textbox", { name: "Department name" }).fill("QA Chapter");
  await editDepartment.getByRole("button", { name: "Save Department" }).click();
  await expect(
    board.locator("[data-release-condition-chapter]").filter({ hasText: "QA Chapter" }),
  ).toHaveCount(1);

  await page.getByRole("link", { name: "L2 · Department Workflow" }).click();
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const l1 = page.locator('[data-id="l1-phase"]');
  await expect(l1).toContainText("2 release conditions");
  await expect(l1).toContainText("QA Chapter");

  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const firstChapter = page.locator('[data-id="chapter-one"]');
  const secondChapter = page.locator('[data-id="chapter-two"]');
  await firstChapter
    .getByRole("button", { name: "Open L3 details for release condition 1" })
    .click();
  await expect(page.getByRole("button", { name: /Permit drawing approved/ }).first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(firstChapter).toContainText("Permit drawing approved");
  await expect(secondChapter).toContainText("Product data sheet received");
  await page.getByRole("link", { name: "Open Release Conditions Workspace" }).first().click();
  await page.getByRole("link", { name: "L2 · Department Workflow" }).click();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  await page.addInitScript(
    ({ key, workflow }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.goto("/release-conditions");
  const board = page.getByRole("region", { name: "Department condition board" });
  // Project Start carries release conditions too, so it is a Department here; gates and phases are not.
  await expect(board.locator("[data-release-condition-chapter]")).toHaveCount(4);
  await expect(board.locator('[data-release-condition-drop-node-id="project-start"]')).toHaveCount(
    1,
  );
  await expect(board.locator('[data-release-condition-drop-node-id="gate-one"]')).toHaveCount(0);
  await expect(board.locator('[data-release-condition-drop-node-id="setup-phase"]')).toHaveCount(0);
  const departmentRows = board.locator(
    '[data-release-condition-chapter]:not([data-release-condition-chapter-id="project-start"]) [data-release-condition-index]',
  );
  await expect(departmentRows).toHaveCount(90);
  await page
    .getByRole("textbox", { name: "Search release conditions" })
    .first()
    .fill("Condition 089");
  await expect(board.locator("[data-release-condition-index]")).toHaveCount(1);
  await expect(board).toContainText("Condition 089");
  await page.getByRole("textbox", { name: "Search release conditions" }).first().fill("");
  await expect(departmentRows).toHaveCount(90);
});

test("Excel template imports conditions into matching Departments and leaves unknown ones unassigned", async ({
  page,
}) => {
  const file = createProjectWorkflow("Excel import process");
  const chapter = createDomainNode("general", "design-chapter");
  chapter.title = "Design";
  chapter.conditions = [];
  file.graph.nodes = [
    createDomainNode("projectStart", "project-start"),
    createDomainNode("gate", "setup-gate"),
    chapter,
  ];
  file.releaseConditionInbox = [];
  await page.addInitScript(
    ({ key, workflow }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.goto("/release-conditions");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel template" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("release-conditions-template.xlsx");
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(await download.path());
  expect(template.getWorksheet("Conditions")?.getCell("A1").value).toBe("Release Condition");
  expect(template.getWorksheet("Conditions")?.getCell("C1").value).toBe(
    "Condition ID (keep for existing rows)",
  );
  expect(template.getWorksheet("How to use")?.getCell("A8").value).toBe("Permit drawing approved");
  // The example uses the first Department, which is Project Start.
  expect(template.getWorksheet("How to use")?.getCell("B8").value).toBe("Project Start");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Conditions");
  sheet.addRow(["Release Condition", "Chapter (optional)"]);
  sheet.addRow(["Permit drawing approved", "Design"]);
  sheet.addRow(["Site survey complete", ""]);
  sheet.addRow(["Procurement ready", "Unknown Chapter"]);
  const buffer = await workbook.xlsx.writeBuffer();
  await page
    .locator('input[type="file"][aria-label="Select release conditions Excel file"]')
    .setInputFiles({
      name: "conditions.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(buffer),
    });
  await expect(
    page.getByText(/^Processed 3 rows: 1 added to Departments, 2 added to Unassigned/),
  ).toBeVisible();
  const designCard = page.locator('[data-release-condition-chapter-id="design-chapter"]');
  const inbox = page.getByRole("region", { name: "Unassigned release conditions" });
  await expect(designCard).toContainText("Permit drawing approved");
  await expect(inbox).toContainText("Site survey complete");
  await expect(inbox).toContainText("Procurement ready");
  await expect(page.locator('[data-release-condition-drop-node-id="setup-gate"]')).toHaveCount(0);
  // One Undo reverses the whole import.
  await page.getByRole("button", { name: "Undo (⌘Z)" }).click();
  await expect(designCard).not.toContainText("Permit drawing approved");
  await expect(inbox).not.toContainText("Site survey complete");
  await page.getByRole("button", { name: "Redo (⇧⌘Z)" }).click();
  await expect(designCard).toContainText("Permit drawing approved");
});

test("populated Excel template updates existing conditions without duplication", async ({
  page,
}) => {
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
  await page.addInitScript(
    ({ key, workflow }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.goto("/release-conditions");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel template" }).click();
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(await (await downloadPromise).path());
  const sheet = template.getWorksheet("Conditions")!;
  expect(sheet.getRow(2).values).toMatchObject([, "Pending intake", "", "existing-inbox"]);
  // Rows are matched by Condition ID; Project Start's conditions come before Design's.
  const dataRows = () =>
    Array.from({ length: sheet.rowCount - 1 }, (_, index) => sheet.getRow(index + 2));
  const permitRow = dataRows().find((row) => row.getCell(3).value === "existing-permit")!;
  expect(permitRow.getCell(1).value).toBe("Old permit");
  expect(permitRow.getCell(2).value).toBe("Design");
  const legacyRow = dataRows().find(
    (row) => row.getCell(1).value === "Legacy condition without ID",
  )!;
  expect(String(legacyRow.getCell(3).value)).toMatch(/^condition-/);

  const upload = async () => {
    const buffer = await template.xlsx.writeBuffer();
    await page
      .locator('input[type="file"][aria-label="Select release conditions Excel file"]')
      .setInputFiles({
        name: "current-conditions.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from(buffer),
      });
  };
  await upload();
  const importStatus = page.getByText(/^Processed \d+ rows:/);
  await expect(importStatus).toContainText(`${sheet.rowCount - 1} unchanged`);
  const designCard = page.locator('[data-release-condition-chapter-id="excel-design"]');
  const deliveryCard = page.locator('[data-release-condition-chapter-id="excel-delivery"]');
  await expect(designCard.locator("[data-release-condition-index]")).toHaveCount(2);

  permitRow.getCell(1).value = "Revised permit";
  permitRow.getCell(2).value = "Delivery";
  sheet.addRow(["New inspection", "Design", ""]);
  await upload();
  await expect(importStatus).toContainText("1 added to Departments");
  await expect(designCard.locator("[data-release-condition-index]")).toHaveCount(2);
  await expect(deliveryCard.locator("[data-release-condition-index]")).toHaveCount(1);
  await expect(deliveryCard).toContainText("Revised permit");
  // Moving a condition keeps its completed state.
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const file = JSON.parse(localStorage.getItem(key) || "{}").state?.file;
        return file?.graph.nodes
          .find((node: { id: string }) => node.id === "excel-delivery")
          ?.conditions.find((condition: { id: string }) => condition.id === "existing-permit")
          ?.checked;
      }, WORKFLOW_STORAGE_KEY),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Undo (⌘Z)" }).click();
  await expect(designCard).toContainText("Old permit");
  await expect(deliveryCard).not.toContainText("Revised permit");
});

test("mobile workspace assigns from the drawer and touch-drags between Departments", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    const file = createProjectWorkflow("Mobile process");
    const first = createDomainNode("general", "mobile-chapter-one");
    const second = createDomainNode("general", "mobile-chapter-two");
    first.title = "Mobile Design";
    second.title = "Mobile Delivery";
    first.conditions = [];
    second.conditions = Array.from({ length: 25 }, (_, index) => ({
      id: `mobile-existing-${index}`,
      label: `Existing condition ${index + 1}`,
      required: true,
    }));
    file.graph.nodes = [createDomainNode("projectStart", "project-start"), first, second];
    file.releaseConditionInbox = [
      { id: "touch-condition", label: "Touch approval", required: true },
    ];
    await page.addInitScript(
      ({ key, workflow }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
            version: 0,
          }),
        );
      },
      { key: WORKFLOW_STORAGE_KEY, workflow: file },
    );
    await page.goto("/release-conditions");
    const board = page.getByRole("region", { name: "Department condition board" });
    const firstCard = board.locator('[data-release-condition-chapter-id="mobile-chapter-one"]');
    const secondCard = board.locator('[data-release-condition-chapter-id="mobile-chapter-two"]');
    const boardSize = await board
      .locator("[data-release-condition-board]")
      .evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(boardSize.scroll).toBeGreaterThan(boardSize.client);

    // Phones keep Unassigned in a drawer and assign with the Assign dialog.
    await page.getByRole("button", { name: /Open unassigned conditions, 1 items/ }).tap();
    await page.getByRole("button", { name: "Assign Touch approval" }).tap();
    await page
      .getByRole("dialog", { name: "Assign release condition" })
      .getByRole("button", { name: /^Assign to .*Mobile Design/ })
      .tap();
    await expect(firstCard).toContainText("Touch approval");

    // Touch-drag between Departments auto-scrolls the board and the target list.
    const cdp = await context.newCDPSession(page);
    // Assigning smooth-scrolls the board to the Department; let it settle on screen first.
    const handleButton = firstCard.getByRole("button", {
      name: "Drag release condition 1",
      exact: true,
    });
    await handleButton.scrollIntoViewIfNeeded();
    let settled = -1;
    await expect
      .poll(
        async () => {
          const left = await board
            .locator("[data-release-condition-board]")
            .evaluate((element) => element.scrollLeft);
          const still = left === settled;
          settled = left;
          return still;
        },
        { intervals: [150] },
      )
      .toBe(true);
    const firstHandle = (await handleButton.boundingBox())!;
    const boardRect = (await board.locator("[data-release-condition-board]").boundingBox())!;
    const startAgain = {
      x: firstHandle.x + firstHandle.width / 2,
      y: firstHandle.y + firstHandle.height / 2,
    };
    const edge = { x: boardRect.x + boardRect.width - 9, y: startAgain.y };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...startAgain, id: 2 }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startAgain.x + ((edge.x - startAgain.x) * step) / 8, y: edge.y, id: 2 }],
      });
    }
    await expect
      .poll(() =>
        board.locator("[data-release-condition-board]").evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(100);
    // Project Start is the first Department, so keep holding at the edge until the target is on screen.
    for (let tick = 0; tick < 200; tick++) {
      const box = (await secondCard.locator("h3").boundingBox())!;
      if (box.x + 25 < boardRect.x + boardRect.width - 60) break;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: boardRect.x + boardRect.width - 3 - (tick % 2), y: edge.y, id: 2 }],
      });
      await page.waitForTimeout(30);
    }
    // Leave the edge so auto-scroll stops before measuring the target.
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: boardRect.x + boardRect.width / 2, y: edge.y, id: 2 }],
    });
    await page.waitForTimeout(150);
    const secondHeader = (await secondCard.locator("h3").boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: secondHeader.x + 25, y: secondHeader.y + secondHeader.height / 2, id: 2 }],
    });
    await expect(secondCard).toHaveAttribute("data-drop-chapter", "true");
    const secondList = secondCard.locator("[data-release-condition-list]");
    const listRect = (await secondList.boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: listRect.x + 35, y: listRect.y + listRect.height - 10, id: 2 }],
    });
    await expect
      .poll(() => secondList.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(100);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(secondCard).toContainText("Touch approval");
    await expect(firstCard).not.toContainText("Touch approval");
  } finally {
    await context.close();
  }
});
