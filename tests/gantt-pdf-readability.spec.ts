import { execFileSync } from "node:child_process";
import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("full Gantt report keeps task labels readable on one 11 x 17 sheet", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const file = createProjectWorkflow("27001 PROF ABC 1 St 1 Su");
  const groups = [
    ["Sales", ["Client Qualification", "Job Number is entered", "NDA & EDAT", "Preliminary Quotation", "Site Discovery Report", "Feasibility Study", "Determine Commercial Path PCS/CSA/LOI", "Preliminary RM", "Photography & Media Release Form"], [1, 1, 1, 1, 1, 1, 1, 1, 1], 0],
    ["Technical", ["Delineation", "Scope of Work", "Cost Estimate Classification: D, C, B, A", "Warranty & Maintenance Agreement", "Sales Agreement"], [2, 2, 16, 1, 3], 0],
    ["Technical", ["Product Signoff Form", "Module Assembly Instruction", "IFF", "IFM"], [3, 1, 2, 6], 1],
    ["Purchasing", ["Purchasing"], [4], 1],
    ["Purchasing", ["Purchasing"], [4], 2],
    ["Production", ["Module Production Schedule", "Module Quality Control", "Module Sign-Off", "As-Built Documentation Package", "Transport Readiness Report"], [1, 1, 3, 2, 2], 2],
    ["Site/After Service", ["Module Site Inspection Report", "Module Delivery And Receipt Form", "Module Installation Checklist", "Weatherproofing & Seal Verification Report", "Deficiency & Punch List Report", "Final Inspection Project Closeout Report", "As-Built Documentation Package", "Client Satisfaction & Handover Form"], [1, 2, 1, 2, 2, 3, 1, 1], 3],
  ] as const;
  file.graph.nodes = groups.map(([department, labels, durations], index) => {
    const node = createDomainNode("general", `report-chapter-${index}`);
    node.title = `CHAPTER ${String(index + 1).padStart(2, "0")}`;
    node.config.stage = department;
    node.config.ganttAutoSequence = department !== "Sales";
    node.conditions = labels.map((label, item) => ({ id: `report-${index}-${item}`, label, duration: durations[item], durationUnit: "weeks" as const }));
    const supporting = index === 1 ? ["Project Summary", "Change Order", "Change Directive", "CD and CO Tracker", "Delegated Design Service Statement"]
      : index === 5 ? ["CD and CO Tracker", "Change Order", "Change Directive", "Incident Report Form", "Incident Response Log", "Module Installation Support Service", "Notice Of Concern", "Response To Notice Of Concern"]
      : index === 6 ? ["CD and CO Tracker", "Change Order", "Change Directive", "Utility Connection Verification", "Module Damage Assessment Report", "Incident Report Form", "Incident Response Log", "Site Safety Plan"] : [];
    node.optionalConditions = supporting.map((label, item) => ({ id: `report-optional-${index}-${item}`, label, duration: 1, durationUnit: "weeks" as const }));
    return node;
  });
  file.highLevel!.graph.nodes = ["QUALIFICATION", "PRE-CONSTRUCTION", "CONSTRUCTION", "POST-CONSTRUCTION"].map((description, index) => ({
    id: `report-phase-${index}`, type: "phase", title: `PHASE ${index + 1}`, description,
    backgroundColor: ["#1462b3", "#10b981", "#ed9d00", "#e52b2b"][index],
    linkedLayer2NodeIds: groups.flatMap((group, item) => group[3] === index ? [file.graph.nodes[item].id] : []),
  }));
  file.highLevel!.graph.edges = [0, 1, 2].map((index) => ({ id: `report-edge-${index}`, source: `report-phase-${index}`, target: `report-phase-${index + 1}` }));
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const chart = document.querySelector<HTMLElement>(".pdf-gantt");
      const root = chart?.parentElement;
      const label = chart?.querySelector<HTMLElement>(".gantt-task-label");
      if (root && label) (window as unknown as { reportTypography: unknown }).reportTypography = {
        width: root.offsetWidth, height: root.offsetHeight,
        labelCssPx: Number.parseFloat(getComputedStyle(label).fontSize),
        phaseHeight: root.querySelector<HTMLElement>(".phase-row")?.offsetHeight,
        departmentHeight: root.querySelector<HTMLElement>(".department-grid")?.offsetHeight,
        chartHeight: chart.offsetHeight,
        footerHeight: root.querySelector<HTMLElement>(".supporting-documents-footer")?.offsetHeight,
        cardOverflow: Array.from(root.querySelectorAll<HTMLElement>(".department-card")).some((card) => card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1),
        barsStayInRows: Array.from(root.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-bar")).every((bar) => {
          const row = bar.closest<HTMLElement>(".gantt-row");
          if (!row) return false;
          const bounds = bar.getBoundingClientRect();
          const rowBounds = row.getBoundingClientRect();
          return bounds.top >= rowBounds.top - 1 && bounds.bottom <= rowBounds.bottom + 1;
        }),
        taskRowHeights: Array.from(root.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-row[data-pdf-gantt-task]")).map((row) => Math.round(row.getBoundingClientRect().height)),
        clippedTaskTitles: Array.from(root.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-title")).filter((title) => title.scrollWidth > title.clientWidth + 1).map((title) => title.textContent),
        labelsClearBars: Array.from(root.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-row[data-pdf-gantt-task]")).every((row) => {
          const label = row.querySelector<HTMLElement>(".gantt-task-label");
          const bar = row.querySelector<HTMLElement>(".gantt-bar");
          return !label || !bar || label.getBoundingClientRect().right <= bar.getBoundingClientRect().left + 1;
        }),
        documentSectionsOverlap: Array.from(root.querySelectorAll<HTMLElement>(".gantt-department-card .dual-document-groups")).some((groups) => {
          const customer = groups.querySelector<HTMLElement>("[data-department-customer]");
          return Boolean(customer && Array.from(groups.querySelectorAll<HTMLElement>("[data-department-documents] li")).some((item) =>
            item.getBoundingClientRect().right > customer.getBoundingClientRect().left - 2));
        }),
        documentColumns: Array.from(root.querySelectorAll<HTMLElement>(".gantt-department-card")).map((card) => ({
          department: card.querySelector(".department-label")?.textContent || "",
          columns: Number(getComputedStyle(card.querySelector<HTMLElement>("[data-department-documents] ul") || card).columnCount) || 1,
        })),
      };
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF" }).click();
  const path = testInfo.outputPath("full-gantt-report.pdf");
  await (await pending).saveAs(path);
  const typography = await page.evaluate(() => (window as unknown as { reportTypography: { width: number; height: number; labelCssPx: number; cardOverflow: boolean; barsStayInRows: boolean; taskRowHeights: number[]; clippedTaskTitles: string[]; labelsClearBars: boolean; documentSectionsOverlap: boolean; phaseHeight: number; departmentHeight: number; chartHeight: number; footerHeight: number; documentColumns: { department: string; columns: number }[] } }).reportTypography);
  const effectiveLabelPoints = typography.labelCssPx * 1224 / typography.width;
  expect(typography.cardOverflow).toBe(false);
  expect(typography.barsStayInRows).toBe(true);
  expect(new Set(typography.taskRowHeights).size).toBe(1);
  expect(typography.clippedTaskTitles).toEqual([]);
  expect(typography.labelsClearBars).toBe(true);
  expect(typography.documentSectionsOverlap).toBe(false);
  expect(typography.documentColumns.find((card) => card.department.startsWith("Sales"))?.columns).toBeGreaterThanOrEqual(2);
  expect(typography.documentColumns.find((card) => card.department.startsWith("Technical"))?.columns).toBeGreaterThanOrEqual(2);
  expect(typography.documentColumns.find((card) => card.department.startsWith("Site/After"))?.columns).toBe(1);
  expect(effectiveLabelPoints).toBeGreaterThanOrEqual(8);
  expect(execFileSync("pdfinfo", [path], { encoding: "utf8" })).toMatch(/Pages:\s+1\b/);

});
