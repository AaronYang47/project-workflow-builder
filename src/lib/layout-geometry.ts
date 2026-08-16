import type { NodeLayout } from "@/types/workflow";

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
