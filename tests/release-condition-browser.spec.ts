import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function fixture() {
  const file = createProjectWorkflow("27084_FDBR_85-87Chauveau", "27084");
  const start = createDomainNode("projectStart", "project-start");
  start.customFields.projectId = "L-27-084";
  const source = createDomainNode("general", "stage-one");
  source.title = "Stage One";
  source.conditions = [{ id: "move-me", label: "Move me", required: true }];
  const target = createDomainNode("general", "stage-two");
  target.title = "Stage Two";
  target.conditions = [{ id: "target-condition", label: "Already here", required: true }];
  file.graph.nodes = [start, source, target];
  file.layout.nodes = {
    "project-start": { nodeId: "project-start", x: 0, y: 220, width: 384, height: 420 },
    "stage-one": { nodeId: "stage-one", x: 450, y: 220, width: 384, height: 310 },
    "stage-two": { nodeId: "stage-two", x: 900, y: 220, width: 384, height: 310 },
  };
  file.highLevel!.graph.nodes = [
    { id: "l1-start", type: "start", title: "Start", description: "", linkedLayer2NodeIds: ["project-start"], linkedDetailedNodeIds: ["project-start"] },
    { id: "l1-phase", type: "phase", title: "Phase", description: "", linkedLayer2NodeIds: ["stage-one", "stage-two"], linkedDetailedNodeIds: ["stage-one", "stage-two"] },
  ];
  file.highLevel!.graph.edges = [{ id: "link", source: "l1-start", target: "l1-phase" }];
  file.highLevel!.layout.nodes = {
    "l1-start": { nodeId: "l1-start", x: 0, y: 220 },
    "l1-phase": { nodeId: "l1-phase", x: 340, y: 220 },
  };
  return file;
}

test("five-digit project display and release condition drag across stages", async ({ page }) => {
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file: fixture() });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="project-start"]')).toContainText("27084 FDBR");
  await expect(page.getByRole("textbox", { name: "Job Number (5 digits)" })).toHaveValue("27084");
  const source = page.locator('[data-id="stage-one"]');
  const target = page.locator('[data-id="stage-two"]');
  await expect(source.getByRole("textbox", { name: "Chapter" })).toHaveValue("Chapter");
  await page.waitForTimeout(250);
  const sourceGrip = source.getByRole("button", { name: "Drag to reorder release condition 1" });
  await expect.poll(async () => {
    await sourceGrip.hover();
    return sourceGrip.evaluate((element) => element.matches(":hover"));
  }).toBe(true);
  await page.mouse.down();
  const targetHeaderBox = (await target.locator("[data-node-header]").boundingBox())!;
  await page.mouse.move(targetHeaderBox.x + 24, targetHeaderBox.y + targetHeaderBox.height / 2, { steps: 12 });
  await expect(target.locator('[data-release-condition-index="0"]')).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, [1-9]/);
  await expect(target.locator('[data-drop-target="true"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(source.getByText("Move me")).toHaveCount(0);
  await expect(target.getByText("Move me")).toBeVisible();
  await expect(target.locator('[data-release-condition-index="0"]')).toContainText("Move me");
  await target.getByRole("button", { name: "Drag to reorder release condition 1" }).dragTo(source.locator('[data-node-header]'));
  await expect(source.getByText("Move me")).toBeVisible();
  await expect(target.getByText("Move me")).toHaveCount(0);
});

test("release condition drag lifts the full row and shifts nearby rows", async ({ page }) => {
  const file = fixture();
  const stage = file.graph.nodes.find((node) => node.id === "stage-one")!;
  stage.conditions = [
    { id: "first", label: "First condition", required: true },
    { id: "second", label: "Second condition", required: true },
    { id: "third", label: "Third condition", required: true },
  ];
  await page.addInitScript(({ key, workflow }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();

  const stageOne = page.locator('[data-id="stage-one"]');
  const rows = stageOne.locator("[data-release-condition-index]");
  const grip = stageOne.getByRole("button", { name: "Drag to reorder release condition 1" });
  await expect(rows).toHaveCount(3);
  await page.waitForTimeout(250);
  await expect.poll(async () => {
    await grip.hover();
    return grip.evaluate((element) => element.matches(":hover"));
  }).toBe(true);
  await page.mouse.down();
  const end = (await rows.nth(2).boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height * 0.75, { steps: 12 });
  await expect(rows.nth(0)).toHaveAttribute("data-dragging", "true");
  await expect(rows.nth(1)).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, -/);
  await expect(stageOne.locator('[data-drop-target="true"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(rows.nth(2)).toContainText("First condition");
  await expect(stageOne.locator('[data-dragging="true"]')).toHaveCount(0);
});

test("L1 linked Gate group has no purple background block", async ({ page }) => {
  const file = fixture();
  const gate = createDomainNode("gate", "l2-gate");
  gate.title = "Review Gate";
  file.graph.nodes.push(gate);
  file.layout.nodes[gate.id] = { nodeId: gate.id, x: 420, y: 160, width: 450, height: 470 };
  file.layout.nodes["stage-one"].parentId = gate.id;
  await page.addInitScript(({ key, workflow }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, workflow: file });
  await page.goto("/");
  const frame = page.locator('[data-linked-gate-id="l2-gate"]');
  await expect(frame).toBeVisible();
  await expect(frame).not.toHaveClass(/bg-violet|border-violet/);
});

test("Job Number condition can be dragged within the first Chapter", async ({ page }) => {
  const file = fixture();
  const start = file.graph.nodes.find((node) => node.id === "project-start")!;
  start.conditions.push({ id: "other", label: "Other requirement", required: true });
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator('[data-id="project-start"]');
  const rows = card.locator('[data-release-condition-index]');
  await expect(rows).toHaveCount(2);
  const handle = card.getByRole("button", { name: "Drag to reorder release condition 1" });
  await page.waitForTimeout(500);
  await handle.hover();
  await page.mouse.down();
  const target = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, target.y + target.height * .8, { steps: 12 });
  await expect(rows.nth(0)).toHaveAttribute("data-dragging", "true");
  await expect(card.locator('[data-drop-target="true"]')).toHaveCount(1);
  await page.mouse.up();
  await expect(rows.nth(1)).toContainText("Job Number is entered");
  await expect(card.getByRole("textbox", { name: "Job Number (5 digits)" })).toHaveValue("27084");
});
