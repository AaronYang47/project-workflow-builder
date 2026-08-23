"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { WorkflowNode } from "./workflow-node";
import { PhaseNode } from "./phase-node";
import { ReferenceNode } from "./reference-node";
import { CanvasToolbar } from "./canvas-toolbar";
import {
  SemanticEdge,
  getSemanticEdgeColor,
  type LabelObstacle,
} from "./semantic-edge";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  resolveAbsolutePosition,
  CANVAS_MIN_ZOOM,
  CANVAS_MAX_ZOOM,
  FIT_VIEW_PADDING,
} from "@/lib/flow-helpers";
import { PHASE_HEADER_HEIGHT } from "@/lib/node-layout";
import { getWorkflowProgress } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { useShallow } from "zustand/react/shallow";
import { useFlowNodes } from "./use-flow-nodes";
import { useNodeDragHandlers } from "./use-node-drag-handlers";
import { isApprovedEdge, isDeniedEdge } from "@/lib/workflow-graph";
import type { DomainEdge, WorkflowNodeType } from "@/types/workflow";
import { useCanvasAutoMeasure } from "./use-canvas-auto-measure";
import { useCanvasExport } from "./use-canvas-export";
import { useCanvasConnections } from "./use-canvas-connections";
import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";

const nodeTypes = {
  workflow: WorkflowNode,
  phase: PhaseNode,
  reference: ReferenceNode,
};
const edgeTypes = { semantic: SemanticEdge };
const referenceTypes = new Set<WorkflowNodeType>(["terminal"]);

