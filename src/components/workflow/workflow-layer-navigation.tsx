"use client";

import Link from "next/link";
import {
  canEditCollaborativeWorkflow,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";

const layers = [
  { id: "L1", label: "L1 · High Level", path: "/", aria: "L1 · Process" },
  { id: "L2", label: "L2 · Detailed Workflow", path: "/", aria: "L2 · Department Workflow" },
  {
    id: "L3",
    label: "L3 · Conditions",
    path: "/release-conditions",
    aria: "Open Steps Workspace",
  },
  {
    id: "L4",
    label: "L4 · Process & Gantt",
    path: "/process-overview",
    aria: "Open Process Overview",
  },
  {
    id: "L5",
    label: "L5 · Simulation",
    path: "/construction-simulation",
    aria: "Open Construction Simulation",
  },
  {
    id: "L6",
    label: "L6 · Multi-Project",
    path: "/multi-project",
    aria: "Open Multi-Project Schedule",
  },
] as const;

export function WorkflowLayerNavigation({
  currentLayer,
  onlyAdvanced = false,
  embedded = false,
}: {
  currentLayer: "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
  onlyAdvanced?: boolean;
  embedded?: boolean;
}) {
  const room = useCollaborationStore((state) => state.roomId);
  const editor = useCollaborationStore((state) => state.editorPeerId);
  const canEdit = useCollaborationStore(canEditCollaborativeWorkflow);
  return (
    <nav
      aria-label="Workflow layers"
      className={
        onlyAdvanced || embedded
          ? "flex min-w-0 flex-wrap items-center gap-1"
          : "flex min-h-8 min-w-0 flex-wrap items-center gap-1 rounded-md border bg-muted/35 p-0.5"
      }
    >
      {layers
        .filter((layer) => !onlyAdvanced || ["L3", "L4", "L5", "L6"].includes(layer.id))
        .map((layer) => {
          const query = new URLSearchParams();
          if (room !== "local-only") {
            query.set("room", room);
            if (editor) query.set("editor", editor);
          }
          if (layer.id === "L1" || layer.id === "L2") query.set("layer", layer.id);
          const href = `${layer.path}${query.size ? `?${query}` : ""}`;
          // L5 is a desktop page: hidden on phones, its long name only on wide screens.
          const isL5 = layer.id === "L5" || layer.id === "L6";
          const style = `${isL5 ? "max-sm:hidden" : ""} flex h-7 items-center whitespace-nowrap rounded px-2 text-[11px] font-semibold ${currentLayer === layer.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`;
          // Six layers: full names only on the widest screens.
          const shortClass = "2xl:hidden";
          const longClass = "hidden 2xl:inline";
          return canEdit ? (
            <Link
              key={layer.id}
              href={href}
              aria-label={layer.aria}
              title={layer.label}
              aria-current={currentLayer === layer.id ? "page" : undefined}
              className={style}
            >
              <span className={shortClass}>{layer.id}</span>
              <span className={longClass}>{layer.label}</span>
            </Link>
          ) : (
            <span
              key={layer.id}
              aria-disabled="true"
              aria-current={currentLayer === layer.id ? "page" : undefined}
              className={`${style} opacity-60`}
            >
              <span className={shortClass}>{layer.id}</span>
              <span className={longClass}>{layer.label}</span>
            </span>
          );
        })}
    </nav>
  );
}
