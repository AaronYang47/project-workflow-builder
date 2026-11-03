import type { DomainNode, NodeLayout, WorkflowFile } from "@/types/workflow";
import { requiredEdgeLabelGap } from "./layout-geometry";

export const PHASE_FRAME_GAP = 200;
export const PHASE_HEADER_GUTTER = 36;

export function phaseHeaderRows(node: DomainNode, width: number) {
  const textWidth = Math.max(120, width - 230);
  const lines = (text: string, pixelsPerCharacter: number) => text.split("\n").reduce(
    (count, line) => count + Math.max(1, Math.ceil(line.length * pixelsPerCharacter / textWidth)), 0,
  );
  return { title: lines(node.title, 14.4), description: lines(node.description, 8.4) };
}

export function estimatePhaseHeaderHeight(node: DomainNode, width: number) {
  const rows = phaseHeaderRows(node, width);
  return Math.max(96, 24 + 20 + 8 + rows.title * 28 + rows.description * 24);
}

/** Canvas coordinates are absolute; parentId records frame membership only. */
export function spacePhaseFrames(file: WorkflowFile, measuredHeaders: Record<string, number> = {}): WorkflowFile {
  const layouts = { ...file.layout.nodes };
  const moved = new Set<string>();
  const phases = file.graph.nodes.filter((node) => node.type === "phase" && layouts[node.id]);
  const descendants = (id: string) => Object.values(layouts).filter((layout) => {
    let parent = layout.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      if (parent === id) return true;
      seen.add(parent);
      parent = layouts[parent]?.parentId;
    }
    return false;
  });
  const shift = (items: NodeLayout[], dx: number, dy: number) => {
    for (const item of items) {
      layouts[item.nodeId] = { ...layouts[item.nodeId], x: item.x + dx, y: item.y + dy };
      moved.add(item.nodeId);
    }
  };
  // Long connector labels need actual canvas space, rather than a detour
  // around the entire chapter just to fit a label.
  const cards = file.graph.nodes.filter((node) =>
    ["general", "projectStart", "terminal"].includes(node.type) && layouts[node.id],
  ).sort((a, b) => layouts[a.id].x - layouts[b.id].x);
  const horizontal = !file.graph.nodes.some((node) => node.type === "gate") &&
    cards.every((node, index) => !index || layouts[cards[index - 1].id].x + layouts[cards[index - 1].id].width + 32 <= layouts[node.id].x);
  if (horizontal) {
    for (let index = 1; index < cards.length; index++) {
      const previous = layouts[cards[index - 1].id];
      const current = layouts[cards[index].id];
      const labels = file.graph.edges.filter((edge) => edge.source === previous.nodeId && edge.target === current.nodeId && edge.label?.trim());
      const gap = Math.max(0, ...labels.map((edge) => requiredEdgeLabelGap(edge.label!, "horizontal") + 80));
      const dx = Math.max(0, previous.x + previous.width + gap - current.x);
      if (dx) shift(cards.slice(index).map((node) => layouts[node.id]), dx, 0);
    }
    for (const phase of phases) {
      const children = Object.values(layouts).filter((child) => child.parentId === phase.id);
      if (!children.some((child) => moved.has(child.nodeId))) continue;
      const x = Math.min(...children.map((child) => child.x)) - 36;
      const right = Math.max(...children.map((child) => child.x + child.width)) + 36;
      layouts[phase.id] = { ...layouts[phase.id], x, width: right - x };
      moved.add(phase.id);
    }
  }
  for (const phase of phases) {
    const layout = layouts[phase.id];
    const children = Object.values(layouts).filter((child) => child.parentId === phase.id);
    if (!children.length) continue;
    const header = measuredHeaders[phase.id] ?? estimatePhaseHeaderHeight(phase, layout.width);
    const minimumTop = layout.y + header + PHASE_HEADER_GUTTER;
    const top = Math.min(...children.map((child) => child.y));
    if (top < minimumTop) shift(descendants(phase.id), 0, Math.ceil(minimumTop - top));
    const bottom = Math.max(...descendants(phase.id).map((child) => child.y + child.height)) + 48;
    const height = Math.max(layout.height, bottom - layout.y);
    if (height !== layout.height) {
      layouts[phase.id] = { ...layout, height };
      moved.add(phase.id);
    }
  }
  let previousRight = -Infinity;
  for (const phase of phases.filter((node) => !layouts[node.id].parentId).sort((a, b) => layouts[a.id].x - layouts[b.id].x)) {
    const layout = layouts[phase.id];
    const x = Math.max(layout.x, previousRight + PHASE_FRAME_GAP);
    if (x !== layout.x) shift([layout, ...descendants(phase.id)], x - layout.x, 0);
    previousRight = x + layout.width;
  }
  if (!moved.size) return file;
  const edges = { ...file.layout.edges };
  for (const edge of file.graph.edges) {
    if ((moved.has(edge.source) || moved.has(edge.target)) && edges[edge.id]) {
      edges[edge.id] = { ...edges[edge.id], points: [] };
    }
  }
  return { ...file, layout: { ...file.layout, nodes: layouts, edges } };
}
