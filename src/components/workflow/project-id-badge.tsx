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
 * `size="large"` is used by the Phase header; Node/Decision Module stay default.
 */
export function ProjectIdBadge({
  tone = "primary",
  showPlaceholder = false,
  size = "default",
  className,
}: {
  tone?: "primary" | "onDark";
  showPlaceholder?: boolean;
  size?: "default" | "large";
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
  const large = size === "large";
  const containerSize = large ? "max-w-[min(100%,17rem)]" : "max-w-[min(100%,15rem)]";
  const containerPad = large ? "px-2.5 py-1.5 gap-1" : "px-2 py-1 gap-0.5";
  const idSize = large ? "text-[14px]" : "text-[12px]";

  return (
    <span
      title={title}
      className={cn(
        "flex w-max shrink-0 flex-col items-end rounded-md border font-mono font-bold leading-none tracking-tight",
        containerSize,
        containerPad,
        onDark
          ? ready
            ? "border-white/30 bg-white/15 text-white"
            : "border-white/20 bg-white/10 text-white/70"
          : ready
            ? "border-border/80 bg-background/85 text-foreground shadow-2xs backdrop-blur-xs dark:border-white/20 dark:bg-black/40 dark:text-white"
            : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <span className={cn(idSize, "whitespace-nowrap font-bold text-right text-foreground dark:text-white")}>
        {ready ? displayedId : "L-—"}
      </span>
      <span className="flex items-baseline justify-end gap-1 whitespace-nowrap text-right font-mono">
        <span
          className={cn(
            "font-semibold tracking-wider uppercase",
            large ? "text-[10px]" : "text-[9px]",
            onDark
              ? "text-white/70"
              : "text-muted-foreground/80 dark:text-slate-400",
          )}
        >
          Legacy
        </span>
        <span
          className={cn(
            "font-bold tracking-tight text-right",
            large ? "text-[12px]" : "text-[11px]",
            onDark
              ? "text-white"
              : "text-foreground dark:text-white",
          )}
        >
          {ready ? legacy || "—" : "—"}
        </span>
      </span>
    </span>
  );
}
