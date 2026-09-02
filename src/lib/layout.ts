import type { ElkExtendedEdge, LayoutOptions } from "elkjs/lib/elk-api";
import type {
  NodeLayout,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";
import { isReferenceNodeType } from "@/types/workflow";
import { getAdaptiveNodeSize, getL1FallbackColor } from "@/lib/node-layout";
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
  const COMMON_STEP_Y = 220;
  for (const node of result.children || []) {
    const current = nodes[node.id];
    if (current)
      nodes[node.id] = {
        ...current,
        x: rounded(node.x),
        y: COMMON_STEP_Y,
        width: rounded(node.width) || current.width,
        height: rounded(node.height) || current.height,
      };
  }

  // 1. Ensure Phase container exists for every L1 phase that contains L2 steps!
  const highLevelNodes = file.highLevel?.graph.nodes || [];
  const updatedGraphNodes = [...file.graph.nodes];
  const existingPhases = updatedGraphNodes.filter((n) => n.type === "phase");

  for (let index = 0; index < highLevelNodes.length; index++) {
    const hl = highLevelNodes[index];
    const linkedIds = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
    if (!linkedIds.length) continue;

    let phase = existingPhases.find(
      (node) =>
        node.title.trim().toLowerCase() === hl.title.trim().toLowerCase() ||
        linkedIds.some((id) => original[id]?.parentId === node.id),
    );

    const phaseColor =
      hl.backgroundColor && hl.backgroundColor !== "transparent"
        ? hl.backgroundColor
        : getL1FallbackColor(hl.title, index);

    const phaseId = phase?.id || `phase-${hl.id}`;
    if (!phase) {
      const newPhase = {
        id: phaseId,
        type: "phase" as const,
        title: hl.title,
        description: hl.description || `Phase frame covering ${hl.title} steps`,
        color: phaseColor,
        config: { stage: hl.title },
        conditions: [],
        documents: [],
        criteria: [],
        customFields: {},
        metadata: { workflowSection: hl.title },
      };
      phase = newPhase;
      updatedGraphNodes.push(newPhase);
      nodes[phaseId] = {
        nodeId: phaseId,
        x: 0,
        y: 0,
        width: 420,
        height: 280,
        zIndex: 0,
      };
    } else {
      phase.color = phaseColor;
    }

    // Automatically box all L2 steps belonging to this L1 phase into this Phase!
    for (const stepId of linkedIds) {
      if (!original[stepId]?.parentId) {
        original[stepId] = { ...original[stepId], parentId: phaseId };
      }
      const parentId = original[stepId]?.parentId;
      if (parentId && parentId !== phaseId) {
        const parentNode = updatedGraphNodes.find((n) => n.id === parentId);
        if (parentNode?.type === "gate") {
          original[parentNode.id] = {
            ...original[parentNode.id],
            parentId: phaseId,
          };
        }
      }
    }
  }

  const nodeMap = new Map(updatedGraphNodes.map((n) => [n.id, n]));
  const gateNodes = updatedGraphNodes.filter((n) => n.type === "gate");
  const phaseNodes = updatedGraphNodes.filter((n) => n.type === "phase");

  // 1. Position all GATE containers (aligned at top with Phase, wrapping their steps)
  for (const gate of gateNodes) {
    let gateChildren = updatedGraphNodes
      .filter((node) => original[node.id]?.parentId === gate.id)
      .map((node) => nodes[node.id])
      .filter(Boolean);

    const parentPhaseId = original[gate.id]?.parentId;
    if (gateChildren.length === 0 && parentPhaseId) {
      const phaseSteps = updatedGraphNodes
        .filter(
          (node) =>
            original[node.id]?.parentId === parentPhaseId &&
            node.type !== "gate" &&
            node.type !== "phase",
        )
        .map((node) => nodes[node.id])
        .filter(Boolean)
        .sort((a, b) => a.x - b.x);

      if (phaseSteps.length > 0) {
        gateChildren = [phaseSteps[phaseSteps.length - 1]];
      }
    }

    if (gateChildren.length > 0) {
      const minX = Math.min(...gateChildren.map((c) => c.x));
      const maxX = Math.max(
        ...gateChildren.map((c) => {
          const domain = nodeMap.get(c.nodeId);
          const w = c.width || (domain ? getAdaptiveNodeSize(domain, c).width : 280);
          return c.x + w;
        }),
      );
      const maxY = Math.max(
        ...gateChildren.map((c) => {
          const domain = nodeMap.get(c.nodeId);
          const h = c.height || (domain ? getAdaptiveNodeSize(domain, c).height : 360);
          return c.y + h;
        }),
      );

      const PAD_X = 24;
      const GATE_PAD_TOP = 200;
      const PAD_BOTTOM = 44;

      nodes[gate.id] = {
        ...nodes[gate.id],
        x: minX - PAD_X,
        y: COMMON_STEP_Y - GATE_PAD_TOP,
        width: Math.max(340, maxX - minX + PAD_X * 2),
        height: Math.max(240, maxY - (COMMON_STEP_Y - GATE_PAD_TOP) + PAD_BOTTOM),
        zIndex: 1,
      };
    }
  }

  // 2. Position all PHASE containers (enclosing both steps and nested gates)
  for (const phase of phaseNodes) {
    const memberNodes = updatedGraphNodes
      .filter((node) => {
        if (node.id === phase.id) return false;
        const pId = original[node.id]?.parentId;
        if (pId === phase.id) return true;
        if (pId && original[pId]?.parentId === phase.id) return true;
        return false;
      })
      .map((node) => nodes[node.id])
      .filter(Boolean);

    if (memberNodes.length > 0) {
      const containsGate = memberNodes.some(
        (m) => nodeMap.get(m.nodeId)?.type === "gate",
      );
      const minX = Math.min(
        ...memberNodes.map((c) => {
          const domain = nodeMap.get(c.nodeId);
          if (domain?.type === "gate" && nodes[c.nodeId]) {
            return nodes[c.nodeId].x;
          }
          return c.x;
        }),
      );
      const maxX = Math.max(
        ...memberNodes.map((c) => {
          const domain = nodeMap.get(c.nodeId);
          if (domain?.type === "gate" && nodes[c.nodeId]) {
            return nodes[c.nodeId].x + (nodes[c.nodeId].width || 340);
          }
          const w = c.width || (domain ? getAdaptiveNodeSize(domain, c).width : 280);
          return c.x + w;
        }),
      );
      const maxMemberBottom = Math.max(
        ...memberNodes.map((c) => {
          const domain = nodeMap.get(c.nodeId);
          if (domain?.type === "gate" && nodes[c.nodeId]) {
            return (nodes[c.nodeId].y ?? c.y) + (nodes[c.nodeId].height || 360);
          }
          const h = c.height || (domain ? getAdaptiveNodeSize(domain, c).height : 360);
          return c.y + h;
        }),
      );

      const PAD_X = 36;
      const PHASE_PAD_TOP = containsGate ? 360 : 180;
      const phaseY = COMMON_STEP_Y - PHASE_PAD_TOP;
      // Guarantee Phase extends at least 40px below the bottom of any member, including Gate!
      const phaseBottom = maxMemberBottom + (containsGate ? 40 : 48);

      nodes[phase.id] = {
        ...nodes[phase.id],
        x: minX - PAD_X,
        y: phaseY,
        width: Math.max(380, maxX - minX + PAD_X * 2),
        height: Math.max(280, phaseBottom - phaseY),
        zIndex: 0,
      };
    }
  }

  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: updatedGraphNodes,
      edges: normalizeGateHandles(file),
    },
    layout: {
      ...file.layout,
      nodes: restoreChildCoordinates(
        { ...file, graph: { ...file.graph, nodes: updatedGraphNodes } },
        original,
        nodes,
      ),
      // Preserve original connection lines: do not mutate or reroute them over containers!
      edges: file.layout.edges,
      viewport: file.layout.viewport,
    },
  };
}
