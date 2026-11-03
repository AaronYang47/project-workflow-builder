import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

for (const layer of ["L1", "L2"]) {
  test(`${layer} Gantt export downloads exactly one valid PDF`, async ({ page }, testInfo) => {
    await seedE2EWorkflow(page);
    await page.goto("/");
    if (layer === "L2") await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pending = page.waitForEvent("download", { predicate: (download) => download.suggestedFilename().endsWith("with-gantt-chart.pdf") });
    await page.getByText("High Level Process System Flowchart with Gantt Chart", { exact: true }).click();
    const download = await pending;
    await download.saveAs(testInfo.outputPath("gantt.pdf"));
    expect(await download.failure()).toBeNull();
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.subarray(-32).toString()).toContain("%%EOF");
    expect(bytes.length).toBeGreaterThan(10000);
    // Allow a second global export listener to finish if it was also triggered.
    await page.waitForTimeout(1200);
    expect(downloads).toEqual([download.suggestedFilename()]);
  });
}
