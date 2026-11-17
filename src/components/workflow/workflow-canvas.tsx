"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { WorkflowNode } from "./workflow-node";
import { PhaseNode } from "./phase-node";
import { ReferenceNode } from "./reference-node";
import { CanvasToolbar } from "./canvas-toolbar";
import { SemanticEdge } from "./semantic-edge";
import { FobYardBypassEdgeComponent } from "./high-level/fob-yard-bypass-edge";
import { type LabelObstacle } from "@/lib/semantic-edge-geometry";
import { getNodeDefinition } from "@/lib/node-catalog";
import { CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM, FIT_VIEW_PADDING } from "@/lib/flow-helpers";
import { getFileProgress } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { useShallow } from "zustand/react/shallow";
import { useFlowNodes } from "./use-flow-nodes";
import { useNodeDragHandlers } from "./use-node-drag-handlers";
import { type WorkflowNodeType } from "@/types/workflow";
import { useCanvasAutoMeasure } from "./use-canvas-auto-measure";
import { useCanvasExport } from "./use-canvas-export";
import { useCanvasConnections } from "./use-canvas-connections";
import {
  canEditCollaborativeWorkflow,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { HIGH_LEVEL_NODE_CATALOG } from "@/lib/high-level-workflow";
import { LayerContextMinimap } from "./layer-context-minimap";
import type { ContextMapNode } from "@/lib/layer-context-minimap-layout";
import { useCanvasDrop } from "./use-canvas-drop";
import {
  buildCanvasEdges,
  buildCanvasNodes,
  buildLabelObstacles,
  indexCanvasEdges,
} from "@/lib/canvas-model";

const nodeTypes = {
  workflow: WorkflowNode,
  phase: PhaseNode,
  reference: ReferenceNode,
};
const edgeTypes = { semantic: SemanticEdge, fobYardBypass: FobYardBypassEdgeComponent };
type WorkflowCanvasProps = {
  active?: boolean;
  focusNodeIds?: string[] | null;
  onFocusRequestHandled?: () => void;
  onOpenLayer1Node?: (nodeId: string) => void;
};

function updateFocusedNode(nodeId?: string, broadcast = false) {
  const collaboration = useCollaborationStore.getState();
  collaboration.setFocusedNodeId(nodeId);
  if (!broadcast) return;

  const localUser = useCollaborationStore.getState().localUser;
  collaborationManager.broadcast({
    type: "PRESENCE",
    senderId: localUser.peerId,
    profile: {
      ...localUser,
      focusedNodeId: nodeId,
      lastActiveAt: Date.now(),
    },
  });
}

function CanvasInner({
  active = true,
  focusNodeIds,
  onFocusRequestHandled,
  onOpenLayer1Node,
}: WorkflowCanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const activationCentered = useRef(false);
  const focusNodeIdsRef = useRef(focusNodeIds);
  const flow = useReactFlow();
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));

  useEffect(() => {
    focusNodeIdsRef.current = focusNodeIds;
  }, [focusNodeIds]);

  // Subscribe to the full state with shallow comparison to avoid recomputation loops
  const {
    file,
    selection,
    search,
    addNode,
    addPhaseWrappingNodes,
    addGateUnderNode,
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
      addPhaseWrappingNodes: state.addPhaseWrappingNodes,
      addGateUnderNode: state.addGateUnderNode,
      addEdge: state.addEdge,
      updateEdge: state.updateEdge,
      commitLayoutDrag: state.commitLayoutDrag,
      setViewport: state.setViewport,
      selectNodes: state.selectNodes,
      selectEdge: state.selectEdge,
      focusedInspectorField: state.focusedInspectorField,
    })),
  );

  // With FOB yard on, progress follows the bypass around the skipped Phases.
  const progress = useMemo(() => getFileProgress(file), [file]);

  const layer1Context = useMemo(() => {
    const highLevel = file.highLevel;
    if (!highLevel) return { nodes: [] as ContextMapNode[], edges: [], activeLabel: undefined };
    const selectedLayer2Ids = new Set(selection.nodeIds);
    for (const selectedId of selection.nodeIds) {
      let parentId = file.layout.nodes[selectedId]?.parentId;
      while (parentId && !selectedLayer2Ids.has(parentId)) {
        selectedLayer2Ids.add(parentId);
        parentId = file.layout.nodes[parentId]?.parentId;
      }
    }
    const activeLayer1Ids = new Set(
      highLevel.graph.nodes
        .filter((node) =>
          (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).some((id) =>
            selectedLayer2Ids.has(id),
          ),
        )
        .map((node) => node.id),
    );
    if (!activeLayer1Ids.size && selection.nodeIds.length) {
      const positionCache = new Map<string, number>();
      const absoluteX = (nodeId: string, seen = new Set<string>()): number => {
        const cached = positionCache.get(nodeId);
        if (cached !== undefined) return cached;
        const layout = file.layout.nodes[nodeId];
        if (!layout || seen.has(nodeId)) return 0;
        seen.add(nodeId);
        const x = layout.x + (layout.parentId ? absoluteX(layout.parentId, seen) : 0);
        positionCache.set(nodeId, x);
        return x;
      };
      const orderedLayer2 = file.graph.nodes
        .filter((node) => node.type !== "phase")
        .sort((left, right) => absoluteX(left.id) - absoluteX(right.id));
      const selectedIndexes = selection.nodeIds.flatMap((id) => {
        const index = orderedLayer2.findIndex((node) => node.id === id);
        return index < 0 ? [] : [index];
      });
      if (selectedIndexes.length && highLevel.graph.nodes.length) {
        const averageIndex =
          selectedIndexes.reduce((sum, index) => sum + index, 0) / selectedIndexes.length;
        const progress = orderedLayer2.length > 1 ? averageIndex / (orderedLayer2.length - 1) : 0;
        const fallbackIndex = Math.round(progress * (highLevel.graph.nodes.length - 1));
        activeLayer1Ids.add(highLevel.graph.nodes[fallbackIndex].id);
      }
    }
    const nodes: ContextMapNode[] = highLevel.graph.nodes.map((node) => {
      const layout = highLevel.layout.nodes[node.id];
      const definition = HIGH_LEVEL_NODE_CATALOG.find((item) => item.type === node.type);
      return {
        id: node.id,
        label: node.title,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        width: node.type === "phase" || node.type === "primaryGate" ? 288 : 208,
        height: node.type === "phase" || node.type === "primaryGate" ? 128 : 104,
        color: definition?.color,
        active: activeLayer1Ids.has(node.id),
      };
    });
    return {
      nodes,
      edges: highLevel.graph.edges,
      activeLabel:
        highLevel.graph.nodes
          .filter((node) => activeLayer1Ids.has(node.id))
          .map((node) => node.title)
          .join(", ") || undefined,
    };
  }, [file.graph.nodes, file.highLevel, file.layout.nodes, selection.nodeIds]);

  const modelNodes = useMemo<Node[]>(
    () => buildCanvasNodes(file, search, selection, progress),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the builder reads only the fields listed, so recompute exactly when they change
    [
      file.graph.nodes,
      file.layout.nodes,
      file.highLevel,
      search,
      selection.nodeIds,
      progress.reachedNodeIds,
      file.execution?.items,
      file.operations,
    ],
  );

  const { nodes, onNodesChange } = useFlowNodes(modelNodes);

  const labelObstacles = useMemo<LabelObstacle[]>(
    () => buildLabelObstacles(file),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the builder reads only the fields listed, so recompute exactly when they change
    [file.graph.nodes, file.layout.nodes],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the builder reads only the fields listed, so recompute exactly when they change
  const edgeIndexes = useMemo(() => indexCanvasEdges(file), [file.graph.edges]);

  const edges = useMemo<Edge[]>(
    () => buildCanvasEdges(file, edgeIndexes, labelObstacles, progress, selection),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the builder reads only the fields listed, so recompute exactly when they change
    [edgeIndexes, file, labelObstacles, progress.activeEdgeIds, selection.edgeId],
  );

  // Hook 1: Connection & reconnection handlers
  const { onConnect, isValidConnection, onConnectEnd, onReconnect, onReconnectEnd } =
    useCanvasConnections({
      nodes: file.graph.nodes,
      addEdge,
      updateEdge,
    });

  const onDrop = useCanvasDrop({
    flow,
    file,
    selection,
    addNode,
    addPhaseWrappingNodes,
    addGateUnderNode,
  });

  const quickAdd = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      // React Flow bubbles control-button double clicks to the canvas. Keep
      // zoom/fit controls from being interpreted as a request to add a node.
      if (
        target.closest(".react-flow__node") ||
        target.closest(".react-flow__controls") ||
        target.closest(".react-flow__minimap")
      ) {
        return;
      }
      addNode("general", flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, flow],
  );

  const { onNodeDragStart, onNodeDragStop } = useNodeDragHandlers(commitLayoutDrag);

  // Hook 2: Dynamic DOM Auto-measure for expanding cards & phase boundaries
  useCanvasAutoMeasure(wrapper);

  // Hook 3: Global focus, fit, and image export handlers
  useCanvasExport(flow, wrapper);

  useEffect(() => {
    if (!active) {
      activationCentered.current = false;
      return;
    }
    if (activationCentered.current || focusNodeIdsRef.current?.length || focusNodeIds?.length)
      return;

    let attempts = 0;
    let retryTimer: number | undefined;
    let cancelled = false;
    const fitWhenReady = () => {
      if (cancelled) return;
      const canvasRect = wrapper.current?.getBoundingClientRect();
      const rootNodes = flow.getNodes().filter((node) => !node.parentId);
      const ready =
        flow.viewportInitialized &&
        Boolean(canvasRect?.width && canvasRect.height) &&
        rootNodes.length > 0;

      if (!ready) {
        if (attempts < 40) {
          attempts += 1;
          retryTimer = window.setTimeout(fitWhenReady, 50);
        }
        return;
      }

      activationCentered.current = true;
      // Keep the first L2 view readable. Navigation and explicit focus requests
      // still fit any requested node on demand.
      flow.setViewport({ x: 80, y: 70, zoom: 0.55 }, { duration: 350 });
    };

    retryTimer = window.setTimeout(fitWhenReady, 80);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [active, flow, focusNodeIds]);

  useEffect(() => {
    if (!focusNodeIds?.length) return;

    let attempts = 0;
    let retryTimer: number | undefined;
    const retry = () => {
      if (attempts >= 40) {
        onFocusRequestHandled?.();
        return;
      }
      attempts += 1;
      retryTimer = window.setTimeout(focusWhenReady, 50);
    };
    const focusWhenReady = () => {
      const canvasRect = wrapper.current?.getBoundingClientRect();
      const internalNodes = focusNodeIds.map((id) => flow.getInternalNode(id));
      const ready =
        flow.viewportInitialized &&
        Boolean(canvasRect?.width && canvasRect.height) &&
        internalNodes.every((node) => node?.measured.width && node.measured.height);

      if (!ready) {
        retry();
        return;
      }

      const validIds = focusNodeIds.filter((id) => flow.getInternalNode(id));
      if (!validIds.length) {
        onFocusRequestHandled?.();
        return;
      }

      activationCentered.current = true;
      useWorkflowStore.getState().selectNodes(validIds);

      const targetNode = flow.getInternalNode(validIds[0]);
      const width = targetNode?.measured.width ?? 0;
      const height = targetNode?.measured.height ?? 0;
      const position = targetNode?.internals?.positionAbsolute;

      const fitRequest = (() => {
        if (targetNode && width && height && position) {
          return flow.setCenter(position.x + width / 2, position.y + height / 2, {
            duration: 500,
            zoom: 0.85,
          });
        }

        return flow.fitView({
          nodes: validIds.map((id) => ({ id })),
          duration: 500,
          padding: 1.5,
          maxZoom: 0.9,
        });
      })();

      void fitRequest.then(() => onFocusRequestHandled?.());
    };

    focusWhenReady();
    return () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [flow, focusNodeIds, onFocusRequestHandled]);

  useEffect(() => {
    const onNodePointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      const nodeElement = target?.closest(".react-flow__node");
      const nodeId = nodeElement?.getAttribute("data-id");
      const current = useWorkflowStore.getState().selection;
      if (nodeId) {
        // React Flow owns node selection on pointer/click. Updating the
        // external selection store during its pointerdown phase causes a
        // controlled-node reconciliation loop when a large card exposes its
        // resize handles. The onNodeClick/onSelectionChange handlers below
        // keep the inspector and collaboration focus in sync after React
        // Flow has committed its own selection.
        return;
      }

      if (!target?.closest(".react-flow__pane")) return;
      if (!current.nodeIds.length && !current.edgeId) return;
      selectNodes([]);
      updateFocusedNode(undefined, true);
    };

    document.addEventListener("pointerdown", onNodePointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", onNodePointerDownCapture, true);
  }, [selectNodes]);

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
        onConnect={canEditWorkflow ? onConnect : undefined}
        onConnectEnd={canEditWorkflow ? onConnectEnd : undefined}
        onReconnect={canEditWorkflow ? onReconnect : undefined}
        onReconnectEnd={canEditWorkflow ? onReconnectEnd : undefined}
        isValidConnection={isValidConnection}
        connectionRadius={32}
        reconnectRadius={32}
        onNodesChange={onNodesChange}
        nodesDraggable={canEditWorkflow}
        nodesConnectable={canEditWorkflow}
        onNodeDragStart={canEditWorkflow ? onNodeDragStart : undefined}
        onNodeDragStop={canEditWorkflow ? onNodeDragStop : undefined}
        onNodesDelete={
          canEditWorkflow
            ? (deleted) => useWorkflowStore.getState().deleteNodes(deleted.map((node) => node.id))
            : undefined
        }
        onNodeClick={(_, node) => {
          selectNodes([node.id]);
          updateFocusedNode(node.id, true);
        }}
        onEdgeClick={(_, edge) => {
          selectEdge(edge.id);
          updateFocusedNode();
        }}
        onDoubleClick={canEditWorkflow ? quickAdd : undefined}
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
        panOnScroll
        selectionOnDrag={false}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        className={canEditWorkflow ? "workflow-flow" : "workflow-flow workflow-read-only"}
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
            getNodeDefinition((node.data.domain as { type: WorkflowNodeType }).type).color
          }
          maskColor="rgba(71,85,105,.12)"
        />
        <Controls
          position="bottom-left"
          className="!left-4 !bottom-20 !m-0 !overflow-hidden !rounded-lg !border !shadow-sm"
          showInteractive={false}
        />
      </ReactFlow>

      <CanvasToolbar className="pointer-events-auto absolute left-2 top-2 z-10 sm:left-4 sm:top-4" />
      <div className="pointer-events-none absolute right-2 top-2 z-10 max-w-[calc(100%-16px)] sm:right-4 sm:top-4">
        <LayerContextMinimap
          level="L1"
          title="High-Level Process"
          nodes={layer1Context.nodes}
          edges={layer1Context.edges}
          activeLabel={layer1Context.activeLabel}
          onOpenParent={
            onOpenLayer1Node && layer1Context.nodes.length
              ? () => {
                  const activeNode = layer1Context.nodes.find((node) => node.active);
                  onOpenLayer1Node(activeNode?.id || layer1Context.nodes[0].id);
                }
              : undefined
          }
          onOpenNode={onOpenLayer1Node}
          expandable
          className="pointer-events-auto w-[min(320px,calc(100vw-16px))] sm:w-[min(940px,calc(100vw-32px))]"
        />
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-background/85 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur md:block">
        Double-click canvas to add Node · Drag to pan · Scroll to zoom
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
