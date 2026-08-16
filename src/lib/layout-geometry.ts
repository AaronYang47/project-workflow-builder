import type { NodeLayout } from "@/types/workflow";

/** Matches the edge-label chip in `semantic-edge.tsx` (`text-xs` + `px-2.5` + border). */
export const EDGE_LABEL_MAX_WIDTH = 360;
/** Clearance on each side of a label chip so it does not cover node bodies. */
export const EDGE_LABEL_SIDE_PAD = 20;

export function estimateEdgeLabelChip(label: string) {
  const text = label.trim();
  if (!text) return { width: 0, height: 0 };
  const width = Math.min(
    EDGE_LABEL_MAX_WIDTH,
    Math.max(52, text.length * 7 + 20),
  );
  const height =
    28 +
    Math.max(0, Math.ceil((text.length * 7 + 20) / EDGE_LABEL_MAX_WIDTH) - 1) *
      16;
  return { width, height };
}

export function requiredEdgeLabelGap(
  label: string,
  axis: "horizontal" | "vertical",
) {
  const chip = estimateEdgeLabelChip(label);
  if (!chip.width) return 0;
  return axis === "horizontal"
    ? chip.width + EDGE_LABEL_SIDE_PAD * 2
    : chip.height + EDGE_LABEL_SIDE_PAD * 2;
}

export function absoluteLayoutPosition(
  layouts: Record<string, NodeLayout | undefined>,
  id: string,
  seen = new Set<string>(),
): { x: number; y: number } {
  const layout = layouts[id];
  if (!layout || !layout.parentId || seen.has(id))
    return { x: layout?.x || 0, y: layout?.y || 0 };
  seen.add(id);
  const parent = absoluteLayoutPosition(layouts, layout.parentId, seen);
  return { x: parent.x + layout.x, y: parent.y + layout.y };
}
