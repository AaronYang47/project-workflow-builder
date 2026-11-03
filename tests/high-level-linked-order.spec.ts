import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import {
  orderLinkedWorkflowNodeIds,
  linkedWorkflowGate,
  reorderLinkedWorkflowNodes,
  reorderLinkedWorkflowGate,
  setLinkedWorkflowGateMember,
  synchronizeLinkedWorkflowOrder,
} from "../src/lib/high-level-workflow";
import { autoLayout } from "../src/lib/layout";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function makeWorkflow() {
  const file = createProjectWorkflow("Linked node order test");
  const phase = createDomainNode("phase", "phase-one");
  const gate = createDomainNode("gate", "gate-one");
  phase.title = "Phase One";
  gate.title = "Gate One";
  file.graph.nodes.push(phase, gate);
  file.layout.nodes[phase.id] = { nodeId: phase.id, x: 936, y: 0, width: 1100, height: 600 };
  file.layout.nodes[gate.id] = { nodeId: gate.id, x: 960, y: 80, width: 750, height: 470, parentId: phase.id };

  const ids = ["start", "class-c", "class-b", "class-a", "finish"];
  ids.forEach((id, index) => {
    const node = createDomainNode(index === 0 ? "projectStart" : "general", id);
    node.title = id;
    node.config.stage = String(index).padStart(2, "0");
    file.graph.nodes.push(node);
    file.layout.nodes[id] = {
      nodeId: id,
      x: 72 + index * 500,
      y: 220,
      width: 300,
      height: 180,
      parentId: index === 1 || index === 2 ? gate.id : index === 3 ? phase.id : undefined,
    };
  });
  file.graph.edges = ids.slice(0, -1).map((id, index) => ({
    id: `edge-${index}`,
    source: id,
    target: ids[index + 1],
    type: "normal" as const,
    lineStyle: "solid" as const,
    arrowStyle: "arrow" as const,
    customFields: {},
  }));
  file.highLevel!.graph.nodes = [
    { id: "l1-start", type: "start", title: "Start", description: "", linkedLayer2NodeIds: ["start"], linkedDetailedNodeIds: ["start"] },
    { id: "l1-phase", type: "phase", title: "Phase One", description: "", linkedLayer2NodeIds: ["class-c", "class-b", "class-a"], linkedDetailedNodeIds: ["class-c", "class-b", "class-a"] },
    { id: "l1-end", type: "end", title: "Finish", description: "", linkedLayer2NodeIds: ["finish"], linkedDetailedNodeIds: ["finish"] },
  ];
  file.highLevel!.graph.edges = [
    { id: "l1-edge-1", source: "l1-start", target: "l1-phase" },
    { id: "l1-edge-2", source: "l1-phase", target: "l1-end" },
  ];
  file.highLevel!.layout.nodes = {
    "l1-start": { nodeId: "l1-start", x: 0, y: 220 },
    "l1-phase": { nodeId: "l1-phase", x: 340, y: 220 },
    "l1-end": { nodeId: "l1-end", x: 700, y: 220 },
  };
  return file;
}

