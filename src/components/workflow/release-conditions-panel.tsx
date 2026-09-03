"use client";

import { useState } from "react";
import { Check, GripVertical, Plus, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import type { ExecutionItem, Condition, DomainNode } from "@/types/workflow";
import type { ProjectOperations } from "@/types/project-operations";
import { conditionInspectorKey } from "@/lib/inspector-schema";
import { conditionHasL3Forms, conditionIsSatisfied, nodeReleaseReady } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { stopBubble } from "./node-utils";

const CONDITION_ROW_STEP = 46;

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
  const deleteNodeCondition = useWorkflowStore(
    (state) => state.deleteNodeCondition,
  );
  const focusedInspectorField = useWorkflowStore(
    (state) => state.focusedInspectorField,
  );
  const [draggingConditionIndex, setDraggingConditionIndex] = useState<number | null>(null);
  const [dragOverConditionIndex, setDragOverConditionIndex] = useState<number | null>(null);
  const [dragTargetConditionIndex, setDragTargetConditionIndex] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragRowStep, setDragRowStep] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const conditions = node.conditions || [];
  const statusReady = reached && nodeReleaseReady(
    node,
    projectStartNode,
    executionItems,
    operations,
  );
  const saveConditions = (next: Condition[]) =>
    updateNode(node.id, { conditions: next });
  const reorderConditions = (targetIndex: number) => {
    if (draggingConditionIndex === null || draggingConditionIndex === targetIndex) return;
    const nextConditions = [...conditions];
    const [movedCondition] = nextConditions.splice(draggingConditionIndex, 1);
    if (!movedCondition) return;
    nextConditions.splice(targetIndex, 0, movedCondition);
    saveConditions(nextConditions);
  };
  const resetDrag = () => {
    setDraggingConditionIndex(null);
    setDragOverConditionIndex(null);
    setDragTargetConditionIndex(null);
    setDragStartY(null);
    setDragRowStep(0);
    setDragOffsetY(0);
  };
  const finishConditionDrag = () => {
    if (dragOverConditionIndex !== null) reorderConditions(dragOverConditionIndex);
    resetDrag();
  };

  return (
    <section className="rounded-lg border bg-background/70 p-2.5">
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
      <div className="space-y-1.5">
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
          const rowShift = (() => {
            if (draggingConditionIndex === null || dragTargetConditionIndex === null) return 0;
            if (index === draggingConditionIndex) return dragOffsetY;
            if (
              draggingConditionIndex < dragTargetConditionIndex &&
              index > draggingConditionIndex &&
              index <= dragTargetConditionIndex
            ) return -CONDITION_ROW_STEP;
            if (
              dragTargetConditionIndex < draggingConditionIndex &&
              index >= dragTargetConditionIndex &&
              index < draggingConditionIndex
            ) return CONDITION_ROW_STEP;
            return 0;
          })();
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
            if (linkedItem) {
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
              data-dragging={draggingConditionIndex === index || undefined}
              data-drop-target={
                dragTargetConditionIndex === index && draggingConditionIndex !== index
                  ? true
                  : undefined
              }
              onClick={stopBubble(focusCondition)}
              onDragOver={(event) => {
                if (draggingConditionIndex !== null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverConditionIndex(index);
                setDragTargetConditionIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                reorderConditions(index);
                resetDrag();
              }}
              className={cn(
                "relative flex min-h-10 items-center gap-2 rounded-md border bg-card px-2 py-2 transition-[background-color,border-color,box-shadow,opacity,transform] duration-200",
                inspectorFocused &&
                  "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
                !inspectorFocused && "hover:border-primary/35 hover:bg-primary/[0.025]",
                dragTargetConditionIndex === index &&
                  draggingConditionIndex !== index &&
                  "border-primary/90 bg-primary/[0.10] shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_18%,transparent),0_8px_18px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
                draggingConditionIndex === index &&
                  "z-10 scale-[1.015] border-primary/90 bg-primary/[0.12] opacity-60 shadow-[0_10px_22px_color-mix(in_srgb,var(--primary)_20%,transparent)]",
              )}
              style={rowShift ? { transform: `translateY(${rowShift}px)` } : undefined}
            >
              <button
                type="button"
                aria-label={`Drag to reorder release condition ${index + 1}`}
                title="Drag to reorder"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const row = event.currentTarget.closest<HTMLElement>("[data-release-condition-index]");
                  const nextRow = row?.nextElementSibling as HTMLElement | null;
                  const previousRow = row?.previousElementSibling as HTMLElement | null;
                  const rowRect = row?.getBoundingClientRect();
                  const rowStep =
                    rowRect && nextRow
                      ? nextRow.getBoundingClientRect().top - rowRect.top
                      : rowRect && previousRow
                        ? rowRect.top - previousRow.getBoundingClientRect().top
                        : rowRect?.height || CONDITION_ROW_STEP;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDraggingConditionIndex(index);
                  setDragStartY(rowRect ? rowRect.top + rowRect.height / 2 : event.clientY);
                  setDragRowStep(Math.max(1, rowStep));
                  setDragOffsetY(0);
                  setDragOverConditionIndex(index);
                  setDragTargetConditionIndex(index);
                }}
                onPointerMove={(event) => {
                  if (draggingConditionIndex === null || dragStartY === null || dragRowStep <= 0) return;
                  const targetIndex = Math.min(
                    conditions.length - 1,
                    Math.max(0, draggingConditionIndex + Math.round((event.clientY - dragStartY) / dragRowStep)),
                  );
                  setDragOffsetY(((event.clientY - dragStartY) / dragRowStep) * CONDITION_ROW_STEP);
                  setDragTargetConditionIndex(targetIndex);
                  setDragOverConditionIndex(targetIndex);
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  finishConditionDrag();
                }}
                onPointerCancel={resetDrag}
                onClick={stopBubble(() => undefined)}
                className={cn(
                  "nodrag flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/70 transition-[background-color,color,transform] hover:bg-primary/10 hover:text-primary active:cursor-grabbing",
                  draggingConditionIndex === index && "cursor-grabbing bg-primary/15 text-primary",
                )}
              >
                <GripVertical className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`${checked ? "Uncheck" : "Check"} release condition ${index + 1}`}
                title={
                  condition.id === "project-id-required"
                    ? "Complete the project ID field first"
                    : checked
                      ? "Uncheck this release condition"
                      : "Mark this release condition complete"
                }
                disabled={
                  condition.id === "project-id-required" ||
                  Boolean(condition.linkedExecutionItemId) ||
                  conditionHasL3Forms(condition, node)
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
                className="min-w-0 flex-1 truncate bg-transparent py-0.5 text-left text-xs font-medium outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {condition.label || condition.description || `Release condition ${index + 1}`}
                {condition.required !== false ? <span className="ml-1 text-xs font-bold text-destructive">*</span> : null}
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
