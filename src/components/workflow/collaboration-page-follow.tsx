"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { collaborativePageFromPath, COLLABORATIVE_PATHS } from "@/lib/collaboration/collaboration-route";

/** Lives in the root layout so follow mode survives switching workspaces. */
export function CollaborationPageFollow() {
  const pathname = usePathname();
  const router = useRouter();
  const canEdit = useCollaborationStore(canEditCollaborativeWorkflow);
  const editControlReady = useCollaborationStore((state) => state.editControlReady);
  const isConnected = useCollaborationStore((state) => state.isConnected);
  const roomId = useCollaborationStore((state) => state.roomId);
  const editorPeerId = useCollaborationStore((state) => state.editorPeerId);
  const editorViewState = useCollaborationStore((state) => state.editorViewState);

  useEffect(() => {
    const page = collaborativePageFromPath(pathname);
    if (!page || roomId === "local-only" || !editControlReady || !canEdit) return;
    const view = useCollaborationStore.getState().editorViewState;
    collaborationManager.broadcastViewState({ ...view, layer: view?.layer || "L1", page });
  }, [pathname, roomId, editControlReady, canEdit, isConnected]);

  useEffect(() => {
    if (roomId === "local-only" || !editControlReady || canEdit || !editorViewState || !collaborativePageFromPath(pathname)) return;
    // Missing page means the canvas for older clients. Never navigate to a
    // peer-supplied URL: only the three known workspace routes are accepted.
    const page = editorViewState.page || "workflow";
    const target = COLLABORATIVE_PATHS[page];
    if (!target || (pathname.replace(/\/$/, "") || "/") === target) return;
    const query = new URLSearchParams(window.location.search);
    query.set("room", roomId);
    if (editorPeerId) query.set("editor", editorPeerId);
    router.replace(`${target}?${query.toString()}`, { scroll: false });
  }, [pathname, router, roomId, editControlReady, canEdit, editorPeerId, editorViewState]);

  return null;
}
