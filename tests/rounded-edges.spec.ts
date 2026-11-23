import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** The trunk after the branches join: the path's last two bends and its end. */
const trunkOf = (d: string) => d.split("Q").slice(-2).join("Q");

/** A path bends with a sharp corner when it turns between two straight segments. */
const SHARP_BEND = /L\s*[-\d.]+[ ,][-\d.]+\s*L\s*[-\d.]+[ ,][-\d.]+\s*L/;

test("CSA / PCS / LOI branches bend with arcs on the canvas and in the L2 PDF", async ({
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
      (window as unknown as { printed: string[][] }).printed = [];
      window.print = () => {
        const root = document.getElementById("vector-canvas-print")!;
        (window as unknown as { printed: string[][] }).printed.push(
          Array.from(
            root.querySelectorAll(
              '.react-flow__edge[data-id*="commercial-route-group-"][data-id*="estimation"] path',
            ),
          ).map((path) => path.getAttribute("d") ?? ""),
        );
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const branches = page.locator(
    '.react-flow__edge[data-id*="commercial-route-group-"][data-id*="estimation"] path',
  );
  await expect(branches.first()).toBeAttached();
  const canvasPaths = await branches.evaluateAll((paths) =>
    paths.map((path) => path.getAttribute("d") ?? ""),
  );
  expect(canvasPaths.some((d) => d.includes("Q"))).toBe(true);
  expect(canvasPaths.filter((d) => SHARP_BEND.test(d))).toEqual([]);
  // The three branches join on one bus and share a single trunk into Estimation.
  expect(new Set(canvasPaths.map(trunkOf)).size).toBe(1);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  await page.waitForFunction(() => (window as unknown as { printed: unknown[] }).printed.length);
  const [printed] = await page.evaluate(
    () => (window as unknown as { printed: string[][] }).printed,
  );
  expect(printed.length).toBeGreaterThan(0);
  expect(printed.filter((d) => SHARP_BEND.test(d))).toEqual([]);
  expect(new Set(printed.map(trunkOf)).size).toBe(1);
});
