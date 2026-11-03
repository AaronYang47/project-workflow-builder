import { expect, test } from "playwright/test";
import { execFileSync } from "node:child_process";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("PDF phase frames align with shared department color boundaries", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Aligned department coverage");
  const names = ["Sales", "Technical", "Purchasing", "Production", "Site/After Service"];
  const links = [[0, 1], [1, 2], [2, 3, 4], [4]];
  file.graph.nodes = links.flatMap((indices, phase) => indices.map((index) => {
    const node = createDomainNode("general", `department-${phase}-${index}`);
    node.title = `CHAPTER ${phase + 1}`;
    node.config.stage = names[index];
    return node;
  }));
  file.highLevel!.graph.nodes = links.map((indices, index) => ({
    id: `phase-${index}`, type: "phase", title: `PHASE ${index + 1}`,
    description: ["Qualification", "Pre-Construction", "Construction", "Post-Construction"][index],
    backgroundColor: ["#0284c7", "#10b981", "#f97316", "#f43f5e"][index],
    linkedLayer2NodeIds: indices.map((i) => `department-${index}-${i}`),
  }));
  file.highLevel!.graph.edges = links.slice(1).map((_, i) => ({ id: `edge-${i}`, source: `phase-${i}`, target: `phase-${i + 1}` }));
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector(".phase-row");
      if (root) {
        const frames = Array.from(root.querySelectorAll(".phase-card")).map((el) => el.getBoundingClientRect().right);
        const shared = Array.from(document.querySelectorAll(".phase-strip")).filter((el) => el.children.length === 2);
        const boundaries = shared.map((el) => (el.children[0].getBoundingClientRect().right + el.children[1].getBoundingClientRect().left) / 2);
        (window as unknown as { alignment: number[] }).alignment = boundaries.map((boundary, index) => Math.abs(boundary - frames[index]));
      }
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByText("High Level Process System Flowchart", { exact: true }).click();
  await (await pending).saveAs(testInfo.outputPath("aligned-flowchart.pdf"));
  const errors = await page.evaluate(() => (window as unknown as { alignment: number[] }).alignment);
  expect(errors).toHaveLength(3);
  errors.forEach((error) => expect(error).toBeLessThan(1));
});