function expectOrder(file: ReturnType<typeof makeWorkflow>) {
  const expected = ["start", "class-b", "class-c", "class-a", "finish"];
  expect(expected.map((id) => file.layout.nodes[id].x)).toEqual(
    [...expected.map((id) => file.layout.nodes[id].x)].sort((a, b) => a - b),
  );
  expect(expected.map((id) => file.graph.nodes.find((node) => node.id === id)?.config.stage)).toEqual(
    ["00", "02", "01", "03", "04"],
  );
  expect(file.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(
    expected.slice(0, -1).map((id, index) => `${id}->${expected[index + 1]}`),
  );
  for (const containerId of ["gate-one", "phase-one"]) {
    const frame = file.layout.nodes[containerId];
    const children = Object.values(file.layout.nodes).filter((layout) => layout.parentId === containerId);
    for (const child of children) {
      expect(frame.x).toBeLessThan(child.x);
      expect(frame.x + frame.width).toBeGreaterThan(child.x + child.width);
      expect(frame.y + frame.height).toBeGreaterThan(child.y + child.height);
    }
  }
}

test("L1 B/C reorder updates every L2 ordering surface and survives Auto arrange", async () => {
  const file = makeWorkflow();
  const reordered = reorderLinkedWorkflowNodes(file, "l1-phase", "class-b", "class-c");
  expect(reordered.highLevel!.graph.nodes[1].linkedLayer2NodeIds).toEqual(["class-b", "class-c", "class-a"]);
  expect(orderLinkedWorkflowNodeIds(reordered.highLevel!.graph.nodes[1].linkedLayer2NodeIds, reordered.graph.nodes)).toEqual(["class-b", "class-c", "class-a"]);
  expectOrder(reordered);
  expect(synchronizeLinkedWorkflowOrder(reordered)).toBe(reordered);
  expectOrder(await autoLayout(reordered));
});

test("L1 drag handle lifts the row and shifts its neighbour before drop", async ({ page }) => {
  const file = makeWorkflow();
  await page.addInitScript(({ key, persistedFile }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: persistedFile, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, persistedFile: file });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('[data-id="l1-phase"]');
  const source = await phase.locator('[data-linked-workflow-node-id="class-c"] [data-reorder-handle]').boundingBox();
  const target = await phase.locator('[data-linked-workflow-node-id="class-b"]').boundingBox();
  expect(source).toBeTruthy();
  expect(target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 });
  await expect(phase.locator('[data-linked-workflow-node-id="class-c"][data-dragging]')).toHaveCount(1);
  await expect(phase.locator('[data-linked-workflow-node-id="class-b"][data-drop-target]')).toHaveCount(1);
  const shifted = await phase.locator('[data-linked-workflow-row="class-b"]').evaluate((row) =>
    getComputedStyle(row).transform !== "none",
  );
  expect(shifted).toBe(true);
  await page.mouse.up();
  await expect.poll(() => phase.locator('[data-linked-workflow-node-id]').evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-linked-workflow-node-id")),
  )).toEqual(["class-b", "class-c", "class-a"]);
});

test("loading an older B/C L1 order repairs stale L2 coordinates and arrows", () => {
  const file = makeWorkflow();
  file.highLevel!.graph.nodes[1].linkedLayer2NodeIds = ["class-b", "class-c", "class-a"];
  file.highLevel!.graph.nodes[1].linkedDetailedNodeIds = ["class-b", "class-c", "class-a"];
  expectOrder(synchronizeLinkedWorkflowOrder(file));
});

test("an L2 Gate frame adopts the middle linked step and becomes one L1 frame", async ({ page }) => {
  const file = makeWorkflow();
  file.layout.nodes["class-b"].parentId = "phase-one";
  file.layout.nodes["class-a"].parentId = "gate-one";
  const repaired = synchronizeLinkedWorkflowOrder(file);
  expect(repaired.layout.nodes["class-b"].parentId).toBe("gate-one");
  expect(synchronizeLinkedWorkflowOrder(repaired)).toBe(repaired);
  const gateChildren = Object.values(repaired.layout.nodes).filter((layout) => layout.parentId === "gate-one");
  expect(gateChildren.map((layout) => layout.nodeId)).toEqual(expect.arrayContaining(["class-c", "class-b", "class-a"]));
  expect(gateChildren).toHaveLength(3);
  await page.addInitScript(({ key, persistedFile }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: persistedFile, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, persistedFile: file });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const gate = page.locator('[data-id="l1-phase"] [data-linked-gate-id="gate-one"]');
  await expect(gate).toHaveCount(1);
  await expect(gate.locator("[data-linked-workflow-node-id]")).toHaveCount(3);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="gate-one"]')).toContainText("3 steps");
});

