"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Boxes,
  CircleCheck,
  Factory,
  Flag,
  GripVertical,
  Layers3,
  Milestone,
  Pencil,
  Ruler,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhaseGradientColors } from "@/lib/chapter-phase-gradient";
import type { HighLevelNodeType } from "@/types/workflow";

export type HighLevelFlowNode = Node<
  {
    title: string;
    description: string;
    code?: string;
    backgroundColor?: string;
    type: HighLevelNodeType;
    linkedDetailedNodeIds?: string[];
    linkedLayer2Nodes?: Array<{ id: string; title: string; chapterTitle: string; gate?: { id: string; title: string }; conditionLabels: string[]; phaseGradientColors?: PhaseGradientColors }>;
    availableGates?: Array<{ id: string; title: string; eligibleNodeIds: string[] }>;
    onLinkedLayer2NodeClick?: (id: string) => void;
    onViewAllLinkedLayer2Nodes?: () => void;
    onReorderLinkedLayer2Nodes?: (draggedId: string, targetId: string) => void;
    onReorderLinkedLayer2Gate?: (gateId: string, targetId: string, position: "before" | "after") => void;
    onSetLinkedLayer2GateMember?: (gateId: string, nodeId: string, included: boolean) => void;
  },
  HighLevelNodeType
>;

function FlowHandles({
  source = true,
  target = true,
}: {
  source?: boolean;
  target?: boolean;
}) {
  return (
    <>
      {target ? (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={true}
          className="!size-3.5 !border-2 !border-background !bg-primary hover:!scale-125 transition-transform cursor-crosshair shadow-xs"
        />
      ) : null}
      {source ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="!size-3.5 !border-2 !border-background !bg-primary hover:!scale-125 transition-transform cursor-crosshair shadow-xs"
        />
      ) : null}
    </>
  );
}

