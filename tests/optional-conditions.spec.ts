import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("optional conditions need no documents, stay off Gantt, and appear directly in the PDF footer", async ({ page }, testInfo) => {
  const file = createProjectWorkflow("Optional condition PDF");
  const chapter = createDomainNode("general", "technical");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Technical";
  chapter.conditions = [{ id: "design", label: "Design review", duration: 3 }];
  const optionalOnlyChapter = createDomainNode("general", "purchasing");
  optionalOnlyChapter.title = "CHAPTER 01";
  optionalOnlyChapter.config.stage = "Purchasing";
  optionalOnlyChapter.conditions = [];
  optionalOnlyChapter.optionalConditions = [{ id: "supplier-check", label: "Supplier check", duration: 2 }];
  optionalOnlyChapter.customFields["supportingDocuments::release-condition::supplier-check"] = JSON.stringify([{ id: "legacy-file", title: "Previously attached file" }]);
  file.graph.nodes = [chapter, optionalOnlyChapter];
  file.highLevel!.graph.nodes = [{ id: "phase-1", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: [chapter.id, optionalOnlyChapter.id] }];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(({ key, file }) => {
    if (sessionStorage.getItem("optional-seeded")) return;
    sessionStorage.setItem("optional-seeded", "yes");
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });

  await page.goto("/release-conditions");
  const department = page.locator('[data-release-condition-chapter-id="technical"]');
  await department.getByRole("button", { name: "Add Optional Condition to Technical Department CHAPTER 01" }).click();
  const form = department.getByRole("form", { name: "New optional condition for Technical Department CHAPTER 01" });
  await form.getByRole("textbox", { name: "Optional condition name" }).fill("Site survey approval");
  await form.getByRole("spinbutton", { name: "Optional condition duration" }).fill("9");
  await form.getByRole("button", { name: "Save Optional Condition" }).click();
  const optional = department.getByRole("group", { name: "Optional condition: Site survey approval" });
  await expect(optional).toBeVisible();
  await expect(department.getByRole("region", { name: "Release conditions" }).getByText("Site survey approval")).toHaveCount(0);
  await expect(optional.getByText(/supporting document/i)).toHaveCount(0);
  await expect(optional.getByRole("button", { name: /add supporting/i })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-release-condition-chapter-id="technical"]').getByRole("group", { name: "Optional condition: Site survey approval" })).toBeVisible();

  await page.goto("/process-overview");
  await expect(page.locator('[data-gantt-task="Site survey approval"]')).toHaveCount(0);
  await expect(page.locator('[data-gantt-task="Supplier check"]')).toHaveCount(0);
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-end]')).toHaveAttribute("data-gantt-end", "3");
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector(".pdf-gantt")?.parentElement;
      if (root) (window as unknown as { optionalPdf: unknown }).optionalPdf = {
        ganttCondition: Boolean(root.querySelector('[data-pdf-gantt-task="Site survey approval"]')),
        footer: root.querySelector(".supporting-documents-footer")?.textContent,
        optionalRows: Array.from(root.querySelectorAll(".supporting-documents-footer [data-optional-condition]")).map((element) => element.textContent),
      };
      return original.apply(this, args);
    };
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Gantt PDF" }).click();
  await (await pending).saveAs(testInfo.outputPath("optional-conditions.pdf"));
  const pdf = await page.evaluate(() => (window as unknown as { optionalPdf: { ganttCondition: boolean; footer: string; optionalRows: string[] } }).optionalPdf);
  expect(pdf.ganttCondition).toBe(false);
  expect(pdf.footer).not.toContain("Optional Conditions");
  expect(pdf.optionalRows).toEqual(["Site survey approval · 1.3 weeks", "Supplier check · 0.29 weeks"]);
  expect(pdf.footer).toContain("Previously attached file");
});
