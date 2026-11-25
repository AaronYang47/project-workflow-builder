import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("the heading under Route Selection is the node's title: editable on the node, kept after reload", async ({
  page,
}) => {
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-1");
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
      if (localStorage.getItem(key)) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const title = page.locator("[data-route-selection-title]");
  await expect(title).toHaveValue("CSA / PCS / LOI");

  await title.fill("Commercial agreement");
  await title.press("Enter");
  const saved = () =>
    page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key)!).state.file;
      return state.graph.nodes.find((node: { id: string }) => node.id === "commercial-route-group")
        ?.title;
    }, WORKFLOW_STORAGE_KEY);
  await expect.poll(saved).toBe("Commercial agreement");

  // Kept after loading the project again.
  await page.reload();
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator("[data-route-selection-title]")).toHaveValue("Commercial agreement");
});
