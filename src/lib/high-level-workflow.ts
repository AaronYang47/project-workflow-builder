import { CircleCheck, CircleDot, Layers3, type LucideIcon } from "lucide-react";
import type {
  HighLevelEdge,
  HighLevelNode,
  HighLevelNodeType,
  HighLevelWorkflow,
  ValidationIssue,
  WorkflowFile,
} from "@/types/workflow";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { spacePhaseFrames } from "@/lib/phase-layout";

function conditionNumber(title: string) {
  const match = title.trim().match(/^condition\s+(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

function workflowNodeSortKey(
  node: WorkflowFile["graph"]["nodes"][number],
  index: number,
) {
  if (node.type === "projectStart") return [0, 0, index] as const;
  if (node.title.trim().toLowerCase() === "pre-construction assessment") {
    return [2, 0, index] as const;
  }
  if (node.title.trim().toLowerCase() === "project close-out") {
    return [3, 0, index] as const;
  }
  const number = conditionNumber(node.title);
  if (number !== undefined) return [4, number, index] as const;
  return [5, index, index] as const;
}

export function orderWorkflowNodeIds(
  nodeIds: string[],
  workflowNodes: WorkflowFile["graph"]["nodes"],
) {
  const uniqueIds = Array.from(new Set(nodeIds));
  const workflowOrder = new Map(
    workflowNodes.map((node, index) => [node.id, workflowNodeSortKey(node, index)]),
  );
  const inputOrder = new Map(uniqueIds.map((id, index) => [id, index]));
  return uniqueIds.sort((left, right) => {
    const leftKey = workflowOrder.get(left);
    const rightKey = workflowOrder.get(right);
    if (!leftKey && !rightKey) {
      return (inputOrder.get(left) || 0) - (inputOrder.get(right) || 0);
    }
    if (!leftKey) return 1;
    if (!rightKey) return -1;
    return (
      leftKey[0] - rightKey[0] ||
      leftKey[1] - rightKey[1] ||
      leftKey[2] - rightKey[2]
    );
  });
}

export function orderLinkedWorkflowNodeIds(
  linkedIds: string[] | undefined,
  workflowNodes: WorkflowFile["graph"]["nodes"],
  edges?: Array<{ source: string; target: string }>,
  layoutNodes?: Record<string, { x: number; y: number }>,
) {
  void workflowNodes;
  void edges;
  void layoutNodes;
  return Array.from(new Set(linkedIds ?? []));
}

/** Resolve the L2 Gate that contains a linked step, including nested frames. */
export function linkedWorkflowGate(
  nodeId: string,
  workflowNodes: WorkflowFile["graph"]["nodes"],
  layouts: WorkflowFile["layout"]["nodes"],
): { id: string; title: string } | undefined {
  const nodeById = new Map(workflowNodes.map((node) => [node.id, node]));
  const current = nodeById.get(nodeId);
  if (current?.type === "gate") return { id: current.id, title: current.title };
  const seen = new Set<string>([nodeId]);
  let parentId = layouts[nodeId]?.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = nodeById.get(parentId);
    if (parent?.type === "gate") return { id: parent.id, title: parent.title };
    parentId = layouts[parentId]?.parentId;
  }
  return undefined;
}

/** Keep the L1 sequence authoritative for L2 card positions and simple mainline edges. */
export function synchronizeLinkedWorkflowOrder(file: WorkflowFile): WorkflowFile {
  const highLevel = file.highLevel;
  if (!highLevel) return spacePhaseFrames(file);
  const nodeById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const allLinkedIds = Array.from(new Set(
    orderHighLevelNodes(highLevel.graph.nodes, highLevel.graph.edges).flatMap(
      (node) => node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [],
    ),
  )).filter((id) => nodeById.has(id));
  if (allLinkedIds.length < 2) return spacePhaseFrames(file);

  // Chapter numbers are user-authored identifiers, not layout positions.
  const graphNodes = file.graph.nodes;
  const layouts = { ...file.layout.nodes };
  // A Gate is a contiguous span in its L1 phase. Older projects can have an
  // intermediate card inside the L2 Gate frame but still parented to Phase.
  // Adopt those cards so both views and the Gate step count describe the same span.
  for (const highLevelNode of orderHighLevelNodes(highLevel.graph.nodes, highLevel.graph.edges)) {
    const linkedIds = (highLevelNode.linkedLayer2NodeIds ?? highLevelNode.linkedDetailedNodeIds ?? [])
      .filter((id) => nodeById.has(id));
    const gatePositions = new Map<string, number[]>();
    for (const [index, id] of linkedIds.entries()) {
      const gate = linkedWorkflowGate(id, file.graph.nodes, layouts);
      if (gate) gatePositions.set(gate.id, [...(gatePositions.get(gate.id) ?? []), index]);
    }
    for (const [gateId, positions] of gatePositions) {
      if (positions.length < 2) continue;
      const phaseId = layouts[gateId]?.parentId;
      if (!phaseId) continue;
      for (const id of linkedIds.slice(positions[0] + 1, positions.at(-1))) {
        const layout = layouts[id];
        if (layout?.parentId === phaseId && !linkedWorkflowGate(id, file.graph.nodes, layouts)) {
          layouts[id] = { ...layout, parentId: gateId };
        }
      }
    }
  }
  const positionedIds = allLinkedIds.filter((id) => layouts[id]);
  // L2 stores absolute canvas coordinates even when parentId marks membership.
  // Reuse the existing slots so a reorder does not collapse later phases.
  const slots = positionedIds.map((id) => layouts[id].x).sort((a, b) => a - b);
  let previousRight = Number.NEGATIVE_INFINITY;
  for (const [index, id] of positionedIds.entries()) {
    const layout = layouts[id];
    const node = nodeById.get(id)!;
    const width = layout.width || getAdaptiveNodeSize(node, layout).width;
    const x = Math.max(slots[index], previousRight + 72);
    if (x !== layout.x) layouts[id] = { ...layout, x };
    previousRight = x + width;
  }

  // Nested Gate frames are measured first, then their enclosing Phase frames.
  for (const type of ["gate", "phase"] as const) {
    for (const container of graphNodes.filter((node) => node.type === type)) {
      const layout = layouts[container.id];
      if (!layout) continue;
      const children = Object.values(layouts).filter((child) => child.parentId === container.id);
      if (!children.length) {
        if (type === "gate") {
          const siblings = Object.values(layouts).filter((sibling) =>
            sibling.parentId === layout.parentId && sibling.nodeId !== container.id);
          const x = siblings.length
            ? Math.max(...siblings.map((sibling) => sibling.x + sibling.width)) + 72
            : layout.x;
          if (layout.x !== x || layout.width !== 340 || layout.height !== 160) {
            layouts[container.id] = { ...layout, x, width: 340, height: 160 };
          }
        }
        continue;
      }
      const padX = type === "gate" ? 24 : 36;
      const left = Math.min(...children.map((child) => child.x)) - padX;
      const right = Math.max(...children.map((child) => child.x + child.width)) + padX;
      const bottom = Math.max(...children.map((child) => child.y + child.height)) + 48;
      const next = {
        ...layout,
        x: left,
        width: Math.max(type === "gate" ? 340 : 380, right - left),
        height: Math.max(layout.height, bottom - layout.y),
      };
      if (next.x !== layout.x || next.width !== layout.width || next.height !== layout.height) {
        layouts[container.id] = next;
      }
    }
  }

  // A plain linear chain encodes the same progression as L1. Rewire it so
  // Auto arrange and arrow direction keep the user-selected order as well.
  const linkedSet = new Set(allLinkedIds);
  const chainEdges = file.graph.edges.filter((edge) =>
    linkedSet.has(edge.source) && linkedSet.has(edge.target) &&
    edge.type === "normal" && !edge.label && !edge.condition &&
    (!edge.sourceHandle || edge.sourceHandle === "out") &&
    (!edge.targetHandle || edge.targetHandle === "in") &&
    !Object.keys(edge.customFields ?? {}).length,
  );
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const edge of chainEdges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
  }
  const starts = allLinkedIds.filter((id) => !incoming.has(id));
  const bySource = new Map(chainEdges.map((edge) => [edge.source, edge.target]));
  const visited = new Set<string>();
  let cursor: string | undefined = starts[0];
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    cursor = bySource.get(cursor);
  }
  const isLinear = starts.length === 1 && visited.size === allLinkedIds.length &&
    chainEdges.length === allLinkedIds.length - 1 &&
    allLinkedIds.every((id) => (incoming.get(id) ?? 0) <= 1 && (outgoing.get(id) ?? 0) <= 1);
  const oldChain = isLinear ? [...chainEdges].sort((a, b) =>
    (file.layout.nodes[a.source]?.x ?? 0) - (file.layout.nodes[b.source]?.x ?? 0),
  ) : [];
  const replacement = new Map(oldChain.map((edge, index) => [edge.id, {
    ...edge, source: allLinkedIds[index], target: allLinkedIds[index + 1],
  }]));
  const graphEdges = file.graph.edges.map((edge) => replacement.get(edge.id) ?? edge);

  const edgeLayouts = { ...file.layout.edges };
  let changed = graphNodes.some((node, index) => node !== file.graph.nodes[index]) ||
    Object.entries(layouts).some(([id, layout]) => layout !== file.layout.nodes[id]) ||
    graphEdges.some((edge, index) => edge.source !== file.graph.edges[index].source || edge.target !== file.graph.edges[index].target);
  if (!changed) return spacePhaseFrames(file);
  for (const edge of graphEdges) {
    if (!linkedSet.has(edge.source) && !linkedSet.has(edge.target)) continue;
    const route = edgeLayouts[edge.id];
    if (route) edgeLayouts[edge.id] = { ...route, points: [] };
  }

  return spacePhaseFrames({
    ...file,
    graph: { ...file.graph, nodes: graphNodes, edges: graphEdges },
    layout: { ...file.layout, nodes: layouts, edges: edgeLayouts },
  });
}

