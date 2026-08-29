"use client";

import { Handle, Position } from "@xyflow/react";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DomainNode } from "@/types/workflow";

export function OpportunityNode({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  return (
    <div className="relative h-full w-full select-none">
      {/* Target Handle: Input from Project Start */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-primary"
      />

      <div
        className={cn(
          "flex h-[180px] w-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-card/60 p-6 text-center text-muted-foreground transition-all",
          selected ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/50",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3 shadow-sm">
          <Target className="size-5" />
        </span>
        <h3 className="text-sm font-bold text-foreground">
          {node.title || "Opportunity Node"}
        </h3>
        <p className="text-xs text-muted-foreground/80 mt-1">
          (Card contents cleared)
        </p>
        <span className="mt-3 inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Ready for Redesign
        </span>
      </div>

      {/* Source Handle: Forward to Gate 1 */}
      <Handle
        type="source"
        position={Position.Right}
        id="pass-p1-p2"
        className="!size-3 !border-2 !border-background !bg-emerald-600"
      />
    </div>
  );
}

export default OpportunityNode;
