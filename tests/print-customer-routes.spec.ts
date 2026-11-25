import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("the L2 PDF draws every customer route as a flowchart and marks the project's own", async ({
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
        root.style.setProperty("display", "block", "important");
        const routes = root.querySelector<HTMLElement>("[data-print-routes]");
        // The flowchart copy spans the whole sheet.
        const page = root.querySelector<HTMLElement>(".react-flow")!.getBoundingClientRect();
        const box = routes?.getBoundingClientRect();
        (window as unknown as { printed: unknown[] }).printed.push({
          rows: Array.from(root.querySelectorAll<HTMLElement>("[data-print-route]")).map(
            (row) => row.dataset.printRoute,
          ),
          current: Array.from(root.querySelectorAll<HTMLElement>("[data-print-route-current]")).map(
            (row) => row.textContent?.replace(/\s+/g, " ").trim(),
          ),
          onPage: Boolean(
            box && box.width > 0 && box.top >= page.top && box.bottom <= page.bottom + 1,
          ),
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
  expect(printed).toEqual({
    rows: [
      "profab",
      "gc-vip",
      "gc-no-plans",
      "gc-plans",
      "owner-vip",
      "owner-no-plans",
      "owner-plans",
    ],
    // The Owner's branch hands over to the one GC box, whose "has plans" branch carries on to PCS.
    current: ["Regular · has plansPCSThis project", "Regular · has plans"],
    onPage: true,
  });
});
