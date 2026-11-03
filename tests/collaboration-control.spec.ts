import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

test("a new computer can explicitly recover control from an offline editor", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto(`/?room=offline-editor-${Date.now()}&editor=old-computer`);
  const takeControl = page.getByRole("button", { name: "Take Control", exact: true });
  await expect(takeControl).toBeDisabled();
  await expect(takeControl).toBeEnabled({ timeout: 15000 });
  await takeControl.click();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();
  await expect(page.getByText("Read only", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();
});

test("viewer follows the editor's layers and cannot navigate until control is granted", async ({ context, page }) => {
  const room = `test-${Date.now()}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedE2EWorkflow(page);
  await page.goto(`/?room=${room}`);
  await expect(page.getByRole("button", { name: "Transfer editing control" })).toHaveAttribute("title", "No other collaborators are online");
  const editorId = await page.evaluate(() => sessionStorage.getItem("workflow-collab-peer-id"));
  expect(editorId).toBeTruthy();

  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 1000, height: 720 });
  await seedE2EWorkflow(viewer);
  await viewer.goto(`/?room=${room}&editor=${encodeURIComponent(editorId!)}`);
  await expect(viewer.getByText("Read only", { exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Take Control" })).toBeEnabled();
  const viewerId = await viewer.evaluate(() => sessionStorage.getItem("workflow-collab-peer-id"));
  expect(viewerId).not.toBe(editorId);

  await page.locator('[data-workflow-toolbar] a[aria-label="Open Release Conditions Workspace"]').click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/release-conditions");
  await page.getByRole("link", { name: "Back to workflow" }).click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/");
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();

  await expect(viewer.getByRole("button", { name: "L1 · High Level" })).toBeDisabled();
  await expect(viewer.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeDisabled();
  await expect(viewer.getByRole("button", { name: "RC · Forms & execution" })).toBeDisabled();
  await expect(viewer.getByRole("link", { name: "Open Release Conditions Workspace" })).toHaveCount(0);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(viewer.getByRole("button", { name: "L2 · Detailed Workflow" })).toHaveAttribute("aria-pressed", "true");
  const editorNode = page.locator('.react-flow__node[data-id="project-start"]');
  const viewerNode = viewer.locator('.react-flow__node[data-id="project-start"]');
  // Both canvases finish their initial fit before placing a physical pointer.
  await page.waitForTimeout(900);
  const editorBox = await editorNode.boundingBox();
  expect(editorBox).toBeTruthy();
  const editorZoom = await page.locator('.react-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  await editorNode.dispatchEvent("pointermove", { clientX: editorBox!.x + 10, clientY: editorBox!.y + 10 });
  const marker = viewer.locator(`[data-remote-cursor="${editorId}"]`);
  await expect(marker).toHaveCount(1);
  for (const axis of ["x", "y"] as const) {
    await expect.poll(async () => {
      const box = await viewerNode.boundingBox();
      const zoom = await viewer.locator('.react-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      return Math.abs((await marker.boundingBox())![axis] - (box![axis] + 10 * zoom / editorZoom));
    }).toBeLessThan(2);
  }
  await expect(viewer.getByRole("button", { name: "L1 · High Level" })).toBeDisabled();
  await page.getByRole("button", { name: "RC · Forms & execution" }).click();
  await expect(viewer.getByRole("button", { name: "RC · Forms & execution" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(viewer.getByRole("button", { name: "L1 · High Level" })).toHaveAttribute("aria-pressed", "true");

  await viewer.getByRole("button", { name: "Take Control" }).click();
  await expect(page.getByText("Editing control requested")).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(viewer.getByRole("button", { name: "Transfer editing control" })).toBeEnabled();
  await expect(viewer.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
});

test("viewer follows Conditions and Process & Gantt routes, including late joins and control transfer", async ({ context, page }) => {
  test.setTimeout(45000);
  const room = `follow-pages-${Date.now()}`;
  await seedE2EWorkflow(page);
  await page.goto(`/?room=${room}`);
  await expect(page.getByRole("button", { name: "Transfer editing control" })).toHaveAttribute("title", "No other collaborators are online");
  const editorId = await page.evaluate(() => sessionStorage.getItem("workflow-collab-peer-id"));
  const viewer = await context.newPage();
  await seedE2EWorkflow(viewer);
  await viewer.goto(`/?room=${room}&editor=${editorId}`);
  await expect(viewer.getByRole("button", { name: "Take Control", exact: true })).toBeEnabled();
  await page.locator('[data-workflow-toolbar] a[aria-label="Open Release Conditions Workspace"]').click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/release-conditions");
  await expect(viewer.getByText("Read only", { exact: true })).toBeVisible();
  expect(new URL(viewer.url()).searchParams.get("room")).toBe(room);
  expect(new URL(viewer.url()).searchParams.get("editor")).toBe(editorId);
  await page.getByRole("link", { name: "Back to workflow" }).click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/");
  await page.getByRole("link", { name: "Open Process Overview" }).click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/process-overview");
  await expect(viewer.getByRole("heading", { name: "L4 · Process & Gantt", exact: true })).toBeVisible();
  await viewer.getByRole("button", { name: "Open Create Release Condition" }).click();
  await expect(viewer.getByRole("textbox", { name: "New release condition", exact: true })).toBeDisabled();
  // A new viewer opening an old canvas link must reach the editor's current page.
  const late = await context.newPage();
  await seedE2EWorkflow(late);
  await late.goto(`/?room=${room}&editor=${editorId}`);
  await expect.poll(() => new URL(late.url()).pathname).toBe("/process-overview");
  await late.getByRole("button", { name: "Open Create Release Condition" }).click();
  await expect(late.getByRole("textbox", { name: "New release condition", exact: true })).toBeDisabled();
  await late.close();
  await viewer.getByRole("button", { name: "Take Control", exact: true }).click();
  await expect(page.getByText("Editing control requested")).toBeVisible();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(viewer.getByRole("textbox", { name: "New release condition", exact: true })).toBeEnabled();
  await viewer.getByRole("button", { name: "Close Create Release Condition" }).click();
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  // Follow direction reverses with editing control, even across page boundaries.
  await viewer.getByRole("link", { name: "Open Release Conditions Workspace", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/release-conditions");
  await viewer.getByRole("link", { name: "Back to workflow" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await viewer.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toHaveAttribute("aria-pressed", "true");
});

test("cursor carries the editor layer when the separate view message is missing", async ({ page }) => {
  const room = `cursor-fallback-${Date.now()}`;
  await seedE2EWorkflow(page);
  await page.goto(`/?room=${room}&editor=remote-editor`);
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await page.evaluate((roomId) => {
    const channel = new BroadcastChannel(`workflow-collab-${roomId}`);
    channel.postMessage({ type: "PRESENCE", senderId: "remote-editor", editorPeerId: "remote-editor", profile: { peerId: "remote-editor", name: "Editor", color: "#123456", joinedAt: 1, lastActiveAt: Date.now() } });
    channel.postMessage({ type: "CURSOR", senderId: "remote-editor", x: 200, y: 200, space: "canvas", view: { layer: "L2" }, timestamp: Date.now() });
    channel.close();
  }, room);
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-remote-cursor="remote-editor"]')).toHaveCount(1);
});

test("separate browser sessions can exchange a control request", async ({ browser, page }) => {
  test.setTimeout(45000);
  // Force the cross-device WebRTC path rather than same-device tab messaging.
  await page.addInitScript(() => Object.defineProperty(window, "BroadcastChannel", { value: undefined }));
  const room = `remote-${Date.now()}`;
  await seedE2EWorkflow(page);
  await page.goto(`/?room=${room}`);
  await expect(page.getByRole("button", { name: "Transfer editing control" })).toHaveAttribute("title", "No other collaborators are online");
  const editorId = await page.evaluate(() => sessionStorage.getItem("workflow-collab-peer-id"));

  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.addInitScript(() => Object.defineProperty(window, "BroadcastChannel", { value: undefined }));
  await seedE2EWorkflow(viewer);
  await viewer.goto(`/?room=${room}&editor=${encodeURIComponent(editorId!)}`);
  await expect(viewer.getByText("Read only", { exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Take Control" })).toBeEnabled({ timeout: 20000 });
  await page.locator('[data-workflow-toolbar] a[aria-label="Open Release Conditions Workspace"]').click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/release-conditions");
  await page.getByRole("link", { name: "Back to workflow" }).click();
  await expect.poll(() => new URL(viewer.url()).pathname).toBe("/");
  for (const layer of ["L2 · Detailed Workflow", "RC · Forms & execution", "L1 · High Level"]) {
    await page.getByRole("button", { name: layer }).click();
    await expect(viewer.getByRole("button", { name: layer })).toHaveAttribute("aria-pressed", "true", { timeout: 10000 });
    await expect(viewer.getByRole("button", { name: layer })).toBeDisabled();
  }
  await viewer.getByRole("button", { name: "Take Control" }).click();
  await expect(page.getByText("Editing control requested")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await viewerContext.close();
});

test("mobile refresh stays read-only while the editor is temporarily unreachable", async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedE2EWorkflow(page);
  await page.goto(`/?room=refresh-${Date.now()}&editor=unreachable-editor`);
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await page.waitForTimeout(11000);
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take Control" })).toBeVisible();
  await expect(page.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeDisabled();
});

test("three conflicting editor claims converge and a transfer survives refresh", async ({ context }) => {
  const room = `three-editors-${Date.now()}`;
  const pages = [];
  for (const id of ["editor-c", "editor-b", "editor-a"]) {
    const peer = await context.newPage();
    await seedE2EWorkflow(peer);
    await peer.addInitScript((peerId) => sessionStorage.setItem("workflow-collab-peer-id", peerId), id);
    await peer.goto(`/?room=${room}&editor=${id}`);
    pages.push(peer);
  }
  for (const viewer of pages.slice(0, 2)) {
    await expect(viewer.getByRole("button", { name: "Take Control", exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeDisabled();
  }
  await expect(pages[2].getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();
  await pages[0].getByRole("button", { name: "Take Control", exact: true }).click();
  await pages[2].getByRole("button", { name: "Allow", exact: true }).click();
  await expect(pages[0].getByRole("button", { name: "L2 · Detailed Workflow" })).toBeEnabled();
  await pages[1].reload();
  for (const viewer of pages.slice(1)) {
    await expect(viewer.getByRole("button", { name: "Take Control", exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "L2 · Detailed Workflow" })).toBeDisabled();
  }
});
