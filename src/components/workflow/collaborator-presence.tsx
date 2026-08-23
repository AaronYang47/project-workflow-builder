"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Copy, Link2, Sparkles, Users, User } from "lucide-react";
import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { Button } from "@/components/ui/button";

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
  const { roomId, isConnected, localUser, remotePeers, setLocalUser, setRoomId } =
    useCollaborationStore();
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(localUser.name);

  // Initialize room from URL query on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get("room") || "project-main";
    setRoomId(roomParam);
    collaborationManager.initRoom(roomParam);
  }, [setRoomId]);

  const peersList = Object.values(remotePeers).filter(
    (p) => Date.now() - p.lastActiveAt < 30000,
  );
  const totalUsers = 1 + peersList.length;

  const copyShareLink = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomId);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          title={`Real-Time Multiplayer: ${totalUsers} online in room "${roomId}"`}
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
            {totalUsers > 1 ? `${totalUsers} Live` : "Live Collab"}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none animate-in fade-in-0 zoom-in-95"
        >
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold leading-none">Multiplayer Collaboration</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Room: <span className="font-mono font-bold text-foreground">{roomId}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-Time
              </div>
            </div>

            {/* Share Room Link Card */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <Link2 className="size-3.5 text-primary" />
                  Invite Collaborators
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Anyone with this room link can join this project and edit simultaneously in real time.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={copyShareLink}
                className="w-full justify-center gap-1.5 h-7 text-xs font-semibold bg-background hover:bg-muted"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" />
                    <span>Copied Link!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>Copy Shareable Room Link</span>
                  </>
                )}
              </Button>
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
                      {localUser.name} <span className="text-[10px] text-muted-foreground font-normal">(You)</span>
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
                      {peer.focusedNodeId ? "Editing" : "Viewing"}
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