/** Persist a card reorder, then mirror the entire L1 sequence in L2. */
export function reorderLinkedWorkflowNodes(
  file: WorkflowFile,
  highLevelNodeId: string,
  draggedNodeId: string,
  targetNodeId: string,
): WorkflowFile {
  const highLevel = file.highLevel;
  if (!highLevel || draggedNodeId === targetNodeId) return file;
  const current = highLevel.graph.nodes.find((node) => node.id === highLevelNodeId);
  if (!current) return file;
  const linkedIds = Array.from(new Set(
    current.linkedLayer2NodeIds ?? current.linkedDetailedNodeIds ?? [],
  ));
  const from = linkedIds.indexOf(draggedNodeId);
  const to = linkedIds.indexOf(targetNodeId);
  if (from < 0 || to < 0) return file;
  linkedIds.splice(to, 0, linkedIds.splice(from, 1)[0]);
  const draggedGate = linkedWorkflowGate(draggedNodeId, file.graph.nodes, file.layout.nodes);
  const targetGate = linkedWorkflowGate(targetNodeId, file.graph.nodes, file.layout.nodes);
  const layout = file.layout.nodes[draggedNodeId];
  const parentId = targetGate?.id ?? (draggedGate ? file.layout.nodes[draggedGate.id]?.parentId : undefined);
  const reorderedFile = layout && draggedGate?.id !== targetGate?.id && parentId
    ? {
      ...file,
      layout: {
        ...file.layout,
        nodes: { ...file.layout.nodes, [draggedNodeId]: { ...layout, parentId } },
      },
    }
    : file;
  return withLinkedWorkflowOrder(reorderedFile, highLevelNodeId, linkedIds);
}

