import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, seedE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("Auto arrange lines up Phase frames, and the cards in each Phase, along the top", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page.getByRole("button", { name: "Auto arrange" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frames = Array.from(
          document.querySelectorAll<HTMLElement>(".react-flow__node-phase"),
        );
        const frameTops = frames.map((frame) => Math.round(frame.getBoundingClientRect().top));
        // The top card of every column inside a Phase starts on one line.
        const columnTops = frames.map((frame) => {
          const box = frame.getBoundingClientRect();
          const cards = Array.from(
            document.querySelectorAll<HTMLElement>(".react-flow__node-workflow"),
          ).filter((card) => {
            const rect = card.getBoundingClientRect();
            return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top;
          });
          const byColumn = new Map<number, number>();
          for (const card of cards) {
            const rect = card.getBoundingClientRect();
            const column = Math.round(rect.left);
            byColumn.set(column, Math.min(byColumn.get(column) ?? Infinity, rect.top));
          }
          return [...byColumn.values()].map((top) => Math.round(top));
        });
        return {
          frames: frames.length,
          frameTopsAligned: new Set(frameTops).size === 1,
          columnsAligned: columnTops.every(
            (tops) => tops.length < 2 || Math.max(...tops) - Math.min(...tops) <= 1,
          ),
        };
      }),
    )
    .toEqual({ frames: 4, frameTopsAligned: true, columnsAligned: true });
});

test("Qualification, CSA / PCS / LOI and Estimation start on the same top line as the Phase cards", async ({
  page,
}) => {
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
  const start = file.graph.nodes.find((node) => node.type === "projectStart")!;
  file.graph.edges.unshift({
    id: "qualification-start",
    source: qualification.id,
    target: start.id,
    sourceHandle: "out",
    targetHandle: "in",
    type: "normal",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: {},
  });
  await page.addInitScript(
    ({ key, file }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page.getByRole("button", { name: "Auto arrange" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const top = (id: string) => {
          const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
          return node ? Math.round(node.getBoundingClientRect().top) : `missing ${id}`;
        };
        const tops = [
          top("qualification-1"),
          top("commercial-route-group"),
          top("estimation-1-06"),
        ];
        return new Set(tops).size === 1 ? "aligned" : tops.join(" / ");
      }),
    )
    .toBe("aligned");
  // One way in to CSA / PCS / LOI.
  await expect(
    page.locator('.react-flow__node[data-id="commercial-route-group"] .react-flow__handle.target'),
  ).toHaveCount(1);
  await expect(page.locator("[data-qualification-node] .react-flow__handle.source")).toHaveCount(1);
});
