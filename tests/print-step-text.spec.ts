import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("the L2 PDF prints the Project Complete step text", async ({ page }) => {
  test.setTimeout(90_000);
  const file = createE2EWorkflow();
  const complete = createDomainNode("terminal", "project-complete");
  complete.conditions = [
    { id: "done", label: "FOB Yard Completion", required: true, checked: false },
  ];
  file.graph.nodes.push(complete);
  file.layout.nodes[complete.id] = {
    nodeId: complete.id,
    x: 9000,
    y: 220,
    width: 360,
    height: 420,
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
        const step = Array.from(
          root.querySelectorAll<HTMLElement>(
            '.react-flow__node[data-id="project-complete"] button',
          ),
        ).find((button) => button.textContent?.includes("FOB Yard Completion"));
        (window as unknown as { printed: unknown[] }).printed.push({
          found: Boolean(step),
          visible: step ? getComputedStyle(step).visibility !== "hidden" : false,
        });
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.getByText("FOB Yard Completion").first()).toBeAttached();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  await page.waitForFunction(() => (window as unknown as { printed: unknown[] }).printed.length);
  const [printed] = await page.evaluate(
    () => (window as unknown as { printed: unknown[] }).printed,
  );
  expect(printed).toEqual({ found: true, visible: true });
});
