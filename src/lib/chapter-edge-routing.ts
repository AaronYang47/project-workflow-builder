import type { EdgeRoutePoint, WorkflowFile } from "@/types/workflow";
import { estimateEdgeLabelChip } from "./layout-geometry";

export interface ChapterConnection {
  points: EdgeRoutePoint[];
  label?: EdgeRoutePoint;
}

/** Route a horizontal chapter sequence together, so detours do not share lanes.
 * Gate decisions and manually arranged multi-row diagrams retain their own router.
 */
export function routeChapterConnections(file: WorkflowFile): Record<string, ChapterConnection> {
  if (file.graph.nodes.some((node) => node.type === "gate")) return {};
  const cards = file.graph.nodes
    .filter((node) => ["general", "projectStart", "terminal"].includes(node.type))
    .filter((node) => file.layout.nodes[node.id])
    .sort((a, b) => file.layout.nodes[a.id].x - file.layout.nodes[b.id].x);
  if (cards.length < 2) return {};
  for (let index = 1; index < cards.length; index++) {
    const previous = file.layout.nodes[cards[index - 1].id];
    if (previous.x + previous.width + 32 > file.layout.nodes[cards[index].id].x) return {};
  }
  const indexes = new Map(cards.map((node, index) => [node.id, index]));
  const bottom = Math.max(...cards.map((node) => {
    const layout = file.layout.nodes[node.id];
    return layout.y + layout.height;
  }));
  const result: Record<string, ChapterConnection> = {};
  const lanes: { left: number; right: number; y: number }[] = [];
  const candidates = file.graph.edges.filter((edge) =>
    indexes.has(edge.source) && indexes.has(edge.target) &&
    (!edge.sourceHandle || edge.sourceHandle === "out") &&
    (!edge.targetHandle || edge.targetHandle === "in") &&
    !["supporting", "dependency"].includes(edge.type),
  ).sort((a, b) =>
    Math.abs(indexes.get(a.target)! - indexes.get(a.source)!) -
    Math.abs(indexes.get(b.target)! - indexes.get(b.source)!) || a.id.localeCompare(b.id),
  );
  for (const edge of candidates) {
    const sourceIndex = indexes.get(edge.source)!;
    const targetIndex = indexes.get(edge.target)!;
    const source = file.layout.nodes[edge.source];
    const target = file.layout.nodes[edge.target];
    const start = { x: source.x + source.width, y: source.y + source.height / 2 };
    const end = { x: target.x, y: target.y + target.height / 2 };
    const chip = estimateEdgeLabelChip(edge.label ?? "");
    if (targetIndex === sourceIndex + 1 && (!chip.width || end.x - start.x >= chip.width + 80)) {
      const x = (start.x + end.x) / 2;
      result[edge.id] = {
        points: [start, { x, y: start.y }, { x, y: end.y }, end],
        label: chip.width ? { x, y: (start.y + end.y) / 2 } : undefined,
      };
      continue;
    }
    const next = cards[sourceIndex + 1];
    const previous = cards[targetIndex - 1];
    const exitGap = next ? file.layout.nodes[next.id].x - start.x : 160;
    const entryGap = previous ? end.x - (file.layout.nodes[previous.id].x + file.layout.nodes[previous.id].width) : 160;
    const exitX = start.x + Math.min(48, exitGap / 3);
    const entryX = end.x - Math.min(48, entryGap / 3);
    const labelX = (exitX + entryX) / 2;
    const left = Math.min(exitX, entryX, labelX - chip.width / 2 - 24);
    const right = Math.max(exitX, entryX, labelX + chip.width / 2 + 24);
    let y = bottom + 96;
    // Overlapping spans nest from the inside out; disjoint spans can share a lane.
    while (lanes.some((lane) => lane.y === y && lane.left < right + 48 && lane.right > left - 48)) y += 112;
    lanes.push({ left, right, y });
    result[edge.id] = {
      points: [start, { x: exitX, y: start.y }, { x: exitX, y }, { x: entryX, y }, { x: entryX, y: end.y }, end],
      label: chip.width ? { x: labelX, y } : undefined,
    };
  }
  return result;
}
