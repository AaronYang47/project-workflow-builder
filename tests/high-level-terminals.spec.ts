import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { linkedNodeIds } from "../src/lib/l1-department-swimlane-model";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { buildProcessMap } from "../src/lib/release-conditions-workspace-model";
import {
  demoteExtraHighLevelTerminals,
  repairPhaseSavedAsFinalClose,
  synchronizeLinkedWorkflowOrder,
} from "../src/lib/high-level-workflow";
import { createProjectWorkflow } from "../src/lib/project-template";
import type { HighLevelWorkflow } from "../src/types/workflow";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function phaseSavedAsFinalClose() {
  const file = createProjectWorkflow("Terminal repair test");
  file.highLevel!.graph.nodes = [
    { id: "s", type: "start", title: "Start", description: "" },
    { id: "p4", type: "end", title: "PHASE 4", description: "POST-CONSTRUCTION", code: "Finish" },
    { id: "fc", type: "end", title: "Final Close", description: "" },
  ];
  file.highLevel!.graph.edges = [{ id: "e1", source: "s", target: "p4" }];
  file.highLevel!.layout.nodes = {
    s: { nodeId: "s", x: 0, y: 220 },
    p4: { nodeId: "p4", x: 340, y: 220 },
    fc: { nodeId: "fc", x: 760, y: 220 },
  };
  return file;
}

test("extra Final Close nodes become Phases; the named or rightmost one stays", () => {
  const file = phaseSavedAsFinalClose();
  const repaired = demoteExtraHighLevelTerminals(file.highLevel!);
  expect(repaired.graph.nodes.map((node) => node.type)).toEqual(["start", "phase", "end"]);
  const unnamed: HighLevelWorkflow = {
    ...file.highLevel!,
    graph: {
      ...file.highLevel!.graph,
      nodes: file.highLevel!.graph.nodes.map((node) => ({ ...node, title: node.id })),
    },
  };
  expect(
    demoteExtraHighLevelTerminals(unnamed).graph.nodes.find((node) => node.type === "end")?.id,
  ).toBe("fc");
  const single = demoteExtraHighLevelTerminals(repaired);
  expect(single).toBe(repaired);
});

test("a lone PHASE 4 saved as Final Close becomes a Phase connected to a new Final Close", () => {
  const file = phaseSavedAsFinalClose();
  const highLevel = {
    ...file.highLevel!,
    graph: {
      ...file.highLevel!.graph,
      nodes: file
        .highLevel!.graph.nodes.filter((node) => node.id !== "fc")
        .map((node) => (node.id === "p4" ? { ...node, fobYard: true } : node)),
    },
  };
  const repaired = repairPhaseSavedAsFinalClose(highLevel);
  const p4 = repaired.graph.nodes.find((node) => node.id === "p4")!;
  expect(p4.type).toBe("phase");
  expect(p4.fobYard).toBeUndefined();
  const finalClose = repaired.graph.nodes.filter((node) => node.type === "end");
  expect(finalClose).toHaveLength(1);
  expect(finalClose[0]).toMatchObject({ title: "FINAL CLOSE", fobYard: true });
  expect(repaired.graph.edges).toContainEqual(
    expect.objectContaining({ source: "p4", target: finalClose[0].id }),
  );
  expect(repaired.layout.nodes[finalClose[0].id].x).toBeGreaterThan(repaired.layout.nodes.p4.x);
  // A real Final Close is left alone.
  expect(repairPhaseSavedAsFinalClose(repaired)).toBe(repaired);
});

test("a Phase saved as Final Close gets both handles and connects to Final Close", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: phaseSavedAsFinalClose() },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase = page.locator('.react-flow__node[data-id="p4"]');
  await expect(phase.locator(".react-flow__handle.target")).toHaveCount(1);
  const source = phase.locator(".react-flow__handle.source");
  await expect(source).toHaveCount(1);
  const target = page.locator('.react-flow__node[data-id="fc"] .react-flow__handle.target');
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(
    page.locator(".react-flow__edge[data-id], .react-flow__edge").filter({
      has: page.locator("path"),
    }),
  ).toHaveCount(2);
});

