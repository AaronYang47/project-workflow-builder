import { useCallback } from "react";
import type {
  Connection,
  Edge,
  FinalConnectionState,
  HandleType,
  IsValidConnection,
  OnConnect,
} from "@xyflow/react";
import {
  canReceiveDeniedReturn,
  deniedTargetHandle,
  isApprovedEdge,
  isDeniedSourceHandle,
} from "@/lib/workflow-graph";
import type { DomainEdge, DomainNode } from "@/types/workflow";

export function nodeIdFromPointer(event: MouseEvent | TouchEvent) {
  const point =
    "changedTouches" in event ? event.changedTouches.item(0) : event;
  if (!point) return undefined;
  for (const el of document.elementsFromPoint(point.clientX, point.clientY)) {
    const id = el.closest(".react-flow__node")?.getAttribute("data-id");
    if (id) return id;
  }
  return undefined;
}

export function useCanvasConnections({
  nodes,
  addEdge,
  updateEdge,
}: {
  nodes: DomainNode[];
  addEdge: (edge: DomainEdge) => void;
  updateEdge: (id: string, patch: Partial<DomainEdge>) => void;
}) {
  const onConnect = useCallback<OnConnect>(
    (connection) => {
      if (!connection.source || !connection.target) return;
      const source = nodes.find((node) => node.id === connection.source);
      const outcome = source?.config.outcomes?.find(
        (item) => item.id === connection.sourceHandle,
      );
      const preGateSales =
        source?.metadata.workflowSection === "Pre-Gate Sales";
      const edge: DomainEdge = {
        id: `edge-${crypto.randomUUID().slice(0, 8)}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: deniedTargetHandle({
          sourceHandle: connection.sourceHandle,
          preGateSales,
          droppedHandle: connection.targetHandle,
        }),
        type: outcome?.edgeType || "normal",
        label: outcome?.label
          ? outcome.label[0] + outcome.label.slice(1).toLowerCase()
          : "",
        lineStyle: "solid",
        arrowStyle: "closed",
        customFields: {},
      };
      addEdge(edge);
    },
    [addEdge, nodes],
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      if (!connection.source || !connection.target) return false;
      const target = nodes.find((node) => node.id === connection.target);
      if (!target || target.type === "phase" || target.type === "projectStart") {
        return false;
      }
      if (
        isDeniedSourceHandle(connection.sourceHandle) &&
        !canReceiveDeniedReturn(target.type)
      ) {
        return false;
      }
      return true;
    },
    [nodes],
  );

  const connectDeniedToNode = useCallback(
    (sourceId: string, sourceHandle: string | null | undefined, targetId: string) => {
      const source = nodes.find((node) => node.id === sourceId);
      const target = nodes.find((node) => node.id === targetId);
      if (!source || !target || !canReceiveDeniedReturn(target.type)) return;
      onConnect({
        source: sourceId,
        sourceHandle: sourceHandle ?? null,
        target: targetId,
        targetHandle: deniedTargetHandle({
          sourceHandle,
          preGateSales: source.metadata.workflowSection === "Pre-Gate Sales",
          droppedHandle: "rework-in",
        }) ?? null,
      });
    },
    [nodes, onConnect],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source") {
        return;
      }
      if (!isDeniedSourceHandle(state.fromHandle?.id)) return;
      const targetId = nodeIdFromPointer(event);
      if (!targetId) return;
      connectDeniedToNode(state.fromNode.id, state.fromHandle?.id, targetId);
    },
    [connectDeniedToNode],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (!isValidConnection(connection)) return;
      const source = nodes.find((node) => node.id === connection.source);
      updateEdge(oldEdge.id, {
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: deniedTargetHandle({
          sourceHandle: connection.sourceHandle,
          preGateSales: source?.metadata.workflowSection === "Pre-Gate Sales",
          droppedHandle: connection.targetHandle,
        }),
      });
    },
    [isValidConnection, nodes, updateEdge],
  );

  const onReconnectEnd = useCallback(
    (
      event: MouseEvent | TouchEvent,
      edge: Edge,
      handleType: HandleType,
      state: FinalConnectionState,
    ) => {
      if (state.isValid || handleType !== "target") return;
      const domain = (edge.data as { domain?: DomainEdge } | undefined)?.domain;
      const sourceHandle = domain?.sourceHandle ?? edge.sourceHandle;
      if (
        !isDeniedSourceHandle(sourceHandle) &&
        !isApprovedEdge({ sourceHandle, type: domain?.type })
      ) {
        return;
      }
      const targetId = nodeIdFromPointer(event);
      if (!targetId) return;
      const target = nodes.find((node) => node.id === targetId);
      if (
        !target ||
        target.type === "phase" ||
        target.type === "projectStart"
      ) {
        return;
      }
      const source = nodes.find((node) => node.id === edge.source);
      updateEdge(edge.id, {
        target: targetId,
        targetHandle:
          sourceHandle && isDeniedSourceHandle(sourceHandle)
            ? deniedTargetHandle({
                sourceHandle,
                preGateSales:
                  source?.metadata.workflowSection === "Pre-Gate Sales",
                droppedHandle: "rework-in",
              })
            : "in",
      });
    },
    [nodes, updateEdge],
  );

  return {
    onConnect,
    isValidConnection,
    onConnectEnd,
    onReconnect,
    onReconnectEnd,
  };
}
