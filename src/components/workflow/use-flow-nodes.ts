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
    if (
      position.x !== local.position.x ||
      position.y !== local.position.y ||
      local.selected !== selected ||
      local.dragging !== node.dragging ||
      local.data !== node.data ||
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
 * `nodes` array. Keeps a local copy so `onNodesChange` can apply position
 * and selection updates synchronously (xyflow won't move nodes unless we
 * feed the resulting state back through the `nodes` prop).
 */
export function useFlowNodes(modelNodes: Node[]) {
  const [nodes, setNodes] = useState<Node[]>(modelNodes);
  useEffect(() => {
    setNodes((current) => {
      const next = mergeFlowNodes(modelNodes, current);
      return next === current ? current : next;
    });
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