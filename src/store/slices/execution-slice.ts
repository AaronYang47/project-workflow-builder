"use client";

import { createExecutionItem } from "@/lib/execution";
import { sequentialExecutionBlocker } from "@/lib/workflow-progress";
import { createEmptyExecutionLayer } from "@/types/workflow";
import { appendHistory } from "@/store/workflow-persist";
import type { ExecutionItem } from "@/types/workflow";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

export type ExecutionSlice = Pick<
  WorkflowState,
  "clearExecutionItems" | "addExecutionItem" | "updateExecutionItem" | "deleteExecutionItem"
>;

/** L3 execution items (forms, documents, approvals) linked to L2 nodes. */
export function createExecutionSlice(set: StoreSet, get: StoreGet): ExecutionSlice {
  return {
    clearExecutionItems: (nodeId?: string) =>
      set((state) => {
        const execution = state.file.execution || createEmptyExecutionLayer();
        const items = nodeId
          ? execution.items.filter(
              (item) => item.linkedLayer2NodeId !== nodeId || Boolean(item.catalogId),
            )
          : execution.items.filter((item) => Boolean(item.catalogId));
        return {
          past: appendHistory(state.past, state.file),
          file: {
            ...state.file,
            execution: {
              ...execution,
              items,
            },
          },
          future: [],
          dirty: true,
        };
      }),
    addExecutionItem: (linkedLayer2NodeId, type = "Document") => {
      const current = get().file;
      if (!current.graph.nodes.some((node) => node.id === linkedLayer2NodeId)) {
        return "";
      }
      const id = `execution-${crypto.randomUUID().slice(0, 8)}`;
      const item = createExecutionItem(id, linkedLayer2NodeId, type);
      set((state) => {
        const execution = state.file.execution || createEmptyExecutionLayer();
        return {
          past: appendHistory(state.past, state.file),
          file: {
            ...state.file,
            execution: {
              ...execution,
              items: [...execution.items, item],
            },
          },
          future: [],
          dirty: true,
        };
      });
      return id;
    },
    updateExecutionItem: (id, patch) =>
      set((state) => {
        const execution = state.file.execution;
        const current = execution?.items.find((item) => item.id === id);
        if (!execution || !current) return state;
        const blocker =
          patch.checklistComplete === true &&
          !current.checklistComplete &&
          sequentialExecutionBlocker(
            state.file,
            patch.linkedLayer2NodeId ?? current.linkedLayer2NodeId,
          );
        if (blocker)
          return {
            deleteBlocked: {
              title: "Finish the previous department first",
              message: blocker,
              items: [],
            },
          };
        if (
          patch.linkedLayer2NodeId !== undefined &&
          !state.file.graph.nodes.some((node) => node.id === patch.linkedLayer2NodeId)
        ) {
          return state;
        }
        const nextItem: ExecutionItem = {
          ...current,
          ...patch,
          id: current.id,
          linkedLayer2NodeId: patch.linkedLayer2NodeId ?? current.linkedLayer2NodeId,
        };
        return {
          past: appendHistory(state.past, state.file),
          file: {
            ...state.file,
            execution: {
              ...execution,
              items: execution.items.map((item) => (item.id === id ? nextItem : item)),
            },
          },
          future: [],
          dirty: true,
        };
      }),
    deleteExecutionItem: (id) =>
      set((state) => {
        const execution = state.file.execution;
        const target = execution?.items.find((item) => item.id === id);
        if (!execution || !target || target.catalogId) return state;
        return {
          past: appendHistory(state.past, state.file),
          file: {
            ...state.file,
            execution: {
              ...execution,
              items: execution.items.filter((item) => item.id !== id),
            },
          },
          future: [],
          dirty: true,
        };
      }),
  };
}
