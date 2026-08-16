import { getNodeDefinition } from "@/lib/node-catalog";
import { absoluteLayoutPosition } from "@/lib/layout-geometry";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

export type PhaseTab = {
  phase: DomainNode | undefined;
  title: string;
  nodes: DomainNode[];
};

function nodeBox(file: WorkflowFile, nodeId: string) {
  const position = absoluteLayoutPosition(file.layout.nodes, nodeId);
  const layout = file.layout.nodes[nodeId];
  return {
    x: position.x,
    y: position.y,
    width: layout?.width ?? 0,
    height: layout?.height ?? 0,
  };
}

function compareCanvas(
  file: WorkflowFile,
  leftId: string,
  rightId: string,
  band?: (id: string) => number,
) {
  const left = nodeBox(file, leftId);
  const right = nodeBox(file, rightId);
  const leftBand = band ? band(leftId) : 0;
  const rightBand = band ? band(rightId) : 0;
  return leftBand - rightBand || left.x - right.x || left.y - right.y;
}

function phasesInCanvasOrder(file: WorkflowFile) {
  return file.graph.nodes
    .filter((node) => node.type === "phase")
    .sort((a, b) => compareCanvas(file, a.id, b.id));
}

function alwaysStandalone(node: DomainNode) {
  return node.type === "projectStart" || node.type === "terminal";
}

function childrenOfPhase(file: WorkflowFile, phaseId: string) {
  return file.graph.nodes
    .filter((node) => {
      if (alwaysStandalone(node)) return false;
      return file.layout.nodes[node.id]?.parentId === phaseId;
    })
    .sort((a, b) => compareCanvas(file, a.id, b.id));
}

function independentNodes(file: WorkflowFile, phases: DomainNode[]) {
  const phaseIds = new Set(phases.map((phase) => phase.id));
  return file.graph.nodes.filter((node) => {
    if (node.type === "phase") return false;
    if (alwaysStandalone(node)) return true;
    const parentId = file.layout.nodes[node.id]?.parentId;
    return !parentId || !phaseIds.has(parentId);
  });
}

export function standaloneTabTitle(node: DomainNode) {
  return node.title || getNodeDefinition(node.type).label;
}

export function buildPhaseTabs(file: WorkflowFile): PhaseTab[] {
  const phases = phasesInCanvasOrder(file);
  const loose = independentNodes(file, phases);
  const phaseBottom = phases.length
    ? Math.max(
        ...phases.map((phase) => {
          const box = nodeBox(file, phase.id);
          return box.y + box.height;
        }),
      )
    : Number.POSITIVE_INFINITY;
  const bandOf = (id: string) => (nodeBox(file, id).y >= phaseBottom ? 1 : 0);
  const sequence = [
    ...phases.map((phase) => ({ kind: "phase" as const, id: phase.id, phase })),
    ...loose.map((node) => ({ kind: "node" as const, id: node.id, node })),
  ].sort((a, b) =>
    compareCanvas(file, a.id, b.id, phases.length ? bandOf : undefined),
  );

  const tabs: PhaseTab[] = [];
  for (const item of sequence) {
    if (item.kind === "phase") {
      tabs.push({
        phase: item.phase,
        title: item.phase.title,
        nodes: childrenOfPhase(file, item.phase.id),
      });
    } else {
      tabs.push({
        phase: undefined,
        title: standaloneTabTitle(item.node),
        nodes: [item.node],
      });
    }
  }
  return tabs.length
    ? tabs
    : [
        {
          phase: undefined,
          title: "Workflow",
          nodes: [],
        },
      ];
}
