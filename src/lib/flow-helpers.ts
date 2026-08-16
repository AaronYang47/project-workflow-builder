import type { Node } from "@xyflow/react";

type Position = { x: number; y: number };

export const CANVAS_MIN_ZOOM = 0.05;
export const CANVAS_MAX_ZOOM = 2.5;
export const FIT_VIEW_PADDING = 0.18;

/**
 * Resolve a React Flow node's absolute (root-canvas) position by walking up
 * its parent chain. Uses the provided `lookup` to find each parent — the
 * caller decides whether to map by id or linear-scan. The `seen` set
 * protects against cyclic parent links.
 */
export const resolveAbsolutePosition = (
  node: Node,
  lookup: (id: string) => Node | undefined,
): Position => {
  const seen = new Set<string>();
  let current: Node | undefined = node;
  let total: Position = { x: 0, y: 0 };
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    total = { x: total.x + current.position.x, y: total.y + current.position.y };
    if (!current.parentId) return total;
    current = lookup(current.parentId);
  }
  return total;
};

type FitViewTarget = {
  getNodes: () => { id: string; parentId?: string }[];
  fitView: (options: {
    nodes?: { id: string }[];
    padding?: number;
    duration?: number;
    minZoom?: number;
    maxZoom?: number;
  }) => unknown;
};

export function fitCanvasToWorkflow(flow: FitViewTarget) {
  const roots = flow.getNodes().filter((node) => !node.parentId);
  flow.fitView({
    nodes: roots.length ? roots : undefined,
    padding: FIT_VIEW_PADDING,
    duration: 500,
    minZoom: CANVAS_MIN_ZOOM,
    maxZoom: 1,
  });
}
