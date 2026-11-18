"use client";

import { useState } from "react";
import { Factory } from "lucide-react";
import { NumberInput } from "@/components/simulation/draft-inputs";
import type { WorkflowFile } from "@/types/workflow";

type FactoryProduction = NonNullable<WorkflowFile["factoryProduction"]>;

/**
 * L4 header control for the project's factory line inputs, read by the L5
 * Construction Simulation: how many modules and how many weeks each takes.
 */
export function FactoryProductionButton({
  value,
  canEdit,
  onSave,
}: {
  value?: FactoryProduction;
  canEdit: boolean;
  onSave: (value: FactoryProduction) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    value?.modules && value.weeksPerModule
      ? `${value.modules} modules · ${value.weeksPerModule} wk`
      : "Set modules";
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Factory line inputs"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-lg border bg-panel px-3 py-2"
      >
        <Factory className="size-3.5" /> {summary}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Factory line"
          className="absolute right-0 top-full z-30 mt-1 w-64 space-y-2 rounded-lg border bg-background p-3 text-xs shadow-lg"
        >
          <p className="font-bold">Factory line</p>
          <p className="text-muted-foreground">
            Used by L5 Construction Simulation when this project is added.
          </p>
          <label className="block font-semibold text-muted-foreground">
            Modules
            <NumberInput
              label="Project modules"
              value={value?.modules ?? 0}
              min={1}
              integer
              onCommit={(modules) => canEdit && onSave({ ...value, modules })}
              className="mt-1 block min-h-9 w-full rounded-md border bg-background px-2.5 text-sm"
            />
          </label>
          <label className="block font-semibold text-muted-foreground">
            Weeks per module on the line
            <NumberInput
              label="Project weeks per module"
              value={value?.weeksPerModule ?? 0}
              min={0.5}
              step={0.5}
              onCommit={(weeksPerModule) => canEdit && onSave({ ...value, weeksPerModule })}
              className="mt-1 block min-h-9 w-full rounded-md border bg-background px-2.5 text-sm"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
