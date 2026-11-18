"use client";

import { wholeDayCondition } from "@/lib/condition-duration";
import { ClipboardList, Trash2 } from "lucide-react";
import type { Condition, DomainNode } from "@/types/workflow";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function ConditionEditor({
  node,
  conditionIndex,
  update,
  onDelete,
}: {
  node: DomainNode;
  conditionIndex: number;
  update: (node: DomainNode) => void;
  onDelete: () => void;
}) {
  const condition =
    node.conditions[conditionIndex] && wholeDayCondition(node.conditions[conditionIndex]);
  if (!condition) return null;

  const updateCondition = (patch: Partial<Condition>) => {
    update({
      ...node,
      conditions: node.conditions.map((item, index) =>
        index === conditionIndex ? wholeDayCondition({ ...item, ...patch }) : item,
      ),
    });
  };

  return (
    <section className="mb-5 rounded-xl border border-primary/25 bg-primary/[0.045] p-3.5 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold">Release condition {conditionIndex + 1}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Edit the condition content here. The node card remains a compact status view.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {condition.locked ? (
            <span className="rounded-full border border-border/80 bg-muted/55 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Managed
            </span>
          ) : (
            <button
              type="button"
              aria-label={`Delete release condition ${conditionIndex + 1}`}
              title="Delete this release condition"
              onClick={onDelete}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label>Duration to complete</Label>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              step="1"
              aria-label={`Release condition ${conditionIndex + 1} duration`}
              value={condition.duration ?? ""}
              disabled={condition.locked}
              placeholder="e.g. 3"
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                updateCondition({
                  duration: Number.isFinite(value) && value > 0 ? value : undefined,
                });
              }}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
            />
            <select
              aria-label={`Release condition ${conditionIndex + 1} duration unit`}
              value={condition.durationUnit || "days"}
              disabled={condition.locked}
              onChange={(event) =>
                updateCondition({ durationUnit: event.target.value as "days" | "weeks" })
              }
              className="h-9 rounded-md border bg-background px-2 text-xs"
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Condition text</Label>
          <Textarea
            aria-label={`Release condition ${conditionIndex + 1} text`}
            value={condition.label || ""}
            readOnly={condition.locked}
            onChange={(event) => updateCondition({ label: event.target.value })}
            placeholder="Describe what must be true before this node can proceed."
            className="min-h-16 resize-y bg-background/75 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Supporting detail</Label>
          <Textarea
            aria-label={`Release condition ${conditionIndex + 1} supporting detail`}
            value={condition.description || ""}
            readOnly={condition.locked}
            onChange={(event) => updateCondition({ description: event.target.value })}
            placeholder="Optional context passed into the L3 requirement."
            className="min-h-14 resize-y bg-background/75 text-xs"
          />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={condition.required !== false}
          aria-label={`Release condition ${conditionIndex + 1} required`}
          disabled={condition.locked}
          onClick={() => updateCondition({ required: condition.required === false })}
          className={`flex h-9 w-full items-center rounded-md border px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${condition.required !== false ? "border-primary/40 bg-primary/10 text-primary" : "bg-background/75 text-muted-foreground"}`}
        >
          <span
            className={`mr-2 h-4 w-7 rounded-full p-0.5 ${condition.required !== false ? "bg-primary" : "bg-muted-foreground/35"}`}
          >
            <span
              className={`block size-3 rounded-full bg-white transition ${condition.required !== false ? "translate-x-3" : ""}`}
            />
          </span>
          {condition.required !== false ? "Required" : "Optional"}
        </button>
      </div>
    </section>
  );
}
