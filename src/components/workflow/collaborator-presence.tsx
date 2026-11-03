"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Users, User } from "lucide-react";
import {
  DEFAULT_COLLAB_PEER_ID,
  canEditCollaborativeWorkflow,
  getRandomCollaborator,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { useWorkflowStore } from "@/store/workflow-store";
import { useCurrentTime } from "@/lib/use-current-time";

const PRESET_COLORS = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#64748b", // Slate
];

export function CollaboratorPresence() {
  const { roomId, isConnected, editorPeerId, localUser, remotePeers, setLocalUser, setRoomId, setEditControl } =
    useCollaborationStore();
  const authUser = useWorkflowStore((state) => state.authUser);
  const projectName = useWorkflowStore((state) => state.file.graph.metadata.name);
  const activeProjectId = useWorkflowStore((state) => state.activeProjectId);
  const [editingName, setEditingName] = useState(localUser.name);
  const now = useCurrentTime();

  // Initialize room from URL query on mount
  useEffect(() => {
    let cancelled = false;

    const initializeCollaboration = async () => {
      await useCollaborationStore.persist.rehydrate();
      if (cancelled) return;

      const state = useCollaborationStore.getState();
      // A browser profile can open multiple tabs. Keep one transport identity
      // per tab across route changes, rather than sharing the persisted ID.
      const peerId = sessionStorage.getItem("workflow-collab-peer-id") ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`);
      sessionStorage.setItem("workflow-collab-peer-id", peerId);
      if (state.localUser.peerId === DEFAULT_COLLAB_PEER_ID) {
        state.setLocalUser({ peerId, ...getRandomCollaborator() });
      } else if (state.localUser.peerId !== peerId) {
        state.setLocalUser({ peerId });
      }
      if (!state.localUser.joinedAt) state.setLocalUser({ joinedAt: Date.now() });

      const roomParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("room")
          : null;
      const editorParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("editor")
          : null;
      const projectRoomId = activeProjectId ? `project-${activeProjectId}` : null;
      const roomToJoin = roomParam || projectRoomId;
      if (!roomToJoin) {
        collaborationManager.leaveRoom();
        setRoomId("local-only");
        setEditControl(useCollaborationStore.getState().localUser.peerId, true);
        state.setIsConnected(false);
        return;
      }
      setRoomId(roomToJoin);
      collaborationManager.initRoom(roomToJoin, editorParam ?? undefined);
    };

    void initializeCollaboration();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, setEditControl, setRoomId]);

  useEffect(() => {
    if (!authUser) return;
    const preferredName = localUser.name.includes(" #") ? authUser.name : localUser.name;
    if (localUser.userId !== authUser.id || localUser.name !== preferredName) {
      setLocalUser({ userId: authUser.id, name: preferredName });
    }
  }, [authUser, localUser.name, localUser.userId, setLocalUser]);

  const peersList = Object.values(remotePeers).filter(
    (p) => now - p.lastActiveAt < 30000,
  );
  const totalUsers = 1 + peersList.length;

  const handleNameBlur = () => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== localUser.name) {
      setLocalUser({ name: trimmed });
    } else {
      setEditingName(localUser.name);
    }
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={isConnected ? `Real-Time Multiplayer: ${totalUsers} online · ${projectName || "Shared workflow"}` : "Collaboration is off until a share link is created or opened"}
          className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs transition hover:bg-muted/80 hover:border-primary/40 cursor-pointer"
        >
          <div className="relative flex items-center">
            <span
              className={`size-2 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
          </div>

          <div className="flex items-center -space-x-1.5 overflow-hidden">
            {/* Local user avatar */}
            <div
              className="relative flex size-5.5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs ring-1 ring-background"
              style={{ backgroundColor: localUser.color }}
              title={`You: ${localUser.name}`}
            >
              {localUser.avatar || "ME"}
            </div>

            {/* Remote peer avatars */}
            {peersList.slice(0, 3).map((peer) => (
              <div
                key={peer.peerId}
                className="relative flex size-5.5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs ring-1 ring-background"
                style={{ backgroundColor: peer.color }}
                title={peer.name}
              >
                {peer.avatar || peer.name.slice(0, 2).toUpperCase()}
              </div>
            ))}

            {peersList.length > 3 && (
              <div className="flex size-5.5 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-1 ring-background">
                +{peersList.length - 3}
              </div>
            )}
          </div>

          <span className="text-[11px] font-medium text-muted-foreground ml-0.5">
            {isConnected ? (totalUsers > 1 ? `${totalUsers} Live` : "Live Collab") : "Collab Off"}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="liquid-glass-panel z-50 w-80 rounded-xl border p-4 text-popover-foreground shadow-xl outline-none animate-in fade-in-0 zoom-in-95"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold leading-none">Multiplayer Collaboration</h4>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground" title={projectName || "Shared workflow"}>
                    Room: <span className="font-semibold text-foreground">{projectName || "Shared workflow"}</span>
                  </p>
                </div>
              </div>
              <div className={isConnected ? "flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full" : "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"}>
                <span className={isConnected ? "size-1.5 animate-pulse rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-amber-500"} />
                {isConnected ? "Real-Time" : "Local only"}
              </div>
            </div>

            {/* Your Profile Settings */}
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <User className="size-3.5 text-muted-foreground" />
                  Your Display Identity
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
                  placeholder="Your Name / Role"
                  className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Color Picker */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-muted-foreground mr-1">Color:</span>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLocalUser({ color: c })}
                    style={{ backgroundColor: c }}
                    className={`size-4.5 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                      localUser.color === c ? "ring-2 ring-foreground scale-110" : ""
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Active Members List */}
            <div className="space-y-2 pt-1 border-t border-border">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Active in this Room ({totalUsers})
              </span>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {/* Local user entry */}
                <div className="flex items-center justify-between text-xs py-1 px-1.5 rounded-md bg-muted/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: localUser.color }}
                    />
                    <span className="font-semibold text-foreground truncate">
                      {localUser.name} <span className="text-[10px] text-muted-foreground font-normal">(You · {canEditCollaborativeWorkflow(useCollaborationStore.getState()) ? "Editor" : "Viewer"})</span>
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold">Online</span>
                </div>

                {/* Remote peers */}
                {peersList.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="flex items-center justify-between text-xs py-1 px-1.5 rounded-md hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: peer.color }}
                      />
                      <span className="font-semibold text-foreground truncate">
                        {peer.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {editorPeerId === peer.peerId ? "Editor" : peer.focusedNodeId ? "Viewing · Active" : "Viewer"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