test("Gantt PDF aligns original single-row cards and phase colors to the Gantt axis", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Adaptive Gantt process");
  const names = ["Sales", "Technical Design and Coordination", "Purchasing", "Production", "Site/After Service"];
  const links = [[0, 1], [1, 2], [2, 3, 4], [4]];
  file.graph.nodes = links.flatMap((indices, phase) => indices.map((index) => {
    const node = createDomainNode("general", `department-${phase}-${index}`);
    node.title = `CHAPTER ${phase + 1}`;
    node.config.stage = names[index];
    node.conditions = [{ id: `condition-${phase}-${index}`, label: `${names[index]} release ${phase + 1}`, duration: index === 1 ? 2 : 1, durationUnit: index === 1 ? "weeks" : "days" }];
    if (phase >= 2) node.conditions[0] = { ...node.conditions[0], duration: phase === 2 ? 6 : 7, durationUnit: "days" };
    if (phase === 0 && index === 1) node.conditions.push({ id: "parallel", label: "Parallel coordination", duration: 3 });
    if (phase === 3 && index === 4) node.conditions.push({ id: "missing", label: "Estimate still needed" });
    return node;
  }));
  file.highLevel!.graph.nodes = links.map((indices, index) => ({
    id: `phase-${index}`, type: "phase", title: `PHASE ${index + 1}`,
    description: ["Qualification", "Pre-Construction", "Construction", "Post-Construction"][index],
    backgroundColor: ["#0284c7", "#10b981", "#f97316", "#f43f5e"][index],
    linkedLayer2NodeIds: indices.map((i) => `department-${index}-${i}`),
  }));
  file.highLevel!.graph.edges = links.slice(1).map((_, i) => ({ id: `edge-${i}`, source: `phase-${i}`, target: `phase-${i + 1}` }));
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector(".pdf-gantt")?.parentElement;
      if (root) {
        const frames = Array.from(root.querySelectorAll<HTMLElement>(".phase-card"));
        const departments = Array.from(root.querySelectorAll<HTMLElement>(".department-card"));
        const shared = Array.from(root.querySelectorAll(".phase-strip")).filter((el) => el.children.length === 2);
        const differences = shared.map((el, index) => Math.abs((el.children[0].getBoundingClientRect().right + el.children[1].getBoundingClientRect().left) / 2 - frames[index].getBoundingClientRect().right));
        const phaseErrors = frames.map((frame) => {
          const bars = Array.from(root.querySelectorAll<HTMLElement>(`[data-pdf-gantt-phase="${frame.dataset.pdfPhaseId}"] .gantt-bar`));
          return Math.abs(frame.getBoundingClientRect().right - Math.max(...bars.map((bar) => bar.getBoundingClientRect().right)));
        });
        const ganttRight = root.querySelector(".pdf-gantt")!.getBoundingClientRect().right;
        const rightEdgeErrors = [frames.at(-1), departments.at(-1)].map((element) => Math.abs(element!.getBoundingClientRect().right - ganttRight));
        const axisStartError = Math.abs(root.querySelector(".phase-row")!.getBoundingClientRect().left - root.querySelector(".gantt-axis")!.getBoundingClientRect().left);
        const departmentWidths = departments.map((element) => Math.round(element.getBoundingClientRect().width));
        const getBar = (name: string) => root.querySelector(`[data-pdf-gantt-task="${name}"] .gantt-bar`)?.getAttribute("data-start");
        (window as unknown as { ganttPdfCheck: unknown }).ganttPdfCheck = {
          phaseUnits: frames.map((frame) => frame.querySelector(".phase-duration-unit")?.textContent),
          phaseDays: frames.map((frame) => frame.querySelector(".phase-duration-number")?.textContent),
          prominentDays: frames.every((frame) => parseFloat(getComputedStyle(frame.querySelector(".phase-duration-number")!).fontSize) >= 20),
          bottomRightDays: frames.every((frame) => {
            const card = frame.getBoundingClientRect();
            const duration = frame.querySelector(".phase-duration")!.getBoundingClientRect();
            const lift = frame.querySelector<HTMLElement>("[data-phase-actual-production-time]")?.offsetHeight ?? 0;
            return Math.abs(card.right - duration.right - 13) < 1 && Math.abs(card.bottom - duration.bottom - 11 - lift) < 1;
          }),
          partialPhase: frames.at(-1)?.querySelector(".phase-duration-note")?.textContent,
          phaseTags: Array.from(root.querySelectorAll(".gantt-phase-tag")).map((element) => element.textContent),
          phaseTagColorsMatch: Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-gantt-task]")).every((row) => {
            const tag = row.querySelector(".gantt-phase-tag")!;
            const phase = root.querySelector(`[data-pdf-phase-id="${row.dataset.pdfGanttPhase}"]`);
            return !phase || getComputedStyle(tag).backgroundColor === getComputedStyle(phase).borderTopColor;
          }),
          phaseInvolvement: frames.map((frame) => frame.querySelector(".phase-involvement")?.textContent),
          phaseInvolvementPositions: frames.map((frame) => {
            const card = frame.getBoundingClientRect();
            const label = frame.querySelector(".phase-involvement")!.getBoundingClientRect();
            return { top: label.top - card.top, right: card.right - label.right };
          }),
          barLabels: Array.from(root.querySelectorAll(".gantt-bar-text")).map((element) => element.textContent),
          salesGanttRows: Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-gantt-department]")).filter((row) => /sales/i.test(row.dataset.pdfGanttDepartment || "")).length,
          salesBars: Array.from(root.querySelectorAll<HTMLElement>("[data-pdf-gantt-department]")).filter((row) => /sales/i.test(row.dataset.pdfGanttDepartment || "")).reduce((count, row) => count + row.querySelectorAll(".gantt-bar").length, 0),
          shortBarLabels: Array.from(root.querySelectorAll("[data-pdf-short-bar-label]")).map((element) => element.textContent),
          barLabelOverflow: Array.from(root.querySelectorAll<HTMLElement>(".gantt-bar-text")).some((element) => element.getBoundingClientRect().right > root.querySelector(".pdf-gantt")!.getBoundingClientRect().right),
          rowCaptions: Array.from(root.querySelectorAll(".coverage-caption")).map((element) => element.textContent),
          departmentGradients: departments.filter((element) => element.querySelectorAll(".phase-segment").length > 1).map((element) => element.style.getPropertyValue("--department-gradient")),
          differences, phaseErrors, rightEdgeErrors, axisStartError, departmentWidths, departmentTops: departments.map((element) => element.getBoundingClientRect().top),
          widths: frames.map((element) => Math.round(element.getBoundingClientRect().width)),
          departmentLabels: departments.map((element) => element.querySelector(".department-label")?.textContent),
          productionNotes: Array.from(root.querySelectorAll("[data-department-actual-production-time]")).map((element) => element.textContent),
          productionNoteOverflow: Array.from(root.querySelectorAll<HTMLElement>("[data-department-actual-production-time]")).some((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1),
          sheetFillRatio: root.getBoundingClientRect().width / root.getBoundingClientRect().height,
          phaseTitles: frames.map((element) => element.querySelector(".phase-title")?.textContent),
          hasTimingLanes: Boolean(root.querySelector(".pdf-timeline")),
          parallelStart: getBar("Parallel coordination"), techStart: getBar("Technical Design and Coordination release 1"),
          techEnd: root.querySelector('[data-pdf-gantt-task="Technical Design and Coordination release 1"] .gantt-bar')?.getAttribute("data-end"),
          sevenDayWeek: root.textContent?.includes("1 month = 4 weeks"),
          titlesOnly: Array.from(root.querySelectorAll("[data-pdf-gantt-task]")).every((row) => row.querySelector(".gantt-title")?.textContent === row.getAttribute("data-pdf-gantt-task")),
          unknown: root.textContent?.includes("Duration needed"), hasEvidence: Boolean(root.querySelector(".evidence-grid")),
          overflow: Array.from(root.querySelectorAll<HTMLElement>(".gantt-label,.phase-title,.department-label,.phase-duration")).some((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1),
        };
      }
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  await expect(page.locator("[data-tech-day-one-marker]")).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toContain("with-gantt-chart.pdf");
  const pdfPath = testInfo.outputPath("flowchart-with-gantt.pdf");
  await download.saveAs(pdfPath);
  const pdfInfo = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  expect(pdfInfo).toMatch(/Pages:\s+1\b/);
  expect(pdfInfo).toMatch(/Page size:\s+1224(?:\.\d+)? x 792(?:\.\d+)? pts/);
  const result = await page.evaluate(() => (window as unknown as { ganttPdfCheck: { phaseUnits: string[]; phaseDays: string[]; prominentDays: boolean; bottomRightDays: boolean; partialPhase: string; phaseTags: string[]; phaseTagColorsMatch: boolean; phaseInvolvement: string[]; phaseInvolvementPositions: { top: number; right: number }[]; barLabels: string[]; salesGanttRows: number; salesBars: number; shortBarLabels: string[]; barLabelOverflow: boolean; rowCaptions: string[]; departmentGradients: string[]; phaseErrors: number[]; rightEdgeErrors: number[]; axisStartError: number; departmentWidths: number[]; differences: number[]; departmentTops: number[]; departmentLabels: string[]; productionNotes: string[]; productionNoteOverflow: boolean; sheetFillRatio: number; phaseTitles: string[]; hasTimingLanes: boolean; widths: number[]; parallelStart: string; techStart: string; techEnd: string; sevenDayWeek: boolean; titlesOnly: boolean; unknown: boolean; hasEvidence: boolean; overflow: boolean } }).ganttPdfCheck);
  expect(result.phaseDays).toEqual(["2", "2", "0.9", "1+"]);
  expect(result.phaseUnits).toEqual(["WEEKS", "WEEKS", "WEEKS", "WEEK"]);
  expect(result.prominentDays).toBe(true);
  expect(result.bottomRightDays).toBe(true);
  expect(result.partialPhase).toBe("Partial estimate");
  expect(result.phaseTags).toEqual(["PHASE 1", "PHASE 1", "PHASE 1", "PHASE 2", "PHASE 2", "PHASE 3", "PHASE 3", "PHASE 3", "PHASE 4", "PHASE 4", "UNLINKED"]);
  expect(result.phaseTagColorsMatch).toBe(true);
  expect(result.phaseInvolvement).toEqual(["2 Departments Involved", "2 Departments Involved", "3 Departments Involved", "1 Department Involved"]);
  result.phaseInvolvementPositions.forEach((position) => {
    expect(Math.abs(position.top - result.phaseInvolvementPositions[3].top)).toBeLessThan(1);
    expect(Math.abs(position.right - result.phaseInvolvementPositions[3].right)).toBeLessThan(1);
  });
  expect(result.barLabels).toEqual(["TECH 2w", "TECH 0.43w", "TECH 2w", "PURC 0.14w", "PURC 0.86w", "PROD 0.86w", "SITE 0.86w", "SITE 1w"]);
  expect(result.salesGanttRows).toBe(1);
  expect(result.salesBars).toBe(0);
  expect(result.shortBarLabels).toEqual([]);
  expect(result.barLabelOverflow).toBe(false);
  expect(result.differences).toHaveLength(3);
  result.differences.forEach((value) => expect(value).toBeLessThan(1));
  expect(result.rowCaptions).toEqual(["PHASE", "RESPONSIBLE DEPARTMENTS"]);
  expect(result.departmentGradients).toHaveLength(3);
  result.departmentGradients.forEach((gradient) => expect(gradient).toMatch(/^linear-gradient\(90deg, #[a-f0-9]+ 0%, #[a-f0-9]+ 100%\)$/));
  expect(result.phaseErrors).toHaveLength(4);
  result.phaseErrors.slice(0, -1).forEach((error) => expect(error).toBeLessThan(1));
  result.rightEdgeErrors.forEach((error) => expect(error).toBeLessThan(2));
  expect(result.axisStartError).toBeLessThan(1);
  expect(new Set(result.departmentWidths).size).toBeGreaterThan(1);
  expect(new Set(result.departmentTops).size).toBe(1);
  expect(result.departmentLabels).toEqual(names.map((name) => `${name} Department`));
  expect(result.productionNotes).toEqual(["+ Actual Production Time [Average Time Per Module is 2 Weeks]"]);
  expect(result.productionNoteOverflow).toBe(false);
  expect(result.sheetFillRatio).toBeCloseTo(17 / 11, 1);
  expect(result.phaseTitles).toEqual(["Qualification", "Pre-Construction", "Construction", "Post-Construction"]);
  expect(result.hasTimingLanes).toBe(false);
  expect(new Set(result.widths).size).toBeGreaterThan(1);
  expect(result.parallelStart).toBe(result.techStart);
  expect(result.techEnd).toBe("14");
  expect(result.sevenDayWeek).toBe(true);
  expect(result.titlesOnly).toBe(true);
  expect(result.unknown).toBe(true);
  expect(result.hasEvidence).toBe(false);
  expect(result.overflow).toBe(false);
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByText("High Level Process System Flowchart with Gantt Chart", { exact: true })).toBeVisible();
});

