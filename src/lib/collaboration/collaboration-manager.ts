"use client";

import { joinRoom } from "trystero";
import type { Room, MessageAction } from "trystero";
import { useCollaborationStore } from "./collaboration-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { SyncMessage } from "./collaboration-types";

const APP_ID = "pw-builder-collab-v1";

class CollaborationManager {
  private room: Room | null = null;
  private syncAction: MessageAction<string> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private currentRoomId: string | null = null;
  private presenceInterval: NodeJS.Timeout | null = null;

  public initRoom(roomId: string) {
    if (typeof window === "undefined") return;
    if (this.currentRoomId === roomId && this.room) return;

    this.leaveRoom();
    this.currentRoomId = roomId;
    useCollaborationStore.getState().setRoomId(roomId);

    try {
      // 1. WebRTC Peer-to-Peer Mesh (Cross-device)
      this.room = joinRoom({ appId: APP_ID }, roomId);
      this.syncAction = this.room.makeAction<string>("sync_channel");

      this.room.onPeerJoin = (peerId: string) => {
        // Send our current presence to the new peer
        const local = useCollaborationStore.getState().localUser;
        this.broadcast({
          type: "PRESENCE",
          senderId: local.peerId,
          profile: local,
        });

        // Send full state to newly joined peer so their canvas matches immediately
        const currentFile = useWorkflowStore.getState().file;
        this.broadcast({
          type: "SYNC_FULL_STATE",
          senderId: local.peerId,
          file: currentFile,
          timestamp: Date.now(),
        });
      };

      this.room.onPeerLeave = (peerId: string) => {
        useCollaborationStore.getState().removeRemotePeer(peerId);
      };

      this.syncAction.onMessage = (rawJson: string, context) => {
        try {
          const data = JSON.parse(rawJson) as SyncMessage;
          this.handleIncomingMessage(data, context.peerId);
        } catch (err) {
          console.warn("Failed to parse incoming sync message:", err);
        }
      };

      useCollaborationStore.getState().setIsConnected(true);
    } catch (e) {
      console.warn("WebRTC room initialization fallback:", e);
    }

    // 2. BroadcastChannel (Instant Cross-Tab Sync on same device)
    try {
      this.broadcastChannel = new BroadcastChannel(`workflow-collab-${roomId}`);
      this.broadcastChannel.onmessage = (event: MessageEvent<SyncMessage>) => {
        this.handleIncomingMessage(event.data);
      };
    } catch {
      // BroadcastChannel not available
    }

    // 3. Heartbeat presence broadcast
    this.presenceInterval = setInterval(() => {
      const local = useCollaborationStore.getState().localUser;
      this.broadcast({
        type: "PRESENCE",
        senderId: local.peerId,
        profile: local,
      });
    }, 4000);

    // Broadcast initial presence
    const local = useCollaborationStore.getState().localUser;
    this.broadcast({
      type: "PRESENCE",
      senderId: local.peerId,
      profile: local,
    });
  }

  public broadcast(message: SyncMessage) {
    const raw = JSON.stringify(message);

    // 1. Send to WebRTC peers
    if (this.syncAction) {
      try {
        void this.syncAction.send(raw);
      } catch (err) {
        console.warn("Failed to broadcast WebRTC delta:", err);
      }
    }

    // 2. Send to other browser tabs
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch (err) {
        console.warn("Failed to broadcast channel delta:", err);
      }
    }
  }

  private handleIncomingMessage(msg: SyncMessage, remotePeerId?: string) {
    const localUser = useCollaborationStore.getState().localUser;
    if (msg.senderId === localUser.peerId) return; // Ignore our own broadcast

    const collabStore = useCollaborationStore.getState();

    switch (msg.type) {
      case "PRESENCE": {
        collabStore.addRemotePeer({
          ...msg.profile,
          peerId: msg.senderId || remotePeerId || msg.profile.peerId,
        });
        break;
      }
      case "SYNC_FULL_STATE": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().replaceFile(msg.file);
        } finally {
          collabStore.setIsRemoteApplying(false);
        }
        break;
      }
      case "PATCH_NODE": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().updateNode(msg.nodeId, msg.patch);
        } finally {
          collabStore.setIsRemoteApplying(false);
        }
        break;
      }
      case "UPDATE_LAYOUTS": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().updateLayouts(msg.patches);
        } finally {
          collabStore.setIsRemoteApplying(false);
        }
        break;
      }
      case "ADD_EDGE": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().addEdge(msg.edge);
        } finally {
          collabStore.setIsRemoteApplying(false);
        }
        break;
      }
      case "UPDATE_EDGE": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().updateEdge(msg.edgeId, msg.patch);
        } finally {
          collabStore.setIsRemoteApplying(false);
        }
        break;
      }
      case "DELETE_NODES": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().deleteNodes(msg.nodeIds);
        } finally {
          collabStore.setIsRemoteApplying(false);
        }
        break;
      }
    }
  }

  public leaveRoom() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    if (this.room) {
      try {
        void this.room.leave();
      } catch {
        // ignore
      }
      this.room = null;
      this.syncAction = null;
    }
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {
        // ignore
      }
      this.broadcastChannel = null;
    }
    this.currentRoomId = null;
    useCollaborationStore.getState().setIsConnected(false);
  }
}

export const collaborationManager = new CollaborationManager();
