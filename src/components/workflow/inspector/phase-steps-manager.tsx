"use client";

import { useCallback, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { chapterLabel } from "@/lib/chapter-label";

export function PhaseStepsManager({
  phaseNode,
  allNodes,
  nodeLayouts,
  toggleNodeInPhase,
  fitPhaseToChildren,
}: {
  phaseNode: DomainNode;
  allNodes: DomainNode[];
  nodeLayouts: Record<string, { parentId?: string; x?: number; y?: number }>;
  toggleNodeInPhase: (phaseId: string, nodeId: string) => void;
  fitPhaseToChildren: (phaseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const isGate = phaseNode.type === "gate";
  const label = isGate ? "Gate" : "Phase";
  const highLevel = useWorkflowStore((state) => state.file.highLevel);
  const highLevelNodes = useMemo(() => highLevel?.graph.nodes || [], [highLevel]);

  // Helper to find which Phase a step belongs to
  const getStepPhaseId = useCallback(
    (stepId: string) => {
      const parentId = nodeLayouts[stepId]?.parentId;
      if (parentId) {
        const parentNode = allNodes.find((n) => n.id === parentId);
        if (parentNode?.type === "phase") return parentNode.id;
      }
      const matchedL1 = highLevelNodes.find((hl) => {
        const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
        return ids.includes(stepId);
      });
      if (matchedL1) {
        const phase = allNodes.find(
          (n) =>
            n.type === "phase" &&
            (n.id === `phase-${matchedL1.id}` ||
              n.title.trim().toLowerCase() === matchedL1.title.trim().toLowerCase()),
        );
        if (phase) return phase.id;
      }
      return undefined;
    },
    [nodeLayouts, allNodes, highLevelNodes],
  );

  // Determine which Phase this Gate is bound to:
  const boundPhaseId = useMemo(() => {
    // 1. Direct parentId of Gate
    const gateParentId = nodeLayouts[phaseNode.id]?.parentId;
    if (gateParentId) {
      const parentNode = allNodes.find((n) => n.id === gateParentId);
      if (parentNode?.type === "phase") return parentNode.id;
    }
    // 2. From any currently included step in this Gate
    const firstIncluded = allNodes.find((n) => nodeLayouts[n.id]?.parentId === phaseNode.id);
    if (firstIncluded) {
      return getStepPhaseId(firstIncluded.id);
    }
    return undefined;
  }, [nodeLayouts, phaseNode.id, allNodes, getStepPhaseId]);

  const boundPhaseNode = useMemo(() => {
    return boundPhaseId ? allNodes.find((n) => n.id === boundPhaseId) : undefined;
  }, [boundPhaseId, allNodes]);

  const candidates = useMemo(() => {
    return allNodes
      .filter((n) => {
        if (n.id === phaseNode.id) return false;
        if (n.type === "phase") return false;
        if (n.type === "gate") return false;
        const currentParent = nodeLayouts[n.id]?.parentId;
        // Already in this gate: include
        if (currentParent === phaseNode.id) return true;
        // If it belongs to ANOTHER gate: exclude
        if (currentParent) {
          const parentNode = allNodes.find((p) => p.id === currentParent);
          if (parentNode?.type === "gate") return false;
        }

        // GATE CANNOT CROSS PHASES!
        if (boundPhaseId) {
          const stepPhaseId = currentParent === phaseNode.id ? boundPhaseId : getStepPhaseId(n.id);
          if (stepPhaseId && stepPhaseId !== boundPhaseId) {
            return false;
          }
        }

        // Step can be unassigned, or currently in a Phase: include!
        return true;
      })
      .filter((n) =>
        query.trim()
          ? `${n.title} ${n.config?.stage || ""} ${n.type}`
              .toLowerCase()
              .includes(query.toLowerCase())
          : true,
      )
      .sort((a, b) => {
        const ax = nodeLayouts[a.id]?.x ?? 0;
        const bx = nodeLayouts[b.id]?.x ?? 0;
        if (ax !== bx) return ax - bx;
        const ay = nodeLayouts[a.id]?.y ?? 0;
        const by = nodeLayouts[b.id]?.y ?? 0;
        return ay - by;
      });
  }, [allNodes, phaseNode.id, nodeLayouts, query, boundPhaseId, getStepPhaseId]);

  const includedIndices = useMemo(() => {
    const indices: number[] = [];
    candidates.forEach((node, index) => {
      if (nodeLayouts[node.id]?.parentId === phaseNode.id) {
        indices.push(index);
      }
    });
    return indices;
  }, [candidates, nodeLayouts, phaseNode.id]);

  const minIncludedIdx = includedIndices.length > 0 ? Math.min(...includedIndices) : -1;
  const maxIncludedIdx = includedIndices.length > 0 ? Math.max(...includedIndices) : -1;

  const includedCount = allNodes.filter((n) => nodeLayouts[n.id]?.parentId === phaseNode.id).length;

  return (
    <section className="mb-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-3 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/60 mb-2.5">
        <div className="flex items-center gap-2">
          <span
            className="flex size-6 items-center justify-center rounded-md text-white text-[10px] font-bold"
            style={{
              backgroundColor: phaseNode.color || (isGate ? "#7c3aed" : "#0d9488"),
            }}
          >
            {includedCount}
          </span>
          <div>
            <h3 className="text-xs font-bold text-foreground">
              Included Steps {isGate ? "in Gate" : "in Phase"}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Select independent steps {isGate ? "" : "& gates"} for this {label}
            </p>
          </div>
        </div>
      </div>

      {boundPhaseNode ? (
        <div className="mb-2.5 flex items-center justify-between rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1.5 text-xs text-foreground">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: boundPhaseNode.color || "#10b981" }}
            />
            <span className="truncate font-semibold text-purple-600 dark:text-purple-400">
              {boundPhaseNode.title}
            </span>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground ml-2">Same Phase only</span>
        </div>
      ) : null}

      {allNodes.length > 5 ? (
        <div className="mb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter steps..."
            className="h-7 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-background px-2.5 text-[11px] outline-none focus:border-primary"
          />
        </div>
      ) : null}

      <div className="space-y-1.5 max-h-60 overflow-y-auto scroll-thin pr-1">
        {candidates.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No steps available to include in this Gate.
          </div>
        ) : (
          candidates.map((node, index) => {
            const isIncluded = nodeLayouts[node.id]?.parentId === phaseNode.id;
            const isGate = node.type === "gate";

            let canToggle = false;
            let disabledTooltip = "";

            if (isIncluded) {
              if (
                includedIndices.length <= 1 ||
                index === minIncludedIdx ||
                index === maxIncludedIdx
              ) {
                canToggle = true;
              } else {
                canToggle = false;
                disabledTooltip = "必须按顺序从两端取消勾选，不可在中间断开";
              }
            } else {
              if (includedIndices.length === 0) {
                canToggle = true;
              } else if (index === maxIncludedIdx + 1 || index === minIncludedIdx - 1) {
                canToggle = true;
              } else {
                canToggle = false;
                disabledTooltip = "必须从左到右按顺序选择，请先勾选前一个相邻的步骤/门禁";
              }
            }

            return (
              <div
                key={node.id}
                role="button"
                tabIndex={canToggle ? 0 : -1}
                title={canToggle ? undefined : disabledTooltip}
                onClick={() => {
                  if (!canToggle) return;
                  toggleNodeInPhase(phaseNode.id, node.id);
                }}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2 text-xs transition-colors select-none",
                  isIncluded
                    ? "border-primary bg-primary/[0.08] ring-1 ring-primary/40 font-medium"
                    : "border-slate-200 dark:border-slate-800 bg-background",
                  canToggle
                    ? "cursor-pointer hover:border-primary/50"
                    : "opacity-40 cursor-not-allowed bg-muted/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={isIncluded}
                  disabled={!canToggle}
                  readOnly
                  className="size-3.5 rounded accent-primary pointer-events-none"
                />
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0",
                    isGate
                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-300"
                      : "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
                  )}
                >
                  {isGate ? "Gate" : "Step"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground text-xs font-semibold">
                    {node.title || "Untitled"}
                  </p>
                  {node.config?.stage ? (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {chapterLabel(node.config.stage)}
                    </p>
                  ) : null}
                </div>
                {!canToggle ? <Lock className="size-3 text-muted-foreground/70 shrink-0" /> : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
