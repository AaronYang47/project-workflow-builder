import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { formReferenceCatalog, formReferencesForCondition } from "../src/lib/form-reference-catalog";
import { departmentDocumentSummary } from "../src/lib/department-document-summary";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function chapter(department: string, labels: string[], supporting: string[] = []) {
  const node = createDomainNode("general", department.toLowerCase());
  node.title = "CHAPTER 01";
  node.config.stage = department;
  node.conditions = labels.map((label, index) => ({ id: `${department}-${index}`, label, required: true }));
  node.optionalConditions = supporting.map((label, index) => ({ id: `${department}-supporting-${index}`, label }));
  return node;
}

test("photographed forms are linked to their conditions, including multiple forms", () => {
  const sales = chapter("Sales", ["Client Qualification", "Job Number", "NDA & EDAT", "Determine Commercial Path PCS/CSA/LOI", "Preliminary RM"]);
  expect(formReferencesForCondition(sales, sales.conditions[0]).map((form) => form.code)).toEqual(["CQF"]);
  expect(formReferencesForCondition(sales, sales.conditions[1])).toEqual([]);
  expect(formReferencesForCondition(sales, sales.conditions[2]).map((form) => form.code)).toEqual(["NDA", "EDAT"]);
  expect(formReferencesForCondition(sales, sales.conditions[3]).map((form) => form.code)).toEqual(["PCS", "CSA", "LOI"]);
  expect(formReferencesForCondition(sales, sales.conditions[4]).map((form) => form.code)).toEqual(["PRM", "SMO"]);

  const production = chapter("Production", ["Module Quality Control", "Module Sign-Off"], ["Incident Report Form"]);
  expect(formReferencesForCondition(production, production.conditions[0]).map((form) => form.code)).toEqual(["MQC", "QAI"]);
  expect(formReferencesForCondition(production, production.optionalConditions![0]).map((form) => form.code)).toEqual(["IRF"]);

  const site = chapter("Site/After Service", ["Module Delivery And Receipt Form", "As-Built Documentation Package"], ["Site Safety Plan"]);
  expect(formReferencesForCondition(site, site.conditions[0]).map((form) => form.code)).toEqual(["MDR"]);
  expect(formReferencesForCondition(site, site.conditions[1]).map((form) => form.code)).toEqual(["ABDP"]);
  expect(formReferencesForCondition(site, site.optionalConditions![0]).map((form) => form.code)).toEqual(["SSP"]);
  expect(new Set(formReferenceCatalog.map((form) => `${form.category}:${form.code}`)).size).toBe(formReferenceCatalog.length);
});

test("department PDF document summary includes catalog forms without uploaded files", () => {
  const sales = chapter("Sales", ["Client Qualification", "NDA & EDAT"]);
  const summary = departmentDocumentSummary([sales]);
  expect(summary.customer).toContain("Client Qualification Form");
  expect(summary.legal).toEqual(["NDA", "EDAT"]);

  const technical = chapter("Technical", ["Scope Of Work"], ["Project Summary"]);
  const technicalSummary = departmentDocumentSummary([technical]);
  expect(technicalSummary.legal).toContain("Scope of Work");
  expect(technicalSummary.supporting).toContain("Project Summary");
});

test("Gantt PDF puts photographed form titles inside their department cards", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const file = createProjectWorkflow("Forms inside department cards");
  const departments = [
    chapter("Sales", ["Client Qualification", "NDA & EDAT", "Determine Commercial Path PCS/CSA/LOI"]),
    chapter("Technical", ["Scope of Work", "Sales Agreement"], ["Project Summary"]),
    chapter("Production", ["Module Quality Control", "Transport Readiness Report"], ["Incident Report Form"]),
    chapter("Site/After Service", ["Module Delivery And Receipt Form", "Client Satisfaction & Handover Form"], ["Site Safety Plan"]),
  ];
  departments.forEach((node, index) => {
    node.id = `forms-department-${index}`;
    node.conditions = node.conditions.map((condition, item) => ({ ...condition, duration: 7, durationUnit: "days", startWeek: index * 2 + item }));
  });
  file.graph.nodes = departments;
  file.highLevel!.graph.nodes = departments.map((node, index) => ({
    id: `forms-phase-${index}`, type: "phase", title: `PHASE ${index + 1}`,
    description: `Phase ${index + 1}`, linkedLayer2NodeIds: [node.id],
  }));
  file.highLevel!.graph.edges = departments.slice(1).map((_, index) => ({ id: `forms-edge-${index}`, source: `forms-phase-${index}`, target: `forms-phase-${index + 1}` }));
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector<HTMLElement>(".pdf-gantt")?.parentElement;
      if (root) (window as unknown as { formCardCheck: unknown }).formCardCheck = Array.from(root.querySelectorAll<HTMLElement>(".department-card")).map((card) => ({
        label: card.querySelector(".department-label")?.textContent,
        legal: card.querySelector("[data-department-documents]")?.textContent,
        customer: card.querySelector("[data-department-customer]")?.textContent,
        supporting: card.querySelector("[data-department-supporting]")?.textContent,
        overflow: card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
      }));
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF" }).click();
  await (await pending).saveAs(testInfo.outputPath("form-reference-cards.pdf"));
  const cards = await page.evaluate(() => (window as unknown as { formCardCheck: { label: string; legal: string; customer: string; supporting: string; overflow: boolean }[] }).formCardCheck);
  expect(cards.find((card) => /Sales/i.test(card.label))?.customer).toContain("Client Qualification Form");
  expect(cards.find((card) => /Sales/i.test(card.label))?.legal).toContain("LOI");
  expect(cards.find((card) => /Technical/i.test(card.label))?.supporting).toContain("Project Summary");
  expect(cards.find((card) => /Production/i.test(card.label))?.legal).toContain("Quality Assurance Inspection");
  expect(cards.find((card) => /Site/i.test(card.label))?.supporting).toContain("Site Safety Plan");
  expect(cards.every((card) => !card.overflow)).toBe(true);
});
