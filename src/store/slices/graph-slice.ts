"use client";

import { clone } from "@/lib/clone";
import { createDomainNode } from "@/lib/create-domain-node";
import { ensureEstimationWorkflow } from "@/lib/estimation-workflow";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { jobNumberFromProjectName, withSyncedJobNumber } from "@/lib/project-id";
import { releaseConditionBlocker } from "@/lib/workflow-progress";
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
import { appendHistory } from "@/store/workflow-persist";
import type { NodeLayout, WorkflowFile } from "@/types/workflow";
import {
  broadcastIfLocal,
  textEditKey,
  findAvailableNodePosition,
} from "@/store/workflow-store-helpers";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

// Consecutive keystrokes in one text field merge into a single undo step.
let lastTextEdit: { key: string; at: number; file: WorkflowFile } | undefined;

export type GraphSlice = Pick<
  WorkflowState,
  | "clearDetailedNodes"
  | "addNode"
  | "addPhaseWrappingNodes"
  | "addGateUnderNode"
  | "toggleNodeInPhase"
  | "fitPhaseToChildren"
  | "updateNode"
  | "deleteNodes"
  | "deleteSelected"
  | "addEdge"
  | "updateEdge"
  | "duplicateSelected"
  | "groupSelected"
  | "updateLayout"
  | "updateLayouts"
  | "recordLayoutHistory"
  | "commitLayoutDrag"
  | "setViewport"
>;

/** L2 detailed workflow: nodes, phases, edges and canvas layout. */
export const PREVIOUS_DEPARTMENT_TITLE = "Finish the previous department first";

const LEGACY_DOCUMENT_FIELDS = new Set([
  "legalDocuments",
  "customerDocuments",
  "supportingDocuments",
]);

/** Returns condition keys whose customFields file checklist gained at least one newly ticked item. */
function tickedDocumentConditionKeys(
  current: Record<string, string | number | boolean> | undefined,
  next: Record<string, string | number | boolean> | undefined,
  firstConditionKey: string | number = 0,
): Array<string | number> {
  if (!next) return [];
  const ticked = (raw: unknown) => {
    if (typeof raw !== "string" || !raw.startsWith("[")) return new Set<string>();
    try {
      const list = JSON.parse(raw) as Array<{ id?: string; checked?: boolean }>;
      return new Set(
        Array.isArray(list)
          ? list.filter((doc) => doc?.checked === true).map((doc, i) => doc.id ?? String(i))
          : [],
      );
    } catch {
      return new Set<string>();
    }
  };
  const keys: Array<string | number> = [];
  for (const [key, value] of Object.entries(next)) {
    if (current?.[key] === value) continue;
    const markerIndex = key.indexOf("::release-condition::");
    const isConditionDocs = markerIndex >= 0;
    const isLegacyDocs = LEGACY_DOCUMENT_FIELDS.has(key);
    if (!isConditionDocs && !isLegacyDocs) continue;
    const before = ticked(current?.[key]);
    if ([...ticked(value)].some((id) => !before.has(id))) {
      keys.push(
        isConditionDocs
          ? key.slice(markerIndex + "::release-condition::".length)
          : firstConditionKey,
      );
    }
  }
  return keys;
}

