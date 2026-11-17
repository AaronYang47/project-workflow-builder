"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ScheduleTask } from "@/lib/process-schedule";
import type { Condition } from "@/types/workflow";

/** "Edit timing" sheet for one Gantt task: duration in weeks. */
export function TimingEditorDialog({
  task,
  previousCondition,
  workingDaysPerWeek,
  canEdit,
  onSave,
  onClose,
}: {
  task: ScheduleTask;
  /** The condition before this one in the same chapter, which it will follow. */
  previousCondition?: Condition;
  workingDaysPerWeek: number;
  canEdit: boolean;
  onSave: (durationWeeks: number) => void;
  onClose: () => void;
}) {
  const [weeks, setWeeks] = useState(() =>
    task.days ? String(Number((task.days / workingDaysPerWeek).toFixed(2))) : "",
  );
  const save = () => {
    const durationWeeks = Number(weeks);
    if (Number.isFinite(durationWeeks) && durationWeeks > 0) onSave(durationWeeks);
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="gantt-edit-title"
        className="max-h-[85dvh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-2xl border bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-xl sm:pb-5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="gantt-edit-title" className="text-base font-bold">
              Edit timing
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{task.title}</p>
          </div>
          <button
            type="button"
            aria-label="Close timing editor"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">
          Start ·{" "}
          {previousCondition
            ? `after ${previousCondition.label || "previous condition"} finishes`
            : "from existing phase timing"}
        </p>
        <label className="block text-sm font-semibold">
          Duration · weeks
          <input
            type="number"
            inputMode="decimal"
            min="0.1"
            step="0.01"
            aria-label={`Duration weeks for ${task.title}`}
            value={weeks}
            onChange={(event) => setWeeks(event.target.value)}
            className="mt-2 block h-12 w-full rounded-lg border bg-background px-3 text-base"
            required
          />
        </label>
        <p className="text-xs text-muted-foreground">
          The next condition can follow this finish automatically.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border px-3 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canEdit}
            className="min-h-11 flex-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Save timing
          </button>
        </div>
      </form>
    </div>
  );
}
