import {
  type Layer,
  type FlowStatus,
  type PositionedCard,
  type PyramidEdge,
  L1_GAP,
  L2_GAP,
  V_GAP,
  L1_ACTION_GAP,
  L2_ACTION_GAP,
  L2_ACTION_H,
  L3_STACK_GAP,
  L3_GAP,
  PAD,
  LAYER_RAIL,
  measureCard,
  l2FlowStatus,
  l1FlowStatus,
  edgeFlows,
  UNLINKED_L1_ID,
  buildGlobalPyramidGroups,
  assignEdgePaths,
} from "@/lib/process-locator/pyramid-layout";
import type { ViewLayer } from "@/lib/process-locator/pyramid-layout";
import type { DomainEdge, DomainNode, ExecutionItem, HighLevelEdge, HighLevelNode } from "@/types/workflow";
import type { ProjectOperations } from "@/types/project-operations";
import { getWorkflowProgress } from "@/lib/workflow-progress";

export type PyramidDiagramInput = {
  highLevelNodes: HighLevelNode[];
  highLevelEdges: HighLevelEdge[];
  layer2Edges: DomainEdge[];
  nodes: DomainNode[];
  executionItems: ExecutionItem[];
  /** The L1 step that owns the current focus. */
  focusL1Id: string | undefined;
  /** The L2 node in focus (selected, or the one open in L3). */
  focusLayer2Id: string | undefined;
  viewLayer: ViewLayer;
  collapsedL1Ids: Set<string>;
  collapsedL2Ids: Set<string>;
  executionNodeId?: string | null;
  operations?: ProjectOperations;
};

/**
 * Lays out the Process Locator pyramid: L1 steps, their L2 nodes and L3
 * items as positioned cards, the routed connectors between them, layer bands
 * and the first blocked or stopped card. Pure; the widget memoises it.
 */
