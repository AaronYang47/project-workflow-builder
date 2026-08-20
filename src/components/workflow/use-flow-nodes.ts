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
 * Bridges the workflow-store's node model with React Flow's node rendering.
 * All positions, sizes, and selections are owned by the Zustand store (file.layout.nodes & selection),
 * ensuring zero internal setState loops.
 */
export function useFlowNodes(modelNodes: Node[]) {
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Selection and deletions are handled by onSelectionChange and onNodesDelete in ReactFlow.
    // Node dragging commit is handled by onNodeDragStop -> commitLayoutDrag.
  }, []);

  return { nodes: modelNodes, setNodes: () => {}, onNodesChange };
}