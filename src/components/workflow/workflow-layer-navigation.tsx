"use client";

import Link from "next/link";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";

const layers = [
  { id: "L1", label: "L1 · Process", path: "/", aria: "L1 · Process" },
  { id: "L2", label: "L2 · Department Workflow", path: "/", aria: "L2 · Department Workflow" },
  { id: "L3", label: "L3 · Conditions", path: "/release-conditions", aria: "Open Release Conditions Workspace" },
  { id: "L4", label: "L4 · Process & Gantt", path: "/process-overview", aria: "Open Process Overview" },
] as const;

export function WorkflowLayerNavigation({ currentLayer, onlyAdvanced = false }: { currentLayer: "L1" | "L2" | "L3" | "L4"; onlyAdvanced?: boolean }) {
  const room = useCollaborationStore((state) => state.roomId);
  const editor = useCollaborationStore((state) => state.editorPeerId);
  const canEdit = useCollaborationStore(canEditCollaborativeWorkflow);
  return <nav aria-label="Workflow layers" className="flex min-w-0 flex-wrap items-center gap-1">
    {layers.filter((layer) => !onlyAdvanced || layer.id === "L3" || layer.id === "L4").map((layer) => {
      const query = new URLSearchParams();
      if (room !== "local-only") { query.set("room", room); if (editor) query.set("editor", editor); }
      if (layer.id === "L1" || layer.id === "L2") query.set("layer", layer.id);
      const href = `${layer.path}${query.size ? `?${query}` : ""}`;
      const style = `flex h-7 items-center whitespace-nowrap rounded px-2 text-[11px] font-semibold ${currentLayer === layer.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`;
      return canEdit ? <Link key={layer.id} href={href} aria-label={layer.aria} aria-current={currentLayer === layer.id ? "page" : undefined} className={style}>{layer.label}</Link>
        : <span key={layer.id} aria-disabled="true" aria-current={currentLayer === layer.id ? "page" : undefined} className={`${style} opacity-60`}>{layer.label}</span>;
    })}
  </nav>;
}
