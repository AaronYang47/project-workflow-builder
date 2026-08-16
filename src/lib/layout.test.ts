import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_WORKFLOW } from "@/lib/demo";
import { autoLayout } from "@/lib/layout";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

const blankNode = (
  patch: Partial<DomainNode> & Pick<DomainNode, "id" | "type">,
): DomainNode => ({
  title: patch.title ?? patch.id,
  description: "",
  metadata: {},
  conditions: [],
  documents: [],
  criteria: [],
  customFields: {},
  config: {},
  ...patch,
});

function starterWithPhases(): WorkflowFile {
  const nodes: DomainNode[] = [
    blankNode({ id: "project-start", type: "projectStart", title: "Project Start" }),
    blankNode({ id: "phase-1", type: "phase", title: "PHASE 1" }),
    blankNode({ id: "phase-2", type: "phase", title: "PHASE 2" }),
    blankNode({ id: "gate-1", type: "gate", title: "Gate 01" }),
    blankNode({ id: "gate-2", type: "gate", title: "Gate 02" }),
    blankNode({ id: "project-complete", type: "terminal", title: "Project Complete" }),
    blankNode({ id: "service-legend", type: "serviceLegend", title: "Legend" }),
  ];
  return {
    graph: {
      schemaVersion: 1,
      metadata: {
        name: "Starter",
        version: "v1",
        status: "Draft",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        notes: "",
      },
      nodes,
      edges: [],
      rules: [],
    },
    layout: {
      nodes: {
        "project-start": {
          nodeId: "project-start",
          x: 40,
          y: 80,
          width: 320,
          height: 336,
        },
        "phase-1": {
          nodeId: "phase-1",
          x: 420,
          y: 64,
          width: 720,
          height: 420,
        },
        "phase-2": {
          nodeId: "phase-2",
          x: 1180,
          y: 64,
          width: 900,
          height: 420,
        },
        "gate-1": {
          nodeId: "gate-1",
          x: 40,
          y: 168,
          width: 520,
          height: 220,
          parentId: "phase-1",
        },
        "gate-2": {
          nodeId: "gate-2",
          x: 40,
          y: 168,
          width: 520,
          height: 220,
          parentId: "phase-2",
        },
        "project-complete": {
          nodeId: "project-complete",
          x: 580,
          y: 168,
          width: 280,
          height: 160,
          parentId: "phase-2",
        },
        "service-legend": {
          nodeId: "service-legend",
          x: 72,
          y: 620,
          width: 360,
          height: 180,
        },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      snapToGrid: true,
      gridSize: 16,
    },
  };
}

function assertChildrenFitPhase(file: WorkflowFile) {
  const layout = file.layout.nodes;
  for (const phase of file.graph.nodes.filter((item) => item.type === "phase")) {
    const phaseLayout = layout[phase.id];
    assert.ok(phaseLayout, `missing layout for ${phase.id}`);
    const children = file.graph.nodes.filter(
      (item) => layout[item.id]?.parentId === phase.id,
    );
    assert.ok(children.length, `${phase.id} should keep its children`);
    for (const child of children) {
      const childLayout = layout[child.id];
      assert.ok(childLayout.x >= 0, `${child.id} overflowed left of ${phase.id}`);
      assert.ok(
        childLayout.x + childLayout.width <= phaseLayout.width + 1,
        `${child.id} overflowed right of ${phase.id}`,
      );
    }
  }
}

test("Auto arrange keeps DEMO phase children packed inside their Phase", async () => {
  const arranged = await autoLayout(DEMO_WORKFLOW);
  assert.equal(arranged.layout.nodes["project-complete"]?.parentId, "phase-4");
  assert.equal(arranged.layout.nodes["g1-opportunity"]?.parentId, "phase-1");
  assert.equal(arranged.layout.nodes["g7-handover"]?.parentId, "phase-4");
  assertChildrenFitPhase(arranged);
  const phase1 = arranged.layout.nodes["phase-1"];
  const phase2 = arranged.layout.nodes["phase-2"];
  assert.ok(phase1.x + phase1.width <= phase2.x, "phases should not overlap");
});

test("Auto arrange does not flatten phase children when Project Start has no sales path", async () => {
  const arranged = await autoLayout(starterWithPhases());
  const layout = arranged.layout.nodes;
  assert.equal(layout["project-start"]?.parentId, undefined);
  assert.equal(layout["gate-1"]?.parentId, "phase-1");
  assert.equal(layout["gate-2"]?.parentId, "phase-2");
  assert.equal(layout["project-complete"]?.parentId, "phase-2");
  assert.equal(layout["service-legend"]?.parentId, undefined);
  assertChildrenFitPhase(arranged);
  assert.ok(
    (layout["project-start"]?.x ?? 0) < layout["phase-1"].x,
    "Project Start should sit left of Phase 1",
  );
});
