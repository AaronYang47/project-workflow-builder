"use client";

import { useCallback, useRef } from "react";
import {
  useReactFlow,
  type OnNodeDrag,
} from "@xyflow/react";
import { resolveAbsolutePosition } from "@/lib/flow-helpers";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeLayout } from "@/types/workflow";

/**
 * Captures node positions before drag starts and reconciles them with the
 * store on drag stop. Also performs parent-phase detection: a node dropped
 * inside a phase becomes a child, and a node pulled out is detached.
 */
export function useNodeDragHandlers(
  commitLayoutDrag: (
    patches: Record<string, Partial<NodeLayout>>,
    before: Record<string, NodeLayout>,
  ) => void,
) {
  const dragStartLayouts = useRef<Record<string, NodeLayout>>({});
  const flow = useReactFlow();
  const onNodeDragStart: OnNodeDrag = useCallback((_, node) => {
    const current = useWorkflowStore.getState();
    if (node.type === "phase") {
      if (
        current.selection.nodeIds.length !== 1 ||
        current.selection.nodeIds[0] !== node.id
      ) {
        current.selectNodes([node.id]);
      }
    }
    const ids = new Set([...current.selection.nodeIds, node.id]);
    const before: Record<string, NodeLayout> = {};
    ids.forEach((id) => {
      const layout = current.file.layout.nodes[id];
      if (layout) before[id] = structuredClone(layout);
    });
    dragStartLayouts.current = before;
  }, []);
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, draggedNode) => {
      const before = dragStartLayouts.current;
      const ids = new Set(Object.keys(before));
      const flowNodes = flow.getNodes();
      const patches: Record<string, Partial<NodeLayout>> = {};
      flowNodes.forEach((node) => {
        if (ids.has(node.id))
          patches[node.id] = { x: node.position.x, y: node.position.y };
      });
      const domain = useWorkflowStore
        .getState()
        .file.graph.nodes.find((node) => node.id === draggedNode.id);
      if (domain && domain.type !== "phase") {
        const lookup = (id: string) =>
          flowNodes.find((item) => item.id === id);
        const absolute = resolveAbsolutePosition(draggedNode, lookup);
        const center = {
          x:
            absolute.x +
            (draggedNode.measured?.width ?? draggedNode.width ?? 0) / 2,
          y:
            absolute.y +
            (draggedNode.measured?.height ?? draggedNode.height ?? 0) / 2,
        };
        const targetPhase = flowNodes.find(
          (node) =>
            node.type === "phase" &&
            center.x >= node.position.x &&
            center.x <=
              node.position.x +
                (node.measured?.width ?? node.width ?? 0) &&
            center.y >= node.position.y &&
            center.y <=
              node.position.y +
                (node.measured?.height ?? node.height ?? 0),
        );
        if (targetPhase && draggedNode.parentId !== targetPhase.id) {
          patches[draggedNode.id] = {
            x: Math.max(24, absolute.x - targetPhase.position.x),
            y: Math.max(112, absolute.y - targetPhase.position.y),
            parentId: targetPhase.id,
            zIndex: 1,
          };
        } else if (!targetPhase && draggedNode.parentId) {
          patches[draggedNode.id] = {
            x: absolute.x,
            y: absolute.y,
            parentId: undefined,
            zIndex: undefined,
          };
        }
      }
      commitLayoutDrag(patches, before);
      dragStartLayouts.current = {};
    },
    [commitLayoutDrag, flow],
  );
  return { onNodeDragStart, onNodeDragStop };
}