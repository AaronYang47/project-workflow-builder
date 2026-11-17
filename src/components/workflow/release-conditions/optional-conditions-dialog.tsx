"use client";

import { Plus, Trash2, X } from "lucide-react";
import { type Condition } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  conditionText,
  DOCUMENT_GROUPS,
  conditionFormCount,
  departmentBoardHeading,
} from "@/lib/release-conditions-workspace-model";
import { useState } from "react";

/** Optional conditions of one Department: add, edit time needed, remove, open forms. */
export function OptionalConditionsDialog({
  chapterId,
  canEdit,
  onClose,
  onViewForms,
  onConditionRemoved,
}: {
  chapterId: string;
  canEdit: boolean;
  onClose: () => void;
  onViewForms: (chapterId: string, condition: { id?: string; index: number }) => void;
  onConditionRemoved: (conditionId: string) => void;
}) {
  const file = useWorkflowStore((state) => state.file);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const [optionalEditorChapterId, setOptionalEditorChapterId] = useState<string | null>(null);
  const [optionalTitle, setOptionalTitle] = useState("");
  const [optionalDuration, setOptionalDuration] = useState("");
  const [optionalUnit, setOptionalUnit] = useState<"days" | "weeks">("days");
  const createOptionalCondition = (targetChapterId: string) => {
    if (!canEdit || !optionalTitle.trim()) return;
    const duration = Number(optionalDuration);
    if (!Number.isInteger(duration) || duration <= 0) return;
    const latest = useWorkflowStore
      .getState()
      .file.graph.nodes.find((node) => node.id === targetChapterId);
    if (!latest) return;
    updateNode(targetChapterId, {
      optionalConditions: [
        ...(latest.optionalConditions ?? []),
        {
          id: `optional-${crypto.randomUUID()}`,
          label: optionalTitle.trim(),
          duration,
          durationUnit: optionalUnit,
        },
      ],
    });
    setOptionalEditorChapterId(null);
    setOptionalTitle("");
    setOptionalDuration("");
    setOptionalUnit("days");
  };
  const updateOptionalCondition = (
    chapterId: string,
    conditionId: string | undefined,
    patch: Partial<Condition>,
  ) => {
    if (!canEdit || !conditionId) return;
    const latest = useWorkflowStore
      .getState()
      .file.graph.nodes.find((node) => node.id === chapterId);
    if (!latest) return;
    updateNode(chapterId, {
      optionalConditions: (latest.optionalConditions ?? []).map((condition) =>
        condition.id === conditionId ? { ...condition, ...patch } : condition,
      ),
    });
  };
  const removeOptionalCondition = (chapterId: string, conditionId: string | undefined) => {
    if (!canEdit || !conditionId) return;
    const latest = useWorkflowStore
      .getState()
      .file.graph.nodes.find((node) => node.id === chapterId);
    if (!latest) return;
    const customFields = { ...latest.customFields };
    for (const group of DOCUMENT_GROUPS)
      delete customFields[`${group.field}::release-condition::${conditionId}`];
    updateNode(chapterId, {
      optionalConditions: (latest.optionalConditions ?? []).filter(
        (condition) => condition.id !== conditionId,
      ),
      customFields,
    });
    onConditionRemoved(conditionId);
  };

  const chapter = file.graph.nodes.find((node) => node.id === chapterId);
  if (!chapter) return null;
  const heading = departmentBoardHeading(chapter);
  const close = onClose;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="optional-conditions-title"
        className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-primary/[0.06] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold text-primary">
              {heading.department} · {heading.chapter}
            </p>
            <h2 id="optional-conditions-title" className="text-sm font-bold">
              Optional Conditions · {(chapter.optionalConditions ?? []).length}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Optional Conditions"
            onClick={close}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {canEdit ? (
            <button
              type="button"
              aria-label={`Add Optional Condition to ${heading.department} ${heading.chapter}`}
              onClick={() => {
                setOptionalEditorChapterId(chapter.id);
                setOptionalTitle("");
                setOptionalDuration("");
                setOptionalUnit("days");
              }}
              className="flex items-center gap-1 rounded border px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="size-4" /> Add Optional Condition
            </button>
          ) : null}
          {optionalEditorChapterId === chapter.id ? (
            <form
              aria-label={`New optional condition for ${heading.department} ${heading.chapter}`}
              onSubmit={(event) => {
                event.preventDefault();
                createOptionalCondition(chapter.id);
              }}
              className="grid gap-2 rounded-lg border bg-background/70 p-3"
            >
              <input
                autoFocus
                aria-label="Optional condition name"
                value={optionalTitle}
                onChange={(event) => setOptionalTitle(event.target.value)}
                placeholder="Optional condition name"
                className="h-9 rounded border bg-background px-3 text-xs"
                required
              />
              <div className="flex gap-2">
                <input
                  aria-label="Optional condition duration"
                  type="number"
                  min="1"
                  step="1"
                  value={optionalDuration}
                  onChange={(event) => setOptionalDuration(event.target.value)}
                  placeholder="Time needed"
                  className="h-9 min-w-0 flex-1 rounded border bg-background px-3 text-xs"
                  required
                />
                <select
                  aria-label="Optional condition duration unit"
                  value={optionalUnit}
                  onChange={(event) => setOptionalUnit(event.target.value as "days" | "weeks")}
                  className="h-9 rounded border bg-background px-2 text-xs"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOptionalEditorChapterId(null)}
                  className="rounded border px-3 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Save Optional Condition
                </button>
              </div>
            </form>
          ) : null}
          {(chapter.optionalConditions ?? []).map((condition, index) => {
            const formsCount = conditionFormCount(chapter, condition);
            const fullIndex = chapter.conditions.length + index;
            return (
              <div
                key={condition.id || index}
                role="group"
                aria-label={`Optional condition: ${conditionText(condition, index)}`}
                className="rounded-lg border bg-background/70 p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-5">
                    {conditionText(condition, index)}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      aria-label={`Remove optional condition ${conditionText(condition, index)}`}
                      onClick={() => removeOptionalCondition(chapter.id, condition.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    aria-label={`Time needed for ${conditionText(condition, index)}`}
                    type="number"
                    min="1"
                    step="1"
                    value={condition.duration ?? ""}
                    disabled={!canEdit}
                    onChange={(event) => {
                      const value = event.target.valueAsNumber;
                      updateOptionalCondition(chapter.id, condition.id, {
                        duration: Number.isInteger(value) && value > 0 ? value : undefined,
                      });
                    }}
                    className="h-9 w-20 shrink-0 rounded border bg-background px-2 text-xs"
                  />
                  <select
                    aria-label={`Time unit for ${conditionText(condition, index)}`}
                    value={condition.durationUnit || "days"}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateOptionalCondition(chapter.id, condition.id, {
                        durationUnit: event.target.value as "days" | "weeks",
                      })
                    }
                    className="h-9 rounded border bg-background px-2 text-xs"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                  <button
                    type="button"
                    aria-label={`View forms for ${conditionText(condition, index)}`}
                    onClick={() => {
                      onViewForms(chapter.id, { id: condition.id, index: fullIndex });
                    }}
                    className="ml-auto shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
                  >
                    {formsCount} {formsCount === 1 ? "form" : "forms"}
                  </button>
                </div>
              </div>
            );
          })}
          {!(chapter.optionalConditions ?? []).length ? (
            <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
              No optional conditions yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
