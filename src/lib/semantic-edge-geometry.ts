/**
 * Geometry for semantic workflow edges: handle sides, orthogonal routes, label placement and path building. Pure functions only; rendering lives in components/workflow/semantic-edge.tsx.
 */
import { Position, type Edge } from "@xyflow/react";
import type { DomainEdge, EdgeRoutePoint } from "@/types/workflow";
import { estimateEdgeLabelChip } from "@/lib/layout-geometry";
import type { ChapterConnection } from "@/lib/chapter-edge-routing";

export type Point = { x: number; y: number };
export type LabelObstacle = Point & {
  id: string;
  width: number;
  height: number;
  kind?: "phase-header";
};
export type SemanticFlowEdge = Edge<
  {
    domain: DomainEdge;
    route?: EdgeRoutePoint[];
    chapterConnection?: ChapterConnection;
    active?: boolean;
    displayColor?: string;
    obstacles?: LabelObstacle[];
    labelLane?: number;
    labelHugsPath?: boolean;
    preGateSales?: boolean;
    siblingIndex?: number;
    siblingCount?: number;
  },
  "semantic"
>;
export const colors: Record<DomainEdge["type"], string> = {
  normal: "#159a75",
  success: "#159a75",
  failure: "#dc4c55",
  hold: "#b87916",
  rework: "#dc4c55",
  dependency: "#526d82",
  supporting: "#6686aa",
  exception: "#dc4c55",
  approval: "#159a75",
  reopen: "#159a75",
};
export function getSemanticEdgeColor(edge: DomainEdge) {
  if (
    edge.sourceHandle?.startsWith("no") ||
    edge.sourceHandle === "in-rework" ||
    edge.label?.trim().toLowerCase().includes("no-go") ||
    edge.label?.trim().toLowerCase().includes("nogo") ||
    edge.label?.trim().toLowerCase() === "denied"
  ) {
    return "#dc2626";
  }
  return colors[edge.type] || "#159a75";
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const pathLength = (points: Point[]) =>
  points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
export const toward = (from: Point, to: Point, amount: number): Point => {
  const length = distance(from, to) || 1;
  return {
    x: from.x + ((to.x - from.x) / length) * amount,
    y: from.y + ((to.y - from.y) / length) * amount,
  };
};
export const stub = (point: Point, position: Position, length: number): Point =>
  position === Position.Left
    ? { x: point.x - length, y: point.y }
    : position === Position.Right
      ? { x: point.x + length, y: point.y }
      : position === Position.Top
        ? { x: point.x, y: point.y - length }
        : { x: point.x, y: point.y + length };
export const MIN_END_STUB = 56;
/** Last stretch of a connector is reserved for the arrowhead. */
export const ARROW_KEEPOUT_PX = 80;
/** Extra air between a label chip and the stroke it annotates. */
export const LABEL_STROKE_GAP = 14;
/** Keep a straight run after the last 90° turn so the arrow is not glued to the corner. */
export const withMinEndStub = (
  points: Point[],
  position: Position,
  minLength = MIN_END_STUB,
): Point[] => {
  if (points.length < 2) return points;
  const result = points.map((point) => ({ ...point }));
  const target = result[result.length - 1];
  const vertical = position === Position.Top || position === Position.Bottom;
  const aligned = (point: Point) =>
    vertical ? Math.abs(point.x - target.x) < 0.5 : Math.abs(point.y - target.y) < 0.5;
  let penIndex = result.length - 2;
  if (!aligned(result[penIndex])) {
    result.splice(
      result.length - 1,
      0,
      vertical ? { x: target.x, y: result[penIndex].y } : { x: result[penIndex].x, y: target.y },
    );
    penIndex = result.length - 2;
  }
  const corner = result[penIndex];
  if (distance(corner, target) >= minLength) return compact(result);
  const moved = stub(target, position, minLength);
  result[penIndex] = moved;
  if (penIndex > 0) {
    const previous = result[penIndex - 1];
    if (vertical && Math.abs(previous.y - corner.y) < 0.5) {
      result[penIndex - 1] = { ...previous, y: moved.y };
    } else if (!vertical && Math.abs(previous.x - corner.x) < 0.5) {
      result[penIndex - 1] = { ...previous, x: moved.x };
    }
  }
  return compact(result);
};
export const compact = (points: Point[]) =>
  points
    .filter(
      (point, index) =>
        !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
    )
    .filter(
      (point, index, all) =>
        index === 0 ||
        index === all.length - 1 ||
        !(
          (all[index - 1].x === point.x && point.x === all[index + 1].x) ||
          (all[index - 1].y === point.y && point.y === all[index + 1].y)
        ),
    );
export const roundedPath = (points: Point[], radius = 14) => {
  if (points.length < 2) return "";
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const size = Math.min(radius, distance(previous, corner) / 2, distance(corner, next) / 2);
    const entry = toward(corner, previous, size);
    const exit = toward(corner, next, size);
    path += ` L${entry.x},${entry.y} Q${corner.x},${corner.y} ${exit.x},${exit.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L${last.x},${last.y}`;
};
export const routedPoints = (
  source: Point,
  target: Point,
  sourcePosition: Position,
  targetPosition: Position,
  route: EdgeRoutePoint[],
) => {
  const sourceStub = stub(source, sourcePosition, 16);
  const targetStub = stub(target, targetPosition, MIN_END_STUB);
  const middle = collapseRedundantBends(route.slice(1, -1));
  const points: Point[] = [source, sourceStub];
  for (const point of middle) {
    const current = points.at(-1)!;
    if (current.x !== point.x && current.y !== point.y) {
      points.push(
        sourcePosition === Position.Left || sourcePosition === Position.Right
          ? { x: point.x, y: current.y }
          : { x: current.x, y: point.y },
      );
    }
    points.push(point);
  }
  const current = points.at(-1)!;
  if (current.x !== targetStub.x && current.y !== targetStub.y) {
    points.push(
      targetPosition === Position.Left || targetPosition === Position.Right
        ? { x: current.x, y: targetStub.y }
        : { x: targetStub.x, y: current.y },
    );
  }
  points.push(targetStub, target);
  return compact(points);
};
// Collapse ELK's bend sequences back to a sensible Manhattan path.
//
// Two rules:
//   1. A point on the axis shared by both neighbours (e.g. A=(0,0) →
//      P=(0,5) → B=(0,10)) adds only a corner — drop it.
//   2. A point that creates a strict U-turn — the previous segment goes
//      +x and the next goes -x (or vice-versa for y) — is a detour
//      because ELK always routes around obstacles, never back. Drop it.
//
// Both rules together also collapse stair-step sequences where several
// consecutive bends sit along a single axis.
export const collapseRedundantBends = (points: Point[]) => {
  if (points.length < 3) return points;
  let current = points;
  for (let pass = 0; pass < 4; pass++) {
    if (current.length < 3) break;
    const next: Point[] = [];
    for (let index = 0; index < current.length; index++) {
      const point = current[index];
      const previous = current[index - 1];
      const after = current[index + 1];
      if (!previous || !after) {
        next.push(point);
        continue;
      }
      const collinearX = previous.x === after.x;
      const collinearY = previous.y === after.y;
      const onSharedAxis =
        (collinearX && point.x === previous.x) || (collinearY && point.y === previous.y);
      if (onSharedAxis) continue;
      // U-turn: segment went +x then -x (or +y then -y).
      const xSeg1 = Math.sign(point.x - previous.x);
      const xSeg2 = Math.sign(after.x - point.x);
      const ySeg1 = Math.sign(point.y - previous.y);
      const ySeg2 = Math.sign(after.y - point.y);
      const uTurnX = xSeg1 !== 0 && xSeg1 === -xSeg2;
      const uTurnY = ySeg1 !== 0 && ySeg1 === -ySeg2;
      if (uTurnX || uTurnY) continue;
      next.push(point);
    }
    if (next.length === current.length) break;
    current = next;
  }
  return current;
};
export type PathPoint = Point & { tangent: Point };
export const pointAlongPath = (points: Point[], fraction: number): PathPoint => {
  const segments = points.slice(1).map((point, index) => ({
    from: points[index],
    to: point,
    length: distance(points[index], point),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0) || 1;
  let remaining = total * fraction;
  for (const segment of segments) {
    if (remaining <= segment.length || segment === segments.at(-1)) {
      const progress = segment.length ? Math.min(1, remaining / segment.length) : 0;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * progress,
        y: segment.from.y + (segment.to.y - segment.from.y) * progress,
        tangent: {
          x: segment.to.x - segment.from.x,
          y: segment.to.y - segment.from.y,
        },
      };
    }
    remaining -= segment.length;
  }
  const last = points.at(-1)!;
  return { ...last, tangent: { x: 1, y: 0 } };
};
export const overlapArea = (
  point: Point,
  width: number,
  height: number,
  obstacle: LabelObstacle,
) => {
  const padding = 18;
  const left = point.x - width / 2;
  const right = point.x + width / 2;
  const top = point.y - height / 2;
  const bottom = point.y + height / 2;
  const obstacleLeft = obstacle.x - padding;
  const obstacleRight = obstacle.x + obstacle.width + padding;
  const obstacleTop = obstacle.y - padding;
  const obstacleBottom = obstacle.y + obstacle.height + padding;
  return (
    Math.max(0, Math.min(right, obstacleRight) - Math.max(left, obstacleLeft)) *
    Math.max(0, Math.min(bottom, obstacleBottom) - Math.max(top, obstacleTop))
  );
};
export const placeLabel = (
  points: Point[],
  label: string,
  obstacles: LabelObstacle[],
  edgeId: string,
  sourceId: string,
  targetId: string,
  labelLane = 0,
  labelHugsPath = false,
  exactMidpoint?: Point,
  lockToConnectorGap = false,
  siblingIndex = 0,
  siblingCount = 1,
) => {
  const { width, height } = estimateEdgeLabelChip(label);
  const pathClearance = Math.max(LABEL_STROKE_GAP + height / 2, 28);
  const source = obstacles.find((obstacle) => obstacle.id === sourceId);
  const target = obstacles.find((obstacle) => obstacle.id === targetId);
  const gapCenterX =
    source && target
      ? source.x < target.x
        ? (source.x + source.width + target.x) / 2
        : (target.x + target.width + source.x) / 2
      : undefined;
  const closestGapPoint =
    gapCenterX === undefined
      ? undefined
      : Array.from({ length: 101 }, (_, index) => pointAlongPath(points, index / 100)).sort(
          (a, b) => Math.abs(a.x - gapCenterX) - Math.abs(b.x - gapCenterX),
        )[0];

  if (siblingCount <= 1 && lockToConnectorGap && gapCenterX !== undefined && closestGapPoint) {
    const tangentLength = Math.hypot(closestGapPoint.tangent.x, closestGapPoint.tangent.y) || 1;
    const normal = {
      x: -closestGapPoint.tangent.y / tangentLength,
      y: closestGapPoint.tangent.x / tangentLength,
    };
    const sign = normal.y <= 0 ? 1 : -1;
    return {
      point: {
        x: gapCenterX + normal.x * sign * pathClearance,
        y: closestGapPoint.y + normal.y * sign * pathClearance,
      },
      avoided: true,
    };
  }

  // Stagger preferred anchor points along the path for multiple sibling edges to prevent clustering
  const preferredFraction =
    siblingCount > 1
      ? Math.max(0.15, Math.min(0.85, (siblingIndex + 1) / (siblingCount + 1)))
      : 0.5;

  const returnFractions = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9];
  const preferredReturnFraction =
    siblingCount > 1
      ? preferredFraction
      : returnFractions[Math.abs(labelLane) % returnFractions.length];

  const preferredReturnPoint = pointAlongPath(points, preferredReturnFraction);
  const returnEscapePoints = labelHugsPath
    ? [
        ...new Map(
          [source, target].filter(Boolean).map((obstacle) => [obstacle!.id, obstacle!]),
        ).values(),
      ]
        .flatMap((obstacle) => [
          { ...preferredReturnPoint, x: obstacle.x - width / 2 - 20 },
          { ...preferredReturnPoint, x: obstacle.x + obstacle.width + width / 2 + 20 },
          { ...preferredReturnPoint, y: obstacle.y - height / 2 - 20 },
          { ...preferredReturnPoint, y: obstacle.y + obstacle.height + height / 2 + 20 },
        ])
        .sort((a, b) => distance(a, preferredReturnPoint) - distance(b, preferredReturnPoint))
        .map((point) => ({ ...point, fraction: preferredReturnFraction }))
    : [];

  const gapPoints = labelHugsPath
    ? [{ ...preferredReturnPoint, fraction: preferredReturnFraction }]
    : gapCenterX !== undefined && closestGapPoint && siblingCount <= 1
      ? [{ ...closestGapPoint, x: gapCenterX, y: closestGapPoint.y + labelLane, fraction: 0.5 }]
      : [{ ...preferredReturnPoint, fraction: preferredReturnFraction }];

  const fractions = Array.from({ length: 33 }, (_, index) => (index + 1) * 0.03).sort(
    (a, b) => Math.abs(a - preferredFraction) - Math.abs(b - preferredFraction),
  );

  const lane = siblingCount > 1 ? (siblingIndex - (siblingCount - 1) / 2) * 28 : labelLane || 0;

  const offsets = labelHugsPath
    ? [pathClearance, -pathClearance, 40, -40, 56, -56, 72, -72]
    : [
        ...new Set([
          lane || -pathClearance,
          -(lane || pathClearance),
          pathClearance + 16,
          -(pathClearance + 16),
          56,
          -56,
          84,
          -84,
        ]),
      ];

  const pathPoints = [
    ...gapPoints,
    ...returnEscapePoints,
    ...fractions.map((fraction) => {
      const measuredPoint = pointAlongPath(points, fraction);
      return fraction === 0.5 && exactMidpoint
        ? { ...exactMidpoint, tangent: measuredPoint.tangent, fraction }
        : { ...measuredPoint, fraction };
    }),
  ];
  const candidates = pathPoints.flatMap((pathPoint) => {
    const tangentLength = Math.hypot(pathPoint.tangent.x, pathPoint.tangent.y) || 1;
    const normal = {
      x: -pathPoint.tangent.y / tangentLength,
      y: pathPoint.tangent.x / tangentLength,
    };
    return offsets.map((offset) => ({
      x: pathPoint.x + normal.x * offset,
      y: pathPoint.y + normal.y * offset,
      offset,
      fraction: pathPoint.fraction,
    }));
  });
  const pathEnd = points.at(-1) ?? { x: 0, y: 0 };
  const arrowKeepout = ARROW_KEEPOUT_PX + width / 2;
  const scored = candidates.map((candidate) => {
    const distanceFromEnd = distance(candidate, pathEnd);
    return {
      ...candidate,
      overlap: obstacles.reduce(
        (sum, obstacle) => sum + overlapArea(candidate, width, height, obstacle),
        0,
      ),
      arrowPenalty: distanceFromEnd < arrowKeepout ? arrowKeepout - distanceFromEnd : 0,
    };
  });
  const clear = scored.find((candidate) => candidate.overlap === 0 && candidate.arrowPenalty === 0);
  const chosen =
    clear ??
    scored.sort(
      (a, b) =>
        a.overlap - b.overlap ||
        a.arrowPenalty - b.arrowPenalty ||
        Math.abs(a.fraction - preferredFraction) - Math.abs(b.fraction - preferredFraction) ||
        Math.abs(a.offset - lane) - Math.abs(b.offset - lane),
    )[0];
  return {
    point: { x: chosen.x, y: chosen.y },
    avoided: chosen.offset !== 0 || chosen.fraction !== 0.5,
  };
};