/** Edit a Gate from L1 while keeping its members consecutive in both layers. */
export function setLinkedWorkflowGateMember(
  file: WorkflowFile,
  highLevelNodeId: string,
  gateId: string,
  nodeId: string,
  included: boolean,
): WorkflowFile {
  const highLevelNode = file.highLevel?.graph.nodes.find((node) => node.id === highLevelNodeId);
  const gate = file.graph.nodes.find((node) => node.id === gateId && node.type === "gate");
  const gateLayout = file.layout.nodes[gateId];
  const nodeLayout = file.layout.nodes[nodeId];
  if (!highLevelNode || !gate || !gateLayout?.parentId || !nodeLayout) return file;
  const linkedIds = Array.from(new Set(highLevelNode.linkedLayer2NodeIds ?? highLevelNode.linkedDetailedNodeIds ?? []));
  const originalIndex = linkedIds.indexOf(nodeId);
  if (originalIndex < 0) return file;
  const currentGateId = linkedWorkflowGate(nodeId, file.graph.nodes, file.layout.nodes)?.id;
  const currentPhaseId = currentGateId
    ? file.layout.nodes[currentGateId]?.parentId
    : nodeLayout.parentId;
  if (currentPhaseId !== gateLayout.parentId) return file;
  if ((currentGateId === gateId) === included) return file;

  const withoutNode = linkedIds.filter((id) => id !== nodeId);
  const gateMemberIndices = withoutNode.flatMap((id, index) =>
    linkedWorkflowGate(id, file.graph.nodes, file.layout.nodes)?.id === gateId ? [index] : [],
  );
  // Insert at the end of the Gate block when adding. When removing, place the
  // step immediately after that block so a gap cannot split the Gate frame.
  const insertionIndex = gateMemberIndices.length
    ? gateMemberIndices[gateMemberIndices.length - 1] + 1
    : Math.min(originalIndex, withoutNode.length);
  withoutNode.splice(insertionIndex, 0, nodeId);
  const parentId = included ? gateId : gateLayout.parentId;
  const nextFile = {
    ...file,
    layout: {
      ...file.layout,
      nodes: { ...file.layout.nodes, [nodeId]: { ...nodeLayout, parentId } },
    },
  };
  return withLinkedWorkflowOrder(nextFile, highLevelNodeId, withoutNode);
}

