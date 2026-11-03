"use client";

import { collaborativePageFromPath } from "./collaboration-route";
import { joinRoom } from "trystero";
import type { Room, MessageAction } from "trystero";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "./collaboration-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { CollaborativeViewState, ReleaseConditionDragPreview, SyncMessage } from "./collaboration-types";

const APP_ID = "pw-builder-collab-v1";
// Use a shared, explicit discovery set. Random default relays can include
// unavailable hosts or servers that require proof of work for signaling.
const COLLABORATION_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr-01.yakihonne.com",
];

class CollaborationManager {
  private room: Room | null = null;
  private controlRevision = 0;
  private syncAction: MessageAction<string> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private currentRoomId: string | null = null;
  private presenceInterval: NodeJS.Timeout | null = null;
  private editorElectionTimeout: NodeJS.Timeout | null = null;
  private remoteProfileByTransportPeer = new Map<string, string>();
  private lastCursorBroadcastAt = 0;
  private cursorBroadcastTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastDragTimestampByPeer = new Map<string, number>();
  private lastDragBroadcastAt = 0;
  private lastViewTimestampByPeer = new Map<string, number>();
  private fullStateSyncTimeout: NodeJS.Timeout | null = null;
  private pendingFullState: import("@/types/workflow").WorkflowFile | null = null;

