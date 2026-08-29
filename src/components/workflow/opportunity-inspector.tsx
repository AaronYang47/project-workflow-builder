"use client";

import { Target } from "lucide-react";
import type { DomainNode } from "@/types/workflow";

export function OpportunityInspector({ node }: { node: DomainNode }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
        <Target className="size-5" />
      </div>
      <h4 className="text-sm font-bold text-foreground">
        {node.title || "Opportunity Node"}
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Card contents cleared. Ready for redesign.
      </p>
    </div>
  );
}