/** Move a contiguous L2 Gate's linked steps together inside their L1 phase. */
export function reorderLinkedWorkflowGate(
  file: WorkflowFile,
  highLevelNodeId: string,
  gateId: string,
  targetNodeId: string,
  position: "before" | "after",
): WorkflowFile {
  const current = file.highLevel?.graph.nodes.find((node) => node.id === highLevelNodeId);
  if (!current) return file;
  const linkedIds = Array.from(new Set(current.linkedLayer2NodeIds ?? current.linkedDetailedNodeIds ?? []));
  const gateIds = linkedIds.filter((id) => linkedWorkflowGate(id, file.graph.nodes, file.layout.nodes)?.id === gateId);
  if (!gateIds.length || gateIds.includes(targetNodeId)) return file;
  const remaining = linkedIds.filter((id) => !gateIds.includes(id));
  const targetIndex = remaining.indexOf(targetNodeId);
  if (targetIndex < 0) return file;
  remaining.splice(targetIndex + Number(position === "after"), 0, ...gateIds);
  if (remaining.every((id, index) => id === linkedIds[index])) return file;
  return withLinkedWorkflowOrder(file, highLevelNodeId, remaining);
}

function withLinkedWorkflowOrder(
  file: WorkflowFile,
  highLevelNodeId: string,
  linkedIds: string[],
): WorkflowFile {
  const highLevel = file.highLevel;
  if (!highLevel) return file;
  const highLevelNodes = highLevel.graph.nodes.map((node) =>
    node.id === highLevelNodeId
      ? { ...node, linkedLayer2NodeIds: linkedIds, linkedDetailedNodeIds: [...linkedIds] }
      : node,
  );
  return synchronizeLinkedWorkflowOrder({
    ...file,
    highLevel: { ...highLevel, graph: { ...highLevel.graph, nodes: highLevelNodes } },
  });
}

/** Order nodes by the High-Level connections, not by creation order. */
export function orderHighLevelNodes(nodes: HighLevelNode[], edges: HighLevelEdge[]) {
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!originalIndex.has(edge.source) || !originalIndex.has(edge.target)) continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  }
  const queue = nodes
    .filter((node) => (incoming.get(node.id) || 0) === 0)
    .sort((left, right) =>
      Number(right.type === "start") - Number(left.type === "start") ||
      originalIndex.get(left.id)! - originalIndex.get(right.id)!,
    )
    .map((node) => node.id);
  const orderedIds: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    orderedIds.push(id);
    for (const target of outgoing.get(id) || []) {
      const next = (incoming.get(target) || 0) - 1;
      incoming.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  const missing = nodes.map((node) => node.id).filter((id) => !orderedIds.includes(id));
  return [...orderedIds, ...missing].map((id) => nodes[originalIndex.get(id)!]);
}

