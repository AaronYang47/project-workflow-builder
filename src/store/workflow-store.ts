"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clone } from "@/lib/clone";
import { createDomainNode } from "@/lib/create-domain-node";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { createEmptyWorkspace, createProjectWorkflow } from "@/lib/project-template";
import { validateWorkflow } from "@/lib/validation";
import { migrateWorkflowFile } from "@/lib/workflow-migration";
import {
  autoArrangeHighLevel,
  createHighLevelNode,
  isDefaultHighLevelProcess,
  isLegacyDefaultHighLevelFamily,
  validateHighLevelWorkflow,
} from "@/lib/high-level-workflow";
import { DETAILED_LIFECYCLE_IDS } from "@/lib/detailed-workflow";
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
import {
  appendOperationsAudit,
  calculateClassD,
  classifyClientPath,
  convertClientToProject,
  createEstimateVersion,
  evaluatePaymentRelease,
  normalizeProjectOperations,
  roleCanApprove,
  scheduleWarranty,
} from "@/lib/project-operations";
import type {
  ApprovalRole,
  ProjectOperations,
} from "@/types/project-operations";
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

function isBlankWorkflow(file: WorkflowFile) {
  return (
    file.graph.nodes.length === 0 &&
    file.graph.edges.length === 0 &&
    (file.highLevel?.graph.nodes.length ?? 0) === 0
  );
}

function clearDefaultWorkflow(file: WorkflowFile) {
  const blank = createEmptyWorkspace();
  return {
    ...blank,
    graph: { ...blank.graph, metadata: file.graph.metadata },
    operations: file.operations,
  };
}

function isSeededDetailedWorkflow(file: WorkflowFile) {
  const ids = new Set(DETAILED_LIFECYCLE_IDS);
  const hasNoNamedProject = file.graph.metadata.name.trim().length === 0;
  const hasNoHighLevelNodes = (file.highLevel?.graph.nodes.length ?? 0) === 0;
  return (
    file.graph.nodes.length >= 4 &&
    file.graph.nodes.every((node) => ids.has(node.id as (typeof DETAILED_LIFECYCLE_IDS)[number])) &&
    hasNoNamedProject &&
    hasNoHighLevelNodes
  );
}

