import type {
  ElkExtendedEdge,
  ElkNode,
  ElkPoint,
  LayoutOptions,
} from "elkjs/lib/elk-api";
import type {
  EdgeLayout,
  NodeLayout,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";
import { getAdaptiveNodeSize, PHASE_CONTENT_TOP } from "@/lib/node-layout";
import { PRE_GATE_SALES_NODES } from "@/lib/pre-gate-sales-flow";

// `unnecessaryBendpoints` is missing from elkjs' typed `LayoutOptions`; cast
// through `Record<string, unknown>` so the option actually reaches ELK.
const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "80",
  "elk.spacing.edgeEdge": "24",
  "elk.spacing.edgeNode": "64",
  "elk.layered.spacing.nodeNodeBetweenLayers": "440",
  "elk.layered.spacing.edgeNodeBetweenLayers": "80",
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
const referenceTypes = new Set<WorkflowNodeType>();
const secondaryEdges = new Set([
  "supporting",
  "dependency",
  "rework",
  "reopen",
]);
const rounded = (value: number | undefined) => Math.round(value || 0);
const routePoints = (edge: ElkExtendedEdge): ElkPoint[] =>
  edge.sections?.flatMap((section, index) => [
    ...(index === 0 ? [section.startPoint] : []),
    ...(section.bendPoints || []),
    section.endPoint,
  ]) || [];
const centerY = (layout: NodeLayout) => layout.y + layout.height / 2;
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
  const absolute = (
    id: string,
    seen = new Set<string>(),
  ): { x: number; y: number } => {
    const layout = original[id];
    if (!layout || !layout.parentId || seen.has(id))
      return { x: layout?.x || 0, y: layout?.y || 0 };
    seen.add(id);
    const parent = absolute(layout.parentId, seen);
    return { x: parent.x + layout.x, y: parent.y + layout.y };
  };
  const nodes: Record<string, NodeLayout> = Object.fromEntries(
    file.graph.nodes.map((node) => {
      const current = original[node.id];
      const position = absolute(node.id);
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

  const preGateSalesIds = new Set(PRE_GATE_SALES_NODES.map((node) => node.id));
  const mainNodes = file.graph.nodes.filter(
    (node) =>
      node.type !== "phase" &&
      !referenceTypes.has(node.type) &&
      !legacyAuxiliaryTypes.has(node.type) &&
      !preGateSalesIds.has(node.id),
  );
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
  const graph: ElkNode = {
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

  // Treat every Phase as one rigid visual group. ELK lays out individual Gates,
  // which can otherwise leave a restored/locked Phase overlapping its neighbour.
  // Repack the groups left-to-right using their measured child bounds.
  const phaseIds = new Set(
    file.graph.nodes
      .filter((node) => node.type === "phase")
      .map((node) => node.id),
  );
  const phases = file.graph.nodes.filter((node) => node.type === "phase");
  const phaseTop = 64;
  const childTop = phaseTop + PHASE_CONTENT_TOP;
  // Forward approval labels sit on the connector between Gate cards. Reserve
  // enough horizontal room for the full label at normal canvas zoom.
  const phaseGap = 240;
  const gateConnectorGap = 240;
  let phaseCursorX = 64;
  let groupBottom = childTop;
  for (const phase of phases) {
    const children = file.graph.nodes
      .filter((node) => original[node.id]?.parentId === phase.id)
      .map((node) => nodes[node.id])
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (!children.length) continue;
    let childCursorX = phaseCursorX + 42;
    let phaseBottom = childTop;
    for (const child of children) {
      nodes[child.nodeId] = {
        ...child,
        x: childCursorX,
        y: childTop,
        parentId: undefined,
      };
      childCursorX += child.width + gateConnectorGap;
      phaseBottom = Math.max(phaseBottom, childTop + child.height);
    }
    const phaseWidth = Math.max(420, childCursorX - phaseCursorX - 78);
    const phaseHeight = phaseBottom - phaseTop + 42;
    nodes[phase.id] = {
      ...nodes[phase.id],
      x: phaseCursorX,
      y: phaseTop,
      width: phaseWidth,
      height: phaseHeight,
      zIndex: -1,
    };
    phaseCursorX += phaseWidth + phaseGap;
    groupBottom = Math.max(groupBottom, phaseTop + phaseHeight);
  }

  const mainTop = phaseTop;

  let referenceY = groupBottom + 140;
  for (const node of file.graph.nodes.filter(
    (item) =>
      referenceTypes.has(item.type) || legacyAuxiliaryTypes.has(item.type),
  )) {
    const current = nodes[node.id];
    nodes[node.id] = { ...current, x: 72, y: referenceY };
    referenceY += current.height + 72;
  }

  // The sales intake is a prescribed business sequence leading into Gate 01,
  // so it must not be shuffled by the generic graph layout. Keep the main path
  // in one left-to-right row and place each NO terminal below its decision.
  const gateOne = nodes["g1-opportunity"] || original["g1-opportunity"];
  const salesMainline = [
    "lead-inquiry",
    "sales-intake",
    "basic-client-project-info",
    "qualified-opportunity",
    "collect-plans-scope-site",
    "quick-class-d-benchmark",
    "budget-fit",
    "select-engagement-path",
    "engagement-approval",
  ].filter((id) => nodes[id]);
  const salesGap = 96;
  const salesWidth = salesMainline.reduce(
    (sum, id, index) => sum + nodes[id].width + (index ? salesGap : 0),
    0,
  );
  const projectStartNode = file.graph.nodes.find(
    (node) =>
      node.type === "projectStart" &&
      file.graph.edges.some(
        (edge) => edge.source === node.id && edge.target === "lead-inquiry",
      ),
  ) ?? file.graph.nodes.find((node) => node.type === "projectStart");
  const projectStartLayout = projectStartNode
    ? nodes[projectStartNode.id]
    : undefined;
  const standaloneSalesStart = projectStartLayout
    ? 64 + projectStartLayout.width + salesGap
    : 64;
  let salesX = gateOne ? gateOne.x - 120 - salesWidth : standaloneSalesStart;
  const salesY = gateOne?.y ?? mainTop;
  for (const id of salesMainline) {
    nodes[id] = { ...nodes[id], x: salesX, y: salesY, parentId: undefined };
    salesX += nodes[id].width + salesGap;
  }
  const leadInquiry = nodes["lead-inquiry"];
  if (leadInquiry && projectStartNode && projectStartLayout) {
    nodes[projectStartNode.id] = {
      ...projectStartLayout,
      x: leadInquiry.x - salesGap - projectStartLayout.width,
      y: salesY,
      parentId: undefined,
    };
  } else if (projectStartNode && projectStartLayout) {
    // A blank/new project has no edges yet. ELK is free to order disconnected
    // nodes arbitrarily, so explicitly keep the mandatory Project Start first.
    const disconnectedMainline = mainNodes
      .filter((node) => node.id !== projectStartNode.id)
      .map((node) => nodes[node.id])
      .filter(Boolean)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    nodes[projectStartNode.id] = {
      ...projectStartLayout,
      x: 64,
      y: mainTop,
      parentId: undefined,
    };
    let disconnectedX = 64 + projectStartLayout.width + 144;
    for (const layout of disconnectedMainline) {
      nodes[layout.nodeId] = {
        ...layout,
        x: disconnectedX,
        y: mainTop,
        parentId: undefined,
      };
      disconnectedX += layout.width + 144;
    }
  }

  // Empty Phase containers have no children for the Phase packer to anchor.
  // Place them after the arranged workflow instead of leaving their old
  // coordinates where they can overlap newly arranged cards.
  let emptyPhaseX =
    Math.max(
      64,
      ...Object.values(nodes)
        .filter((layout) => !phaseIds.has(layout.nodeId))
        .map((layout) => layout.x + layout.width),
    ) + 180;
  for (const phase of phases.filter(
    (item) =>
      !file.graph.nodes.some(
        (node) => original[node.id]?.parentId === item.id,
      ),
  )) {
    const current = nodes[phase.id];
    nodes[phase.id] = {
      ...current,
      x: emptyPhaseX,
      y: phaseTop,
      width: Math.max(420, current.width),
      height: Math.max(260, current.height),
      parentId: undefined,
      zIndex: -1,
    };
    emptyPhaseX += Math.max(420, current.width) + phaseGap;
  }
  const placeNoBranch = (decisionId: string, terminalId: string) => {
    const decision = nodes[decisionId];
    const terminal = nodes[terminalId];
    if (!decision || !terminal) return;
    nodes[terminalId] = {
      ...terminal,
      x: decision.x + (decision.width - terminal.width) / 2,
      y: decision.y + decision.height + 112,
      parentId: undefined,
    };
  };
  placeNoBranch("qualified-opportunity", "archive-follow-up");
  placeNoBranch("budget-fit", "hold-archive");

  const edges: Record<string, EdgeLayout> = {};
  for (const edge of (result.edges || []) as ElkExtendedEdge[]) {
    const points = routePoints(edge).map((point) => ({
      x: rounded(point.x),
      y: rounded(point.y),
    }));
    if (points.length >= 2) edges[edge.id] = { edgeId: edge.id, points };
  }
  let topReturnChannel = mainTop - 58;
  let bottomChannel = groupBottom + 54;
  for (const edge of file.graph.edges.filter((item) => !edges[item.id])) {
    const source = nodes[edge.source],
      target = nodes[edge.target];
    if (!source || !target) continue;
    const projectStartEdge =
      source &&
      file.graph.nodes.find((node) => node.id === edge.source)?.type ===
        "projectStart";
    const preGateSales =
      edge.customFields.workflowSection === "Pre-Gate Sales" ||
      projectStartEdge;
    const isReturn =
      edge.type === "rework" ||
      edge.type === "reopen" ||
      edge.sourceHandle?.startsWith("no");
    if (preGateSales) {
      const sourcePoint = { x: source.x + source.width, y: centerY(source) };
      const targetPoint = { x: target.x, y: centerY(target) };
      const noRoute = edge.sourceHandle === "no";
      const middleX = noRoute
        ? sourcePoint.x + 34
        : (sourcePoint.x + targetPoint.x) / 2;
      edges[edge.id] = {
        edgeId: edge.id,
        points: noRoute
          ? [
              sourcePoint,
              { x: middleX, y: sourcePoint.y },
              { x: middleX, y: target.y + target.height + 48 },
              { x: target.x - 44, y: target.y + target.height + 48 },
              { x: target.x - 44, y: targetPoint.y },
              targetPoint,
            ]
          : [
              sourcePoint,
              { x: middleX, y: sourcePoint.y },
              { x: middleX, y: targetPoint.y },
              targetPoint,
            ],
      };
    } else if (isReturn) {
      topReturnChannel -= 34;
      const sourceX = source.x + source.width;
      const targetX = target.x + target.width * 0.78;
      edges[edge.id] = {
        edgeId: edge.id,
        points: [
          { x: sourceX, y: centerY(source) },
          { x: sourceX + 52, y: centerY(source) },
          { x: sourceX + 52, y: topReturnChannel },
          { x: targetX, y: topReturnChannel },
          { x: targetX, y: target.y },
        ],
      };
    } else if (edge.type === "supporting" || edge.type === "dependency") {
      const sourceX = source.x + source.width / 2,
        targetX = target.x + target.width / 2;
      const corridorY = Math.min(source.y, target.y) - 46;
      edges[edge.id] = {
        edgeId: edge.id,
        points: [
          { x: sourceX, y: source.y },
          { x: sourceX, y: corridorY },
          { x: targetX, y: corridorY },
          { x: targetX, y: target.y },
        ],
      };
    } else {
      bottomChannel += 32;
      edges[edge.id] = {
        edgeId: edge.id,
        points: [
          { x: source.x + source.width, y: centerY(source) },
          { x: source.x + source.width + 48, y: centerY(source) },
          { x: source.x + source.width + 48, y: bottomChannel },
          { x: target.x + target.width / 2, y: bottomChannel },
          { x: target.x + target.width / 2, y: target.y + target.height },
        ],
      };
    }
  }

  const renderedNodes = { ...nodes };
  for (const node of file.graph.nodes) {
    const parentId = original[node.id]?.parentId;
    if (!parentId || !nodes[parentId]) continue;
    renderedNodes[node.id] = {
      ...nodes[node.id],
      x: nodes[node.id].x - nodes[parentId].x,
      y: nodes[node.id].y - nodes[parentId].y,
      parentId,
      zIndex: 1,
    };
  }
  const graphEdges = file.graph.edges.map((edge) => {
    const source = file.graph.nodes.find((node) => node.id === edge.source);
    const target = file.graph.nodes.find((node) => node.id === edge.target);
    const sourceHandle =
      source?.type === "gate"
        ? source.config.outcomes?.some(
            (outcome) => outcome.id === edge.sourceHandle,
          )
          ? edge.sourceHandle
          : edge.sourceHandle?.startsWith("no")
            ? "no"
            : "yes"
        : edge.sourceHandle || "out";
    const targetHandle =
      target?.type === "gate" &&
      (edge.type === "rework" || sourceHandle?.startsWith("no"))
        ? "rework-in"
        : "in";
    return { ...edge, sourceHandle, targetHandle };
  });
  return {
    ...file,
    graph: { ...file.graph, edges: graphEdges },
    layout: {
      ...file.layout,
      nodes: renderedNodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  };
}
