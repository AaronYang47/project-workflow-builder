"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ClipboardList,
  FileCheck2,
  FileText,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  executionItemProgress,
  executionItemProgressLabel,
  getExecutionSummary,
} from "@/lib/execution";
import {
  EXECUTION_APPROVAL_STATUSES,
  EXECUTION_ITEM_STATUSES,
  EXECUTION_ITEM_TYPES,
  EXECUTION_SIGNATURE_STATUSES,
  EXECUTION_TASK_STATUSES,
  type ExecutionItem,
  type ExecutionItemType,
} from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  LayerContextMinimap,
  type ContextMapNode,
} from "./layer-context-minimap";
import { OpportunityIntakeExecutionSheet } from "./opportunity-intake-execution-sheet";
import { ProjectIdBadge } from "./project-id-badge";

function progressTone(item: ExecutionItem) {
  const progress = executionItemProgress(item);
  if (progress === "blocked") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (progress === "complete") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function ProgressIcon({ item }: { item: ExecutionItem }) {
  const progress = executionItemProgress(item);
  const Icon =
    progress === "blocked"
      ? CircleAlert
      : progress === "complete"
        ? CheckCircle2
        : Clock3;
  return <Icon className="size-4 shrink-0" />;
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 rounded-lg border px-3 text-left text-xs transition-colors",
        checked
          ? "border-primary/35 bg-primary/[0.06] text-foreground"
          : "bg-background text-muted-foreground hover:bg-muted/60",
      )}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

