"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CollaboratorProfile, CollaborativeViewState, ReleaseConditionDragPreview } from "./collaboration-types";

const COLLAB_COLORS = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#14b8a6", // Teal
];

const COLLAB_ROLES = [
  "Architect",
  "Structural Lead",
  "MEP Engineer",
  "Project Director",
  "Design Manager",
  "Modular Planner",
  "Commercial Officer",
  "Site Coordinator",
];

export const DEFAULT_COLLAB_PEER_ID = "local-user";

export function getRandomCollaborator(): Omit<CollaboratorProfile, "peerId"> {
  const role = COLLAB_ROLES[Math.floor(Math.random() * COLLAB_ROLES.length)];
  const num = Math.floor(100 + Math.random() * 900);
  const color = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
  return {
    name: `${role} #${num}`,
    color,
    avatar: role.slice(0, 2).toUpperCase(),
    joinedAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

interface CollaborationState {
  roomId: string;
  isConnected: boolean;
  isHost: boolean;
  editorPeerId: string | null;
  editControlReady: boolean;
  editorViewState: CollaborativeViewState | null;
  remoteDragPreview: { senderId: string; preview: ReleaseConditionDragPreview } | null;
  setRemoteDragPreview: (value: { senderId: string; preview: ReleaseConditionDragPreview } | null) => void;
  controlRequests: Record<string, number>;
  controlRequestStatus: "idle" | "pending" | "declined";
  localUser: CollaboratorProfile;
  remotePeers: Record<string, CollaboratorProfile>;
  isRemoteApplying: boolean;
  
  setRoomId: (roomId: string) => void;
  setIsConnected: (connected: boolean) => void;
  setIsHost: (isHost: boolean) => void;
  setEditControl: (editorPeerId: string | null, ready: boolean) => void;
  setEditorViewState: (view: CollaborativeViewState | null) => void;
  addControlRequest: (peerId: string, timestamp: number) => void;
  removeControlRequest: (peerId: string) => void;
  setControlRequestStatus: (status: "idle" | "pending" | "declined") => void;
  setLocalUser: (patch: Partial<CollaboratorProfile>) => void;
  setFocusedNodeId: (nodeId?: string) => void;
  addRemotePeer: (peer: CollaboratorProfile) => void;
  removeRemotePeer: (peerId: string) => void;
  updateRemotePeer: (peerId: string, profile: Partial<CollaboratorProfile>) => void;
  setIsRemoteApplying: (applying: boolean) => void;
}

export const useCollaborationStore = create<CollaborationState>()(
  persist(
    (set, get) => {
      return {
        roomId: "local-only",
        isConnected: false,
        isHost: false,
        editorPeerId: null,
        editControlReady: false,
        editorViewState: null,
        remoteDragPreview: null,
        setRemoteDragPreview: (remoteDragPreview) => set({ remoteDragPreview }),
        controlRequests: {},
        controlRequestStatus: "idle",
        localUser: {
          peerId: DEFAULT_COLLAB_PEER_ID,
          name: "Project Architect #101",
          color: "#3b82f6",
          avatar: "PA",
          joinedAt: 0,
          lastActiveAt: 0,
        },
        remotePeers: {},
        isRemoteApplying: false,

        setRoomId: (roomId) => set({ roomId }),
        setIsConnected: (isConnected) => set({ isConnected }),
        setIsHost: (isHost) => set({ isHost }),
        setEditControl: (editorPeerId, editControlReady) =>
          set({
            editorPeerId,
            editControlReady,
            remoteDragPreview: null,
            isHost: editorPeerId === get().localUser.peerId,
            controlRequests: {},
            controlRequestStatus: "idle",
          }),
        addControlRequest: (peerId, timestamp) => set((state) => ({
          controlRequests: { ...state.controlRequests, [peerId]: timestamp },
        })),
        removeControlRequest: (peerId) => set((state) => {
          const controlRequests = { ...state.controlRequests };
          delete controlRequests[peerId];
          return { controlRequests };
        }),
        setControlRequestStatus: (controlRequestStatus) => set({ controlRequestStatus }),
        setEditorViewState: (editorViewState) =>
          set((state) => {
            if (
              state.editorViewState?.page === editorViewState?.page &&
              state.editorViewState?.layer === editorViewState?.layer &&
              state.editorViewState?.executionNodeId === editorViewState?.executionNodeId
            ) return state;
            return { editorViewState };
          }),
        setLocalUser: (patch) =>
          set((state) => ({
            localUser: {
              ...state.localUser,
              ...patch,
              avatar: (patch.name || state.localUser.name)
                .trim()
                .slice(0, 2)
                .toUpperCase(),
            },
          })),
        setFocusedNodeId: (focusedNodeId) =>
          set((state) => ({
            localUser: {
              ...state.localUser,
              focusedNodeId,
              lastActiveAt: Date.now(),
            },
          })),
        addRemotePeer: (peer) =>
          set((state) => ({
            remotePeers: {
              ...state.remotePeers,
              [peer.peerId]: peer,
            },
          })),
        removeRemotePeer: (peerId) =>
          set((state) => {
            const next = { ...state.remotePeers };
            delete next[peerId];
            const controlRequests = { ...state.controlRequests };
            delete controlRequests[peerId];
            return { remotePeers: next, controlRequests };
          }),
        updateRemotePeer: (peerId, patch) =>
          set((state) => {
            const existing = state.remotePeers[peerId];
            if (!existing) return state;
            return {
              remotePeers: {
                ...state.remotePeers,
                [peerId]: {
                  ...existing,
                  ...patch,
                  lastActiveAt: Date.now(),
                },
              },
            };
          }),
        setIsRemoteApplying: (isRemoteApplying) => set({ isRemoteApplying }),
      };
    },
    {
      name: "workflow-collab-user",
      skipHydration: true,
      partialize: (state) => ({
        localUser: {
          name: state.localUser.name,
          color: state.localUser.color,
          avatar: state.localUser.avatar,
          userId: state.localUser.userId,
          joinedAt: state.localUser.joinedAt,
          lastActiveAt: state.localUser.lastActiveAt,
        },
      }),
    },
  ),
);

export function canEditCollaborativeWorkflow(
  state: CollaborationState = useCollaborationStore.getState(),
) {
  if (state.roomId === "local-only") return true;
  return state.editControlReady && state.editorPeerId === state.localUser.peerId;
}
