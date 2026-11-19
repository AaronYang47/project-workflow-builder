"use client";

import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import { RELEASE_CONDITION_INBOX_ID } from "@/lib/release-condition-inbox";
import { ganttDurationText } from "@/lib/gantt-bar-label";
import { wholeDayCondition } from "@/lib/condition-duration";
import type { Condition } from "@/types/workflow";

/** Unsubmitted form text; kept by the page so it survives closing the panel. */
export type ConditionDraft = { name: string; durationWeeks: string };
export const EMPTY_CONDITION_DRAFT: ConditionDraft = { name: "", durationWeeks: "" };

/**
 * Side panel on the Process & Gantt page: create a release condition, then
 * drag it from the Unassigned list into a chapter row of the Gantt chart.
 */
export function CreateConditionPanel({
  canEdit,
  workingDaysPerWeek,
  draftState,
  onClose,
}: {
  canEdit: boolean;
  workingDaysPerWeek: number;
  draftState: [ConditionDraft, (draft: ConditionDraft) => void];
  onClose: () => void;
}) {
  const inbox = useWorkflowStore((state) => state.file.releaseConditionInbox) ?? [];
  const setInbox = useWorkflowStore((state) => state.setReleaseConditionInbox);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const [{ name: draft, durationWeeks: draftDuration }, setDraftState] = draftState;
  const setDraft = (name: string) => setDraftState({ name, durationWeeks: draftDuration });
  const setDraftDuration = (durationWeeks: string) => setDraftState({ name: draft, durationWeeks });
  const currentInbox = () => useWorkflowStore.getState().file.releaseConditionInbox ?? [];

  const createCondition = () => {
    if (!canEdit || !draft.trim()) return;
    const duration = Number(draftDuration);
    const condition: Condition = {
      id: `condition-${crypto.randomUUID()}`,
      label: draft.trim(),
      required: true,
      checked: false,
      ...(Number.isFinite(duration) && duration > 0
        ? { duration, durationUnit: "weeks" as const }
        : {}),
    };
    setInbox([...currentInbox(), wholeDayCondition(condition, workingDaysPerWeek)]);
    setDraftState(EMPTY_CONDITION_DRAFT);
  };

  return (
    <aside
      aria-label="Create and assign steps"
      className="absolute bottom-4 right-4 top-20 z-50 flex w-[320px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-xl border bg-panel shadow-xl"
    >
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-3">
        <h2 className="text-sm font-bold">Create Step</h2>
        <button
          type="button"
          aria-label="Close Create Step"
          onClick={onClose}
          className="rounded p-1 hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <form
        className="shrink-0 space-y-3 border-b p-3"
        onSubmit={(event) => {
          event.preventDefault();
          createCondition();
        }}
      >
        <label className="block text-xs font-semibold">
          Step name
          <input
            aria-label="New step"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!canEdit}
            required
            placeholder="e.g. Approve shop drawings"
            className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-xs"
          />
        </label>
        <label className="block text-xs font-semibold">
          Duration to complete · weeks (optional)
          <input
            type="number"
            min="0.1"
            step="0.1"
            aria-label="New condition duration in weeks"
            value={draftDuration}
            onChange={(event) => setDraftDuration(event.target.value)}
            disabled={!canEdit}
            placeholder="e.g. 16 for 4 months"
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={!canEdit || !draft.trim()}
          className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Plus className="size-3.5" /> Create step
        </button>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Drag a step below into a chapter in the Gantt chart, and it adopts that chapter’s
          department and phase.
        </p>
      </form>
      <section
        aria-label="Unassigned steps"
        data-release-condition-chapter
        data-release-condition-drop-node-id={RELEASE_CONDITION_INBOX_ID}
        data-release-condition-count={inbox.length}
        className="flex min-h-0 flex-1 flex-col data-[drop-chapter=true]:bg-primary/10"
      >
        <h3 className="shrink-0 px-3 py-2 text-xs font-bold">Unassigned · {inbox.length}</h3>
        <div
          data-release-condition-list
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3"
        >
          {inbox.map((condition, index) => {
            const name = condition.label || `step ${index + 1}`;
            return (
              <div
                key={condition.id || index}
                data-release-condition-index={index}
                data-release-condition-node-id={RELEASE_CONDITION_INBOX_ID}
                className="flex items-center gap-2 rounded-lg border bg-background p-2"
              >
                <button
                  type="button"
                  aria-label={`Drag unassigned ${name}`}
                  disabled={!canEdit || condition.locked}
                  onPointerDown={(event) => {
                    if (!canEdit) return;
                    beginReleaseConditionDrag(
                      event.nativeEvent,
                      event.currentTarget,
                      {
                        nodeId: RELEASE_CONDITION_INBOX_ID,
                        index,
                        label: condition.label || "Step",
                      },
                      (target) =>
                        moveCondition(
                          RELEASE_CONDITION_INBOX_ID,
                          index,
                          target.nodeId,
                          target.index,
                        ),
                    );
                  }}
                  className="shrink-0 touch-none cursor-grab py-2 text-muted-foreground disabled:opacity-40"
                >
                  <GripVertical className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs font-medium">
                    {condition.label || condition.description || "Step"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {ganttDurationText(condition, false, workingDaysPerWeek) || "Duration not set"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete unassigned ${name}`}
                  disabled={!canEdit || condition.locked}
                  onClick={() => {
                    if (canEdit && !condition.locked) {
                      setInbox(
                        currentInbox().filter((item, itemIndex) =>
                          condition.id ? item.id !== condition.id : itemIndex !== index,
                        ),
                      );
                    }
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
          {!inbox.length && (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Create a condition above, or drag one here to unassign it.
            </p>
          )}
        </div>
      </section>
    </aside>
  );
}
