"use client";

import { normalizePreviousPhaseDependencies } from "@/lib/process-dependencies";
import { clone } from "@/lib/clone";
import { syncFinalCloseCompletion } from "@/lib/fob-yard";
import {
  autoArrangeHighLevel,
  createHighLevelNode,
  reorderLinkedWorkflowNodes,
  reorderLinkedWorkflowGate,
  setLinkedWorkflowGateMember,
  validateHighLevelWorkflow,
} from "@/lib/high-level-workflow";
import { appendHistory } from "@/store/workflow-persist";
import { normalizeHighLevelLayer2Links } from "@/store/workflow-store-helpers";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

export type HighLevelSlice = Pick<
  WorkflowState,
  | "highLevelSelection"
  | "selectHighLevelNodes"
  | "selectHighLevelEdge"
  | "clearHighLevelNodes"
  | "setHighLevelViewport"
  | "addHighLevelNode"
  | "updateHighLevelNode"
  | "reorderHighLevelLinkedNodes"
  | "reorderHighLevelLinkedGate"
  | "setHighLevelGateMember"
  | "deleteHighLevelNodes"
  | "addHighLevelEdge"
  | "deleteHighLevelEdge"
  | "commitHighLevelLayoutDrag"
  | "autoArrangeHighLevel"
  | "validateHighLevel"
>;

/** L1 high-level process: phases, links to L2 and its own canvas. */
export function createHighLevelSlice(set: StoreSet, get: StoreGet): HighLevelSlice {
  return {
    highLevelSelection: { nodeIds: [] },
    selectHighLevelNodes: (nodeIds) =>
      set((state) => {
        const current = state.highLevelSelection;
        const selectionUnchanged =
          current.edgeId === undefined &&
          current.nodeIds.length === nodeIds.length &&
          current.nodeIds.every((id, index) => id === nodeIds[index]);
        if (nodeIds.length > 0) {
          if (selectionUnchanged && state.rightOpen) return state;
          return {
            ...(selectionUnchanged ? {} : { highLevelSelection: { nodeIds, edgeId: undefined } }),
            rightOpen: true,
          };
        }
        if (selectionUnchanged) return state;
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
      // Only one Start and one Final Close; another copy is added as a Phase so
      // it keeps both connection points.
      if (
        (type === "start" || type === "end") &&
        get().file.highLevel?.graph.nodes.some((node) => node.type === type)
      )
        type = "phase";
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
                state.file.graph.nodes,
              ),
              linkedDetailedNodeIds: normalizeHighLevelLayer2Links(
                highLevel,
                id,
                patch.linkedLayer2NodeIds,
                state.file.graph.nodes,
              ),
            }
          : patch;
        return {
          past: appendHistory(state.past, state.file),
          file: syncFinalCloseCompletion(
            normalizePreviousPhaseDependencies({
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
            }),
          ),
          future: [],
          dirty: true,
        };
      }),
    reorderHighLevelLinkedNodes: (highLevelNodeId, draggedNodeId, targetNodeId) =>
      set((state) => {
        const nextFile = reorderLinkedWorkflowNodes(
          state.file,
          highLevelNodeId,
          draggedNodeId,
          targetNodeId,
        );
        if (nextFile === state.file) return state;
        return {
          past: appendHistory(state.past, state.file),
          file: nextFile,
          future: [],
          dirty: true,
        };
      }),
    reorderHighLevelLinkedGate: (highLevelNodeId, gateId, targetNodeId, position) =>
      set((state) => {
        const nextFile = reorderLinkedWorkflowGate(
          state.file,
          highLevelNodeId,
          gateId,
          targetNodeId,
          position,
        );
        if (nextFile === state.file) return state;
        return {
          past: appendHistory(state.past, state.file),
          file: nextFile,
          future: [],
          dirty: true,
        };
      }),
    setHighLevelGateMember: (highLevelNodeId, gateId, nodeId, included) =>
      set((state) => {
        const nextFile = setLinkedWorkflowGateMember(
          state.file,
          highLevelNodeId,
          gateId,
          nodeId,
          included,
        );
        if (nextFile === state.file) return state;
        return {
          past: appendHistory(state.past, state.file),
          file: nextFile,
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
                  Object.entries(highLevel.layout.nodes).filter(([id]) => !deleted.has(id)),
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
    validateHighLevel: () => {
      const issues = validateHighLevelWorkflow(get().file.highLevel);
      set({ issues, validationOpen: true });
    },
  };
}
