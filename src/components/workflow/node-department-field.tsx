"use client";

import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

/** Department owning a non-Department card (Estimation, Route Selection) in L3 and the Gantt. */
export function NodeDepartmentField({ node }: { node: DomainNode }) {
  const value = String(node.config.stage ?? "");
  return (
    <label className="nodrag mt-1 flex items-center gap-2 text-[10px]">
      <span className="font-bold uppercase tracking-wider text-muted-foreground">Department</span>
      <input
        key={value}
        aria-label={`${node.title || "Node"} department`}
        data-node-department
        defaultValue={value}
        placeholder="e.g. Sales"
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const department = event.currentTarget.value.trim();
          if (department === value) return;
          useWorkflowStore.getState().updateNode(node.id, {
            config: { ...node.config, stage: department || value },
          });
        }}
        className="min-w-0 flex-1 rounded border bg-background/70 px-1.5 py-0.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
