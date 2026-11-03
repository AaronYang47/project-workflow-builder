import { chapterLabel } from "@/lib/chapter-label";
import { getL1FallbackColor } from "@/lib/node-layout";
import type { DomainNode, HighLevelNode, NodeLayout } from "@/types/workflow";

export interface PhaseGradientColors {
  left: string;
  right: string;
}

export const DEFAULT_STAGE_COLORS: Record<string, string> = {
  "chapter 00": "#10b981",
  "chapter 01": "#059669",
  "chapter 02": "#0284c7",
  "chapter 03": "#2563eb",
  "chapter 04": "#7c3aed",
  "chapter 05": "#9333ea",
  "chapter 06": "#c026d3",
  "chapter 07": "#db2777",
  "chapter 08": "#d97706",
  "chapter 09": "#475569",
};

/** Pick the nearest adjacent L2 Phase colors for a Chapter's left/right blend. */
export function chapterPhaseGradientColors(
  chapter: DomainNode,
  workflowNodes: DomainNode[],
  layouts: Record<string, NodeLayout>,
  highLevelNodes: HighLevelNode[],
): PhaseGradientColors | undefined {
  const chapterLayout = layouts[chapter.id];
  if (!chapterLayout) return undefined;

  const l1ColorByL2NodeId = new Map<string, string>();
  highLevelNodes.forEach((node, index) => {
    const color = node.backgroundColor && node.backgroundColor !== "transparent"
      ? node.backgroundColor
      : getL1FallbackColor(node.title, index);
    for (const linkedId of node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []) {
      if (!l1ColorByL2NodeId.has(linkedId)) l1ColorByL2NodeId.set(linkedId, color);
    }
  });

  const phases = workflowNodes
    .filter((node) => node.type === "phase")
    .flatMap((phase) => {
      const layout = layouts[phase.id];
      if (!layout) return [];
      const matchedL1 = highLevelNodes.find(
        (node) =>
          node.title.trim().toLowerCase() === phase.title.trim().toLowerCase() ||
          (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).some(
            (linkedId) => layouts[linkedId]?.parentId === phase.id,
          ),
      );
      const matchedColor = matchedL1
        ? matchedL1.backgroundColor && matchedL1.backgroundColor !== "transparent"
          ? matchedL1.backgroundColor
          : getL1FallbackColor(matchedL1.title, highLevelNodes.indexOf(matchedL1))
        : undefined;
      const color =
        matchedColor ||
        phase.color ||
        l1ColorByL2NodeId.get(phase.id) ||
        DEFAULT_STAGE_COLORS[chapterLabel(phase.config?.stage, "").toLowerCase()] ||
        "#0d9488";
      return [{ centerX: layout.x + layout.width / 2, color }];
    })
    .sort((left, right) => left.centerX - right.centerX);

  if (phases.length < 2) return undefined;
  const chapterCenterX = chapterLayout.x + chapterLayout.width / 2;
  let nearestPair = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < phases.length - 1; index++) {
    const midpoint = (phases[index].centerX + phases[index + 1].centerX) / 2;
    const distance = Math.abs(midpoint - chapterCenterX);
    if (distance < nearestDistance) {
      nearestPair = index;
      nearestDistance = distance;
    }
  }
  return { left: phases[nearestPair].color, right: phases[nearestPair + 1].color };
}
