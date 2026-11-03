"use client";

import { useEffect, useRef } from "react";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborativePageFromPath } from "@/lib/collaboration/collaboration-route";

/** A transient visual preview; the shared workflow changes only on drop. */
export function RemoteReleaseConditionDrag() {
  const remote = useCollaborationStore((state) => state.remoteDragPreview);
  const editor = useCollaborationStore((state) => state.editorPeerId);
  const canEdit = useCollaborationStore(canEditCollaborativeWorkflow);
  const ghost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ghost.current;
    if (!element || !remote || canEdit || remote.senderId !== editor ||
      (remote.preview.view.page || "workflow") !== collaborativePageFromPath(window.location.pathname)) return;
    const { preview } = remote;
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-release-condition-index]"));
    const source = rows.find((row) => row.dataset.releaseConditionNodeId === preview.source.nodeId && Number(row.dataset.releaseConditionIndex) === preview.source.index);
    const card = Array.from(document.querySelectorAll<HTMLElement>("[data-release-condition-drop-node-id]"))
      .find((item) => item.dataset.releaseConditionDropNodeId === preview.target?.nodeId);
    const targetRows = card ? Array.from(card.querySelectorAll<HTMLElement>("[data-release-condition-index]")) : [];
    const indicator = targetRows.find((row) => Number(row.dataset.releaseConditionIndex) >= (preview.target?.index ?? 0)) || targetRows.at(-1) || card;
    const previousOpacity = source?.style.opacity;
    const previousOutline = indicator?.style.outline;
    const previousOffset = indicator?.style.outlineOffset;
    if (source) source.style.opacity = "0.35";
    if (indicator) { indicator.style.outline = "2px solid #38bdf8"; indicator.style.outlineOffset = "2px"; indicator.dataset.remoteDropTarget = "true"; }
    const rect = card?.getBoundingClientRect();
    const x = rect && preview.target ? rect.left + preview.target.x * rect.width : preview.x * window.innerWidth;
    const y = rect && preview.target ? rect.top + preview.target.y * rect.height : preview.y * window.innerHeight;
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - 248, x + 12))}px`;
    element.style.top = `${Math.max(8, Math.min(window.innerHeight - 60, y + 12))}px`;
    element.style.display = "block";
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      element.style.display = "none";
      if (source) source.style.opacity = previousOpacity || "";
      if (indicator) { indicator.style.outline = previousOutline || ""; indicator.style.outlineOffset = previousOffset || ""; delete indicator.dataset.remoteDropTarget; }
    };
    // Also clear if the sender disconnects or the final cancel packet is lost.
    const timer = window.setTimeout(restore, 1500);
    return () => { clearTimeout(timer); restore(); };
  }, [remote, editor, canEdit]);

  if (!remote || canEdit || remote.senderId !== editor) return null;
  return <div ref={ghost} data-remote-drag-preview aria-hidden="true" className="pointer-events-none fixed z-[99999] hidden w-60 rounded-lg border-2 border-sky-400 bg-panel p-3 text-xs font-semibold text-foreground shadow-xl"><span className="mr-2 text-sky-500">⠿</span>{remote.preview.source.label}</div>;
}
