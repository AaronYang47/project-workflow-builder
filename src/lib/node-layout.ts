import { getGateLayoutMetrics } from "@/lib/gate-layout";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  isReferenceNodeType,
  type DomainNode,
  type NodeLayout,
} from "@/types/workflow";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
// Phase header is about 96–112px tall. Keep a generous gutter below it so Gate
// modules read as content inside the swimlane instead of touching its title.
export const PHASE_HEADER_HEIGHT = 124;
export const PHASE_CONTENT_TOP = 168;
export const NODE_HEADER_HEIGHT = 56;

/** Width needed so Stage text is not clipped by the Project ID badge. */
export function estimateNodeHeaderWidth(node: DomainNode) {
  const stage = String(node.config.stage || "Stage");
  const stagePx = Math.max(56, Math.ceil(stage.length * 7.6) + 12);
  const badgePx = 132;
  const chrome = 24 + 32 + 57 + 24 + 14 + 32;
  return chrome + stagePx + badgePx;
}

export function getAdaptiveNodeSize(
  node: DomainNode,
  current?: Pick<NodeLayout, "width" | "height">,
) {
  if (node.type === "gate") return getGateLayoutMetrics(node);
  if (node.type === "opportunityValidation") {
    return {
      width: 320,
      height: 210,
    };
  }
  // Split Opportunity evidence cards are detailed form surfaces. Preserve a
  // readable footprint during Auto Arrange instead of treating them like
  // compact generic nodes and collapsing their height back to ~224px.
  if (node.config.opportunitySection) {
    return {
      width: Math.max(current?.width || 0, 420),
      height: Math.max(current?.height || 0, 460),
    };
  }
  if (node.type === "phase")
    return { width: current?.width || 720, height: current?.height || 420 };
  if (node.type === "projectStart") {
    const fallback = getNodeDefinition(node.type).defaultSize;
    const headerWidth = estimateNodeHeaderWidth(node);
    return {
      width: Math.max(current?.width || 0, fallback.width, headerWidth),
      height: Math.max(
        current?.height || 0,
        fallback.height,
        360 + Math.max(1, node.conditions?.length || 0) * 48,
      ),
    };
  }
  if (isReferenceNodeType(node.type)) {
    const fallback = getNodeDefinition(node.type).defaultSize;
    const reference = node.config.reference || {};
    const lineCount = (items: string[] | undefined) =>
      Math.max(
        1,
        (items || []).reduce(
          (total, item) => total + Math.max(1, Math.ceil(item.length / 26)),
          0,
        ),
      );
    let width = fallback.width;
    let height = fallback.height;
    if (node.type === "approvalMatrix")
      height = Math.max(height, 100 + (reference.rows?.length || 0) * 38);
    if (node.type === "controlBackbone" || node.type === "responsibilityLane") {
      width = Math.max(
        width,
        Math.min(6, Math.max(1, reference.sections?.length || 1)) * 255 + 32,
      );
      height = Math.max(
        height,
        126 +
          Math.max(
            0,
            ...(reference.sections || []).map(
              (section) => lineCount(section.items) * 17,
            ),
          ),
      );
    }
    if (node.type === "serviceLegend")
      height = Math.max(
        height,
        90 + Math.ceil((reference.items?.length || 0) / 2) * 48,
      );
    if (node.type === "jobNumbering")
      height = Math.max(
        height,
        116 +
          Math.max(
            lineCount(reference.current),
            lineCount(reference.proposed),
          ) *
            17,
      );
    if (node.type === "businessRules")
      height = Math.max(height, 90 + lineCount(reference.rules) * 24);
    if (node.type === "terminal")
      height = Math.max(
        height,
        100 +
          Math.ceil(node.title.length / 36) * 24 +
          Math.ceil(node.description.length / 60) * 17,
      );
    return {
      width: Math.max(current?.width || 0, width),
      height: Math.max(current?.height || 0, height),
    };
  }

  const terminal = node.type === "start" || node.type === "end";
  const longestWord = `${node.title} ${node.description}`
    .split(/\s+/)
    .reduce((longest, word) => Math.max(longest, word.length), 0);
  const generalCard = node.type === "general";
  const headerWidth = estimateNodeHeaderWidth(node);
  const minWidth = Math.max(
    generalCard ? 300 : terminal ? 210 : 230,
    headerWidth,
  );
  const maxWidth = Math.max(generalCard ? 480 : 380, headerWidth);
  const width = clamp(
    Math.max(minWidth, 142 + node.title.length * 5, 80 + longestWord * 7),
    minWidth,
    maxWidth,
  );
  const titleLines = clamp(
    Math.ceil(node.title.length / Math.max(16, Math.floor((width - 76) / 6.5))),
    1,
    3,
  );
  const descriptionLines =
    terminal || !node.description
      ? 0
      : Math.max(
          1,
          Math.ceil(
            node.description.length /
              Math.max(24, Math.floor((width - 24) / 5.5)),
          ),
        );
  const releaseConditionsHeight = generalCard
    ? 72 + Math.max(1, node.conditions?.length || 0) * 48
    : 0;
  const height = Math.max(
    generalCard ? 224 : terminal ? 104 : 112,
    120 + titleLines * 20 + descriptionLines * 17 + releaseConditionsHeight,
  );

  return { width: Math.round(width), height: Math.round(height) };
}
