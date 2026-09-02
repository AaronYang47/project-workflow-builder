"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
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
import { isReferenceNodeType, type DomainEdge, type WorkflowNodeType } from "@/types/workflow";
import { useCanvasAutoMeasure } from "./use-canvas-auto-measure";
import { useCanvasExport } from "./use-canvas-export";
import { useCanvasConnections } from "./use-canvas-connections";
import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { getExecutionSummary } from "@/lib/execution";
import { matrixKindForNode } from "@/lib/matrix-config";
import { HIGH_LEVEL_NODE_CATALOG } from "@/lib/high-level-workflow";
import {
  LayerContextMinimap,
  type ContextMapNode,
} from "./layer-context-minimap";

const nodeTypes = {
  workflow: WorkflowNode,
  phase: PhaseNode,
  reference: ReferenceNode,
};
const edgeTypes = { semantic: SemanticEdge };
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

  useEffect(() => {
    focusNodeIdsRef.current = focusNodeIds;
  }, [focusNodeIds]);

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
    () =>
      getWorkflowProgress(
        file.graph.nodes,
        file.graph.edges,
        file.execution?.items ?? [],
        file.operations,
      ),
    [file.graph.nodes, file.graph.edges, file.execution?.items, file.operations],
  );

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
          selectedIndexes.reduce((sum, index) => sum + index, 0) /
          selectedIndexes.length;
        const progress =
          orderedLayer2.length > 1 ? averageIndex / (orderedLayer2.length - 1) : 0;
        const fallbackIndex = Math.round(
          progress * (highLevel.graph.nodes.length - 1),
        );
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
      activeLabel: highLevel.graph.nodes
        .filter((node) => activeLayer1Ids.has(node.id))
        .map((node) => node.title)
        .join(", ") || undefined,
    };
  }, [file.graph.nodes, file.highLevel, file.layout.nodes, selection.nodeIds]);

  const modelNodes = useMemo<Node[]>(() => {
    const highLevelNodes = file.highLevel?.graph.nodes || [];
    const l1PhaseColorByL2NodeId = new Map<string, string>();
    for (const hlNode of highLevelNodes) {
      const color = hlNode.backgroundColor;
      if (!color || color === "transparent") continue;
      const linkedIds =
        hlNode.linkedLayer2NodeIds ?? hlNode.linkedDetailedNodeIds ?? [];
      for (const linkedId of linkedIds) {
        if (!l1PhaseColorByL2NodeId.has(linkedId)) {
          l1PhaseColorByL2NodeId.set(linkedId, color);
        }
      }
    }

    return file.graph.nodes
      .map((domain): Node => {
        const layout = file.layout.nodes[domain.id];
        const q = search.trim().toLowerCase();
        const searchMatch =
          q &&
          `${domain.title} ${domain.description}`.toLowerCase().includes(q);
        const rendererType =
          domain.type === "phase"
            ? "phase"
              : isReferenceNodeType(domain.type) && !matrixKindForNode(domain)
                ? "reference"
              : "workflow";
        const phaseColor =
          l1PhaseColorByL2NodeId.get(domain.id) ??
          (layout?.parentId ? l1PhaseColorByL2NodeId.get(layout.parentId) : undefined);
        return {
          id: domain.id,
          type: rendererType,
          position: { x: layout?.x || 0, y: layout?.y || 0 },
          width: layout?.width,
          height: layout?.height,
          parentId: layout?.parentId,
          zIndex: domain.type === "phase" ? -1 : layout?.zIndex,
          selected: selection.nodeIds.includes(domain.id),
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
              phaseColor,
              executionSummary: getExecutionSummary(
                domain.id,
                file.execution?.items,
                file.operations,
                { checklistOnly: true },
              ),
            },
        };
      })
      .sort((a, b) => (a.type === "phase" ? -1 : b.type === "phase" ? 1 : 0));
  }, [
    file.graph.nodes,
    file.layout.nodes,
    file.highLevel,
    search,
    selection.nodeIds,
    progress.reachedNodeIds,
    file.execution?.items,
    file.operations,
  ]);

  const { nodes, onNodesChange } = useFlowNodes(modelNodes);

  const labelObstacles = useMemo<LabelObstacle[]>(() => {
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
  }, [file.graph.nodes, file.layout.nodes]);

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

  const edges = useMemo<Edge[]>(() => {
    const nodesById = new Map(file.graph.nodes.map((node) => [node.id, node]));
    const supportingEdgeLanes = new Map(
      file.graph.edges
        .map((edge, index) => ({ edge, index }))
        .filter(
          ({ edge }) =>
            edge.type === "supporting" || edge.type === "dependency",
        )
        // Lower targets get the inner lane. Upper targets nest outside them,
        // which keeps vertical target approaches from crossing lower edges.
        .sort(
          (left, right) =>
            (file.layout.nodes[right.edge.target]?.y ?? 0) -
              (file.layout.nodes[left.edge.target]?.y ?? 0) ||
            left.index - right.index,
        )
        .map(({ edge }, index) => [edge.id, index]),
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
      const supportingLane = supportingEdgeLanes.get(domain.id);

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
          labelLane:
            supportingLane !== undefined
              ? supportingLane
              : returnIndex >= 0
                ? labelLane
                : labelHugsPath
                  ? 2
                  : 0,
          labelHugsPath,
          preGateSales,
          siblingIndex: Math.max(0, siblingIndex),
          siblingCount: siblingEdges.length,
        },
      };
    });
  }, [
    edgeIndexes,
    file.graph.edges,
    file.graph.nodes,
    file.layout.edges,
    file.layout.nodes,
    labelObstacles,
    progress.activeEdgeIds,
    selection.edgeId,
  ]);

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

  const { onNodeDragStart, onNodeDragStop } =
    useNodeDragHandlers(commitLayoutDrag);

  // Hook 2: Dynamic DOM Auto-measure for expanding cards & phase boundaries
  useCanvasAutoMeasure(wrapper);

  // Hook 3: Global focus, fit, and image export handlers
  useCanvasExport(flow, wrapper);

  useEffect(() => {
    if (!active) {
      activationCentered.current = false;
      return;
    }
    if (activationCentered.current || focusNodeIdsRef.current?.length) return;

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
  }, [active, flow]);

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

      const fitRequest = (() => {
        if (validIds.length !== 1) {
          return flow.fitView({
            nodes: validIds.map((id) => ({ id })),
            duration: 500,
            padding: 0.8,
            maxZoom: 1.25,
          });
        }

        const node = flow.getInternalNode(validIds[0]);
        const width = node?.measured.width ?? 0;
        const height = node?.measured.height ?? 0;
        const position = node?.internals.positionAbsolute;
        if (!node || !width || !height || !position || !canvasRect) {
          return Promise.resolve(false);
        }

        const zoom = Math.max(
          CANVAS_MIN_ZOOM,
          Math.min(
            1.25,
            (canvasRect.width * 0.82) / width,
            (canvasRect.height * 0.82) / height,
          ),
        );

        return flow.setCenter(
          position.x + width / 2,
          position.y + height / 2,
          { duration: 500, zoom },
        );
      })();
      useWorkflowStore.getState().selectNodes(validIds);
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
    return () =>
      document.removeEventListener(
        "pointerdown",
        onNodePointerDownCapture,
        true,
      );
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
        onNodeClick={(_, node) => {
          selectNodes([node.id]);
          updateFocusedNode(node.id, true);
        }}
        onEdgeClick={(_, edge) => {
          selectEdge(edge.id);
          updateFocusedNode();
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
        panOnScroll
        selectionOnDrag={false}
        multiSelectionKeyCode={null}
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
