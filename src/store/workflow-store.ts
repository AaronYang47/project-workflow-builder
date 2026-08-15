"use client";

import { create } from "zustand";
import {
  persist,
  type PersistStorage,
  type StorageValue,
} from "zustand/middleware";
import { DEMO_WORKFLOW } from "@/lib/demo";
import { getNodeDefinition } from "@/lib/node-catalog";
import { createProjectWorkflow } from "@/lib/project-template";
import { validateWorkflow } from "@/lib/validation";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { migrateWorkflowFile } from "@/lib/workflow-migration";
import type {
  DomainEdge,
  DomainNode,
  NodeLayout,
  ValidationIssue,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const HISTORY_LIMIT = 12;
const LOCAL_SAVE_DELAY = 600;
let localSaveTimer: ReturnType<typeof setTimeout> | undefined;
let pageHideListenerAdded = false;
const pendingLocalWrites = new Map<string, StorageValue<unknown>>();
const flushLocalWrites = () => {
  if (typeof window === "undefined") return;
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = undefined;
  for (const [key, value] of pendingLocalWrites) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Cloud save remains authoritative when browser storage is unavailable
      // or full. Never let a storage quota error crash the editor tab.
    }
  }
  pendingLocalWrites.clear();
};
const debouncedJSONStorage = <T,>(): PersistStorage<T> => {
  if (typeof window !== "undefined" && !pageHideListenerAdded) {
    window.addEventListener("pagehide", flushLocalWrites);
    pageHideListenerAdded = true;
  }
  return {
    getItem: (key) => {
      const pending = pendingLocalWrites.get(key);
      if (pending) return pending as StorageValue<T>;
      if (typeof window === "undefined") return null;
      try {
        const stored = localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as StorageValue<T>) : null;
      } catch {
        localStorage.removeItem(key);
        return null;
      }
    },
    setItem: (key, value) => {
      if (typeof window === "undefined") return;
      pendingLocalWrites.set(key, value as StorageValue<unknown>);
      if (localSaveTimer) clearTimeout(localSaveTimer);
      localSaveTimer = setTimeout(flushLocalWrites, LOCAL_SAVE_DELAY);
    },
    removeItem: (key) => {
      pendingLocalWrites.delete(key);
      if (typeof window === "undefined") return;
      localStorage.removeItem(key);
    },
  };
};
const appendHistory = (past: Snapshot[], snapshot: Snapshot) => [
  ...past.slice(-(HISTORY_LIMIT - 1)),
  snapshot,
];
const referenceDefaults: Partial<
  Record<WorkflowNodeType, DomainNode["config"]["reference"]>
