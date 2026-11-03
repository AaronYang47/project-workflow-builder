"use client";

import { Hand, X } from "lucide-react";
import { useCollaborationStore, canEditCollaborativeWorkflow } from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { Button } from "@/components/ui/button";
import { useCurrentTime } from "@/lib/use-current-time";

export function CollaborationControlOverlay() {
  const collaboration = useCollaborationStore();
  const now = useCurrentTime(1000);
  if (!collaboration.isConnected || collaboration.roomId === "local-only" || !collaboration.editControlReady) return null;

  const canEdit = canEditCollaborativeWorkflow(collaboration);
  const editor = collaboration.remotePeers[collaboration.editorPeerId || ""];
  const editorOnline = editor && now - editor.lastActiveAt < 30000;
  const canRecover = !editorOnline && now - collaboration.localUser.joinedAt >= 10000;
  const requests = Object.keys(collaboration.controlRequests)
    .filter((peerId) => collaboration.remotePeers[peerId]);

  return (
    <>
      {!canEdit ? (
        <>
          <div className="collaboration-viewer-frame pointer-events-none absolute inset-1 z-[60] rounded-xl" aria-hidden="true" />
          <div className="pointer-events-none absolute bottom-4 left-4 z-[75]">
            <span className="sr-only">Read only</span>
            <Button
              type="button"
              variant="outline"
              title={editorOnline ? `Read only · ${editor.name} is editing. Request editing control.` : canRecover ? "The editor is offline. Take editing control on this device." : "Read only · Waiting for the editor to reconnect."}
              className="pointer-events-auto h-9 gap-2 rounded-full border-cyan-400/40 bg-background/30 px-3 text-xs text-cyan-700 opacity-50 shadow-sm backdrop-blur-sm transition-[opacity,background-color] duration-200 hover:bg-background hover:opacity-100 focus-visible:bg-background focus-visible:opacity-100 active:bg-background active:opacity-100 dark:text-cyan-200"
              disabled={(!editorOnline && !canRecover) || (Boolean(editorOnline) && collaboration.controlRequestStatus === "pending")}
              onClick={() => collaborationManager.requestEditControl()}
            >
              <Hand className="size-3.5" />
              {collaboration.controlRequestStatus === "pending" ? "Request sent…" : "Take Control"}
            </Button>
            {collaboration.controlRequestStatus === "declined" ? (
              <p role="status" className="mt-1 max-w-56 rounded bg-background/90 px-2 py-1 text-xs text-amber-600 dark:text-amber-300">The editor declined. You can request again.</p>
            ) : null}
          </div>
        </>
      ) : requests.length ? (
        <div className="absolute left-1/2 top-4 z-[75] w-[min(360px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-primary/50 bg-background/95 p-3 shadow-xl backdrop-blur-xl" role="alert">
          <p className="mb-2 text-sm font-semibold">Editing control requested</p>
          {requests.map((peerId) => (
            <div key={peerId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs">{collaboration.remotePeers[peerId].name} wants to take control.</span>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => collaborationManager.transferEditControl(peerId)}>Allow</Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label={`Decline ${collaboration.remotePeers[peerId].name}`} onClick={() => collaborationManager.declineEditControl(peerId)}><X className="size-4" /></Button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
