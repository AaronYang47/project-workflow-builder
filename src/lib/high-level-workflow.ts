import { CircleCheck, CircleDot, Layers3, type LucideIcon } from "lucide-react";
import type {
  HighLevelEdge,
  HighLevelNode,
  HighLevelNodeType,
  HighLevelWorkflow,
  ValidationIssue,
  WorkflowFile,
} from "@/types/workflow";

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
  if (!linkedIds || linkedIds.length <= 1) return linkedIds || [];

  const uniqueIds = Array.from(new Set(linkedIds));
  const idSet = new Set(uniqueIds);

  // 1. If edges are provided, perform topological sort along L2 graph edges
  if (edges && edges.length > 0) {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    uniqueIds.forEach((id) => {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    });

    edges.forEach((edge) => {
      if (idSet.has(edge.source) && idSet.has(edge.target)) {
        adjacency.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    });

    const queue = uniqueIds
      .filter((id) => (inDegree.get(id) || 0) === 0)
      .sort((a, b) => {
        const xA = layoutNodes?.[a]?.x ?? 0;
        const xB = layoutNodes?.[b]?.x ?? 0;
        return xA - xB;
      });

    const ordered: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      ordered.push(current);

      const targets = adjacency.get(current) || [];
      targets.sort((a, b) => (layoutNodes?.[a]?.x ?? 0) - (layoutNodes?.[b]?.x ?? 0));

      for (const target of targets) {
        const remaining = (inDegree.get(target) || 0) - 1;
        inDegree.set(target, remaining);
        if (remaining === 0) {
          queue.push(target);
        }
      }
    }

    const unvisited = uniqueIds.filter((id) => !ordered.includes(id));
    unvisited.sort((a, b) => (layoutNodes?.[a]?.x ?? 0) - (layoutNodes?.[b]?.x ?? 0));

    if (ordered.length > 0) {
      return [...ordered, ...unvisited];
    }
  }

  // 2. Spatial Fallback: Sort strictly by L2 Canvas X position (left to right)
  if (layoutNodes) {
    const hasCoordinates = uniqueIds.some((id) => layoutNodes[id]?.x !== undefined);
    if (hasCoordinates) {
      return [...uniqueIds].sort((a, b) => {
        const xA = layoutNodes[a]?.x ?? 0;
        const xB = layoutNodes[b]?.x ?? 0;
        return xA - xB;
      });
    }
  }

  // 3. Sequential Fallback: Follow workflowNodes order
  return orderWorkflowNodeIds(uniqueIds, workflowNodes);
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
