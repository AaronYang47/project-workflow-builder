"use client";

import { CircleCheck, CircleDot, Layers3, Milestone, Settings2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowStore } from "@/store/workflow-store";
import { useShallow } from "zustand/react/shallow";
import { orderLinkedWorkflowNodeIds, orderWorkflowNodeIds } from "@/lib/high-level-workflow";
import type { HighLevelNodeType } from "@/types/workflow";

const iconByType: Record<HighLevelNodeType, typeof CircleDot> = {
  start: CircleDot,
  phase: Layers3,
  primaryGate: Milestone,
  end: CircleCheck,
};

export function HighLevelInspector() {
  const {
    file,
    highLevelSelection,
    updateHighLevelNode,
    deleteHighLevelNodes,
    deleteHighLevelEdge,
  } = useWorkflowStore(
    useShallow((state) => ({
      file: state.file,
      highLevelSelection: state.highLevelSelection,
      updateHighLevelNode: state.updateHighLevelNode,
      deleteHighLevelNodes: state.deleteHighLevelNodes,
      deleteHighLevelEdge: state.deleteHighLevelEdge,
    })),
  );
  const node = file.highLevel?.graph.nodes.find(
    (item) => item.id === highLevelSelection.nodeIds[0],
  );
  const edge = file.highLevel?.graph.edges.find(
    (item) => item.id === highLevelSelection.edgeId,
  );
  const linkedIds = node
    ? orderLinkedWorkflowNodeIds(
        node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds,
        file.graph.nodes,
      )
    : [];
  const orderedWorkflowNodeIds = orderWorkflowNodeIds(
    file.graph.nodes.map((workflowNode) => workflowNode.id),
    file.graph.nodes,
  );
  const workflowNodeById = new Map(file.graph.nodes.map((workflowNode) => [workflowNode.id, workflowNode]));
  const linkedByOtherNode = new Map<string, string>();
  for (const otherNode of file.highLevel?.graph.nodes || []) {
    if (otherNode.id === node?.id) continue;
    for (const linkedId of otherNode.linkedLayer2NodeIds ?? otherNode.linkedDetailedNodeIds ?? []) {
      linkedByOtherNode.set(linkedId, otherNode.title);
    }
  }
  const updateText = (field: "title" | "description", value: string) => {
    if (!node) return;
    const next = field === "title" ? value.trim() || node.title : value.trim();
    if (next !== node[field]) updateHighLevelNode(node.id, { [field]: next });
  };

  return (
    <aside className="flex h-full w-[304px] max-w-[calc(100vw-16px)] shrink-0 flex-col border-l bg-panel">
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Settings2 className="size-4 text-primary" />
        <span className="text-sm font-semibold">High-Level Inspector</span>
      </div>
      {!node && !edge ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
            <Settings2 className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nothing selected</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Select a High-Level node or connection to configure it.
          </p>
        </div>
      ) : node ? (
        <div className="scroll-thin flex-1 overflow-y-auto">
          <div className="border-b p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-white">
                {(() => {
                  const Icon = iconByType[node.type];
                  return <Icon className="size-4" />;
                })()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{node.title}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {node.type}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="high-level-title">Title</Label>
              <Input
                id="high-level-title"
                aria-label="High-Level Title"
                key={`${node.id}-title-${node.title}`}
                defaultValue={node.title}
                onBlur={(event) => updateText("title", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="high-level-description">Description</Label>
              <Textarea
                id="high-level-description"
                aria-label="High-Level Description"
                key={`${node.id}-description-${node.description}`}
                defaultValue={node.description}
                onBlur={(event) => updateText("description", event.target.value)}
              />
            </div>
            <div className="space-y-2 border-t pt-4">
                <div>
                  <Label>Linked Workflow Nodes</Label>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Select existing Workflow Nodes. Each node can be linked to only one High-Level node.
                  </p>
                </div>
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
                  {orderedWorkflowNodeIds.map((workflowNodeId) => {
                    const detailedNode = workflowNodeById.get(workflowNodeId);
                    if (!detailedNode) return null;
                    const checked = linkedIds.includes(detailedNode.id);
                    const linkedTo = linkedByOtherNode.get(detailedNode.id);
                    const unavailable = Boolean(linkedTo) && !checked;
                    return (
                      <label
                        key={detailedNode.id}
                        className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${
                          unavailable
                            ? "cursor-not-allowed opacity-55"
                            : "cursor-pointer hover:bg-muted"
                        }`}
                        title={linkedTo ? `Already linked to ${linkedTo}` : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={unavailable}
                          onChange={() =>
                            updateHighLevelNode(node.id, {
                              linkedLayer2NodeIds: checked
                                ? linkedIds.filter((id) => id !== detailedNode.id)
                                : [...linkedIds, detailedNode.id],
                            })
                          }
                          className="mt-0.5 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{detailedNode.title}</span>
                          {linkedTo && !checked ? (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              Linked to {linkedTo}
                            </span>
                          ) : null}
                        </span>
                        </label>
                    );
                  })}
                  {linkedIds
                    .filter(
                      (id) => !file.graph.nodes.some((detailedNode) => detailedNode.id === id),
                    )
                    .map((id) => (
                      <div
                        key={id}
                        className="flex items-center gap-2 rounded bg-destructive/5 px-2 py-1.5 text-xs text-destructive"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Missing linked Workflow Node
                        </span>
                        <button
                          type="button"
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium hover:bg-destructive/10"
                          onClick={() =>
                            updateHighLevelNode(node.id, {
                              linkedLayer2NodeIds: linkedIds.filter((linkedId) => linkedId !== id),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-sm font-semibold">Connection</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {edge?.source} → {edge?.target}
          </p>
        </div>
      )}
      {node || edge ? (
        <div className="border-t p-3">
          <button
            type="button"
            onClick={() =>
              node ? deleteHighLevelNodes([node.id]) : edge && deleteHighLevelEdge(edge.id)
            }
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            Delete selected
          </button>
        </div>
      ) : null}
    </aside>
  );
}
