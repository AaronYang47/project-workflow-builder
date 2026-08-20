"use client";

import { useCallback, useEffect, useState } from "react";
import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";

/**
 * Merge the latest model nodes (from the workflow store) into the local
 * RF node list. Local `dragging` state and `measured` sizes win over the
 * model while the user is interacting; phases never auto-select.
 */
function mergeFlowNodes(model: Node[], current: Node[]): Node[] {
  if (!current.length) return model;
  const currentById = new Map(current.map((node) => [node.id, node]));
  let hasChange = model.length !== current.length;
  const merged = model.map((node) => {
    const local = currentById.get(node.id);
    if (!local) {
      hasChange = true;
      return node;
    }
    const position = local.dragging ? local.position : node.position;
    const selected = node.type === "phase" ? false : node.selected;
    const dataChanged =
      local.data?.domain !== node.data?.domain ||
      local.data?.reached !== node.data?.reached ||
      local.data?.emphasized !== node.data?.emphasized ||
      local.data?.dimmed !== node.data?.dimmed;
    if (
      position.x !== local.position.x ||
      position.y !== local.position.y ||
      local.selected !== selected ||
      local.dragging !== node.dragging ||
      dataChanged ||
      local.width !== node.width ||
      local.height !== node.height
    ) {
      hasChange = true;
    }
    return {
      ...node,
      position,
      dragging: local.dragging,
      measured: local.measured,
      selected,
    };
  });
  return hasChange ? merged : current;
}

/**
 * Bridges the workflow-store's node model with React Flow's controlled
 * `nodes` array. Maintains drag positions and measured sizes in a stable ref
 * without useEffect setState feedback loops.
 */
export function useFlowNodes(modelNodes: Node[]) {
  const [localInteractions, setLocalInteractions] = useState<
    Map<string, { position?: { x: number; y: number }; dragging?: boolean; measured?: Node["measured"] }>
  >(() => new Map());

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setLocalInteractions((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const current = next.get(change.id) || {};
          next.set(change.id, {
            ...current,
            position: change.position,
            dragging: change.dragging ?? current.dragging,
          });
          changed = true;
        } else if (change.type === "dimensions" && change.dimensions) {
          const current = next.get(change.id) || {};
          next.set(change.id, {
            ...current,
            measured: change.dimensions,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const nodes = modelNodes.map((node) => {
    const local = localInteractions.get(node.id);
    if (!local) return node;
    return {
      ...node,
      position: local.dragging && local.position ? local.position : node.position,
      dragging: local.dragging,
      measured: local.measured ?? node.measured,
      selected: node.type === "phase" ? false : node.selected,
    };
  });

  return { nodes, setNodes: () => {}, onNodesChange };
}