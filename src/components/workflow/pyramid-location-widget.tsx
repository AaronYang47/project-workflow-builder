"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import {
  ChevronDown,
  Download,
  Layers,
  LocateFixed,
  Maximize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { EXPORT_EVENT } from "@/lib/export/export-formats";
import {
  type ViewLayer,
  type PositionedCard,
  L1_ACTION_H,
  L2_ACTION_H,
  LAYER_RAIL,
  ZOOM_STEP,
  ZOOM_ANIMATION_MS,
  type Camera,
  clampZoom,
  cameraAtPoint,
  fitCamera,
  UNLINKED_L1_ID,
  linkedIds,
  buildGlobalPyramidGroups,
  findOwningL1Id,
  statusTone,
  statusLabel,
  cardBadgeStatus,
} from "@/lib/process-locator/pyramid-layout";
import { exportPixelRatio } from "@/lib/export/canvas-limits";
import { buildPyramidDiagram } from "@/lib/process-locator/pyramid-diagram";
import { useDockCorner } from "./process-locator/use-dock-corner";

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
  const highLevelNodes = useWorkflowStore((state) => state.file.highLevel?.graph.nodes ?? []);
  const highLevelEdges = useWorkflowStore((state) => state.file.highLevel?.graph.edges ?? []);
  const layer2Edges = useWorkflowStore((state) => state.file.graph.edges);
  const executionItems = useWorkflowStore((state) => state.file.execution?.items ?? []);
  const operations = useWorkflowStore((state) => state.file.operations);

  const [open, setOpen] = useState(false);
  const [collapsedL1Selection, setCollapsedL1Ids] = useState<Set<string>>(() => new Set<string>());
  const [collapsedL2Selection, setCollapsedL2Ids] = useState<Set<string>>(() => new Set<string>());
  const {
    dock,
    dockPos,
    dockDragging,
    dockMagnet,
    dockButtonRef,
    finishDockDrag,
    onDockPointerDown,
    onDockPointerMove,
  } = useDockCorner(() => setOpen(true));
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

  // Collapsed IDs of nodes that no longer exist are ignored; new nodes start expanded.
  const collapsibleL1Ids = useMemo(
    () =>
      new Set(
        buildGlobalPyramidGroups(
          orderHighLevelNodes(highLevelNodes, highLevelEdges),
          nodes,
          executionItems,
          layer2Edges,
        )
          .filter((group) => group.l2.length)
          .map((group) => group.l1.id),
      ),
    [executionItems, highLevelEdges, highLevelNodes, layer2Edges, nodes],
  );
  const collapsedL1Ids = useMemo(
    () => new Set([...collapsedL1Selection].filter((id) => collapsibleL1Ids.has(id))),
    [collapsedL1Selection, collapsibleL1Ids],
  );
  const collapsedL2Ids = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    return new Set([...collapsedL2Selection].filter((id) => nodeIds.has(id)));
  }, [collapsedL2Selection, nodes]);

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

  const focusLayer2Id = useMemo(() => {
    if (viewLayer === "L3" && executionNodeId) return executionNodeId;
    if (viewLayer === "L2" && selection.nodeIds[0]) return selection.nodeIds[0];
    if (viewLayer === "L1") {
      const hl = highLevelNodes.find((node) => highLevelSelection.nodeIds.includes(node.id));
      return hl ? linkedIds(hl)[0] : undefined;
    }
    return selection.nodeIds[0] || executionNodeId || undefined;
  }, [viewLayer, executionNodeId, selection.nodeIds, highLevelSelection.nodeIds, highLevelNodes]);

  const focusL1Id = useMemo(() => {
    if (viewLayer === "L1" && highLevelSelection.nodeIds[0]) {
      return highLevelSelection.nodeIds[0];
    }
    return findOwningL1Id(focusLayer2Id, highLevelNodes, nodes, executionItems, layer2Edges);
  }, [
    viewLayer,
    highLevelSelection.nodeIds,
    focusLayer2Id,
    highLevelNodes,
    nodes,
    executionItems,
    layer2Edges,
  ]);

  const diagram = useMemo(
    () =>
      buildPyramidDiagram({
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
      }),
    [
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
    ],
  );

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
  }, [animateCameraTo, frameSize.width, frameSize.height, diagram.width, diagram.height]);

  useEffect(() => {
    if (!open) {
      hasFittedRef.current = false;
      cancelCameraAnimation();
      return;
    }
    if (hasFittedRef.current || !frameSize.width || !diagram.width) return;
    applyCamera(fitCamera(frameSize.width, frameSize.height, diagram.width, diagram.height));
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
        event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL || Math.abs(event.deltaY) >= 80;

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
      const zoom = clampZoom(current.zoom * (direction === "in" ? ZOOM_STEP : 1 / ZOOM_STEP));
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

      const { captureToPng: toPng } = await import("@/lib/export/capture");
      const { jsPDF } = await import("jspdf");

      // Read the expanded DOM, not the collapsed dimensions from this callback's render.
      const width = Math.max(1, el.offsetWidth);
      const height = Math.max(1, el.offsetHeight);
      const backgroundColor = getComputedStyle(diagramFrameRef.current ?? el).backgroundColor;

      const dataUrl = await toPng(el, {
        backgroundColor,
        pixelRatio: exportPixelRatio(width, height),
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
    window.addEventListener(EXPORT_EVENT, handleExport);
    return () => window.removeEventListener(EXPORT_EVENT, handleExport);
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
                          stroke={
                            edge.flowing
                              ? edge.direction === "down"
                                ? "#f59e0b"
                                : "#159a75"
                              : "#94a3b8"
                          }
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
            dockDragging
              ? "cursor-grabbing"
              : "cursor-grab hover:border-slate-700 hover:shadow-[0_8px_20px_rgba(15,23,42,0.2)]",
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
            dockMagnet || !dockDragging
              ? "transition-[top,left,right,bottom,box-shadow] duration-150 ease-out"
              : undefined,
          )}
          style={
            dockPos ? { top: dockPos.y, left: dockPos.x, right: "auto", bottom: "auto" } : undefined
          }
        >
          <span className="flex w-12 flex-col items-center justify-center bg-[#1e2937] text-slate-100">
            <span className="font-mono text-[11px] font-bold tracking-[0.14em]">{viewLayer}</span>
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
