"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clone } from "@/lib/clone";
import { createDomainNode } from "@/lib/create-domain-node";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { DEMO_WORKFLOW } from "@/lib/demo";
import { createProjectWorkflow } from "@/lib/project-template";
import { validateWorkflow } from "@/lib/validation";
import { migrateWorkflowFile } from "@/lib/workflow-migration";
import {
  autoArrangeHighLevel,
  createDefaultHighLevelProcess,
  createHighLevelNode,
  validateHighLevelWorkflow,
} from "@/lib/high-level-workflow";
import { createExecutionItem } from "@/lib/execution";
import { createEmptyExecutionLayer } from "@/types/workflow";
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
  ExecutionItem,
  ExecutionItemType,
  HighLevelEdge,
  HighLevelNode,
  HighLevelNodeLayout,
  HighLevelNodeType,
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

function findAvailableNodePosition(
  file: WorkflowFile,
  node: DomainNode,
  requested: { x: number; y: number },
  parentId?: string,
) {
  const size = getAdaptiveNodeSize(node);
  const occupied = Object.values(file.layout.nodes).filter(
    (layout) => layout.parentId === parentId,
  );
  const gap = 48;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = {
      x: requested.x + attempt * 64,
      y: requested.y + (attempt % 4) * 64,
    };
    const overlaps = occupied.some(
      (layout) =>
        candidate.x < layout.x + layout.width + gap &&
        candidate.x + size.width + gap > layout.x &&
        candidate.y < layout.y + layout.height + gap &&
        candidate.y + size.height + gap > layout.y,
    );
    if (!overlaps) return candidate;
  }

  return {
    x: requested.x + occupied.length * 64,
    y: requested.y + occupied.length * 64,
  };
}

function normalizeHighLevelLayer2Links(
  highLevel: NonNullable<WorkflowFile["highLevel"]>,
  nodeId: string,
  linkedIds: string[],
) {
  const alreadyClaimed = new Set(
    highLevel.graph.nodes
      .filter((node) => node.id !== nodeId)
      .flatMap((node) => node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []),
  );
  return Array.from(new Set(linkedIds)).filter((linkedId) => !alreadyClaimed.has(linkedId));
}

export type ConfirmClearNotice = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

