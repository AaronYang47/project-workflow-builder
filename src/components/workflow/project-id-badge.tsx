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
 * Hugs its text. Building/module codes append on the ID line.
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
  const suffix = [buildingCode, moduleCode].filter(Boolean).join("-");
  const displayedId = ready && suffix ? `${projectId}-${suffix}` : projectId;

  if (!ready && !showPlaceholder) return null;

  const title = ready
    ? [displayedId, `Legacy ${legacy || "—"}`].join(" · ")
    : "Set a Project ID on Project Start to display here";
  const onDark = tone === "onDark";

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap rounded-md border px-2 py-1 font-mono font-bold leading-none tracking-tight",
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
      <span className="whitespace-nowrap text-[10px]">
        {ready ? displayedId : "L-—"}
      </span>
      <span
        className={cn(
          "rounded px-1 py-px text-[8px] font-bold tracking-tight",
          onDark
            ? ready
              ? "bg-emerald-500/30 text-emerald-50"
              : "bg-white/15 text-white/70"
            : ready
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-background text-muted-foreground",
        )}
      >
        Legacy {ready ? legacy || "—" : "—"}
      </span>
    </span>
  );
}