function CanvasInner() {
  const wrapper = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();

  // Subscribe to the full state with shallow comparison to avoid recomputation loops
  const {
    file,
    selection,
    search,
    addNode,
    addEdge,
    updateEdge,
    commitLayoutDrag,
    setViewport,
    selectNodes,
    selectEdge,
    focusedInspectorField,
  } = useWorkflowStore(
    useShallow((state) => ({
      file: state.file,
      selection: state.selection,
      search: state.search,
      addNode: state.addNode,
      addEdge: state.addEdge,
      updateEdge: state.updateEdge,
      commitLayoutDrag: state.commitLayoutDrag,
      setViewport: state.setViewport,
      selectNodes: state.selectNodes,
      selectEdge: state.selectEdge,
      focusedInspectorField: state.focusedInspectorField,
    })),
  );

  const progress = useMemo(
    () => getWorkflowProgress(file.graph.nodes, file.graph.edges),
    [file.graph.nodes, file.graph.edges],
  );

  const modelNodes = useMemo<Node[]>(
    () => {
      return file.graph.nodes
        .map((domain): Node => {
          const layout = file.layout.nodes[domain.id];
          const q = search.trim().toLowerCase();
          const searchMatch =
            q &&
            `${domain.title} ${domain.description}`
              .toLowerCase()
              .includes(q);
          const rendererType =
            domain.type === "phase"
              ? "phase"
              : referenceTypes.has(domain.type)
                ? "reference"
                : "workflow";
          return {
            id: domain.id,
            type: rendererType,
            position: { x: layout?.x || 0, y: layout?.y || 0 },
            width: layout?.width,
            height: layout?.height,
            parentId: layout?.parentId,
            zIndex: domain.type === "phase" ? -1 : layout?.zIndex,
            selected:
              domain.type === "phase"
                ? false
                : selection.nodeIds.includes(domain.id),
            draggable: true,
            dragHandle:
              domain.type === "phase" ? ".phase-drag-handle" : undefined,
            style:
              domain.type === "phase" ? { pointerEvents: "none" } : undefined,
            data: {
              domain,
              reached: progress.reachedNodeIds.has(domain.id),
              emphasized: Boolean(searchMatch),
              dimmed: Boolean(q && !searchMatch),
            },
          };
        })
        .sort((a, b) => (a.type === "phase" ? -1 : b.type === "phase" ? 1 : 0));
    },
    [
      file.graph.nodes,
      file.layout.nodes,
      search,
      selection.nodeIds,
      progress.reachedNodeIds,
    ],
  );

  const { nodes, onNodesChange } = useFlowNodes(modelNodes);
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const labelObstacles = useMemo<LabelObstacle[]>(
    () => {
      const cards = file.graph.nodes
        .filter((node) => node.type !== "phase")
        .map((node) => {
          const layout = file.layout.nodes[node.id];
          return {
            id: node.id,
            x: layout?.x || 0,
            y: layout?.y || 0,
            width: Math.max(layout?.width || 270, 270),
            height: Math.max(layout?.height || 240, 240),
          };
        });

      const headers = file.graph.nodes
        .filter((node) => node.type === "phase")
        .map((node) => {
          const layout = file.layout.nodes[node.id];
          return {
            id: `${node.id}__header`,
            x: layout?.x || 0,
            y: layout?.y || 0,
            width: layout?.width || 720,
            height: PHASE_HEADER_HEIGHT,
            kind: "phase-header" as const,
          };
        });

      return [...cards, ...headers];
    },
    [file.graph.nodes, file.layout.nodes],
  );

  const edgeIndexes = useMemo(() => {
    const siblings = new Map<string, DomainEdge[]>();
    const returnIndex = new Map<string, number>();
    for (const edge of file.graph.edges) {
      siblings.set(edge.source, [...(siblings.get(edge.source) || []), edge]);
      if (
        edge.sourceHandle?.startsWith("no") ||
        ["failure", "rework", "exception", "hold"].includes(edge.type)
      ) {
        returnIndex.set(edge.id, returnIndex.size);
      }
    }
    return { siblings, returnIndex };
  }, [file.graph.edges]);

  const edges = useMemo<Edge[]>(
    () => {
      const nodesById = new Map(
        file.graph.nodes.map((node) => [node.id, node]),
      );
      return file.graph.edges.map((domain) => {
        const siblingEdges = edgeIndexes.siblings.get(domain.source) || [];
        const siblingIndex = siblingEdges.findIndex(
          (edge) => edge.id === domain.id,
        );
        const returnIndex = edgeIndexes.returnIndex.get(domain.id) ?? -1;
        const labelHugsPath =
          returnIndex >= 0 ||
          domain.sourceHandle === "yes" ||
          ["success", "approval"].includes(domain.type);
        const labelLane =
          returnIndex >= 0
            ? returnIndex
            : (siblingIndex - (siblingEdges.length - 1) / 2) * 52;
        const sourceNode = nodesById.get(domain.source);
        const targetNode = nodesById.get(domain.target);
        const preGateSales =
          domain.customFields.workflowSection === "Pre-Gate Sales" ||
          sourceNode?.metadata.workflowSection === "Pre-Gate Sales" ||
          targetNode?.metadata.workflowSection === "Pre-Gate Sales" ||
          sourceNode?.type === "projectStart";
        const active = progress.activeEdgeIds.has(domain.id);
        const activeColor = getSemanticEdgeColor(domain);
        return {
            id: domain.id,
            type: "semantic",
            zIndex: 10,
            source: domain.source,
            target: domain.target,
            sourceHandle: domain.sourceHandle,
            targetHandle: domain.targetHandle,
            reconnectable: true,
            selected: selection.edgeId === domain.id,
            markerEnd:
              domain.arrowStyle === "none"
                ? undefined
                : {
                    type: MarkerType.ArrowClosed,
                    color: active ? activeColor : "#94a3b8",
                  },
            data: {
              domain,
              route: file.layout.edges?.[domain.id]?.points,
              active,
              obstacles: labelObstacles,
              labelLane: returnIndex >= 0 ? labelLane : labelHugsPath ? 2 : 0,
              labelHugsPath,
              preGateSales,
              siblingIndex: Math.max(0, siblingIndex),
              siblingCount: siblingEdges.length,
            },
          };
      });
    },
    [
      edgeIndexes,
      file.graph.edges,
      file.graph.nodes,
      file.layout.edges,
      labelObstacles,
      progress.activeEdgeIds,
      selection.edgeId,
    ],
  );

  // Hook 1: Connection & reconnection handlers
  const {
    onConnect,
    isValidConnection,
    onConnectEnd,
    onReconnect,
    onReconnectEnd,
  } = useCanvasConnections({
    nodes: file.graph.nodes,
    addEdge,
    updateEdge,
  });

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(
        "application/workflow-node",
      ) as WorkflowNodeType;
      if (!type) return;
      const position = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const phase =
        type !== "phase"
          ? file.graph.nodes
              .filter((node) => node.type === "phase")
              .map((node) => file.layout.nodes[node.id])
              .find(
                (layout) =>
                  layout &&
                  position.x >= layout.x &&
                  position.x <= layout.x + layout.width &&
                  position.y >= layout.y &&
                  position.y <= layout.y + layout.height,
              )
          : undefined;

      addNode(
        type,
        phase
          ? {
              x: Math.max(24, position.x - phase.x),
              y: Math.max(112, position.y - phase.y),
            }
          : position,
        phase?.nodeId,
      );
    },
    [addNode, file.graph.nodes, file.layout.nodes, flow],
  );

  const quickAdd = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".react-flow__node")) return;
      addNode(
        "general",
        flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addNode, flow],
  );

  const { onNodeDragStart, onNodeDragStop } = useNodeDragHandlers(commitLayoutDrag);

  // Hook 2: Dynamic DOM Auto-measure for expanding cards & phase boundaries
  useCanvasAutoMeasure(wrapper);

  // Hook 3: Global focus, fit, and image export handlers
  useCanvasExport(flow, wrapper);

  return (
    <div
      ref={wrapper}
      className="relative h-full min-w-0 flex-1 overflow-hidden bg-canvas"
      data-active-inspector-target={focusedInspectorField}
      onDrop={onDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        isValidConnection={isValidConnection}
        connectionRadius={32}
        reconnectRadius={32}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={(deleted) =>
          useWorkflowStore
            .getState()
            .deleteNodes(deleted.map((node) => node.id))
        }
        onPaneClick={() => {
          const current = useWorkflowStore.getState().selection;
          if (current.nodeIds.length || current.edgeId) {
            selectNodes([]);
            selectEdge(undefined);
            useCollaborationStore.getState().setFocusedNodeId(undefined);
            collaborationManager.broadcast({
              type: "PRESENCE",
              senderId: useCollaborationStore.getState().localUser.peerId,
              profile: {
                ...useCollaborationStore.getState().localUser,
                focusedNodeId: undefined,
                lastActiveAt: Date.now(),
              },
            });
          }
        }}
        onNodeClick={(_, node) => {
          selectNodes([node.id]);
          selectEdge(undefined);
          useCollaborationStore.getState().setFocusedNodeId(node.id);
          collaborationManager.broadcast({
            type: "PRESENCE",
            senderId: useCollaborationStore.getState().localUser.peerId,
            profile: {
              ...useCollaborationStore.getState().localUser,
              focusedNodeId: node.id,
              lastActiveAt: Date.now(),
            },
          });
        }}
        onEdgeClick={(_, edge) => {
          selectEdge(edge.id);
          selectNodes([]);
          useCollaborationStore.getState().setFocusedNodeId(undefined);
        }}
        onDoubleClick={quickAdd}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        defaultViewport={file.layout.viewport}
        fitViewOptions={{
          padding: FIT_VIEW_PADDING,
          minZoom: CANVAS_MIN_ZOOM,
          maxZoom: 1,
        }}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        snapToGrid={file.layout.snapToGrid}
        snapGrid={[file.layout.gridSize, file.layout.gridSize]}
        selectionOnDrag
        panOnScroll
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Meta", "Control"]}
        deleteKeyCode={null}
        className="workflow-flow"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={file.layout.gridSize}
          size={1.2}
          color="var(--grid-dot)"
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="workflow-minimap !m-0 !rounded-xl !border !bg-background/95"
          nodeStrokeWidth={3}
          nodeColor={(node) =>
            getNodeDefinition(
              (node.data.domain as { type: WorkflowNodeType }).type,
            ).color
          }
          maskColor="rgba(71,85,105,.12)"
        />
        <Controls
          position="bottom-left"
          className="!left-4 !bottom-4 !m-0 !overflow-hidden !rounded-lg !border !shadow-sm"
          showInteractive={false}
        />
      </ReactFlow>

      <CanvasToolbar />
      <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-background/85 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur md:block">
        Double-click canvas to add Node · Drag to pan · Scroll to zoom
      </div>
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
