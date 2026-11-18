import { expect, test } from "playwright/test";
import { processGanttPdfHtml } from "../src/lib/process-gantt-pdf";
import { productionCalendarPageHtml } from "../src/lib/production-calendar-pdf";
import { productionReleaseConditions, syncFactoryProductionRow } from "../src/lib/simulation";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** A dated project with L5's Factory Production row under the first Phase-02 condition. */
function withFactoryProduction() {
  const file = createE2EWorkflow();
  file.calendar = { startDate: "2027-01-04", shutdowns: [] };
  file.graph.nodes = file.graph.nodes.map((node) => ({
    ...node,
    conditions: node.conditions.map((condition) => ({
      ...condition,
      duration: 5,
      durationUnit: "days" as const,
    })),
  }));
  const department = productionReleaseConditions(file, "high-level-3").departments[0];
  return syncFactoryProductionRow(
    file,
    { nodeId: department.nodeId, conditionId: department.conditions[0].conditionId },
    40,
    "Plan A",
  );
}

test("the L4 Gantt PDF prints the Factory Production label in red", () => {
  const html = processGanttPdfHtml(withFactoryProduction(), new Map());
  expect(html).toMatch(
    /<span class="gantt-title" data-pdf-factory-production style="color:#dc2626">Factory Production<\/span>/,
  );
  // Other rows keep their normal label.
  expect(html.match(/data-pdf-factory-production/g)).toHaveLength(1);
});

test("the PDF calendar shows Factory Production as its own red entry", () => {
  const pages = productionCalendarPageHtml(withFactoryProduction()).join("");
  expect(pages).toContain("data-pc-factory-production");
  expect(pages).toMatch(/<strong style="color:#dc2626">Factory Production<\/strong>/);
  // Days it runs carry its red marker.
  expect(pages).toContain('<i style="background:#dc2626"></i>');
  // Without L5 data there is no such entry.
  const plain = createE2EWorkflow();
  plain.calendar = { startDate: "2027-01-04", shutdowns: [] };
  expect(productionCalendarPageHtml(plain).join("")).not.toContain("data-pc-factory-production");
});

test("High Level + Gantt PDF: Factory Production replaces the general red note in its boxes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const root = document.querySelector(".pdf-gantt")?.parentElement;
        if (root)
          (window as unknown as { notes: unknown }).notes = {
            phase: Array.from(root.querySelectorAll("[data-phase-factory-production]")).map(
              (element) => [element.textContent, getComputedStyle(element).color],
            ),
            department: Array.from(
              root.querySelectorAll("[data-department-factory-production]"),
            ).map((element) => element.textContent),
            // The note sits under the duration, not on top of it.
            overlap: Array.from(root.querySelectorAll("[data-phase-factory-production]")).some(
              (note) => {
                const duration = note.parentElement!.querySelector(".phase-duration")!;
                return (
                  duration.getBoundingClientRect().bottom > note.getBoundingClientRect().top + 0.5
                );
              },
            ),
            general: root.querySelectorAll(
              "[data-phase-actual-production-time],[data-department-actual-production-time]",
            ).length,
          };
        return original.apply(this, args);
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file: withFactoryProduction() },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/process-overview");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByText("High Level Process System Flowchart with Gantt Chart", { exact: true })
    .click();
  await pending;
  const notes = (await page.evaluate(() => (window as unknown as { notes: unknown }).notes)) as {
    phase: [string, string][];
    department: string[];
    general: number;
  };
  expect(notes.phase).toEqual([["Factory Production · 40 days", "rgb(220, 38, 38)"]]);
  expect(notes.department).toEqual(["Factory Production · 40 days"]);
  expect(notes.general).toBe(0);
  expect(notes.overlap).toBe(false);
});

test("the Gantt chart ends with a green Project completion line, on screen and in the PDF", async ({
  page,
}) => {
  const file = withFactoryProduction();
  // PDF: one line at the last finish, labelled with its date.
  const html = processGanttPdfHtml(file, new Map());
  const pdfDate = html.match(/data-project-completion="(\d{4}-\d{2}-\d{2})"/)?.[1];
  expect(pdfDate).toBeTruthy();
  expect(html).toContain(`Project completion · ${pdfDate}`);

  // Screen: the same date, drawn at the right end of the last bar.
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
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/process-overview");
  const line = page.locator("[data-project-completion]");
  await expect(line).toHaveAttribute("data-project-completion", pdfDate!);
  await expect(line).toContainText(`Project completion · ${pdfDate}`);
  await expect(line).toHaveClass(/bg-emerald-500/);
  const lineX = (await line.boundingBox())!.x;
  const lastBarRight = await page
    .locator("[data-gantt-task-key]")
    .evaluateAll((bars) => Math.max(...bars.map((bar) => bar.getBoundingClientRect().right)));
  expect(Math.abs(lineX + 1 - lastBarRight)).toBeLessThan(3);
});
