"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  BadgeCheck,
  Boxes,
  CircleCheck,
  ClipboardCheck,
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
      code: "L0",
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
      code: "L13",
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
  if (normalizedTitle.includes("OPPORTUNITY")) {
    return { Icon: ClipboardCheck, eyebrow: "Lifecycle phase", code: "P02", accent: "bg-indigo-500", border: "border-indigo-500/35", icon: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300", badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" };
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
  const VisualIcon = visual.Icon;
  const visualText = visual.badge.split(" ").find((token) => token.startsWith("text-")) ?? "text-muted-foreground";
  const linkedNodes = data.linkedLayer2Nodes || [];
  const linkedNodeList = linkedNodes.length ? (
    <div className="nodrag mt-3 border-t border-border/60 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Linked workflow nodes</p>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold", visual.badge)}>{linkedNodes.length}</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {linkedNodes.map((linkedNode, index) => (
          <div key={linkedNode.id}>
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background/65 px-2 py-1.5">
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-bold", visual.badge)}>
                {index + 1}
              </span>
              <button
                type="button"
                className="nodrag min-w-0 flex-1 truncate text-left text-[10px] font-medium text-primary hover:underline"
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
              <span aria-hidden className="block py-0.5 text-center text-[9px] text-muted-foreground/70">
                ↓
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {linkedNodes.length > 1 ? (
        <button
          type="button"
          className="nodrag mt-1 text-[9px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
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
      <div className={cn("high-level-node-card relative w-52 min-w-52 max-w-52 overflow-hidden rounded-2xl border bg-primary/[0.055] shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition-all", visual.border)}>
        <FlowHandles />
        <div className={cn("absolute inset-y-0 left-0 w-1", visual.accent)} />
        <div className="p-3 pl-4 text-center">
          <div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
            <span className="inline-flex items-center gap-1.5"><VisualIcon className="size-3.5" /> {visual.eyebrow}</span>
            <span className="rounded-full border border-primary/20 bg-background/75 px-1.5 py-0.5 text-[9px] tracking-tight">{visual.code}</span>
          </div>
          <p className="mt-3 text-[13px] font-bold leading-4 text-foreground">{data.title}</p>
          {data.description ? <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{data.description}</p> : null}
          {linkedNodeList}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("high-level-node-card relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition-all", data.type === "phase" ? "w-72 min-w-72 max-w-72" : "w-52 min-w-52 max-w-52", visual.border)}>
      <FlowHandles target={data.type !== "start"} source={data.type !== "end"} />
      <div className={cn("absolute inset-y-0 left-0 w-1", visual.accent)} />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/40 shadow-inner", visual.icon)}>
            <VisualIcon className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-[9px] font-bold uppercase tracking-[0.14em]", visualText)}>{visual.eyebrow}</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-tight", visual.badge)}>{visual.code}</span>
            </div>
            <p className="mt-2 text-[14px] font-bold leading-5 text-foreground">{data.title}</p>
          </div>
        </div>
        {data.description ? <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{data.description}</p> : null}
        {linkedNodeList}
      </div>
      <div className="flex items-center gap-2 border-t bg-muted/25 px-5 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <BadgeCheck className="size-3.5 text-primary" />
        <span>{visual.eyebrow}</span>
      </div>
    </div>
  );
}

export const HighLevelNode = memo(HighLevelNodeComponent);
