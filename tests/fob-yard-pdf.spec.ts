import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { applyFobYardSkip, fobYardTag } from "../src/lib/fob-yard";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function workflow(fobYard: boolean) {
  const file = createE2EWorkflow();
  const end = file.highLevel!.graph.nodes.find((node) => node.type === "end")!;
  end.fobYard = fobYard;
  return file;
}

test("the delivery tag names the skipped Phase, also after it is removed", () => {
  expect(fobYardTag(workflow(false))?.label).toBe("SITE WORK COMPLETION");
  const on = workflow(true);
  expect(fobYardTag(on)?.label).toBe("FOB YARD · PHASE-02 SKIPPED");
  expect(fobYardTag(applyFobYardSkip(on))?.label).toBe("FOB YARD · PHASE-02 SKIPPED");
});

for (const [kind, fobYard] of [
  ["Tech", true],
  ["Tech", false],
  ["Presentation", true],
] as const) {
  test(`${kind} PDF carries the ${fobYard ? "FOB yard" : "Site Work"} tag`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
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
      { key: WORKFLOW_STORAGE_KEY, file: workflow(fobYard) },
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByText(`Export PDF for ${kind}`, { exact: true }).click();
    const download = await pending;
    const path = testInfo.outputPath(`${kind}.pdf`);
    await download.saveAs(path);
    const pdf = (await readFile(path)).toString("latin1");
    if (fobYard) {
      expect(pdf).toContain("FOB YARD");
      expect(pdf).toContain("PHASE-02 SKIPPED");
      expect(pdf).not.toContain("SITE WORK COMPLETION");
    } else {
      expect(pdf).toContain("SITE WORK COMPLETION");
      expect(pdf).not.toContain("FOB YARD");
    }
  });
}

for (const [name, label] of [
  ["Swimlane", "High Level Process System Flowchart"],
  ["Gantt", "High Level Process System Flowchart with Gantt Chart"],
  ["Locator", "Conditions · Forms Matrix"],
] as const) {
  test(`${name} PDF exports with the FOB yard tag`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
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
      { key: WORKFLOW_STORAGE_KEY, file: workflow(true) },
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByText(label, { exact: true }).click();
    const download = await pending;
    await download.saveAs(testInfo.outputPath(`${name}.pdf`));
  });
}
