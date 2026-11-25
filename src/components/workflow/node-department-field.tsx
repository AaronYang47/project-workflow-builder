"use client";

import type { ComponentType, ReactNode } from "react";
import { chapterLabel } from "@/lib/chapter-label";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

/**
 * The same header bar Department cards use: icon, "DEPARTMENT" and the
 * department name, with an optional status on the right. Used by Estimation
 * and Route Selection so they read like the other Department cards.
 */
export function DepartmentHeaderBar({
  node,
  icon: Icon,
  color,
  className,
  children,
}: {
  node: DomainNode;
  icon: ComponentType<{ className?: string }>;
  color: string;
  className?: string;
  children?: ReactNode;
}) {
  const value = String(node.config.stage ?? "");
  return (
    <div
      data-node-header
      className={cn(
        "flex h-14 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing",
        className,
      )}
      style={{ backgroundColor: `${color}18`, borderColor: `${color}33` }}
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        <Icon className="size-4" />
      </span>
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Department
        </span>
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <input
          key={value}
          aria-label={`${node.title || "Node"} department`}
          data-node-department
          defaultValue={chapterLabel(value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const department = event.currentTarget.value.trim() || value;
            if (department === value) return;
            useWorkflowStore.getState().updateNode(node.id, {
              config: { ...node.config, stage: department },
            });
          }}
          className="nodrag h-8 w-full min-w-[3rem] border-0 bg-transparent p-0 text-xs font-bold outline-none"
        />
      </label>
      {children ? <div className="ml-auto shrink-0">{children}</div> : null}
    </div>
  );
}
