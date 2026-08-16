"use client";

import { cn } from "@/lib/utils";
import {
  PROJECT_ID_PATTERN,
  legacyJobNumberFromProjectId,
  projectIdForDisplay,
  projectWideLocationCodes,
} from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";

/**
 * Shared Project ID chip shown on Phase, Node, and Decision Module headers.
 * When paid-service building/module codes exist, they appear on their own row.
 */
export function ProjectIdBadge({
  tone = "primary",
  showPlaceholder = false,
  className,
}: {
  tone?: "primary" | "onDark";
  showPlaceholder?: boolean;
  className?: string;
}) {
  const nodes = useWorkflowStore((state) => state.file.graph.nodes);
  const projectStart = nodes.find((item) => item.type === "projectStart");
  const serviceType = String(projectStart?.config.serviceType || "Standard");
  const rawProjectId = String(projectStart?.customFields.projectId || "");
  const projectId = projectIdForDisplay(rawProjectId, serviceType);
  const ready = PROJECT_ID_PATTERN.test(projectId);
  const { buildingCode, moduleCode } = projectWideLocationCodes(nodes);
  const legacy = legacyJobNumberFromProjectId(projectId);
  const location = [buildingCode, moduleCode].filter(Boolean).join(" · ");

  if (!ready && !showPlaceholder) return null;

  const title = ready
    ? [projectId, `Legacy ${legacy || "—"}`, buildingCode, moduleCode]
        .filter(Boolean)
        .join(" · ")
    : "Set a Project ID on Project Start to display here";
  const onDark = tone === "onDark";

  return (
    <span
      title={title}
      className={cn(
        "flex shrink-0 flex-col items-end gap-1 rounded-md border px-2.5 py-1.5 font-mono font-bold leading-tight tracking-tight",
        onDark
          ? ready
            ? "border-white/30 bg-white/15 text-white"
            : "border-white/20 bg-white/10 text-white/70"
          : ready
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <span className="text-sm">{ready ? projectId : "L-—"}</span>
      <span
        className={cn(
          "rounded px-1 text-xs font-bold tracking-tight",
          onDark
            ? ready
              ? "bg-white/25 text-white"
              : "bg-white/15 text-white/70"
            : ready
              ? "bg-primary/20 text-primary"
              : "bg-background text-muted-foreground",
        )}
      >
        Legacy {ready ? legacy || "—" : "—"}
      </span>
      {ready && location ? (
        <span
          className={cn(
            "rounded px-1 text-xs font-bold tracking-tight",
            onDark ? "bg-white/25 text-white" : "bg-primary/20 text-primary",
          )}
        >
          {location}
        </span>
      ) : null}
    </span>
  );
}
