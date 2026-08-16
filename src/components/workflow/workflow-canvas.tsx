"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
  type OnSelectionChangeParams,
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
import { resolveAbsolutePosition, fitCanvasToWorkflow, CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM, FIT_VIEW_PADDING } from "@/lib/flow-helpers";
import { PHASE_HEADER_HEIGHT } from "@/lib/node-layout";
import { GATE_SECTION_GAP, getGateLayoutMetrics } from "@/lib/gate-layout";
import { getWorkflowProgress } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { useShallow } from "zustand/react/shallow";
import { useFlowNodes } from "./use-flow-nodes";
import { useNodeDragHandlers } from "./use-node-drag-handlers";
import type {
  DomainEdge,
  NodeLayout,
  WorkflowNodeType,
} from "@/types/workflow";

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
  // Subscribe to the full state with shallow comparison. Without `useShallow`,
  // zustand returns a new top-level object whenever any field changes (e.g. the
  // `dirty` flag flips), which cascades into `useMemo` recomputations and, in
  // combination with xyflow's StoreUpdater effect, an infinite render loop.
  const {
    file,
    selection,
    search,
    addNode,
    addEdge,
    commitLayoutDrag,
    updateLayouts,
    setViewport,
    selectNodes,
    selectEdge,
    focusedInspectorField,
  } = useWorkflowStore(useShallow((state) => ({
    file: state.file,
    selection: state.selection,
    search: state.search,
    addNode: state.addNode,
    addEdge: state.addEdge,
    commitLayoutDrag: state.commitLayoutDrag,
    updateLayouts: state.updateLayouts,
    setViewport: state.setViewport,
    selectNodes: state.selectNodes,
    selectEdge: state.selectEdge,
    focusedInspectorField: state.focusedInspectorField,
  })));
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
  // Keep a local RF node list so onNodesChange can apply position/select
  // updates synchronously. In controlled mode xyflow will not move nodes
  // unless we feed the applied changes back through the `nodes` prop.
  const { nodes, setNodes, onNodesChange } = useFlowNodes(modelNodes);
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const labelObstacles = useMemo<LabelObstacle[]>(
    () => {
      const cards = nodes
        .filter((node) => !node.hidden && node.type !== "phase")
        .map((node) => {
          const positioned = node as Node & {
            internals?: { positionAbsolute?: { x: number; y: number } };
            positionAbsolute?: { x: number; y: number };
          };
          const position =
            positioned.internals?.positionAbsolute ??
            positioned.positionAbsolute ??
            resolveAbsolutePosition(node, (id) => nodeById.get(id));
          return {
            id: node.id,
            x: position.x,
            y: position.y,
            width: node.measured?.width ?? node.width ?? 240,
            height: node.measured?.height ?? node.height ?? 140,
          };
        });
      const headers = nodes
        .filter((node) => !node.hidden && node.type === "phase")
        .map((node) => {
          const position = resolveAbsolutePosition(node, (id) =>
            nodeById.get(id),
          );
          return {
            id: `${node.id}__header`,
            x: position.x,
            y: position.y,
            width: node.measured?.width ?? node.width ?? 720,
            height: PHASE_HEADER_HEIGHT,
            kind: "phase-header" as const,
          };
        });
      return [...cards, ...headers];
    },
    [nodeById, nodes],
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
        return {
          id: domain.id,
          type: "semantic",
          zIndex: 10,
          source: domain.source,
          target: domain.target,
          sourceHandle: domain.sourceHandle,
          targetHandle: domain.targetHandle,
          selected: selection.edgeId === domain.id,
          markerEnd:
            domain.arrowStyle === "none"
              ? undefined
              : {
                  type: MarkerType.ArrowClosed,
                  color: getSemanticEdgeColor(domain),
                },
          data: {
            domain,
            route: file.layout.edges?.[domain.id]?.points,
            active: progress.activeEdgeIds.has(domain.id),
            obstacles: labelObstacles,
            labelLane: returnIndex >= 0 ? labelLane : labelHugsPath ? 2 : 0,
            labelHugsPath,
            preGateSales,
          },
        };
      });
    },
    [
      file.graph.edges,
      file.graph.nodes,
      edgeIndexes,
      file.layout.edges,
      selection.edgeId,
      labelObstacles,
      progress,
    ],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const source = file.graph.nodes.find((n) => n.id === connection.source);
      const outcome = source?.config.outcomes?.find(
        (o) => o.id === connection.sourceHandle,
      );
      const edge: DomainEdge = {
        id: `edge-${crypto.randomUUID().slice(0, 8)}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        targetHandle: connection.targetHandle || undefined,
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
    [addEdge, file.graph.nodes],
  );
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
  const onSelectionChange = useCallback(
    ({
      nodes: selectedNodes,
      edges: selectedEdges,
    }: OnSelectionChangeParams) => {
      const current = useWorkflowStore.getState().selection;
      if (selectedEdges[0]) {
        if (current.edgeId !== selectedEdges[0].id)
          selectEdge(selectedEdges[0].id);
        return;
      }
      const ids = selectedNodes.map((node) => node.id);
      if (ids.length === 0) {
        const selectedId = current.nodeIds[0];
        const selectedIsPhase =
          current.nodeIds.length === 1 &&
          useWorkflowStore
            .getState()
            .file.graph.nodes.find((node) => node.id === selectedId)?.type ===
            "phase";
        if (selectedIsPhase && !current.edgeId) return;
      }
      if (
        current.edgeId ||
        ids.length !== current.nodeIds.length ||
        ids.some((id, index) => id !== current.nodeIds[index])
      )
        selectNodes(ids);
    },
    [selectEdge, selectNodes],
  );
  const { onNodeDragStart, onNodeDragStop } = useNodeDragHandlers(commitLayoutDrag);
  useEffect(() => {
    const root = wrapper.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      const current = useWorkflowStore.getState().file;
      const patches: Record<string, Partial<NodeLayout>> = {};
      root
        .querySelectorAll<HTMLElement>(
          '[aria-label="Approval conditions card"]',
        )
        .forEach((card) => {
          const flowNode = card.closest<HTMLElement>(".react-flow__node");
          const id = flowNode?.dataset.id;
          const content = card.querySelector<HTMLElement>(
            "[data-conditions-content]",
          );
          const decision = flowNode?.querySelector<HTMLElement>(
            "[data-decision-content]",
          );
          const domain = current.graph.nodes.find((node) => node.id === id);
          if (!id || !content || domain?.type !== "gate") return;
          const metrics = getGateLayoutMetrics(domain);
          const conditionsHeight = Math.ceil(48 + content.scrollHeight + 16);
          // Measure the decision section so a short outcome list collapses the
          // gate instead of leaving empty padding inside the section.
          const decisionHeight = decision
            ? Math.ceil(48 + decision.scrollHeight + 16)
            : metrics.decisionHeight;
          patches[id] = {
            height: metrics.conditionsTop + conditionsHeight + GATE_SECTION_GAP + decisionHeight,
          };
        });
      root
        .querySelectorAll<HTMLElement>("[data-node-content]")
        .forEach((content) => {
          const flowNode = content.closest<HTMLElement>(".react-flow__node");
          const id = flowNode?.dataset.id;
          const domain = current.graph.nodes.find((node) => node.id === id);
          const layout = id ? current.layout.nodes[id] : undefined;
          if (!id || !layout || !domain || domain.type === "gate") return;
          const requiredHeight = Math.ceil(46 + content.scrollHeight);
          if (requiredHeight > layout.height) {
            patches[id] = {
              ...patches[id],
              height: requiredHeight,
            };
          }
        });
      for (const phase of current.graph.nodes.filter(
        (node) => node.type === "phase",
      )) {
        const children = Object.values(current.layout.nodes).filter(
          (layout) => layout.parentId === phase.id,
        );
        if (!children.length) continue;
        patches[phase.id] = {
          width: Math.max(
            420,
            ...children.map((layout) => layout.x + layout.width + 42),
          ),
          height: Math.max(
            260,
            ...children.map(
              (layout) =>
                layout.y +
                (patches[layout.nodeId]?.height ?? layout.height) +
                42,
            ),
          ),
        };
      }
      updateLayouts(patches);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const settleTimers: number[] = [];
    const observer = new ResizeObserver(schedule);
    root
      .querySelectorAll<HTMLElement>(
        "[data-conditions-content], [data-node-content]",
      )
      .forEach((content) => observer.observe(content));
    const measureAfterArrange = () => {
      measure();
      settleTimers.push(window.setTimeout(measure, 120));
      settleTimers.push(window.setTimeout(measure, 320));
    };
    window.addEventListener("workflow:measure-layout", measureAfterArrange);
    frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    settleTimers.push(
      ...[120, 360, 800, 1400].map((delay) =>
        window.setTimeout(measure, delay),
      ),
    );
    return () => {
      cancelAnimationFrame(frame);
      settleTimers.forEach(window.clearTimeout);
      observer.disconnect();
      window.removeEventListener(
        "workflow:measure-layout",
        measureAfterArrange,
      );
    };
  }, [file.graph.nodes, updateLayouts]);
  useEffect(() => {
    const focus = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      flow.fitView({ nodes: [{ id }], duration: 500, padding: 0.8, maxZoom: 1.25 });
    };
    window.addEventListener("workflow:focus-node", focus);
    return () => window.removeEventListener("workflow:focus-node", focus);
  }, [flow]);
  useEffect(() => {
    const fit = () => fitCanvasToWorkflow(flow);
    window.addEventListener("workflow:fit", fit);
    return () => window.removeEventListener("workflow:fit", fit);
  }, [flow]);
  // Export helper: temporarily reshape the React Flow viewport so html-to-image
  // captures the entire workflow at 1:1 scale (instead of the currently
  // visible portion which may be zoomed-out). The previous viewport size and
  // transform are restored after the export completes.
  useEffect(() => {
    const capture = async (
      event: Event & { detail?: { format: "png" | "svg" } },
    ) => {
      const detail = event.detail ?? { format: "png" };
      const wrapperEl = wrapper.current;
      const flowElement = wrapperEl?.querySelector<HTMLElement>(".react-flow");
      const viewport = flowElement?.querySelector<HTMLElement>(
        ".react-flow__viewport",
      );
      if (!flowElement || !viewport) return;
      const bounds = flow.getNodesBounds(flow.getNodes());
      const padding = 48;
      const targetWidth = Math.max(1, Math.round(bounds.width + padding * 2));
      const targetHeight = Math.max(
        1,
        Math.round(bounds.height + padding * 2),
      );
      const original = {
        flowWidth: flowElement.style.width,
        flowHeight: flowElement.style.height,
        viewportTransform: viewport.style.transform,
      };
      flowElement.style.width = `${targetWidth}px`;
      flowElement.style.height = `${targetHeight}px`;
      // Shift the workflow so its top-left corner sits at (padding, padding).
      viewport.style.transform = `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`;
      try {
        const { toPng, toSvg } = await import("html-to-image");
        const backgroundColor =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--canvas-export")
            .trim() || "#f6f7f9";
        const data =
          detail.format === "png"
            ? await toPng(flowElement, {
                backgroundColor,
                pixelRatio: 2,
                width: targetWidth,
                height: targetHeight,
                filter: (node: HTMLElement) =>
                  !node.classList?.contains("react-flow__controls") &&
                  !node.classList?.contains("react-flow__minimap"),
              })
            : await toSvg(flowElement, {
                backgroundColor,
                width: targetWidth,
                height: targetHeight,
                filter: (node: HTMLElement) =>
                  !node.classList?.contains("react-flow__controls") &&
                  !node.classList?.contains("react-flow__minimap"),
              });
        const anchor = document.createElement("a");
        anchor.download = `workflow.${detail.format}`;
        anchor.href = data;
        anchor.click();
      } finally {
        flowElement.style.width = original.flowWidth;
        flowElement.style.height = original.flowHeight;
        viewport.style.transform = original.viewportTransform;
      }
    };
    window.addEventListener("workflow:export", capture as EventListener);
    return () =>
      window.removeEventListener("workflow:export", capture as EventListener);
  }, [flow]);
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
        connectionRadius={32}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={(deleted) =>
          useWorkflowStore
            .getState()
            .deleteNodes(deleted.map((node) => node.id))
        }
        onSelectionChange={onSelectionChange}
        onPaneClick={() => {
          const current = useWorkflowStore.getState().selection;
          if (current.nodeIds.length || current.edgeId) selectNodes([]);
        }}
        onNodeClick={(_, node) => {
          if (node.type === "phase") selectNodes([node.id]);
        }}
        onDoubleClick={quickAdd}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        defaultViewport={file.layout.viewport}
        fitViewOptions={{ padding: FIT_VIEW_PADDING, minZoom: CANVAS_MIN_ZOOM, maxZoom: 1 }}
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
