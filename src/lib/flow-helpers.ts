import type { Node } from "@xyflow/react";

type Position = { x: number; y: number };

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