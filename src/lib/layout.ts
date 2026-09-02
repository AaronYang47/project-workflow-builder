import type { ElkExtendedEdge, LayoutOptions } from "elkjs/lib/elk-api";
import type {
  NodeLayout,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";
import { isReferenceNodeType } from "@/types/workflow";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { absoluteLayoutPosition } from "@/lib/layout-geometry";
import {
  expandGapsForLabeledEdges,
  normalizeGateHandles,
  packPhases,
  placeDecorativeReferences,
  placeEmptyPhases,
  placeBranchNodes,
  placeProjectStart,
  restoreChildCoordinates,
  routeRemainingEdges,
} from "@/lib/layout-pack";

// `unnecessaryBendpoints` is missing from elkjs' typed `LayoutOptions`; cast
// through `Record<string, unknown>` so the option actually reaches ELK.
const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "60",
  "elk.spacing.edgeEdge": "16",
  "elk.spacing.edgeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "280",
  "elk.layered.spacing.edgeNodeBetweenLayers": "40",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.unnecessaryBendpoints": "false",
  "elk.padding": "[top=96,left=72,bottom=72,right=72]",
} as unknown as LayoutOptions;

const legacyAuxiliaryTypes = new Set<WorkflowNodeType>([
  "document",
  "documentGroup",
  "note",
]);
const isDecorativeReference = (type: WorkflowNodeType) =>
  isReferenceNodeType(type) && type !== "terminal";
const secondaryEdges = new Set([
  "supporting",
  "dependency",
  "rework",
  "reopen",
]);
const rounded = (value: number | undefined) => Math.round(value || 0);
const sizeForAutoLayout = (
  node: WorkflowFile["graph"]["nodes"][number],
  current?: NodeLayout,
) => {
  const adaptive = getAdaptiveNodeSize(node, current);
  // Gate heights are measured from their rendered Approval Conditions content.
  // Preserve that authoritative height when arranging instead of replacing it
  // with the pre-render estimate.
  return node.type === "gate" && current
    ? { width: adaptive.width, height: current.height }
    : adaptive;
};

export async function autoLayout(file: WorkflowFile): Promise<WorkflowFile> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const elk = new ELK();
  const original = file.layout.nodes;
  const nodes: Record<string, NodeLayout> = Object.fromEntries(
    file.graph.nodes.map((node) => {
      const current = original[node.id];
      const position = absoluteLayoutPosition(original, node.id);
      const size = sizeForAutoLayout(node, current);
      return [
        node.id,
        {
          ...current,
          nodeId: node.id,
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          parentId: undefined,
        },
      ];
    }),
  );

  const containerIds = new Set(
    file.graph.nodes
      .filter((node) => node.type === "phase" || node.type === "gate")
      .map((node) => node.id),
  );
  const isContainerChild = (id: string) => {
    const parentId = original[id]?.parentId;
    return Boolean(parentId && containerIds.has(parentId));
  };
  const mainNodes = file.graph.nodes.filter((node) => {
    if (node.type === "phase" || node.type === "gate") return false;
    if (legacyAuxiliaryTypes.has(node.type)) return false;
    if (isDecorativeReference(node.type) && !isContainerChild(node.id))
      return false;
    return true;
  });
  const mainIds = new Set(mainNodes.map((node) => node.id));
  const mainEdges = file.graph.edges.filter((edge) => {
    const source = file.graph.nodes.find((node) => node.id === edge.source);
    return (
      mainIds.has(edge.source) &&
      mainIds.has(edge.target) &&
      !secondaryEdges.has(edge.type) &&
      (source?.type !== "gate" || edge.sourceHandle === "yes")
    );
  });
  const graph = {
    id: "workflow-mainline",
    layoutOptions,
    children: mainNodes.map((node) => {
      const size = sizeForAutoLayout(node, nodes[node.id]);
      return { id: node.id, width: size.width, height: size.height };
    }),
    edges: mainEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
  const result = await elk.layout(graph);
  for (const node of result.children || []) {
    const current = nodes[node.id];
    if (current)
      nodes[node.id] = {
        ...current,
        x: rounded(node.x),
        y: rounded(node.y),
        width: rounded(node.width) || current.width,
        height: rounded(node.height) || current.height,
      };
  }

  // Auto-fit all Gate and Phase container bounds around their children
  const containers = file.graph.nodes.filter(
    (n) => n.type === "gate" || n.type === "phase",
  );
  const sortedContainers = [...containers].sort((a, b) =>
    a.type === "gate" ? -1 : 1,
  );
  for (const container of sortedContainers) {
    const children = file.graph.nodes
      .filter((node) => original[node.id]?.parentId === container.id)
      .map((node) => nodes[node.id])
      .filter(Boolean);
    if (!children.length) continue;

    const minX = Math.min(...children.map((c) => c.x));
    const maxX = Math.max(...children.map((c) => c.x + (c.width || 270)));
    const minY = Math.min(...children.map((c) => c.y));
    const maxY = Math.max(...children.map((c) => c.y + (c.height || 220)));

    const PAD_X = 40;
    const PAD_TOP = 136;
    const PAD_BOTTOM = 44;

    nodes[container.id] = {
      ...nodes[container.id],
      x: minX - PAD_X,
      y: minY - PAD_TOP,
      width: Math.max(360, maxX - minX + PAD_X * 2),
      height: Math.max(200, maxY - minY + PAD_TOP + PAD_BOTTOM),
      zIndex: 0,
    };
  }

  const phases = file.graph.nodes.filter((node) => node.type === "phase");
  const groupBottom = Math.max(
    ...Object.values(nodes).map((n) => n.y + (n.height || 200)),
    300,
  );
  const packedBottom = expandGapsForLabeledEdges(file, original, nodes, phases);
  const layoutBottom = Math.max(groupBottom, packedBottom);
  placeDecorativeReferences(
    file,
    nodes,
    layoutBottom,
    isContainerChild,
    isDecorativeReference,
    legacyAuxiliaryTypes,
  );
  const edges = routeRemainingEdges(
    file,
    nodes,
    (result.edges || []) as ElkExtendedEdge[],
    layoutBottom,
  );

  return {
    ...file,
    graph: { ...file.graph, edges: normalizeGateHandles(file) },
    layout: {
      ...file.layout,
      nodes: restoreChildCoordinates(file, original, nodes),
      edges,
      viewport: file.layout.viewport,
    },
  };
}
