import type { ElkExtendedEdge, ElkPoint } from "elkjs/lib/elk-api";
import type {
  DomainEdge,
  DomainNode,
  EdgeLayout,
  NodeLayout,
  WorkflowFile,
} from "@/types/workflow";
import { requiredEdgeLabelGap } from "@/lib/layout-geometry";
import { PHASE_CONTENT_TOP } from "@/lib/node-layout";
import { SALES_MAINLINE_NODE_IDS } from "@/lib/pre-gate-sales-flow";

const rounded = (value: number | undefined) => Math.round(value || 0);
const centerY = (layout: NodeLayout) => layout.y + layout.height / 2;
const routePoints = (edge: ElkExtendedEdge): ElkPoint[] =>
  edge.sections?.flatMap((section, index) => [
    ...(index === 0 ? [section.startPoint] : []),
    ...(section.bendPoints || []),
    section.endPoint,
  ]) || [];

const PHASE_TOP = 64;

const PHASE_GAP = 240;
const GATE_CONNECTOR_GAP = 240;
const SALES_GAP = 96;
const OVERLAP_SLOP = 24;

const overlapsY = (a: NodeLayout, b: NodeLayout, slop = OVERLAP_SLOP) =>
  a.y - slop < b.y + b.height && b.y - slop < a.y + a.height;
const overlapsX = (a: NodeLayout, b: NodeLayout, slop = OVERLAP_SLOP) =>
  a.x - slop < b.x + b.width && b.x - slop < a.x + a.width;

function layoutDisplayLabel(file: WorkflowFile, edge: DomainEdge) {
  const source = file.graph.nodes.find((node) => node.id === edge.source);
  const target = file.graph.nodes.find((node) => node.id === edge.target);
  const preGateSales =
    edge.customFields.workflowSection === "Pre-Gate Sales" ||
    source?.metadata.workflowSection === "Pre-Gate Sales" ||
    target?.metadata.workflowSection === "Pre-Gate Sales" ||
    source?.type === "projectStart";
  const denied =
    !preGateSales &&
    (edge.sourceHandle?.startsWith("no") ||
      ["rework", "exception", "hold"].includes(edge.type));
  const approved =
    !preGateSales &&
    (edge.sourceHandle === "yes" || edge.type === "approval");
  return approved ? "APPROVED" : denied ? "DENIED" : edge.label ?? "";
}

function isCorridorEdge(edge: DomainEdge) {
  if (
    edge.type === "rework" ||
    edge.type === "reopen" ||
    edge.type === "supporting" ||
    edge.type === "dependency" ||
    edge.type === "failure" ||
    edge.type === "exception" ||
    edge.type === "hold"
  ) {
    return false;
  }
  if (edge.sourceHandle?.startsWith("no")) return false;
  return true;
}