export interface WorkflowState {
  file: WorkflowFile;
  workspaceOwnerId: string;
  activeProjectId?: string;
  dirty: boolean;
  lastSavedAt?: string;
  hydrated: boolean;
  past: WorkflowFile[];
  future: WorkflowFile[];
  selection: { nodeIds: string[]; edgeId?: string };
  highLevelSelection: { nodeIds: string[]; edgeId?: string };
  leftOpen: boolean;
  rightOpen: boolean;
  focusedInspectorField?: string;
  validationOpen: boolean;
  issues: ValidationIssue[];
  search: string;
  confirmClear?: ConfirmClearNotice;
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
  clearDetailedNodes: () => void;
  clearHighLevelNodes: () => void;
  clearExecutionItems: (nodeId?: string) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  selectNodes: (ids: string[]) => void;
  selectEdge: (id?: string) => void;
  selectHighLevelNodes: (ids: string[]) => void;
  selectHighLevelEdge: (id?: string) => void;
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
  showConfirmClear: (notice: ConfirmClearNotice) => void;
  dismissConfirmClear: () => void;
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
  setHighLevelViewport: (
    viewport: NonNullable<WorkflowFile["highLevel"]>["layout"]["viewport"],
  ) => void;
  addHighLevelNode: (type: HighLevelNodeType, position: { x: number; y: number }) => string;
  updateHighLevelNode: (id: string, patch: Partial<HighLevelNode>) => void;
  deleteHighLevelNodes: (ids: string[]) => void;
  addHighLevelEdge: (edge: HighLevelEdge) => void;
  deleteHighLevelEdge: (id: string) => void;
  commitHighLevelLayoutDrag: (
    patches: Record<string, Partial<HighLevelNodeLayout>>,
    before: Record<string, HighLevelNodeLayout>,
  ) => void;
  createDefaultHighLevelProcess: () => void;
  autoArrangeHighLevel: () => void;
  validateHighLevel: () => void;
  addExecutionItem: (
    linkedLayer2NodeId: string,
    type?: ExecutionItemType,
  ) => string;
  updateExecutionItem: (id: string, patch: Partial<ExecutionItem>) => void;
  deleteExecutionItem: (id: string) => void;
  validate: () => void;
  togglePanel: (panel: "left" | "right" | "validation") => void;
  setSearch: (value: string) => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      file: clone(DEMO_WORKFLOW),
      workspaceOwnerId: "dev-bypass",
      activeProjectId: undefined,
      past: [],
      future: [],
      dirty: false,
      hydrated: false,
      selection: { nodeIds: [] },
      highLevelSelection: { nodeIds: [] },
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
          file: clone(DEMO_WORKFLOW),
          workspaceOwnerId: workspaceOwnerId ?? "dev-bypass",
          activeProjectId: undefined,
          past: [],
          future: [],
          dirty: false,
          lastSavedAt: undefined,
          selection: { nodeIds: [] },
          issues: [],
          validationOpen: false,
        }),
      clearDetailedNodes: () =>
        set((state) => {
          const highLevel = state.file.highLevel
            ? {
                ...state.file.highLevel,
                graph: {
                  ...state.file.highLevel.graph,
                  nodes: state.file.highLevel.graph.nodes.map((node) => ({
                    ...node,
                    linkedLayer2NodeIds: [],
                  })),
                },
              }
            : undefined;
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              graph: {
                ...state.file.graph,
                nodes: [],
                edges: [],
              },
              layout: {
                ...state.file.layout,
                nodes: {},
                edges: {},
              },
              highLevel,
            },
            selection: { nodeIds: [] },
            future: [],
            dirty: true,
          };
        }),
      clearHighLevelNodes: () =>
        set((state) => {
          if (!state.file.highLevel) return state;
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              highLevel: {
                ...state.file.highLevel,
                graph: {
                  nodes: [],
                  edges: [],
                },
                layout: {
                  ...state.file.highLevel.layout,
                  nodes: {},
                  edges: {},
                },
              },
            },
            selection: { nodeIds: [] },
            future: [],
            dirty: true,
          };
        }),
      clearExecutionItems: (nodeId?: string) =>
        set((state) => {
          const execution = state.file.execution || createEmptyExecutionLayer();
          const items = nodeId
            ? execution.items.filter((item) => item.linkedLayer2NodeId !== nodeId)
            : [];
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
      selectNodes: (nodeIds) =>
        set((state) => {
          const current = state.selection;
          if (
            current.edgeId === undefined &&
            current.nodeIds.length === nodeIds.length &&
            current.nodeIds.every((id, index) => id === nodeIds[index])
          ) {
            return state;
          }
          return { selection: { nodeIds, edgeId: undefined } };
        }),
      selectEdge: (edgeId) =>
        set((state) => {
          if (state.selection.edgeId === edgeId && state.selection.nodeIds.length === 0) {
            return state;
          }
          return { selection: { nodeIds: [], edgeId } };
        }),
      selectHighLevelNodes: (nodeIds) =>
        set((state) => {
          const current = state.highLevelSelection;
          if (
            current.edgeId === undefined &&
            current.nodeIds.length === nodeIds.length &&
            current.nodeIds.every((id, index) => id === nodeIds[index])
          ) {
            return state;
          }
          return { highLevelSelection: { nodeIds, edgeId: undefined } };
        }),
      selectHighLevelEdge: (edgeId) =>
        set((state) => {
          if (
            state.highLevelSelection.edgeId === edgeId &&
            state.highLevelSelection.nodeIds.length === 0
          ) {
            return state;
          }
          return { highLevelSelection: { nodeIds: [], edgeId } };
        }),
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
        set((state) => ({
          past: appendHistory(state.past, state.file),
          file: insertNode(
            clone(state.file),
            node,
            findAvailableNodePosition(state.file, node, position, parentId),
            parentId,
          ),
          future: [],
          dirty: true,
          // Let React Flow finish mounting the new node before enabling its
          // selection-only resizers and handles. This prevents a controlled
          // node measurement loop when adding Gate / Decision Module cards.
          selection: { nodeIds: [] },
        }));
        if (
          typeof window !== "undefined" &&
          type !== "phase" &&
          type !== "terminal" &&
          type !== "gate"
        ) {
          window.setTimeout(() => {
            const current = get();
            if (current.file.graph.nodes.some((item) => item.id === id)) {
              current.selectNodes([id]);
            }
          }, 0);
        }
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
      showConfirmClear: (confirmClear) => set({ confirmClear }),
      dismissConfirmClear: () => set({ confirmClear: undefined }),
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
        set((state) => {
          const current = state.file.layout.viewport;
          if (
            current.x === viewport.x &&
            current.y === viewport.y &&
            current.zoom === viewport.zoom
          ) {
            return state;
          }
          return {
            file: { ...state.file, layout: { ...state.file.layout, viewport } },
          };
        }),
      setHighLevelViewport: (viewport) =>
        set((state) => {
          const highLevel = state.file.highLevel || {
            graph: { nodes: [], edges: [] },
            layout: { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } },
          };
          const current = highLevel.layout.viewport;
          if (
            current.x === viewport.x &&
            current.y === viewport.y &&
            current.zoom === viewport.zoom
          ) {
            return state;
          }
          return {
            file: {
              ...state.file,
              highLevel: {
                ...highLevel,
                layout: { ...highLevel.layout, viewport },
              },
            },
          };
        }),
      addHighLevelNode: (type, position) => {
        const id = `high-level-${type}-${crypto.randomUUID().slice(0, 8)}`;
        const node = createHighLevelNode(type, id);
        set((state) => {
          const highLevel = state.file.highLevel || {
            graph: { nodes: [], edges: [] },
            layout: { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } },
          };
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              highLevel: {
                ...highLevel,
                graph: { ...highLevel.graph, nodes: [...highLevel.graph.nodes, node] },
                layout: {
                  ...highLevel.layout,
                  nodes: {
                    ...highLevel.layout.nodes,
                    [id]: { nodeId: id, x: position.x, y: position.y },
                  },
                },
              },
            },
            future: [],
            dirty: true,
            highLevelSelection: { nodeIds: [id] },
          };
        });
        return id;
      },
      updateHighLevelNode: (id, patch) =>
        set((state) => {
          const highLevel = state.file.highLevel;
          if (!highLevel || !highLevel.graph.nodes.some((node) => node.id === id)) {
            return state;
          }
          const normalizedPatch = patch.linkedLayer2NodeIds
            ? {
                ...patch,
                linkedLayer2NodeIds: normalizeHighLevelLayer2Links(
                  highLevel,
                  id,
                  patch.linkedLayer2NodeIds,
                ),
                linkedDetailedNodeIds: normalizeHighLevelLayer2Links(
                  highLevel,
                  id,
                  patch.linkedLayer2NodeIds,
                ),
              }
            : patch;
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              highLevel: {
                ...highLevel,
                graph: {
                  ...highLevel.graph,
                  nodes: highLevel.graph.nodes.map((node) =>
                    node.id === id ? { ...node, ...normalizedPatch } : node,
                  ),
                },
              },
            },
            future: [],
            dirty: true,
          };
        }),
      deleteHighLevelNodes: (ids) => {
        if (!ids.length) return;
        set((state) => {
          const highLevel = state.file.highLevel;
          if (!highLevel) return state;
          const deleted = new Set(ids);
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              highLevel: {
                ...highLevel,
                graph: {
                  nodes: highLevel.graph.nodes.filter((node) => !deleted.has(node.id)),
                  edges: highLevel.graph.edges.filter(
                    (edge) => !deleted.has(edge.source) && !deleted.has(edge.target),
                  ),
                },
                layout: {
                  ...highLevel.layout,
                  nodes: Object.fromEntries(
                    Object.entries(highLevel.layout.nodes).filter(
                      ([id]) => !deleted.has(id),
                    ),
                  ),
                },
              },
            },
            future: [],
            dirty: true,
            highLevelSelection: { nodeIds: [] },
          };
        });
      },
      addHighLevelEdge: (edge) => {
        if (!edge.source || !edge.target || edge.source === edge.target) return;
        set((state) => {
          const highLevel = state.file.highLevel;
          if (
            !highLevel ||
            !highLevel.graph.nodes.some((node) => node.id === edge.source) ||
            !highLevel.graph.nodes.some((node) => node.id === edge.target)
          ) {
            return state;
          }
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              highLevel: {
                ...highLevel,
                graph: {
                  ...highLevel.graph,
                  edges: [
                    ...highLevel.graph.edges.filter(
                      (item) => item.source !== edge.source || item.target !== edge.target,
                    ),
                    edge,
                  ],
                },
              },
            },
            future: [],
            dirty: true,
            highLevelSelection: { nodeIds: [], edgeId: undefined },
          };
        });
      },
      deleteHighLevelEdge: (id) =>
        set((state) => {
          const highLevel = state.file.highLevel;
          if (!highLevel || !highLevel.graph.edges.some((edge) => edge.id === id)) {
            return state;
          }
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              highLevel: {
                ...highLevel,
                graph: {
                  ...highLevel.graph,
                  edges: highLevel.graph.edges.filter((edge) => edge.id !== id),
                },
              },
            },
            future: [],
            dirty: true,
            highLevelSelection: { nodeIds: [], edgeId: undefined },
          };
        }),
      commitHighLevelLayoutDrag: (patches, before) =>
        set((state) => {
          const highLevel = state.file.highLevel;
          if (!highLevel || !Object.keys(patches).length) return state;
          const nextNodes = { ...highLevel.layout.nodes };
          let changed = false;
          for (const [id, patch] of Object.entries(patches)) {
            if (!nextNodes[id]) continue;
            nextNodes[id] = { ...nextNodes[id], ...patch };
            changed = true;
          }
          if (!changed) return state;
          const snapshot = clone(state.file);
          snapshot.highLevel = {
            ...highLevel,
            layout: { ...highLevel.layout, nodes: { ...highLevel.layout.nodes, ...before } },
          };
          return {
            past: appendHistory(state.past, snapshot),
            file: {
              ...state.file,
              highLevel: { ...highLevel, layout: { ...highLevel.layout, nodes: nextNodes } },
            },
            future: [],
            dirty: true,
          };
        }),
      createDefaultHighLevelProcess: () =>
        set((state) => {
          const highLevel = state.file.highLevel;
          if (highLevel?.graph.nodes.length) return state;
          const next = createDefaultHighLevelProcess();
          return {
            past: appendHistory(state.past, state.file),
            file: { ...state.file, highLevel: next },
            future: [],
            dirty: true,
          };
        }),
      autoArrangeHighLevel: () =>
        set((state) => {
          if (!state.file.highLevel?.graph.nodes.length) return state;
          const next = autoArrangeHighLevel(state.file);
          return {
            past: appendHistory(state.past, state.file),
            file: next,
            future: [],
            dirty: true,
          };
        }),
      addExecutionItem: (linkedLayer2NodeId, type = "Document") => {
        const current = get().file;
        if (
          !current.graph.nodes.some((node) => node.id === linkedLayer2NodeId)
        ) {
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
          if (
            patch.linkedLayer2NodeId !== undefined &&
            !state.file.graph.nodes.some(
              (node) => node.id === patch.linkedLayer2NodeId,
            )
          ) {
            return state;
          }
          const nextItem: ExecutionItem = {
            ...current,
            ...patch,
            id: current.id,
            linkedLayer2NodeId:
              patch.linkedLayer2NodeId ?? current.linkedLayer2NodeId,
          };
          return {
            past: appendHistory(state.past, state.file),
            file: {
              ...state.file,
              execution: {
                ...execution,
                items: execution.items.map((item) =>
                  item.id === id ? nextItem : item,
                ),
              },
            },
            future: [],
            dirty: true,
          };
        }),
      deleteExecutionItem: (id) =>
        set((state) => {
          const execution = state.file.execution;
          if (!execution?.items.some((item) => item.id === id)) return state;
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
      validate: () => {
        const issues = validateWorkflow(get().file);
        set({ issues, validationOpen: true });
      },
      validateHighLevel: () => {
        const issues = validateHighLevelWorkflow(get().file.highLevel);
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
      name: "project-workflow-builder:v30-l3-opportunity-intake",
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
