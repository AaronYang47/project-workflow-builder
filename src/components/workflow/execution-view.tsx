"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardList, FileCheck2, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  executionItemIsGateRequired,
  executionItemProgress,
  getExecutionSummary,
} from "@/lib/execution";
import {
  isReferenceNodeType,
  type DomainNode,
  type ExecutionItem,
} from "@/types/workflow";
import type { ProjectOperations } from "@/types/project-operations";
import { nodeReleaseReady } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  LayerContextMinimap,
  type ContextMapNode,
} from "./layer-context-minimap";
import { DetailedWorkflowDialog } from "./detailed-workflow-dialog";

function FileChecklist({
  node,
  items,
  operations,
  releaseReady,
  focusItemId,
  onToggle,
}: {
  node: DomainNode;
  items: ExecutionItem[];
  operations?: ProjectOperations;
  releaseReady: boolean;
  focusItemId?: string | null;
  onToggle: (item: ExecutionItem) => void;
}) {
  const focusedItemRef = useRef<HTMLLabelElement>(null);
  useEffect(() => {
    if (focusItemId && focusedItemRef.current) {
      focusedItemRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, [focusItemId]);

  const requiredItems = items.filter(executionItemIsGateRequired);
  const checkedCount = requiredItems.filter(
    (item) =>
      executionItemProgress(item, operations, { checklistOnly: true }) ===
      "complete",
  ).length;
  const allChecked =
    requiredItems.length === 0 || checkedCount === requiredItems.length;

  return (
    <div
      data-testid="required-file-checklist"
      className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-5"
    >
      <section className="mx-auto flex min-h-full max-w-4xl flex-col rounded-xl border bg-background/80">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileCheck2 className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Required files</h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                Check every required file to release this node. No L3 execution form is required here.
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              allChecked
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {requiredItems.length
              ? `${checkedCount}/${requiredItems.length} checked`
              : "No required files"}
          </span>
        </header>

        <div className="flex-1 space-y-2 p-3 sm:p-4">
          {requiredItems.length ? (
            requiredItems.map((item) => {
              const checked =
                executionItemProgress(item, operations, {
                  checklistOnly: true,
                }) === "complete";
              const detail = [
                item.documentNumber
                  ? `Document ${item.documentNumber}`
                  : undefined,
                item.documentCode,
                item.sourceAvailability,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <label
                  key={item.id}
                  ref={item.id === focusItemId ? focusedItemRef : undefined}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors",
                    checked
                      ? "border-emerald-500/30 bg-emerald-500/[0.05]"
                      : "border-border/80 bg-card hover:border-primary/35 hover:bg-primary/[0.025]",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Required file: ${item.title || item.type}`}
                    checked={checked}
                    onChange={() => onToggle(item)}
                    className="size-4 shrink-0 accent-emerald-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-foreground">
                      {item.title || item.type}
                    </span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {detail || "Required file"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      checked
                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {checked ? "Checked" : "Required"}
                  </span>
                </label>
              );
            })
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
              <ClipboardList className="size-7 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No required files are configured</p>
              <p className="mt-1 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                This node can be released once its L2 release conditions are satisfied.
              </p>
            </div>
          )}
        </div>

        <footer className="border-t px-4 py-3 text-[11px] text-muted-foreground sm:px-5">
          {releaseReady
            ? `${node.title} is ready to release.`
            : allChecked
              ? "All required files are checked. Complete the remaining L2 release conditions to release this node."
              : "The node remains locked until every required file is checked."}
        </footer>
      </section>
    </div>
  );
}

export function ExecutionView({
  nodeId,
  focusItemId,
  onBack,
  onFocusNode,
}: {
  nodeId: string;
  focusItemId?: string | null;
  onBack: () => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const file = useWorkflowStore((state) => state.file);
  const updateExecutionItem = useWorkflowStore(
    (state) => state.updateExecutionItem,
  );
  const [l2ContextOpen, setL2ContextOpen] = useState(false);
  const node = file.graph.nodes.find((item) => item.id === nodeId);
  const items = useMemo(
    () =>
      (file.execution?.items || []).filter(
        (item) => item.linkedLayer2NodeId === nodeId,
      ),
    [file.execution?.items, nodeId],
  );
  const projectStartNode = file.graph.nodes.find(
    (item) => item.type === "projectStart",
  );
  const summary = getExecutionSummary(
    nodeId,
    file.execution?.items,
    file.operations,
    { checklistOnly: true },
  );
  const layer2ContextNodes = useMemo<ContextMapNode[]>(() => {
    const positionCache = new Map<string, { x: number; y: number }>();
    const resolvePosition = (
      id: string,
      seen = new Set<string>(),
    ): { x: number; y: number } => {
      const cached = positionCache.get(id);
      if (cached) return cached;
      const layout = file.layout.nodes[id];
      if (!layout || seen.has(id)) return { x: 0, y: 0 };
      seen.add(id);
      const parent = layout.parentId
        ? resolvePosition(layout.parentId, seen)
        : { x: 0, y: 0 };
      const position = { x: parent.x + layout.x, y: parent.y + layout.y };
      positionCache.set(id, position);
      return position;
    };

    const rawNodes = file.graph.nodes
      .map((workflowNode, graphIndex) => {
        const position = resolvePosition(workflowNode.id);
        const supportingSourceXs = isReferenceNodeType(workflowNode.type)
          ? file.graph.edges
              .filter((edge) => edge.target === workflowNode.id)
              .map((edge) => resolvePosition(edge.source).x)
          : [];
        return {
          id: workflowNode.id,
          label: workflowNode.title,
          rawX: position.x,
          orderX: supportingSourceXs.length
            ? Math.max(...supportingSourceXs) + 0.5
            : position.x,
          graphIndex,
          width: 180,
          height: 96,
          color:
            workflowNode.color || getNodeDefinition(workflowNode.type).color,
          active: workflowNode.id === nodeId,
          container: workflowNode.type === "phase",
          type: workflowNode.type,
        };
      })
      .sort(
        (a, b) =>
          a.orderX - b.orderX || a.rawX - b.rawX || a.graphIndex - b.graphIndex,
      );
    return rawNodes.map((workflowNode, index) => {
      return {
        id: workflowNode.id,
        label: workflowNode.label,
        x: index * (workflowNode.width + 40),
        y: 100 - workflowNode.height / 2,
        width: workflowNode.width,
        height: workflowNode.height,
        color: workflowNode.color,
        active: workflowNode.active,
        container: workflowNode.container,
        type: workflowNode.type,
      };
    });
  }, [file.graph.edges, file.graph.nodes, file.layout.nodes, nodeId]);

  if (!node) {
    return (
      <section
        aria-label="L3 Execution Layer"
        className="relative z-10 flex h-full min-w-0 flex-1 flex-col bg-canvas"
      >
        <div className="flex items-center gap-3 border-b bg-background px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            aria-label="Back to L2 Detailed Workflow"
          >
            <ArrowLeft className="size-3.5" />
            Back to L2
          </Button>
          <p className="text-sm text-muted-foreground">
            The selected workflow node is no longer available.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="L3 Execution Layer"
      className="relative z-10 flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            aria-label="Back to L2 Detailed Workflow"
          >
            <ArrowLeft className="size-3.5" />
            Back to L2
          </Button>
          <div className="min-w-0 border-l pl-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              L3 · Execution Layer
            </p>
            <h1 className="truncate text-sm font-semibold">{node.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              summary.status === "Blocked"
                ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : summary.status === "Incomplete"
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {summary.completedCount}/{summary.itemCount} Checked · {summary.status}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setL2ContextOpen(true)}
            aria-label="Open L2 detailed workflow"
            title="Open L2 detailed workflow"
          >
            <Layers3 className="size-3.5 text-primary" />
            L2 · Detailed Workflow
          </Button>
        </div>
      </header>

      <FileChecklist
        node={node}
        items={items}
        operations={file.operations}
        focusItemId={focusItemId}
        releaseReady={nodeReleaseReady(
          node,
          projectStartNode,
          file.execution?.items,
          file.operations,
        )}
        onToggle={(item) =>
          updateExecutionItem(item.id, {
            checklistComplete: item.checklistComplete !== true,
          })
        }
      />

      <DetailedWorkflowDialog
        open={l2ContextOpen}
        onOpenChange={setL2ContextOpen}
      >
        <div className="h-full overflow-auto bg-canvas p-4">
          <LayerContextMinimap
            level="L2"
            title="Detailed Workflow"
            nodes={layer2ContextNodes}
            edges={file.graph.edges}
            activeLabel={node.title}
            onOpenParent={onBack}
            onOpenNode={(targetNodeId) => {
              if (!targetNodeId) return;
              useWorkflowStore.getState().selectNodes([targetNodeId]);
              setL2ContextOpen(false);
              onFocusNode?.(targetNodeId);
            }}
            expandable
            className="w-full"
          />
        </div>
      </DetailedWorkflowDialog>
    </section>
  );
}