> = {
  terminal: {},
};
function createDomainNode(type: WorkflowNodeType, id: string): DomainNode {
  const def = getNodeDefinition(type);
  const gate = type === "gate";
  const projectStart = type === "projectStart";
  return {
    id,
    type,
    title: gate ? "Gate review" : def.label,
    description: gate
      ? "Review the work item before approval"
      : projectStart
        ? "Start the project and establish its project record."
      : def.description,
    color: def.color,
    metadata: {},
    conditions: projectStart
      ? [{ id: "project-id-required", label: "Project ID is entered", required: true, checked: false, locked: true }]
      : [],
    documents: [],
    criteria: [],
    customFields: projectStart
      ? {
          projectId: "",
          legacyJobNumber: "",
          nodeUuid: crypto.randomUUID(),
        }
      : {},
    config: projectStart
      ? { serviceType: "Standard", buildingCode: "", moduleCode: "" }
      : gate
        ? {
          gateLabel: "DECISION",
          decisionMode: "binary",
          gateIconKey: "check",
          gateHeaderColor: "#2563a9",
          gateTitleColor: "#ffffff",
          conditionsTitle: "Approval conditions",
          conditionsSubtitle: "requirements complete",
          checklistTitle: "Conditions checklist",
          checklistHint: "Every applicable required document must be complete",
          conditionLabel: "Condition",
          addConditionLabel: "Add condition",
          documentsLabel: "All applicable required documents",
          addDocumentLabel: "Add document",
          decisionTitle: "Decision",
          decisionSubtitle: "Approval routing",
          departmentLabel: "Department",
          approverLabel: "Approved by",
          detailsNeededLabel: "Details needed",
          outcomes: [
            {
              id: "yes",
              label: "YES",
              edgeType: "success",
              color: "#16866f",
              enabled: true,
            },
            {
              id: "no",
              label: "NO",
              edgeType: "failure",
              color: "#b34a47",
              enabled: true,
            },
          ],
          gateRules: [
            {
              id: `rule-${crypto.randomUUID().slice(0, 6)}`,
              label: "Enter required condition",
              checked: false,
              requirementType: "Required",
              applicable: true,
              signatures: [],
            },
          ],
          approvedDepartment: "",
          approvedBy: "",
        }
      : type === "phase"
        ? { locked: false }
        : referenceDefaults[type]
          ? { reference: clone(referenceDefaults[type]!) }
          : { stage: "Stage", iconKey: "activity" },
  };
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
        const size = getAdaptiveNodeSize(node);
        get().commit((file) => ({
          ...file,
          graph: { ...file.graph, nodes: [...file.graph.nodes, node] },
          layout: {
            ...file.layout,
            nodes: {
              ...file.layout.nodes,
              [id]: {
                nodeId: id,
                ...position,
                width: size.width,
                height: size.height,
                parentId,
                zIndex: parentId ? 1 : undefined,
              },
            },
          },
        }));
        set({ selection: { nodeIds: [id] } });
        return id;
      },
      updateNode: (id, patch) =>
        get().commit((file) => {
          const current = file.graph.nodes.find((node) => node.id === id);
          if (!current) return file;
          const next = { ...current, ...patch };
          const layout = file.layout.nodes[id];
          const preferred = getAdaptiveNodeSize(next, layout);
          const nextSize =
            next.type === "gate"
              ? preferred
              : {
                  width: Math.max(layout?.width || 0, preferred.width),
                  height: Math.max(layout?.height || 0, preferred.height),
                };
          return {
            ...file,
            graph: {
              ...file.graph,
              nodes: file.graph.nodes.map((node) =>
                node.id === id ? next : node,
              ),
            },
            layout: layout
              ? {
                  ...file.layout,
                  nodes: {
                    ...file.layout.nodes,
                    [id]: {
                      ...layout,
                      width: nextSize.width,
                      height: nextSize.height,
                    },
                  },
                }
              : file.layout,
          };
        }),
      deleteNodes: (ids) => {
        if (!ids.length) return;
        const currentFile = get().file;
        const nodeSet = new Set(ids);
        const allProjectStarts = currentFile.graph.nodes.filter(
          (node) => node.type === "projectStart",
        );
        const projectStarts = allProjectStarts.filter(
          (node) => nodeSet.has(node.id) && node.type === "projectStart",
        );
        if (
          projectStarts.length &&
          allProjectStarts.length - projectStarts.length < 1
        ) {
          set({
            deleteBlocked: {
              title: "Unable to delete Project Start",
              message: "Every project must begin with Project Start.",
              items: projectStarts.map((node) => node.title),
            },
          });
          return;
        }
        const occupiedPhases = currentFile.graph.nodes
          .filter((node) => nodeSet.has(node.id) && node.type === "phase")
          .map((phase) => ({
            phase,
            children: currentFile.graph.nodes.filter(
              (node) =>
                currentFile.layout.nodes[node.id]?.parentId === phase.id &&
                !nodeSet.has(node.id),
            ),
          }))
          .filter((entry) => entry.children.length);
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
        get().commit((file) => {
          const layouts = { ...file.layout.nodes };
          ids.forEach((id) => {
            const deletedLayout = layouts[id];
            if (deletedLayout) {
              Object.values(layouts).forEach((layout) => {
                if (layout.parentId !== id || nodeSet.has(layout.nodeId))
                  return;
                layout.x += deletedLayout.x;
                layout.y += deletedLayout.y;
                layout.parentId = undefined;
                layout.zIndex = undefined;
              });
            }
            delete layouts[id];
          });
          return {
            ...file,
            graph: {
              ...file.graph,
              nodes: file.graph.nodes.filter((node) => !nodeSet.has(node.id)),
              edges: file.graph.edges.filter(
                (edge) =>
                  !nodeSet.has(edge.source) && !nodeSet.has(edge.target),
              ),
            },
            layout: { ...file.layout, nodes: layouts },
          };
        });
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
      addEdge: (edge) =>
        get().file.graph.nodes.find((node) => node.id === edge.target)?.type ===
        "projectStart"
          ? set({
              deleteBlocked: {
                title: "Invalid connection",
                message: "Project Start must be the first node.",
                items: ["Connect from Project Start to the next node instead."],
              },
            })
          : get().commit((file) => ({
              ...file,
              graph: {
                ...file.graph,
                edges: [
                  ...file.graph.edges.filter(
                    (existing) =>
                      existing.source !== edge.source ||
                      existing.sourceHandle !== edge.sourceHandle,
                  ),
                  edge,
                ],
              },
            })),
      updateEdge: (id, patch) =>
        get().commit((file) => ({
          ...file,
          graph: {
            ...file.graph,
            edges: file.graph.edges.map((edge) =>
              edge.id === id ? { ...edge, ...patch } : edge,
            ),
          },
        })),
      duplicateSelected: () => {
        const ids = get().selection.nodeIds.filter(
          (id) =>
            get().file.graph.nodes.find((node) => node.id === id)?.type !==
            "projectStart",
        );
        if (!ids.length) return;
        const created: string[] = [];
        get().commit((file) => {
          const nodes = [...file.graph.nodes];
          const layouts = { ...file.layout.nodes };
          ids.forEach((id) => {
            const source = file.graph.nodes.find((node) => node.id === id);
            if (!source) return;
            const nextId = `${source.type}-${crypto.randomUUID().slice(0, 8)}`;
            created.push(nextId);
            nodes.push({
              ...clone(source),
              id: nextId,
              title: `${source.title} copy`,
            });
            const old = layouts[id];
            layouts[nextId] = {
              ...old,
              nodeId: nextId,
              x: old.x + 32,
              y: old.y + 32,
            };
          });
          return {
            ...file,
            graph: { ...file.graph, nodes },
            layout: { ...file.layout, nodes: layouts },
          };
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
        get().commit((file) => {
          const selectedLayouts = ids
            .map((id) => file.layout.nodes[id])
            .filter(Boolean);
          const minX = Math.min(...selectedLayouts.map((item) => item.x));
          const minY = Math.min(...selectedLayouts.map((item) => item.y));
          const maxX = Math.max(
            ...selectedLayouts.map((item) => item.x + item.width),
          );
          const maxY = Math.max(
            ...selectedLayouts.map((item) => item.y + item.height),
          );
          const group: DomainNode = {
            id: groupId,
            type: "phase",
            title: "New phase",
            description: "Grouped workflow stage",
            color: "#64748b",
            metadata: {},
            conditions: [],
            documents: [],
            criteria: [],
            customFields: {},
            config: {},
          };
          const nodes = [group, ...file.graph.nodes];
          const layouts = {
            ...file.layout.nodes,
            [groupId]: {
              nodeId: groupId,
              x: minX - 40,
              y: minY - 72,
              width: Math.max(420, maxX - minX + 80),
              height: Math.max(240, maxY - minY + 112),
              zIndex: -1,
            },
          };
          ids.forEach((id) => {
            const item = layouts[id];
            layouts[id] = {
              ...item,
              x: item.x - (minX - 40),
              y: item.y - (minY - 72),
              parentId: groupId,
              zIndex: 1,
            };
          });
          return {
            ...file,
            graph: { ...file.graph, nodes },
            layout: { ...file.layout, nodes: layouts },
          };
        });
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
      commitLayoutDrag: (patches, before) =>
        set((state) => {
          if (!Object.keys(before).length) return state;
          const snapshot = clone(state.file);
          snapshot.layout.nodes = {
            ...snapshot.layout.nodes,
            ...clone(before),
          };
          const nodes = { ...state.file.layout.nodes };
          for (const [id, patch] of Object.entries(patches))
            if (nodes[id]) nodes[id] = { ...nodes[id], ...patch };
          const moved = new Set(Object.keys(patches));
          const routes = state.file.layout.edges
            ? Object.fromEntries(
                Object.entries(state.file.layout.edges).map(
                  ([edgeId, route]) => {
                    const edge = state.file.graph.edges.find(
                      (item) => item.id === edgeId,
                    );
                    if (
                      !edge ||
                      (!moved.has(edge.source) && !moved.has(edge.target))
                    )
                      return [edgeId, route];
                    const sourceBefore = before[edge.source];
                    const targetBefore = before[edge.target];
                    const sourceAfter = nodes[edge.source];
                    const targetAfter = nodes[edge.target];
                    const sourceDelta =
                      sourceBefore && sourceAfter
                        ? {
                            x: sourceAfter.x - sourceBefore.x,
                            y: sourceAfter.y - sourceBefore.y,
                          }
                        : { x: 0, y: 0 };
                    const targetDelta =
                      targetBefore && targetAfter
                        ? {
                            x: targetAfter.x - targetBefore.x,
                            y: targetAfter.y - targetBefore.y,
                          }
                        : { x: 0, y: 0 };
                    const points = route.points.map((point, index, all) => {
                      if (
                        moved.has(edge.source) &&
                        moved.has(edge.target) &&
                        sourceDelta.x === targetDelta.x &&
                        sourceDelta.y === targetDelta.y
                      )
                        return {
                          x: point.x + sourceDelta.x,
                          y: point.y + sourceDelta.y,
                        };
                      if (moved.has(edge.source) && index <= 1)
                        return {
                          x: point.x + sourceDelta.x,
                          y: point.y + sourceDelta.y,
                        };
                      if (moved.has(edge.target) && index >= all.length - 2)
                        return {
                          x: point.x + targetDelta.x,
                          y: point.y + targetDelta.y,
                        };
                      return point;
                    });
                    return [edgeId, { ...route, points }];
                  },
                ),
              )
            : undefined;
          return {
            file: {
              ...state.file,
              layout: { ...state.file.layout, nodes, edges: routes },
            },
            past: appendHistory(state.past, snapshot),
            future: [],
            dirty: true,
          };
        }),
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
