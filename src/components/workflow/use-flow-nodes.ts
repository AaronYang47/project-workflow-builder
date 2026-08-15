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
  return model.map((node) => {
    const local = currentById.get(node.id);
    if (!local) return node;
    return {
      ...node,
      position: local.dragging ? local.position : node.position,
      dragging: local.dragging,
      measured: local.measured,
      selected: node.type === "phase" ? false : node.selected,
    };
  });
}

/**
 * Bridges the workflow-store's node model with React Flow's controlled
 * `nodes` array. Keeps a local copy so `onNodesChange` can apply position
 * and selection updates synchronously (xyflow won't move nodes unless we
 * feed the resulting state back through the `nodes` prop).
 */
export function useFlowNodes(modelNodes: Node[]) {
  const [nodes, setNodes] = useState<Node[]>(modelNodes);
  // Keep the local RF node list in sync with model changes from the store.
  // Setting state inside an effect is required here: the model is updated
  // outside of React (by zustand) and we need to preserve local interaction
  // state (drag position, measured size) across model changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => mergeFlowNodes(modelNodes, current));
  }, [modelNodes]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      return next.map((node) =>
        node.type === "phase" && node.selected
          ? { ...node, selected: false }
          : node,
      );
    });
  }, []);
  return { nodes, setNodes, onNodesChange };
}