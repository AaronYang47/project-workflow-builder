"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Node, NodeChange } from "@xyflow/react";

/**
 * Bridges the workflow-store's node model with React Flow's node rendering.
 * Purely derives React Flow nodes from modelNodes, tracking only active
 * position displacements during user dragging while preserving measured dimensions
 * so React Flow never hides nodes with visibility:hidden during drag.
 * Zero internal setState loops, zero useEffect.
 */
export function useFlowNodes<T extends Node = Node>(modelNodes: T[]) {
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [measuredDimensions, setMeasuredDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // 1. Capture measured dimensions so nodes never revert to unmeasured state during drag
    const dimensionChanges = changes.filter(
      (change): change is Extract<NodeChange, { type: "dimensions" }> =>
        change.type === "dimensions" && Boolean(change.dimensions),
    );
    if (dimensionChanges.length > 0) {
      setMeasuredDimensions((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const change of dimensionChanges) {
          if (change.dimensions) {
            next[change.id] = change.dimensions;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    // 2. Track position displacement
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
    return modelNodes.map((node) => {
      const draggedPos = dragPositions[node.id];
      const measured =
        measuredDimensions[node.id] ||
        (node as unknown as { measured?: { width: number; height: number } })
          .measured;
      if (!draggedPos && !measured) return node;

      return {
        ...node,
        ...(measured ? { measured } : {}),
        ...(draggedPos ? { position: draggedPos, dragging: true } : {}),
      };
    });
  }, [modelNodes, dragPositions, measuredDimensions]);

  return { nodes, onNodesChange };
}
