"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  EyeOff,
  Layers3,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Position, getSmoothStepPath } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { getSemanticEdgeColor } from "./semantic-edge";
import type { DomainEdge, WorkflowEdgeType } from "@/types/workflow";

export type ContextMapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  active?: boolean;
  container?: boolean;
  type?: string;
};

export type ContextMapEdge = {
  id: string;
  source: string;
  target: string;
  type?: WorkflowEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  lineStyle?: "solid" | "dashed" | "dotted";
  label?: string;
};

type LayerContextMinimapProps = {
  level: "L1" | "L2";
  title: string;
  nodes: ContextMapNode[];
  edges: (ContextMapEdge | DomainEdge)[];
  activeLabel?: string;
  className?: string;
  onOpenParent?: () => void;
  onOpenNode?: (nodeId: string) => void;
  expandable?: boolean;
  /** Use a denser footprint when the context map sits above a detail panel. */
  compact?: boolean;
  strip?: boolean;
  defaultHidden?: boolean;
};

const MAP_PADDING = 18;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const NODE_READABLE_WIDTH = 180;
const HIGH_LEVEL_EDGE_COLOR = "#159a75";
const MIN_L1_EDGE_GAP = 64;
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const MIN_L2_EDGE_GAP = 68;

function spaceLayerNodes(nodes: ContextMapNode[], minGap: number) {
  const nonContainers = nodes.filter((n) => !n.container);
  const targetCenterY =
    nonContainers.length > 0
      ? nonContainers.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nonContainers.length
      : 80;

  const columns = Array.from(
    nodes.reduce((result, node) => {
      const column = result.get(node.x) || [];
      column.push(node);
      result.set(node.x, column);
      return result;
    }, new Map<number, ContextMapNode[]>()),
  ).sort(([leftX], [rightX]) => leftX - rightX);
  const adjustedX = new Map<string, number>();
  const adjustedY = new Map<string, number>();
  let previousRight: number | undefined;

  for (const [columnX, columnNodes] of columns) {
    const isOnlyContainers = columnNodes.every((n) => n.container);
    if (isOnlyContainers) continue;

    const minimumX =
      previousRight === undefined ? columnX : previousRight + minGap;
    const renderedX = Math.max(columnX, minimumX);

    const activeColNodes = columnNodes.filter((n) => !n.container);
    if (activeColNodes.length === 1) {
      const single = activeColNodes[0];
      adjustedX.set(single.id, renderedX);
      adjustedY.set(single.id, targetCenterY - single.height / 2);
    } else if (activeColNodes.length > 1) {
      activeColNodes.sort((a, b) => a.y - b.y);
      const totalColHeight =
        activeColNodes.reduce((sum, n) => sum + n.height, 0) + (activeColNodes.length - 1) * 20;
      let startY = targetCenterY - totalColHeight / 2;
      for (const node of activeColNodes) {
        adjustedX.set(node.id, renderedX);
        adjustedY.set(node.id, startY);
        startY += node.height + 20;
      }
    }

    for (const node of columnNodes) {
      if (!adjustedX.has(node.id)) adjustedX.set(node.id, renderedX);
    }

    previousRight = Math.max(
      ...columnNodes.filter((n) => !n.container).map((node) => renderedX + node.width),
    );
  }

  return nodes.map((node) => ({
    ...node,
    x: adjustedX.get(node.id) ?? node.x,
    y: adjustedY.get(node.id) ?? node.y,
  }));
}