test("L1 Gate member editor adds and removes steps in L2", async ({ page }) => {
  const file = makeWorkflow();
  const added = setLinkedWorkflowGateMember(file, "l1-phase", "gate-one", "class-a", true);
  expect(added.layout.nodes["class-a"].parentId).toBe("gate-one");
  expect(added.highLevel!.graph.nodes[1].linkedLayer2NodeIds).toEqual(["class-c", "class-b", "class-a"]);
  const removed = setLinkedWorkflowGateMember(added, "l1-phase", "gate-one", "class-b", false);
  expect(removed.layout.nodes["class-b"].parentId).toBe("phase-one");
  expect(removed.highLevel!.graph.nodes[1].linkedLayer2NodeIds).toEqual(["class-c", "class-a", "class-b"]);
  expect(removed.graph.nodes.find((node) => node.id === "class-b")?.config.stage).toBe("02");

  await page.addInitScript(({ key, persistedFile }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: persistedFile, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, persistedFile: file });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('[data-id="l1-phase"]');
  await phase.getByRole("button", { name: "Edit Gate One Gate members" }).click();
  await phase.getByRole("checkbox", { name: "Add class-a to Gate One" }).click();
  await expect(phase.locator('[data-linked-gate-id="gate-one"] [data-linked-workflow-node-id]')).toHaveCount(3);
  await phase.getByRole("checkbox", { name: "Remove class-b from Gate One" }).uncheck();
  await expect(phase.locator('[data-linked-gate-id="gate-one"] [data-linked-workflow-node-id]')).toHaveCount(2);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="gate-one"]')).toContainText("2 steps");
  const positions = await page.locator('[data-id="class-c"], [data-id="class-a"], [data-id="class-b"]').evaluateAll((items) =>
    Object.fromEntries(items.map((item) => [item.getAttribute("data-id"), item.getBoundingClientRect().x])),
  );
  expect(positions["class-c"]).toBeLessThan(positions["class-a"]);
  expect(positions["class-a"]).toBeLessThan(positions["class-b"]);
});

test("an emptied Gate stays editable in L1 and no longer surrounds L2 steps", async ({ page }) => {
  const file = makeWorkflow();
  const oneLeft = setLinkedWorkflowGateMember(file, "l1-phase", "gate-one", "class-b", false);
  const empty = setLinkedWorkflowGateMember(oneLeft, "l1-phase", "gate-one", "class-c", false);
  expect(empty.layout.nodes["gate-one"].width).toBe(340);
  expect(empty.layout.nodes["gate-one"].x).toBeGreaterThan(empty.layout.nodes["class-b"].x + empty.layout.nodes["class-b"].width);
  expect(synchronizeLinkedWorkflowOrder(empty)).toBe(empty);
  await page.addInitScript(({ key, persistedFile }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: persistedFile, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, persistedFile: empty });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('[data-id="l1-phase"]');
  await expect(phase.locator('[data-linked-gate-id="gate-one"]')).toHaveCount(1);
  await phase.getByRole("button", { name: "Edit Gate One Gate members" }).click();
  await phase.getByRole("checkbox", { name: "Add class-a to Gate One" }).click();
  await expect(phase.locator('[data-linked-gate-id="gate-one"] [data-linked-workflow-node-id]')).toHaveCount(1);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="gate-one"]')).toContainText("1 step");
});

