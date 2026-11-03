"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Node, NodeChange } from "@xyflow/react";

/**
 * Bridges the workflow-store's node model with React Flow's node rendering.
 * Purely derives React Flow nodes from modelNodes, tracking only active
 * position displacements during user dragging while preserving measured dimensions
 * so React Flow never hides nodes with visibility:hidden during drag.
 * Pointer updates are coalesced to one React update per animation frame.
 */
export function useFlowNodes<T extends Node = Node>(modelNodes: T[]) {
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [measuredDimensions, setMeasuredDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const pendingPositions = useRef<Record<string, { x: number; y: number } | null>>({});
  const frame = useRef<number | null>(null);

  const flushPositions = useCallback(() => {
    frame.current = null;
    const pending = pendingPositions.current;
    pendingPositions.current = {};
    setDragPositions((prev) => {
      let next: typeof prev | undefined;
      for (const [id, position] of Object.entries(pending)) {
        if (position) {
          if (prev[id]?.x === position.x && prev[id]?.y === position.y) continue;
          next ??= { ...prev };
          next[id] = position;
        } else if (prev[id]) {
          next ??= { ...prev };
          delete next[id];
        }
      }
      return next ?? prev;
    });
  }, []);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // 1. Capture measured dimensions so nodes never revert to unmeasured state during drag
    const dimensionChanges = changes.filter(
      (change): change is Extract<NodeChange, { type: "dimensions" }> =>
        change.type === "dimensions" && Boolean(change.dimensions),
    );
    if (dimensionChanges.length > 0) {
      setMeasuredDimensions((prev) => {
        let next: typeof prev | undefined;
        for (const change of dimensionChanges) {
          if (change.dimensions) {
            const old = prev[change.id];
            if (old?.width === change.dimensions.width && old?.height === change.dimensions.height) continue;
            next ??= { ...prev };
            next[change.id] = change.dimensions;
          }
        }
        return next ?? prev;
      });
    }

    // 2. Track position displacement
    const positionChanges = changes.filter(
      (change): change is Extract<NodeChange, { type: "position" }> =>
        change.type === "position" && (Boolean(change.position) || change.dragging === false),
    );
    if (positionChanges.length === 0) return;

    for (const change of positionChanges) {
      if (change.dragging && change.position) {
        pendingPositions.current[change.id] = change.position;
      } else if (change.dragging === false) {
        pendingPositions.current[change.id] = null;
      }
    }
    if (frame.current === null) frame.current = requestAnimationFrame(flushPositions);
  }, [flushPositions]);

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