export interface HighLevelNodeDefinition {
  type: HighLevelNodeType;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const HIGH_LEVEL_NODE_CATALOG: HighLevelNodeDefinition[] = [
  {
    type: "start",
    label: "Start",
    description: "High-level process entry point",
    icon: CircleDot,
    color: "#16866f",
  },
  {
    type: "phase",
    label: "Phase",
    description: "Major project phase",
    icon: Layers3,
    color: "#64748b",
  },
  {
    type: "end",
    label: "Final Close",
    description: "High-level process completion",
    icon: CircleCheck,
    color: "#64748b",
  },
];

const defaultNode = (
  id: string,
  type: HighLevelNodeType,
  title: string,
  description = "",
  code = "",
): HighLevelNode => ({ id, type, title, description, code });

/**
 * The first JF scaffold used one L1 node for nearly every L2 milestone. Keep
 * this narrow detector so persisted 13-node workspaces can be upgraded to
 * the compact grouped lifecycle without mistaking a user-authored L1 for the
 * old default.
 */
export function isLegacyDefaultHighLevelFamily(
  highLevel: HighLevelWorkflow | undefined,
) {
  const nodes = highLevel?.graph.nodes || [];
  return (
    nodes.length === 13 &&
    nodes.every((node, index) => node.id === `high-level-${index + 1}`)
  );
}

/** Identifies the former seeded nine-step lifecycle so it cannot be restored
 * as a user project after the workspace was changed to start empty. */
export function isDefaultHighLevelProcess(
  highLevel: HighLevelWorkflow | undefined,
) {
  const nodes = highLevel?.graph.nodes || [];
  const expected = [
    "INITIAL CONTACT",
    "OPPORTUNITY & QUALIFICATION",
    "G1 — QUALIFIED & COMMERCIALLY ENGAGED",
    "G2 — TECHNICAL COMMITMENT",
    "G3 — PRODUCTION AUTHORIZATION",
    "G4 — FACTORY RELEASE",
    "G5 — WARRANTY START",
    "COMMISSIONING & WARRANTY",
    "FINAL CLOSE",
  ];
  return (
    nodes.length === expected.length &&
    nodes.every(
      (node, index) =>
        node.id === `high-level-${index + 1}` && node.title === expected[index],
    )
  );
}

export function createHighLevelNode(
  type: HighLevelNodeType,
  id: string,
): HighLevelNode {
  const definition = HIGH_LEVEL_NODE_CATALOG.find((item) => item.type === type)!;
  return defaultNode(id, type, definition.label, definition.description);
}

export function createDefaultHighLevelProcess(): HighLevelWorkflow {
  const steps: Array<{
    type: HighLevelNodeType;
    title: string;
    description: string;
  }> = [
    {
      type: "start",
      title: "INITIAL CONTACT",
      description: "Create the project record, capture the initial contact, and establish the project identifier.",
    },
    {
      type: "phase",
      title: "OPPORTUNITY & QUALIFICATION",
      description: "Test client, authority, project scale, site, design, and eligibility evidence.",
    },
    {
      type: "primaryGate",
      title: "G1 — QUALIFIED & COMMERCIALLY ENGAGED",
      description: "Release an eligible opportunity with a valid route, approval authority, and executed commercial engagement.",
    },
    {
      type: "primaryGate",
      title: "G2 — TECHNICAL COMMITMENT",
      description: "Complete pre-construction and authorize the project, technical basis, scope, and responsibility boundaries.",
    },
    {
      type: "primaryGate",
      title: "G3 — PRODUCTION AUTHORIZATION",
      description: "Complete production readiness and release the approved package to factory production.",
    },
    {
      type: "primaryGate",
      title: "G4 — FACTORY RELEASE",
      description: "Complete factory production, accept quality evidence, and release the work to delivery.",
    },
    {
      type: "primaryGate",
      title: "G5 — WARRANTY START",
      description: "Complete delivery and project completion, accept controlled deficiencies, and start warranty.",
    },
    {
      type: "phase",
      title: "COMMISSIONING & WARRANTY",
      description: "Complete commissioning, warranty service, and closeout tracking.",
    },
    {
      type: "end",
      title: "FINAL CLOSE",
      description: "Close the project after warranty completion and outstanding obligations are resolved.",
    },
  ];
  const nodes = steps.map((s, index) => {
    const node = defaultNode(`high-level-${index + 1}`, s.type, s.title, s.description);
    return node;
  });
  const edges: HighLevelEdge[] = nodes.slice(1).map((node, index) => ({
    id: `high-level-edge-${index + 1}`,
    source: nodes[index].id,
    target: node.id,
  }));
  let currentX = 0;
  const layoutNodes: Record<string, { nodeId: string; x: number; y: number }> = {};
  for (const node of nodes) {
    const width = node.type === "phase" || node.type === "primaryGate" ? 288 : node.type === "start" || node.type === "end" ? 256 : 208;
    layoutNodes[node.id] = { nodeId: node.id, x: currentX, y: 220 };
    currentX += width + 64;
  }
  return {
    graph: { nodes, edges },
    layout: {
      nodes: layoutNodes,
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  };
}

export function autoArrangeHighLevel(file: WorkflowFile): WorkflowFile {
  const highLevel = file.highLevel;
  if (!highLevel) return file;
  const gap = 56;
  const widthFor = (type: HighLevelNodeType) => {
    if (type === "phase" || type === "primaryGate") return 288;
    if (type === "start" || type === "end") return 256;
    return 208;
  };
  let x = 0;
  const nodes = Object.fromEntries(
    orderHighLevelNodes(highLevel.graph.nodes, highLevel.graph.edges).map((node) => {
      const position = {
        ...(highLevel.layout.nodes[node.id] || { nodeId: node.id }),
        nodeId: node.id,
        x,
        y: 220,
      };
      x += widthFor(node.type) + gap;
      return [node.id, position];
    }),
  );
  return {
    ...file,
    highLevel: {
      ...highLevel,
      layout: { ...highLevel.layout, nodes },
    },
  };
}

export function validateHighLevelWorkflow(
  highLevel: HighLevelWorkflow | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = highLevel?.graph.nodes || [];
  const edges = highLevel?.graph.edges || [];
  const starts = nodes.filter((node) => node.type === "start");
  const ends = nodes.filter((node) => node.type === "end");
  if (starts.length !== 1) {
    issues.push({
      id: "high-level-start-count",
      severity: "error",
      code: "HIGH_LEVEL_START_COUNT",
      message: starts.length === 0 ? "High-Level workflow needs a Start node" : "High-Level workflow must have exactly one Start node",
      nodeId: starts[0]?.id,
    });
  }
  if (ends.length !== 1) {
    issues.push({
      id: "high-level-end-count",
      severity: "error",
      code: "HIGH_LEVEL_END_COUNT",
      message: ends.length === 0 ? "High-Level workflow needs a Final Close node" : "High-Level workflow must have exactly one Final Close node",
      nodeId: ends[0]?.id,
    });
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connected = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({
        id: `high-level-broken-${edge.id}`,
        severity: "error",
        code: "HIGH_LEVEL_BROKEN_REFERENCE",
        message: `High-Level connection “${edge.id}” references a missing node`,
        edgeId: edge.id,
      });
      continue;
    }
    connected.add(edge.source);
    connected.add(edge.target);
  }
  nodes
    .filter((node) => !connected.has(node.id))
    .forEach((node) =>
      issues.push({
        id: `high-level-orphan-${node.id}`,
        severity: "warning",
        code: "HIGH_LEVEL_ORPHAN_NODE",
        message: `“${node.title}” is not connected`,
        nodeId: node.id,
      }),
    );
  if (starts.length === 1 && ends.length === 1) {
    const reachable = new Set<string>();
    const queue = [starts[0].id];
    while (queue.length) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      edges
        .filter((edge) => edge.source === id && nodeIds.has(edge.target))
        .forEach((edge) => queue.push(edge.target));
    }
    if (!reachable.has(ends[0].id)) {
      issues.push({
        id: "high-level-end-unreachable",
        severity: "error",
        code: "HIGH_LEVEL_END_UNREACHABLE",
        message: "Start cannot reach Final Close",
        nodeId: ends[0].id,
      });
    }
  }
  return issues;
}
