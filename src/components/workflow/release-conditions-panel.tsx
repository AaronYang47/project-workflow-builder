"use client";

import { Check, GripVertical, Plus, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import type { ExecutionItem, Condition, DomainNode } from "@/types/workflow";
import type { ProjectOperations } from "@/types/project-operations";
import { conditionInspectorKey } from "@/lib/inspector-schema";
import { conditionHasL3Forms, conditionIsSatisfied, nodeReleaseReady } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { stopBubble } from "./node-utils";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";

export function ReleaseConditionsPanel({
  node,
  projectStartNode,
  executionItems,
  operations,
  reached = true,
}: {
  node: DomainNode;
  projectStartNode?: DomainNode;
  executionItems: ExecutionItem[];
  operations?: ProjectOperations;
  reached?: boolean;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const moveNodeCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const deleteNodeCondition = useWorkflowStore(
    (state) => state.deleteNodeCondition,
  );
  const focusedInspectorField = useWorkflowStore(
    (state) => state.focusedInspectorField,
  );
  const conditions = node.conditions || [];
  const sequenceLocked = node.metadata.executionOrder === "strict-sequential" && !reached;
  const statusReady = reached && nodeReleaseReady(
    node,
    projectStartNode,
    executionItems,
    operations,
  );
  const saveConditions = (next: Condition[]) =>
    updateNode(node.id, { conditions: next });

  return (
    <section className="rounded-lg border bg-background/70 p-2.5" data-release-condition-drop-node-id={node.id}>

      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck
          className={cn(
            "size-4",
            statusReady ? "text-emerald-600" : "text-amber-600",
          )}
        />
        <span className="text-xs font-bold uppercase tracking-wide">
          Release conditions
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold uppercase",
            statusReady
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
          )}
        >
          {statusReady ? "Ready" : "Blocked"}
        </span>
      </div>
      <div className="space-y-1.5" data-release-condition-list-node-id={node.id}>
        {conditions.map((condition, index) => {
          const inspectorKey = conditionInspectorKey(node.id, condition.id, index);
          const inspectorFocused = focusedInspectorField === inspectorKey;
          const checked = conditionIsSatisfied(
            condition,
            node,
            projectStartNode,
            executionItems,
            operations,
          );
          const hasL3Forms = conditionHasL3Forms(condition, node);
          const focusCondition = () => {
            const store = useWorkflowStore.getState();
            store.selectNodes([node.id]);
            store.setFocusedInspectorField(inspectorKey);
          };
          const toggleCondition = () => {
            if (condition.id === "project-id-required") return;
            const linkedItem = condition.linkedExecutionItemId
              ? executionItems.find((item) => item.id === condition.linkedExecutionItemId)
              : undefined;
            if (linkedItem && condition.id !== "project-id-required") {
              // L3-backed conditions are completed from the L3 form itself.
              // Do not let the L2 checkbox bypass required form fields.
              return;
            }
            saveConditions(
              conditions.map((item, itemIndex) =>
                itemIndex === index ? { ...item, checked: !checked } : item,
              ),
            );
          };
          return (
            <div
              key={condition.id || index}
              role="group"
              aria-label={`Release condition ${index + 1}`}
              data-release-condition-index={index}
              data-release-condition-node-id={node.id}
              onClick={stopBubble(focusCondition)}
              className={cn(
                "relative flex min-h-10 items-center gap-2 rounded-md border bg-card px-2 py-2 transition-[background-color,border-color,box-shadow,opacity,transform] duration-200",
                inspectorFocused &&
                  "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
                !inspectorFocused && "hover:border-primary/35 hover:bg-primary/[0.025]",
              )}
            >
              <button
                type="button"
                aria-label={`Drag to reorder release condition ${index + 1}`}
                title="Drag to reorder"
                onPointerDown={(event) => {
                  if (condition.locked && !(condition.id === "project-id-required" && node.type === "projectStart")) return;
                  beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, {
                    nodeId: node.id, index,
                    label: condition.label || condition.description || `Release condition ${index + 1}`,
                  }, (target) => moveNodeCondition(node.id, index, target.nodeId, target.index));
                }}
                onClick={stopBubble(() => undefined)}
                className="nodrag flex size-6 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground/70 hover:bg-primary/10 hover:text-primary active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`${checked ? "Uncheck" : "Check"} release condition ${index + 1}`}
                title={
                  condition.id === "project-id-required" ? "Automatically checked when a complete Job Number is entered" : sequenceLocked && !checked
                      ? "Complete the preceding department first"
                    : checked
                      ? "Uncheck this release condition"
                      : "Mark this release condition complete"
                }
                disabled={
                  condition.id === "project-id-required" ||
                  (sequenceLocked && !checked) ||
                  (Boolean(condition.linkedExecutionItemId) && condition.id !== "project-id-required") ||
                  (conditionHasL3Forms(condition, node) && condition.id !== "project-id-required")
                }
                onClick={stopBubble(toggleCondition)}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded border",
                  checked
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-border bg-background",
                  !checked && hasL3Forms && "condition-forms-breathe condition-forms-checkbox",
                )}
              >
                <Check className={cn("size-3.5", !checked && "opacity-0")} />
              </button>
              <button
                type="button"
                aria-label={`Edit release condition ${index + 1} in Inspector`}
                title="Edit this release condition in Inspector"
                onClick={stopBubble(focusCondition)}
                className="min-w-0 flex-1 whitespace-normal break-words bg-transparent py-0.5 text-left text-xs font-medium outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {condition.label || condition.description || `Release condition ${index + 1}`}
                {condition.required !== false && condition.id !== "project-id-required" ? <span className="ml-1 text-xs font-bold text-destructive">*</span> : null}
              </button>
              <button
                type="button"
                aria-label={`Edit release condition ${index + 1} in Inspector`}
                title="Edit this release condition in Inspector"
                onClick={stopBubble(focusCondition)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <Settings2 className="size-3.5" />
              </button>
              {!condition.locked ? (
                <button
                  type="button"
                  aria-label={`Delete release condition ${index + 1}`}
                  onClick={stopBubble(() => deleteNodeCondition(node.id, condition.id, index))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={stopBubble(() =>
          saveConditions([
            ...conditions,
            {
              id: `condition-${crypto.randomUUID().slice(0, 8)}`,
              label: "New release condition",
              required: true,
              checked: false,
            },
          ]),
        )}
        className="mt-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
      >
        <Plus className="size-3.5" /> Add condition
      </button>
    </section>
  );
}
