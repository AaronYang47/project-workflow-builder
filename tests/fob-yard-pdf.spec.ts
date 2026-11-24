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

test("L2 PDF routes the FOB yard line around the skipped cards, never through them", async ({
  page,
}, testInfo) => {
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
      (window as unknown as { printed: unknown[] }).printed = [];
      window.print = () => {
        const root = document.getElementById("vector-canvas-print")!;
        // The print copy is hidden on screen; show it to measure.
        root.style.setProperty("display", "block", "important");
        root.style.setProperty("visibility", "visible", "important");
        const bypass = root.querySelector<SVGGElement>('.react-flow__edge[data-id^="fob-yard-"]');
        const pathBox = bypass?.querySelector("path")?.getBoundingClientRect();
        const skippedBottom = Math.max(
          ...Array.from(
            root.querySelectorAll<HTMLElement>(".react-flow__node.fob-yard-skipped"),
          ).map((card) => card.getBoundingClientRect().bottom),
        );
        // Sample the drawn line and check it never runs through a skipped card.
        const path = bypass?.querySelector<SVGPathElement>("path");
        const skippedBoxes = Array.from(
          root.querySelectorAll<HTMLElement>(".react-flow__node.fob-yard-skipped"),
        ).map((card) => card.getBoundingClientRect());
        const tag = root
          .querySelector<HTMLElement>("[data-print-fob-label]")
          ?.getBoundingClientRect();
        let tagOnLine = !tag;
        let crossesSkipped = !path;
        if (path) {
          const matrix = path.getScreenCTM()!;
          const length = path.getTotalLength();
          for (let at = 0; at <= length; at += 4) {
            const point = new DOMPoint(
              path.getPointAtLength(at).x,
              path.getPointAtLength(at).y,
            ).matrixTransform(matrix);
            if (
              tag &&
              point.x > tag.left &&
              point.x < tag.right &&
              point.y > tag.top &&
              point.y < tag.bottom
            )
              tagOnLine = true;
            if (
              skippedBoxes.some(
                (box) =>
                  point.x > box.left + 2 &&
                  point.x < box.right - 2 &&
                  point.y > box.top + 2 &&
                  point.y < box.bottom - 2,
              )
            )
              crossesSkipped = true;
          }
        }
        (window as unknown as { printed: unknown[] }).printed.push({
          hasBypass: Boolean(bypass),
          clearOfSkipped: !crossesSkipped,
          // The FOB yard tag sits beside its line, never on it.
          tagClearOfLine: !tagOnLine,
          debug: {
            d: bypass?.querySelector("path")?.getAttribute("d"),
            pathBottom: pathBox?.bottom,
            skipped: Array.from(
              root.querySelectorAll<HTMLElement>(".react-flow__node.fob-yard-skipped"),
            ).map((card) => [card.dataset.id, Math.round(card.getBoundingClientRect().bottom)]),
          },
        });
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file: workflow(true) },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator(".react-flow__node.fob-yard-skipped").first()).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  await page.waitForFunction(() => (window as unknown as { printed: unknown[] }).printed.length);
  const [printed] = await page.evaluate(
    () =>
      (
        window as unknown as {
          printed: {
            hasBypass: boolean;
            clearOfSkipped: boolean;
            tagClearOfLine: boolean;
            debug: unknown;
          }[];
        }
      ).printed,
  );
  expect(printed).toMatchObject({ hasBypass: true, clearOfSkipped: true, tagClearOfLine: true });
  await page.pdf({
    path: testInfo.outputPath("L2.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
});