test("an L2 card linked to Final Close is moved out of the Phase 4 frame", () => {
  const file = createProjectWorkflow("Frame ownership test");
  const frame = createDomainNode("phase", "frame-p4");
  frame.title = "PHASE 4";
  file.graph.nodes.push(frame);
  file.layout.nodes[frame.id] = { nodeId: frame.id, x: 0, y: 0, width: 1000, height: 700 };
  for (const [index, id] of ["site", "complete"].entries()) {
    const node = createDomainNode("general", id);
    node.title = id;
    file.graph.nodes.push(node);
    file.layout.nodes[id] = {
      nodeId: id,
      x: 40 + index * 500,
      y: 160,
      width: 300,
      height: 400,
      parentId: frame.id,
    };
  }
  file.highLevel!.graph.nodes = [
    { id: "p4", type: "phase", title: "PHASE 4", description: "", linkedLayer2NodeIds: ["site"] },
    {
      id: "fc",
      type: "end",
      title: "Final Close",
      description: "",
      linkedLayer2NodeIds: ["complete"],
    },
  ];
  file.highLevel!.graph.edges = [{ id: "e", source: "p4", target: "fc" }];
  const repaired = synchronizeLinkedWorkflowOrder(file);
  expect(repaired.layout.nodes.site.parentId).toBe("frame-p4");
  // It gets its own frame named after Final Close.
  expect(repaired.layout.nodes.complete.parentId).toBe("phase-fc");
  expect(repaired.graph.nodes.find((node) => node.id === "phase-fc")?.title).toBe("Final Close");
  const own = repaired.layout.nodes["phase-fc"];
  expect(own.x).toBeLessThan(repaired.layout.nodes.complete.x);
  expect(own.x + own.width).toBeGreaterThan(
    repaired.layout.nodes.complete.x + repaired.layout.nodes.complete.width,
  );
  // Running it again changes nothing.
  expect(
    synchronizeLinkedWorkflowOrder(repaired).graph.nodes.filter((n) => n.type === "phase"),
  ).toHaveLength(2);
  const box = repaired.layout.nodes["frame-p4"];
  expect(box.x + box.width).toBeLessThanOrEqual(repaired.layout.nodes.complete.x);

  // L3 (Release Conditions map), L4 (schedule) and the swimlane PDF agree.
  const chapters = repaired.graph.nodes.filter((node) => node.type === "general");
  const groups = buildProcessMap(repaired, chapters).groups;
  const groupOf = (id: string) =>
    groups.find((group) => group.chapters.some((chapter) => chapter.id === id))?.id;
  expect(groupOf("site")).toBe("p4");
  expect(groupOf("complete")).toBe("fc");
  for (const node of chapters) {
    node.conditions = [
      { id: `${node.id}-rc`, label: "rc", durationValue: 2, durationUnit: "days" } as never,
    ];
  }
  const schedule = buildProcessSchedule(repaired);
  const phaseOf = (id: string) =>
    schedule.phases[schedule.tasks.find((task) => task.nodeId === id)!.phaseIndex].id;
  expect(phaseOf("site")).toBe("p4");
  expect(phaseOf("complete")).toBe("fc");
  const nodeById = new Map(repaired.graph.nodes.map((node) => [node.id, node]));
  const finalClose = repaired.highLevel!.graph.nodes.find((node) => node.id === "fc")!;
  const phase4 = repaired.highLevel!.graph.nodes.find((node) => node.id === "p4")!;
  expect(linkedNodeIds(finalClose, repaired, nodeById)).toEqual(["complete"]);
  expect(linkedNodeIds(phase4, repaired, nodeById)).toEqual(["site"]);
});

test("the L1 node library no longer offers Start", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const library = page.locator("aside").filter({ hasText: "High-Level Nodes" });
  await expect(library.getByText("Phase", { exact: true })).toBeVisible();
  await expect(library.getByText("Final Close", { exact: true })).toBeVisible();
  await expect(library.getByText("Start", { exact: true })).toHaveCount(0);
});
