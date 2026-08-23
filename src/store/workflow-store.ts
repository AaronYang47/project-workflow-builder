"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clone } from "@/lib/clone";
import { createDomainNode } from "@/lib/create-domain-node";
import { DEMO_WORKFLOW } from "@/lib/demo";
import { createProjectWorkflow } from "@/lib/project-template";
import { validateWorkflow } from "@/lib/validation";
import { migrateWorkflowFile } from "@/lib/workflow-migration";
import {
  addOrReplaceEdge,
  applyLayoutDrag,
  clearEdgeRoute,
  deleteNodesFromFile,
  duplicateNodes,
  groupNodesIntoPhase,
  insertNode,
  occupiedPhaseNotices,
  patchNode,
  wouldRemoveLastProjectStart,
} from "@/lib/workflow-graph";
import {
  appendHistory,
  debouncedJSONStorage,
} from "@/store/workflow-persist";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import type { SyncMessage } from "@/lib/collaboration/collaboration-types";
import type {
  DomainEdge,
  DomainNode,
  NodeLayout,
  ValidationIssue,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";

function broadcastIfLocal(createMessage: (senderId: string) => SyncMessage) {
  if (typeof window === "undefined") return;
  const isRemoteApplying = useCollaborationStore.getState().isRemoteApplying;
  if (!isRemoteApplying) {
    const senderId = useCollaborationStore.getState().localUser.peerId;
    collaborationManager.broadcast(createMessage(senderId));
  }
}

type Snapshot = WorkflowFile;
interface WorkflowState {
  file: WorkflowFile;
  workspaceOwnerId?: string;
  activeProjectId?: string;
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  lastSavedAt?: string;
  hydrated: boolean;
  selection: { nodeIds: string[]; edgeId?: string };
  leftOpen: boolean;
  rightOpen: boolean;
  focusedInspectorField?: string;
  validationOpen: boolean;
  issues: ValidationIssue[];
  search: string;
  deleteBlocked?: {
    title: string;
    message: string;
    items: string[];
  };
  setHydrated: () => void;
  commit: (updater: (file: WorkflowFile) => WorkflowFile) => void;
  commitTransient: (updater: (file: WorkflowFile) => WorkflowFile) => void;
  recordSnapshot: (snapshot: WorkflowFile) => void;
  replaceFile: (file: WorkflowFile) => void;
  loadProject: (file: WorkflowFile, projectId: string, userId: string) => void;
  resetWorkspace: (userId?: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  selectNodes: (ids: string[]) => void;
  selectEdge: (id?: string) => void;
  setFocusedInspectorField: (key?: string) => void;
  addNode: (
    type: WorkflowNodeType,
    position: { x: number; y: number },
    parentId?: string,
  ) => string;
  updateNode: (id: string, patch: Partial<DomainNode>) => void;
  deleteNodes: (ids: string[]) => void;
  deleteSelected: () => void;
  showActionBlocked: (
    notice: NonNullable<WorkflowState["deleteBlocked"]>,
  ) => void;
  dismissDeleteBlocked: () => void;
  addEdge: (edge: DomainEdge) => void;
  updateEdge: (id: string, patch: Partial<DomainEdge>) => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  updateLayout: (
    id: string,
    patch: Partial<WorkflowFile["layout"]["nodes"][string]>,
    record?: boolean,
  ) => void;
  updateLayouts: (patches: Record<string, Partial<NodeLayout>>) => void;
  recordLayoutHistory: (before: Record<string, NodeLayout>) => void;
  commitLayoutDrag: (
    patches: Record<string, Partial<NodeLayout>>,
    before: Record<string, NodeLayout>,
  ) => void;
  setViewport: (viewport: WorkflowFile["layout"]["viewport"]) => void;
  validate: () => void;
  togglePanel: (panel: "left" | "right" | "validation") => void;
  setSearch: (value: string) => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      file: clone(DEMO_WORKFLOW),
      workspaceOwnerId: undefined,
      activeProjectId: undefined,
      past: [],
      future: [],
      dirty: false,
      hydrated: false,
      selection: { nodeIds: [] },
      leftOpen: true,
      rightOpen: true,
      focusedInspectorField: undefined,
      validationOpen: false,
      issues: [],
      search: "",
      deleteBlocked: undefined,
      setHydrated: () =>
        set((state) => {
          try {
            return {
              hydrated: true,
              file: migrateWorkflowFile(state.file),
            };
          } catch {
            return {
              hydrated: true,
              file: createProjectWorkflow("Untitled Project", ""),
              activeProjectId: undefined,
              past: [],
              future: [],
              dirty: false,
              selection: { nodeIds: [] },
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
        set({
          file: migrateWorkflowFile(file),
          activeProjectId: undefined,
          past: [],
          future: [],
          dirty: true,
          selection: { nodeIds: [] },
        }),
      loadProject: (file, activeProjectId, workspaceOwnerId) =>
        set({
          file: migrateWorkflowFile(file),
          workspaceOwnerId,
          activeProjectId,
          past: [],
          future: [],
          dirty: false,
          selection: { nodeIds: [] },
        }),
      resetWorkspace: (workspaceOwnerId) =>
        set({
          file: createProjectWorkflow("Untitled Project", ""),
          workspaceOwnerId,
          activeProjectId: undefined,
          past: [],
          future: [],
          dirty: false,
          lastSavedAt: undefined,
          selection: { nodeIds: [] },
          issues: [],
          validationOpen: false,
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
      selectNodes: (nodeIds) => set({ selection: { nodeIds } }),
      selectEdge: (edgeId) => set({ selection: { nodeIds: [], edgeId } }),
      setFocusedInspectorField: (focusedInspectorField) =>
        set({ focusedInspectorField }),
      addNode: (type, position, parentId) => {
        if (type === "projectStart") {
          const existing = get().file.graph.nodes.find(
            (node) => node.type === "projectStart",
          );
          if (existing) {
            set({
              selection: { nodeIds: [existing.id] },
              deleteBlocked: {
                title: "Project Start already exists",
                message: "Every project can have only one Project Start.",
                items: ["The existing Project Start has been selected."],
              },
            });
            return existing.id;
          }
        }
        const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
        const node = createDomainNode(type, id);
        get().commit((file) => insertNode(file, node, position, parentId));
        set({ selection: { nodeIds: [id] } });
        return id;
      },
      updateNode: (id, patch) => {
        get().commit((file) => patchNode(file, id, patch));
        broadcastIfLocal((senderId) => ({
          type: "PATCH_NODE",
          senderId,
          nodeId: id,
          patch,
          timestamp: Date.now(),
        }));
      },
      deleteNodes: (ids) => {
        if (!ids.length) return;
        const currentFile = get().file;
        const blockedStarts = wouldRemoveLastProjectStart(currentFile, ids);
        if (blockedStarts.length) {
          set({
            deleteBlocked: {
              title: "Unable to delete Project Start",
              message: "Every project must begin with Project Start.",
              items: blockedStarts.map((node) => node.title),
            },
          });
          return;
        }
        const occupiedPhases = occupiedPhaseNotices(currentFile, ids);
        if (occupiedPhases.length) {
          set({
            deleteBlocked: {
              title: "Unable to delete occupied Phase",
              message:
                "A Phase cannot be deleted while it still contains nodes. Move the items out of the Phase, or select the Phase and all of its contents before deleting.",
              items: occupiedPhases.flatMap(({ phase, children }) => [
                `${phase.title} contains:`,
                ...children.map((node) => `• ${node.title}`),
              ]),
            },
          });
          return;
        }
        get().commit((file) => deleteNodesFromFile(file, ids));
        broadcastIfLocal((senderId) => ({
          type: "DELETE_NODES",
          senderId,
          nodeIds: ids,
          timestamp: Date.now(),
        }));
        set({ selection: { nodeIds: [] } });
      },
      deleteSelected: () => {
        const { nodeIds, edgeId } = get().selection;
        if (nodeIds.length) {
          get().deleteNodes(nodeIds);
          return;
        }
        if (!edgeId) return;
        get().commit((file) => ({
          ...file,
          graph: {
            ...file.graph,
            edges: file.graph.edges.filter((edge) => edge.id !== edgeId),
          },
        }));
        set({ selection: { nodeIds: [] } });
      },
      showActionBlocked: (deleteBlocked) => set({ deleteBlocked }),
      dismissDeleteBlocked: () => set({ deleteBlocked: undefined }),
      addEdge: (edge) => {
        if (
          get().file.graph.nodes.find((node) => node.id === edge.target)?.type ===
          "projectStart"
        ) {
          set({
            deleteBlocked: {
              title: "Invalid connection",
              message: "Project Start must be the first node.",
              items: ["Connect from Project Start to the next node instead."],
            },
          });
        } else {
          get().commit((file) => addOrReplaceEdge(file, edge));
          broadcastIfLocal((senderId) => ({
            type: "ADD_EDGE",
            senderId,
            edge,
            timestamp: Date.now(),
          }));
        }
      },
      updateEdge: (id, patch) => {
        get().commit((file) => {
          const reconnects =
            patch.source !== undefined ||
            patch.target !== undefined ||
            patch.sourceHandle !== undefined ||
            patch.targetHandle !== undefined;
          const next = {
            ...file,
            graph: {
              ...file.graph,
              edges: file.graph.edges.map((edge) =>
                edge.id === id ? { ...edge, ...patch } : edge,
              ),
            },
          };
          return reconnects ? clearEdgeRoute(next, id) : next;
        });
        broadcastIfLocal((senderId) => ({
          type: "UPDATE_EDGE",
          senderId,
          edgeId: id,
          patch,
          timestamp: Date.now(),
        }));
      },
      duplicateSelected: () => {
        const ids = get().selection.nodeIds.filter(
          (id) =>
            get().file.graph.nodes.find((node) => node.id === id)?.type !==
            "projectStart",
        );
        if (!ids.length) return;
        let created: string[] = [];
        get().commit((file) => {
          const result = duplicateNodes(file, ids);
          created = result.created;
          return result.file;
        });
        set({ selection: { nodeIds: created } });
      },
      groupSelected: () => {
        const ids = get().selection.nodeIds.filter(
          (id) =>
            !["phase", "projectStart"].includes(
              get().file.graph.nodes.find((node) => node.id === id)?.type || "",
            ),
        );
        if (!ids.length) return;
        const groupId = `phase-${crypto.randomUUID().slice(0, 8)}`;
        get().commit((file) => groupNodesIntoPhase(file, ids, groupId));
        set({ selection: { nodeIds: [groupId] } });
      },
      updateLayout: (id, patch, record = false) => {
        const apply = (file: WorkflowFile) => ({
          ...file,
          layout: {
            ...file.layout,
            nodes: {
              ...file.layout.nodes,
              [id]: { ...file.layout.nodes[id], ...patch },
            },
          },
        });
        if (record) get().commit(apply);
        else set((state) => ({ file: apply(state.file), dirty: true }));
      },
      updateLayouts: (patches) =>
        set((state) => {
          const nodes = { ...state.file.layout.nodes };
          let changed = false;
          for (const [id, patch] of Object.entries(patches)) {
            const current = nodes[id];
            if (!current) continue;
            const next = { ...current, ...patch };
            if (
              (Object.entries(patch) as [keyof NodeLayout, unknown][]).some(
                ([key, value]) => current[key] !== value,
              )
            ) {
              nodes[id] = next;
              changed = true;
            }
          }
          return changed
            ? {
                file: {
                  ...state.file,
                  layout: { ...state.file.layout, nodes },
                },
              }
            : state;
        }),
      recordLayoutHistory: (before) =>
        set((state) => {
          if (!Object.keys(before).length) return state;
          const snapshot = clone(state.file);
          snapshot.layout.nodes = {
            ...snapshot.layout.nodes,
            ...clone(before),
          };
          return {
            past: appendHistory(state.past, snapshot),
            future: [],
            dirty: true,
          };
        }),
      commitLayoutDrag: (patches, before) => {
        set((state) => {
          if (!Object.keys(before).length) return state;
          const snapshot = clone(state.file);
          snapshot.layout.nodes = {
            ...snapshot.layout.nodes,
            ...clone(before),
          };
          return {
            file: applyLayoutDrag(state.file, patches, before),
            past: appendHistory(state.past, snapshot),
            future: [],
            dirty: true,
          };
        });
        broadcastIfLocal((senderId) => ({
          type: "UPDATE_LAYOUTS",
          senderId,
          patches,
          timestamp: Date.now(),
        }));
      },
      setViewport: (viewport) =>
        set((state) => ({
          file: { ...state.file, layout: { ...state.file.layout, viewport } },
        })),
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
    }),
    {
      name: "project-workflow-builder:v3",
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