test("dragging a Gate as a group changes its L1 and L2 position together", async ({ page }) => {
  const file = makeWorkflow();
  const reordered = reorderLinkedWorkflowGate(file, "l1-phase", "gate-one", "class-a", "after");
  expect(reordered.highLevel!.graph.nodes[1].linkedLayer2NodeIds).toEqual(["class-a", "class-c", "class-b"]);
  expect(reordered.layout.nodes["class-a"].x).toBeLessThan(reordered.layout.nodes["class-c"].x);
  expect(reordered.layout.nodes["class-c"].x).toBeLessThan(reordered.layout.nodes["class-b"].x);
  await page.addInitScript(({ key, persistedFile }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: persistedFile, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, persistedFile: file });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('[data-id="l1-phase"]');
  const handle = await phase.locator('[data-gate-reorder-handle]').boundingBox();
  const target = await phase.locator('[data-linked-workflow-node-id="class-a"]').boundingBox();
  expect(handle).toBeTruthy();
  expect(target).toBeTruthy();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height * 0.8, { steps: 9 });
  await page.mouse.up();
  await expect.poll(() => phase.locator('[data-linked-workflow-node-id]').evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-linked-workflow-node-id")),
  )).toEqual(["class-a", "class-c", "class-b"]);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('[data-id="class-a"]')).toBeAttached();
  const positions = await page.locator('[data-id="class-a"], [data-id="class-c"], [data-id="class-b"]').evaluateAll((items) =>
    Object.fromEntries(items.map((item) => [item.getAttribute("data-id"), item.getBoundingClientRect().x])),
  );
  expect(positions["class-a"]).toBeLessThan(positions["class-c"]);
  expect(positions["class-c"]).toBeLessThan(positions["class-b"]);
});

test("L1 purple Gate frames follow their linked L2 membership after dragging", async ({ page }) => {
  const file = makeWorkflow();
  expect(linkedWorkflowGate("class-b", file.graph.nodes, file.layout.nodes)).toEqual({ id: "gate-one", title: "Gate One" });
  expect(linkedWorkflowGate("class-a", file.graph.nodes, file.layout.nodes)).toBeUndefined();
  await page.addInitScript(({ key, persistedFile }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file: persistedFile, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, persistedFile: file });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('[data-id="l1-phase"]');
  const gate = phase.locator('[data-linked-gate-id="gate-one"]');
  await expect(gate).toHaveCount(1);
  await expect(gate).toContainText("Gate One");
  await expect(gate.locator('[data-linked-workflow-node-id="class-c"]')).toHaveCount(1);
  await expect(gate.locator('[data-linked-workflow-node-id="class-b"]')).toHaveCount(1);
  await expect(gate.locator('[data-linked-workflow-node-id="class-a"]')).toHaveCount(0);
  const source = await phase.locator('[data-linked-workflow-node-id="class-b"] [data-reorder-handle]').boundingBox();
  const target = await phase.locator('[data-linked-workflow-node-id="class-a"]').boundingBox();
  expect(source).toBeTruthy();
  expect(target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(phase.locator('[data-linked-gate-id="gate-one"]')).toHaveCount(1);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state.file, WORKFLOW_STORAGE_KEY);
  expect(saved.highLevel.graph.nodes.find((node: { id: string }) => node.id === "l1-phase").linkedLayer2NodeIds).toEqual(["class-c", "class-a", "class-b"]);
  expect(saved.layout.nodes["class-c"].x).toBeLessThan(saved.layout.nodes["class-a"].x);
  expect(saved.layout.nodes["class-a"].x).toBeLessThan(saved.layout.nodes["class-b"].x);
  const gateLayout = saved.layout.nodes["gate-one"];
  expect(gateLayout.x).toBeLessThan(saved.layout.nodes["class-c"].x);
  expect(saved.layout.nodes["class-b"].parentId).toBe("phase-one");
  expect(gateLayout.x + gateLayout.width).toBeLessThan(saved.layout.nodes["class-a"].x);
});

test("Auto Arrange preserves manually entered Chapter numbers", async () => {
  const file = makeWorkflow();
  const values = new Map([["start", "37"], ["class-c", "85"], ["class-b", "12"]]);
  for (const node of file.graph.nodes) if (values.has(node.id)) node.config.stage = values.get(node.id)!;
  const result = await autoLayout(file);
  for (const [id, value] of values) expect(result.graph.nodes.find((node) => node.id === id)?.config.stage).toBe(value);
});