export function buildPyramidDiagram({ highLevelNodes, highLevelEdges, layer2Edges, nodes, executionItems, focusL1Id, focusLayer2Id, viewLayer, collapsedL1Ids, collapsedL2Ids, executionNodeId, operations }: PyramidDiagramInput) {
  const groups = buildGlobalPyramidGroups(
    highLevelNodes,
    nodes,
    executionItems,
    layer2Edges,
  );

  const progress = getWorkflowProgress(nodes, layer2Edges, executionItems, operations);
  const l2Statuses = new Map<string, FlowStatus>();
  for (const group of groups) {
    for (const branch of group.l2) {
      l2Statuses.set(
        branch.l2.id,
        l2FlowStatus(
          branch.l2.id,
          nodes,
          progress.reachedNodeIds,
          executionItems,
          operations,
        ),
      );
    }
  }

  const cards: PositionedCard[] = [];
  const edges: PyramidEdge[] = [];
  const sized = groups.map((group) => ({
    l1: { ...group.l1, ...measureCard(group.l1) },
    l2: group.l2.map((branch) => ({
      l2: { ...branch.l2, ...measureCard(branch.l2) },
      l3: (branch.l3 || []).map((l3Card) => ({
        ...l3Card,
        ...measureCard(l3Card),
      })),
    })),
  }));
  const l1Height = Math.max(48, ...sized.map((group) => group.l1.height));
  const l2Height = Math.max(
    44,
    ...sized.flatMap((group) => group.l2.map((branch) => branch.l2.height)),
  );
  const l1Y = PAD;
  const l2Y = PAD + l1Height + V_GAP;

  const rowWidth = (
    widths: number[],
    gap: number,
  ) =>
    widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, widths.length - 1) * gap;

  const l2Items = sized.flatMap((group, groupIndex) =>
    collapsedL1Ids.has(group.l1.id)
      ? []
      : group.l2.map((branch, branchIndex) => ({
          branch,
          groupIndex,
          isFirstInGroup: branchIndex === 0,
        })),
  );
  const l2RowWidth = rowWidth(
    l2Items.map((item) => item.branch.l2.width),
    L2_GAP,
  );
  const l1RowWidth = rowWidth(
    sized.map((group) => group.l1.width),
    L1_GAP,
  );
  const baseWidth = Math.max(l1RowWidth, l2RowWidth, 320);
  const l1Start = PAD + (baseWidth - l1RowWidth) / 2;
  const l2Start = PAD + (baseWidth - l2RowWidth) / 2;

  let layerX = l1Start;
  const l1Cards = sized.map((group) => {
    const l1Status =
      group.l1.id === UNLINKED_L1_ID
        ? "locked"
        : l1FlowStatus(group.l2, l2Statuses);
    const l1Card: PositionedCard = {
      ...group.l1,
      x: layerX,
      y: l1Y,
      width: group.l1.width,
      height: l1Height,
      current: group.l1.id === focusL1Id && viewLayer === "L1",
      breathe: false,
      status: l1Status,
    };
    cards.push(l1Card);
    layerX += group.l1.width + L1_GAP;
    return l1Card;
  });

  const l1Actions = l1Cards.flatMap((l1Card, groupIndex) => {
    const group = sized[groupIndex];
    if (!group?.l2.length) return [];
    return [
      {
        id: l1Card.id,
        label: l1Card.label,
        x: l1Card.x,
        y: l1Card.y + l1Card.height + L1_ACTION_GAP,
        width: l1Card.width,
        count: group.l2.length,
      },
    ];
  });

  const l2Actions: {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    count: number;
  }[] = [];

  let maxL3Bottom = l2Y + l2Height;

  layerX = l2Start;
  l2Items.forEach(({ branch, groupIndex, isFirstInGroup }) => {
    const l1Card = l1Cards[groupIndex];
    if (!l1Card) return;
    const l2Status = l2Statuses.get(branch.l2.id) || "locked";
    const l2Card: PositionedCard = {
      ...branch.l2,
      x: layerX,
      y: l2Y,
      width: branch.l2.width,
      height: l2Height,
      current: branch.l2.id === focusLayer2Id && viewLayer === "L2",
      breathe: false,
      status: l2Status,
    };
    cards.push(l2Card);
    if (isFirstInGroup) {
      edges.push({
        id: `${l1Card.id}->${l2Card.id}`,
        from: l1Card,
        to: l2Card,
        direction: "down",
        flowing: edgeFlows(l1Card.status, l2Card.status),
        path: "",
      });
    }

    if (branch.l3 && branch.l3.length > 0) {
      l2Actions.push({
        id: l2Card.id,
        label: l2Card.label,
        x: l2Card.x,
        y: l2Card.y + l2Card.height + L2_ACTION_GAP,
        width: l2Card.width,
        count: branch.l3.length,
      });

      const isL2Expanded = !collapsedL2Ids.has(l2Card.id);
      if (isL2Expanded) {
        let currL3Y = l2Card.y + l2Card.height + L2_ACTION_GAP + L2_ACTION_H + L3_GAP;
        let prevL3Card: PositionedCard | null = null;

        branch.l3.forEach((l3Item, l3Idx) => {
          const l3Width = Math.min(l2Card.width, l3Item.width);
          const l3X = l2Card.x + (l2Card.width - l3Width) / 2;
          const l3Height = l3Item.height;

          const domainNode = nodes.find((n) => n.id === branch.l2.id);
          const condition = domainNode?.conditions?.find((c) => c.id === l3Item.conditionId);
          const isPassed = condition?.checked;
          const l3Status: FlowStatus = isPassed
            ? "open"
            : l2Card.status === "open" || l2Card.status === "current"
              ? "open"
              : "locked";

          const isCurrentL3 = Boolean(
            (viewLayer === "L3" && executionNodeId === branch.l2.id && l3Idx === 0) ||
            (viewLayer === "L3" && l3Item.conditionId && condition?.id === l3Item.conditionId && executionNodeId === branch.l2.id)
          );

          const l3Card: PositionedCard = {
            ...l3Item,
            x: l3X,
            y: currL3Y,
            width: l3Width,
            height: l3Height,
            current: isCurrentL3,
            breathe: false,
            status: l3Status,
          };
          cards.push(l3Card);

          if (l3Idx === 0) {
            edges.push({
              id: `${l2Card.id}->${l3Card.id}`,
              from: l2Card,
              to: l3Card,
              direction: "down",
              flowing: edgeFlows(l2Card.status, l3Card.status),
              path: "",
            });
          } else if (prevL3Card) {
            edges.push({
              id: `${prevL3Card.id}->${l3Card.id}`,
              from: prevL3Card,
              to: l3Card,
              direction: "down",
              flowing: edgeFlows(prevL3Card.status, l3Card.status),
              path: "",
            });
          }

          prevL3Card = l3Card;
          currL3Y += l3Height + L3_STACK_GAP;
          if (currL3Y > maxL3Bottom) {
            maxL3Bottom = currL3Y;
          }
        });
      }
    }

    layerX += branch.l2.width + L2_GAP;
  });

  const cardById = (layer: Layer, id: string) =>
    cards.find((card) => card.layer === layer && card.id === id);

  const l1Links =
    highLevelEdges.length > 0
      ? highLevelEdges
      : highLevelNodes.slice(1).map((node, index) => ({
          id: `l1-seq-${index}`,
          source: highLevelNodes[index].id,
          target: node.id,
        }));
  for (const edge of l1Links) {
    const from = cardById("L1", edge.source);
    const to = cardById("L1", edge.target);
    if (!from || !to || from.id === UNLINKED_L1_ID || to.id === UNLINKED_L1_ID) {
      continue;
    }
    edges.push({
      id: `l1-${edge.id || `${edge.source}-${edge.target}`}`,
      from,
      to,
      direction: "across",
      flowing: edgeFlows(from.status, to.status),
      path: "",
    });
  }

  for (const edge of layer2Edges) {
    const from = cardById("L2", edge.source);
    const to = cardById("L2", edge.target);
    if (!from || !to) continue;
    edges.push({
      id: `l2-${edge.id || `${edge.source}-${edge.target}`}`,
      from,
      to,
      direction: "across",
      flowing: edgeFlows(from.status, to.status),
      path: "",
    });
  }

  for (const card of cards) card.x += LAYER_RAIL;
  for (const action of l1Actions) action.x += LAYER_RAIL;
  for (const action of l2Actions) action.x += LAYER_RAIL;

  assignEdgePaths(cards, edges);

  const hereL1 =
    cards.find((card) => card.layer === "L1" && card.status === "current")?.id ||
    focusL1Id;
  const hereL2Children = edges
    .filter((edge) => edge.from.id === hereL1 && edge.to.layer === "L2")
    .map((edge) => edge.to.id);
  const hereL2 =
    cards.find((card) => card.layer === "L2" && card.status === "current")?.id ||
    cards.find(
      (card) =>
        card.layer === "L2" &&
        hereL2Children.includes(card.id) &&
        (card.status === "current" || card.status === "open"),
    )?.id ||
    focusLayer2Id;
  const hereL3 =
    cards.find((card) => card.layer === "L3" && card.status === "current")?.id ||
    (viewLayer === "L3" && executionNodeId
      ? cards.find((card) => card.layer === "L3" && card.nodeId === executionNodeId)?.id
      : undefined);

  for (const card of cards) {
    card.breathe =
      (card.layer === "L1" && card.id === hereL1) ||
      (card.layer === "L2" && card.id === hereL2) ||
      (card.layer === "L3" && card.id === hereL3);
  }

  const width = Math.max(
    360,
    cards.reduce((max, card) => Math.max(max, card.x + card.width), 0) + PAD,
  );
  const height = Math.max(l2Y + l2Height + PAD, maxL3Bottom + PAD);

  const stopCard =
    cards.find((card) => card.status === "blocked") ||
    cards.find((card) => card.status === "current");

  const l3Cards = cards.filter((c) => c.layer === "L3");
  const minL3Y = l3Cards.length > 0 ? Math.min(...l3Cards.map((c) => c.y)) : l2Y + l2Height + 40;
  const maxL3Y = l3Cards.length > 0 ? Math.max(...l3Cards.map((c) => c.y + c.height)) : minL3Y + 44;

  const layerBands = [
    {
      id: "L1" as const,
      title: "High Level",
      y: l1Y,
      height: l1Height,
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
    },
    {
      id: "L2" as const,
      title: "Detailed Workflow",
      y: l2Y,
      height: l2Height,
      dot: "bg-sky-500",
      text: "text-sky-700 dark:text-sky-300",
    },
    {
      id: "L3" as const,
      title: "Execution Layer",
      y: minL3Y,
      height: Math.max(44, maxL3Y - minL3Y),
      dot: "bg-violet-500",
      text: "text-violet-700 dark:text-violet-300",
    },
  ];

  return {
    cards,
    edges,
    l1Actions,
    l2Actions,
    layerBands,
    width,
    height,
    groupCount: groups.length,
    stopCard,
  };
}