function removePrimaryGates(file: WorkflowFile) {
  const highLevel = file.highLevel;
  if (!highLevel) return { file, removed: false };
  const removedIds = new Set(
    highLevel.graph.nodes
      .filter((node) => node.type === "primaryGate")
      .map((node) => node.id),
  );
  if (!removedIds.size) return { file, removed: false };

  const nodes = highLevel.graph.nodes.filter((node) => !removedIds.has(node.id));
  const edges = highLevel.graph.edges.filter(
    (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
  );
  const layoutNodes = Object.fromEntries(
    Object.entries(highLevel.layout.nodes).filter(([nodeId]) => !removedIds.has(nodeId)),
  );
  return {
    file: {
      ...file,
      highLevel: {
        ...highLevel,
        graph: { nodes, edges },
        layout: { ...highLevel.layout, nodes: layoutNodes },
      },
    },
    removed: true,
  };
}

function normalizeLoadedWorkflow(file: WorkflowFile) {
  if (
    isDefaultHighLevelProcess(file.highLevel) ||
    isLegacyDefaultHighLevelFamily(file.highLevel)
  ) {
    return { file: clearDefaultWorkflow(file), clearedDefault: true };
  }
  if (isBlankWorkflow(file)) return { file, clearedDefault: false };
  // A current project may intentionally contain only user-authored L1 nodes
  // while its detailed layer is still empty. Do not let the legacy migration
  // scaffold L2 for that document and then classify it as a default workflow.
  if (file.graph.nodes.length === 0 && (file.highLevel?.graph.nodes.length ?? 0) > 0) {
    const sanitized = removePrimaryGates(file);
    return { file: sanitized.file, clearedDefault: sanitized.removed };
  }
  const migrated = migrateWorkflowFile(file);
  if (isSeededDetailedWorkflow(migrated)) {
    return { file: clearDefaultWorkflow(migrated), clearedDefault: true };
  }
  const sanitized = removePrimaryGates(migrated);
  return { file: sanitized.file, clearedDefault: sanitized.removed };
}

function withOperationalIdentity(file: WorkflowFile, operations: ProjectOperations) {
  const identity = operations.identity;
  return {
    ...file,
    graph: {
      ...file.graph,
      metadata: {
        ...file.graph.metadata,
        updatedAt: operations.updatedAt,
      },
      nodes: file.graph.nodes.map((node) =>
        node.type === "projectStart"
          ? {
              ...node,
              conditions: [
                {
                  id: "client-id-required",
                  label: "Client / Lead ID is created",
                  required: true,
                  checked: Boolean(identity.clientId),
                  locked: true,
                },
              ],
              customFields: {
                ...node.customFields,
                clientId: identity.clientId,
                leadId: identity.leadId,
                projectId: identity.projectNumber,
                legacyJobNumber: typeof identity.legacyJobNumber === "string"
                  ? identity.legacyJobNumber
                  : "",
              },
            }
          : node,
      ),
    },
    operations,
  };
}

export type ConfirmClearNotice = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

export type AuthUser = { id: string; email: string; name: string };

export interface WorkflowState {
  file: WorkflowFile;
  workspaceOwnerId: string;
  authUser?: AuthUser | null;
  setAuthUser: (user: AuthUser | null) => void;
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
  deleteNodeCondition: (
    nodeId: string,
    conditionId?: string,
    conditionIndex?: number,
  ) => void;
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
  autoArrangeHighLevel: () => void;
  validateHighLevel: () => void;
  addExecutionItem: (
    linkedLayer2NodeId: string,
    type?: ExecutionItemType,
  ) => string;
  updateExecutionItem: (id: string, patch: Partial<ExecutionItem>) => void;
  deleteExecutionItem: (id: string) => void;
  updateOperations: (
    updater: (operations: ProjectOperations) => ProjectOperations,
    audit?: {
      actor?: string;
      actorRole?: ApprovalRole | "System";
      action: string;
      entityType?: string;
      entityId?: string;
      summary: string;
    },
  ) => void;
  classifyOperationsClient: (actor: string) => void;
  releasePaymentGate: (actor: string, role: ApprovalRole) => string | undefined;
  approveOperationsRequest: (
    requestId: string,
    actor: string,
    role: ApprovalRole,
    approve: boolean,
  ) => string | undefined;
  convertClientRecord: (input: {
    sequence: number;
    actor: string;
    gateDecisionId: string;
    buildingCount?: number;
    modulesPerBuilding?: number;
  }) => string;
  recalculateClassD: (actor: string, sourceRevision: string) => number;
  startWarranty: (input: {
    dayZeroDate: string;
    durationMonths: number;
    owner: string;
    triggerEvidence: string;
    actor: string;
  }) => string | undefined;
  validate: () => void;
  togglePanel: (panel: "left" | "right" | "validation") => void;
  setSearch: (value: string) => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      file: createEmptyWorkspace(),
      workspaceOwnerId: "dev-bypass",
      authUser: null,
      setAuthUser: (authUser) => set({ authUser }),
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
            const normalized = normalizeLoadedWorkflow(state.file);
            return {
              hydrated: true,
              // Keep a new/cleared workspace genuinely empty. The migration
              // fallback adds Project Start for older workflow files, but it
              // must not recreate content in the blank starting state.
              file: normalized.file,
              dirty: state.dirty || normalized.clearedDefault,
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
          past: [],
          future: [],
          dirty: true,
          selection: { nodeIds: [] },
          };
        }),
      loadProject: (file, activeProjectId, workspaceOwnerId) =>
        set(() => {
          const normalized = normalizeLoadedWorkflow(file);
          return {
          file: normalized.file,
          workspaceOwnerId,
          activeProjectId,
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
            ? execution.items.filter(
                (item) =>
                  item.linkedLayer2NodeId !== nodeId || Boolean(item.catalogId),
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
        // These are canonical/retired lifecycle surfaces, not user-addable
        // palette nodes. Keep the guard for stale drag/command events from
        // older sessions after their palette entries have been removed.
        if (type === "approvalMatrix" || type === "responsibilityLane") {
          return "";
        }
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
      deleteNodeCondition: (nodeId, conditionId, conditionIndex) => {
        let deleted = false;
        let nextConditions: DomainNode["conditions"] = [];
        let linkedExecutionItemId: string | undefined;
        get().commit((file) => {
          const node = file.graph.nodes.find((item) => item.id === nodeId);
          if (!node) return file;
          const index = conditionId
            ? node.conditions.findIndex((condition) => condition.id === conditionId)
            : conditionIndex ?? -1;
          const condition = node.conditions[index];
          if (!condition || condition.locked) return file;

          deleted = true;
          nextConditions = node.conditions.filter((_, itemIndex) => itemIndex !== index);
          linkedExecutionItemId = condition.linkedExecutionItemId;
          let nextFile = patchNode(file, nodeId, { conditions: nextConditions });

          // A release condition can create a local L3 requirement when its
          // form is opened. Remove that orphan with the condition, while
          // preserving any catalog-controlled ProFab record.
          if (linkedExecutionItemId && nextFile.execution) {
            const linkedItem = nextFile.execution.items.find(
              (item) => item.id === linkedExecutionItemId,
            );
            if (linkedItem && !linkedItem.catalogId) {
              nextFile = {
                ...nextFile,
                execution: {
                  ...nextFile.execution,
                  items: nextFile.execution.items.filter(
                    (item) => item.id !== linkedExecutionItemId,
                  ),
                },
              };
            }
          }
          return nextFile;
        });
        if (!deleted) return;

        set({ focusedInspectorField: undefined });
        broadcastIfLocal((senderId) => ({
          type: "PATCH_NODE",
          senderId,
          nodeId,
          patch: { conditions: nextConditions },
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
        // Primary Gates are no longer part of the L1 authoring model. Keep
        // this guard for stale drag/drop or command events from old sessions.
        if (type === "primaryGate") return "";
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
      updateOperations: (updater, audit) => {
        get().commit((file) => {
          const current = normalizeProjectOperations(
            file.operations,
            file.graph.metadata.name,
            String(
              file.graph.nodes.find((node) => node.type === "projectStart")
                ?.customFields.legacyJobNumber || "",
            ),
          );
          let operations = updater(clone(current));
          operations = {
            ...operations,
            updatedAt: new Date().toISOString(),
          };
          if (audit) {
            operations = appendOperationsAudit(operations, {
              actor: audit.actor || "Unknown",
              actorRole: audit.actorRole || "System",
              action: audit.action,
              entityType: audit.entityType || "ProjectOperations",
              entityId: audit.entityId || operations.identity.projectNumber || operations.identity.clientId,
              summary: audit.summary,
            });
          }
          return withOperationalIdentity(file, operations);
        });
      },
      classifyOperationsClient: (actor) => {
        const operations = normalizeProjectOperations(
          get().file.operations,
          get().file.graph.metadata.name,
        );
        const classification = classifyClientPath(operations);
        get().updateOperations(
          (current) => ({
            ...current,
            clientPath: {
              ...current.clientPath,
              clientType: classification.type,
              selectedSubGates: classification.subGates,
              classificationReason: classification.reason,
              classifiedAt: new Date().toISOString(),
              classifiedBy: actor,
            },
          }),
          {
            actor,
            actorRole: "Coordinator",
            action: "CLASSIFY_CLIENT_PATH",
            entityType: "ClientPath",
            entityId: operations.identity.clientId,
            summary: `${classification.type} selected with ${classification.subGates.length} fixed sub-gates.`,
          },
        );
      },
      releasePaymentGate: (actor, role) => {
        const operations = normalizeProjectOperations(
          get().file.operations,
          get().file.graph.metadata.name,
        );
        const evaluation = evaluatePaymentRelease(operations);
        if (!evaluation.ready) return evaluation.reasons.join(" ");
        if (!roleCanApprove(role, "Finance", "Payment Release")) {
          return `${role} is not authorized to release a payment gate.`;
        }
        const timestamp = new Date().toISOString();
        get().updateOperations(
          (current) => ({
            ...current,
            commercial: {
              ...current.commercial,
              paymentRelease: {
                ...current.commercial.paymentRelease,
                status: "Released",
                releasedAt: timestamp,
                releasedBy: actor,
                approverRole: role,
                reasons: [],
              },
            },
            approvals: {
              ...current.approvals,
              requests: [
                ...current.approvals.requests,
                {
                  id: `approval-payment-${crypto.randomUUID()}`,
                  kind: "Payment Release",
                  reference: current.commercial.paymentRelease.id,
                  amount: current.commercial.receipts.reduce((sum, receipt) => sum + receipt.amount, 0),
                  contractPercent: current.commercial.contractValue > 0
                    ? current.commercial.receipts.reduce((sum, receipt) => sum + receipt.amount, 0) / current.commercial.contractValue * 100
                    : 0,
                  cumulativeCreditAmount: 0,
                  requiredRole: "Finance",
                  requestedBy: actor,
                  requestedAt: timestamp,
                  status: "Approved",
                  decidedBy: actor,
                  decidedByRole: role,
                  decidedAt: timestamp,
                  evidence: current.commercial.paymentRelease.evidence,
                  reason: "Invoice and verified receipt evidence satisfied the payment release gate.",
                },
              ],
            },
          }),
          {
            actor,
            actorRole: role,
            action: "RELEASE_PAYMENT_GATE",
            entityType: "PaymentRelease",
            entityId: operations.commercial.paymentRelease.id,
            summary: `Payment release authorized by ${role}.`,
          },
        );
        return undefined;
      },
      approveOperationsRequest: (requestId, actor, role, approve) => {
        const operations = normalizeProjectOperations(
          get().file.operations,
          get().file.graph.metadata.name,
        );
        const request = operations.approvals.requests.find((item) => item.id === requestId);
        if (!request) return "Approval request was not found.";
        if (request.status !== "Pending") return "Only a pending request can be decided.";
        if (!roleCanApprove(role, request.requiredRole, request.kind)) {
          return `${role} cannot decide a request requiring ${request.requiredRole}.`;
        }
        const timestamp = new Date().toISOString();
        get().updateOperations(
          (current) => ({
            ...current,
            approvals: {
              ...current.approvals,
              requests: current.approvals.requests.map((item) =>
                item.id === requestId
                  ? {
                      ...item,
                      status: approve ? "Approved" : "Rejected",
                      decidedBy: actor,
                      decidedByRole: role,
                      decidedAt: timestamp,
                    }
                  : item,
              ),
            },
          }),
          {
            actor,
            actorRole: role,
            action: approve ? "APPROVE_REQUEST" : "REJECT_REQUEST",
            entityType: "ApprovalRequest",
            entityId: requestId,
            summary: `${request.kind} ${request.reference || request.id} ${approve ? "approved" : "rejected"} by ${role}.`,
          },
        );
        return undefined;
      },
      convertClientRecord: ({
        sequence,
        actor,
        gateDecisionId,
        buildingCount = 1,
        modulesPerBuilding = 0,
      }) => {
        const current = normalizeProjectOperations(
          get().file.operations,
          get().file.graph.metadata.name,
        );
        try {
          const converted = convertClientToProject(
            current,
            sequence,
            actor,
            gateDecisionId,
            buildingCount,
            modulesPerBuilding,
          );
          get().updateOperations(() => converted);
          return converted.identity.projectNumber;
        } catch (error) {
          return error instanceof Error ? error.message : "Client-to-project conversion failed.";
        }
      },
      recalculateClassD: (actor, sourceRevision) => {
        const current = normalizeProjectOperations(
          get().file.operations,
          get().file.graph.metadata.name,
        );
        const amount = calculateClassD(current);
        const version = createEstimateVersion(
          current,
          "D",
          amount,
          actor,
          sourceRevision,
        );
        get().updateOperations(
          (operations) => ({
            ...operations,
            estimating: {
              ...operations.estimating,
              calculatedClassDAmount: amount,
              versions: [
                ...operations.estimating.versions.map((item) =>
                  item.estimateClass === "D" && item.status === "Draft"
                    ? { ...item, status: "Superseded" as const }
                    : item,
                ),
                version,
              ],
            },
          }),
          {
            actor,
            actorRole: "Estimator",
            action: "CALCULATE_CLASS_D",
            entityType: "EstimateVersion",
            entityId: version.id,
            summary: `Class D v${version.version} calculated at ${amount.toFixed(2)} ${current.commercial.currency}.`,
          },
        );
        return amount;
      },
      startWarranty: ({ dayZeroDate, durationMonths, owner, triggerEvidence, actor }) => {
        const current = normalizeProjectOperations(
          get().file.operations,
          get().file.graph.metadata.name,
        );
        try {
          const scheduled = scheduleWarranty(
            current,
            dayZeroDate,
            durationMonths,
            owner,
            triggerEvidence,
          );
          get().updateOperations(
            () => scheduled,
            {
              actor,
              actorRole: "Project Manager",
              action: "START_WARRANTY_DAY_ZERO",
              entityType: "Warranty",
              entityId: scheduled.identity.projectNumber || scheduled.identity.clientId,
              summary: `Warranty started ${dayZeroDate}; ${durationMonths} months with 30/60/90-day follow-ups.`,
            },
          );
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : "Warranty could not be started.";
        }
      },
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