test("PDF keeps phase durations and counts elapsed days after Sales handoff", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Calendar phase totals");
  const days = [21, 28, 42, 56];
  file.graph.nodes = days.map((duration, index) => {
    const node = createDomainNode("general", `calendar-${index}`);
    node.title = `CHAPTER ${index + 1}`;
    node.config.stage = ["Sales", "Technical", "Purchasing", "Site/After Service"][index];
    node.conditions = [{ id: `task-${index}`, label: `Phase ${index + 1} task`, duration }];
    return node;
  });
  file.highLevel!.graph.nodes = days.map((_, index) => ({ id: `phase-${index}`, type: "phase", title: `PHASE ${index + 1}`, description: ["Qualification", "Pre-Construction", "Construction", "Post-Construction"][index], backgroundColor: ["#0284c7", "#10b981", "#f97316", "#f43f5e"][index], linkedLayer2NodeIds: [`calendar-${index}`] }));
  file.highLevel!.graph.edges = days.slice(1).map((_, index) => ({ id: `next-${index}`, source: `phase-${index}`, target: `phase-${index + 1}` }));
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const totals = Array.from(document.querySelectorAll<HTMLElement>(".phase-duration"));
      if (totals.length) (window as unknown as { calendarPdf: unknown }).calendarPdf = {
        labels: totals.map((total) => Array.from(total.querySelectorAll(".phase-duration-part")).map((part) => `${part.querySelector(".phase-duration-number")!.textContent} ${part.querySelector(".phase-duration-unit")!.textContent}`).join(" ")),
        preTech: totals[0].textContent,
        summary: document.querySelector(".gantt-heading + .gantt-note")?.textContent,
        fits: totals.every((total) => total.scrollWidth <= total.clientWidth + 1 && total.scrollHeight <= total.clientHeight + 1),
      };
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF", exact: true }).click();
  await (await pending).saveAs(testInfo.outputPath("calendar-month-week-totals.pdf"));
  const result = await page.evaluate(() => (window as unknown as { calendarPdf: { labels: string[]; preTech: string; summary: string; fits: boolean } }).calendarPdf);
  expect(result.labels).toEqual(["", "1 MONTH", "1 MONTH 2 WEEKS", "2 MONTHS"]);
  expect(result.preTech).toContain("Timing begins with Technical work");
  expect(result.summary).toContain("Estimated span after Sales handoff: 18 weeks");
  expect(result.fits).toBe(true);
});

