import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** A path bends with a sharp corner when it turns between two straight segments. */
const SHARP_BEND = /L\s*[-\d.]+[ ,][-\d.]+\s*L\s*[-\d.]+[ ,][-\d.]+\s*L/;

test("CSA / PCS / LOI draws the hand-drawn route inside the node, with arcs, on the canvas and in the L2 PDF", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-1");
  file.graph.nodes.unshift(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -1400,
    y: 400,
    width: 1000,
    height: 430,
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
          lines: Array.from(root.querySelectorAll("[data-commercial-route-line]")).map(
            (path) => path.getAttribute("d") ?? "",
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
  const group = page.locator('.react-flow__node[data-id="commercial-route-group"]');
  await expect(group.locator("[data-commercial-route-line]").first()).toBeAttached();
  // In, CSA → PCS, straight to PCS over the top, LOI, and PCS / LOI joining on the way out.
  expect(
    await group
      .locator("[data-commercial-route-line]")
      .evaluateAll((paths) => paths.map((path) => path.getAttribute("data-commercial-route-line"))),
  ).toEqual(
    expect.arrayContaining([
      "entry",
      "toCsa",
      "bypass",
      "toLoi",
      "csaToPcs",
      "pcsOut",
      "loiOut",
      "exit",
    ]),
  );
  const canvasLines = await group
    .locator("[data-commercial-route-line]")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(canvasLines.some((d) => d.includes("Q"))).toBe(true);
  expect(canvasLines.filter((d) => SHARP_BEND.test(d))).toEqual([]);
  // CSA and PCS side by side, LOI under CSA.
  const cards = Object.fromEntries(
    await group.locator("[data-commercial-route-card]").evaluateAll((elements) =>
      elements.map((element) => {
        const card = element as HTMLElement;
        return [
          card.dataset.commercialRouteCard!,
          { x: card.offsetLeft, y: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight },
        ];
      }),
    ),
  );
  expect(cards.PCS.x).toBeGreaterThan(cards.CSA.x + cards.CSA.w);
  expect(cards.PCS.y).toBe(cards.CSA.y);
  expect(cards.LOI.x).toBe(cards.CSA.x);
  expect(cards.LOI.y).toBeGreaterThan(cards.CSA.y + cards.CSA.h);
  // One line on to Estimation.
  await expect(
    page.locator('.react-flow__edge[data-id^="edge-commercial-route-group-"]'),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  await page.waitForFunction(() => (window as unknown as { printed: unknown[] }).printed.length);
  const [printed] = await page.evaluate(
    () => (window as unknown as { printed: { lines: string[]; exits: number }[] }).printed,
  );
  expect(printed.lines).toHaveLength(8);
  expect(printed.lines.filter((d) => SHARP_BEND.test(d))).toEqual([]);
  expect(printed.exits).toBe(1);
});
