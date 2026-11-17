"use client";

import { validateWorkflow } from "@/lib/validation";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

export type UiSlice = Pick<
  WorkflowState,
  | "selection"
  | "leftOpen"
  | "rightOpen"
  | "focusedInspectorField"
  | "validationOpen"
  | "issues"
  | "search"
  | "deleteBlocked"
  | "selectNodes"
  | "selectEdge"
  | "setFocusedInspectorField"
  | "showActionBlocked"
  | "dismissDeleteBlocked"
  | "showConfirmClear"
  | "dismissConfirmClear"
  | "validate"
  | "togglePanel"
  | "setSearch"
>;

/** Panels, selection, search, validation results and blocking dialogs. */
export function createUiSlice(set: StoreSet, get: StoreGet): UiSlice {
  return {
    selection: { nodeIds: [] },
    leftOpen: true,
    rightOpen: true,
    focusedInspectorField: undefined,
    validationOpen: false,
    issues: [],
    search: "",
    deleteBlocked: undefined,
    selectNodes: (nodeIds) =>
      set((state) => {
        const current = state.selection;
        const selectionUnchanged =
          current.edgeId === undefined &&
          current.nodeIds.length === nodeIds.length &&
          current.nodeIds.every((id, index) => id === nodeIds[index]);
        if (nodeIds.length > 0) {
          if (selectionUnchanged && state.rightOpen) return state;
          return {
            ...(selectionUnchanged ? {} : { selection: { nodeIds, edgeId: undefined } }),
            rightOpen: true,
          };
        }
        if (selectionUnchanged) return state;
        return { selection: { nodeIds, edgeId: undefined } };
      }),
    selectEdge: (edgeId) =>
      set((state) => {
        if (state.selection.edgeId === edgeId && state.selection.nodeIds.length === 0) {
          return state;
        }
        return { selection: { nodeIds: [], edgeId } };
      }),
    setFocusedInspectorField: (focusedInspectorField) => set({ focusedInspectorField }),
    showActionBlocked: (deleteBlocked) => set({ deleteBlocked }),
    dismissDeleteBlocked: () => set({ deleteBlocked: undefined }),
    showConfirmClear: (confirmClear) => set({ confirmClear }),
    dismissConfirmClear: () => set({ confirmClear: undefined }),
    validate: () => {
      const issues = validateWorkflow(get().file);
      set({ issues, validationOpen: true });
    },
    togglePanel: (panel) =>
      set((state) =>
        panel === "left"
          ? { leftOpen: !state.leftOpen }
          : panel === "right"
            ? { rightOpen: !state.rightOpen }
            : { validationOpen: !state.validationOpen },
      ),
    setSearch: (search) => set({ search }),
  };
}