function gapForLabeledPair(
  file: WorkflowFile,
  fromId: string,
  toId: string,
  axis: "horizontal" | "vertical",
  fallback: number,
) {
  const edge = file.graph.edges.find(
    (item) =>
      (item.source === fromId && item.target === toId) ||
      (item.source === toId && item.target === fromId),
  );
  if (!edge || !isCorridorEdge(edge)) return fallback;
  const label = layoutDisplayLabel(file, edge);
  if (!label.trim()) return fallback;
  return Math.max(fallback, requiredEdgeLabelGap(label, axis));
}

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
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      const next = children[index + 1];
      nodes[child.nodeId] = {
        ...child,
        x: childCursorX,
        y: childTop,
        parentId: undefined,
      };
      const gap = next
        ? gapForLabeledPair(
            file,
            child.nodeId,
            next.nodeId,
            "horizontal",
            GATE_CONNECTOR_GAP,
          )
        : GATE_CONNECTOR_GAP;
      childCursorX += child.width + gap;
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
  file: WorkflowFile,
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
  phases: DomainNode[],
  mainNodes: DomainNode[],
  projectStartNode: DomainNode | undefined,
  projectStartLayout: NodeLayout | undefined,
) {
  const mainTop = PHASE_TOP;
  const gateOne = nodes["g1-opportunity"] || original["g1-opportunity"];
  const salesMainline = SALES_MAINLINE_NODE_IDS.filter((id) => nodes[id]);
  const salesGap = (fromId: string, toId: string) =>
    gapForLabeledPair(file, fromId, toId, "horizontal", SALES_GAP);
  const salesWidth = salesMainline.reduce(
    (sum, id, index) =>
      sum +
      nodes[id].width +
      (index ? salesGap(salesMainline[index - 1], id) : 0),
    0,
  );
  const firstSalesId = salesMainline[0];
  const startToSalesGap =
    projectStartNode && firstSalesId
      ? salesGap(projectStartNode.id, firstSalesId)
      : SALES_GAP;
  const standaloneSalesStart = projectStartLayout
    ? 64 + projectStartLayout.width + startToSalesGap
    : 64;
  const lastSalesId = salesMainline.at(-1);
  const salesToGateGap =
    gateOne && lastSalesId
      ? gapForLabeledPair(file, lastSalesId, "g1-opportunity", "horizontal", 120)
      : 120;
  let salesX = gateOne
    ? gateOne.x - salesToGateGap - salesWidth
    : standaloneSalesStart;
  const salesY = gateOne?.y ?? mainTop;
  for (let index = 0; index < salesMainline.length; index++) {
    const id = salesMainline[index];
    const nextId = salesMainline[index + 1];
    nodes[id] = { ...nodes[id], x: salesX, y: salesY, parentId: undefined };
    salesX += nodes[id].width + (nextId ? salesGap(id, nextId) : 0);
  }
  const leadInquiry = nodes["lead-inquiry"];
  if (leadInquiry && projectStartNode && projectStartLayout) {
    const startGap = salesGap(projectStartNode.id, leadInquiry.nodeId);
    nodes[projectStartNode.id] = {
      ...projectStartLayout,
      x: leadInquiry.x - startGap - projectStartLayout.width,
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
      const firstDisconnected = disconnectedMainline[0];
      let disconnectedX =
        64 +
        projectStartLayout.width +
        (firstDisconnected
          ? gapForLabeledPair(
              file,
              projectStartNode.id,
              firstDisconnected.nodeId,
              "horizontal",
              144,
            )
          : 144);
      for (let index = 0; index < disconnectedMainline.length; index++) {
        const layout = disconnectedMainline[index];
        const next = disconnectedMainline[index + 1];
        nodes[layout.nodeId] = {
          ...layout,
          x: disconnectedX,
          y: mainTop,
          parentId: undefined,
        };
        disconnectedX +=
          layout.width +
          (next
            ? gapForLabeledPair(
                file,
                layout.nodeId,
                next.nodeId,
                "horizontal",
                144,
              )
            : 144);
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
  const placeNoBranch = (
    decisionId: string,
    terminalId: string,
    offsetX = 0,
  ) => {
    const decision = nodes[decisionId];
    const terminal = nodes[terminalId];
    if (!decision || !terminal) return;
    nodes[terminalId] = {
      ...terminal,
      x: decision.x + (decision.width - terminal.width) / 2 + offsetX,
      y: decision.y + decision.height + 96,
      parentId: undefined,
    };
  };
  placeNoBranch("opportunity-validation", "no-go-archive", -160);
  placeNoBranch("opportunity-validation", "hold-gap-rework", 160);
  placeNoBranch("class-d-reality-check", "no-go-archive");
  placeNoBranch("select-engagement-path", "hold-gap-rework");
  placeNoBranch("qualified-opportunity", "archive-follow-up");
  placeNoBranch("budget-fit", "hold-archive");
}

function refitPhases(
  file: WorkflowFile,
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
  phases: DomainNode[],
) {
  for (const phase of phases) {
    const children = file.graph.nodes
      .filter((node) => original[node.id]?.parentId === phase.id)
      .map((node) => nodes[node.id])
      .filter(Boolean);
    const current = nodes[phase.id];
    if (!children.length || !current) continue;
    const minX = Math.min(...children.map((child) => child.x));
    const maxX = Math.max(...children.map((child) => child.x + child.width));
    const maxBottom = Math.max(
      ...children.map((child) => child.y + child.height),
    );
    const nextX = Math.min(current.x, minX - 42);
    nodes[phase.id] = {
      ...current,
      x: nextX,
      y: PHASE_TOP,
      width: Math.max(420, maxX + 42 - nextX),
      height: Math.max(current.height, maxBottom - PHASE_TOP + 42),
      zIndex: -1,
    };
  }
}

function translateAxis(
  nodes: Record<string, NodeLayout>,
  axis: "x" | "y",
  amount: number,
  shouldMove: (layout: NodeLayout) => boolean,
) {
  if (!amount) return;
  for (const id of Object.keys(nodes)) {
    if (!shouldMove(nodes[id])) continue;
    nodes[id] = { ...nodes[id], [axis]: rounded(nodes[id][axis] + amount) };
  }
}

export function expandGapsForLabeledEdges(
  file: WorkflowFile,
  original: WorkflowFile["layout"]["nodes"],
  nodes: Record<string, NodeLayout>,
  phases: DomainNode[],
) {
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const edge of file.graph.edges) {
      if (!isCorridorEdge(edge)) continue;
      const source = nodes[edge.source];
      const target = nodes[edge.target];
      if (!source || !target) continue;
      const label = layoutDisplayLabel(file, edge);
      if (!label.trim()) continue;
      const neededH = requiredEdgeLabelGap(label, "horizontal");
      const neededV = requiredEdgeLabelGap(label, "vertical");
      if (overlapsY(source, target)) {
        const left = source.x <= target.x ? source : target;
        const right = left === source ? target : source;
        const gap = right.x - (left.x + left.width);
        const deficit = Math.ceil(neededH - gap);
        if (deficit <= 0) continue;
        const hasLeftNeighbor = Object.values(nodes).some(
          (layout) =>
            layout.nodeId !== left.nodeId &&
            overlapsY(layout, left) &&
            layout.x + layout.width <= left.x + 1,
        );
        if (!hasLeftNeighbor) {
          translateAxis(
            nodes,
            "x",
            -deficit,
            (layout) => layout.nodeId === left.nodeId,
          );
        } else {
          const threshold = right.x;
          translateAxis(
            nodes,
            "x",
            deficit,
            (layout) =>
              layout.nodeId !== left.nodeId &&
              layout.x >= threshold &&
              overlapsY(layout, right),
          );
        }
        moved = true;
      } else if (overlapsX(source, target)) {
        const top = source.y <= target.y ? source : target;
        const bottom = top === source ? target : source;
        const gap = bottom.y - (top.y + top.height);
        const deficit = Math.ceil(neededV - gap);
        if (deficit <= 0) continue;
        const hasAboveNeighbor = Object.values(nodes).some(
          (layout) =>
            layout.nodeId !== top.nodeId &&
            overlapsX(layout, top) &&
            layout.y + layout.height <= top.y + 1,
        );
        if (!hasAboveNeighbor) {
          translateAxis(
            nodes,
            "y",
            -deficit,
            (layout) => layout.nodeId === top.nodeId,
          );
        } else {
          const threshold = bottom.y;
          translateAxis(
            nodes,
            "y",
            deficit,
            (layout) =>
              layout.nodeId !== top.nodeId &&
              layout.y >= threshold &&
              overlapsX(layout, bottom),
          );
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  refitPhases(file, original, nodes, phases);
  return Math.max(
    PHASE_TOP,
    ...phases.map((phase) => {
      const layout = nodes[phase.id];
      return layout ? layout.y + layout.height : PHASE_TOP;
    }),
  );
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
      // Dynamic live routing with obstacle avoidance will compute obstacle-free paths in real-time
      continue;
    } else if (isReturn) {
      topReturnChannel -= 34;
      const sourceX = source.x + source.width;
      const targetType = file.graph.nodes.find(
        (node) => node.id === edge.target,
      )?.type;
      const targetX =
        target.x + target.width * (targetType === "gate" ? 0.78 : 0.5);
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
    const deniedReturn =
      edge.type === "rework" || sourceHandle?.startsWith("no");
    const preGateSales =
      edge.customFields.workflowSection === "Pre-Gate Sales";
    const targetHandle =
      deniedReturn && !preGateSales
        ? "rework-in"
        : edge.targetHandle || "in";
    return { ...edge, sourceHandle, targetHandle };
  });
}
