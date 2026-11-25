/**
 * React Flow model of the L2 canvas: workflow nodes and edges turned into
 * positioned flow nodes, routed semantic edges and label obstacles.
 * Pure functions; workflow-canvas.tsx memoises them.
 */
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { chapterLabel } from "@/lib/chapter-label";
import { routeChapterConnections } from "@/lib/chapter-edge-routing";
import { estimatePhaseHeaderHeight } from "@/lib/phase-layout";
import { getSemanticEdgeColor, type LabelObstacle } from "@/lib/semantic-edge-geometry";
import { isCommercialRouteGroupNode } from "@/lib/commercial-routes";
import { PHASE_HEADER_HEIGHT, getL1FallbackColor } from "@/lib/node-layout";
import { chapterPhaseGradientColors, DEFAULT_STAGE_COLORS } from "@/lib/chapter-phase-gradient";
import { isReferenceNodeType, type DomainEdge } from "@/types/workflow";
import { getExecutionSummary } from "@/lib/execution";
import { matrixKindForNode } from "@/lib/matrix-config";
import type { WorkflowFile } from "@/types/workflow";
import { applyFobYardSkip, fobYardSkippedIds } from "@/lib/fob-yard";
import type { getWorkflowProgress } from "@/lib/workflow-progress";

export type CanvasProgress = ReturnType<typeof getWorkflowProgress>;

export function buildCanvasNodes(
  file: WorkflowFile,
  search: string,
  selection: { nodeIds: string[] },
  progress: CanvasProgress,
): Node[] {
  const highLevelNodes = file.highLevel?.graph.nodes || [];
  const fobYardSkipped = fobYardSkippedIds(file).l2;
  const l1PhaseColorByL2NodeId = new Map<string, string>();
  highLevelNodes.forEach((hlNode, index) => {
    const color =
      hlNode.backgroundColor && hlNode.backgroundColor !== "transparent"
        ? hlNode.backgroundColor
        : getL1FallbackColor(hlNode.title, index);
    const linkedIds = hlNode.linkedLayer2NodeIds ?? hlNode.linkedDetailedNodeIds ?? [];
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
      const searchMatch = q && `${domain.title} ${domain.description}`.toLowerCase().includes(q);
      const isContainer = domain.type === "phase" || domain.type === "gate";
      const rendererType = isContainer
        ? "phase"
        : isReferenceNodeType(domain.type) && !matrixKindForNode(domain)
          ? "reference"
          : "workflow";
      const stageKey = chapterLabel(domain.config?.stage, "").toLowerCase();
      const stageFallback = DEFAULT_STAGE_COLORS[stageKey];

      // 1. Direct L1 link for the step
      const l1DirectColor = l1PhaseColorByL2NodeId.get(domain.id);

      // 2. Or via parent container (e.g. Gate or Phase)
      const parentLayout = layout?.parentId ? file.layout.nodes[layout.parentId] : undefined;
      const parentL1Color = layout?.parentId
        ? l1PhaseColorByL2NodeId.get(layout.parentId)
        : undefined;
      const grandparentL1Color = parentLayout?.parentId
        ? l1PhaseColorByL2NodeId.get(parentLayout.parentId)
        : undefined;

      // 3. Or via Phase container color if this step is inside a Phase
      const parentDomain = layout?.parentId
        ? file.graph.nodes.find((n) => n.id === layout.parentId)
        : undefined;
      const grandParentDomain = parentLayout?.parentId
        ? file.graph.nodes.find((n) => n.id === parentLayout.parentId)
        : undefined;
      const containerColor =
        (parentDomain?.type === "phase"
          ? parentDomain.color || l1PhaseColorByL2NodeId.get(parentDomain.id)
          : undefined) ??
        (grandParentDomain?.type === "phase"
          ? grandParentDomain.color || l1PhaseColorByL2NodeId.get(grandParentDomain.id)
          : undefined);

      // 4. L1 color has highest priority for steps, so steps strictly follow L1 Phase card color!
      const l1ResolvedColor =
        l1DirectColor ?? parentL1Color ?? grandparentL1Color ?? containerColor;

      let resolvedContainerColor = domain.color;
      if (domain.type === "phase") {
        const matchedL1 = highLevelNodes.find(
          (hl) =>
            hl.title.trim().toLowerCase() === domain.title.trim().toLowerCase() ||
            (hl.linkedLayer2NodeIds ?? []).some(
              (id) => file.layout.nodes[id]?.parentId === domain.id,
            ),
        );
        if (matchedL1) {
          resolvedContainerColor =
            matchedL1.backgroundColor && matchedL1.backgroundColor !== "transparent"
              ? matchedL1.backgroundColor
              : getL1FallbackColor(matchedL1.title, highLevelNodes.indexOf(matchedL1));
        }
      }

      const phaseColor =
        domain.type === "gate"
          ? domain.color || "#7c3aed"
          : isContainer
            ? resolvedContainerColor || l1ResolvedColor || stageFallback || "#0d9488"
            : l1ResolvedColor || domain.color || stageFallback || "#0d9488";
      const phaseGradientColors =
        (domain.type === "general" || domain.type === "projectStart") &&
        domain.config.blendAdjacentPhaseColors === true
          ? chapterPhaseGradientColors(domain, file.graph.nodes, file.layout.nodes, highLevelNodes)
          : undefined;
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
        className: fobYardSkipped.has(domain.id) ? "fob-yard-skipped" : undefined,
        data: {
          domain,
          reached: progress.reachedNodeIds.has(domain.id),
          emphasized: Boolean(searchMatch),
          dimmed: Boolean(q && !searchMatch),
          phaseColor,
          phaseGradientColors,
          executionSummary: getExecutionSummary(domain.id, file.execution?.items, file.operations, {
            checklistOnly: true,
          }),
        },
      };
    })
    .sort((a, b) => {
      const aIsContainer = a.type === "phase";
      const bIsContainer = b.type === "phase";
      return aIsContainer ? -1 : bIsContainer ? 1 : 0;
    });
}

