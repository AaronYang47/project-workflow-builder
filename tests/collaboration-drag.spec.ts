import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

for (const route of ["process-overview", "release-conditions"]) {
  test(`viewer sees RC drag previews, cancel and final drop in ${route}`, async ({ context, page }) => {
    const file = createProjectWorkflow("Shared drag");
    file.graph.nodes = ["source", "target"].map((id) => {
      const node = createDomainNode("general", id);
      node.title = "CHAPTER 01";
      node.config.stage = id === "source" ? "Sales" : "Technical";
      node.conditions = [{ id: `${id}-rc`, label: id === "source" ? "Drag this condition" : "Already here", duration: 2 }];
      return node;
    });
    file.highLevel!.graph.nodes = [{ id: "phase", type: "phase", title: "PHASE 1", description: "Qualification", linkedLayer2NodeIds: ["source", "target"] }];
    file.highLevel!.graph.edges = [];
    await context.addInitScript(({ key, file }) => {
      if (!sessionStorage.getItem("drag-seeded")) {
        localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
        sessionStorage.setItem("drag-seeded", "yes");
      }
    }, { key: WORKFLOW_STORAGE_KEY, file });
    await page.setViewportSize({ width: 1500, height: 1000 });
    const room = `drag-${route}-${Date.now()}`;
    await page.goto(`/${route}?room=${room}`);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("workflow-collab-peer-id"))).toBeTruthy();
    const editor = await page.evaluate(() => sessionStorage.getItem("workflow-collab-peer-id"));
    const viewer = await context.newPage();
    await viewer.setViewportSize({ width: 1200, height: 900 });
    await viewer.goto(`/${route}?room=${room}&editor=${editor}`);
    await expect(viewer.getByRole("button", { name: "Take Control", exact: true })).toBeEnabled();
    await page.bringToFront();
    const source = page.locator('[data-release-condition-drop-node-id="source"]');
    const target = page.locator('[data-release-condition-drop-node-id="target"]');
    const handle = source.getByRole("button", { name: route === "process-overview" ? "Drag Drag this condition" : "Drag release condition 1", exact: true });
    const remoteGhost = viewer.locator("[data-remote-drag-preview]");
    const drag = async () => {
      await handle.hover();
      await page.mouse.down();
      const box = (await target.boundingBox())!;
      await page.mouse.move(box.x + 70, box.y + box.height / 2, { steps: 8 });
      await expect(remoteGhost).toBeVisible();
      await expect(remoteGhost).toContainText("Drag this condition");
      await expect(viewer.locator('[data-release-condition-drop-node-id="target"] [data-remote-drop-target], [data-release-condition-drop-node-id="target"][data-remote-drop-target]')).toHaveCount(1);
      // Preview must not move the real data before pointer-up.
      await expect(viewer.locator('[data-release-condition-drop-node-id="source"]')).toContainText("Drag this condition");
    };
    await drag();
    await viewer.screenshot({ path: `tmp/remote-drag-${route}.png` });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(remoteGhost).toHaveCount(0);
    await expect(viewer.locator("[data-remote-drop-target]")).toHaveCount(0);
    await expect(viewer.locator('[data-release-condition-drop-node-id="source"]')).toContainText("Drag this condition");
    await drag();
    await page.mouse.up();
    await expect(remoteGhost).toHaveCount(0);
    await expect(viewer.locator('[data-release-condition-drop-node-id="target"]')).toContainText("Drag this condition");
    await expect(viewer.locator('[data-release-condition-drop-node-id="source"]')).not.toContainText("Drag this condition");
  });
}
