"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createEmptyHighLevelWorkflow } from "@/types/workflow";
import type { DomainNode, HighLevelNode } from "@/types/workflow";
import { linkedWorkflowGate, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { chapterPhaseGradientColors } from "@/lib/chapter-phase-gradient";
import { departmentDisplayName } from "@/lib/department-label";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  canEditCollaborativeWorkflow,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";
import { HighLevelNode as HighLevelNodeComponent, type HighLevelFlowNode } from "./high-level-node";

import { useShallow } from "zustand/react/shallow";
import { useFlowNodes } from "./use-flow-nodes";
import { useCanvasExport } from "./use-canvas-export";
import { LifecycleOverview } from "./high-level/lifecycle-overview";

const highLevelNodeTypes = {
  start: HighLevelNodeComponent,
  phase: HighLevelNodeComponent,
  primaryGate: HighLevelNodeComponent,
  end: HighLevelNodeComponent,
};

const emptyHighLevel = createEmptyHighLevelWorkflow();

function linkedWorkflowDisplayName(node: DomainNode) {
  return departmentDisplayName(node);
}

function HighLevelCanvasInner({
  onExit,
  onFocusLayer2Nodes,
  focusNodeId,
  onFocusRequestHandled,
}: {
  onExit: () => void;
  onFocusLayer2Nodes: (nodeIds: string[]) => void;
  focusNodeId?: string | null;
  onFocusRequestHandled?: () => void;
}) {
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));
  const {
    file,
    highLevelSelection,
    setHighLevelViewport,
    selectHighLevelNodes,
    selectHighLevelEdge,
    addHighLevelNode,
    addHighLevelEdge,
    reorderHighLevelLinkedNodes,
    reorderHighLevelLinkedGate,
    setHighLevelGateMember,
    deleteHighLevelNodes,
    deleteHighLevelEdge,
  } = useWorkflowStore(
    useShallow((state) => ({
      file: state.file,
      highLevelSelection: state.highLevelSelection,
      setHighLevelViewport: state.setHighLevelViewport,
      selectHighLevelNodes: state.selectHighLevelNodes,
      selectHighLevelEdge: state.selectHighLevelEdge,
      addHighLevelNode: state.addHighLevelNode,
      addHighLevelEdge: state.addHighLevelEdge,
      reorderHighLevelLinkedNodes: state.reorderHighLevelLinkedNodes,
      reorderHighLevelLinkedGate: state.reorderHighLevelLinkedGate,
      setHighLevelGateMember: state.setHighLevelGateMember,
      deleteHighLevelNodes: state.deleteHighLevelNodes,
      deleteHighLevelEdge: state.deleteHighLevelEdge,
    })),
  );
  const flow = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useCanvasExport(flow, wrapperRef, "l1");
  const highLevel = file.highLevel || emptyHighLevel;
  const focusHighLevelNode = useCallback(
    (nodeId: string) => {
      selectHighLevelNodes([nodeId]);
      selectHighLevelEdge(undefined);
      const internalNode = flow.getInternalNode(nodeId);
      const position = internalNode?.internals.positionAbsolute;
      if (!position) return;
      const width = internalNode.measured.width || 208;
      const height = internalNode.measured.height || 96;
      void flow.setCenter(position.x + width / 2, position.y + height / 2, {
        duration: 450,
        zoom: 1,
      });
      // React Flow may finish its pane pointer cycle after the overlay click;
      // re-apply the selection on the next frame so the inspector and canvas
      // stay synchronized with the overview focus.
      requestAnimationFrame(() => selectHighLevelNodes([nodeId]));
    },
    [flow, selectHighLevelEdge, selectHighLevelNodes],
  );
  const layer2ById = useMemo(
    () => new Map(file.graph.nodes.map((node) => [node.id, node])),
    [file.graph.nodes],
  );
  const workflowGateCount = useMemo(() => {
    const gateIds = new Set<string>();
    for (const highLevelNode of highLevel.graph.nodes) {
      for (const nodeId of highLevelNode.linkedLayer2NodeIds ??
        highLevelNode.linkedDetailedNodeIds ??
        []) {
        const gate = linkedWorkflowGate(nodeId, file.graph.nodes, file.layout.nodes);
        if (gate) gateIds.add(gate.id);
      }
    }
    return gateIds.size;
  }, [file.graph.nodes, file.layout.nodes, highLevel.graph.nodes]);

  const focusLayer2Node = useCallback(
    (nodeId: string) => {
      if (!layer2ById.has(nodeId)) return;
      selectHighLevelNodes([]);
      onFocusLayer2Nodes([nodeId]);
      onExit();
    },
    [layer2ById, onExit, onFocusLayer2Nodes, selectHighLevelNodes],
  );

  const focusLayer2Nodes = useCallback(
    (nodeIds: string[]) => {
      const validIds = nodeIds.filter((nodeId) => layer2ById.has(nodeId));
      if (!validIds.length) return;
      selectHighLevelNodes([]);
      onFocusLayer2Nodes(validIds);
      onExit();
    },
    [layer2ById, onExit, onFocusLayer2Nodes, selectHighLevelNodes],
  );

  const modelNodes = useMemo<HighLevelFlowNode[]>(
    () =>
      highLevel.graph.nodes.map((node) => {
        const layout = highLevel.layout.nodes[node.id];
        const linkedLayer2NodeIds = orderLinkedWorkflowNodeIds(
          node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds,
          file.graph.nodes,
          file.graph.edges,
          file.layout.nodes,
        ).filter((id) => {
          const type = layer2ById.get(id)?.type;
          return type !== "phase";
        });
        const linkedPhaseIds = new Set<string>();
        const linkedPhaseById = new Map<string, string>();
        for (const linkedId of linkedLayer2NodeIds) {
          const seen = new Set<string>();
          let parentId = file.layout.nodes[linkedId]?.parentId;
          while (parentId && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = layer2ById.get(parentId);
            if (parent?.type === "phase") {
              linkedPhaseIds.add(parentId);
              linkedPhaseById.set(linkedId, parentId);
              break;
            }
            parentId = file.layout.nodes[parentId]?.parentId;
          }
        }
        const availableGates = file.graph.nodes
          .filter(
            (layer2Node) =>
              layer2Node.type === "gate" &&
              linkedPhaseIds.has(file.layout.nodes[layer2Node.id]?.parentId ?? ""),
          )
          .map((gate) => ({
            id: gate.id,
            title: gate.title,
            eligibleNodeIds: linkedLayer2NodeIds.filter(
              (id) => linkedPhaseById.get(id) === file.layout.nodes[gate.id]?.parentId,
            ),
          }));
        const width =
          node.type === "phase" || node.type === "primaryGate"
            ? 288
            : node.type === "start" || node.type === "end"
              ? 256
              : 208;
        return {
          id: node.id,
          type: node.type,
          position: { x: layout?.x || 0, y: layout?.y || 0 },
          width,
          initialWidth: width,
          data: {
            title: node.title,
            description: node.description,
            code: node.code,
            backgroundColor: node.backgroundColor,
            type: node.type,
            linkedDetailedNodeIds: linkedLayer2NodeIds,
            availableGates,
            linkedLayer2Nodes: linkedLayer2NodeIds.flatMap((nodeId, linkedIndex) => {
              const layer2Node = layer2ById.get(nodeId);
              if (!layer2Node) return [];
              const parentPhase = file.graph.nodes.find(
                (candidate) => candidate.id === linkedPhaseById.get(nodeId),
              );
              const parentPhaseNumber = parentPhase?.title.match(/\d+/)?.[0];
              const manualChapterNumber = String(layer2Node.config.chapterNumber ?? "").replace(
                /\D/g,
                "",
              );
              const phaseGradientColors =
                (layer2Node.type === "general" || layer2Node.type === "projectStart") &&
                layer2Node.config.blendAdjacentPhaseColors === true
                  ? chapterPhaseGradientColors(
                      layer2Node,
                      file.graph.nodes,
                      file.layout.nodes,
                      highLevel.graph.nodes,
                    )
                  : undefined;
              return [
                {
                  id: nodeId,
                  chapterTitle: manualChapterNumber
                    ? `CHAPTER ${manualChapterNumber.padStart(2, "0")}`
                    : /^chapter\s+\d+$/i.test(layer2Node.title.trim())
                      ? layer2Node.title.trim().toUpperCase()
                      : (layer2Node.type === "end" || layer2Node.type === "terminal") &&
                          parentPhaseNumber
                        ? `CHAPTER ${parentPhaseNumber.padStart(2, "0")}`
                        : `CHAPTER ${String(linkedIndex + 1).padStart(2, "0")}`,
                  title: linkedWorkflowDisplayName(layer2Node),
                  gate: linkedWorkflowGate(nodeId, file.graph.nodes, file.layout.nodes),
                  conditionLabels: layer2Node.conditions.map(
                    (condition) => condition.label || condition.description || "Release condition",
                  ),
                  phaseGradientColors,
                },
              ];
            }),
            onLinkedLayer2NodeClick: focusLayer2Node,
            onViewAllLinkedLayer2Nodes: () => focusLayer2Nodes(linkedLayer2NodeIds),
            onReorderLinkedLayer2Nodes: (draggedId, targetId) => {
              if (canEditWorkflow) reorderHighLevelLinkedNodes(node.id, draggedId, targetId);
            },
            onReorderLinkedLayer2Gate: (gateId, targetId, position) => {
              if (canEditWorkflow) reorderHighLevelLinkedGate(node.id, gateId, targetId, position);
            },
            onSetLinkedLayer2GateMember: (gateId, nodeId, included) => {
              if (canEditWorkflow) setHighLevelGateMember(node.id, gateId, nodeId, included);
            },
          },
          draggable: true,
          selectable: true,
          selected: highLevelSelection.nodeIds.includes(node.id),
        };
      }),
    [
      focusLayer2Node,
      focusLayer2Nodes,
      canEditWorkflow,
      reorderHighLevelLinkedNodes,
      reorderHighLevelLinkedGate,
      setHighLevelGateMember,
      highLevel.graph.nodes,
      highLevel.layout.nodes,
      highLevelSelection.nodeIds,
      layer2ById,
      file.graph.nodes,
      file.graph.edges,
      file.layout.nodes,
    ],
  );
  const { nodes, onNodesChange } = useFlowNodes(modelNodes);
  const dragBefore = useRef<Record<string, { nodeId: string; x: number; y: number }>>({});
  useEffect(() => {
    const onFit = () => flow.fitView({ padding: 0.18, duration: 350, maxZoom: 1 });
    window.addEventListener("workflow:fit-high-level", onFit);
    return () => window.removeEventListener("workflow:fit-high-level", onFit);
  }, [flow]);
  useEffect(() => {
    if (!focusNodeId) return;

    let attempts = 0;
    let retryTimer: number | undefined;
    const focusWhenReady = () => {
      const internalNode = flow.getInternalNode(focusNodeId);
      const width = internalNode?.measured.width ?? 0;
      const height = internalNode?.measured.height ?? 0;
      const position = internalNode?.internals.positionAbsolute;
      if (!flow.viewportInitialized || !internalNode || !width || !height || !position) {
        if (attempts < 40) {
          attempts += 1;
          retryTimer = window.setTimeout(focusWhenReady, 50);
        } else {
          onFocusRequestHandled?.();
        }
        return;
      }

      selectHighLevelNodes([focusNodeId]);
      void flow
        .setCenter(position.x + width / 2, position.y + height / 2, {
          duration: 500,
          zoom: 1,
        })
        .then(() => onFocusRequestHandled?.());
    };

    retryTimer = window.setTimeout(focusWhenReady, 80);
    return () => {
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [flow, focusNodeId, onFocusRequestHandled, selectHighLevelNodes]);

  useEffect(() => {
    const onNodePointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as Element | null;
      const nodeElement = target?.closest(".react-flow__node");
      const nodeId = nodeElement?.getAttribute("data-id");
      if (nodeId) return;

      if (!target?.closest(".react-flow__pane")) return;
      const current = useWorkflowStore.getState().highLevelSelection;
      if (!current.nodeIds.length && !current.edgeId) return;
      selectHighLevelNodes([]);
      selectHighLevelEdge(undefined);
    };

    document.addEventListener("pointerdown", onNodePointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", onNodePointerDownCapture, true);
  }, [selectHighLevelEdge, selectHighLevelNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      highLevel.graph.edges.map((edge) => {
        const isSelected = highLevelSelection.edgeId === edge.id;
        return {
          id: edge.id,
          type: "smoothstep",
          source: edge.source,
          target: edge.target,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          animated: true,
          className: "high-level-flow-edge",
          style: {
            stroke: isSelected ? "#0d9488" : "#159a75",
            strokeWidth: isSelected ? 4 : 3.2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: isSelected ? "#0d9488" : "#159a75",
          },
          pathOptions: { borderRadius: 14, offset: 18 },
          selectable: true,
          focusable: true,
          selected: isSelected,
        };
      }),
    [highLevel.graph.edges, highLevelSelection.edgeId],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!canEditWorkflow) return;
      const type = event.dataTransfer.getData(
        "application/high-level-node",
      ) as HighLevelNode["type"];
      if (!type) return;
      addHighLevelNode(type, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addHighLevelNode, canEditWorkflow, flow],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEditWorkflow) return;
      if (!connection.source || !connection.target) return;
      addHighLevelEdge({
        id: `high-level-edge-${crypto.randomUUID().slice(0, 8)}`,
        source: connection.source,
        target: connection.target,
      });
    },
    [addHighLevelEdge, canEditWorkflow],
  );

  return (
    <section
      ref={wrapperRef}
      aria-label="High-Level Project Process"
      data-high-level-workflow-view
      className="relative h-full min-w-0 flex-1 overflow-hidden bg-canvas"
      onDrop={onDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={highLevelNodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, node) => {
          if (!canEditWorkflow) return;
          const layout = useWorkflowStore.getState().file.highLevel?.layout.nodes[node.id];
          if (layout) dragBefore.current = { [node.id]: { ...layout } };
        }}
        onNodeDragStop={(_, node) => {
          if (!canEditWorkflow) return;
          const before = dragBefore.current;
          if (before[node.id]) {
            useWorkflowStore
              .getState()
              .commitHighLevelLayoutDrag(
                { [node.id]: { x: node.position.x, y: node.position.y } },
                before,
              );
          }
          dragBefore.current = {};
        }}
        onNodesDelete={(deleted) => {
          if (canEditWorkflow) deleteHighLevelNodes(deleted.map((node) => node.id));
        }}
        onEdgesDelete={(deleted) => {
          if (canEditWorkflow) deleted.forEach((edge) => deleteHighLevelEdge(edge.id));
        }}
        onNodeClick={(_, node) => selectHighLevelNodes([node.id])}
        onEdgeClick={(_, edge) => selectHighLevelEdge(edge.id)}
        onPaneClick={() => {
          selectHighLevelNodes([]);
          selectHighLevelEdge(undefined);
        }}
        onConnect={onConnect}
        onNodeDoubleClick={(_, node) => {
          const linkedNode = highLevel.graph.nodes.find((item) => item.id === node.id);
          const linked = linkedNode?.linkedLayer2NodeIds ?? linkedNode?.linkedDetailedNodeIds ?? [];
          if (node.type === "phase" || node.type === "primaryGate") {
            if (linked.length) {
              const detailedIds = linked.filter((id) =>
                useWorkflowStore
                  .getState()
                  .file.graph.nodes.some((detailedNode) => detailedNode.id === id),
              );
              if (!detailedIds.length) return;
              selectHighLevelNodes([]);
              onFocusLayer2Nodes(detailedIds);
              onExit();
            }
          }
        }}
        defaultViewport={highLevel.layout.viewport}
        onMoveEnd={(_, viewport) => setHighLevelViewport(viewport)}
        minZoom={0.08}
        maxZoom={2}
        zoomOnScroll
        zoomActivationKeyCode={null}
        panOnScroll={false}
        selectionOnDrag={false}
        nodesDraggable={canEditWorkflow}
        nodesConnectable={canEditWorkflow}
        nodesFocusable={false}
        edgesFocusable={false}
        deleteKeyCode={canEditWorkflow ? ["Backspace", "Delete"] : null}
        className="workflow-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="var(--grid-dot)" />
        <Controls
          position="bottom-left"
          className="!left-4 !bottom-20 !m-0 !overflow-hidden !rounded-lg !border !shadow-sm"
          showInteractive={false}
        />
      </ReactFlow>
      {nodes.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-20">
          <LifecycleOverview
            nodes={highLevel.graph.nodes}
            edges={highLevel.graph.edges}
            workflowGateCount={workflowGateCount}
            selectedNodeId={highLevelSelection.nodeIds[0]}
            onFocusNode={focusHighLevelNode}
          />
        </div>
      ) : null}
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-xs text-muted-foreground/70">Drag a node from the library to begin.</p>
        </div>
      ) : null}
    </section>
  );
}

export function HighLevelWorkflowView({
  onExit,
  onFocusLayer2Nodes,
  focusNodeId,
  onFocusRequestHandled,
}: {
  onExit: () => void;
  onFocusLayer2Nodes: (nodeIds: string[]) => void;
  focusNodeId?: string | null;
  onFocusRequestHandled?: () => void;
}) {
  return (
    <ReactFlowProvider>
      <HighLevelCanvasInner
        onExit={onExit}
        onFocusLayer2Nodes={onFocusLayer2Nodes}
        focusNodeId={focusNodeId}
        onFocusRequestHandled={onFocusRequestHandled}
      />
    </ReactFlowProvider>
  );
}
