"use client";

import { memo, type CSSProperties } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Boxes,
  CircleCheck,
  Factory,
  Flag,
  Layers3,
  Milestone,
  Ruler,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { HighLevelNodeType } from "@/types/workflow";

export type HighLevelFlowNode = Node<
  {
    title: string;
    description: string;
    code?: string;
    backgroundColor?: string;
    type: HighLevelNodeType;
    linkedDetailedNodeIds?: string[];
    linkedLayer2Nodes?: Array<{ id: string; title: string }>;
    onLinkedLayer2NodeClick?: (id: string) => void;
    onViewAllLinkedLayer2Nodes?: () => void;
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
  const visual = getHighLevelVisual(data.type, data.title);
  const code = data.code?.trim() || visual.code;
  const nodeColor = data.type === "phase" || data.type === "start" || data.type === "end"
    ? getNodeColor(data.backgroundColor === "transparent" ? undefined : data.backgroundColor)
    : undefined;
  const VisualIcon = visual.Icon;
  const linkedNodes = data.linkedLayer2Nodes || [];
  const linkedNodeList = linkedNodes.length ? (
    <div className="nodrag mt-3 border-t pt-2.5" style={{ borderColor: nodeColor ? `rgb(var(--node-glass-tint) / 24%)` : "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Linked workflow nodes
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
      <div className="mt-2 space-y-1.5">
        {linkedNodes.map((linkedNode, index) => (
          <div key={linkedNode.id}>
            <div
              className="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 shadow-2xs transition-all hover:border-primary/40"
              style={{
                backgroundColor: nodeColor
                  ? "color-mix(in srgb, var(--card) 92%, rgb(var(--node-glass-tint)) 8%)"
                  : "var(--card)",
                borderColor: nodeColor
                  ? "rgb(var(--node-glass-tint) / 25%)"
                  : "var(--border)",
              }}
            >
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold border"
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
                {index + 1}
              </span>
              <button
                type="button"
                className="nodrag min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-foreground hover:text-primary hover:underline transition-colors"
                onClick={(event) => {
                  event.stopPropagation();
                  data.onLinkedLayer2NodeClick?.(linkedNode.id);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
                title={linkedNode.title}
              >
                {linkedNode.title}
              </button>
            </div>
            {index < linkedNodes.length - 1 ? (
              <span aria-hidden className="block py-0.5 text-center text-[9px] font-bold text-muted-foreground/60">
                ↓
              </span>
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
