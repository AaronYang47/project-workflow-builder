"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { CheckCircle2, CircleDot, Layers3, Milestone } from "lucide-react";
import "@xyflow/react/dist/style.css";
import { createEmptyHighLevelWorkflow } from "@/types/workflow";
import type { HighLevelNode } from "@/types/workflow";
import { orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import { HighLevelNode as HighLevelNodeComponent, type HighLevelFlowNode } from "./high-level-node";

import { useShallow } from "zustand/react/shallow";
import { useFlowNodes } from "./use-flow-nodes";

const highLevelNodeTypes = {
  start: HighLevelNodeComponent,
  phase: HighLevelNodeComponent,
  primaryGate: HighLevelNodeComponent,
  end: HighLevelNodeComponent,
};

const emptyHighLevel = createEmptyHighLevelWorkflow();

function LifecycleOverview({
  nodes,
  selectedNodeId,
  onFocusNode,
}: {
  nodes: HighLevelNode[];
  selectedNodeId?: string;
  onFocusNode: (nodeId: string) => void;
}) {
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState(selectedNodeId);
  const activeNodeId = selectedNodeId || localSelectedNodeId;
  const selected = nodes.find((node) => node.id === activeNodeId) || nodes[0];
  const gateCount = nodes.filter((node) => node.type === "primaryGate").length;
  const Icon = selected?.type === "primaryGate" ? Milestone : selected?.type === "start" ? CircleDot : selected?.type === "end" ? CheckCircle2 : Layers3;

  return (
    <div
      data-lifecycle-overview
      aria-label="Lifecycle overview"
      className="pointer-events-auto rounded-2xl border border-border/80 bg-background/95 shadow-[0_8px_26px_rgba(15,23,42,0.12)] backdrop-blur"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Lifecycle overview</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{nodes.length} lifecycle steps · {gateCount} primary gates · Initial Contact to Final Close</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 text-[8px] font-semibold text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-slate-400" />Phase</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" />Primary Gate</span>
        </div>
        <button
          type="button"
          aria-expanded={overviewOpen}
          aria-label={overviewOpen ? "Collapse lifecycle overview" : "Expand lifecycle overview"}
          onClick={() => setOverviewOpen((open) => !open)}
          className="shrink-0 rounded-md border px-2 py-1 text-[9px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {overviewOpen ? "Hide" : "Show"}
        </button>
      </div>
      {overviewOpen ? (
        <>
          <div className="scroll-thin overflow-x-auto border-t px-2 py-2">
            <div className="flex min-w-max items-center gap-1">
              {nodes.map((node, index) => {
                const isSelected = node.id === activeNodeId;
                const isGate = node.type === "primaryGate";
                const isBoundary = node.type === "start" || node.type === "end";
                return (
                  <div key={node.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Focus ${node.title}`}
                      aria-pressed={isSelected}
                      title={node.description}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setLocalSelectedNodeId(node.id);
                        onFocusNode(node.id);
                      }}
                      className={cn(
                        "group flex w-[100px] shrink-0 flex-col gap-1 rounded-xl border px-2 py-2 text-left transition",
                        isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border/70 bg-card hover:border-primary/45 hover:bg-primary/5",
                        isGate && !isSelected ? "border-primary/35 bg-primary/[0.04]" : "",
                      )}
                    >
                      <span className="flex items-start gap-1.5">
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white", isGate ? "bg-primary" : isBoundary ? "bg-emerald-600" : "bg-slate-500")}>{index + 1}</span>
                        <span className="min-w-0 line-clamp-4 text-[8px] font-bold leading-[10px] text-foreground">{node.title}</span>
                      </span>
                      <span className={cn("truncate text-[7px] font-semibold uppercase tracking-[0.06em]", isGate ? "text-primary" : "text-muted-foreground")}>{isGate ? "Primary Gate" : node.type === "start" ? "Start" : node.type === "end" ? "Final Close" : "Phase"}</span>
                    </button>
                    {index < nodes.length - 1 ? <span aria-hidden className="text-xs font-semibold text-primary/55">→</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
          {selected ? (
            <div className="flex items-center gap-2 border-t bg-muted/25 px-3 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-3.5" /></span>
              <p className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground"><strong className="text-foreground">Focus:</strong> {selected.title} · {selected.description}</p>
              <span className="shrink-0 text-[8px] font-semibold text-muted-foreground">Click a step to focus</span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
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
  const {
    file,
    highLevelSelection,
    setHighLevelViewport,
    selectHighLevelNodes,
    selectHighLevelEdge,
    addHighLevelNode,
    addHighLevelEdge,
    deleteHighLevelNodes,
    deleteHighLevelEdge,
    createDefaultHighLevelProcess,
  } = useWorkflowStore(
    useShallow((state) => ({
      file: state.file,
      highLevelSelection: state.highLevelSelection,
      setHighLevelViewport: state.setHighLevelViewport,
      selectHighLevelNodes: state.selectHighLevelNodes,
      selectHighLevelEdge: state.selectHighLevelEdge,
      addHighLevelNode: state.addHighLevelNode,
      addHighLevelEdge: state.addHighLevelEdge,
      deleteHighLevelNodes: state.deleteHighLevelNodes,
      deleteHighLevelEdge: state.deleteHighLevelEdge,
      createDefaultHighLevelProcess: state.createDefaultHighLevelProcess,
    })),
  );
  const flow = useReactFlow();
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
        );
        const width = node.type === "phase" ? 288 : 208;
        return {
          id: node.id,
          type: node.type,
          position: { x: layout?.x || 0, y: layout?.y || 0 },
          width,
          initialWidth: width,
          data: {
            title: node.title,
            description: node.description,
            type: node.type,
            linkedDetailedNodeIds: node.linkedDetailedNodeIds,
            linkedLayer2Nodes: linkedLayer2NodeIds.flatMap((nodeId) => {
              const layer2Node = layer2ById.get(nodeId);
              return layer2Node ? [{ id: nodeId, title: layer2Node.title }] : [];
            }),
            onLinkedLayer2NodeClick: focusLayer2Node,
            onViewAllLinkedLayer2Nodes: () => focusLayer2Nodes(linkedLayer2NodeIds),
          },
          draggable: true,
          selectable: true,
          selected: highLevelSelection.nodeIds.includes(node.id),
        };
      }),
    [
      focusLayer2Node,
      focusLayer2Nodes,
      highLevel.graph.nodes,
      highLevel.layout.nodes,
      highLevelSelection.nodeIds,
      layer2ById,
      file.graph.nodes,
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
    return () =>
      document.removeEventListener(
        "pointerdown",
        onNodePointerDownCapture,
        true,
      );
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
      const type = event.dataTransfer.getData("application/high-level-node") as HighLevelNode["type"];
      if (!type) return;
      addHighLevelNode(
        type,
        flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addHighLevelNode, flow],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      addHighLevelEdge({
        id: `high-level-edge-${crypto.randomUUID().slice(0, 8)}`,
        source: connection.source,
        target: connection.target,
      });
    },
    [addHighLevelEdge],
  );

  return (
    <section
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
          const layout = useWorkflowStore.getState().file.highLevel?.layout.nodes[node.id];
          if (layout) dragBefore.current = { [node.id]: { ...layout } };
        }}
        onNodeDragStop={(_, node) => {
          const before = dragBefore.current;
          if (before[node.id]) {
            useWorkflowStore.getState().commitHighLevelLayoutDrag(
              { [node.id]: { x: node.position.x, y: node.position.y } },
              before,
            );
          }
          dragBefore.current = {};
        }}
        onNodesDelete={(deleted) => deleteHighLevelNodes(deleted.map((node) => node.id))}
        onEdgesDelete={(deleted) => deleted.forEach((edge) => deleteHighLevelEdge(edge.id))}
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
        panOnScroll
        selectionOnDrag={false}
        nodesDraggable
        nodesConnectable
        nodesFocusable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        className="workflow-flow"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1.2}
          color="var(--grid-dot)"
        />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="workflow-minimap !m-0 !rounded-xl !border !bg-background/95"
          maskColor="rgba(71,85,105,.12)"
        />
        <Controls
          position="bottom-left"
          className="!left-4 !bottom-4 !m-0 !overflow-hidden !rounded-lg !border !shadow-sm"
          showInteractive={false}
        />
      </ReactFlow>
      {nodes.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-20">
          <LifecycleOverview
            nodes={highLevel.graph.nodes}
            selectedNodeId={highLevelSelection.nodeIds[0]}
            onFocusNode={focusHighLevelNode}
          />
        </div>
      ) : null}
      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
          <p className="text-xs text-muted-foreground/70">
            Add high-level phases and primary gates to begin.
          </p>
          <button
            type="button"
            className="pointer-events-auto rounded-md border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted"
            onClick={createDefaultHighLevelProcess}
          >
            Create Default High-Level Process
          </button>
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