test("Gantt PDF hides Purchasing coverage until it has a release condition", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Empty Purchasing PDF");
  const sales = createDomainNode("general", "sales-with-work");
  sales.config.stage = "Sales";
  sales.conditions = [{ id: "sales-entry", label: "Job Number is entered", duration: 4 }];
  const technical = createDomainNode("general", "tech-with-work");
  technical.config.stage = "Technical";
  technical.conditions = [{ id: "tech-review", label: "Coordination", duration: 3 }];
  const purchasing = createDomainNode("general", "purchasing-empty");
  purchasing.config.stage = "Purchasing";
  purchasing.conditions = [];
  file.graph.nodes = [sales, technical, purchasing];
  file.highLevel!.graph.nodes = [
    { id: "phase-1", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: [sales.id, technical.id] },
    { id: "phase-2", type: "phase", title: "PHASE 2", description: "Pre-Construction", linkedLayer2NodeIds: [purchasing.id] },
  ];
  file.highLevel!.graph.edges = [{ id: "phase-edge", source: "phase-1", target: "phase-2" }];
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector(".pdf-gantt")?.parentElement;
      if (root) (window as unknown as { pdfDepartments: string[] }).pdfDepartments = Array.from(root.querySelectorAll(".department-label,.gantt-department")).map((element) => element.textContent || "");
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF", exact: true }).click();
  await (await pending).saveAs(testInfo.outputPath("without-purchasing.pdf"));
  const labels = await page.evaluate(() => (window as unknown as { pdfDepartments: string[] }).pdfDepartments);
  expect(labels).toContain("Sales Department");
  expect(labels).toContain("Technical Department");
  expect(labels).toContain("Department Sales");
  expect(labels).toContain("Department Technical");
  expect(labels).not.toContain("Purchasing Department");
  expect(labels).not.toContain("Department Purchasing");
});