export function buildLabelObstacles(file: WorkflowFile): LabelObstacle[] {
  const cards = file.graph.nodes
    .filter((node) => node.type !== "phase" && node.type !== "gate")
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
        height: Math.max(
          PHASE_HEADER_HEIGHT,
          estimatePhaseHeaderHeight(node, layout?.width || 720),
        ),
        kind: "phase-header" as const,
      };
    });

  return [...cards, ...headers];
}

export function indexCanvasEdges(file: WorkflowFile) {
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
}

export function buildCanvasEdges(
  file: WorkflowFile,
  edgeIndexes: ReturnType<typeof indexCanvasEdges>,
  labelObstacles: LabelObstacle[],
  progress: CanvasProgress,
  selection: { edgeId?: string },
): Edge[] {
  const chapterConnections = routeChapterConnections(file);
  const fobYardSkipped = fobYardSkippedIds(file).l2;
  const nodesById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const supportingEdgeLanes = new Map(
    file.graph.edges
      .map((edge, index) => ({ edge, index }))
      .filter(({ edge }) => edge.type === "supporting" || edge.type === "dependency")
      // Lower targets get the inner lane. Upper targets nest outside them,
      // which keeps vertical target approaches from crossing lower edges.
      .sort(
        (left, right) =>
          (file.layout.nodes[right.edge.target]?.y ?? 0) -
            (file.layout.nodes[left.edge.target]?.y ?? 0) || left.index - right.index,
      )
      .map(({ edge }, index) => [edge.id, index]),
  );
  // FOB yard: display-only route from the card before the skipped Phase to
  // Final Close, drawn underneath the skipped Phase frame. Never saved.
  const fobYardBypass = fobYardSkipped.size
    ? applyFobYardSkip(file)
        .graph.edges.filter((edge) => edge.id.startsWith("fob-yard-"))
        .map((edge): Edge => {
          // Route under the outermost skipped frame of every skipped card.
          const skippedIds = String(edge.customFields.fobYardSkippedNodeIds ?? "")
            .split(",")
            .filter(Boolean)
            .map((id) => {
              let top = id;
              for (
                let parentId = file.layout.nodes[top]?.parentId;
                parentId && fobYardSkipped.has(parentId);
                parentId = file.layout.nodes[parentId]?.parentId
              )
                top = parentId;
              return top;
            });
          return {
            id: edge.id,
            type: "fobYardBypass",
            zIndex: 10,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            animated: progress.activeEdgeIds.has(edge.id),
            selectable: false,
            deletable: false,
            focusable: false,
            reconnectable: false,
            className: "fob-yard-bypass",
            data: {
              skippedNodeIds: [...new Set(skippedIds)],
              active: progress.activeEdgeIds.has(edge.id),
            },
            // Green once the flow reaches it (release conditions met), grey before.
            style: progress.activeEdgeIds.has(edge.id)
              ? { stroke: "#159a75", strokeWidth: 3.2, strokeLinecap: "round" }
              : {
                  stroke: "#94a3b8",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeDasharray: "7 5",
                },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: progress.activeEdgeIds.has(edge.id) ? "#159a75" : "#94a3b8",
            },
          };
        })
    : [];
  const edges = file.graph.edges.map((domain) => {
    const siblingEdges = edgeIndexes.siblings.get(domain.source) || [];
    const siblingIndex = siblingEdges.findIndex((edge) => edge.id === domain.id);
    const returnIndex = edgeIndexes.returnIndex.get(domain.id) ?? -1;
    const labelHugsPath =
      returnIndex >= 0 ||
      domain.sourceHandle === "yes" ||
      ["success", "approval"].includes(domain.type);
    const labelLane =
      returnIndex >= 0 ? returnIndex : (siblingIndex - (siblingEdges.length - 1) / 2) * 52;
    const sourceNode = nodesById.get(domain.source);
    const targetNode = nodesById.get(domain.target);
    const preGateSales =
      domain.customFields.workflowSection === "Pre-Gate Sales" ||
      sourceNode?.metadata.workflowSection === "Pre-Gate Sales" ||
      targetNode?.metadata.workflowSection === "Pre-Gate Sales" ||
      sourceNode?.type === "projectStart";
    const active = progress.activeEdgeIds.has(domain.id);
    const activeColor = active ? getSemanticEdgeColor(domain) : "#94a3b8";
    const supportingLane = supportingEdgeLanes.get(domain.id);
    // FOB yard on: the line into the skipped Phase is the site route, tagged "Site".
    const siteRoute = fobYardSkipped.has(domain.target) && !fobYardSkipped.has(domain.source);

    return {
      id: domain.id,
      type: "semantic",
      zIndex: active ? 12 : 10,
      className: siteRoute
        ? "fob-yard-skipped fob-yard-site"
        : fobYardSkipped.has(domain.source) || fobYardSkipped.has(domain.target)
          ? "fob-yard-skipped"
          : undefined,
      source: domain.source,
      target: domain.target,
      sourceHandle: domain.sourceHandle,
      targetHandle: domain.targetHandle,
      reconnectable: true,
      selected: selection.edgeId === domain.id,
      markerEnd:
        domain.arrowStyle === "none" ||
        (sourceNode &&
          isCommercialRouteGroupNode(sourceNode) &&
          targetNode?.type === "estimation" &&
          !active)
          ? undefined
          : {
              type: MarkerType.ArrowClosed,
              color: activeColor,
            },
      data: {
        domain,
        chapterConnection: chapterConnections[domain.id],
        route: file.layout.edges?.[domain.id]?.points,
        active,
        displayColor: activeColor,
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
        siteRoute,
        siblingIndex: Math.max(0, siblingIndex),
        siblingCount: siblingEdges.length,
      },
    };
  });
  return [...edges, ...fobYardBypass];
}
