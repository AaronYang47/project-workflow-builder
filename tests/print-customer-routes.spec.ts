import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("the L2 PDF shows the route chart in Route Selection only, without the routes panel or the agreement form", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-1");
  qualification.config.qualification = {
    clientCategory: "Owner",
    customerTier: "regular",
    plansAvailable: "yes",
  };
  file.graph.nodes.unshift(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -900,
    y: 220,
    width: 760,
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
        const agreements = root.querySelector<HTMLElement>("[data-route-agreements]");
        (window as unknown as { printed: unknown[] }).printed.push({
          routesPanel: root.querySelectorAll("[data-print-routes]").length,
          routeChart: root.querySelectorAll(
            "[data-route-selection-node] [data-qualification-route-flow]",
          ).length,
          agreementsHidden: agreements
            ? getComputedStyle(agreements).visibility === "hidden"
            : null,
        });
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator("[data-qualification-route]")).toHaveText("Route: Owner → GC → PCS");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  await page.waitForFunction(() => (window as unknown as { printed: unknown[] }).printed.length);
  const [printed] = await page.evaluate(
    () => (window as unknown as { printed: unknown[] }).printed,
  );
  // The sheet shows the route chart inside Route Selection only: no separate
  // routes chart under the flowchart, and no agreement form being filled in.
  expect(printed).toEqual({ routesPanel: 0, routeChart: 1, agreementsHidden: true });
});
