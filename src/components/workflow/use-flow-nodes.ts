"use client";

import { useCallback, useMemo, useState } from "react";
import type { Node, NodeChange } from "@xyflow/react";

/**
 * Bridges the workflow-store's node model with React Flow's node rendering.
 * Purely derives React Flow nodes from modelNodes, tracking only active
 * position displacements during user dragging.
 * Zero internal setState loops, zero useEffect.
 */
export function useFlowNodes(modelNodes: Node[]) {
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter(
      (change): change is Extract<NodeChange, { type: "position" }> =>
        change.type === "position" && Boolean(change.position),
    );
    if (positionChanges.length === 0) return;

    setDragPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const change of positionChanges) {
        if (change.dragging && change.position) {
          next[change.id] = change.position;
          changed = true;
        } else if (change.dragging === false) {
          if (next[change.id]) {
            delete next[change.id];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const nodes = useMemo(() => {
    if (Object.keys(dragPositions).length === 0) return modelNodes;
    return modelNodes.map((node) => {
      const draggedPos = dragPositions[node.id];
      if (draggedPos) {
        return {
          ...node,
          position: draggedPos,
          dragging: true,
        };
      }
      return node;
    });
  }, [modelNodes, dragPositions]);

  return { nodes, setNodes: () => {}, onNodesChange };
}