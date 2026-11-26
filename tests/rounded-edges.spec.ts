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
          // Route Selection's lines print thin and dashed: green, and the
          // Owner's hand-over to their GC in yellow.
          handoffYellow: root.querySelectorAll(
            '[data-route-selection-node] [data-qualification-route-handoff][stroke="#eab308"]',
          ).length,
          routeLines: Array.from(
            root.querySelectorAll<SVGElement>(
              "[data-route-selection-node] svg line, [data-route-selection-node] svg path[fill='none']",
            ),
          )
            .filter((line) => !line.closest("marker"))
            .every(
              (line) =>
                line.getAttribute("stroke") ===
                  (line.hasAttribute("data-qualification-route-handoff")
                    ? "#eab308"
                    : (line.getAttribute("data-print-route-color") ?? "#22c55e")) &&
                line.getAttribute("stroke-width") === "1" &&
                line.getAttribute("stroke-dasharray") === "4 3",
            ),
          // Every line takes its stage's colour: LOI purple all the way; otherwise
          // orange before CSA, blue from CSA, green from Plan Ready.
          uncoloured: Array.from(
            root.querySelectorAll<SVGElement>(
              "[data-qualification-route-flow] line, [data-qualification-route-flow] path[fill='none']",
            ),
          ).filter(
            (line) =>
              !line.closest("marker") &&
              !line.hasAttribute("data-qualification-route-handoff") &&
              !line.hasAttribute("data-print-route-color"),
          ).length,
          stages: Object.fromEntries(
            [
              ["owner-regular", "entry"],
              ["owner-regular", "yes"],
              ["owner-regular", "no"],
              ["owner-regular", "to-fork2"],
              ["owner-regular", "loop"],
              ["owner-regular", "back"],
              ["owner-regular", "end"],
              ["loi-gc", "no"],
              ["loi-gc", "to-fork2"],
              ["loi-gc", "end"],
            ].map(([lane, part]) => [
              `${lane} ${part}`,
              root
                .querySelector(
                  `[data-route-selection-node] [data-qualification-route-lane="${lane}"] [data-route-part="${part}"]`,
                )
                ?.getAttribute("stroke"),
            ]),
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
  // The way in joins the chart's entry line at the same height, from the card's edge.
  const entry = await node.evaluate((element) => {
    const line = element.querySelector<HTMLElement>("[data-route-selection-entry-line]")!;
    const handle = element.querySelector<HTMLElement>(".react-flow__handle.target")!;
    const inner = element.querySelector<SVGLineElement>("[data-route-entry-in]")!;
    const box = line.getBoundingClientRect();
    const dot = handle.getBoundingClientRect();
    const join = inner.getBoundingClientRect();
    return {
      line: box.top + box.height / 2,
      handle: dot.top + dot.height / 2,
      join: join.top + join.height / 2,
      gap: Math.abs(join.left - box.right),
    };
  });
  expect(Math.abs(entry.line - entry.handle)).toBeLessThan(3);
  expect(Math.abs(entry.line - entry.join)).toBeLessThan(3);
  expect(entry.gap).toBeLessThan(6);
  // Every exit bends onto the bus with an arc, never a right angle.
  const exitLines = await node
    .locator("[data-qualification-route-exit-line], [data-qualification-route-lane] path")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(exitLines.length).toBeGreaterThan(6);
  expect(exitLines.every((d) => d.includes("Q") || !d.includes("L", d.indexOf("L") + 1))).toBe(
    true,
  );
  expect(exitLines.filter((d) => SHARP_BEND.test(d))).toEqual([]);
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
      (
        window as unknown as {
          printed: {
            flows: number;
            exits: number;
            handoffYellow: number;
            routeLines: boolean;
            uncoloured: number;
            stages: Record<string, string>;
          }[];
        }
      ).printed,
  );
  // Owners now carry on in their own lane: no hand-over lines to the GC.
  const [orange, blue, green, purple] = ["#d97706", "#2563eb", "#16a34a", "#7c3aed"];
  expect(printed).toEqual({
    flows: 1,
    exits: 1,
    handoffYellow: 0,
    routeLines: true,
    uncoloured: 0,
    stages: {
      "owner-regular entry": orange,
      "owner-regular yes": orange,
      "owner-regular no": orange,
      "owner-regular to-fork2": blue,
      "owner-regular loop": blue,
      "owner-regular back": blue,
      "owner-regular end": green,
      "loi-gc no": purple,
      "loi-gc to-fork2": purple,
      "loi-gc end": purple,
    },
  });
});