function roundedPath(points: { x: number; y: number }[], radius = 12) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (d1 === 0 || d2 === 0) continue;
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const startX = curr.x - (r * (curr.x - prev.x)) / d1;
    const startY = curr.y - (r * (curr.y - prev.y)) / d1;
    const endX = curr.x + (r * (next.x - curr.x)) / d2;
    const endY = curr.y + (r * (next.y - curr.y)) / d2;
    path += ` L ${startX} ${startY} Q ${curr.x} ${curr.y} ${endX} ${endY}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

export function LayerContextMinimap({
  level,
  title,
  nodes,
  edges,
  activeLabel,
  className,
  onOpenParent,
  onOpenNode,
  expandable = false,
  compact = false,
  strip = false,
  defaultHidden,
}: LayerContextMinimapProps) {
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(() => defaultHidden ?? level === "L1");
  const mapScroller = useRef<HTMLDivElement>(null);
  const nodeListScroller = useRef<HTMLDivElement>(null);
  const displayNodes = useMemo(
    () => spaceLayerNodes(nodes, level === "L1" ? MIN_L1_EDGE_GAP : MIN_L2_EDGE_GAP),
    [level, nodes],
  );
  const bounds = displayNodes.reduce(
    (result, node) => ({
      minX: Math.min(result.minX, node.x),
      minY: Math.min(result.minY, node.y),
      maxX: Math.max(result.maxX, node.x + node.width),
      maxY: Math.max(result.maxY, node.y + node.height),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
  const hasNodes = nodes.length > 0;
  const hasCorridorEdges = edges.some(
    (e) =>
      e.sourceHandle === "nogo-disqualified" ||
      e.sourceHandle === "csa-pcs" ||
      e.sourceHandle?.startsWith("no") ||
      e.type === "failure" ||
      e.type === "rework" ||
      e.type === "exception",
  );
  const CORRIDOR_VERTICAL_PAD = level === "L2" && hasCorridorEdges ? 48 : 8;
  const vbWidth = Math.max(1, bounds.maxX - bounds.minX + MAP_PADDING * 2);
  const vbHeight = Math.max(
    1,
    bounds.maxY - bounds.minY + MAP_PADDING * 2 + CORRIDOR_VERTICAL_PAD * 2,
  );
  const viewBox = hasNodes
    ? [
        bounds.minX - MAP_PADDING,
        bounds.minY - MAP_PADDING - CORRIDOR_VERTICAL_PAD,
        vbWidth,
        vbHeight,
      ].join(" ")
    : "0 0 400 160";
  const nodeById = new Map(displayNodes.map((node) => [node.id, node]));
  const activeNode = displayNodes.find((node) => node.active);
  const activeNodeId = activeNode?.id;

  const baseInnerHeight =
    level === "L1"
      ? expanded
        ? 180
        : 88
      : expanded
        ? compact
          ? 200
          : 320
        : compact
          ? 110
          : 150;
  const svgHeight = Math.round(baseInnerHeight * zoom);
  const svgWidth = Math.round((vbWidth / vbHeight) * svgHeight);

  const orderedNavigatorNodes = useMemo(
    () =>
      [...displayNodes]
        .filter((node) => !node.container)
        .sort((a, b) => a.x - b.x || a.y - b.y),
    [displayNodes],
  );

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const scroller = mapScroller.current;
    if (!scroller) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scroller.offsetLeft;
    scrollLeftRef.current = scroller.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const scroller = mapScroller.current;
    if (!scroller) return;
    const x = e.pageX - scroller.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    scroller.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((z + zoomDelta).toFixed(2)))));
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
      const scroller = mapScroller.current;
      if (scroller) {
        scroller.scrollLeft += e.deltaY;
      }
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const scroller = mapScroller.current;
    if (!scroller || !activeNodeId) return;
    const frame = window.requestAnimationFrame(() => {
      const renderedNode = Array.from(
        scroller.querySelectorAll<SVGGElement>("[data-context-map-node-id]"),
      ).find((element) => element.dataset.contextMapNodeId === activeNodeId);
      if (renderedNode) {
        const scrollerRect = scroller.getBoundingClientRect();
        const nodeRect = renderedNode.getBoundingClientRect();
        scroller.scrollTo({
          left: Math.max(
            0,
            scroller.scrollLeft +
              nodeRect.left -
              scrollerRect.left +
              nodeRect.width / 2 -
              scroller.clientWidth / 2,
          ),
          behavior: "smooth",
        });
      }
      const listScroller = nodeListScroller.current;
      const activeListItem = listScroller?.querySelector<HTMLElement>(
        "[data-context-node-active='true']",
      );
      if (listScroller && activeListItem) {
        listScroller.scrollTo({
          left:
            activeListItem.offsetLeft +
            activeListItem.offsetWidth / 2 -
            listScroller.clientWidth / 2,
          behavior: "smooth",
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeNodeId, svgWidth, svgHeight, expanded, mounted]);

  if (!mounted) return null;

  if (hidden) {
    return (
      <button
        type="button"
        data-layer-context-minimap-toggle={level}
        onClick={() => setHidden(false)}
        className="pointer-events-auto flex h-8 items-center gap-2 rounded-xl border border-border/80 bg-background/90 px-3 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur-md transition hover:border-primary/40 hover:bg-card hover:text-foreground hover:shadow-md"
        aria-label={`Show ${level} minimap`}
        title={`Show ${level} minimap`}
      >
        <Layers3 className="size-3.5 text-primary" />
        <span>{level} · {title}</span>
      </button>
    );
  }

  const arrowColors = [
    { id: "emerald", color: "#10b981" },
    { id: "blue", color: "#2563eb" },
    { id: "red", color: "#dc2626" },
    { id: "amber", color: "#d97706" },
    { id: "cyan", color: "#0891b2" },
    { id: "purple", color: "#7c3aed" },
    { id: "slate", color: "#64748b" },
    { id: "teal", color: "#159a75" },
  ];

  const getMarkerForColor = (color: string) => {
    const matched = arrowColors.find((c) => c.color.toLowerCase() === color.toLowerCase());
    return matched
      ? `url(#context-arrow-${matched.id}-${level})`
      : `url(#context-arrow-emerald-${level})`;
  };

  return (
    <section
      data-layer-context-minimap={level}
      aria-label={`${level} context minimap`}
      className={cn(
        "overflow-hidden rounded-2xl border transition-all duration-300",
        level === "L1"
          ? "bg-card/20 shadow-xs border-border/30 opacity-15 hover:opacity-100 hover:bg-card/95 hover:shadow-xl hover:border-border hover:backdrop-blur-md"
          : "bg-card/90 shadow-md backdrop-blur-md",
        className,
        expandable &&
          expanded &&
          (level === "L1"
            ? "w-[min(940px,calc(100vw-16px))] sm:w-[min(1080px,calc(100vw-32px))] !opacity-100"
            : "w-full"),
      )}
    >
      {/* Top Header Controls */}
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center justify-between gap-1.5 border-b px-3.5 py-1.5 sm:h-11 sm:flex-nowrap sm:py-0",
          level === "L1" ? "bg-muted/10" : "bg-muted/20",
        )}
      >
        <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers3 className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                {level} · Context
              </p>
              <span className="text-muted-foreground/40">·</span>
              <p className="truncate text-xs font-bold text-foreground">
                {title}
              </p>
            </div>
          </div>
        </div>

        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-1 sm:ml-0 sm:w-auto">
          {expandable ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={`${expanded ? "Restore" : "Expand"} ${level} minimap`}
              title={`${expanded ? "Restore" : "Expand"} minimap`}
            >
              {expanded ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={`Hide ${level} minimap`}
            title="Hide minimap"
          >
            <EyeOff className="size-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div
        ref={mapScroller}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
        className={cn(
          "scroll-thin relative overflow-x-auto overflow-y-hidden p-2 overscroll-contain transition-all select-none cursor-grab active:cursor-grabbing flex items-center",
            level === "L1"
              ? "bg-transparent h-[92px] sm:h-[98px]"
              : compact
                ? "bg-canvas/90 h-[160px] sm:h-[176px]"
                : "bg-canvas/90 h-[240px] sm:h-[270px]",
            expandable &&
              expanded &&
              (level === "L1"
                ? "!h-[180px] sm:!h-[200px]"
                : compact
                  ? "!h-[280px] sm:!h-[320px]"
                  : "!h-[460px] sm:!h-[520px]"),
        )}
      >
        {hasNodes ? (
          <svg
            viewBox={viewBox}
            preserveAspectRatio="xMinYMid meet"
            className="block max-w-none origin-top-left shrink-0 my-auto"
            style={{
              width: `${svgWidth}px`,
              height: `${svgHeight}px`,
            }}
            role="img"
            aria-label={`${level} workflow overview${activeLabel ? `, current position ${activeLabel}` : ""}`}
          >
            <defs aria-hidden>
              {arrowColors.map((arrow) => (
                <marker
                  key={arrow.id}
                  id={`context-arrow-${arrow.id}-${level}`}
                  markerWidth="6"
                  markerHeight="6"
                  viewBox="-8 -8 16 16"
                  markerUnits="strokeWidth"
                  orient="auto-start-reverse"
                  refX="1"
                  refY="0"
                >
                  <polyline
                    points="-5,-3.5 1,0 -5,3.5 -5,-3.5"
                    fill={arrow.color}
                    stroke={arrow.color}
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>
              ))}
              <filter id={`context-card-shadow-${level}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.08" />
              </filter>
            </defs>

            {/* Semantic Edges Matching L2 */}
            <g aria-hidden>
              {edges.map((edge) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                const isEdgeConnectedToActive = source.active || target.active;
                const edgeColor =
                  level === "L2"
                    ? getSemanticEdgeColor(edge as DomainEdge)
                    : HIGH_LEVEL_EDGE_COLOR;
                const isDashed = edge.lineStyle === "dashed";
                const isDotted = edge.lineStyle === "dotted";
                const dashStyle =
                  level === "L1"
                    ? "5"
                    : isDashed
                      ? "10 6"
                      : isDotted
                        ? "4 4"
                        : undefined;

                const sourceIsOpportunity =
                  level === "L2" &&
                  (source.type === "opportunityValidation" ||
                    source.id.toLowerCase().includes("opportunity") ||
                    ["pass-p1-p2", "loi-governed", "csa-pcs", "site-feasibility", "nogo-disqualified", "path-loi"].includes(
                      edge.sourceHandle || "",
                    ));

                let sourceX = source.x + source.width;
                let sourceY = source.y + source.height / 2;
                let preferCorridor: "above" | "below" | "direct" = "direct";
                let corridorLane = 0;

                if (sourceIsOpportunity) {
                  if (edge.sourceHandle === "pass-p1-p2") {
                    sourceY = source.y + source.height * 0.12;
                    preferCorridor = "direct";
                    corridorLane = 0;
                  } else if (edge.sourceHandle === "loi-governed") {
                    sourceY = source.y + source.height * 0.28;
                    preferCorridor = "above";
                    corridorLane = 1;
                  } else if (edge.sourceHandle === "csa-pcs") {
                    sourceY = source.y + source.height * 0.44;
                    preferCorridor = "above";
                    corridorLane = 0;
                  } else if (edge.sourceHandle === "site-feasibility") {
                    sourceY = source.y + source.height * 0.60;
                    preferCorridor = "below";
                    corridorLane = 0;
                  } else if (edge.sourceHandle === "nogo-disqualified") {
                    sourceY = source.y + source.height * 0.76;
                    preferCorridor = "above";
                    corridorLane = 2;
                  } else if (edge.sourceHandle === "path-loi") {
                    sourceY = source.y + source.height * 0.92;
                    preferCorridor = "below";
                    corridorLane = 1;
                  }
                } else if (edge.sourceHandle === "yes") {
                  sourceY = source.y + source.height * 0.35;
                  preferCorridor = "direct";
                } else if (edge.sourceHandle === "no") {
                  sourceY = source.y + source.height * 0.70;
                  preferCorridor = "below";
                  corridorLane = 1;
                }

                const targetX = target.x;
                const targetY = target.y + target.height / 2;

                const isDeniedOrNoGo =
                  edge.sourceHandle === "nogo-disqualified" ||
                  edge.sourceHandle?.startsWith("no") ||
                  edge.type === "failure" ||
                  edge.type === "rework" ||
                  edge.type === "exception" ||
                  edge.label?.toLowerCase().includes("no-go") ||
                  edge.label?.toLowerCase().includes("nogo") ||
                  edge.label?.toLowerCase().includes("denied");

                const isBackward = targetX <= sourceX + 24;

                const minSpanX = Math.min(sourceX, targetX);
                const maxSpanX = Math.max(sourceX, targetX);
                const intermediateCards = displayNodes.filter(
                  (item) =>
                    !item.container &&
                    item.id !== source.id &&
                    item.id !== target.id &&
                    item.x + item.width > minSpanX + 8 &&
                    item.x < maxSpanX - 8,
                );

                const hasIntermediates = intermediateCards.length > 0;
                const directCollides = intermediateCards.some(
                  (item) =>
                    item.y < Math.max(sourceY, targetY) + 12 &&
                    item.y + item.height > Math.min(sourceY, targetY) - 12,
                );

                const mustUseCorridor =
                  level === "L2" &&
                  (isDeniedOrNoGo ||
                    isBackward ||
                    directCollides ||
                    (hasIntermediates && preferCorridor !== "direct"));

                let dPath: string;

                if (mustUseCorridor) {
                  const cardsInSpan = displayNodes.filter(
                    (c) =>
                      !c.container &&
                      c.x + c.width >= minSpanX - 16 &&
                      c.x <= maxSpanX + 16,
                  );
                  cardsInSpan.sort((a, b) => a.x - b.x);

                  const firstObs = cardsInSpan.find((c) => c.id !== source.id && c.x >= sourceX);
                  const lastObs = [...cardsInSpan].reverse().find((c) => c.id !== target.id && c.x + c.width <= targetX);

                  const escapeX = isBackward
                    ? sourceX + 20 + corridorLane * 6
                    : Math.max(
                        sourceX + 16 + corridorLane * 6,
                        firstObs
                          ? Math.min(firstObs.x - 16, sourceX + (firstObs.x - sourceX) * 0.5 + corridorLane * 6)
                          : sourceX + 24 + corridorLane * 6,
                      );

                  const approachX = isBackward
                    ? targetX - 32
                    : Math.min(
                        targetX - 36 - corridorLane * 6,
                        lastObs
                          ? Math.max(
                              lastObs.x + lastObs.width + 12,
                              lastObs.x + lastObs.width + (targetX - (lastObs.x + lastObs.width)) * 0.45 - corridorLane * 6,
                            )
                          : targetX - 36 - corridorLane * 6,
                      );

                  const useAbove =
                    isDeniedOrNoGo ||
                    isBackward ||
                    preferCorridor === "above" ||
                    (preferCorridor !== "below" && targetY < sourceY);

                  if (useAbove) {
                    const highestTop = Math.min(
                      ...cardsInSpan.map((c) => c.y),
                      source.y,
                      target.y,
                    );
                    const effectiveLane = isDeniedOrNoGo ? 2 : corridorLane;
                    const corridorY = highestTop - 36 - effectiveLane * 20;

                    const points = [
                      { x: sourceX, y: sourceY },
                      { x: escapeX, y: sourceY },
                      { x: escapeX, y: corridorY },
                      { x: approachX, y: corridorY },
                      { x: approachX, y: targetY },
                      { x: targetX, y: targetY },
                    ];
                    dPath = roundedPath(points, 12);
                  } else {
                    const lowestBottom = Math.max(
                      ...cardsInSpan.map((c) => c.y + c.height),
                      source.y + source.height,
                      target.y + target.height,
                    );
                    const corridorY = lowestBottom + 36 + corridorLane * 20;

                    const points = [
                      { x: sourceX, y: sourceY },
                      { x: escapeX, y: sourceY },
                      { x: escapeX, y: corridorY },
                      { x: approachX, y: corridorY },
                      { x: approachX, y: targetY },
                      { x: targetX, y: targetY },
                    ];
                    dPath = roundedPath(points, 12);
                  }
                } else {
                  const [stepPath] = getSmoothStepPath({
                    sourceX,
                    sourceY,
                    sourcePosition: Position.Right,
                    targetX,
                    targetY,
                    targetPosition: Position.Left,
                    borderRadius: 12,
                    offset: 16,
                  });
                  dPath = stepPath;
                }

                return (
                  <path
                    key={edge.id}
                    d={dPath}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={isEdgeConnectedToActive ? "2.6" : "1.8"}
                    strokeOpacity={isEdgeConnectedToActive ? "1" : "0.75"}
                    strokeDasharray={dashStyle}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    markerEnd={getMarkerForColor(edgeColor)}
                    className={level === "L1" ? "context-minimap-high-level-edge" : undefined}
                  />
                );
              })}
            </g>

            {/* Nodes with Rounded Corners, Adaptive Font Sizing, and Subtle Green Breathing Glow */}
            {displayNodes.map((node) => {
              const isContainer = node.container;
              const isActive = Boolean(node.active);
              const nodeColor = node.color || "var(--primary)";
              const cornerRadius = isContainer
                ? 36
                : Math.max(20, Math.round(Math.min(node.width, node.height) * 0.12));

              const isOpportunity =
                level === "L2" &&
                (node.type === "opportunityValidation" ||
                  node.id.toLowerCase().includes("opportunity") ||
                  edges.some(
                    (e) =>
                      e.source === node.id &&
                      ["pass-p1-p2", "loi-governed", "csa-pcs", "site-feasibility", "nogo-disqualified", "path-loi"].includes(
                        e.sourceHandle || "",
                      ),
                  ));

              const opportunityOutputs = [
                { id: "pass-p1-p2", label: "P1", topRatio: 0.12, color: "#10b981" },
                { id: "loi-governed", label: "P2", topRatio: 0.28, color: "#2563eb" },
                { id: "csa-pcs", label: "P3", topRatio: 0.44, color: "#0891b2" },
                { id: "site-feasibility", label: "P4", topRatio: 0.60, color: "#d97706" },
                { id: "nogo-disqualified", label: "P5", topRatio: 0.76, color: "#dc2626" },
                { id: "path-loi", label: "PL", topRatio: 0.92, color: "#7c3aed" },
              ];

              if (isContainer) {
                return (
                  <g
                    key={node.id}
                    data-context-map-node-id={node.id}
                    role={onOpenNode ? "button" : undefined}
                    tabIndex={onOpenNode ? 0 : undefined}
                    aria-label={node.label}
                    onClick={() => onOpenNode?.(node.id)}
                    className={onOpenNode ? "cursor-pointer" : undefined}
                  >
                    <title>{node.label}</title>
                    <rect
                      x={node.x}
                      y={node.y}
                      width={Math.max(20, node.width)}
                      height={Math.max(20, node.height)}
                      rx={36}
                      ry={36}
                      fill="var(--muted)"
                      fillOpacity={0.16}
                      stroke="var(--border)"
                      strokeOpacity={0.7}
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    <foreignObject
                      x={node.x + 16}
                      y={node.y + 10}
                      width={Math.max(1, node.width - 32)}
                      height={32}
                      className="pointer-events-none"
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="size-2.5 shrink-0 rounded-full bg-primary/70" />
                        <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {node.label}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                );
              }

              // Adaptive font sizing based on card width, height, and label length
              const charCount = Math.max(1, node.label.length);
              const widthScale = (node.width - 24) / Math.max(4, Math.min(charCount * 0.32, 10));
              const heightScale = (node.height - 24) * 0.25;
              const adaptiveFontSize = Math.max(
                level === "L1" ? 14 : 18,
                Math.min(level === "L1" ? 26 : 42, Math.round(Math.min(widthScale, heightScale))),
              );

              return (
                <g
                  key={node.id}
                  data-context-map-node-id={node.id}
                  role={onOpenNode ? "button" : undefined}
                  tabIndex={onOpenNode ? 0 : undefined}
                  aria-label={node.label}
                  onClick={() => onOpenNode?.(node.id)}
                  onKeyDown={(event) => {
                    if (!onOpenNode || !["Enter", " "].includes(event.key)) return;
                    event.preventDefault();
                    onOpenNode(node.id);
                  }}
                  className={onOpenNode ? "cursor-pointer group" : undefined}
                >
                  <title>{node.label}</title>

                  {/* Active Node: Refined, Thin Green Breathing Glow */}
                  {isActive ? (
                    <rect
                      x={node.x - 3}
                      y={node.y - 3}
                      width={node.width + 6}
                      height={node.height + 6}
                      rx={cornerRadius + 2}
                      ry={cornerRadius + 2}
                      fill="none"
                      stroke="#10b981"
                      strokeOpacity="0.8"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                      className="node-green-breathe"
                    />
                  ) : null}

                  {/* Card Base with Smooth Rounded Corners */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={cornerRadius}
                    ry={cornerRadius}
                    fill={isActive ? "color-mix(in srgb, #10b981 10%, var(--card))" : "var(--card)"}
                    fillOpacity={1}
                    stroke={isActive ? "#10b981" : "var(--border)"}
                    strokeOpacity={isActive ? 1 : 0.6}
                    strokeWidth={isActive ? 2 : 1.4}
                    vectorEffect="non-scaling-stroke"
                    filter={`url(#context-card-shadow-${level})`}
                    className="transition-all"
                  />

                  {/* Opportunity Node with 6 Stepped Pipeline */}
                  {isOpportunity ? (
                    <foreignObject
                      x={node.x + 8}
                      y={node.y + 8}
                      width={Math.max(1, node.width - 16)}
                      height={Math.max(1, node.height - 16)}
                      className="pointer-events-none"
                    >
                      <div className="flex h-full w-full flex-col justify-between p-2 font-sans select-none">
                        {/* Header Row in Minimap */}
                        <div className="flex items-center justify-between border-b border-border/50 pb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="flex size-5 items-center justify-center rounded-md bg-primary/15 text-primary text-xs font-bold shrink-0">
                              🎯
                            </span>
                            <span className="text-xs font-bold text-foreground truncate">
                              {node.label}
                            </span>
                          </div>
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0 border border-emerald-500/30">
                            Active: Step 1 · Intake
                          </span>
                        </div>

                        {/* 6 Steps Row in Minimap */}
                        <div className="grid grid-cols-6 gap-1.5 mt-1">
                          {[
                            { num: "STEP 1", title: "Intake", sub: "Evidence", status: "Active", active: true },
                            { num: "STEP 2", title: "Blockers", sub: "Eligibility", status: "Pending", active: false },
                            { num: "STEP 3", title: "Reality", sub: "Class D", status: "Pending", active: false },
                            { num: "STEP 4", title: "Routing", sub: "Commercial", status: "Pending", active: false },
                            { num: "STEP 5", title: "Approval", sub: "CEO Sign", status: "Locked", active: false },
                            { num: "STEP 6", title: "Handoff", sub: "G1 Dossier", status: "Locked", active: false },
                          ].map((step) => (
                            <div
                              key={step.num}
                              className={cn(
                                "rounded-lg border p-1 text-center transition-all flex flex-col justify-between",
                                step.active
                                  ? "border-emerald-500 bg-emerald-500/20 shadow-xs ring-1 ring-emerald-500/60"
                                  : "border-border/60 bg-card/60 opacity-80",
                              )}
                            >
                              <div>
                                <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                                  {step.num}
                                </div>
                                <div className="text-[11px] font-black text-foreground truncate mt-0.5">
                                  {step.title}
                                </div>
                                <div className="text-[9px] text-muted-foreground truncate font-medium">
                                  {step.sub}
                                </div>
                              </div>
                              <div className="mt-0.5">
                                <span
                                  className={cn(
                                    "inline-block rounded px-1 py-0.2 text-[7.5px] font-bold uppercase",
                                    step.active
                                      ? "bg-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                                      : "bg-muted text-muted-foreground",
                                  )}
                                >
                                  {step.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </foreignObject>
                  ) : (
                    /* Default Node Title */
                    <foreignObject
                      x={node.x + 14}
                      y={node.y + 14}
                      width={Math.max(1, node.width - 28)}
                      height={Math.max(1, node.height - 28)}
                      className="pointer-events-none"
                    >
                      <div className="flex h-full w-full items-center justify-center p-1 font-sans select-none text-center">
                        <span
                          className={cn(
                            "line-clamp-4 font-normal tracking-tight text-foreground",
                            isActive && "font-medium text-emerald-950 dark:text-emerald-50",
                          )}
                          style={{
                            fontSize: adaptiveFontSize,
                            lineHeight: 1.3,
                          }}
                        >
                          {node.label}
                        </span>
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs leading-4 text-muted-foreground">
            No {level} workflow yet
          </div>
        )}
      </div>

      {/* Interactive Step Navigator Strip */}
      {hasNodes ? (
        <div
          ref={nodeListScroller}
          className={cn(
            "scroll-thin flex overflow-x-auto border-t",
            level === "L1"
              ? "gap-1.5 px-2.5 py-1.5 bg-transparent"
              : compact
                ? "gap-1 px-2 py-1 bg-background/80"
                : "gap-1.5 px-2.5 py-1.5 bg-background/80",
          )}
        >
          {orderedNavigatorNodes.map((node, index) => (
            <button
              key={node.id}
              data-context-node-active={node.active ? "true" : undefined}
              type="button"
              onClick={() => onOpenNode?.(node.id)}
              disabled={!onOpenNode}
              title={node.label}
              className={cn(
                "flex shrink-0 items-center transition-all",
                compact
                  ? "max-w-40 gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium"
                  : "max-w-48 gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold",
                node.active
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 shadow-xs"
                  : "bg-card/70 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
                  compact ? "size-3.5 text-[8px]" : "size-4 text-[9px]",
                  node.active
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="truncate">{node.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Status Bar */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-t text-muted-foreground",
          level === "L1"
            ? "min-h-7 px-2.5 py-1 text-[11px] bg-transparent"
            : compact
              ? "min-h-7 px-2.5 py-1 text-[10px] bg-muted/10"
              : "min-h-9 px-3.5 py-2 text-xs bg-muted/10",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1.5 truncate",
            activeLabel && "font-semibold text-emerald-600 dark:text-emerald-400",
          )}
        >
          {activeLabel ? (
            <>
              <span className="size-2 rounded-full bg-emerald-500 node-beacon-pulse shrink-0" />
              <span>Current Target · {activeLabel}</span>
            </>
          ) : (
            "Select a node to reveal context"
          )}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/75">
          Drag or scroll horizontally to explore
        </span>
      </div>
    </section>
  );
}
