"use client";

import { clone } from "@/lib/clone";
import { createEmptyWorkspace } from "@/lib/project-template";
import { appendHistory } from "@/store/workflow-persist";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { normalizeLoadedWorkflow } from "@/store/workflow-store-helpers";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

export type SessionSlice = Pick<
  WorkflowState,
  | "file"
  | "workspaceOwnerId"
  | "authUser"
  | "setAuthUser"
  | "activeProjectId"
  | "cloudUpdatedAt"
  | "setCloudUpdatedAt"
  | "past"
  | "future"
  | "dirty"
  | "hydrated"
  | "setHydrated"
  | "commit"
  | "commitTransient"
  | "recordSnapshot"
  | "replaceFile"
  | "applyCollaborativeFile"
  | "loadProject"
  | "resetWorkspace"
  | "undo"
  | "redo"
  | "markSaved"
>;

/** Workspace document, account, persistence and undo/redo history. */
export function createSessionSlice(set: StoreSet, get: StoreGet): SessionSlice {
  return {
    file: createEmptyWorkspace(),
    workspaceOwnerId: "dev-bypass",
    authUser: null,
    setAuthUser: (authUser) => {
      const previous = get().authUser;
      const accountChanged = previous?.id !== authUser?.id;
      if ((accountChanged && previous) || (authUser && get().workspaceOwnerId !== authUser.id)) {
        collaborationManager.leaveRoom();
        if (typeof window !== "undefined") {
          try {
            const previousOwner = previous?.id ?? get().workspaceOwnerId;
            if (previousOwner) localStorage.removeItem(`falcon_uploaded_files_${previousOwner}`);
            localStorage.removeItem("falcon_uploaded_files");
          } catch {
            // API authorization remains mandatory even without local storage.
          }
        }
        if (previous && typeof window !== "undefined" && window.location && window.history) {
          const url = new URL(window.location.href);
          for (const key of ["room", "editor", "executionNode", "condition"])
            url.searchParams.delete(key);
          window.history.replaceState(null, "", url);
        }
        get().resetWorkspace(authUser?.id);
      }
      // Retain the same object for an unchanged session so in-flight file
      // requests can distinguish a real logout/account switch from a refresh.
      set({
        authUser:
          previous &&
          authUser &&
          previous.id === authUser.id &&
          previous.email === authUser.email &&
          previous.name === authUser.name
            ? previous
            : authUser,
      });
      if (accountChanged && typeof window !== "undefined") {
        try {
          localStorage.setItem("workflow:account-changed", crypto.randomUUID());
        } catch {
          // Focus revalidation still handles disabled/full browser storage.
        }
      }
    },
    activeProjectId: undefined,
    cloudUpdatedAt: undefined,
    past: [],
    future: [],
    dirty: false,
    hydrated: false,
    setHydrated: () =>
      set((state) => {
        try {
          const normalized = normalizeLoadedWorkflow(state.file);
          return {
            hydrated: true,
            // Keep a new/cleared workspace genuinely empty. The migration
            // fallback adds Project Start for older workflow files, but it
            // must not recreate content in the blank starting state.
            file: normalized.file,
            // Hydration migrations are not new user edits. A clean local
            // cache must still yield to the saved cloud project on startup.
            dirty: state.dirty,
          };
        } catch {
          // A malformed legacy field must never discard the user's entire
          // workflow. Keep the persisted document available for editing;
          // the migration can be retried after the next safe mutation.
          return {
            hydrated: true,
            file: state.file,
          };
        }
      }),
    commit: (updater) =>
      set((state) => ({
        past: appendHistory(state.past, state.file),
        file: updater(clone(state.file)),
        future: [],
        dirty: true,
      })),
    commitTransient: (updater) =>
      set((state) => ({
        file: updater(clone(state.file)),
        dirty: true,
      })),
    recordSnapshot: (snapshot) =>
      set((state) => ({
        past: appendHistory(state.past, snapshot),
        future: [],
        dirty: true,
      })),
    replaceFile: (file) =>
      set(() => {
        const normalized = normalizeLoadedWorkflow(file);
        return {
          file: normalized.file,
          activeProjectId: undefined,
          cloudUpdatedAt: undefined,
          past: [],
          future: [],
          dirty: true,
          selection: { nodeIds: [] },
        };
      }),
    applyCollaborativeFile: (file) =>
      set(() => {
        const normalized = normalizeLoadedWorkflow(file);
        return {
          file: normalized.file,
          past: [],
          future: [],
          dirty: true,
          selection: { nodeIds: [] },
          highLevelSelection: { nodeIds: [] },
        };
      }),
    setCloudUpdatedAt: (cloudUpdatedAt) => set({ cloudUpdatedAt }),
    loadProject: (file, activeProjectId, workspaceOwnerId, cloudUpdatedAt) =>
      set(() => {
        const normalized = normalizeLoadedWorkflow(file);
        return {
          file: normalized.file,
          workspaceOwnerId,
          activeProjectId,
          cloudUpdatedAt,
          past: [],
          future: [],
          dirty: normalized.clearedDefault,
          selection: { nodeIds: [] },
        };
      }),
    resetWorkspace: (workspaceOwnerId) =>
      set({
        file: createEmptyWorkspace(),
        workspaceOwnerId: workspaceOwnerId ?? "dev-bypass",
        activeProjectId: undefined,
        cloudUpdatedAt: undefined,
        past: [],
        future: [],
        dirty: false,
        lastSavedAt: undefined,
        selection: { nodeIds: [] },
        highLevelSelection: { nodeIds: [] },
        focusedInspectorField: undefined,
        search: "",
        issues: [],
        validationOpen: false,
        deleteBlocked: undefined,
      }),
    undo: () =>
      set((state) =>
        state.past.length
          ? {
              file: state.past.at(-1)!,
              past: state.past.slice(0, -1),
              future: [state.file, ...state.future],
              dirty: true,
            }
          : state,
      ),
    redo: () =>
      set((state) =>
        state.future.length
          ? {
              file: state.future[0],
              past: appendHistory(state.past, state.file),
              future: state.future.slice(1),
              dirty: true,
            }
          : state,
      ),
    markSaved: () => {
      const lastSavedAt = new Date().toISOString();
      set({ dirty: false, lastSavedAt });
    },
  };
}
