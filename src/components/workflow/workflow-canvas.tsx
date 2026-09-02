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
import { PHASE_HEADER_HEIGHT, getAdaptiveNodeSize } from "@/lib/node-layout";
import { getWorkflowProgress } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { useShallow } from "zustand/react/shallow";
import { useFlowNodes } from "./use-flow-nodes";
import { useNodeDragHandlers } from "./use-node-drag-handlers";
import { isApprovedEdge, isDeniedEdge } from "@/lib/workflow-graph";
import { isReferenceNodeType, type DomainEdge, type DomainNode, type WorkflowNodeType } from "@/types/workflow";
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

const DEFAULT_STAGE_COLORS: Record<string, string> = {
  "stage 00": "#10b981",
  "stage 01": "#059669",
  "stage 02": "#0284c7",
  "stage 03": "#2563eb",
  "stage 04": "#7c3aed",
  "stage 05": "#9333ea",
  "stage 06": "#c026d3",
  "stage 07": "#db2777",
  "stage 08": "#d97706",
  "stage 09": "#475569",
};

function getL1FallbackColor(title: string, index: number): string {
  const t = title.toLowerCase();
  if (t.includes("initial") || t.includes("start")) return "#10b981";
  if (t.includes("qualification") || t.includes("opportunity")) return "#059669";
  if (t.includes("g1") || t.includes("commercial")) return "#06b6d4";
  if (t.includes("g2") || t.includes("technical")) return "#0284c7";
  if (t.includes("g3") || t.includes("production")) return "#2563eb";
  if (t.includes("g4") || t.includes("factory")) return "#7c3aed";
  if (t.includes("g5") || t.includes("warranty")) return "#9333ea";
  if (t.includes("commissioning")) return "#d97706";
  if (t.includes("close")) return "#475569";
  const palette = [
    "#10b981",
    "#059669",
    "#06b6d4",
    "#0284c7",
    "#2563eb",
    "#7c3aed",
    "#9333ea",
    "#d97706",
    "#475569",
  ];
  return palette[index % palette.length];
}

  const modelNodes = useMemo<Node[]>(() => {
    const highLevelNodes = file.highLevel?.graph.nodes || [];
    const l1PhaseColorByL2NodeId = new Map<string, string>();
    highLevelNodes.forEach((hlNode, index) => {
      const color =
        hlNode.backgroundColor && hlNode.backgroundColor !== "transparent"
          ? hlNode.backgroundColor
          : getL1FallbackColor(hlNode.title, index);
      const linkedIds =
        hlNode.linkedLayer2NodeIds ?? hlNode.linkedDetailedNodeIds ?? [];
      for (const linkedId of linkedIds) {
        if (!l1PhaseColorByL2NodeId.has(linkedId)) {
          l1PhaseColorByL2NodeId.set(linkedId, color);
        }
      }
    });

    return file.graph.nodes
      .map((domain): Node => {
        const layout = file.layout.nodes[domain.id];
        const q = search.trim().toLowerCase();
        const searchMatch =
          q &&
          `${domain.title} ${domain.description}`.toLowerCase().includes(q);
        const isContainer = domain.type === "phase" || domain.type === "gate";
        const rendererType =
          isContainer
            ? "phase"
            : isReferenceNodeType(domain.type) && !matrixKindForNode(domain)
              ? "reference"
            : "workflow";
        const stageKey = (domain.config?.stage || "").toLowerCase();
        const stageFallback = DEFAULT_STAGE_COLORS[stageKey];
        const phaseColor =
          domain.color ||
          (l1PhaseColorByL2NodeId.get(domain.id) ??
            (layout?.parentId ? l1PhaseColorByL2NodeId.get(layout.parentId) : undefined)) ||
          stageFallback ||
          "#0d9488";
        return {
          id: domain.id,
          type: rendererType,
          position: { x: layout?.x || 0, y: layout?.y || 0 },
          width: layout?.width,
          height: layout?.height,
          parentId: undefined,
          zIndex: isContainer ? 0 : 10,
          selected: selection.nodeIds.includes(domain.id),
          draggable: true,
          dragHandle: isContainer ? ".phase-drag-handle" : undefined,
          style: isContainer ? { pointerEvents: "none" } : undefined,
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
      .sort((a, b) => {
        const aIsContainer = a.type === "phase";
        const bIsContainer = b.type === "phase";
        return aIsContainer ? -1 : bIsContainer ? 1 : 0;
      });
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

      const highLevelNodes = file.highLevel?.graph.nodes || [];
      const getPhaseInfo = (targetNode: DomainNode) => {
        // 1. Direct L1 link
        const directL1 = highLevelNodes.find((hl) => {
          const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
          return ids.includes(targetNode.id);
        });
        if (directL1) {
          return {
            title: directL1.title,
            color: directL1.backgroundColor || "#0d9488",
          };
        }
        // 2. Stage match
        if (targetNode.config?.stage) {
          const stageStr = String(targetNode.config.stage).trim().toLowerCase();
          const stageMatch = highLevelNodes.find(
            (hl) => hl.title.trim().toLowerCase() === stageStr,
          );
          if (stageMatch) {
            return {
              title: stageMatch.title,
              color: stageMatch.backgroundColor || "#0d9488",
            };
          }
          return {
            title: String(targetNode.config.stage),
            color: targetNode.color || "#0d9488",
          };
        }
        return {
          title: targetNode.title || "Phase",
          color: targetNode.color || "#0d9488",
        };
      };

      const resolveAbs = (id: string) => {
        const l = file.layout.nodes[id];
        if (!l) return { x: 0, y: 0, width: 270, height: 220 };
        let x = l.x;
        let y = l.y;
        let currParentId = l.parentId;
        while (currParentId && file.layout.nodes[currParentId]) {
          const pl = file.layout.nodes[currParentId];
          x += pl.x;
          y += pl.y;
          currParentId = pl.parentId;
        }
        const domain = file.graph.nodes.find((n) => n.id === id);
        const adaptive = domain ? getAdaptiveNodeSize(domain, l) : { width: 280, height: 360 };
        return {
          x,
          y,
          width: l.width || adaptive.width,
          height: l.height || adaptive.height,
        };
      };

      if (type === "phase") {
        // Step nodes (non-phase, non-gate)
        const stepNodes = file.graph.nodes.filter(
          (n) => n.type !== "phase" && n.type !== "gate",
        );

        // Find which step node is targeted (cursor is dropped above it or over it)
        const targetNode = stepNodes.find((n) => {
          const bounds = resolveAbs(n.id);
          const xMatch =
            position.x >= bounds.x - 60 &&
            position.x <= bounds.x + bounds.width + 60;
          const yMatch =
            position.y >= bounds.y - 240 &&
            position.y <= bounds.y + bounds.height + 60;
          return xMatch && yMatch;
        });

        if (targetNode) {
          // Determine covered nodes
          let coveredNodes = [targetNode];
          if (
            selection.nodeIds.length > 1 &&
            selection.nodeIds.includes(targetNode.id)
          ) {
            coveredNodes = stepNodes.filter((n) =>
              selection.nodeIds.includes(n.id),
            );
          } else {
            const targetStage = targetNode.config?.stage;
            if (targetStage) {
              const sameStageNodes = stepNodes.filter(
                (n) =>
                  n.config?.stage === targetStage &&
                  !file.layout.nodes[n.id]?.parentId,
              );
              if (sameStageNodes.length > 0) {
                coveredNodes = sameStageNodes;
              }
            }
          }

          // Compute enclosing bounding box
          const boundsList = coveredNodes.map((n) => resolveAbs(n.id));
          const minX = Math.min(...boundsList.map((b) => b.x));
          const maxX = Math.max(...boundsList.map((b) => b.x + b.width));
          const minY = Math.min(...boundsList.map((b) => b.y));
          const maxY = Math.max(...boundsList.map((b) => b.y + b.height));

          const PAD_X = 40;
          const PAD_TOP = 176;
          const PAD_BOTTOM = 52;

          const phaseInfo = getPhaseInfo(targetNode);
          const phaseProps = {
            x: minX - PAD_X,
            y: minY - PAD_TOP,
            width: maxX - minX + PAD_X * 2,
            height: maxY - minY + PAD_TOP + PAD_BOTTOM,
            title: phaseInfo.title,
            color: phaseInfo.color,
          };

          addPhaseWrappingNodes(
            phaseProps,
            coveredNodes.map((n) => n.id),
          );
          return;
        }

        // Standalone phase if not dropped over a node
        addNode("phase", position);
        return;
      }

      if (type === "gate") {
        // 1. Check if dropped near or below an existing Phase
        const phaseNodes = file.graph.nodes.filter((n) => n.type === "phase");
        const targetPhase = phaseNodes.find((p) => {
          const l = file.layout.nodes[p.id];
          if (!l) return false;
          return (
            position.x >= l.x - 80 &&
            position.x <= l.x + l.width + 80 &&
            position.y >= l.y - 60 &&
            position.y <= l.y + l.height + 350
          );
        });

        if (targetPhase) {
          const pl = file.layout.nodes[targetPhase.id]!;
          const gateWidth = pl.width || 620;
          const gateX = pl.x;
          const gateY = pl.y + pl.height + 28;

          addGateUnderNode({
            x: gateX,
            y: gateY,
            width: gateWidth,
            height: 220,
            title: `${targetPhase.title} · Gate`,
            color: targetPhase.color || "#7c3aed",
            stage: targetPhase.title,
          });
          return;
        }

        // 2. Check if dropped near or below a Step node
        const stepNodes = file.graph.nodes.filter(
          (n) => n.type !== "phase" && n.type !== "gate",
        );
        const targetStep = stepNodes.find((n) => {
          const bounds = resolveAbs(n.id);
          return (
            position.x >= bounds.x - 60 &&
            position.x <= bounds.x + bounds.width + 60 &&
            position.y >= bounds.y - 60 &&
            position.y <= bounds.y + bounds.height + 350
          );
        });

        if (targetStep) {
          const stepLayout = file.layout.nodes[targetStep.id];
          if (stepLayout?.parentId && file.layout.nodes[stepLayout.parentId]) {
            const pl = file.layout.nodes[stepLayout.parentId]!;
            const parentPhase = file.graph.nodes.find(
              (n) => n.id === stepLayout.parentId,
            );
            const gateWidth = 620;
            const gateX = pl.x + Math.max(0, (pl.width - gateWidth) / 2);
            const gateY = pl.y + pl.height + 40;

            addGateUnderNode({
              x: gateX,
              y: gateY,
              width: gateWidth,
              height: 268,
              title: parentPhase ? `${parentPhase.title} · Gate` : "Gate",
              color: parentPhase?.color || "#7c3aed",
              stage: parentPhase?.title,
            });
            return;
          }

          const bounds = resolveAbs(targetStep.id);
          const gateWidth = 620;
          const gateX = bounds.x + Math.max(0, (bounds.width - gateWidth) / 2);
          const gateY = bounds.y + bounds.height + 40;
          const phaseInfo = getPhaseInfo(targetStep);

          addGateUnderNode({
            x: gateX,
            y: gateY,
            width: gateWidth,
            height: 268,
            title: `${phaseInfo.title} · Gate`,
            color: phaseInfo.color,
            stage: phaseInfo.title,
          });
          return;
        }

        // Standalone gate
        addGateUnderNode({
          x: position.x,
          y: position.y,
          width: 620,
          height: 268,
        });
        return;
      }

      // Default for other node types
      const phase = file.graph.nodes
        .filter((node) => node.type === "phase")
        .map((node) => file.layout.nodes[node.id])
        .find(
          (layout) =>
            layout &&
            position.x >= layout.x &&
            position.x <= layout.x + layout.width &&
            position.y >= layout.y &&
            position.y <= layout.y + layout.height,
        );

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
    [
      addGateUnderNode,
      addNode,
      addPhaseWrappingNodes,
      file.graph.nodes,
      file.highLevel?.graph.nodes,
      file.layout.nodes,
      flow,
      selection.nodeIds,
    ],
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
    if (activationCentered.current || focusNodeIdsRef.current?.length || focusNodeIds?.length) return;

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
          return flow.setCenter(
            position.x + width / 2,
            position.y + height / 2,
            { duration: 500, zoom: 0.85 },
          );
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
