import { expect, test } from "playwright/test";
import { createProjectWorkflow } from "../src/lib/project-template";
import { createDomainNode } from "../src/lib/create-domain-node";
import { routeChapterConnections } from "../src/lib/chapter-edge-routing";
import { spacePhaseFrames } from "../src/lib/phase-layout";
import { estimateEdgeLabelChip } from "../src/lib/layout-geometry";

function fixture() {
  const file = createProjectWorkflow("Branch routing");
  file.graph.nodes = [];
  file.graph.edges = [];
  file.layout.nodes = {};
  for (let i = 0; i < 6; i++) {
    const node = createDomainNode("general", `chapter-${i}`);
    file.graph.nodes.push(node);
    file.layout.nodes[node.id] = { nodeId: node.id, x: i * 456, y: 220, width: 384, height: 600 + i * 110 };
  }
  const pairs = [[0,1],[1,2],[2,3],[3,4],[4,5],[1,1],[1,3],[2,4],[3,5]];
  file.graph.edges = pairs.map(([source,target], i) => ({ id: `edge-${i}`, source: `chapter-${source}`, target: `chapter-${target}`, sourceHandle: "out", targetHandle: "in", type: source === target ? "failure" : "success", label: i >= 4 ? "Permit approval before IFC; drawing development may overlap" : "", lineStyle: "solid", arrowStyle: "closed", customFields: {} }));
  return spacePhaseFrames(file);
}

test("chapter connectors avoid every card, with separate detour and label lanes", () => {
  const file = fixture();
  const routes = routeChapterConnections(file);
  expect(Object.keys(routes)).toHaveLength(file.graph.edges.length);
  const labels: { x: number; y: number; width: number; height: number }[] = [];
  for (const edge of file.graph.edges) {
    const route = routes[edge.id];
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      for (const card of Object.values(file.layout.nodes)) {
        const intersects = Math.max(a.x,b.x) > card.x + 1 && Math.min(a.x,b.x) < card.x + card.width - 1 && Math.max(a.y,b.y) > card.y + 1 && Math.min(a.y,b.y) < card.y + card.height - 1;
        expect(intersects, `${edge.id} crosses ${card.nodeId}`).toBe(false);
      }
    }
    if (route.label) {
      const chip = estimateEdgeLabelChip(edge.label!);
      const rect = { x: route.label.x-chip.width/2, y:route.label.y-chip.height/2, ...chip };
      for (const other of [...Object.values(file.layout.nodes), ...labels]) {
        expect(rect.x < other.x+other.width && rect.x+rect.width > other.x && rect.y < other.y+other.height && rect.y+rect.height > other.y).toBe(false);
      }
      labels.push(rect);
    }
  }
  expect(spacePhaseFrames(file)).toBe(file);
  expect(routes["edge-0"].points).toHaveLength(4);
  expect(routes["edge-5"].points).toHaveLength(6);
});

test("manual multi-row card layouts keep the existing router", () => {
  const file = fixture();
  file.layout.nodes["chapter-1"].x = 0;
  file.layout.nodes["chapter-1"].y = 1800;
  expect(routeChapterConnections(file)).toEqual({});
});
