/**
 * Process Locator (pyramid) model: card measurement, flow status, L1/L2/L3 grouping, edge routing and camera math. Pure functions only; the React widget lives in components/workflow/pyramid-location-widget.tsx.
 */
import { orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { getNodeDefinition } from "@/lib/node-catalog";
import { nodeReleaseReady, nodeStatusLabel } from "@/lib/workflow-progress";
import { chapterLabel } from "@/lib/chapter-label";
import { isReferenceNodeType, type DomainNode, type ExecutionItem, type HighLevelNode } from "@/types/workflow";

export type Layer = "L1" | "L2" | "L3";
export type ViewLayer = Layer;
export type PyramidCard = {
  id: string;
  layer: Layer;
  label: string;
  subtitle: string;
  nodeId?: string;
  conditionId?: string;
};
export type FlowStatus = "open" | "current" | "blocked" | "locked";
export type PositionedCard = PyramidCard & {
  x: number;
  y: number;
  width: number;
  height: number;
  current: boolean;
  breathe: boolean;
  status: FlowStatus;
};
export type PyramidEdge = {
  id: string;
  from: PositionedCard;
  to: PositionedCard;
  flowing: boolean;
  direction: "down" | "across";
  path: string;
};
export const L1_GAP = 96;
export const L2_GAP = 64;
export const V_GAP = 96;
export const L1_ACTION_GAP = 8;
export const L1_ACTION_H = 28;
export const L2_ACTION_GAP = 8;
export const L2_ACTION_H = 26;
export const L3_STACK_GAP = 28;
export const L3_GAP = 32;
export const PAD = 28;
export const LAYER_RAIL = 134;
export const CORNER = 10;
export const CHANNEL = 24;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.8;
export const FIT_PAD = 48;
export const ZOOM_STEP = 1.15;
export const ZOOM_WHEEL_SENSITIVITY = 0.0011;
export const ZOOM_ANIMATION_MS = 180;
export type Camera = { x: number; y: number; zoom: number };
export type DockCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const DOCK_INSET = 16;
export const DOCK_SNAP_PX = 140;
export const DOCK_DRAG_THRESHOLD = 5;
export const DOCK_STORAGE_KEY = "pwb.process-locator.dock";
export const DOCK_CORNERS: DockCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
export function isDockCorner(value: string | null): value is DockCorner {
  return Boolean(value && DOCK_CORNERS.includes(value as DockCorner));
}
export function readDockCorner(): DockCorner {
  if (typeof window === "undefined") return "bottom-left";
  try {
    const stored = window.localStorage.getItem(DOCK_STORAGE_KEY);
    return isDockCorner(stored) ? stored : "bottom-left";
  } catch {
    return "bottom-left";
  }
}
export function writeDockCorner(corner: DockCorner) {
  try {
    window.localStorage.setItem(DOCK_STORAGE_KEY, corner);
  } catch {
    /* ignore quota / private mode */
  }
}
export function cornerAnchor(corner: DockCorner, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: corner.endsWith("left") ? DOCK_INSET : vw - width - DOCK_INSET,
    y: corner.startsWith("top") ? DOCK_INSET : vh - height - DOCK_INSET,
  };
}
export function nearestDockCorner(x: number, y: number, width: number, height: number) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  let best: DockCorner = "bottom-left";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const corner of DOCK_CORNERS) {
    const anchor = cornerAnchor(corner, width, height);
    const dist = Math.hypot(cx - (anchor.x + width / 2), cy - (anchor.y + height / 2));
    if (dist < bestDist) {
      best = corner;
      bestDist = dist;
    }
  }
  return { corner: best, distance: bestDist };
}
export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
export function cameraAtPoint(camera: Camera, zoom: number, point: { x: number; y: number }): Camera {
  const worldX = (point.x - camera.x) / camera.zoom;
  const worldY = (point.y - camera.y) / camera.zoom;
  return {
    zoom,
    x: point.x - worldX * zoom,
    y: point.y - worldY * zoom,
  };
}
export function fitCamera(
  frameWidth: number,
  frameHeight: number,
  diagramWidth: number,
  diagramHeight: number,
): Camera {
  if (!frameWidth || !frameHeight || !diagramWidth || !diagramHeight) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = clampZoom(
    Math.min(
      (frameWidth - FIT_PAD) / diagramWidth,
      (frameHeight - FIT_PAD) / diagramHeight,
    ),
  );
  return {
    zoom,
    x: (frameWidth - diagramWidth * zoom) / 2,
    y: (frameHeight - diagramHeight * zoom) / 2,
  };
}
export function measureCard(card: PyramidCard) {
  const minWidth = card.layer === "L1" ? 248 : card.layer === "L2" ? 220 : 236;
  const maxWidth = 320;
  const width = Math.min(
    maxWidth,
    Math.max(
      minWidth,
      56 + Math.ceil(Math.max(card.label.length * 8.4, card.subtitle.length * 7.2)),
    ),
  );
  const inner = Math.max(96, width - 24);
  const titleLines = Math.max(1, Math.min(2, Math.ceil((card.label.length * 8) / inner)));
  const subtitleLines = Math.max(1, Math.min(2, Math.ceil((card.subtitle.length * 6.8) / inner)));
  const height = 18 + 18 + titleLines * 20 + subtitleLines * 16 + 18;
  return { width, height };
}
export function l2FlowStatus(
  layer2Id: string,
  nodes: DomainNode[],
  reachedNodeIds: Set<string>,
  executionItems: ExecutionItem[],
  operations?: import("@/types/project-operations").ProjectOperations,
): FlowStatus {
  const node = nodes.find((item) => item.id === layer2Id);
  if (!node) return "locked";
  const projectStart = nodes.find((item) => item.type === "projectStart");
  const reached = reachedNodeIds.has(node.id);
  const ready = nodeReleaseReady(node, projectStart, executionItems, operations);
  if (reached && ready) return "open";
  if (reached && !ready) {
    return nodeStatusLabel(node, projectStart, executionItems, operations) === "Blocked"
      ? "blocked"
      : "current";
  }
  return "locked";
}
export function l1FlowStatus(branches: L2Branch[], statuses: Map<string, FlowStatus>): FlowStatus {
  if (!branches.length) return "locked";
  const child = branches.map((branch) => statuses.get(branch.l2.id) || "locked");
  if (child.every((status) => status === "open")) return "open";
  if (child.some((status) => status === "blocked")) return "blocked";
  if (child.some((status) => status === "current" || status === "open")) return "current";
  return "locked";
}
export function edgeFlows(from: FlowStatus, to: FlowStatus) {
  return from === "open" && (to === "open" || to === "current");
}
export const UNLINKED_L1_ID = "__unlinked-l2__";
export function linkedIds(node: HighLevelNode) {
  return node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [];
}
export type L2Branch = {
  l2: PyramidCard;
  l3: PyramidCard[];
};
export function isWorkflowL2(node: DomainNode) {
  return node.type !== "phase" && !isReferenceNodeType(node.type);
}
export function l2Subtitle(node: DomainNode) {
  if (node.description?.trim()) return node.description.trim();
  if (
    node.config?.stage &&
    typeof node.config.stage === "string" &&
    node.config.stage.trim()
  ) {
    return chapterLabel(node.config.stage);
  }
  if (node.type === "projectStart") return "Project Start";
  if (node.type === "gate") return "Gate";
  return getNodeDefinition(node.type).label;
}
export function l2CardFromNode(node: DomainNode): PyramidCard {
  return {
    id: node.id,
    layer: "L2",
    label: node.title?.trim() || getNodeDefinition(node.type).label,
    subtitle: l2Subtitle(node),
  };
}
export function branchForLayer2(
  layer2Id: string,
  nodes: DomainNode[],
): L2Branch {
  const node = nodes.find((item) => item.id === layer2Id);
  const l2Card: PyramidCard = node
    ? l2CardFromNode(node)
    : {
        id: layer2Id,
        layer: "L2",
        label: layer2Id.replace(/[-_]/g, " "),
        subtitle: "L2 node",
      };

  let l3Cards: PyramidCard[] = [];
  if (node && node.conditions && node.conditions.length > 0) {
    l3Cards = node.conditions.map((c, i) => ({
      id: `${node.id}-${c.id || `c-${i}`}`,
      layer: "L3" as const,
      label: c.label?.trim() || `Condition ${i + 1}`,
      subtitle: c.checked
        ? "Condition Passed"
        : c.description?.trim() || (c.required ? "Required Form" : "Optional Form"),
      nodeId: node.id,
      conditionId: c.id,
    }));
  } else if (node) {
    l3Cards = [
      {
        id: `${node.id}-legal`,
        layer: "L3" as const,
        label: "Required Documents",
        subtitle: "Contracts, deeds & permits",
        nodeId: node.id,
      },
      {
        id: `${node.id}-customer`,
        layer: "L3" as const,
        label: "Customer Information",
        subtitle: "Specs & authorizations",
        nodeId: node.id,
      },
      {
        id: `${node.id}-supporting`,
        layer: "L3" as const,
        label: "Supporting Documents",
        subtitle: "Drawings & calculations",
        nodeId: node.id,
      },
    ];
  }

  return {
    l2: l2Card,
    l3: l3Cards,
  };
}
export function l1CardFromHighLevel(node: HighLevelNode): PyramidCard {
  return {
    id: node.id,
    layer: "L1",
    label:
      node.title?.trim() ||
      (node.type === "start"
        ? "Start"
        : node.type === "end"
          ? "Final Close"
          : "Phase"),
    subtitle:
      node.description?.trim() ||
      (node.type === "primaryGate"
        ? "Primary Gate"
        : node.type === "start"
          ? "Start"
          : node.type === "end"
            ? "Final Close"
            : "Phase"),
  };
}
export function buildGlobalPyramidGroups(
  highLevelNodes: HighLevelNode[],
  nodes: DomainNode[],
  items: ExecutionItem[],
  edges: { source: string; target: string }[] = [],
) {
  const claimed = new Set<string>();
  const groups = highLevelNodes.map((hlNode) => {
    const ids = orderLinkedWorkflowNodeIds(linkedIds(hlNode), nodes, edges);
    const branches = ids.map((id) => {
      claimed.add(id);
      return branchForLayer2(id, nodes);
    });
    return { l1: l1CardFromHighLevel(hlNode), l2: branches };
  });

  const extraIds = new Set<string>();
  for (const node of nodes) {
    if (!isWorkflowL2(node) || claimed.has(node.id)) continue;
    const hasEdge = edges.some(
      (edge) => edge.source === node.id || edge.target === node.id,
    );
    if (hasEdge) extraIds.add(node.id);
  }
  for (const item of items) {
    if (item.linkedLayer2NodeId && !claimed.has(item.linkedLayer2NodeId)) {
      extraIds.add(item.linkedLayer2NodeId);
    }
  }
  if (extraIds.size) {
    groups.push({
      l1: {
        id: UNLINKED_L1_ID,
        layer: "L1",
        label: "Other Detailed Workflow",
        subtitle: "Not linked to High Level",
      },
      l2: Array.from(extraIds).map((id) => branchForLayer2(id, nodes)),
    });
  }
  return groups;
}
export function findOwningL1Id(
  layer2Id: string | undefined,
  highLevelNodes: HighLevelNode[],
  nodes: DomainNode[],
  items: ExecutionItem[],
  edges: { source: string; target: string }[] = [],
): string | undefined {
  if (!layer2Id) return undefined;
  const owner = highLevelNodes.find((node) => linkedIds(node).includes(layer2Id));
  if (owner) return owner.id;
  const groups = buildGlobalPyramidGroups(highLevelNodes, nodes, items, edges);
  return groups.find((group) =>
    group.l2.some((branch) => branch.l2.id === layer2Id),
  )?.l1.id;
}
export function cardsBetween(
  from: PositionedCard,
  to: PositionedCard,
  cards: PositionedCard[],
) {
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x + from.width, to.x + to.width);
  return cards.some(
    (card) =>
      card.layer === from.layer &&
      card.id !== from.id &&
      card.id !== to.id &&
      card.x < right - 1 &&
      card.x + card.width > left + 1,
  );
}
export function routeDown(
  from: PositionedCard,
  to: PositionedCard,
  sourceBand: number,
  exitInset = 0,
) {
  const y1 = from.y + from.height;
  const y2 = to.y;
  const stubX = from.x + from.width / 2;
  const destX = to.x + to.width / 2;
  const startY = y1 + exitInset;
  const channelY = Math.min(
    y2 - 18,
    startY + 26 + sourceBand * CHANNEL,
  );
  const r = Math.min(CORNER, Math.abs(destX - stubX) / 2, (channelY - startY) / 2, (y2 - channelY) / 2);
  if (Math.abs(stubX - destX) < 2 || r < 2) {
    return `M ${destX} ${startY} L ${destX} ${y2}`;
  }
  const dir = Math.sign(destX - stubX);
  return [
    `M ${stubX} ${startY}`,
    `L ${stubX} ${channelY - r}`,
    `Q ${stubX} ${channelY} ${stubX + dir * r} ${channelY}`,
    `L ${destX - dir * r} ${channelY}`,
    `Q ${destX} ${channelY} ${destX} ${channelY + r}`,
    `L ${destX} ${y2}`,
  ].join(" ");
}
export function routeAcross(
  from: PositionedCard,
  to: PositionedCard,
  detourIndex: number,
  blocked: boolean,
) {
  const leftToRight = from.x <= to.x;
  const x1 = leftToRight ? from.x + from.width : from.x;
  const x2 = leftToRight ? to.x : to.x + to.width;
  const y1 = from.y + from.height / 2;
  const y2 = to.y + to.height / 2;
  if (!blocked && Math.abs(y1 - y2) < 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  // Keep every detour in a dedicated corridor. L2 has a finite corridor
  // between its action row and L3, so later lanes move above L2 instead of
  // entering the next layer's cards.
  const above =
    from.layer === "L1" || (from.layer === "L2" && detourIndex >= 2);
  const channelY = above
    ? from.y - 14 - (from.layer === "L2" ? detourIndex - 2 : detourIndex) * CHANNEL
    : from.layer === "L2"
      ? from.y + from.height + 12 + detourIndex * CHANNEL
      : from.y + from.height + 14 + detourIndex * CHANNEL;
  const r = Math.min(
    CORNER,
    Math.abs(x2 - x1) / 4,
    Math.abs(channelY - y1) / 2,
    Math.abs(channelY - y2) / 2,
  );
  const v1 = Math.sign(channelY - y1) || 1;
  const v2 = Math.sign(y2 - channelY) || 1;
  const h = Math.sign(x2 - x1) || 1;
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${channelY - v1 * r}`,
    `Q ${x1} ${channelY} ${x1 + h * r} ${channelY}`,
    `L ${x2 - h * r} ${channelY}`,
    `Q ${x2} ${channelY} ${x2} ${channelY + v2 * r}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}
export function assignEdgePaths(cards: PositionedCard[], edges: PyramidEdge[]) {
  const downByBand = new Map<string, PyramidEdge[]>();
  const across: PyramidEdge[] = [];
  for (const edge of edges) {
    if (edge.direction === "across") {
      across.push(edge);
      continue;
    }
    const key = `${edge.from.layer}->${edge.to.layer}`;
    const list = downByBand.get(key) || [];
    list.push(edge);
    downByBand.set(key, list);
  }
  for (const list of downByBand.values()) {
    const bySource = new Map<string, PyramidEdge[]>();
    for (const edge of list) {
      const group = bySource.get(edge.from.id) || [];
      group.push(edge);
      bySource.set(edge.from.id, group);
    }
    const sources = Array.from(bySource.entries()).sort((left, right) => {
      const leftSpan = Math.min(...left[1].map((edge) => edge.to.x));
      const rightSpan = Math.min(...right[1].map((edge) => edge.to.x));
      if (leftSpan !== rightSpan) return leftSpan - rightSpan;
      return left[1][0].from.x - right[1][0].from.x;
    });
    sources.forEach(([, group], sourceBand) => {
      group.sort((left, right) => left.to.x - right.to.x);
      for (const edge of group) {
        const exitInset =
          edge.from.layer === "L1" && edge.to.layer === "L2"
            ? L1_ACTION_GAP + L1_ACTION_H
            : edge.from.layer === "L2" && edge.to.layer === "L3"
              ? L2_ACTION_GAP + L2_ACTION_H
              : 0;
        edge.path = routeDown(edge.from, edge.to, sourceBand, exitInset);
      }
    });
  }
  const nextDetourByLayer = new Map<Layer, number>();
  for (const edge of across) {
    const blocked = cardsBetween(edge.from, edge.to, cards);
    if (blocked) {
      const detour = nextDetourByLayer.get(edge.from.layer) || 0;
      nextDetourByLayer.set(edge.from.layer, detour + 1);
      edge.path = routeAcross(edge.from, edge.to, detour, true);
      continue;
    }
    edge.path = routeAcross(edge.from, edge.to, 0, false);
  }
}
export function statusTone(status: FlowStatus, layer: Layer) {
  if (status === "locked") {
    return "border-slate-200 bg-white text-muted-foreground dark:border-border dark:bg-card";
  }
  if (status === "blocked") {
    return "border-slate-300 bg-white text-muted-foreground dark:border-slate-500 dark:bg-card";
  }
  if (layer === "L3") {
    return "border-violet-500/55 bg-violet-500/15 text-foreground dark:border-violet-400/50 dark:bg-violet-950/25";
  }
  if (layer === "L2") {
    return "border-sky-500/55 bg-sky-500/15 text-foreground";
  }
  return "border-[#159a75]/50 bg-emerald-500/10 text-foreground";
}
export function statusLabel(status: FlowStatus) {
  if (status === "current") return "Here";
  if (status === "blocked") return "Blocked";
  return "Locked";
}
export function cardBadgeStatus(card: PositionedCard, viewLayer: ViewLayer): FlowStatus | null {
  const status =
    card.status === "current" && card.layer !== viewLayer ? "open" : card.status;
  if (status === "open") return null;
  return status;
}
