"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { DomainEdge, EdgeRoutePoint } from "@/types/workflow";
import {
  cardObstacles,
  corridorYAboveCards,
  aboveRouteCardTop,
  phaseHeaderObstacles,
} from "@/lib/edge-routing";
import { estimateEdgeLabelChip } from "@/lib/layout-geometry";

type Point = { x: number; y: number };
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
    active?: boolean;
    obstacles?: LabelObstacle[];
    labelLane?: number;
    labelHugsPath?: boolean;
    preGateSales?: boolean;
  },
  "semantic"
>;

const colors: Record<DomainEdge["type"], string> = {
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
  if (edge.sourceHandle?.startsWith("no") || edge.label?.trim().toLowerCase() === "denied") {
    return "#dc4c55";
  }
  return colors[edge.type];
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pathLength = (points: Point[]) =>
  points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0);
const toward = (from: Point, to: Point, amount: number): Point => {
  const length = distance(from, to) || 1;
  return {
    x: from.x + ((to.x - from.x) / length) * amount,
    y: from.y + ((to.y - from.y) / length) * amount,
  };
};
const stub = (point: Point, position: Position, length: number): Point =>
  position === Position.Left
    ? { x: point.x - length, y: point.y }
    : position === Position.Right
      ? { x: point.x + length, y: point.y }
      : position === Position.Top
        ? { x: point.x, y: point.y - length }
        : { x: point.x, y: point.y + length };