test("Gantt PDF keeps legal and customer lists in department cards and supporting documents below", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Document coverage PDF");
  const sales = createDomainNode("general", "sales-chapter");
  sales.config.stage = "Sales";
  sales.conditions = [{ id: "sales-entry", label: "Customer qualification", duration: 4 }];
  sales.customFields["legalDocuments::release-condition::sales-entry"] = JSON.stringify([{ id: "sales-legal", title: "Customer authorization", category: "legal" }]);
  sales.customFields["customerDocuments::release-condition::sales-entry"] = JSON.stringify([{ id: "sales-customer", title: "Customer profile", category: "customer" }]);
  const technical = createDomainNode("general", "tech-chapter");
  technical.config.stage = "Technical";
  technical.conditions = [{ id: "tech-design", label: "Technical review", duration: 5,
    predecessor: { nodeId: sales.id, conditionId: "sales-entry", relation: "finish", lagDays: 0 } }];
  technical.conditions.push({ id: "tech-parallel", label: "Parallel review", duration: 2,
    predecessor: { nodeId: sales.id, conditionId: "sales-entry", relation: "finish", lagDays: 0 } });
  technical.customFields["legalDocuments::release-condition::tech-design"] = JSON.stringify([{ id: "tech-legal", title: "Signed agreement", category: "legal" }]);
  technical.customFields["supportingDocuments::release-condition::tech-design"] = JSON.stringify([{ id: "tech-support", title: "Site survey", category: "supporting" }]);
  technical.customFields["customerDocuments::release-condition::tech-design"] = JSON.stringify([{ id: "tech-customer", title: "Client requirements", category: "customer" }]);
  file.graph.nodes = [sales, technical];
  file.highLevel!.graph.nodes = [{ id: "qualification", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: [sales.id, technical.id] }];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector(".pdf-gantt")?.parentElement;
      if (root) (window as unknown as { documentPdf: unknown }).documentPdf = {
        phaseText: root.querySelector(".phase-card")?.textContent,
        duration: root.querySelector(".phase-duration")?.textContent,
        salesLegal: Array.from(root.querySelectorAll('[data-department-documents="Sales Department"] li')).map((element) => element.textContent),
        techLegal: Array.from(root.querySelectorAll('[data-department-documents="Technical Department"] li')).map((element) => element.textContent),
        salesCustomer: Array.from(root.querySelectorAll('[data-department-customer="Sales Department"] li')).map((element) => element.textContent),
        techCustomer: Array.from(root.querySelectorAll('[data-department-customer="Technical Department"] li')).map((element) => element.textContent),
        salesDocumentSectionsSideBySide: (() => {
          const legal = root.querySelector<HTMLElement>('[data-department-documents="Sales Department"]');
          const customer = root.querySelector<HTMLElement>('[data-department-customer="Sales Department"]');
          if (!legal || !customer) return false;
          const left = legal.getBoundingClientRect();
          const right = customer.getBoundingClientRect();
          return Math.abs(left.top - right.top) < 2 && right.left >= left.right;
        })(),
        supportingInsideCards: Boolean(root.querySelector(".department-card [data-department-supporting]")),
        departmentBulletsVertical: Array.from(root.querySelectorAll<HTMLElement>(".gantt-department-card .department-document-item li")).every((item) =>
          getComputedStyle(item).display === "list-item" && getComputedStyle(item).listStyleType === "disc"),
        salesDuration: root.querySelector('[data-department-duration="Sales Department"]')?.textContent,
        techDuration: root.querySelector('[data-department-duration="Technical Department"]')?.textContent,
        legalInsideCards: Array.from(root.querySelectorAll<HTMLElement>(".department-document-item")).every((item) => {
          const card = item.closest<HTMLElement>(".department-card");
          if (!card) return false;
          const outer = card.getBoundingClientRect();
          const inner = item.getBoundingClientRect();
          return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom - 12;
        }),
        separateLegalRow: Boolean(root.querySelector(".department-document-grid")),
        timelineHasVerticalGrid: Array.from(root.querySelectorAll<HTMLElement>(".gantt-axis, .gantt-track")).some((element) => getComputedStyle(element).backgroundImage !== "none"),
        dayOneDivider: Boolean(root.querySelector(".gantt-day-one-line")),
        supporting: root.querySelector(".supporting-documents-footer")?.textContent,
        salesLead: root.querySelector(".gantt-sales-lead")?.textContent,
        handover: root.querySelector(".gantt-note")?.textContent,
      };
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF", exact: true }).click();
  await (await pending).saveAs(testInfo.outputPath("document-coverage.pdf"));
  const result = await page.evaluate(() => (window as unknown as { documentPdf: {
    phaseText: string; duration: string; salesLegal: string[]; techLegal: string[]; salesCustomer: string[]; techCustomer: string[]; salesDocumentSectionsSideBySide: boolean; supportingInsideCards: boolean; departmentBulletsVertical: boolean; salesDuration: string; techDuration: string; legalInsideCards: boolean; separateLegalRow: boolean; timelineHasVerticalGrid: boolean; dayOneDivider: boolean; supporting: string; salesLead: string; handover: string;
  } }).documentPdf);
  expect(result.phaseText).toContain("2 Departments Involved");
  expect(result.phaseText).not.toMatch(/Sales Department|Technical Department/i);
  expect(result.duration).toContain("0.7WEEKS");
  expect(result.duration).not.toContain("From Day 1");
  expect(result.salesLegal).toEqual(["Customer authorization"]);
  expect(result.techLegal).toEqual(["Signed agreement"]);
  expect(result.salesCustomer).toEqual(["Customer profile"]);
  expect(result.techCustomer).toEqual(["Client requirements"]);
  expect(result.salesDocumentSectionsSideBySide).toBe(true);
  expect(result.supportingInsideCards).toBe(false);
  expect(result.departmentBulletsVertical).toBe(true);
  expect(result.salesDuration).toBeUndefined();
  expect(result.techDuration).toContain("0.7WEEKS");
  expect(result.legalInsideCards).toBe(true);
  expect(result.separateLegalRow).toBe(false);
  expect(result.timelineHasVerticalGrid).toBe(false);
  expect(result.dayOneDivider).toBe(true);
  expect(result.supporting).toContain("Technical Department");
  expect(result.supporting).toContain("Site survey");
  expect(result.salesLead).toBe("Sales lead · customer qualification");
  expect(result.handover).toContain("Week 1 begins at the formal Sales-to-Technical handover");
});

test("dense Gantt PDF stays on one 11 x 17 sheet", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Dense readable schedule");
  const node = createDomainNode("general", "dense-technical");
  node.title = "CHAPTER 01";
  node.config.stage = "Technical";
  node.conditions = Array.from({ length: 45 }, (_, index) => ({
    id: `dense-${index}`,
    label: `Technical release condition ${index + 1}`,
    duration: 1,
    durationUnit: "weeks" as const,
  }));
  file.graph.nodes = [node];
  file.highLevel!.graph.nodes = [{
    id: "dense-phase", type: "phase", title: "PHASE 1", description: "Construction",
    backgroundColor: "#0284c7", linkedLayer2NodeIds: [node.id],
  }];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF", exact: true }).click();
  const path = testInfo.outputPath("dense-gantt.pdf");
  await (await pending).saveAs(path);
  const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
  expect(info).toMatch(/Pages:\s+1\b/);
  expect(info).toMatch(/Page size:\s+1224(?:\.\d+)? x 792(?:\.\d+)? pts/);
});
