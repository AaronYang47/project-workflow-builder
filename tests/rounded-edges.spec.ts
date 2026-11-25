import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** A path bends with a sharp corner when it turns between two straight segments. */
const SHARP_BEND = /L\s*[-\d.]+[ ,][-\d.]+\s*L\s*[-\d.]+[ ,][-\d.]+\s*L/;

test("Route Selection joins every route onto one bus and one line out to Estimation, on the canvas and in the L2 PDF", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-1");
  qualification.config.qualification = {
    clientCategory: "GC",
    customerTier: "regular",
    plansAvailable: "no",
  };
  file.graph.nodes.unshift(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -1400,
    y: 400,
    width: 440,
    height: 460,
  };
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
        (window as unknown as { printed: unknown[] }).printed.push({
          flows: root.querySelectorAll("[data-route-selection-node] [data-qualification-route-bus]")
            .length,
          // Route Selection's lines print thin, green and dashed.
          routeLines: Array.from(
            root.querySelectorAll<SVGElement>(
              "[data-route-selection-node] svg line, [data-route-selection-node] svg path[fill='none']",
            ),
          )
            .filter((line) => !line.closest("marker"))
            .every(
              (line) =>
                line.getAttribute("stroke") === "#22c55e" &&
                line.getAttribute("stroke-width") === "1" &&
                line.getAttribute("stroke-dasharray") === "4 3",
            ),
          exits: root.querySelectorAll(
            '.react-flow__edge[data-id^="edge-commercial-route-group-"] .react-flow__edge-path',
          ).length,
        });
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const node = page.locator("[data-route-selection-node]");
  await expect(node.locator("[data-qualification-route-bus]")).toBeAttached();
  // CSA carries on into PCS: both agreements are shown under the chart.
  await expect(node.locator("[data-commercial-route-card]")).toHaveCount(2);
  // The way out sits level with the bus line leaving the chart.
  const levels = await node.evaluate((element) => {
    const out = element.querySelector<SVGLineElement>("[data-qualification-route-out]")!;
    const handle = element.querySelector<HTMLElement>(".react-flow__handle.source")!;
    const line = out.getBoundingClientRect();
    const dot = handle.getBoundingClientRect();
    return { line: line.top + line.height / 2, handle: dot.top + dot.height / 2 };
  });
  expect(Math.abs(levels.line - levels.handle)).toBeLessThan(3);
  // One line on to Estimation.
  await expect(
    page.locator('.react-flow__edge[data-id^="edge-commercial-route-group-"]'),
  ).toHaveCount(1);
  expect(
    (
      await page
        .locator(".react-flow__edge path")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""))
    ).filter((d) => SHARP_BEND.test(d)),
  ).toEqual([]);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  await page.waitForFunction(() => (window as unknown as { printed: unknown[] }).printed.length);
  const [printed] = await page.evaluate(
    () =>
      (window as unknown as { printed: { flows: number; exits: number; routeLines: boolean }[] })
        .printed,
  );
  expect(printed).toEqual({ flows: 1, exits: 1, routeLines: true });
});