export function createGraphSlice(set: StoreSet, get: StoreGet): GraphSlice {
  return {
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
    addNode: (type, position, parentId) => {
      /**
       * A Qualification step goes at the far left of the flow: to the left of
       * Project Start, outside any Phase frame, connected into it.
       */
      const placeQualificationFirst = (id: string) => {
        const file = get().file;
        const start = file.graph.nodes.find((node) => node.type === "projectStart");
        if (!start || file.graph.edges.some((edge) => edge.target === start.id)) return;
        let x = 0;
        let y = 0;
        for (
          let layout: (typeof file.layout.nodes)[string] | undefined = file.layout.nodes[start.id];
          layout;
        ) {
          x += layout.x;
          y += layout.y;
          layout = layout.parentId ? file.layout.nodes[layout.parentId] : undefined;
        }
        const own = file.layout.nodes[id];
        const width = own?.width ?? 1000;
        get().commitTransient((current) => {
          current.layout.nodes[id] = {
            ...current.layout.nodes[id],
            nodeId: id,
            x: x - width - 160,
            y,
            parentId: undefined,
          };
          return addOrReplaceEdge(current, {
            id: `edge-${crypto.randomUUID().slice(0, 8)}`,
            source: id,
            target: start.id,
            sourceHandle: "out",
            targetHandle: "in",
            type: "normal",
            label: "",
            lineStyle: "solid",
            arrowStyle: "closed",
            customFields: {},
          });
        });
      };
      // These are canonical/retired lifecycle surfaces, not user-addable
      // palette nodes. Keep the guard for stale drag/command events from
      // older sessions after their palette entries have been removed.
      if (type === "approvalMatrix" || type === "responsibilityLane") {
        return "";
      }
      if (type === "qualification") {
        const existing = get().file.graph.nodes.find((node) => node.type === "qualification");
        if (existing) {
          set({ selection: { nodeIds: [existing.id] } });
          return existing.id;
        }
      }
      if (type === "estimation") {
        const existing = get().file.graph.nodes.find((node) => node.type === "estimation");
        if (existing) {
          set({ selection: { nodeIds: [existing.id] } });
          return existing.id;
        }
      }
      if (type === "commercialRule") {
        const existing = get().file.graph.nodes.find(
          (node) =>
            node.id === "commercial-route-group" || node.config.commercialRouteGroup === true,
        );
        if (existing) {
          set({ selection: { nodeIds: [existing.id] } });
          return existing.id;
        }
      }
      if (type === "projectStart") {
        const existing = get().file.graph.nodes.find((node) => node.type === "projectStart");
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
      let node = createDomainNode(type, id);
      if (type === "projectStart") {
        const titleDigits = jobNumberFromProjectName(get().file.graph.metadata.name);
        if (titleDigits) node = withSyncedJobNumber(node, titleDigits);
      }
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
      if (type === "qualification") placeQualificationFirst(id);
      if (type === "qualification" || type === "estimation" || type === "commercialRule") {
        get().commitTransient((current) =>
          ensureEstimationWorkflow(current, type === "estimation" ? id : undefined),
        );
      }
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
    addPhaseWrappingNodes: (phaseProps, childIds) => {
      const id = `phase-${crypto.randomUUID().slice(0, 8)}`;
      const phaseNode = createDomainNode("phase", id);
      phaseNode.title = phaseProps.title || "Phase";
      phaseNode.color = phaseProps.color || "#0d9488";
      if (phaseNode.config) {
        phaseNode.config.stage = phaseProps.title;
      }

      set((state) => {
        const nextFile = clone(state.file);
        nextFile.graph.nodes.push(phaseNode);
        nextFile.layout.nodes[id] = {
          nodeId: id,
          x: phaseProps.x,
          y: phaseProps.y,
          width: phaseProps.width,
          height: phaseProps.height,
          zIndex: -1,
        };

        for (const childId of childIds) {
          const childLayout = nextFile.layout.nodes[childId];
          if (childLayout) {
            childLayout.parentId = id;
          }
        }

        if (nextFile.highLevel) {
          const matchedL1 = nextFile.highLevel.graph.nodes.find(
            (hl) => hl.title.trim().toLowerCase() === phaseProps.title.trim().toLowerCase(),
          );
          if (matchedL1) {
            matchedL1.linkedLayer2NodeIds = Array.from(
              new Set([...(matchedL1.linkedLayer2NodeIds || []), id, ...childIds]),
            );
          }
        }

        return {
          past: appendHistory(state.past, state.file),
          file: nextFile,
          future: [],
          dirty: true,
          selection: { nodeIds: [id] },
        };
      });
      return id;
    },
    addGateUnderNode: (gateProps) => {
      const id = `gate-${crypto.randomUUID().slice(0, 8)}`;
      const gateNode = createDomainNode("gate", id);
      gateNode.title = gateProps.title || "Gate";
      if (gateProps.color) {
        gateNode.color = gateProps.color;
        if (gateNode.config) {
          gateNode.config.gateHeaderColor = gateProps.color;
        }
      }
      if (gateProps.stage && gateNode.config) {
        gateNode.config.stage = gateProps.stage;
      }
      const width = gateProps.width || 620;
      const height = gateProps.height || 260;

      set((state) => {
        const nextFile = clone(state.file);
        nextFile.graph.nodes.push(gateNode);
        nextFile.layout.nodes[id] = {
          nodeId: id,
          x: gateProps.x,
          y: gateProps.y,
          width,
          height,
          zIndex: -1,
        };
        return {
          past: appendHistory(state.past, state.file),
          file: nextFile,
          future: [],
          dirty: true,
          selection: { nodeIds: [id] },
        };
      });
      return id;
    },
    toggleNodeInPhase: (phaseId, nodeId) => {
      const state = get();
      const file = state.file;
      const phaseLayout = file.layout.nodes[phaseId];
      const nodeLayout = file.layout.nodes[nodeId];
      if (!phaseLayout || !nodeLayout) return;

      const isCurrentlyInside = nodeLayout.parentId === phaseId;
      const nextFile = clone(file);

      const containerNode = file.graph.nodes.find((n) => n.id === phaseId);
      const isGate = containerNode?.type === "gate";

      if (isCurrentlyInside) {
        nextFile.layout.nodes[nodeId] = {
          ...nodeLayout,
          parentId: isGate && phaseLayout.parentId ? phaseLayout.parentId : undefined,
        };
        if (isGate) {
          const remainingInGate = Object.values(nextFile.layout.nodes).filter(
            (l) => l.parentId === phaseId && l.nodeId !== nodeId,
          );
          if (remainingInGate.length === 0) {
            nextFile.layout.nodes[phaseId] = {
              ...nextFile.layout.nodes[phaseId],
              parentId: undefined,
            };
          }
        }
      } else {
        const previousParentId = nodeLayout.parentId;
        if (isGate) {
          const currentGateParentId = phaseLayout.parentId;
          if (
            currentGateParentId &&
            previousParentId &&
            previousParentId !== phaseId &&
            previousParentId !== currentGateParentId
          ) {
            // Strictly disallow cross-phase selection!
            return;
          }
          if (previousParentId && previousParentId !== phaseId) {
            const previousParentNode = file.graph.nodes.find((n) => n.id === previousParentId);
            if (previousParentNode?.type === "phase") {
              nextFile.layout.nodes[phaseId] = {
                ...nextFile.layout.nodes[phaseId],
                parentId: previousParentId,
              };
            }
          }
        }
        nextFile.layout.nodes[nodeId] = {
          ...nodeLayout,
          parentId: phaseId,
        };
      }

      const fitContainer = (targetContainerId: string) => {
        const targetLayout = nextFile.layout.nodes[targetContainerId];
        if (!targetLayout) return;
        const targetDomain = nextFile.graph.nodes.find((n) => n.id === targetContainerId);
        const isTargetPhase = targetDomain?.type === "phase";

        const members = Object.values(nextFile.layout.nodes).filter((l) => {
          if (l.parentId === targetContainerId) return true;
          if (l.parentId && nextFile.layout.nodes[l.parentId]?.parentId === targetContainerId)
            return true;
          return false;
        });
        if (members.length === 0) return;

        const nodeMap = new Map(nextFile.graph.nodes.map((n) => [n.id, n]));
        const minX = Math.min(
          ...members.map((m) => {
            const domain = nodeMap.get(m.nodeId);
            if (domain?.type === "gate" && nextFile.layout.nodes[m.nodeId]) {
              return nextFile.layout.nodes[m.nodeId].x;
            }
            return m.x;
          }),
        );
        const maxX = Math.max(
          ...members.map((m) => {
            const domain = nodeMap.get(m.nodeId);
            if (domain?.type === "gate" && nextFile.layout.nodes[m.nodeId]) {
              return (
                nextFile.layout.nodes[m.nodeId].x + (nextFile.layout.nodes[m.nodeId].width || 340)
              );
            }
            const w = m.width || (domain ? getAdaptiveNodeSize(domain, m).width : 280);
            return m.x + w;
          }),
        );
        const minY = Math.min(...members.map((m) => m.y));
        const maxMemberBottom = Math.max(
          ...members.map((m) => {
            const domain = nodeMap.get(m.nodeId);
            if (domain?.type === "gate" && nextFile.layout.nodes[m.nodeId]) {
              return (
                (nextFile.layout.nodes[m.nodeId].y ?? m.y) +
                (nextFile.layout.nodes[m.nodeId].height || 360)
              );
            }
            const h = m.height || (domain ? getAdaptiveNodeSize(domain, m).height : 360);
            return m.y + h;
          }),
        );

        const containsGate = members.some((m) => nodeMap.get(m.nodeId)?.type === "gate");
        const padX = isTargetPhase ? 36 : 24;
        const padTop = isTargetPhase ? (containsGate ? 360 : 180) : 200;
        const padBottom = isTargetPhase ? (containsGate ? 40 : 48) : 44;
        const cY = minY - padTop;
        const cBottom = maxMemberBottom + padBottom;

        nextFile.layout.nodes[targetContainerId] = {
          ...nextFile.layout.nodes[targetContainerId],
          x: minX - padX,
          y: cY,
          width: Math.max(isTargetPhase ? 380 : 340, maxX - minX + padX * 2),
          height: Math.max(isTargetPhase ? 280 : 240, cBottom - cY),
          zIndex: isTargetPhase ? 0 : 1,
        };
      };

      fitContainer(phaseId);
      if (nextFile.layout.nodes[phaseId]?.parentId) {
        fitContainer(nextFile.layout.nodes[phaseId].parentId!);
      }

      set({
        past: appendHistory(state.past, state.file),
        file: nextFile,
        future: [],
        dirty: true,
      });
    },
    fitPhaseToChildren: (phaseId) => {
      const state = get();
      const file = state.file;
      const phaseLayout = file.layout.nodes[phaseId];
      if (!phaseLayout) return;

      const memberNodes = Object.values(file.layout.nodes).filter((l) => {
        if (l.parentId === phaseId) return true;
        if (l.parentId && file.layout.nodes[l.parentId]?.parentId === phaseId) return true;
        return false;
      });
      if (memberNodes.length === 0) return;

      const nodeMap = new Map(file.graph.nodes.map((n) => [n.id, n]));
      const minX = Math.min(
        ...memberNodes.map((m) => {
          const domain = nodeMap.get(m.nodeId);
          if (domain?.type === "gate" && file.layout.nodes[m.nodeId]) {
            return file.layout.nodes[m.nodeId].x;
          }
          return m.x;
        }),
      );
      const maxX = Math.max(
        ...memberNodes.map((m) => {
          const domain = nodeMap.get(m.nodeId);
          if (domain?.type === "gate" && file.layout.nodes[m.nodeId]) {
            return file.layout.nodes[m.nodeId].x + (file.layout.nodes[m.nodeId].width || 340);
          }
          const w = m.width || (domain ? getAdaptiveNodeSize(domain, m).width : 280);
          return m.x + w;
        }),
      );
      const minY = Math.min(...memberNodes.map((m) => m.y));
      const maxMemberBottom = Math.max(
        ...memberNodes.map((m) => {
          const domain = nodeMap.get(m.nodeId);
          if (domain?.type === "gate" && file.layout.nodes[m.nodeId]) {
            return (
              (file.layout.nodes[m.nodeId].y ?? m.y) + (file.layout.nodes[m.nodeId].height || 360)
            );
          }
          const h = m.height || (domain ? getAdaptiveNodeSize(domain, m).height : 360);
          return m.y + h;
        }),
      );

      const containsGate = memberNodes.some((m) => nodeMap.get(m.nodeId)?.type === "gate");
      const isPhase = file.graph.nodes.find((n) => n.id === phaseId)?.type === "phase";
      const PAD_X = isPhase ? 36 : 24;
      const PAD_TOP = isPhase ? (containsGate ? 360 : 180) : 200;
      const phaseY = minY - PAD_TOP;
      const phaseBottom = maxMemberBottom + (containsGate ? 40 : 48);

      const nextFile = clone(file);
      nextFile.layout.nodes[phaseId] = {
        ...phaseLayout,
        x: minX - PAD_X,
        y: phaseY,
        width: Math.max(380, maxX - minX + PAD_X * 2),
        height: Math.max(280, phaseBottom - phaseY),
        zIndex: 0,
      };

      set({
        past: appendHistory(state.past, state.file),
        file: nextFile,
        future: [],
        dirty: true,
      });
    },
    updateNode: (id, patch) => {
      const currentFile = get().file;
      const currentNode = currentFile.graph.nodes.find((item) => item.id === id);
      const conditionBlocker = (() => {
        if (!currentNode) return undefined;
        for (const [index, condition] of (patch.conditions ?? []).entries()) {
          const prev =
            (condition.id
              ? currentNode.conditions.find((item) => item.id === condition.id)
              : undefined) ?? currentNode.conditions[index];
          if (condition.checked && !prev?.checked) {
            const blocked = releaseConditionBlocker(currentFile, id, condition.id || index);
            if (blocked) return blocked;
          }
        }
        const firstConditionKey = currentNode.conditions[0]?.id || 0;
        for (const conditionKey of tickedDocumentConditionKeys(
          currentNode.customFields,
          patch.customFields,
          firstConditionKey,
        )) {
          const blocked = releaseConditionBlocker(currentFile, id, conditionKey);
          if (blocked) return blocked;
        }
        return undefined;
      })();
      if (conditionBlocker) {
        set({ deleteBlocked: { ...conditionBlocker, items: [] } });
        return;
      }
      set((state) => {
        const node = state.file.graph.nodes.find((item) => item.id === id);
        if (!node) return state;
        const key = textEditKey(node, patch);
        const now = Date.now();
        const group = Boolean(
          key &&
          lastTextEdit?.key === key &&
          lastTextEdit.file === state.file &&
          now - lastTextEdit.at < 1200,
        );
        const file = patchNode(state.file, id, patch);
        lastTextEdit = key ? { key, at: now, file } : undefined;
        return {
          file,
          past: group ? state.past : appendHistory(state.past, state.file),
          future: [],
          dirty: true,
        };
      });
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
    addEdge: (edge) => {
      get().commit((file) => addOrReplaceEdge(file, edge));
      broadcastIfLocal((senderId) => ({
        type: "ADD_EDGE",
        senderId,
        edge,
        timestamp: Date.now(),
      }));
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
            edges: file.graph.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge)),
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
        (id) => get().file.graph.nodes.find((node) => node.id === id)?.type !== "projectStart",
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
        let positionChanged = false;
        const movedIds = new Set<string>();
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
            positionChanged ||= next.x !== current.x || next.y !== current.y;
            if (next.x !== current.x || next.y !== current.y) movedIds.add(id);
          }
        }
        return changed
          ? {
              dirty: state.dirty || positionChanged,
              file: {
                ...state.file,
                layout: {
                  ...state.file.layout,
                  nodes,
                  edges: positionChanged
                    ? Object.fromEntries(
                        Object.entries(state.file.layout.edges ?? {}).map(([id, route]) => {
                          const edge = state.file.graph.edges.find((item) => item.id === id);
                          return [
                            id,
                            edge && (movedIds.has(edge.source) || movedIds.has(edge.target))
                              ? { ...route, points: [] }
                              : route,
                          ];
                        }),
                      )
                    : state.file.layout.edges,
                },
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
  };
}
