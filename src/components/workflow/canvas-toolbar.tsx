"use client";

import { useMemo } from "react";
import { validateWorkflow } from "@/lib/validation";
import { PanelBottomOpen } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";

export function CanvasToolbar({ className }: { className?: string }) {
  const togglePanel = useWorkflowStore((state) => state.togglePanel);
  const file = useWorkflowStore((state) => state.file);
  const issueCount = useMemo(() => validateWorkflow(file).length, [file]);

  return (
    <div
      className={cn(
        "flex w-fit items-center gap-1 rounded-lg border bg-background/92 p-1 shadow-sm backdrop-blur",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => togglePanel("validation")}
        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
      >
        <PanelBottomOpen className="size-3.5" />
        Validation
        {issueCount ? (
          <span className="rounded-full bg-destructive px-1.5 text-[9px] text-white">
            {issueCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
