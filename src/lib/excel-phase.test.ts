import assert from "node:assert/strict";
import { test } from "node:test";
import type { DomainNode, WorkflowFile } from "@/types/workflow";
import {
  buildPhaseTabs,
  extraNodeDocuments,
  resolveSheetNode,
  resolveSheetPhase,
} from "@/lib/excel-phase";

const node = (
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

const fileWith = (
  nodes: DomainNode[],
  parents: Record<string, string | undefined> = {},
): WorkflowFile => ({
  graph: {
    schemaVersion: 1,
    metadata: {
      name: "Test",
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
    nodes: Object.fromEntries(
      nodes.map((item, index) => [
        item.id,
        {
          nodeId: item.id,
          x: index * 200,
          y: item.type === "phase" ? 0 : 80,
          width: 180,
          height: 120,
          parentId: parents[item.id],
        },
      ]),
    ),
    viewport: { x: 0, y: 0, zoom: 1 },
    snapToGrid: true,
    gridSize: 16,
  },
});

test("PHASE 1 sheet does not resolve PHASE 10", () => {
  const file = fileWith([
    node({ id: "phase-1", type: "phase", title: "PHASE 1: Discovery" }),
    node({ id: "phase-10", type: "phase", title: "PHASE 10: Closeout" }),
  ]);
  assert.equal(resolveSheetPhase(file, "PHASE 1", "")?.id, "phase-1");
  assert.equal(resolveSheetPhase(file, "PHASE 10", "")?.id, "phase-10");
  assert.equal(resolveSheetPhase(file, "PHASE 1", "phase-1")?.id, "phase-1");
});

test("sheet nodes match by node id only, not the shared project UUID", () => {
  const file = fileWith([
    node({
      id: "start",
      type: "projectStart",
      customFields: { nodeUuid: "shared-uuid" },
    }),
    node({
      id: "gate-a",
      type: "gate",
      customFields: { nodeUuid: "shared-uuid" },
    }),
    node({
      id: "gate-b",
      type: "gate",
      customFields: { nodeUuid: "shared-uuid" },
    }),
  ]);
  assert.equal(resolveSheetNode(file, "gate-b")?.id, "gate-b");
  assert.equal(resolveSheetNode(file, "missing"), undefined);
});

test("extra documents outside signature abbreviations are preserved", () => {
  const gate = node({
    id: "g1",
    type: "gate",
    documents: ["DRW", "Site photos", "DRW"],
    config: {
      gateRules: [
        {
          id: "rule-1",
          label: "Drawings",
          checked: false,
          signatures: [
            {
              id: "sig-1",
              abbreviation: "DRW",
              fullName: "Drawing",
              department: "",
              signedBy: "",
              checked: false,
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(extraNodeDocuments(gate), ["Site photos"]);
});

test("Excel tabs keep Project Start and Project Complete independent of Phase children", () => {
  const file = fileWith(
    [
      node({ id: "start", type: "projectStart", title: "Project Start" }),
      node({ id: "phase-1", type: "phase", title: "PHASE 1" }),
      node({ id: "gate-1", type: "gate", title: "Gate 01" }),
      node({ id: "done", type: "terminal", title: "Project Complete" }),
      node({ id: "loose", type: "general", title: "Loose node" }),
    ],
    {
      "gate-1": "phase-1",
      done: "phase-1",
    },
  );
  const tabs = buildPhaseTabs(file);
  const titles = tabs.map((tab) => tab.title);
  assert.equal(titles.includes("Project Start"), true);
  assert.equal(titles.includes("Project Complete"), true);
  assert.equal(titles.includes("Loose node"), true);
  const phaseTab = tabs.find((tab) => tab.phase?.id === "phase-1");
  assert.deepEqual(
    phaseTab?.nodes.map((item) => item.id),
    ["gate-1"],
  );
});