  public initRoom(roomId: string, preferredEditorPeerId?: string) {
    if (typeof window === "undefined") return;
    if (this.currentRoomId === roomId && this.room) {
      // Remounting a page must preserve the room's negotiated ownership.
      this.broadcastPresence();
      this.broadcastCurrentState();
      return;
    }

    this.leaveRoom();
    this.currentRoomId = roomId;
    const collaboration = useCollaborationStore.getState();
    this.controlRevision = Number(sessionStorage.getItem(`workflow-control-revision:${roomId}`)) || 0;
    collaboration.setRoomId(roomId);
    collaboration.setLocalUser({ joinedAt: Date.now(), lastActiveAt: Date.now() });
    collaboration.setEditControl(preferredEditorPeerId ?? null, Boolean(preferredEditorPeerId));

    try {
      // 1. WebRTC Peer-to-Peer Mesh (Cross-device)
      this.room = joinRoom({ appId: APP_ID, relayConfig: { urls: COLLABORATION_RELAYS } }, roomId);
      this.syncAction = this.room.makeAction<string>("sync_channel");

      this.room.onPeerJoin = (peerId: string) => {
        this.broadcastPresence();
        this.broadcastCurrentState();
      };

      this.room.onPeerLeave = (peerId: string) => {
        const collaboration = useCollaborationStore.getState();
        const departedPeerId = this.remoteProfileByTransportPeer.get(peerId) ?? peerId;
        this.remoteProfileByTransportPeer.delete(peerId);
        collaboration.removeRemotePeer(departedPeerId);
        this.recoverEditorIfNeeded(departedPeerId);
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

    // Room links that carry an editor ID pin ownership to that participant.
    // Do not elect a viewer as editor when the owner is slow to reconnect; that
    // creates two editors after a mobile refresh. Only legacy links without an
    // editor hint use the join-window election.
    this.editorElectionTimeout = setTimeout(() => {
      if (preferredEditorPeerId) {
        this.broadcastPresence();
      } else {
        this.electInitialEditor();
      }
    }, preferredEditorPeerId ? 10000 : 1200);

    // 3. Heartbeat presence broadcast
    this.presenceInterval = setInterval(() => {
      this.broadcastPresence();
      const state = useCollaborationStore.getState();
      if (this.isLocalEditor() && state.editorViewState) {
        this.broadcastViewState(state.editorViewState);
      }
    }, 4000);

    // Broadcast initial presence
    this.broadcastPresence();
  }

  public isLocalEditor() {
    return canEditCollaborativeWorkflow();
  }

  public transferEditControl(targetPeerId: string) {
    const collaboration = useCollaborationStore.getState();
    if (!canEditCollaborativeWorkflow(collaboration) || !collaboration.editControlReady) return false;
    if (!collaboration.remotePeers[targetPeerId]) return false;

    const local = collaboration.localUser;
    this.controlRevision += 1;
    collaboration.setEditControl(targetPeerId, true);
    this.rememberEditor(targetPeerId);
    this.broadcast({
      type: "EDITOR_CONTROL",
      senderId: local.peerId,
      editorPeerId: targetPeerId,
      reason: "transfer",
      controlRevision: this.controlRevision,
      timestamp: Date.now(),
    });
    this.broadcastPresence();
    return true;
  }

  public requestEditControl() {
    const collaboration = useCollaborationStore.getState();
    const editorPeerId = collaboration.editorPeerId;
    const editor = editorPeerId ? collaboration.remotePeers[editorPeerId] : undefined;
    if (collaboration.editControlReady && !this.isLocalEditor() &&
      (!editor || Date.now() - editor.lastActiveAt >= 30000) &&
      Date.now() - collaboration.localUser.joinedAt >= 10000) {
      this.controlRevision += 1;
      const peerId = collaboration.localUser.peerId;
      collaboration.setEditControl(peerId, true);
      this.rememberEditor(peerId);
      this.broadcast({ type: "EDITOR_CONTROL", senderId: peerId, editorPeerId: peerId,
        reason: "recovery", controlRevision: this.controlRevision, timestamp: Date.now() });
      this.broadcastPresence();
      this.broadcastCurrentState();
      return true;
    }
    if (!collaboration.editControlReady || !editorPeerId || this.isLocalEditor() ||
      !collaboration.remotePeers[editorPeerId] || collaboration.controlRequestStatus === "pending") return false;
    collaboration.setControlRequestStatus("pending");
    this.broadcast({
      type: "REQUEST_EDITOR_CONTROL",
      senderId: collaboration.localUser.peerId,
      editorPeerId,
      timestamp: Date.now(),
    });
    return true;
  }

  public declineEditControl(targetPeerId: string) {
    const collaboration = useCollaborationStore.getState();
    if (!this.isLocalEditor() || !collaboration.controlRequests[targetPeerId]) return false;
    collaboration.removeControlRequest(targetPeerId);
    this.broadcast({
      type: "DECLINE_EDITOR_CONTROL",
      senderId: collaboration.localUser.peerId,
      targetPeerId,
      timestamp: Date.now(),
    });
    return true;
  }

  public broadcastCursor(x: number, y: number, view: CollaborativeViewState, space: "canvas" | "surface", force = false) {
    if (!this.isLocalEditor()) return;
    const page = collaborativePageFromPath(window.location.pathname) || "workflow";
    view = { ...view, page, layer: page === "conditions" ? "L3" : page === "process-overview" ? "L4" : view.layer };
    const now = Date.now();
    if (this.cursorBroadcastTimeout) clearTimeout(this.cursorBroadcastTimeout);
    this.cursorBroadcastTimeout = null;
    if (!force && now - this.lastCursorBroadcastAt < 40) {
      this.cursorBroadcastTimeout = setTimeout(() => {
        this.cursorBroadcastTimeout = null;
        this.broadcastCursor(x, y, view, space, true);
      }, 40 - (now - this.lastCursorBroadcastAt));
      return;
    }
    this.lastCursorBroadcastAt = now;
    const local = useCollaborationStore.getState().localUser;
    useCollaborationStore.getState().setEditorViewState(view);
    this.broadcast({
      type: "CURSOR",
      senderId: local.peerId,
      x,
      y,
      view,
      space,
      timestamp: now,
    });
  }

  public broadcastViewState(view: CollaborativeViewState) {
    const page = collaborativePageFromPath(window.location.pathname) || "workflow";
    view = { ...view, page, layer: page === "conditions" ? "L3" : page === "process-overview" ? "L4" : view.layer };
    const collaboration = useCollaborationStore.getState();
    if (!this.isLocalEditor() || !collaboration.editControlReady) return;
    collaboration.setEditorViewState(view);
    this.broadcast({
      type: "VIEW_STATE",
      senderId: collaboration.localUser.peerId,
      view,
      timestamp: Date.now(),
    });
  }

  public broadcastDragPreview(preview: ReleaseConditionDragPreview | null) {
    if (!this.isLocalEditor()) return;
    const now = Date.now();
    if (preview && now - this.lastDragBroadcastAt < 40) return;
    this.lastDragBroadcastAt = Math.max(now, this.lastDragBroadcastAt + 1);
    this.broadcast({ type: "RC_DRAG_PREVIEW", senderId: useCollaborationStore.getState().localUser.peerId, preview, timestamp: this.lastDragBroadcastAt });
  }

  public scheduleFullStateSync(file: import("@/types/workflow").WorkflowFile) {
    if (!this.currentRoomId || !this.isLocalEditor()) return;
    this.pendingFullState = file;
    if (this.fullStateSyncTimeout) clearTimeout(this.fullStateSyncTimeout);
    this.fullStateSyncTimeout = setTimeout(() => {
      this.fullStateSyncTimeout = null;
      const pending = this.pendingFullState;
      this.pendingFullState = null;
      if (!pending || !this.isLocalEditor()) return;
      const local = useCollaborationStore.getState().localUser;
      this.broadcast({ type: "SYNC_FULL_STATE", senderId: local.peerId, file: pending, timestamp: Date.now() });
    }, 180);
  }

  private broadcastPresence() {
    const collaboration = useCollaborationStore.getState();
    const local = collaboration.localUser;
    this.broadcast({
      type: "PRESENCE",
      senderId: local.peerId,
      profile: { ...local, lastActiveAt: Date.now() },
      editorPeerId: collaboration.editorPeerId,
      controlRevision: this.controlRevision,
      ...(this.isLocalEditor() && collaboration.editorViewState ? { view: collaboration.editorViewState } : {}),
    });
  }

  private broadcastCurrentState() {
    const collaboration = useCollaborationStore.getState();
    if (!collaboration.editControlReady || !canEditCollaborativeWorkflow(collaboration)) return;
    const local = collaboration.localUser;
    this.broadcast({
      type: "SYNC_FULL_STATE",
      senderId: local.peerId,
      file: useWorkflowStore.getState().file,
      ...(collaboration.editorViewState ? { view: collaboration.editorViewState } : {}),
      timestamp: Date.now(),
    });
    const view = collaboration.editorViewState;
    if (view) {
      this.broadcast({
        type: "VIEW_STATE",
        senderId: local.peerId,
        view,
        timestamp: Date.now(),
      });
    }
  }

  private electInitialEditor() {
    const collaboration = useCollaborationStore.getState();
    if (collaboration.editControlReady) return;
    const peers = Object.values(collaboration.remotePeers).filter(
      (peer) => Date.now() - peer.lastActiveAt < 30000,
    );
    const candidates = [collaboration.localUser, ...peers].sort(
      (left, right) => left.joinedAt - right.joinedAt || left.peerId.localeCompare(right.peerId),
    );
    const electedPeerId = candidates[0]?.peerId ?? collaboration.localUser.peerId;
    collaboration.setEditControl(electedPeerId, true);
    if (electedPeerId === collaboration.localUser.peerId) {
      this.broadcast({
        type: "EDITOR_CONTROL",
        senderId: collaboration.localUser.peerId,
        editorPeerId: electedPeerId,
        reason: "initial",
        timestamp: Date.now(),
      });
      this.broadcastCurrentState();
    }
    this.broadcastPresence();
  }

  private recoverEditorIfNeeded(departedPeerId: string) {
    const collaboration = useCollaborationStore.getState();
    if (!collaboration.editControlReady || collaboration.editorPeerId !== departedPeerId) return;
    // Transport loss does not transfer ownership. Mobile radios, background
    // tabs and page refreshes can all temporarily disconnect a live editor.
    // Keep viewers locked until the current editor explicitly grants control.
    this.broadcastPresence();
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
    // Receiving a peer message is stronger evidence than initialization flags.
    if (!collabStore.isConnected) collabStore.setIsConnected(true);

    const mutatesWorkflow = ["PATCH_NODE", "PATCH_RELEASE_CONDITION_INBOX", "UPDATE_LAYOUTS", "ADD_NODE", "DELETE_NODES", "ADD_EDGE", "UPDATE_EDGE"].includes(msg.type);
    if (mutatesWorkflow && (!collabStore.editControlReady || msg.senderId !== collabStore.editorPeerId)) return;

    switch (msg.type) {
      case "RC_DRAG_PREVIEW": {
        if (!collabStore.editControlReady || msg.senderId !== collabStore.editorPeerId ||
          msg.timestamp <= (this.lastDragTimestampByPeer.get(msg.senderId) ?? 0)) break;
        this.lastDragTimestampByPeer.set(msg.senderId, msg.timestamp);
        collabStore.setRemoteDragPreview(msg.preview ? { senderId: msg.senderId, preview: msg.preview } : null);
        break;
      }
      case "REQUEST_FULL_STATE": {
        this.broadcastCurrentState();
        break;
      }
      case "PRESENCE": {
        if (remotePeerId && msg.senderId) this.remoteProfileByTransportPeer.set(remotePeerId, msg.senderId);
        const isNewPeer = !collabStore.remotePeers[msg.senderId];
        collabStore.addRemotePeer({
          ...msg.profile,
          peerId: msg.senderId || remotePeerId || msg.profile.peerId,
        });
        if (msg.editorPeerId && (msg.senderId === msg.editorPeerId || (msg.controlRevision ?? 0) > 0)) {
          this.reconcileEditor(msg.editorPeerId, msg.controlRevision ?? 0);
        }
        if (isNewPeer && this.isLocalEditor()) this.broadcastCurrentState();
        if (msg.view) this.applyRemoteView(msg.senderId, msg.view, msg.profile.lastActiveAt);
        break;
      }
      case "EDITOR_CONTROL": {
        if (msg.reason === "recovery") {
          const owner = collabStore.remotePeers[collabStore.editorPeerId || ""];
          if (msg.senderId === msg.editorPeerId && (!owner || Date.now() - owner.lastActiveAt >= 30000)) {
            this.reconcileEditor(msg.editorPeerId, msg.controlRevision ?? 0);
          }
          break;
        }
        const currentOwnerSentTransfer = msg.reason === "transfer" && msg.senderId === collabStore.editorPeerId;
        if (currentOwnerSentTransfer) {
          this.reconcileEditor(msg.editorPeerId, msg.controlRevision ?? this.controlRevision + 1);
        } else if (msg.reason === "initial" && msg.senderId === msg.editorPeerId) {
          this.reconcileEditor(msg.editorPeerId, msg.controlRevision ?? 0);
        }
        break;
      }
      case "REQUEST_EDITOR_CONTROL": {
        if (this.isLocalEditor() && msg.editorPeerId === collabStore.localUser.peerId &&
          collabStore.remotePeers[msg.senderId]) {
          collabStore.addControlRequest(msg.senderId, msg.timestamp);
        }
        break;
      }
      case "DECLINE_EDITOR_CONTROL": {
        if (msg.targetPeerId === collabStore.localUser.peerId && msg.senderId === collabStore.editorPeerId) {
          collabStore.setControlRequestStatus("declined");
        }
        break;
      }
      case "CURSOR": {
        if (!collabStore.editControlReady || msg.senderId !== collabStore.editorPeerId) break;
        if (msg.view) this.applyRemoteView(msg.senderId, msg.view, msg.timestamp);
        collabStore.updateRemotePeer(msg.senderId, {
          cursor: { x: msg.x, y: msg.y, view: msg.view, space: msg.space },
          cursorAt: msg.timestamp,
        });
        break;
      }
      case "VIEW_STATE": {
        this.applyRemoteView(msg.senderId, msg.view, msg.timestamp);
        break;
      }
      case "SYNC_FULL_STATE": {
        if (!collabStore.editControlReady || msg.senderId !== collabStore.editorPeerId) break;
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().applyCollaborativeFile(msg.file);
          if (msg.view) this.applyRemoteView(msg.senderId, msg.view, msg.timestamp);
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
      case "PATCH_RELEASE_CONDITION_INBOX": {
        collabStore.setIsRemoteApplying(true);
        try {
          useWorkflowStore.getState().setReleaseConditionInbox(msg.conditions);
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

  private reconcileEditor(editorPeerId: string, revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    const state = useCollaborationStore.getState();
    // Transfers supersede initial claims; concurrent equal-generation claims
    // use the same deterministic ordering on every participant.
    const wins = !state.editControlReady || revision > this.controlRevision ||
      (revision === this.controlRevision && editorPeerId < (state.editorPeerId || "~"));
    if (!wins) return;
    this.controlRevision = revision;
    state.setEditControl(editorPeerId, true);
    if (state.editorPeerId !== editorPeerId) state.setEditorViewState(null);
    this.rememberEditor(editorPeerId);
    this.broadcastPresence();
    this.broadcast({ type: "REQUEST_FULL_STATE", senderId: state.localUser.peerId });
  }

  private rememberEditor(editorPeerId: string) {
    sessionStorage.setItem(`workflow-control-revision:${this.currentRoomId}`, String(this.controlRevision));
    const url = new URL(window.location.href);
    url.searchParams.set("room", this.currentRoomId!);
    url.searchParams.set("editor", editorPeerId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  private applyRemoteView(senderId: string, view: CollaborativeViewState, timestamp: number) {
    const state = useCollaborationStore.getState();
    if (!state.editControlReady || senderId !== state.editorPeerId ||
      timestamp < (this.lastViewTimestampByPeer.get(senderId) ?? 0)) return;
    this.lastViewTimestampByPeer.set(senderId, timestamp);
    state.setEditorViewState(view);
  }

  public leaveRoom() {
    if (this.cursorBroadcastTimeout) clearTimeout(this.cursorBroadcastTimeout);
    this.cursorBroadcastTimeout = null;
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    if (this.editorElectionTimeout) {
      clearTimeout(this.editorElectionTimeout);
      this.editorElectionTimeout = null;
    }
    if (this.fullStateSyncTimeout) {
      clearTimeout(this.fullStateSyncTimeout);
      this.fullStateSyncTimeout = null;
    }
    this.pendingFullState = null;
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
    this.controlRevision = 0;
    this.remoteProfileByTransportPeer.clear();
    this.lastViewTimestampByPeer.clear();
    this.lastDragTimestampByPeer.clear();
    const collaboration = useCollaborationStore.getState();
    collaboration.setIsConnected(false);
    collaboration.setRoomId("local-only");
    collaboration.setEditControl(null, false);
    collaboration.setEditorViewState(null);
    collaboration.setRemoteDragPreview(null);
    collaboration.setControlRequestStatus("idle");
    for (const peerId of Object.keys(collaboration.remotePeers)) collaboration.removeRemotePeer(peerId);
  }
}

export const collaborationManager = new CollaborationManager();
