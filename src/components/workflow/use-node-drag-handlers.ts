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
    const domain = current.file.graph.nodes.find((n) => n.id === node.id);
    const isContainer =
      domain?.type === "phase" ||
      domain?.type === "gate" ||
      node.type === "phase";

    if (isContainer) {
      if (
        current.selection.nodeIds.length !== 1 ||
        current.selection.nodeIds[0] !== node.id
      ) {
        current.selectNodes([node.id]);
      }
    }
    const childIds = isContainer
      ? Object.values(current.file.layout.nodes)
          .filter((l) => l.parentId === node.id)
          .map((l) => l.nodeId)
      : [];
    const ids = new Set([...current.selection.nodeIds, node.id, ...childIds]);
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

      if (domain && (domain.type === "phase" || domain.type === "gate")) {
        const start = before[draggedNode.id];
        if (start) {
          const dx = draggedNode.position.x - start.x;
          const dy = draggedNode.position.y - start.y;
          if (dx !== 0 || dy !== 0) {
            const children = Object.values(
              useWorkflowStore.getState().file.layout.nodes,
            ).filter((l) => l.parentId === draggedNode.id);
            for (const child of children) {
              patches[child.nodeId] = {
                x: child.x + dx,
                y: child.y + dy,
              };
            }
          }
        }
      } else if (domain) {
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
        const targetContainer = flowNodes.find((n) => {
          const dType = (n.data as { domain?: { type?: string } })?.domain?.type ?? n.type;
          if (dType !== "phase" && dType !== "gate") return false;
          const w = n.measured?.width ?? n.width ?? 0;
          const h = n.measured?.height ?? n.height ?? 0;
          return (
            center.x >= n.position.x &&
            center.x <= n.position.x + w &&
            center.y >= n.position.y &&
            center.y <= n.position.y + h
          );
        });

        const currentParentId = useWorkflowStore.getState().file.layout.nodes[draggedNode.id]?.parentId;
        if (targetContainer && currentParentId !== targetContainer.id) {
          patches[draggedNode.id] = {
            ...patches[draggedNode.id],
            parentId: targetContainer.id,
          };
        } else if (!targetContainer && currentParentId) {
          patches[draggedNode.id] = {
            ...patches[draggedNode.id],
            parentId: undefined,
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