function ExecutionItemEditor({
  item,
  onChange,
}: {
  item: ExecutionItem;
  onChange: (patch: Partial<ExecutionItem>) => void;
}) {
  const signatureType = item.type === "Document" || item.type === "Agreement";

  const onTypeChange = (type: ExecutionItemType) => {
    const nextSignatureType = type === "Document" || type === "Agreement";
    onChange({
      type,
      signatureRequired: nextSignatureType ? true : false,
      signatureStatus: nextSignatureType
        ? item.signatureStatus === "Signed"
          ? "Signed"
          : "Pending"
        : "Not Required",
      signers: nextSignatureType ? item.signers || [] : [],
      approvalStatus:
        type === "Approval" ? item.approvalStatus || "Pending" : item.approvalStatus,
      taskStatus:
        type === "Task" ? item.taskStatus || "Not Started" : undefined,
    });
  };

  return (
    <div className="scroll-thin min-h-0 overflow-y-auto rounded-xl border bg-background/80">
      <div className="border-b px-4 py-3">
        <div className="flex items-start gap-2">
          <FileCheck2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Execution Item</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Keep the detailed execution requirement here. L2 only receives its status summary.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="execution-item-type">Type</Label>
          <select
            id="execution-item-type"
            aria-label="Execution item type"
            value={item.type}
            onChange={(event) =>
              onTypeChange(event.target.value as ExecutionItemType)
            }
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {EXECUTION_ITEM_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="execution-item-title">Title</Label>
          <Input
            id="execution-item-title"
            aria-label="Execution item title"
            value={item.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="execution-item-description">Description</Label>
          <Textarea
            id="execution-item-description"
            aria-label="Execution item description"
            value={item.description}
            onChange={(event) => onChange({ description: event.target.value })}
            rows={3}
            placeholder="What must be provided, reviewed, or completed?"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ToggleField
            label="Required"
            checked={item.required}
            onChange={(required) => onChange({ required })}
          />
          <ToggleField
            label="Signature Required"
            checked={item.signatureRequired}
            onChange={(signatureRequired) =>
              onChange({
                signatureRequired,
                signatureStatus: signatureRequired
                  ? item.signatureStatus === "Not Required"
                    ? "Pending"
                    : item.signatureStatus || "Pending"
                  : "Not Required",
              })
            }
          />
          <ToggleField
            label="Approval Required"
            checked={item.approvalRequired}
            onChange={(approvalRequired) =>
              onChange({
                approvalRequired,
                approvalStatus: approvalRequired
                  ? item.approvalStatus || "Pending"
                  : item.approvalStatus,
              })
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="execution-item-status">Status</Label>
            <select
              id="execution-item-status"
              aria-label="Execution item status"
              value={item.status}
              onChange={(event) =>
                onChange({
                  status: event.target.value as ExecutionItem["status"],
                })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {EXECUTION_ITEM_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="execution-item-due-date">Due Date</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                id="execution-item-due-date"
                aria-label="Execution item due date"
                type="date"
                value={item.dueDate}
                onChange={(event) => onChange({ dueDate: event.target.value })}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="execution-item-role">Responsible Role</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              id="execution-item-role"
              aria-label="Responsible role"
              value={item.responsibleRole}
              onChange={(event) => onChange({ responsibleRole: event.target.value })}
              placeholder="e.g. Project Manager, Client, Legal"
              className="pl-8"
            />
          </div>
        </div>

        {signatureType ? (
          <section className="space-y-3 border-t pt-4">
            <div>
              <p className="text-xs font-semibold">Signature Tracking</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Track signing details here; L2 receives only a high-level requirement status.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="execution-signature-status">Signature Status</Label>
              <select
                id="execution-signature-status"
                aria-label="Signature status"
                value={item.signatureStatus || "Not Required"}
                onChange={(event) =>
                  onChange({
                    signatureStatus: event.target.value as ExecutionItem["signatureStatus"],
                    status:
                      event.target.value === "Signed" && item.status === "Not Started"
                        ? "Complete"
                        : item.status,
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {EXECUTION_SIGNATURE_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="execution-signers">Signers</Label>
              <Input
                id="execution-signers"
                aria-label="Signers"
                value={(item.signers || []).join(", ")}
                onChange={(event) =>
                  onChange({
                    signers: event.target.value
                      .split(",")
                      .map((signer) => signer.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Separate names with commas"
              />
            </div>
          </section>
        ) : null}

        {item.type === "Approval" || item.approvalRequired ? (
          <section className="space-y-1.5 border-t pt-4">
            <Label htmlFor="execution-approval-status">Approval Status</Label>
            <select
              id="execution-approval-status"
              aria-label="Approval status"
              value={item.approvalStatus || "Pending"}
              onChange={(event) =>
                onChange({
                  approvalStatus: event.target.value as ExecutionItem["approvalStatus"],
                  status:
                    event.target.value === "Approved" && item.status === "Not Started"
                      ? "Complete"
                      : item.status,
                })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {EXECUTION_APPROVAL_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </section>
        ) : null}

        {item.type === "Task" ? (
          <section className="space-y-1.5 border-t pt-4">
            <Label htmlFor="execution-task-status">Task Status</Label>
            <select
              id="execution-task-status"
              aria-label="Task status"
              value={item.taskStatus || "Not Started"}
              onChange={(event) =>
                onChange({
                  taskStatus: event.target.value as ExecutionItem["taskStatus"],
                  status:
                    event.target.value === "Complete" && item.status === "Not Started"
                      ? "Complete"
                      : item.status,
                })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {EXECUTION_TASK_STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </section>
        ) : null}

        <div className="space-y-1.5 border-t pt-4">
          <Label htmlFor="execution-item-notes">Notes</Label>
          <Textarea
            id="execution-item-notes"
            aria-label="Execution item notes"
            value={item.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            rows={3}
            placeholder="Add execution notes or context"
          />
        </div>
      </div>
    </div>
  );
}

export function ExecutionView({
  nodeId,
  onBack,
  onSelectNode,
}: {
  nodeId: string;
  onBack: () => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const file = useWorkflowStore((state) => state.file);
  const addExecutionItem = useWorkflowStore((state) => state.addExecutionItem);
  const updateExecutionItem = useWorkflowStore(
    (state) => state.updateExecutionItem,
  );
  const deleteExecutionItem = useWorkflowStore(
    (state) => state.deleteExecutionItem,
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const node = file.graph.nodes.find((item) => item.id === nodeId);
  const items = useMemo(
    () =>
      (file.execution?.items || []).filter(
        (item) => item.linkedLayer2NodeId === nodeId,
      ),
    [file.execution?.items, nodeId],
  );
  const summary = getExecutionSummary(nodeId, file.execution?.items);
  const selectedItem =
    items.find((item) => item.id === selectedItemId) || items[0];
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
      const parent: { x: number; y: number } = layout.parentId
        ? resolvePosition(layout.parentId, seen)
        : { x: 0, y: 0 };
      const position: { x: number; y: number } = {
        x: parent.x + layout.x,
        y: parent.y + layout.y,
      };
      positionCache.set(id, position);
      return position;
    };

    return file.graph.nodes
      .map((workflowNode) => {
        const layout = file.layout.nodes[workflowNode.id];
        const position = resolvePosition(workflowNode.id);
        return {
          id: workflowNode.id,
          label: workflowNode.title,
          x: position.x,
          y: position.y,
          width: layout?.width || 270,
          height: layout?.height || 220,
          color: workflowNode.color || getNodeDefinition(workflowNode.type).color,
          active: workflowNode.id === nodeId,
          container: workflowNode.type === "phase",
          type: workflowNode.type,
        };
      })
      .sort((left, right) => {
        if (left.container !== right.container) {
          return Number(right.container) - Number(left.container);
        }
        return left.x - right.x || left.y - right.y;
      });
  }, [file.graph.nodes, file.layout.nodes, nodeId]);

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

  const addItem = () => {
    const id = addExecutionItem(node.id, "Document");
    if (id) setSelectedItemId(id);
  };

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
          {node.type === "opportunityValidation" ? (
            <div className="flex items-center gap-2">
              <ProjectIdBadge showPlaceholder />
            </div>
          ) : (
            <>
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
                {summary.completedCount}/{summary.itemCount} Complete · {summary.status}
              </div>
              {items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    useWorkflowStore.getState().showConfirmClear({
                      title: `Clear L3 Requirements for "${node.title}"`,
                      message: `Are you sure you want to clear all ${items.length} execution requirements for "${node.title}"? This action cannot be undone.`,
                      confirmLabel: "Clear Node Requirements",
                      onConfirm: () =>
                        useWorkflowStore.getState().clearExecutionItems(node.id),
                    });
                  }}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Clear L3 execution requirements for this node"
                >
                  <Trash2 className="size-3.5" />
                  Clear L3
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={addItem}
                aria-label="Add execution item"
              >
                <Plus className="size-3.5" />
                Add Item
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="shrink-0 border-b bg-background/70 px-5 py-1.5">
        <div>
          <LayerContextMinimap
            level="L2"
            title="Detailed Workflow"
            nodes={layer2ContextNodes}
            edges={file.graph.edges}
            activeLabel={node.title}
            onOpenParent={onBack}
            onOpenNode={(targetNodeId) => {
              if (targetNodeId) {
                useWorkflowStore.getState().selectNodes([targetNodeId]);
                onBack();
                window.setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("workflow:focus-node", { detail: targetNodeId }),
                  );
                }, 100);
              }
            }}
            className="w-full shadow-sm"
            expandable
            compact
          />
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-muted-foreground">
            The highlighted green node is the active L2 source. Click the node or steps in the minimap to return to that location in L2 Detailed Workflow.
          </p>
        </div>
      </div>

      {node.type === "opportunityValidation" ? (
        <OpportunityIntakeExecutionSheet node={node} onBack={onBack} />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 lg:overflow-hidden">
          <div className="grid h-auto min-h-0 min-w-0 grid-cols-1 gap-4 lg:h-full xl:grid-cols-[minmax(280px,0.85fr)_minmax(340px,1.15fr)]">
            <div className="flex min-h-64 flex-col rounded-xl border bg-background/80 lg:min-h-0">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
                <div>
                <p className="text-sm font-semibold">Execution Items</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {items.length ? `${items.length} item${items.length === 1 ? "" : "s"} linked to this node` : "No items linked yet"}
                </p>
              </div>
              <FileText className="size-4 text-muted-foreground" />
            </div>
            <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {items.length ? (
                items.map((item) => {
                  const active = item.id === selectedItem?.id;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-stretch gap-1 rounded-lg border transition-colors",
                        active
                          ? "border-primary/45 bg-primary/[0.05] shadow-sm"
                          : "border-border/80 bg-card hover:border-primary/25",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={`Edit execution item ${item.title}`}
                        onClick={() => setSelectedItemId(item.id)}
                        className="min-w-0 flex-1 p-3 text-left"
                      >
                        <div className="flex items-start gap-2">
                          <ProgressIcon item={item} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold">{item.title || "Untitled execution item"}</p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              {item.type}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {item.required ? "Required" : "Optional"}
                              </span>
                              <span
                                className={cn(
                                  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                                  progressTone(item),
                                )}
                              >
                                {executionItemProgressLabel(item)}
                              </span>
                            </div>
                            {item.responsibleRole || item.dueDate ? (
                              <p className="mt-2 truncate text-[10px] text-muted-foreground">
                                {[item.responsibleRole, item.dueDate].filter(Boolean).join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete execution item ${item.title}`}
                        title="Delete execution item"
                        onClick={() => deleteExecutionItem(item.id)}
                        className="flex w-9 shrink-0 items-center justify-center self-stretch rounded-r-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
                  <ClipboardList className="size-7 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium">No execution requirements yet</p>
                  <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                    Add the documents, approvals, tasks, and evidence that make this workflow node executable.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={addItem}
                    aria-label="Add first execution item"
                  >
                    <Plus className="size-3.5" />
                    Add first item
                  </Button>
                </div>
              )}
            </div>
          </div>

          {selectedItem ? (
            <ExecutionItemEditor
              item={selectedItem}
              onChange={(patch) => updateExecutionItem(selectedItem.id, patch)}
            />
          ) : (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed bg-background/50 p-6 text-center lg:min-h-0">
              <div>
                <ClipboardList className="mx-auto size-7 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">Select an execution item</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Its detailed requirements will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
