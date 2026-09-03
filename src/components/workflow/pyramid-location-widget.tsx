"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { ChevronDown, Download, FileText, Layers, LocateFixed, Maximize2, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  getWorkflowProgress,
  nodeReleaseReady,
  nodeStatusLabel,
} from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { isReferenceNodeType, type DomainNode, type ExecutionItem, type HighLevelNode } from "@/types/workflow";

type Layer = "L1" | "L2" | "L3";
type ViewLayer = Layer;

type PyramidCard = {
  id: string;
  layer: Layer;
  label: string;
  subtitle: string;
  nodeId?: string;
  conditionId?: string;
};

type FlowStatus = "open" | "current" | "blocked" | "locked";

type PositionedCard = PyramidCard & {
  x: number;
  y: number;
  width: number;
  height: number;
  current: boolean;
  breathe: boolean;
  status: FlowStatus;
};

type PyramidEdge = {
  id: string;
  from: PositionedCard;
  to: PositionedCard;
  flowing: boolean;
  direction: "down" | "across";
  path: string;
};

const L1_GAP = 96;
const L2_GAP = 64;
const V_GAP = 96;
const L1_ACTION_GAP = 8;
const L1_ACTION_H = 28;
const L2_ACTION_GAP = 8;
const L2_ACTION_H = 26;
const L3_STACK_GAP = 28;
const L3_GAP = 32;
const PAD = 28;
const LAYER_RAIL = 134;
const CORNER = 10;
const CHANNEL = 24;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.8;
const FIT_PAD = 48;
const ZOOM_STEP = 1.15;
const ZOOM_WHEEL_SENSITIVITY = 0.0011;
const ZOOM_ANIMATION_MS = 180;

type Camera = { x: number; y: number; zoom: number };
type DockCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

const DOCK_INSET = 16;
const DOCK_SNAP_PX = 140;
const DOCK_DRAG_THRESHOLD = 5;
const DOCK_STORAGE_KEY = "pwb.process-locator.dock";
const DOCK_CORNERS: DockCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function isDockCorner(value: string | null): value is DockCorner {
  return Boolean(value && DOCK_CORNERS.includes(value as DockCorner));
}

function readDockCorner(): DockCorner {
  if (typeof window === "undefined") return "bottom-left";
  try {
    const stored = window.localStorage.getItem(DOCK_STORAGE_KEY);
    return isDockCorner(stored) ? stored : "bottom-left";
  } catch {
    return "bottom-left";
  }
}

function writeDockCorner(corner: DockCorner) {
  try {
    window.localStorage.setItem(DOCK_STORAGE_KEY, corner);
  } catch {
    /* ignore quota / private mode */
  }
}

function cornerAnchor(corner: DockCorner, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: corner.endsWith("left") ? DOCK_INSET : vw - width - DOCK_INSET,
    y: corner.startsWith("top") ? DOCK_INSET : vh - height - DOCK_INSET,
  };
}

