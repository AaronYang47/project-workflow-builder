"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleDot, Layers3, Milestone } from "lucide-react";
import type { HighLevelEdge, HighLevelNode } from "@/types/workflow";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { cn } from "@/lib/utils";

export function LifecycleOverview({
  nodes,
  edges,
  workflowGateCount,
  selectedNodeId,
  onFocusNode,
  skippedNodeIds,
}: {
  nodes: HighLevelNode[];
  edges: HighLevelEdge[];
  workflowGateCount: number;
  selectedNodeId?: string;
  onFocusNode: (nodeId: string) => void;
  skippedNodeIds?: ReadonlySet<string>;
}) {
  const orderedNodes = useMemo(() => orderHighLevelNodes(nodes, edges), [nodes, edges]);
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState(selectedNodeId);
  const activeNodeId = selectedNodeId || localSelectedNodeId;
  const selected = orderedNodes.find((node) => node.id === activeNodeId) || orderedNodes[0];
  const gateCount = orderedNodes.filter((node) => node.type === "primaryGate").length;
  const Icon =
    selected?.type === "primaryGate"
      ? Milestone
      : selected?.type === "start"
        ? CircleDot
        : selected?.type === "end"
          ? CheckCircle2
          : Layers3;

  return (
    <div
      data-lifecycle-overview
      aria-label="Lifecycle overview"
      className="pointer-events-auto rounded-2xl border border-border/80 bg-background/95 shadow-[0_8px_26px_rgba(15,23,42,0.12)] backdrop-blur"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
            Lifecycle overview
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {nodes.length} lifecycle steps · {gateCount} primary gates · {workflowGateCount}{" "}
            workflow gates
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-[8px] font-semibold text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-slate-400" />
            Phase
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" />
            Primary Gate
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-sm border border-dashed border-violet-500" />
            Workflow Gate
          </span>
        </div>
        <button
          type="button"
          aria-expanded={overviewOpen}
          aria-label={overviewOpen ? "Collapse lifecycle overview" : "Expand lifecycle overview"}
          onClick={() => setOverviewOpen((open) => !open)}
          className="shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {overviewOpen ? "Hide" : "Show"}
        </button>
      </div>
      {overviewOpen ? (
        <>
          <div className="scroll-thin overflow-x-auto border-t px-2 py-2">
            <div className="flex min-w-max items-center gap-1">
              {orderedNodes.map((node, index) => {
                const isSelected = node.id === activeNodeId;
                const isGate = node.type === "primaryGate";
                const isBoundary = node.type === "start" || node.type === "end";
                const isSkipped = skippedNodeIds?.has(node.id) === true;
                return (
                  <div key={node.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Focus ${node.title}`}
                      aria-pressed={isSelected}
                      title={node.description}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setLocalSelectedNodeId(node.id);
                        onFocusNode(node.id);
                      }}
                      className={cn(
                        "group flex w-[100px] shrink-0 flex-col gap-1 rounded-xl border px-2 py-2 text-left transition",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border/70 bg-card hover:border-primary/45 hover:bg-primary/5",
                        isGate && !isSelected ? "border-primary/35 bg-primary/[0.04]" : "",
                        isSkipped ? "opacity-45 grayscale" : "",
                      )}
                    >
                      <span className="flex items-start gap-1.5">
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white",
                            isGate ? "bg-primary" : isBoundary ? "bg-emerald-600" : "bg-slate-500",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 line-clamp-4 text-[8px] font-bold leading-[10px] text-foreground">
                          {node.title}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "truncate text-[7px] font-semibold uppercase tracking-[0.06em]",
                          isGate ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {isGate
                          ? "Primary Gate"
                          : node.type === "start"
                            ? "Start"
                            : node.type === "end"
                              ? "Final Close"
                              : isSkipped
                                ? "Skipped · FOB yard"
                                : "Phase"}
                      </span>
                    </button>
                    {index < nodes.length - 1 ? (
                      <span aria-hidden className="text-xs font-semibold text-primary/55">
                        →
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {selected ? (
            <div className="flex items-center gap-2 border-t bg-muted/25 px-3 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-3.5" />
              </span>
              <p className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground">
                <strong className="text-foreground">Focus:</strong> {selected.title} ·{" "}
                {selected.description}
              </p>
              <span className="shrink-0 text-[8px] font-semibold text-muted-foreground">
                Click a step to focus
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
