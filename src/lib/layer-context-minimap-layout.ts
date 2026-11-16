/**
 * Layout model for the layer context minimap. Pure functions only; rendering lives in components/workflow/layer-context-minimap.tsx.
 */
import type { DomainEdge, WorkflowEdgeType } from "@/types/workflow";

export type ContextMapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  active?: boolean;
  container?: boolean;
  type?: string;
};
export type ContextMapEdge = {
  id: string;
  source: string;
  target: string;
  type?: WorkflowEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  lineStyle?: "solid" | "dashed" | "dotted";
  label?: string;
};
export type LayerContextMinimapProps = {
  level: "L1" | "L2";
  title: string;
  nodes: ContextMapNode[];
  edges: (ContextMapEdge | DomainEdge)[];
  activeLabel?: string;
  className?: string;
  onOpenParent?: () => void;
  onOpenNode?: (nodeId: string) => void;
  expandable?: boolean;
  /** Use a denser footprint when the context map sits above a detail panel. */
  compact?: boolean;
  strip?: boolean;
  defaultHidden?: boolean;
  onReveal?: () => void;
};
export const MAP_PADDING = 18;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const NODE_READABLE_WIDTH = 180;
export const HIGH_LEVEL_EDGE_COLOR = "#159a75";
export const subscribeToHydration = () => () => {};
export const getClientHydrationSnapshot = () => true;
export const getServerHydrationSnapshot = () => false;
export const MIN_L1_EDGE_GAP = 56;
export const MIN_L2_EDGE_GAP = 56;
export function spaceLayerNodes(nodes: ContextMapNode[], uniformGap: number) {
  const nonContainers = nodes.filter((n) => !n.container);
  const targetCenterY =
    nonContainers.length > 0
      ? nonContainers.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nonContainers.length
      : 80;

  const columns = Array.from(
    nodes.reduce((result, node) => {
      const column = result.get(node.x) || [];
      column.push(node);
      result.set(node.x, column);
      return result;
    }, new Map<number, ContextMapNode[]>()),
  ).sort(([leftX], [rightX]) => leftX - rightX);
  const adjustedX = new Map<string, number>();
  const adjustedY = new Map<string, number>();
  let runningX = 0;

  for (const [, columnNodes] of columns) {
    const isOnlyContainers = columnNodes.every((n) => n.container);
    if (isOnlyContainers) continue;

    const renderedX = runningX;

    const activeColNodes = columnNodes.filter((n) => !n.container);
    if (activeColNodes.length === 1) {
      const single = activeColNodes[0];
      adjustedX.set(single.id, renderedX);
      adjustedY.set(single.id, targetCenterY - single.height / 2);
    } else if (activeColNodes.length > 1) {
      activeColNodes.sort((a, b) => a.y - b.y);
      const totalColHeight =
        activeColNodes.reduce((sum, n) => sum + n.height, 0) + (activeColNodes.length - 1) * 20;
      let startY = targetCenterY - totalColHeight / 2;
      for (const node of activeColNodes) {
        adjustedX.set(node.id, renderedX);
        adjustedY.set(node.id, startY);
        startY += node.height + 20;
      }
    }

    for (const node of columnNodes) {
      if (!adjustedX.has(node.id)) adjustedX.set(node.id, renderedX);
    }

    const colWidth = Math.max(
      ...columnNodes.filter((n) => !n.container).map((node) => node.width),
      0,
    );
    // Every column is followed by the EXACT same uniform line gap
    runningX = renderedX + colWidth + uniformGap;
  }

  return nodes.map((node) => ({
    ...node,
    x: adjustedX.get(node.id) ?? node.x,
    y: adjustedY.get(node.id) ?? node.y,
  }));
}
export function roundedPath(points: { x: number; y: number }[], radius = 12) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (d1 === 0 || d2 === 0) continue;
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const startX = curr.x - (r * (curr.x - prev.x)) / d1;
    const startY = curr.y - (r * (curr.y - prev.y)) / d1;
    const endX = curr.x + (r * (next.x - curr.x)) / d2;
    const endY = curr.y + (r * (next.y - curr.y)) / d2;
    path += ` L ${startX} ${startY} Q ${curr.x} ${curr.y} ${endX} ${endY}`;
  }
  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}
