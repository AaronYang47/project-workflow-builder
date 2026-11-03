"use client";

import { cn } from "@/lib/utils";
import {
  PROJECT_ID_PATTERN,
  legacyJobNumberFromProjectId,
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
  const projectName = useWorkflowStore((state) => state.file.graph.metadata.name);
  const projectStart = nodes.find((item) => item.type === "projectStart");
  const rawProjectId = String(projectStart?.customFields.projectId || "");
  const projectId = rawProjectId;
  const ready = PROJECT_ID_PATTERN.test(projectId);
  const legacy = legacyJobNumberFromProjectId(projectId);
  const customerCode = String(projectStart?.customFields.customerCode || "").toUpperCase() ||
    projectName.match(/^\d{5}[_ -]([A-Za-z]{4})(?=[_ -]|$)/)?.[1]?.toUpperCase() || "";
  const displayedId = [legacy, customerCode].filter(Boolean).join(" ");

  if (!ready && !showPlaceholder) return null;

  const title = ready
    ? displayedId
    : "Set a five-digit job number on Project Start to display here";
  const onDark = tone === "onDark";
  const large = size === "large";
  const containerSize = large ? "max-w-[min(100%,17rem)]" : "max-w-[min(100%,15rem)]";
  const containerPad = large ? "px-2.5 py-1.5" : "px-2 py-1";
  const idSize = large ? "text-[14px]" : "text-[12px]";

  return (
    <span
      title={title}
      className={cn(
        "flex w-max shrink-0 items-end rounded-md border font-mono font-bold leading-none tracking-tight",
        containerSize,
        containerPad,
        onDark
          ? ready
            ? "border-white/30 bg-white/15 text-white"
            : "border-white/20 bg-white/10 text-white/70"
          : ready
            ? "border-border/80 bg-background/85 text-foreground shadow-2xs backdrop-blur-xs dark:border-white/20 dark:bg-black/40 dark:text-white"
            : "border-amber-500/70 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        className,
      )}
    >
      <span className={cn(idSize, "whitespace-nowrap font-bold text-right", ready ? "text-foreground dark:text-white" : "text-amber-900 dark:text-amber-200")}>
        {ready ? displayedId : "JOB # NOT SET"}
      </span>
    </span>
  );
}
