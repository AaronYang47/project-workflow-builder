import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("optional conditions need no documents, stay off Gantt, and appear directly in the PDF footer", async ({
  page,
}, testInfo) => {
  const file = createProjectWorkflow("Optional condition PDF");
  const chapter = createDomainNode("general", "technical");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Technical";
  chapter.conditions = [{ id: "design", label: "Design review", duration: 3 }];
  const optionalOnlyChapter = createDomainNode("general", "purchasing");
  optionalOnlyChapter.title = "CHAPTER 01";
  optionalOnlyChapter.config.stage = "Purchasing";
  optionalOnlyChapter.conditions = [];
  optionalOnlyChapter.optionalConditions = [
    { id: "supplier-check", label: "Supplier check", duration: 2 },
  ];
  optionalOnlyChapter.customFields["supportingDocuments::release-condition::supplier-check"] =
    JSON.stringify([{ id: "legacy-file", title: "Previously attached file" }]);
  file.graph.nodes = [chapter, optionalOnlyChapter];
  file.highLevel!.graph.nodes = [
    {
      id: "phase-1",
      type: "phase",
      title: "PHASE 1",
      description: "Qualification",
      linkedLayer2NodeIds: [chapter.id, optionalOnlyChapter.id],
    },
  ];
  file.highLevel!.graph.edges = [];
  await page.addInitScript(
    ({ key, file }) => {
      if (sessionStorage.getItem("optional-seeded")) return;
      sessionStorage.setItem("optional-seeded", "yes");
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
  const department = page.locator('[data-release-condition-chapter-id="technical"]');
  const releaseRow = department.getByRole("group", { name: "Step 1: Design review" });
  await releaseRow.locator("button[aria-pressed]").click();
  await expect(releaseRow.locator("button[aria-pressed]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await releaseRow.getByRole("button", { name: "View forms for Design review" }).click();
  await expect(page.getByRole("dialog", { name: "Design review" })).toBeVisible();
  await page.getByRole("button", { name: "Close forms window" }).click();
  const optionalCount = department.locator("[data-optional-count]");
  await expect(optionalCount).toHaveAttribute("data-optional-count", "0");
  await expect(optionalCount).not.toHaveClass(/optional-count-breathe/);
  await department
    .getByRole("button", { name: "Open Optional Conditions for Technical Department CHAPTER 01" })
    .click();
  const popup = page.getByRole("dialog", { name: /Optional Conditions/ });
  await popup
    .getByRole("button", { name: "Add Optional Condition to Technical Department CHAPTER 01" })
    .click();
  const form = popup.getByRole("form", {
    name: "New optional condition for Technical Department CHAPTER 01",
  });
  await form.getByRole("textbox", { name: "Optional condition name" }).fill("Site survey approval");
  await form.getByRole("spinbutton", { name: "Optional condition duration" }).fill("9");
  await form.getByRole("button", { name: "Save Optional Condition" }).click();
  await expect(optionalCount).toHaveAttribute("data-optional-count", "1");
  await expect(optionalCount).toHaveClass(/optional-count-breathe/);
  const optional = popup.getByRole("group", { name: "Optional condition: Site survey approval" });
  await expect(optional).toBeVisible();
  await expect(
    optional.getByRole("button", { name: "View forms for Site survey approval" }),
  ).toHaveText("0 forms");
  await expect(
    optional.getByRole("button", { name: "Add form to Site survey approval" }),
  ).toHaveCount(0);
  await optional.getByRole("button", { name: "View forms for Site survey approval" }).click();
  const formsPopup = page.getByRole("dialog", { name: "Site survey approval" });
  await formsPopup.getByRole("button", { name: "Add Supporting Documents" }).click();
  const addFormDialog = page.getByRole("dialog", { name: "Add Supporting Document" });
  await addFormDialog
    .getByRole("textbox", { name: "Document title" })
    .fill("Site survey checklist");
  await addFormDialog.getByRole("button", { name: "Add to L3" }).click();
  await expect(
    optional.getByRole("button", { name: "View forms for Site survey approval" }),
  ).toHaveText("1 form");
  await expect(formsPopup).toContainText("Site survey checklist");
  await expect(formsPopup.getByRole("region", { name: "Required Documents" })).toBeVisible();
  await expect(formsPopup.getByRole("region", { name: "Customer Information" })).toBeVisible();
  await expect(formsPopup.getByRole("region", { name: "Supporting Documents" })).toBeVisible();
  await formsPopup.getByRole("button", { name: "Add Required Documents" }).click();
  const addLegalDialog = page.getByRole("dialog", { name: "Add Required Document" });
  await addLegalDialog
    .getByRole("textbox", { name: "Document title" })
    .fill("Review authorization");
  await addLegalDialog.getByRole("button", { name: "Add to L3" }).click();
  await expect(formsPopup).toContainText("Review authorization");
  await expect(
    optional.getByRole("button", { name: "View forms for Site survey approval" }),
  ).toHaveText("2 forms");
  await page.getByRole("button", { name: "Close forms window" }).click();
  await expect(
    department.getByRole("region", { name: "Steps" }).getByText("Site survey approval"),
  ).toHaveCount(0);
  await expect(optional.getByText(/supporting document/i)).toHaveCount(0);
  await expect(optional.getByRole("button", { name: /add supporting/i })).toHaveCount(0);
  await page.reload();
  await page
    .locator('[data-release-condition-chapter-id="technical"]')
    .getByRole("button", { name: "Open Optional Conditions for Technical Department CHAPTER 01" })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: /Optional Conditions/ })
      .getByRole("group", { name: "Optional condition: Site survey approval" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View forms for Site survey approval" }),
  ).toHaveText("2 forms");

  await page.goto("/process-overview");
  await expect(page.locator('[data-gantt-task="Site survey approval"]')).toHaveCount(0);
  await expect(page.locator('[data-gantt-task="Supplier check"]')).toHaveCount(0);
  await expect(page.locator('[data-gantt-task="Design review"] [data-gantt-end]')).toHaveAttribute(
    "data-gantt-end",
    "3",
  );
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = document.querySelector(".pdf-gantt")?.parentElement;
      if (root)
        (window as unknown as { optionalPdf: unknown }).optionalPdf = {
          ganttCondition: Boolean(
            root.querySelector('[data-pdf-gantt-task="Site survey approval"]'),
          ),
          footer: root.querySelector(".supporting-documents-footer")?.textContent,
          optionalRows: Array.from(
            root.querySelectorAll(".supporting-documents-footer [data-optional-condition]"),
          ).map((element) => element.textContent),
        };
      return original.apply(this, args);
    };
  });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /High Level Process System Flowchart with Gantt Chart/ })
    .click();
  await (await pending).saveAs(testInfo.outputPath("optional-conditions.pdf"));
  const pdf = await page.evaluate(
    () =>
      (
        window as unknown as {
          optionalPdf: { ganttCondition: boolean; footer: string; optionalRows: string[] };
        }
      ).optionalPdf,
  );
  expect(pdf.ganttCondition).toBe(false);
  expect(pdf.footer).not.toContain("Optional Conditions");
  expect(pdf.optionalRows).toEqual([
    "Site survey approval · 1.3 weeks",
    "Supplier check · 0.29 weeks",
  ]);
  expect(pdf.footer).toContain("Previously attached file");
});
