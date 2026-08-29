import {
  CircleCheck,
  CircleDot,
  Layers3,
  Milestone,
  type LucideIcon,
} from "lucide-react";
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
  if (node.type === "opportunityValidation") return [1, 0, index] as const;
  const number = conditionNumber(node.title);
  if (number !== undefined) return [2, number, index] as const;
  return [3, index, index] as const;
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
) {
  return orderWorkflowNodeIds(linkedIds || [], workflowNodes);
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
    type: "primaryGate",
    label: "Primary Gate",
    description: "Primary transition point",
    icon: Milestone,
    color: "#2563a9",
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
): HighLevelNode => ({ id, type, title, description });

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
      title: "PROJECT START",
      description: "Project intake, identification, and client relationship baseline.",
    },
    {
      type: "phase",
      title: "OPPORTUNITY & QUALIFICATION",
      description: "Sequential 6-step qualification, LOI governance, and Gate 1 dossier handoff.",
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
    const width = node.type === "phase" ? 288 : 208;
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
    if (type === "phase") return 288;
    if (type === "primaryGate") return 208;
    return 208;
  };
  let x = 0;
  const nodes = Object.fromEntries(
    highLevel.graph.nodes.map((node) => {
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