function getHighLevelVisual(type: HighLevelNodeType, title: string) {
  if (type === "start") {
    return {
      Icon: Flag,
      eyebrow: "Entry point",
      code: "START",
      accent: "bg-emerald-500",
      border: "border-emerald-500/45",
      icon: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }

  if (type === "end") {
    return {
      Icon: CircleCheck,
      eyebrow: "Closeout",
      code: "",
      accent: "bg-slate-500",
      border: "border-slate-400/55",
      icon: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
      badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    };
  }

  if (type === "primaryGate") {
    const gateCode = title.match(/^(G\d+)/)?.[1] ?? "GATE";
    return {
      Icon: Milestone,
      eyebrow: "Primary control",
      code: gateCode,
      accent: "bg-primary",
      border: "border-primary/50",
      icon: "bg-primary/12 text-primary",
      badge: "bg-primary/10 text-primary",
    };
  }

  const normalizedTitle = title.toUpperCase();
  if (normalizedTitle.includes("INITIAL CONTACT")) {
    return { Icon: Flag, eyebrow: "Lifecycle phase", code: "P01", accent: "bg-emerald-500", border: "border-emerald-500/35", icon: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  }
  if (normalizedTitle.includes("PRE-CONSTRUCTION")) {
    return { Icon: Ruler, eyebrow: "Lifecycle phase", code: "P04", accent: "bg-amber-500", border: "border-amber-500/40", icon: "bg-amber-500/12 text-amber-700 dark:text-amber-300", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  }
  if (normalizedTitle.includes("READINESS")) {
    return { Icon: ShieldCheck, eyebrow: "Lifecycle phase", code: "P06", accent: "bg-violet-500", border: "border-violet-500/35", icon: "bg-violet-500/12 text-violet-600 dark:text-violet-300", badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300" };
  }
  if (normalizedTitle.includes("FACTORY PRODUCTION")) {
    return { Icon: Factory, eyebrow: "Lifecycle phase", code: "P08", accent: "bg-orange-500", border: "border-orange-500/40", icon: "bg-orange-500/12 text-orange-700 dark:text-orange-300", badge: "bg-orange-500/10 text-orange-700 dark:text-orange-300" };
  }
  if (normalizedTitle.includes("DELIVERY")) {
    return { Icon: Truck, eyebrow: "Lifecycle phase", code: "P10", accent: "bg-cyan-500", border: "border-cyan-500/40", icon: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300", badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" };
  }
  if (normalizedTitle.includes("COMMISSIONING")) {
    return { Icon: Wrench, eyebrow: "Lifecycle phase", code: "P12", accent: "bg-teal-500", border: "border-teal-500/40", icon: "bg-teal-500/12 text-teal-700 dark:text-teal-300", badge: "bg-teal-500/10 text-teal-700 dark:text-teal-300" };
  }

  return { Icon: Boxes, eyebrow: "Lifecycle phase", code: "PHASE", accent: "bg-sky-500", border: "border-sky-500/35", icon: "bg-sky-500/12 text-sky-600 dark:text-sky-300", badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300" };
}

function HighLevelNodeComponent({ data }: NodeProps<HighLevelFlowNode>) {
  const linkedNodeListRef = useRef<HTMLDivElement | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    nodeId: string;
    deltaY: number;
    targetId?: string;
    sourceIndex: number;
    targetIndex: number;
    rowStep: number;
  } | null>(null);
  const [gateDragVisual, setGateDragVisual] = useState<{ gateId: string; deltaY: number; targetId?: string } | null>(null);
  const dragFrame = useRef<number | null>(null);
  const gateDragFrame = useRef<number | null>(null);
  const pendingDragVisual = useRef<typeof dragVisual>(null);
  const pendingGateDragVisual = useRef<typeof gateDragVisual>(null);
  const [openGateEditor, setOpenGateEditor] = useState<string | null>(null);
  const linkedGateDrag = useRef<{
    gateId: string;
    pointerId: number;
    startY: number;
    sourceTop: number;
    sourceBottom: number;
    candidates: Array<{ id: string; centerY: number }>;
    targetId?: string;
    position: "before" | "after";
  } | null>(null);
  const linkedNodeDrag = useRef<{
    nodeId: string;
    pointerId: number;
    startY: number;
    sourceIndex: number;
    rowStep: number;
    rowCenters: Array<{ id: string; y: number }>;
    active: boolean;
    targetId?: string;
  } | null>(null);
  const queueDragVisual = (next: NonNullable<typeof dragVisual>) => {
    pendingDragVisual.current = next;
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      setDragVisual(pendingDragVisual.current);
    });
  };
  const clearDragVisual = () => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    pendingDragVisual.current = null;
    setDragVisual(null);
  };
  const queueGateDragVisual = (next: NonNullable<typeof gateDragVisual>) => {
    pendingGateDragVisual.current = next;
    if (gateDragFrame.current !== null) return;
    gateDragFrame.current = requestAnimationFrame(() => {
      gateDragFrame.current = null;
      setGateDragVisual(pendingGateDragVisual.current);
    });
  };
  const clearGateDragVisual = () => {
    if (gateDragFrame.current !== null) cancelAnimationFrame(gateDragFrame.current);
    gateDragFrame.current = null;
    pendingGateDragVisual.current = null;
    setGateDragVisual(null);
  };
  useEffect(() => () => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    if (gateDragFrame.current !== null) cancelAnimationFrame(gateDragFrame.current);
  }, []);
  const visual = getHighLevelVisual(data.type, data.title);
  const code = data.code?.trim() || visual.code;
  const nodeColor = data.type === "phase" || data.type === "start" || data.type === "end"
    ? getNodeColor(data.backgroundColor === "transparent" ? undefined : data.backgroundColor)
    : undefined;
  const VisualIcon = visual.Icon;
  const linkedNodes = data.linkedLayer2Nodes || [];
  const gateMemberCounts = new Map<string, number>();
  for (const node of linkedNodes) {
    if (node.gate) gateMemberCounts.set(node.gate.id, (gateMemberCounts.get(node.gate.id) ?? 0) + 1);
  }
  const linkedGroups = linkedNodes.reduce<Array<{
    gate?: { id: string; title: string };
    nodes: Array<{ node: (typeof linkedNodes)[number]; index: number }>;
  }>>((groups, node, index) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.gate?.id === node.gate?.id) {
      previous.nodes.push({ node, index });
    } else {
      groups.push({ gate: node.gate, nodes: [{ node, index }] });
    }
    return groups;
  }, []);
  for (const gate of data.availableGates ?? []) {
    if (!linkedGroups.some((group) => group.gate?.id === gate.id)) {
      linkedGroups.push({ gate: { id: gate.id, title: gate.title }, nodes: [] });
    }
  }
  const linkedNodeList = linkedNodes.length ? (
    <div ref={linkedNodeListRef} className="nodrag mt-3 border-t pt-2.5" style={{ borderColor: nodeColor ? `rgb(var(--node-glass-tint) / 24%)` : "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Linked Departments
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold border"
          style={
            nodeColor
              ? {
                  color: "var(--foreground)",
                  backgroundColor: `rgb(var(--node-glass-tint) / 16%)`,
                  borderColor: `rgb(var(--node-glass-tint) / 30%)`,
                }
              : undefined
          }
        >
          {linkedNodes.length}
        </span>
      </div>
      {linkedNodes.some((item) => item.conditionLabels.length) ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {linkedNodes.reduce((count, item) => count + item.conditionLabels.length, 0)} release conditions across linked Departments
        </p>
      ) : null}
      <div className="mt-2 space-y-1.5">
        {linkedGroups.map((group, groupIndex) => (
          <div key={`${group.gate?.id ?? "ungated"}-${group.nodes[0]?.node.id ?? "empty"}`}>
            <div
              data-linked-gate-id={group.gate?.id}
              data-gate-dragging={gateDragVisual?.gateId === group.gate?.id || undefined}
              aria-label={group.gate ? `${group.gate.title} Gate frame` : undefined}
              className={cn(
                group.gate && "rounded-lg",
                gateDragVisual?.gateId === group.gate?.id && "opacity-70",
              )}
              style={{
                transform: gateDragVisual && group.gate && gateDragVisual.gateId === group.gate.id
                  ? `translateY(${gateDragVisual.deltaY}px)`
                  : undefined,
                position: gateDragVisual && group.gate && gateDragVisual.gateId === group.gate.id ? "relative" : undefined,
                zIndex: gateDragVisual && group.gate && gateDragVisual.gateId === group.gate.id ? 30 : undefined,
              }}
            >
            {group.gate ? (
              <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[9px] font-bold text-violet-700 dark:text-violet-300">
                <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{group.gate.title}</span>
                <span className="ml-auto shrink-0 font-medium opacity-80">
                  Gate · {group.nodes.length}{group.nodes.length < (gateMemberCounts.get(group.gate.id) ?? 0)
                    ? ` of ${gateMemberCounts.get(group.gate.id)}`
                    : ""}
                </span>
                <button
                  type="button"
                  aria-label={`Edit ${group.gate.title} Gate members`}
                  aria-expanded={openGateEditor === group.gate.id}
                  title="Add or remove linked workflow nodes"
                  className="nodrag flex size-5 shrink-0 items-center justify-center rounded border border-violet-500/40 hover:bg-violet-500/20"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenGateEditor((current) => current === group.gate!.id ? null : group.gate!.id);
                  }}
                >
                  <Pencil aria-hidden className="size-3" />
                </button>
                {group.nodes.length === gateMemberCounts.get(group.gate.id) && linkedNodes.length > group.nodes.length ? (
                  <button
                    type="button"
                    data-gate-reorder-handle
                    aria-label={`Drag ${group.gate.title} Gate group to reorder`}
                    title="Drag this Gate and its linked workflow nodes"
                    className={cn("nodrag flex size-5 shrink-0 touch-none cursor-grab items-center justify-center rounded border border-violet-500/40 hover:bg-violet-500/20 active:cursor-grabbing", gateDragVisual?.gateId === group.gate.id && "cursor-grabbing bg-violet-500/20")}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const sourceRect = event.currentTarget.closest<HTMLElement>("[data-linked-gate-id]")?.getBoundingClientRect();
                      const candidates = Array.from(linkedNodeListRef.current
                        ?.querySelectorAll<HTMLElement>("[data-linked-workflow-node-id]") ?? [])
                        .filter((row) => !linkedNodes.some((node) =>
                          node.id === row.dataset.linkedWorkflowNodeId && node.gate?.id === group.gate!.id))
                        .map((row) => {
                          const rect = row.getBoundingClientRect();
                          return { id: row.dataset.linkedWorkflowNodeId!, centerY: rect.top + rect.height / 2 };
                        });
                      linkedGateDrag.current = {
                        gateId: group.gate!.id,
                        pointerId: event.pointerId,
                        startY: event.clientY,
                        sourceTop: sourceRect?.top ?? event.clientY,
                        sourceBottom: sourceRect?.bottom ?? event.clientY,
                        candidates,
                        position: "before",
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      const drag = linkedGateDrag.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      event.stopPropagation();
                      const beyondGroup = event.clientY < drag.sourceTop - 8 || event.clientY > drag.sourceBottom + 8;
                      const target = beyondGroup && drag.candidates.length
                        ? drag.candidates.reduce((nearest, candidate) =>
                            Math.abs(candidate.centerY - event.clientY) < Math.abs(nearest.centerY - event.clientY)
                              ? candidate : nearest)
                        : undefined;
                      drag.targetId = target?.id;
                      if (target) drag.position = event.clientY > target.centerY ? "after" : "before";
                      queueGateDragVisual({ gateId: drag.gateId, deltaY: event.clientY - drag.startY, targetId: drag.targetId });
                    }}
                    onPointerUp={(event) => {
                      const drag = linkedGateDrag.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      event.stopPropagation();
                      if (drag.targetId) data.onReorderLinkedLayer2Gate?.(drag.gateId, drag.targetId, drag.position);
                      linkedGateDrag.current = null;
                      clearGateDragVisual();
                    }}
                    onPointerCancel={(event) => {
                      event.stopPropagation();
                      linkedGateDrag.current = null;
                      clearGateDragVisual();
                    }}
                  >
                    <GripVertical aria-hidden className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {group.gate && openGateEditor === group.gate.id ? (
              <div
                className="nodrag mb-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-violet-500/30 bg-card/95 p-2 text-[10px]"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <p className="pb-1 font-semibold text-violet-700 dark:text-violet-300">Gate members</p>
                {linkedNodes.filter((candidate) => data.availableGates
                  ?.find((gate) => gate.id === group.gate!.id)
                  ?.eligibleNodeIds.includes(candidate.id)).map((candidate) => {
                  const checked = candidate.gate?.id === group.gate!.id;
                  return (
                    <label key={candidate.id} className="flex cursor-pointer items-start gap-1.5 rounded px-1 py-1 hover:bg-violet-500/10">
                      <input
                        type="checkbox"
                        aria-label={`${checked ? "Remove" : "Add"} ${candidate.title} ${checked ? "from" : "to"} ${group.gate!.title}`}
                        checked={checked}
                        onChange={() => data.onSetLinkedLayer2GateMember?.(group.gate!.id, candidate.id, !checked)}
                        className="mt-0.5 accent-violet-600"
                      />
                      <span className="min-w-0 truncate" title={candidate.title}>{candidate.title}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            {group.nodes.map(({ node: linkedNode, index }, groupNodeIndex) => (
          <div
            key={linkedNode.id}
            data-linked-workflow-row={linkedNode.id}
            className={cn("relative", dragVisual?.nodeId === linkedNode.id ? "transition-none" : "transition-transform duration-150")}
            style={{
              transform: dragVisual?.nodeId === linkedNode.id
                ? `translateY(${dragVisual.deltaY}px)`
                : dragVisual && dragVisual.sourceIndex < dragVisual.targetIndex &&
                    index > dragVisual.sourceIndex && index <= dragVisual.targetIndex
                  ? `translateY(-${dragVisual.rowStep}px)`
                  : dragVisual && dragVisual.targetIndex < dragVisual.sourceIndex &&
                      index >= dragVisual.targetIndex && index < dragVisual.sourceIndex
                    ? `translateY(${dragVisual.rowStep}px)`
                    : undefined,
              zIndex: dragVisual?.nodeId === linkedNode.id ? 20 : undefined,
              willChange: dragVisual?.nodeId === linkedNode.id ? "transform" : undefined,
            }}
          >
            <div
              data-linked-workflow-node-id={linkedNode.id}
              aria-label={`Reorder ${linkedNode.title}`}
              data-dragging={dragVisual?.nodeId === linkedNode.id || undefined}
              data-drop-target={dragVisual?.targetId === linkedNode.id || undefined}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                "nodrag flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 shadow-2xs transition-[background-color,border-color,box-shadow,opacity] duration-200 hover:border-primary/40 hover:bg-primary/[0.025]",
                (dragVisual?.targetId === linkedNode.id || gateDragVisual?.targetId === linkedNode.id) && "!border-primary bg-primary/[0.10] ring-2 ring-primary/20 shadow-md",
                dragVisual?.nodeId === linkedNode.id && "!border-primary bg-primary/[0.12] opacity-65 shadow-lg",
              )}
              style={{
                backgroundImage: linkedNode.phaseGradientColors
                  ? `linear-gradient(90deg, color-mix(in srgb, ${linkedNode.phaseGradientColors.left} 24%, transparent), color-mix(in srgb, ${linkedNode.phaseGradientColors.right} 24%, transparent))`
                  : undefined,
                backgroundColor: nodeColor
                  ? "color-mix(in srgb, var(--card) 92%, rgb(var(--node-glass-tint)) 8%)"
                  : "var(--card)",
                borderColor: nodeColor
                  ? linkedNode.phaseGradientColors
                    ? `color-mix(in srgb, ${linkedNode.phaseGradientColors.left} 50%, ${linkedNode.phaseGradientColors.right})`
                    : "rgb(var(--node-glass-tint) / 25%)"
                  : "var(--border)",
              }}
            >
              <span
                title={linkedNode.chapterTitle}
                aria-label={linkedNode.chapterTitle}
                className="flex w-7 shrink-0 flex-col items-center justify-center rounded-md border py-1 text-[7px] font-bold leading-[1.05] tracking-tight"
                style={{
                  backgroundColor: nodeColor
                    ? "rgb(var(--node-glass-tint) / 20%)"
                    : "var(--muted)",
                  borderColor: nodeColor
                    ? "rgb(var(--node-glass-tint) / 32%)"
                    : "transparent",
                  color: "var(--foreground)",
                }}
              >
                <>
                  <span>CH</span>
                  <span>{linkedNode.chapterTitle.match(/^chapter\s+(.+)$/i)?.[1] ?? linkedNode.chapterTitle}</span>
                </>
              </span>
              <button
                type="button"
                data-reorder-handle
                aria-label={`Drag to reorder ${linkedNode.title}`}
                title="Drag to reorder"
                className={cn("nodrag flex size-5 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground/70 cursor-grab hover:bg-primary/10 hover:text-primary active:cursor-grabbing", dragVisual?.nodeId === linkedNode.id && "cursor-grabbing bg-primary/15 text-primary")}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rows = Array.from(linkedNodeListRef.current
                    ?.querySelectorAll<HTMLElement>("[data-linked-workflow-row]") ?? []);
                  const row = event.currentTarget.closest<HTMLElement>("[data-linked-workflow-row]");
                  const rect = row?.getBoundingClientRect();
                  const sourceIndex = linkedNodes.findIndex((node) => node.id === linkedNode.id);
                  linkedNodeDrag.current = {
                    nodeId: linkedNode.id,
                    pointerId: event.pointerId,
                    startY: event.clientY,
                    sourceIndex,
                    rowStep: (rect?.height ?? 32) + 6,
                    rowCenters: rows.map((item) => {
                      const bounds = item.getBoundingClientRect();
                      return { id: item.dataset.linkedWorkflowRow!, y: bounds.top + bounds.height / 2 };
                    }),
                    active: false,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = linkedNodeDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  event.stopPropagation();
                  if (!drag.active && Math.abs(event.clientY - drag.startY) < 4) return;
                  drag.active = true;
                  const target = drag.rowCenters.reduce((nearest, item) =>
                    Math.abs(item.y - event.clientY) < Math.abs(nearest.y - event.clientY) ? item : nearest,
                  );
                  const targetIndex = linkedNodes.findIndex((node) => node.id === target.id);
                  drag.targetId = target.id;
                  queueDragVisual({
                    nodeId: drag.nodeId,
                    deltaY: event.clientY - drag.startY,
                    targetId: target.id,
                    sourceIndex: drag.sourceIndex,
                    targetIndex,
                    rowStep: drag.rowStep,
                  });
                }}
                onPointerUp={(event) => {
                  const drag = linkedNodeDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (drag.active && drag.targetId && drag.targetId !== drag.nodeId) {
                    data.onReorderLinkedLayer2Nodes?.(drag.nodeId, drag.targetId);
                  }
                  linkedNodeDrag.current = null;
                  clearDragVisual();
                }}
                onPointerCancel={(event) => {
                  event.stopPropagation();
                  linkedNodeDrag.current = null;
                  clearDragVisual();
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <GripVertical aria-hidden className="size-3.5" />
              </button>
              <button
                type="button"
                className="nodrag min-w-0 flex-1 whitespace-normal break-words text-left text-[11px] font-semibold text-foreground hover:text-primary hover:underline transition-colors"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onLinkedLayer2NodeClick?.(linkedNode.id);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                title={linkedNode.title}
              >
                {linkedNode.title}
              </button>
              {linkedNode.conditionLabels.length ? (
                <span
                  title={linkedNode.conditionLabels.join("\n")}
                  aria-label={`${linkedNode.conditionLabels.length} release conditions: ${linkedNode.conditionLabels.join(", ")}`}
                  className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary"
                >
                  RC {linkedNode.conditionLabels.length}
                </span>
              ) : null}
            </div>
            {groupNodeIndex < group.nodes.length - 1 ? (
              <span aria-hidden className="block py-0.5 text-center text-[9px] font-bold text-muted-foreground/60">
                ↓
              </span>
            ) : null}
          </div>
            ))}
            </div>
            {groupIndex < linkedGroups.length - 1 ? (
              <span aria-hidden className="block pt-1.5 text-center text-[9px] font-bold text-muted-foreground/60">↓</span>
            ) : null}
          </div>
        ))}
      </div>
      {linkedNodes.length > 1 ? (
        <button
          type="button"
          className="nodrag mt-1.5 text-[9px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            data.onViewAllLinkedLayer2Nodes?.();
          }}
        >
          View All
        </button>
      ) : null}
    </div>
  ) : null;

  if (data.type === "primaryGate") {
    return (
      <div className={cn("high-level-node-card relative w-72 min-w-72 max-w-72 overflow-visible rounded-2xl border bg-primary/[0.055] shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition-all", visual.border)}>
        <FlowHandles />
        <div className="p-3 pl-4 text-center">
          <div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
            <VisualIcon className="size-4" />
            {code ? <span className="rounded-full border border-primary/25 bg-white/10 px-1.5 py-0.5 text-[9px] tracking-tight dark:bg-white/[0.12]">{code}</span> : null}
          </div>
          <p className="mt-3 text-[14px] font-bold leading-5 text-foreground">{data.title}</p>
          {data.description ? <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{data.description}</p> : null}
          {linkedNodeList}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "high-level-node-card relative flex flex-col overflow-visible rounded-2xl border shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition-all",
        data.type === "phase" ? "w-72 min-w-72 max-w-72" : data.type === "start" || data.type === "end" ? "w-64 min-w-64 max-w-64 min-h-[184px]" : "w-52 min-w-52 max-w-52 bg-card",
        data.type !== "phase" && !nodeColor ? visual.border : "",
      )}
      data-glass-tint={nodeColor ? "true" : undefined}
      style={nodeColor ? { "--node-glass-tint": nodeColor.tint } as CSSProperties : undefined}
    >
      <FlowHandles target={data.type !== "start"} source={data.type !== "end"} />
      <div className={cn("flex flex-1 flex-col p-4 pl-5", data.type === "start" || data.type === "end" ? "min-h-[148px]" : "")}>
        <div className="flex items-center gap-3">
          <span
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-xs", nodeColor ? "" : visual.icon)}
            style={
              nodeColor
                ? {
                    backgroundColor: `rgb(var(--node-glass-tint) / 16%)`,
                    color: "var(--tint-accent-text)",
                    borderColor: `rgb(var(--node-glass-tint) / 32%)`,
                  }
                : undefined
            }
          >
            <VisualIcon className="size-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-[16px] font-bold leading-5 text-foreground">{data.title}</p>
              {code ? (
                <span
                  className={cn("max-w-[150px] shrink-0 whitespace-normal break-words rounded-full px-2.5 py-0.5 text-center text-[9px] font-bold leading-3 tracking-wider uppercase border", nodeColor ? "" : visual.badge)}
                  style={
                    nodeColor
                      ? {
                          color: "var(--tint-accent-text)",
                          backgroundColor: `rgb(var(--node-glass-tint) / 14%)`,
                          borderColor: `rgb(var(--node-glass-tint) / 28%)`,
                        }
                      : undefined
                  }
                >
                  {code}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {data.description ? <p className="mt-2 text-[12px] font-medium leading-5 text-muted-foreground">{data.description}</p> : null}
        {linkedNodeList}
      </div>
    </div>
  );
}

export type NodeColorResult = {
  tint: string;
  text: string;
  muted: string;
  border: string;
  badge: string;
  footer: string;
};

export function getNodeColor(color?: string): NodeColorResult | undefined {
  if (!color) return undefined;
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return {
    tint: `${red} ${green} ${blue}`,
    text: "var(--foreground)",
    muted: "var(--muted-foreground)",
    border: `rgb(${red} ${green} ${blue} / 0.32)`,
    badge: `rgb(${red} ${green} ${blue} / 0.14)`,
    footer: `rgb(${red} ${green} ${blue} / 0.22)`,
  };
}

export const HighLevelNode = memo(HighLevelNodeComponent);
