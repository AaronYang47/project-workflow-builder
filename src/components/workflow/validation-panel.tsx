"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  ShieldCheck,
} from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";

export function ValidationPanel({ highLevelMode = false }: { highLevelMode?: boolean }) {
  const { issues, togglePanel, selectNodes, selectEdge } = useWorkflowStore();
  const selectHighLevelNodes = useWorkflowStore((state) => state.selectHighLevelNodes);
  const selectHighLevelEdge = useWorkflowStore((state) => state.selectHighLevelEdge);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const focus = (nodeId?: string, edgeId?: string) => {
    if (nodeId) {
      if (highLevelMode) selectHighLevelNodes([nodeId]);
      else {
        selectNodes([nodeId]);
        window.dispatchEvent(
          new CustomEvent("workflow:focus-node", { detail: nodeId }),
        );
      }
    } else if (edgeId) {
      if (highLevelMode) selectHighLevelEdge(edgeId);
      else selectEdge(edgeId);
    }
  };

  return (
    <section
      aria-label="Validation results"
      className="h-[190px] shrink-0 border-t bg-panel"
    >
      <div className="flex h-10 min-w-0 items-center gap-2 border-b px-3">
        <ShieldCheck className="size-4 shrink-0 text-primary" />
        <span className="shrink-0 text-xs font-semibold">
          Validation results
        </span>
        {issues.length ? (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-destructive">
              <AlertCircle className="size-3" />
              {errors} errors
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="size-3" />
              {warnings} warnings
            </span>
          </div>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-emerald-600">
            <CheckCircle2 className="size-3 shrink-0" />
            No issues detected
          </span>
        )}
        <button
          type="button"
          onClick={() => togglePanel("validation")}
          className="ml-auto shrink-0 rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close validation"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <div className="scroll-thin h-[150px] overflow-y-auto p-2">
        {issues.length ? (
          issues.map((issue) => (
            <button
              type="button"
              key={issue.id}
              onClick={() => focus(issue.nodeId, issue.edgeId)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={`mt-0.5 ${issue.severity === "error" ? "text-destructive" : issue.severity === "warning" ? "text-amber-600" : "text-primary"}`}
              >
                {issue.severity === "error" ? (
                  <AlertCircle className="size-3.5" />
                ) : issue.severity === "warning" ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <Info className="size-3.5" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium">
                  {issue.message}
                </span>
                <span className="mt-0.5 block break-all font-mono text-[10px] uppercase text-muted-foreground">
                  {issue.code}
                </span>
              </span>
            </button>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="mb-2 size-5 text-emerald-600" />
            <p className="text-xs font-medium">Workflow checks passed</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No blocking errors or warnings were found.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