const compact = (points: Point[]) =>
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
const roundedPath = (points: Point[], radius = 14) => {
  if (points.length < 2) return "";
  let path = `M${points[0].x},${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const size = Math.min(
      radius,
      distance(previous, corner) / 2,
      distance(corner, next) / 2,
    );
    const entry = toward(corner, previous, size);
    const exit = toward(corner, next, size);
    path += ` L${entry.x},${entry.y} Q${corner.x},${corner.y} ${exit.x},${exit.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L${last.x},${last.y}`;
};
const routedPoints = (
  source: Point,
  target: Point,
  sourcePosition: Position,
  targetPosition: Position,
  route: EdgeRoutePoint[],
) => {
  const sourceStub = stub(source, sourcePosition, 12);
  const targetStub = stub(target, targetPosition, 12);
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
const collapseRedundantBends = (points: Point[]) => {
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
        (collinearX && point.x === previous.x) ||
        (collinearY && point.y === previous.y);
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

type PathPoint = Point & { tangent: Point };
const pointAlongPath = (points: Point[], fraction: number): PathPoint => {
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

const overlapArea = (
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

const placeLabel = (
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
) => {
  const { width, height } = estimateEdgeLabelChip(label);
  const source = obstacles.find((obstacle) => obstacle.id === sourceId);
  const target = obstacles.find((obstacle) => obstacle.id === targetId);
  const gapCenterX = source && target
    ? source.x < target.x
      ? (source.x + source.width + target.x) / 2
      : (target.x + target.width + source.x) / 2
    : undefined;
  const closestGapPoint = gapCenterX === undefined
    ? undefined
    : Array.from({ length: 101 }, (_, index) => pointAlongPath(points, index / 100)).sort(
        (a, b) => Math.abs(a.x - gapCenterX) - Math.abs(b.x - gapCenterX),
      )[0];
  // Approval labels describe the forward connector itself. Keep them centred
  // on the clear horizontal run between cards instead of allowing the generic
  // obstacle avoidance pass to push them into a Phase or beside a node.
  if (lockToConnectorGap && gapCenterX !== undefined && closestGapPoint) {
    return {
      point: { x: gapCenterX, y: closestGapPoint.y },
      avoided: false,
    };
  }
  const returnFractions = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9];
  const preferredReturnFraction = returnFractions[labelLane % returnFractions.length];
  const preferredReturnPoint = pointAlongPath(points, preferredReturnFraction);
  const returnEscapePoints = labelHugsPath
    ? [...new Map([source, target].filter(Boolean).map((obstacle) => [obstacle!.id, obstacle!])).values()]
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
    : gapCenterX !== undefined && closestGapPoint
      ? [{ ...closestGapPoint, x: gapCenterX, y: closestGapPoint.y + labelLane, fraction: 0.5 }]
      : [];
  const fractions = Array.from({ length: 19 }, (_, index) => (index + 1) * 0.05).sort(
    (a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5),
  );
  const lane = labelLane || (([...edgeId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 7) - 3) * 32;
  const offsets = labelHugsPath
    ? [0, 16, -16, 28, -28, 40, -40, 56, -56, 72, -72]
    : [...new Set([lane, 0, lane + 40, lane - 40, 68, -68, 96, -96, 128, -128])];
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
  const scored = candidates.map((candidate) => ({
    ...candidate,
    overlap: obstacles.reduce(
      (sum, obstacle) => sum + overlapArea(candidate, width, height, obstacle),
      0,
    ),
  }));
  const clear = scored.find((candidate) => candidate.overlap === 0);
  const chosen =
    clear ??
    scored.sort(
      (a, b) =>
        a.overlap - b.overlap ||
        Math.abs(a.fraction - 0.5) - Math.abs(b.fraction - 0.5) ||
        Math.abs(a.offset) - Math.abs(b.offset),
    )[0];
  return { point: { x: chosen.x, y: chosen.y }, avoided: chosen.offset !== 0 || chosen.fraction !== 0.5 };
};

export function SemanticEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<SemanticFlowEdge>) {
  const domain = data!.domain;
  const routed =
    data?.route && data.route.length >= 2
      ? routedPoints(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          sourcePosition,
          targetPosition,
          data.route,
        )
      : undefined;
  const [bezierPath, bezierLabelX, bezierLabelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const preGateSales =
    data?.preGateSales ||
    domain.customFields.workflowSection === "Pre-Gate Sales";
  const preGateSalesRoute = preGateSales
    ? domain.sourceHandle === "no"
      ? (() => {
          const targetObstacle = data?.obstacles?.find(
            (item) => item.id === domain.target,
          );
          const lane = Math.abs(data?.labelLane ?? 0) % 3;
          const approachX = (targetObstacle?.x ?? targetX) - 44;
          const corridorY = targetObstacle
            ? targetObstacle.y + targetObstacle.height + 48 + lane * 24
            : Math.max(sourceY, targetY) + 96 + lane * 24;
          return compact([
            { x: sourceX, y: sourceY },
            { x: sourceX + 34, y: sourceY },
            { x: sourceX + 34, y: corridorY },
            { x: approachX, y: corridorY },
            { x: approachX, y: targetY },
            { x: targetX, y: targetY },
          ]);
        })()
      : compact([
          { x: sourceX, y: sourceY },
          { x: (sourceX + targetX) / 2, y: sourceY },
          { x: (sourceX + targetX) / 2, y: targetY },
          { x: targetX, y: targetY },
        ])
    : undefined;
  const denied =
    !preGateSales &&
    (domain.sourceHandle?.startsWith("no") || ["rework", "exception", "hold"].includes(domain.type));
  const approved = !preGateSales && (domain.sourceHandle === "yes" || domain.type === "approval");
  const displayLabel = approved
    ? "APPROVED"
    : denied
      ? "DENIED"
      : domain.label ?? "";
  const deniedRoute = denied
    ? (() => {
        const obstacles = data?.obstacles ?? [];
        const sourceObstacle = obstacles.find((item) => item.id === domain.source);
        const escapeX = Math.max(
          sourceX + 44,
          sourceObstacle ? sourceObstacle.x + sourceObstacle.width + 44 : sourceX + 44,
        );
        const left = Math.min(targetX, escapeX);
        const right = Math.max(targetX, escapeX);
        const cards = cardObstacles(obstacles);
        const crossedObstacles = cards.filter(
          (item) => item.x <= right && item.x + item.width >= left,
        );
        const highestCardTop = aboveRouteCardTop(
          sourceObstacle,
          obstacles.find((item) => item.id === domain.target),
          Math.min(sourceY, targetY),
          crossedObstacles,
        );
        const lane = Math.abs(data?.labelLane ?? 0) % 3;
        const corridorY = corridorYAboveCards(
          highestCardTop,
          lane,
          left,
          right,
          phaseHeaderObstacles(obstacles),
        );
        return compact([
          { x: sourceX, y: sourceY },
          { x: escapeX, y: sourceY },
          { x: escapeX, y: corridorY },
          { x: targetX, y: corridorY },
          { x: targetX, y: targetY },
        ]);
      })()
    : undefined;
  const approvedRoute = approved
    ? (() => {
        const obstacles = data?.obstacles ?? [];
        const sourceObstacle = obstacles.find((item) => item.id === domain.source);
        const targetObstacle = obstacles.find((item) => item.id === domain.target);
        const sourceRight = sourceObstacle
          ? sourceObstacle.x + sourceObstacle.width
          : sourceX;
        const targetLeft = targetObstacle?.x ?? targetX;
        const escapeX = sourceRight + 28;
        const approachX = targetLeft - 28;
        // Always route along a horizontal corridor so the arrow lands flush
        // against the target's left edge with a clear, unobstructed view.
        // The label sits in the corridor between the two nodes.
        const corridorY = (sourceY + targetY) / 2;
        return compact([
          { x: sourceX, y: sourceY },
          { x: escapeX, y: sourceY },
          { x: escapeX, y: corridorY },
          { x: approachX, y: corridorY },
          { x: approachX, y: targetY },
          { x: targetX, y: targetY },
        ]);
      })()
    : undefined;
  const automaticRoute = (() => {
    if (preGateSalesRoute || deniedRoute || approvedRoute) return undefined;
    const obstacles = data?.obstacles ?? [];
    const sourceObstacle = obstacles.find((item) => item.id === domain.source);
    const targetObstacle = obstacles.find((item) => item.id === domain.target);
    const sourceStub = stub({ x: sourceX, y: sourceY }, sourcePosition, 16);
    const targetStub = stub({ x: targetX, y: targetY }, targetPosition, 16);
    const horizontalHandles =
      [sourcePosition, targetPosition].every(
        (position) => position === Position.Left || position === Position.Right,
      );
    if (horizontalHandles) {
      const escapeX =
        sourcePosition === Position.Right
          ? Math.max(
              sourceStub.x,
              sourceObstacle ? sourceObstacle.x + sourceObstacle.width + 16 : sourceStub.x,
            )
          : sourceStub.x;
      const approachX =
        targetPosition === Position.Left
          ? Math.min(
              targetStub.x,
              targetObstacle ? targetObstacle.x - 16 : targetStub.x,
            )
          : targetStub.x;
      const sourceTop = sourceObstacle?.y ?? sourceY;
      const sourceBottom = sourceObstacle
        ? sourceObstacle.y + sourceObstacle.height
        : sourceY;
      const targetTop = targetObstacle?.y ?? targetY;
      const targetBottom = targetObstacle
        ? targetObstacle.y + targetObstacle.height
        : targetY;
      const stacked =
        sourceBottom + 12 < targetTop || targetBottom + 12 < sourceTop;
      if (approachX - escapeX >= 24 || stacked) {
        const middleX =
          approachX - escapeX >= 24 ? (escapeX + approachX) / 2 : escapeX;
        return compact([
          { x: sourceX, y: sourceY },
          { x: escapeX, y: sourceY },
          { x: middleX, y: sourceY },
          { x: middleX, y: targetY },
          { x: approachX, y: targetY },
          { x: targetX, y: targetY },
        ]);
      }
      const lane = Math.abs(data?.labelLane ?? 0) % 3;
      const aboveY = Math.min(sourceTop, targetTop) - 40 - lane * 24;
      const belowY = Math.max(sourceBottom, targetBottom) + 40 + lane * 24;
      const aboveCost =
        Math.abs(sourceY - aboveY) + Math.abs(targetY - aboveY);
      const belowCost =
        Math.abs(sourceY - belowY) + Math.abs(targetY - belowY);
      const corridorY = aboveCost <= belowCost ? aboveY : belowY;
      return compact([
        { x: sourceX, y: sourceY },
        { x: escapeX, y: sourceY },
        { x: escapeX, y: corridorY },
        { x: approachX, y: corridorY },
        { x: approachX, y: targetY },
        { x: targetX, y: targetY },
      ]);
    }
    const middleY = (sourceStub.y + targetStub.y) / 2;
    return compact([
      { x: sourceX, y: sourceY },
      sourceStub,
      { x: sourceStub.x, y: middleY },
      { x: targetStub.x, y: middleY },
      targetStub,
      { x: targetX, y: targetY },
    ]);
  })();
  // Live routes win when a stored auto-layout polyline has become a long
  // detour — typical after dragging one endpoint while the old bend points
  // stay behind.
  const storedDetour =
    Boolean(routed && automaticRoute) &&
    pathLength(routed!) > pathLength(automaticRoute!) * 1.2 + 40;
  const visibleRoute =
    preGateSalesRoute ??
    deniedRoute ??
    approvedRoute ??
    (storedDetour ? automaticRoute : routed) ??
    automaticRoute;
  const path = visibleRoute ? roundedPath(visibleRoute) : bezierPath;
  const labelGuide = visibleRoute ?? [
    { x: sourceX, y: sourceY },
    { x: bezierLabelX, y: bezierLabelY },
    { x: targetX, y: targetY },
  ];
  const placement = placeLabel(
    labelGuide,
    displayLabel,
    data?.obstacles ?? [],
    id,
    domain.source,
    domain.target,
    data?.labelLane,
    data?.labelHugsPath,
    visibleRoute ? undefined : { x: bezierLabelX, y: bezierLabelY },
    approved,
  );
  const sourceObstacle = data?.obstacles?.find(
    (obstacle) => obstacle.id === domain.source,
  );
  const targetObstacle = data?.obstacles?.find(
    (obstacle) => obstacle.id === domain.target,
  );
  const connectorGap =
    sourceObstacle && targetObstacle
      ? Math.abs(
          targetObstacle.x -
            (sourceObstacle.x + sourceObstacle.width),
        )
      : 360;
  const approvedLabelMaxWidth = Math.max(
    80,
    Math.min(360, connectorGap - 28),
  );
  const color = getSemanticEdgeColor(domain);
  const active = data?.active;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected || active ? 3.8 : 2.8,
          opacity: active === false ? 0.25 : 1,
          filter: active ? `drop-shadow(0 0 3px ${color}55)` : undefined,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          strokeDasharray:
            domain.lineStyle === "dashed"
              ? "7 5"
              : domain.lineStyle === "dotted"
                ? "2 4"
                : undefined,
        }}
      />
      <EdgeArrow
        points={visibleRoute ?? [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ]}
        color={color}
      />
      {active ? (
        <path
          aria-hidden="true"
          d={path}
          fill="none"
          className="workflow-edge-flow pointer-events-none"
          style={{ color, stroke: color, opacity: selected ? 1 : 0.82 }}
        />
      ) : null}
      <EdgeLabelRenderer>
        {displayLabel ? (
          <button
            data-edge-label={id}
            data-approved-edge-label={approved ? "true" : undefined}
            data-label-placement={placement.avoided ? "avoided" : "midpoint"}
            className="nodrag nopan absolute z-20 max-w-[360px] whitespace-normal rounded-md border bg-background/95 px-2.5 py-1.5 text-center text-xs font-semibold leading-4 text-foreground shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${placement.point.x}px, ${placement.point.y}px)`,
              borderColor: `${color}55`,
              opacity: active === false ? 0.35 : 1,
              maxWidth: approved ? approvedLabelMaxWidth : 360,
            }}
          >
            {displayLabel}
          </button>
        ) : null}
      </EdgeLabelRenderer>
    </>
  );
}

function EdgeArrow({ points, color }: { points: Point[]; color: string }) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (last.x === prev.x && last.y === prev.y) return null;
  const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
  const size = 12;
  const tipX = last.x;
  const tipY = last.y;
  // Offset the arrow back along the path so the triangle tip lands at the
  // node edge rather than overlapping the node body.
  const offset = 4;
  const baseX = tipX - Math.cos(angle) * offset;
  const baseY = tipY - Math.sin(angle) * offset;
  const leftX = baseX - Math.cos(angle - Math.PI / 2) * (size / 2);
  const leftY = baseY - Math.sin(angle - Math.PI / 2) * (size / 2);
  const rightX = baseX - Math.cos(angle + Math.PI / 2) * (size / 2);
  const rightY = baseY - Math.sin(angle + Math.PI / 2) * (size / 2);
  const backX = baseX - Math.cos(angle) * size;
  const backY = baseY - Math.sin(angle) * size;
  return (
    <path
      aria-hidden
      d={`M ${tipX} ${tipY} L ${leftX} ${leftY} L ${backX} ${backY} L ${rightX} ${rightY} Z`}
      fill={color}
      stroke={color}
      strokeWidth={0.5}
      strokeLinejoin="round"
    />
  );
}
