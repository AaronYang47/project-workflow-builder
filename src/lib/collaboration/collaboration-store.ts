"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CollaboratorProfile } from "./collaboration-types";

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
    lastActiveAt: Date.now(),
  };
}

interface CollaborationState {
  roomId: string;
  isConnected: boolean;
  isHost: boolean;
  localUser: CollaboratorProfile;
  remotePeers: Record<string, CollaboratorProfile>;
  isRemoteApplying: boolean;
  
  setRoomId: (roomId: string) => void;
  setIsConnected: (connected: boolean) => void;
  setIsHost: (isHost: boolean) => void;
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
        roomId: "project-main",
        isConnected: false,
        isHost: false,
        localUser: {
          peerId: DEFAULT_COLLAB_PEER_ID,
          name: "Project Architect #101",
          color: "#3b82f6",
          avatar: "PA",
          lastActiveAt: 0,
        },
        remotePeers: {},
        isRemoteApplying: false,

        setRoomId: (roomId) => set({ roomId }),
        setIsConnected: (isConnected) => set({ isConnected }),
        setIsHost: (isHost) => set({ isHost }),
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
            return { remotePeers: next };
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
          peerId: state.localUser.peerId,
          name: state.localUser.name,
          color: state.localUser.color,
          avatar: state.localUser.avatar,
          lastActiveAt: state.localUser.lastActiveAt,
        },
      }),
    },
  ),
);