function nearestDockCorner(x: number, y: number, width: number, height: number) {
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

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function cameraAtPoint(camera: Camera, zoom: number, point: { x: number; y: number }): Camera {
  const worldX = (point.x - camera.x) / camera.zoom;
  const worldY = (point.y - camera.y) / camera.zoom;
  return {
    zoom,
    x: point.x - worldX * zoom,
    y: point.y - worldY * zoom,
  };
}

function fitCamera(
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

function measureCard(card: PyramidCard) {
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

function l2FlowStatus(
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

function l1FlowStatus(branches: L2Branch[], statuses: Map<string, FlowStatus>): FlowStatus {
  if (!branches.length) return "locked";
  const child = branches.map((branch) => statuses.get(branch.l2.id) || "locked");
  if (child.every((status) => status === "open")) return "open";
  if (child.some((status) => status === "blocked")) return "blocked";
  if (child.some((status) => status === "current" || status === "open")) return "current";
  return "locked";
}

function edgeFlows(from: FlowStatus, to: FlowStatus) {
  return from === "open" && (to === "open" || to === "current");
}

const UNLINKED_L1_ID = "__unlinked-l2__";

function linkedIds(node: HighLevelNode) {
  return node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [];
}

type L2Branch = {
  l2: PyramidCard;
  l3: PyramidCard[];
};

function isWorkflowL2(node: DomainNode) {
  return node.type !== "phase" && !isReferenceNodeType(node.type);
}

function l2Subtitle(node: DomainNode) {
  if (node.description?.trim()) return node.description.trim();
  if (
    node.config?.stage &&
    typeof node.config.stage === "string" &&
    node.config.stage.trim()
  ) {
    return node.config.stage.trim();
  }
  if (node.type === "projectStart") return "Project Start";
  if (node.type === "gate") return "Gate";
  return getNodeDefinition(node.type).label;
}

function l2CardFromNode(node: DomainNode): PyramidCard {
  return {
    id: node.id,
    layer: "L2",
    label: node.title?.trim() || getNodeDefinition(node.type).label,
    subtitle: l2Subtitle(node),
  };
}

function branchForLayer2(
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
        label: "Legal Documents",
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

function l1CardFromHighLevel(node: HighLevelNode): PyramidCard {
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

function buildGlobalPyramidGroups(
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

function findOwningL1Id(
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

function cardsBetween(
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

function routeDown(
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

function routeAcross(
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

function assignEdgePaths(cards: PositionedCard[], edges: PyramidEdge[]) {
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

function statusTone(status: FlowStatus, layer: Layer) {
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

function statusLabel(status: FlowStatus) {
  if (status === "current") return "Here";
  if (status === "blocked") return "Blocked";
  return "Locked";
}

function cardBadgeStatus(card: PositionedCard, viewLayer: ViewLayer): FlowStatus | null {
  const status =
    card.status === "current" && card.layer !== viewLayer ? "open" : card.status;
  if (status === "open") return null;
  return status;
}

export function PyramidLocationWidget({
  viewLayer,
  executionNodeId,
  onFocusLayer1,
  onFocusLayer2,
}: {
  viewLayer: ViewLayer;
  executionNodeId?: string | null;
  onFocusLayer1?: (nodeId: string) => void;
  onFocusLayer2?: (nodeId: string) => void;
}) {
  const selection = useWorkflowStore((state) => state.selection);
  const highLevelSelection = useWorkflowStore((state) => state.highLevelSelection);
  const nodes = useWorkflowStore((state) => state.file.graph.nodes);
  const highLevelNodes = useWorkflowStore(
    (state) => state.file.highLevel?.graph.nodes ?? [],
  );
  const highLevelEdges = useWorkflowStore(
    (state) => state.file.highLevel?.graph.edges ?? [],
  );
  const layer2Edges = useWorkflowStore((state) => state.file.graph.edges);
  const executionItems = useWorkflowStore(
    (state) => state.file.execution?.items ?? [],
  );
  const operations = useWorkflowStore((state) => state.file.operations);

  const [open, setOpen] = useState(false);
  const [collapsedL1Ids, setCollapsedL1Ids] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const collapsedL1SeedRef = useRef(new Set<string>());
  const [collapsedL2Ids, setCollapsedL2Ids] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const collapsedL2SeedRef = useRef(new Set<string>());
  const [dock, setDock] = useState<DockCorner>(readDockCorner);
  const [dockPos, setDockPos] = useState<{ x: number; y: number } | null>(null);
  const [dockDragging, setDockDragging] = useState(false);
  const [dockMagnet, setDockMagnet] = useState(false);
  const dockButtonRef = useRef<HTMLButtonElement>(null);
  const dockDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const diagramFrameRef = useRef<HTMLDivElement>(null);
  const canvasLayerRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const cameraAnimationRef = useRef<number | null>(null);
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    camX: number;
    camY: number;
    moved: boolean;
  } | null>(null);
  const hasFittedRef = useRef(false);

  useEffect(() => {
    const groups = buildGlobalPyramidGroups(
      orderHighLevelNodes(highLevelNodes, highLevelEdges),
      nodes,
      executionItems,
      layer2Edges,
    );
    const groupIds = new Set(
      groups.filter((group) => group.l2.length).map((group) => group.l1.id),
    );
    setCollapsedL1Ids((current) => {
      const next = new Set(current);
      // Only remove IDs that no longer exist; never auto-collapse new nodes
      for (const id of next) {
        if (!groupIds.has(id)) next.delete(id);
      }
      return next;
    });
    collapsedL1SeedRef.current = groupIds;

    const nodeIds = new Set(nodes.map((node) => node.id));
    setCollapsedL2Ids((current) => {
      const next = new Set(current);
      // Only remove IDs that no longer exist; never auto-collapse new nodes
      for (const id of next) {
        if (!nodeIds.has(id)) next.delete(id);
      }
      return next;
    });
    collapsedL2SeedRef.current = nodeIds;
  }, [executionItems, highLevelEdges, highLevelNodes, layer2Edges, nodes]);

  const applyCamera = useCallback((nextCamera: Camera) => {
    cameraRef.current = nextCamera;
    if (canvasLayerRef.current) {
      canvasLayerRef.current.style.transform = `translate3d(${nextCamera.x}px, ${nextCamera.y}px, 0) scale(${nextCamera.zoom})`;
    }
    setCamera(nextCamera);
  }, []);

  const cancelCameraAnimation = useCallback(() => {
    if (cameraAnimationRef.current === null) return;
    window.cancelAnimationFrame(cameraAnimationRef.current);
    cameraAnimationRef.current = null;
  }, []);

  const animateCameraTo = useCallback(
    (target: Camera, duration = ZOOM_ANIMATION_MS) => {
      cancelCameraAnimation();
      const start = cameraRef.current;
      if (duration <= 0) {
        applyCamera(target);
        return;
      }
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - (1 - progress) ** 3;
        applyCamera({
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          zoom: start.zoom + (target.zoom - start.zoom) * eased,
        });
        if (progress < 1) {
          cameraAnimationRef.current = window.requestAnimationFrame(tick);
        } else {
          cameraAnimationRef.current = null;
          applyCamera(target);
        }
      };
      cameraAnimationRef.current = window.requestAnimationFrame(tick);
    },
    [applyCamera, cancelCameraAnimation],
  );

  useEffect(() => () => cancelCameraAnimation(), [cancelCameraAnimation]);

  useEffect(() => {
    if (!open) return;
    const frame = diagramFrameRef.current;
    if (!frame) return;
    const update = () => {
      setFrameSize({
        width: frame.clientWidth,
        height: frame.clientHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const finishDockDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dockDragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (!drag.moved) {
      setDockDragging(false);
      setDockMagnet(false);
      setDockPos(null);
      setOpen(true);
      return;
    }
    const button = dockButtonRef.current;
    const width = button?.offsetWidth ?? 242;
    const height = button?.offsetHeight ?? 44;
    const { corner } = nearestDockCorner(drag.x, drag.y, width, height);
    setDock(corner);
    writeDockCorner(corner);
    setDockDragging(false);
    setDockMagnet(false);
    setDockPos(null);
  };

  const onDockPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dockDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      x: rect.left,
      y: rect.top,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic / non-capturable pointers still complete on the button */
    }
  };

  const onDockPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DOCK_DRAG_THRESHOLD) return;
    drag.moved = true;
    setDockDragging(true);
    const button = dockButtonRef.current;
    const width = button?.offsetWidth ?? 242;
    const height = button?.offsetHeight ?? 44;
    const x = Math.min(
      window.innerWidth - width - 4,
      Math.max(4, event.clientX - drag.offsetX),
    );
    const y = Math.min(
      window.innerHeight - height - 4,
      Math.max(4, event.clientY - drag.offsetY),
    );
    const nearest = nearestDockCorner(x, y, width, height);
    if (nearest.distance < DOCK_SNAP_PX) {
      const anchor = cornerAnchor(nearest.corner, width, height);
      drag.x = anchor.x;
      drag.y = anchor.y;
      setDock(nearest.corner);
      setDockMagnet(true);
      setDockPos(anchor);
      return;
    }
    drag.x = x;
    drag.y = y;
    setDockMagnet(false);
    setDockPos({ x, y });
  };

  const focusLayer2Id = useMemo(() => {
    if (viewLayer === "L3" && executionNodeId) return executionNodeId;
    if (viewLayer === "L2" && selection.nodeIds[0]) return selection.nodeIds[0];
    if (viewLayer === "L1") {
      const hl = highLevelNodes.find((node) =>
        highLevelSelection.nodeIds.includes(node.id),
      );
      return hl ? linkedIds(hl)[0] : undefined;
    }
    return selection.nodeIds[0] || executionNodeId || undefined;
  }, [
    viewLayer,
    executionNodeId,
    selection.nodeIds,
    highLevelSelection.nodeIds,
    highLevelNodes,
  ]);

  const focusL1Id = useMemo(() => {
    if (viewLayer === "L1" && highLevelSelection.nodeIds[0]) {
      return highLevelSelection.nodeIds[0];
    }
    return findOwningL1Id(
      focusLayer2Id,
      highLevelNodes,
      nodes,
      executionItems,
      layer2Edges,
    );
  }, [
    viewLayer,
    highLevelSelection.nodeIds,
    focusLayer2Id,
    highLevelNodes,
    nodes,
    executionItems,
    layer2Edges,
  ]);

  const diagram = useMemo(() => {
    const groups = buildGlobalPyramidGroups(
      highLevelNodes,
      nodes,
      executionItems,
      layer2Edges,
    );

    const progress = getWorkflowProgress(nodes, layer2Edges, executionItems, operations);
    const l2Statuses = new Map<string, FlowStatus>();
    for (const group of groups) {
      for (const branch of group.l2) {
        l2Statuses.set(
          branch.l2.id,
          l2FlowStatus(
            branch.l2.id,
            nodes,
            progress.reachedNodeIds,
            executionItems,
            operations,
          ),
        );
      }
    }

    const cards: PositionedCard[] = [];
    const edges: PyramidEdge[] = [];
    const sized = groups.map((group) => ({
      l1: { ...group.l1, ...measureCard(group.l1) },
      l2: group.l2.map((branch) => ({
        l2: { ...branch.l2, ...measureCard(branch.l2) },
        l3: (branch.l3 || []).map((l3Card) => ({
          ...l3Card,
          ...measureCard(l3Card),
        })),
      })),
    }));
    const l1Height = Math.max(48, ...sized.map((group) => group.l1.height));
    const l2Height = Math.max(
      44,
      ...sized.flatMap((group) => group.l2.map((branch) => branch.l2.height)),
    );
    const l1Y = PAD;
    const l2Y = PAD + l1Height + V_GAP;

    const rowWidth = (
      widths: number[],
      gap: number,
    ) =>
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, widths.length - 1) * gap;

    const l2Items = sized.flatMap((group, groupIndex) =>
      collapsedL1Ids.has(group.l1.id)
        ? []
        : group.l2.map((branch, branchIndex) => ({
            branch,
            groupIndex,
            isFirstInGroup: branchIndex === 0,
          })),
    );
    const l2RowWidth = rowWidth(
      l2Items.map((item) => item.branch.l2.width),
      L2_GAP,
    );
    const l1RowWidth = rowWidth(
      sized.map((group) => group.l1.width),
      L1_GAP,
    );
    const baseWidth = Math.max(l1RowWidth, l2RowWidth, 320);
    const l1Start = PAD + (baseWidth - l1RowWidth) / 2;
    const l2Start = PAD + (baseWidth - l2RowWidth) / 2;

    let layerX = l1Start;
    const l1Cards = sized.map((group) => {
      const l1Status =
        group.l1.id === UNLINKED_L1_ID
          ? "locked"
          : l1FlowStatus(group.l2, l2Statuses);
      const l1Card: PositionedCard = {
        ...group.l1,
        x: layerX,
        y: l1Y,
        width: group.l1.width,
        height: l1Height,
        current: group.l1.id === focusL1Id && viewLayer === "L1",
        breathe: false,
        status: l1Status,
      };
      cards.push(l1Card);
      layerX += group.l1.width + L1_GAP;
      return l1Card;
    });

    const l1Actions = l1Cards.flatMap((l1Card, groupIndex) => {
      const group = sized[groupIndex];
      if (!group?.l2.length) return [];
      return [
        {
          id: l1Card.id,
          label: l1Card.label,
          x: l1Card.x,
          y: l1Card.y + l1Card.height + L1_ACTION_GAP,
          width: l1Card.width,
          count: group.l2.length,
        },
      ];
    });

    const l2Actions: {
      id: string;
      label: string;
      x: number;
      y: number;
      width: number;
      count: number;
    }[] = [];

    let maxL3Bottom = l2Y + l2Height;

    layerX = l2Start;
    l2Items.forEach(({ branch, groupIndex, isFirstInGroup }) => {
      const l1Card = l1Cards[groupIndex];
      if (!l1Card) return;
      const l2Status = l2Statuses.get(branch.l2.id) || "locked";
      const l2Card: PositionedCard = {
        ...branch.l2,
        x: layerX,
        y: l2Y,
        width: branch.l2.width,
        height: l2Height,
        current: branch.l2.id === focusLayer2Id && viewLayer === "L2",
        breathe: false,
        status: l2Status,
      };
      cards.push(l2Card);
      if (isFirstInGroup) {
        edges.push({
          id: `${l1Card.id}->${l2Card.id}`,
          from: l1Card,
          to: l2Card,
          direction: "down",
          flowing: edgeFlows(l1Card.status, l2Card.status),
          path: "",
        });
      }

      if (branch.l3 && branch.l3.length > 0) {
        l2Actions.push({
          id: l2Card.id,
          label: l2Card.label,
          x: l2Card.x,
          y: l2Card.y + l2Card.height + L2_ACTION_GAP,
          width: l2Card.width,
          count: branch.l3.length,
        });

        const isL2Expanded = !collapsedL2Ids.has(l2Card.id);
        if (isL2Expanded) {
          let currL3Y = l2Card.y + l2Card.height + L2_ACTION_GAP + L2_ACTION_H + L3_GAP;
          let prevL3Card: PositionedCard | null = null;

          branch.l3.forEach((l3Item, l3Idx) => {
            const l3Width = Math.min(l2Card.width, l3Item.width);
            const l3X = l2Card.x + (l2Card.width - l3Width) / 2;
            const l3Height = l3Item.height;

            const domainNode = nodes.find((n) => n.id === branch.l2.id);
            const condition = domainNode?.conditions?.find((c) => c.id === l3Item.conditionId);
            const isPassed = condition?.checked;
            const l3Status: FlowStatus = isPassed
              ? "open"
              : l2Card.status === "open" || l2Card.status === "current"
                ? "open"
                : "locked";

            const isCurrentL3 = Boolean(
              (viewLayer === "L3" && executionNodeId === branch.l2.id && l3Idx === 0) ||
              (viewLayer === "L3" && l3Item.conditionId && condition?.id === l3Item.conditionId && executionNodeId === branch.l2.id)
            );

            const l3Card: PositionedCard = {
              ...l3Item,
              x: l3X,
              y: currL3Y,
              width: l3Width,
              height: l3Height,
              current: isCurrentL3,
              breathe: false,
              status: l3Status,
            };
            cards.push(l3Card);

            if (l3Idx === 0) {
              edges.push({
                id: `${l2Card.id}->${l3Card.id}`,
                from: l2Card,
                to: l3Card,
                direction: "down",
                flowing: edgeFlows(l2Card.status, l3Card.status),
                path: "",
              });
            } else if (prevL3Card) {
              edges.push({
                id: `${prevL3Card.id}->${l3Card.id}`,
                from: prevL3Card,
                to: l3Card,
                direction: "down",
                flowing: edgeFlows(prevL3Card.status, l3Card.status),
                path: "",
              });
            }

            prevL3Card = l3Card;
            currL3Y += l3Height + L3_STACK_GAP;
            if (currL3Y > maxL3Bottom) {
              maxL3Bottom = currL3Y;
            }
          });
        }
      }

      layerX += branch.l2.width + L2_GAP;
    });

    const cardById = (layer: Layer, id: string) =>
      cards.find((card) => card.layer === layer && card.id === id);

    const l1Links =
      highLevelEdges.length > 0
        ? highLevelEdges
        : highLevelNodes.slice(1).map((node, index) => ({
            id: `l1-seq-${index}`,
            source: highLevelNodes[index].id,
            target: node.id,
          }));
    for (const edge of l1Links) {
      const from = cardById("L1", edge.source);
      const to = cardById("L1", edge.target);
      if (!from || !to || from.id === UNLINKED_L1_ID || to.id === UNLINKED_L1_ID) {
        continue;
      }
      edges.push({
        id: `l1-${edge.id || `${edge.source}-${edge.target}`}`,
        from,
        to,
        direction: "across",
        flowing: edgeFlows(from.status, to.status),
        path: "",
      });
    }

    for (const edge of layer2Edges) {
      const from = cardById("L2", edge.source);
      const to = cardById("L2", edge.target);
      if (!from || !to) continue;
      edges.push({
        id: `l2-${edge.id || `${edge.source}-${edge.target}`}`,
        from,
        to,
        direction: "across",
        flowing: edgeFlows(from.status, to.status),
        path: "",
      });
    }

    for (const card of cards) card.x += LAYER_RAIL;
    for (const action of l1Actions) action.x += LAYER_RAIL;
    for (const action of l2Actions) action.x += LAYER_RAIL;

    assignEdgePaths(cards, edges);

    const hereL1 =
      cards.find((card) => card.layer === "L1" && card.status === "current")?.id ||
      focusL1Id;
    const hereL2Children = edges
      .filter((edge) => edge.from.id === hereL1 && edge.to.layer === "L2")
      .map((edge) => edge.to.id);
    const hereL2 =
      cards.find((card) => card.layer === "L2" && card.status === "current")?.id ||
      cards.find(
        (card) =>
          card.layer === "L2" &&
          hereL2Children.includes(card.id) &&
          (card.status === "current" || card.status === "open"),
      )?.id ||
      focusLayer2Id;
    const hereL3 =
      cards.find((card) => card.layer === "L3" && card.status === "current")?.id ||
      (viewLayer === "L3" && executionNodeId
        ? cards.find((card) => card.layer === "L3" && card.nodeId === executionNodeId)?.id
        : undefined);

    for (const card of cards) {
      card.breathe =
        (card.layer === "L1" && card.id === hereL1) ||
        (card.layer === "L2" && card.id === hereL2) ||
        (card.layer === "L3" && card.id === hereL3);
    }

    const width = Math.max(
      360,
      cards.reduce((max, card) => Math.max(max, card.x + card.width), 0) + PAD,
    );
    const height = Math.max(l2Y + l2Height + PAD, maxL3Bottom + PAD);

    const stopCard =
      cards.find((card) => card.status === "blocked") ||
      cards.find((card) => card.status === "current");

    const l3Cards = cards.filter((c) => c.layer === "L3");
    const minL3Y = l3Cards.length > 0 ? Math.min(...l3Cards.map((c) => c.y)) : l2Y + l2Height + 40;
    const maxL3Y = l3Cards.length > 0 ? Math.max(...l3Cards.map((c) => c.y + c.height)) : minL3Y + 44;

    const layerBands = [
      {
        id: "L1" as const,
        title: "High Level",
        y: l1Y,
        height: l1Height,
        dot: "bg-emerald-500",
        text: "text-emerald-700 dark:text-emerald-300",
      },
      {
        id: "L2" as const,
        title: "Detailed Workflow",
        y: l2Y,
        height: l2Height,
        dot: "bg-sky-500",
        text: "text-sky-700 dark:text-sky-300",
      },
      {
        id: "L3" as const,
        title: "Execution Layer",
        y: minL3Y,
        height: Math.max(44, maxL3Y - minL3Y),
        dot: "bg-violet-500",
        text: "text-violet-700 dark:text-violet-300",
      },
    ];

    return {
      cards,
      edges,
      l1Actions,
      l2Actions,
      layerBands,
      width,
      height,
      groupCount: groups.length,
      stopCard,
    };
  }, [
    highLevelNodes,
    highLevelEdges,
    layer2Edges,
    nodes,
    executionItems,
    focusL1Id,
    focusLayer2Id,
    viewLayer,
    collapsedL1Ids,
    collapsedL2Ids,
    executionNodeId,
    operations,
  ]);

  const currentLabel =
    diagram.cards.find((card) => card.current)?.label ||
    diagram.cards.find((card) => card.id === focusLayer2Id)?.label ||
    "No node selected";
  const stopMessage = diagram.stopCard
    ? `${diagram.stopCard.status === "blocked" ? "Blocked" : "Stopped"} at ${diagram.stopCard.layer} · ${diagram.stopCard.label}`
    : "All visible layers are open";

  const fitView = useCallback(() => {
    animateCameraTo(
      fitCamera(frameSize.width, frameSize.height, diagram.width, diagram.height),
      240,
    );
  }, [
    animateCameraTo,
    frameSize.width,
    frameSize.height,
    diagram.width,
    diagram.height,
  ]);

  useEffect(() => {
    if (!open) {
      hasFittedRef.current = false;
      cancelCameraAnimation();
      return;
    }
    if (hasFittedRef.current || !frameSize.width || !diagram.width) return;
    applyCamera(
      fitCamera(frameSize.width, frameSize.height, diagram.width, diagram.height),
    );
    hasFittedRef.current = true;
  }, [
    open,
    frameSize.width,
    frameSize.height,
    diagram.width,
    diagram.height,
    applyCamera,
    cancelCameraAnimation,
  ]);

  useEffect(() => {
    if (!open) return;
    const frame = diagramFrameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      cancelCameraAnimation();
      const rect = frame.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;

      const isPinch = event.ctrlKey || event.metaKey;
      const isDiscreteWheel =
        event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
        Math.abs(event.deltaY) >= 80;

      if (isPinch || isDiscreteWheel) {
        // Zoom centered directly at cursor point (mx, my)
        const current = cameraRef.current;
        const delta = isPinch ? event.deltaY * 2.5 : event.deltaY;
        const boundedDelta = Math.max(-160, Math.min(160, delta));
        const zoomFactor = Math.exp(-boundedDelta * 0.003);
        const nextZoom = clampZoom(current.zoom * zoomFactor);
        if (Math.abs(nextZoom - current.zoom) > 0.0001) {
          applyCamera(cameraAtPoint(current, nextZoom, { x: mx, y: my }));
        }
      } else {
        // Two-finger trackpad sliding or Shift+scroll horizontal slide
        const current = cameraRef.current;
        const dx = event.shiftKey ? event.deltaY : event.deltaX;
        const dy = event.shiftKey ? 0 : event.deltaY;
        applyCamera({
          ...current,
          x: current.x - dx,
          y: current.y - dy,
        });
      }
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [applyCamera, cancelCameraAnimation, open]);

  const zoomAtFrameCenter = useCallback(
    (direction: "in" | "out") => {
      const frame = diagramFrameRef.current;
      if (!frame) return;
      const current = cameraRef.current;
      const zoom = clampZoom(
        current.zoom * (direction === "in" ? ZOOM_STEP : 1 / ZOOM_STEP),
      );
      if (Math.abs(zoom - current.zoom) < 0.0001) return;
      animateCameraTo(
        cameraAtPoint(current, zoom, {
          x: frame.clientWidth / 2,
          y: frame.clientHeight / 2,
        }),
        ZOOM_ANIMATION_MS,
      );
    },
    [animateCameraTo],
  );

  const onFramePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) return;

    cancelCameraAnimation();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      camX: cameraRef.current.x,
      camY: cameraRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onFramePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      if (!drag.moved) {
        drag.moved = true;
        setPanning(true);
      }
      applyCamera({
        ...cameraRef.current,
        x: drag.camX + dx,
        y: drag.camY + dy,
      });
    }
  };

  const onFramePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
    setPanning(false);
    window.setTimeout(() => {
      dragRef.current = null;
    }, 0);
  };

  const openCard = (card: PositionedCard) => {
    if (dragRef.current?.moved) return;
    if (card.layer === "L1") {
      if (card.id === UNLINKED_L1_ID) return;
      onFocusLayer1?.(card.id);
    } else if (card.layer === "L2") {
      if (!nodes.some((node) => node.id === card.id)) return;
      onFocusLayer2?.(card.id);
    } else if (card.layer === "L3") {
      const targetNodeId = card.nodeId || card.id;
      window.dispatchEvent(
        new CustomEvent("workflow:open-execution", {
          detail: { nodeId: targetNodeId, conditionId: card.conditionId },
        }),
      );
    }
    setOpen(false);
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const pendingAutoExportRef = useRef(false);

  const exportDiagramToPdf = useCallback(async () => {
    if (exportingPdf) return;
    setExportingPdf(true);

    try {
      // Ensure all L1 and L2 cards are fully expanded so full L3 tree is visible
      flushSync(() => {
        setCollapsedL1Ids(new Set());
        setCollapsedL2Ids(new Set());
      });
      await document.fonts.ready;

      const el = canvasLayerRef.current;
      if (!el) {
        setExportingPdf(false);
        return;
      }

      const { toPng } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");

      // Read the expanded DOM, not the collapsed dimensions from this callback's render.
      const width = Math.max(1, el.offsetWidth);
      const height = Math.max(1, el.offsetHeight);
      const backgroundColor =
        getComputedStyle(diagramFrameRef.current ?? el).backgroundColor;

      const dataUrl = await toPng(el, {
        backgroundColor,
        pixelRatio: 2,
        width,
        height,
        // Change only the export clone so the live camera also survives export failures.
        style: { transform: "none" },
      });

      const orientation = width >= height ? "landscape" : "portrait";
      const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [width, height],
      });

      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
      pdf.save("workflow-L3-process-locator.pdf");
    } catch (err) {
      console.error("Failed to export process locator PDF:", err);
    } finally {
      setExportingPdf(false);
    }
  }, [exportingPdf]);

  // Handle auto-export when triggered from top toolbar
  useEffect(() => {
    const handleExport = (event: Event) => {
      const custom = event as CustomEvent<{ format: string }>;
      if (custom.detail?.format === "l3-pdf") {
        pendingAutoExportRef.current = true;
        setOpen(true);
        setCollapsedL1Ids(new Set());
        setCollapsedL2Ids(new Set());
      }
    };
    window.addEventListener("workflow:export", handleExport);
    return () => window.removeEventListener("workflow:export", handleExport);
  }, []);

  // Trigger export once modal is open and diagram is fully expanded
  useEffect(() => {
    if (!pendingAutoExportRef.current) return;
    if (!open) return;
    if (collapsedL1Ids.size > 0 || collapsedL2Ids.size > 0) return;
    if (!canvasLayerRef.current || !diagram.width || !diagram.height) return;

    pendingAutoExportRef.current = false;
    const timer = window.setTimeout(() => {
      void exportDiagramToPdf();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    open,
    collapsedL1Ids.size,
    collapsedL2Ids.size,
    diagram.width,
    diagram.height,
    exportDiagramToPdf,
  ]);

  return (
    <div className="pointer-events-none" aria-live="polite">
      {open ? (
        <div className="pointer-events-auto fixed inset-0 z-50 flex">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Process locator pyramid diagram"
            className="relative z-10 flex h-full w-full flex-col overflow-hidden border-0 bg-background"
          >
          <div className="flex items-center justify-between gap-3 border-b border-slate-300 bg-[#1e2937] px-4 py-2.5 text-slate-100">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-[3px] border border-slate-500/80 bg-slate-800 text-slate-100">
                    <LocateFixed className="size-3.5" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em]">
                    Process Locator
                  </span>
                  <span className="rounded-[3px] border border-slate-500/70 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.16em] text-slate-100">
                    {viewLayer}
                  </span>
                </span>
                <span className="truncate font-mono text-[11px] uppercase tracking-wider text-slate-300">
                  Active · {currentLabel}
                </span>
                <span
                  className={`truncate text-[11px] font-semibold ${
                    diagram.stopCard?.status === "blocked"
                      ? "text-slate-400"
                      : diagram.stopCard
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {stopMessage}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={exportDiagramToPdf}
                disabled={exportingPdf}
                className="h-8 gap-1.5 border-slate-500/80 bg-slate-800 px-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 hover:text-white"
                title="Export this full expanded Process Locator diagram as PDF"
              >
                <Download className="size-3.5 text-emerald-400" />
                <span>{exportingPdf ? "Exporting PDF…" : "Export PDF"}</span>
              </Button>
              <button
                type="button"
                aria-label="Close process locator"
                onClick={() => {
                  setOpen(false);
                }}
                className="flex size-8 items-center justify-center rounded-[3px] border border-slate-500/80 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-300 bg-slate-100 px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <span className="tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Pyramid Diagram
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-emerald-500" /> L1 High Level
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-sky-500" /> L2 Detailed Workflow
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-violet-500" /> L3 Execution Layer
            </span>
            <span className="ml-auto font-sans text-[10px] font-semibold normal-case tracking-normal text-slate-500">
              Scroll to zoom · Drag to pan · Click a node
            </span>
          </div>

          <div
            ref={diagramFrameRef}
            className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[var(--canvas)] ${
              panning ? "cursor-grabbing" : "cursor-grab"
            }`}
            onPointerDown={onFramePointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerUp}
            onPointerCancel={onFramePointerUp}
          >
            {diagram.cards.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No high-level process is available yet.
              </p>
            ) : (
              <div
                ref={canvasLayerRef}
                className="absolute left-0 top-0 origin-top-left will-change-transform [transform-style:preserve-3d] [backface-visibility:hidden]"
                style={{
                  width: diagram.width,
                  height: diagram.height,
                  transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
                }}
                role="img"
                aria-label="L1 to L2 process locator diagram"
              >
                {diagram.layerBands.map((band) => (
                  <div
                    key={`band-${band.id}`}
                    className="pointer-events-none absolute flex items-center"
                    style={{
                      left: 10,
                      top: band.y,
                      width: LAYER_RAIL - 18,
                      height: band.height,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 w-[3px] shrink-0 rounded-[1px] ${band.dot}`}
                        style={{ height: Math.max(28, band.height * 0.72) }}
                      />
                      <div className="min-w-0">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                          {band.id}
                        </p>
                        <p
                          className={`text-[11px] font-bold uppercase leading-tight tracking-[0.12em] ${band.text}`}
                        >
                          {band.title}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <svg
                  width={diagram.width}
                  height={diagram.height}
                  viewBox={`0 0 ${diagram.width} ${diagram.height}`}
                  className="pointer-events-none absolute inset-0 overflow-visible [contain:paint]"
                >
                  <defs>
                    <marker
                      id="pyramid-arrow-active"
                      viewBox="0 0 12 12"
                      refX="10"
                      refY="6"
                      markerWidth="11"
                      markerHeight="11"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M 0 1.4 L 10 6 L 0 10.6 Z" fill="#159a75" />
                    </marker>
                    <marker
                      id="pyramid-arrow-down"
                      viewBox="0 0 12 12"
                      refX="10"
                      refY="6"
                      markerWidth="11"
                      markerHeight="11"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M 0 1.4 L 10 6 L 0 10.6 Z" fill="#f59e0b" />
                    </marker>
                    <marker
                      id="pyramid-arrow-muted"
                      viewBox="0 0 12 12"
                      refX="10"
                      refY="6"
                      markerWidth="11"
                      markerHeight="11"
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path d="M 0 1.4 L 10 6 L 0 10.6 Z" fill="#94a3b8" />
                    </marker>
                  </defs>
                  {diagram.edges.map((edge) => {
                    return (
                      <path
                        key={edge.id}
                        d={edge.path}
                        fill="none"
                        // SVG children are cloned without stylesheet rules by html-to-image.
                        stroke={edge.flowing ? (edge.direction === "down" ? "#f59e0b" : "#159a75") : "#94a3b8"}
                        strokeWidth={edge.flowing ? 3 : 1.8}
                        strokeDasharray={edge.flowing ? "5 5" : "none"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={
                          edge.flowing
                            ? edge.direction === "down"
                              ? "pyramid-flow-edge-down"
                              : "pyramid-flow-edge"
                            : "pyramid-blocked-edge"
                        }
                        markerEnd={
                          edge.flowing
                            ? edge.direction === "down"
                              ? "url(#pyramid-arrow-down)"
                              : "url(#pyramid-arrow-active)"
                            : "url(#pyramid-arrow-muted)"
                        }
                      />
                    );
                  })}
                </svg>
                {diagram.cards.map((card) => {
                  const badgeStatus = cardBadgeStatus(card, viewLayer);
                  return (
                  <button
                    key={`${card.layer}-${card.id}`}
                    type="button"
                    onClick={() => openCard(card)}
                    className={`absolute flex cursor-pointer flex-col justify-center rounded-[3px] border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 transition-shadow hover:shadow-md hover:ring-1 hover:ring-sky-500/40 ${statusTone(card.status, card.layer)}`}
                    style={{
                      left: Math.round(card.x),
                      top: Math.round(card.y),
                      width: Math.round(card.width),
                      height: Math.round(card.height),
                    }}
                    title={`Open ${card.layer} · ${card.label}`}
                  >
                    {card.breathe ? (
                      <span
                        className={`pyramid-breathe-glow pyramid-breathe-glow-${card.layer.toLowerCase()}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="flex shrink-0 items-center justify-between gap-1">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {card.layer}
                      </span>
                      {badgeStatus ? (
                        <span
                          className={`rounded px-1.5 text-[9px] font-bold uppercase ${
                            badgeStatus === "current"
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                              : "bg-slate-400/20 text-slate-500"
                          }`}
                        >
                          {statusLabel(badgeStatus)}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="text-[13px] font-semibold leading-snug break-words line-clamp-2"
                      title={card.label}
                    >
                      {card.label}
                    </p>
                    <p
                      className="text-[11px] leading-snug text-muted-foreground break-words line-clamp-2"
                      title={card.subtitle}
                    >
                      {card.subtitle}
                    </p>
                  </button>
                  );
                })}
                {diagram.l1Actions.map((action) => {
                  const expanded = !collapsedL1Ids.has(action.id);
                  return (
                    <button
                      key={`l2-open-${action.id}`}
                      type="button"
                      data-process-locator-l2-toggle={action.id}
                      aria-expanded={expanded}
                      aria-label={
                        expanded
                          ? `Hide ${action.count} L2 nodes for ${action.label}`
                          : `View ${action.count} L2 nodes for ${action.label}`
                      }
                      title={`${expanded ? "Hide" : "View"} L2 nodes for ${action.label}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCollapsedL1Ids((current) => {
                          const next = new Set(current);
                          if (next.has(action.id)) {
                            next.delete(action.id);
                          } else {
                            next.add(action.id);
                          }
                          return next;
                        });
                      }}
                      className={`absolute flex items-center justify-between gap-2 rounded-[3px] border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        expanded
                          ? "border-sky-400 bg-[#1d4661] text-sky-100"
                          : "border-slate-500/80 bg-[#1e2937] text-slate-100 hover:border-sky-400/80 hover:bg-[#273449]"
                      }`}
                      style={{
                        left: action.x,
                        top: action.y,
                        width: action.width,
                        height: L1_ACTION_H,
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Layers className="size-3 shrink-0" />
                        <span className="truncate">
                          {expanded ? "Hide L2 Nodes" : "View L2 Nodes"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span
                          className={`rounded-[2px] border px-1 py-px tracking-[0.08em] ${
                            expanded
                              ? "border-sky-300/50 bg-sky-500/30"
                              : "border-slate-500 bg-slate-800"
                          }`}
                        >
                          {action.count}
                        </span>
                        <ChevronDown
                          className={`size-3 transition ${expanded ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>
                  );
                })}
                {diagram.l2Actions.map((action) => {
                  const expanded = !collapsedL2Ids.has(action.id);
                  return (
                    <button
                      key={`l3-open-${action.id}`}
                      type="button"
                      data-process-locator-l3-toggle={action.id}
                      aria-expanded={expanded}
                      aria-label={
                        expanded
                          ? `Hide ${action.count} L3 nodes for ${action.label}`
                          : `View ${action.count} L3 nodes for ${action.label}`
                      }
                      title={`${expanded ? "Hide" : "View"} L3 nodes for ${action.label}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setCollapsedL2Ids((current) => {
                          const next = new Set(current);
                          if (next.has(action.id)) {
                            next.delete(action.id);
                          } else {
                            next.add(action.id);
                          }
                          return next;
                        });
                      }}
                      className={`absolute flex items-center justify-between gap-1.5 rounded-[3px] border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        expanded
                          ? "border-violet-400 bg-[#32234c] text-violet-100"
                          : "border-slate-500/80 bg-[#1e2937] text-slate-100 hover:border-violet-400/80 hover:bg-[#282138]"
                      }`}
                      style={{
                        left: action.x,
                        top: action.y,
                        width: action.width,
                        height: L2_ACTION_H,
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <Layers className="size-3 shrink-0 text-violet-300" />
                        <span className="truncate">
                          {expanded ? "Hide L3 Nodes" : "View L3 Nodes"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span
                          className={`rounded-[2px] border px-1 py-px tracking-[0.08em] ${
                            expanded
                              ? "border-violet-300/50 bg-violet-500/30 text-violet-100"
                              : "border-slate-500 bg-slate-800 text-slate-300"
                          }`}
                        >
                          {action.count}
                        </span>
                        <ChevronDown
                          className={`size-3 transition ${expanded ? "rotate-180" : ""}`}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div
              className="pointer-events-auto absolute bottom-4 left-4 z-10 flex overflow-hidden rounded-[4px] border border-slate-500/70 bg-background shadow-sm"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => zoomAtFrameCenter("out")}
                className="flex size-9 items-center justify-center border-r border-slate-300 text-foreground hover:bg-muted"
              >
                <Minus className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Fit all layers"
                onClick={fitView}
                className="flex h-9 items-center gap-1.5 px-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-foreground hover:bg-muted"
              >
                <Maximize2 className="size-3.5" />
                {Math.round(camera.zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => zoomAtFrameCenter("in")}
                className="flex size-9 items-center justify-center border-l border-slate-300 text-foreground hover:bg-muted"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          </div>
        </div>
      ) : null}

      {open ? null : (
        <button
          ref={dockButtonRef}
          type="button"
          onPointerDown={onDockPointerDown}
          onPointerMove={onDockPointerMove}
          onPointerUp={finishDockDrag}
          onPointerCancel={finishDockDrag}
          aria-label="Open minimap and process locator"
          aria-expanded={false}
          aria-grabbed={dockDragging}
          title="Drag to a corner · Click to open minimap"
          className={cn(
            "pointer-events-auto fixed z-40 flex h-11 touch-none items-stretch overflow-hidden rounded-[4px] border border-slate-500/70 bg-background shadow-[0_6px_16px_rgba(15,23,42,0.16)] select-none",
            dockDragging ? "cursor-grabbing" : "cursor-grab hover:border-slate-700 hover:shadow-[0_8px_20px_rgba(15,23,42,0.2)]",
            dockMagnet && "border-slate-800 shadow-[0_8px_20px_rgba(15,23,42,0.22)]",
            dockPos
              ? undefined
              : dock === "top-left"
                ? "top-4 left-4"
                : dock === "top-right"
                  ? "top-4 right-4"
                  : dock === "bottom-right"
                    ? "bottom-4 right-4"
                    : "bottom-4 left-4",
            dockMagnet || !dockDragging ? "transition-[top,left,right,bottom,box-shadow] duration-150 ease-out" : undefined,
          )}
          style={
            dockPos
              ? { top: dockPos.y, left: dockPos.x, right: "auto", bottom: "auto" }
              : undefined
          }
        >
          <span className="flex w-12 flex-col items-center justify-center bg-[#1e2937] text-slate-100">
            <span className="font-mono text-[11px] font-bold tracking-[0.14em]">
              {viewLayer}
            </span>
          </span>
          <span className="flex items-center gap-2.5 px-3.5">
            <LocateFixed className="size-3.5 text-slate-700 dark:text-slate-200" />
            <span className="flex flex-col items-start leading-none">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground">
                Minimap · Process Locator
              </span>
              <span className="mt-1 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                L1 — L2 Map
              </span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
