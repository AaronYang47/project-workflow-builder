import type { ElkExtendedEdge, ElkPoint } from "elkjs/lib/elk-api";
import type {
  DomainNode,
  EdgeLayout,
  NodeLayout,
  WorkflowFile,
} from "@/types/workflow";
import { PHASE_CONTENT_TOP } from "@/lib/node-layout";

const rounded = (value: number | undefined) => Math.round(value || 0);
const centerY = (layout: NodeLayout) => layout.y + layout.height / 2;
const routePoints = (edge: ElkExtendedEdge): ElkPoint[] =>
  edge.sections?.flatMap((section, index) => [
    ...(index === 0 ? [section.startPoint] : []),
    ...(section.bendPoints || []),
    section.endPoint,
  ]) || [];

const SALES_MAINLINE = [
  "lead-inquiry",
  "sales-intake",
  "basic-client-project-info",
  "qualified-opportunity",
  "collect-plans-scope-site",
  "quick-class-d-benchmark",
  "budget-fit",
  "select-engagement-path",
  "engagement-approval",
] as const;

const PHASE_TOP = 64;
const PHASE_GAP = 240;
const GATE_CONNECTOR_GAP = 240;
const SALES_GAP = 96;

export function restoreChildCoordinates(
  file: WorkflowFile,
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
) {
  const rendered = { ...nodes };
  for (const node of file.graph.nodes) {
    const parentId = original[node.id]?.parentId;
    if (!parentId || !nodes[parentId]) continue;
    rendered[node.id] = {
      ...nodes[node.id],
      x: nodes[node.id].x - nodes[parentId].x,
      y: nodes[node.id].y - nodes[parentId].y,
      parentId,
      zIndex: 1,
    };
  }
  return rendered;
}

export function packPhases(
  file: WorkflowFile,
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
  phases: DomainNode[],
) {
  const childTop = PHASE_TOP + PHASE_CONTENT_TOP;
  const hasSalesPath = Boolean(nodes["lead-inquiry"]);
  const projectStartNode =
    file.graph.nodes.find(
      (node) =>
        node.type === "projectStart" &&
        file.graph.edges.some(
          (edge) => edge.source === node.id && edge.target === "lead-inquiry",
        ),
    ) ?? file.graph.nodes.find((node) => node.type === "projectStart");
  const projectStartLayout = projectStartNode
    ? nodes[projectStartNode.id]
    : undefined;
  let phaseCursorX =
    !hasSalesPath && projectStartLayout
      ? 64 + projectStartLayout.width + 144
      : 64;
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
      childCursorX += child.width + GATE_CONNECTOR_GAP;
      phaseBottom = Math.max(phaseBottom, childTop + child.height);
    }
    const phaseWidth = Math.max(420, childCursorX - phaseCursorX - 78);
    const phaseHeight = phaseBottom - PHASE_TOP + 42;
    nodes[phase.id] = {
      ...nodes[phase.id],
      x: phaseCursorX,
      y: PHASE_TOP,
      width: phaseWidth,
      height: phaseHeight,
      zIndex: -1,
    };
    phaseCursorX += phaseWidth + PHASE_GAP;
    groupBottom = Math.max(groupBottom, PHASE_TOP + phaseHeight);
  }
  return { groupBottom, projectStartNode, projectStartLayout };
}

export function placeDecorativeReferences(
  file: WorkflowFile,
  nodes: Record<string, NodeLayout>,
  groupBottom: number,
  isPhaseChild: (id: string) => boolean,
  isDecorative: (type: DomainNode["type"]) => boolean,
  legacyAuxiliaryTypes: Set<DomainNode["type"]>,
) {
  let referenceY = groupBottom + 140;
  for (const node of file.graph.nodes.filter(
    (item) =>
      !isPhaseChild(item.id) &&
      (isDecorative(item.type) || legacyAuxiliaryTypes.has(item.type)),
  )) {
    const current = nodes[node.id];
    nodes[node.id] = { ...current, x: 72, y: referenceY };
    referenceY += current.height + 72;
  }
}

export function placeSalesIntake(
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
  phases: DomainNode[],
  mainNodes: DomainNode[],
  projectStartNode: DomainNode | undefined,
  projectStartLayout: NodeLayout | undefined,
) {
  const mainTop = PHASE_TOP;
  const gateOne = nodes["g1-opportunity"] || original["g1-opportunity"];
  const salesMainline = SALES_MAINLINE.filter((id) => nodes[id]);
  const salesWidth = salesMainline.reduce(
    (sum, id, index) => sum + nodes[id].width + (index ? SALES_GAP : 0),
    0,
  );
  const standaloneSalesStart = projectStartLayout
    ? 64 + projectStartLayout.width + SALES_GAP
    : 64;
  let salesX = gateOne ? gateOne.x - 120 - salesWidth : standaloneSalesStart;
  const salesY = gateOne?.y ?? mainTop;
  for (const id of salesMainline) {
    nodes[id] = { ...nodes[id], x: salesX, y: salesY, parentId: undefined };
    salesX += nodes[id].width + SALES_GAP;
  }
  const leadInquiry = nodes["lead-inquiry"];
  if (leadInquiry && projectStartNode && projectStartLayout) {
    nodes[projectStartNode.id] = {
      ...projectStartLayout,
      x: leadInquiry.x - SALES_GAP - projectStartLayout.width,
      y: salesY,
      parentId: undefined,
    };
  } else if (projectStartNode && projectStartLayout) {
    const firstPhase = phases[0] ? nodes[phases[0].id] : undefined;
    nodes[projectStartNode.id] = {
      ...projectStartLayout,
      x: 64,
      y: firstPhase?.y ?? mainTop,
      parentId: undefined,
    };
    if (!phases.length) {
      const disconnectedMainline = mainNodes
        .filter((node) => node.id !== projectStartNode.id)
        .map((node) => nodes[node.id])
        .filter(Boolean)
        .sort((a, b) => a.x - b.x || a.y - b.y);
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
  }
}

export function placeEmptyPhases(
  file: WorkflowFile,
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
  phases: DomainNode[],
  phaseIds: Set<string>,
) {
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
      y: PHASE_TOP,
      width: Math.max(420, current.width),
      height: Math.max(260, current.height),
      parentId: undefined,
      zIndex: -1,
    };
    emptyPhaseX += Math.max(420, current.width) + PHASE_GAP;
  }
}

export function placeNoBranches(nodes: Record<string, NodeLayout>) {
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
}

export function routeRemainingEdges(
  file: WorkflowFile,
  nodes: Record<string, NodeLayout>,
  elkEdges: ElkExtendedEdge[],
  groupBottom: number,
) {
  const edges: Record<string, EdgeLayout> = {};
  for (const edge of elkEdges) {
    const points = routePoints(edge).map((point) => ({
      x: rounded(point.x),
      y: rounded(point.y),
    }));
    if (points.length >= 2) edges[edge.id] = { edgeId: edge.id, points };
  }
  let topReturnChannel = PHASE_TOP - 58;
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
  return edges;
}

export function normalizeGateHandles(file: WorkflowFile) {
  return file.graph.edges.map((edge) => {
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
}
