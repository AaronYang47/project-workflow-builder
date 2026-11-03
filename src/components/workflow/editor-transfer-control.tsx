"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ArrowLeftRight, Check, Eye, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canEditCollaborativeWorkflow,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";

export function EditorTransferControl() {
  const collaboration = useCollaborationStore();
  const [open, setOpen] = useState(false);
  const canEdit = canEditCollaborativeWorkflow(collaboration);
  const peers = Object.values(collaboration.remotePeers).filter(
    (peer) => Date.now() - peer.lastActiveAt < 30000,
  );
  const currentEditor = collaboration.editorPeerId === collaboration.localUser.peerId
    ? "You"
    : peers.find((peer) => peer.peerId === collaboration.editorPeerId)?.name || "Waiting for editor";
  const buttonDisabled = collaboration.roomId === "local-only" ||
    !collaboration.editControlReady || !canEdit || !peers.length;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={buttonDisabled}
          aria-label="Transfer editing control"
          title={buttonDisabled
            ? canEdit
              ? collaboration.roomId === "local-only" ? "Share a room link before transferring editing control" : "No other collaborators are online"
              : `Editing is currently held by ${currentEditor}`
            : "Transfer editing control to an online collaborator"}
          className="h-8 shrink-0 gap-1.5 px-2 text-xs font-semibold"
        >
          {canEdit ? <ArrowLeftRight className="size-3.5" /> : <Eye className="size-3.5" />}
          <span>{canEdit ? "Transfer" : "View only"}</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="liquid-glass-panel z-[80] w-64 rounded-xl border p-3 text-popover-foreground shadow-xl outline-none"
        >
          <div className="mb-2 flex items-center gap-2 border-b pb-2">
            <LockKeyhole className="size-4 text-primary" />
            <div>
              <div className="text-xs font-bold">Transfer editing control</div>
              <div className="text-[10px] text-muted-foreground">Current editor: {currentEditor}</div>
            </div>
          </div>
          {canEdit ? (
            peers.length ? (
              <div className="space-y-1">
                {peers.map((peer) => (
                  <button
                    key={peer.peerId}
                    type="button"
                    onClick={() => {
                      if (collaborationManager.transferEditControl(peer.peerId)) setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-primary/10"
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: peer.color }} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{peer.name}</span>
                    <span className="text-[10px] text-muted-foreground">Transfer</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-1 py-2 text-xs text-muted-foreground">No other collaborators are online.</p>
            )
          ) : (
            <p className="flex items-start gap-2 px-1 py-2 text-xs text-muted-foreground">
              <Eye className="mt-0.5 size-3.5 shrink-0" />
              You can follow the workflow while {currentEditor} has editing control.
            </p>
          )}
          {canEdit && peers.length ? <div className="mt-2 flex items-center gap-1 border-t pt-2 text-[10px] text-muted-foreground"><Check className="size-3 text-emerald-600" />Only one person can edit at a time.</div> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
