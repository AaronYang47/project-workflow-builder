"use client";

/**
 * The single workflow store. State and actions live in domain slices under
 * ./slices; this file only composes them, guards edits while another
 * collaborator holds edit control, and configures persistence.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { debouncedJSONStorage } from "@/store/workflow-persist";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { isViewOnlyFileChange } from "@/store/workflow-store-helpers";
import type { StoreSet, WorkflowState } from "@/store/workflow-store-types";
import { createSessionSlice } from "@/store/slices/session-slice";
import { createUiSlice } from "@/store/slices/ui-slice";
import { createGraphSlice } from "@/store/slices/graph-slice";
import { createReleaseConditionsSlice } from "@/store/slices/release-conditions-slice";
import { createHighLevelSlice } from "@/store/slices/high-level-slice";
import { createExecutionSlice } from "@/store/slices/execution-slice";
import { createOperationsSlice } from "@/store/slices/operations-slice";

export type { AuthUser, ConfirmClearNotice, WorkflowState } from "@/store/workflow-store-types";

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (write, get) => {
      const set = ((partial: Parameters<typeof write>[0], replace?: Parameters<typeof write>[1]) => {
        const next = typeof partial === "function" ? partial(get()) : partial;
        const collaboration = useCollaborationStore.getState();
        if (
          next &&
          typeof next === "object" &&
          "file" in next &&
          !collaboration.isRemoteApplying &&
          !canEditCollaborativeWorkflow(collaboration) &&
          !isViewOnlyFileChange(get().file, next.file)
        ) {
          return;
        }
        if (replace === true) {
          write(next as WorkflowState, true);
        } else {
          write(next as Partial<WorkflowState>);
        }
      }) as typeof write;

      return {
        ...createSessionSlice(set as StoreSet, get),
        ...createUiSlice(set as StoreSet, get),
        ...createGraphSlice(set as StoreSet, get),
        ...createReleaseConditionsSlice(set as StoreSet, get),
        ...createHighLevelSlice(set as StoreSet, get),
        ...createExecutionSlice(set as StoreSet, get),
        ...createOperationsSlice(set as StoreSet, get),
      };
    },
    {
      name: "project-workflow-builder:v43-no-default-workspace",
      storage: debouncedJSONStorage(),
      partialize: (state) => ({
        file: state.file,
        workspaceOwnerId: state.workspaceOwnerId,
        activeProjectId: state.activeProjectId,
        dirty: state.dirty,
        lastSavedAt: state.lastSavedAt,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

useWorkflowStore.subscribe((state, previousState) => {
  if (state.file === previousState.file) return;
  if (useCollaborationStore.getState().isRemoteApplying) return;
  collaborationManager.scheduleFullStateSync(state.file);
});
