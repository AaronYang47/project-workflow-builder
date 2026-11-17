import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { applyFobYardSkip, fobYardSkippedIds } from "../src/lib/fob-yard";
import { fobYardSkip } from "../src/lib/high-level-workflow";
import { phaseFormsSummary } from "../src/lib/phase-forms-summary";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function fourPhaseWorkflow(fobYard = false) {
  const file = createProjectWorkflow("FOB yard test");
  file.highLevel!.graph.nodes = [
    { id: "s", type: "start", title: "Start", description: "" },
    { id: "p3", type: "phase", title: "PHASE 3", description: "" },
    { id: "p4", type: "phase", title: "PHASE 4", description: "POST-CONSTRUCTION" },
    { id: "fc", type: "end", title: "Final Close", description: "", fobYard },
  ];
  file.highLevel!.graph.edges = [
    { id: "e1", source: "s", target: "p3" },
    { id: "e2", source: "p3", target: "p4" },
    { id: "e3", source: "p4", target: "fc" },
  ];
  ["l2-p3", "l2-p4", "l2-fc"].forEach((id, index) => {
    const node = createDomainNode(index === 0 ? "projectStart" : "general", id);
    node.title = id;
    node.department = `Dept ${index + 3}`;
    node.conditions = [
      {
        id: `${id}-rc`,
        label: `${id} release`,
        description: "",
        durationValue: 5,
        durationUnit: "days",
      } as never,
    ];
    file.graph.nodes.push(node);
    file.layout.nodes[id] = { nodeId: id, x: 80 + index * 420, y: 200, width: 300, height: 180 };
  });
  file.graph.edges = [
    { id: "l2-e1", source: "l2-p3", target: "l2-p4" },
    { id: "l2-e2", source: "l2-p4", target: "l2-fc" },
  ].map((edge) => ({
    ...edge,
    type: "normal" as const,
    lineStyle: "solid" as const,
    arrowStyle: "arrow" as const,
    customFields: {},
  }));
  const links: Record<string, string[]> = { p3: ["l2-p3"], p4: ["l2-p4"], fc: ["l2-fc"] };
  for (const node of file.highLevel!.graph.nodes) {
    node.linkedLayer2NodeIds = links[node.id] ?? [];
    node.linkedDetailedNodeIds = links[node.id] ?? [];
  }
  file.highLevel!.layout.nodes = {
    s: { nodeId: "s", x: 0, y: 220 },
    p3: { nodeId: "p3", x: 340, y: 220 },
    p4: { nodeId: "p4", x: 720, y: 220 },
    fc: { nodeId: "fc", x: 1100, y: 220 },
  };
  return file;
}

test("FOB yard skips the Phase leading into Final Close", () => {
  expect(fobYardSkip(fourPhaseWorkflow(false).highLevel!.graph).skippedNodeIds.size).toBe(0);
  const skip = fobYardSkip(fourPhaseWorkflow(true).highLevel!.graph);
  expect([...skip.skippedNodeIds]).toEqual(["p4"]);
  expect([...skip.skippedEdgeIds].sort()).toEqual(["e2", "e3"]);
  expect(skip.bypassEdges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(["p3->fc"]);
});

test("FOB yard removes Phase 4 and its departments from schedule and documents", () => {
  const off = fourPhaseWorkflow(false);
  expect(applyFobYardSkip(off)).toBe(off);
  const on = fourPhaseWorkflow(true);
  expect([...fobYardSkippedIds(on).l2]).toEqual(["l2-p4"]);
  const skipped = applyFobYardSkip(on);
  expect(skipped.highLevel!.graph.nodes.map((node) => node.id)).toEqual(["s", "p3", "fc"]);
  expect(skipped.highLevel!.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
    "s->p3",
    "p3->fc",
  ]);
  expect(skipped.graph.nodes.map((node) => node.id)).not.toContain("l2-p4");
  expect(skipped.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
    "l2-p3->l2-fc",
  ]);
  expect(buildProcessSchedule(on).tasks.map((task) => task.nodeId)).not.toContain("l2-p4");
  expect(buildProcessSchedule(off).tasks.map((task) => task.nodeId)).toContain("l2-p4");
  expect(phaseFormsSummary(skipped).map((phase) => phase.title)).not.toContainEqual("PHASE 4");
});

test("the Final Close FOB yard switch greys out Phase 4 and routes around it", async ({ page }) => {
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
    { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(false) },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase4 = page.locator('.react-flow__node[data-id="p4"] [data-fob-yard-skipped]');
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await expect(phase4).toHaveCount(0);

  await page.locator('.react-flow__node[data-id="fc"]').click();
  const toggle = page.getByRole("switch", { name: "FOB yard" });
  await toggle.check({ force: true });
  await expect(phase4).toHaveCount(1);
  await expect(page.getByText("Skipped · FOB yard").first()).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('.react-flow__node.fob-yard-skipped[data-id="l2-p4"]')).toHaveCount(1);
  await expect(page.locator(".react-flow__edge.fob-yard-skipped")).toHaveCount(2);
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.locator('.react-flow__node[data-id="fc"]').click();
  await expect(page.locator('.react-flow__edge[data-id^="fob-yard-bypass-"]')).toHaveCount(1);
  await expect(
    page.locator('.react-flow__edge[data-id="e3"] .react-flow__edge-path'),
  ).toHaveAttribute("style", /stroke: rgb\(168, 179, 194\)|#a8b3c2/);

  await toggle.uncheck({ force: true });
  await expect(phase4).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
});

for (const fobYard of [false, true]) {
  test(`L4 phase strip shows Final Close (FOB yard ${fobYard ? "on" : "off"})`, async ({
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
      { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(fobYard) },
    );
    await page.goto("/process-overview");
    const strip = page.getByRole("region", { name: "Complete process flowchart" });
    await expect(strip.locator("h3")).toHaveText(
      fobYard
        ? ["Start", "PHASE 3", "Final Close"]
        : ["Start", "PHASE 3", "PHASE 4", "Final Close"],
    );
  });
}
