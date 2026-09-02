"use client";

import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { Pencil } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
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
    siblingIndex?: number;
    siblingCount?: number;
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

const MIN_END_STUB = 56;
/** Last stretch of a connector is reserved for the arrowhead. */
const ARROW_KEEPOUT_PX = 80;
/** Extra air between a label chip and the stroke it annotates. */
const LABEL_STROKE_GAP = 14;

/** Keep a straight run after the last 90° turn so the arrow is not glued to the corner. */
const withMinEndStub = (
  points: Point[],
  position: Position,
  minLength = MIN_END_STUB,
): Point[] => {
  if (points.length < 2) return points;
  const result = points.map((point) => ({ ...point }));
  const target = result[result.length - 1];
  const vertical = position === Position.Top || position === Position.Bottom;
  const aligned = (point: Point) =>
    vertical
      ? Math.abs(point.x - target.x) < 0.5
      : Math.abs(point.y - target.y) < 0.5;
  let penIndex = result.length - 2;
  if (!aligned(result[penIndex])) {
    result.splice(result.length - 1, 0, vertical
      ? { x: target.x, y: result[penIndex].y }
      : { x: result[penIndex].x, y: target.y });
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
  siblingIndex = 0,
  siblingCount = 1,
) => {
  const { width, height } = estimateEdgeLabelChip(label);
  const pathClearance = Math.max(LABEL_STROKE_GAP + height / 2, 28);
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

  if (siblingCount <= 1 && lockToConnectorGap && gapCenterX !== undefined && closestGapPoint) {
    const tangentLength =
      Math.hypot(closestGapPoint.tangent.x, closestGapPoint.tangent.y) || 1;
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
    : gapCenterX !== undefined && closestGapPoint && siblingCount <= 1
      ? [{ ...closestGapPoint, x: gapCenterX, y: closestGapPoint.y + labelLane, fraction: 0.5 }]
      : [{ ...preferredReturnPoint, fraction: preferredReturnFraction }];

  const fractions = Array.from({ length: 33 }, (_, index) => (index + 1) * 0.03).sort(
    (a, b) => Math.abs(a - preferredFraction) - Math.abs(b - preferredFraction),
  );

  const lane =
    siblingCount > 1
      ? (siblingIndex - (siblingCount - 1) / 2) * 28
      : labelLane || 0;

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
      arrowPenalty:
        distanceFromEnd < arrowKeepout ? arrowKeepout - distanceFromEnd : 0,
    };
  });
  const clear = scored.find(
    (candidate) => candidate.overlap === 0 && candidate.arrowPenalty === 0,
  );
  const chosen =
    clear ??
    scored.sort(
      (a, b) =>
        a.overlap - b.overlap ||
        a.arrowPenalty - b.arrowPenalty ||
        Math.abs(a.fraction - preferredFraction) - Math.abs(b.fraction - preferredFraction) ||
        Math.abs(a.offset - lane) - Math.abs(b.offset - lane),
    )[0];
  return { point: { x: chosen.x, y: chosen.y }, avoided: chosen.offset !== 0 || chosen.fraction !== 0.5 };
};

function EditableEdgeLabel({
  id,
  displayLabel,
  rawLabel,
  color,
  active,
  approved,
  approvedLabelMaxWidth,
  placement,
  selected,
}: {
  id: string;
  displayLabel: string;
  rawLabel?: string;
  color: string;
  active?: boolean;
  approved?: boolean;
  approvedLabelMaxWidth: number;
  placement: { point: { x: number; y: number }; avoided: boolean };
  selected?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(
    rawLabel !== undefined && rawLabel !== "" ? rawLabel : displayLabel,
  );
  const updateEdge = useWorkflowStore((s) => s.updateEdge);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== (rawLabel ?? "")) {
      updateEdge(id, { label: trimmed });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(
        rawLabel !== undefined && rawLabel !== "" ? rawLabel : displayLabel,
      );
      setIsEditing(false);
    }
  };

  if (!displayLabel && !selected && !isEditing) {
    return null;
  }

  return (
    <div
      data-edge-label={id}
      data-approved-edge-label={approved ? "true" : undefined}
      data-label-placement={placement.avoided ? "avoided" : "midpoint"}
      className="nodrag nopan absolute z-30 pointer-events-auto"
      style={{
        transform: `translate(-50%, -50%) translate(${placement.point.x}px, ${placement.point.y}px)`,
      }}
    >
      {isEditing ? (
        <div className="flex items-center gap-1 rounded-lg border-2 border-primary bg-background p-1 shadow-lg ring-2 ring-primary/20">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-auto min-w-[80px] max-w-[280px] rounded border-0 bg-transparent px-1.5 py-0.5 text-center text-xs font-semibold leading-4 text-foreground outline-none"
            placeholder="Edit label..."
          />
        </div>
      ) : displayLabel ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          title="Click to edit label"
          className="group relative flex items-center justify-center gap-1 rounded-md border bg-background/95 px-2.5 py-1.5 text-center text-xs font-semibold leading-4 text-foreground shadow-sm transition hover:border-primary hover:shadow-md hover:bg-background cursor-pointer"
          style={{
            borderColor:
              active === false ? "#cbd5e1" : selected ? "#2563eb" : `${color}55`,
            opacity: active === false ? 0.4 : 1,
            maxWidth: approved ? approvedLabelMaxWidth : 360,
          }}
        >
          <span>{displayLabel}</span>
          <Pencil className="size-2.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-opacity shrink-0 ml-0.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          title="Add label"
          className="flex items-center gap-1 rounded-full border border-dashed border-primary/60 bg-background/95 px-2 py-0.5 text-[10px] font-bold text-primary shadow-xs hover:bg-primary/10 transition cursor-pointer"
        >
          <Pencil className="size-2.5" />
          <span>+ Label</span>
        </button>
      )}
    </div>
  );
}

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
    domain.customFields?.workflowSection === "Pre-Gate Sales";
  const preGateSalesRoute = undefined;
  const denied =
    !preGateSales &&
    (domain.sourceHandle?.startsWith("no") || ["rework", "exception", "hold"].includes(domain.type));
  const approved = !preGateSales && (domain.sourceHandle === "yes" || domain.type === "approval");
  const isAuxiliaryEdge =
    domain.type === "supporting" ||
    domain.type === "dependency" ||
    domain.lineStyle === "dotted";
  const displayLabel = domain.label !== undefined && domain.label !== ""
      ? domain.label
      : approved
        ? "APPROVED"
        : denied
          ? "DENIED"
          : "";
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
        // Exclude obstacles that *contain* the source or target node — the
        // edge ends inside them, so they can't be in the way between the two
        // endpoints.
        const containsEndpoint = (obstacle: { id: string; x: number; y: number; width: number; height: number }) => {
          if (sourceObstacle && obstacle.id === sourceObstacle.id) return true;
          if (targetObstacle && obstacle.id === targetObstacle.id) return true;
          const sourceInside =
            sourceX >= obstacle.x &&
            sourceX <= obstacle.x + obstacle.width &&
            sourceY >= obstacle.y &&
            sourceY <= obstacle.y + obstacle.height;
          const targetInside =
            targetX >= obstacle.x &&
            targetX <= obstacle.x + obstacle.width &&
            targetY >= obstacle.y &&
            targetY <= obstacle.y + obstacle.height;
          return sourceInside || targetInside;
        };
        const left = Math.min(sourceRight, targetLeft);
        const right = Math.max(sourceRight, targetLeft);
        const cards = cardObstacles(obstacles);
        const crossedObstacles = cards.filter(
          (item) => item.x <= right && item.x + item.width >= left,
        );
        // Centered escape and approach in gaps between obstacles, with strict directional clamping
        let safeApproachX = targetLeft - 24;
        let safeEscapeX = sourceRight + 24;

        const lastIntermediate = crossedObstacles
          .filter((obs) => obs.id !== domain.source && obs.id !== domain.target && obs.x + obs.width <= targetLeft)
          .sort((a, b) => (b.x + b.width) - (a.x + a.width))[0];

        if (lastIntermediate) {
          const gapLeft = lastIntermediate.x + lastIntermediate.width;
          const gapRight = targetLeft;
          if (gapRight > gapLeft) {
            safeApproachX = (gapLeft + gapRight) / 2;
          } else {
            safeApproachX = targetLeft - 20;
          }
        }

        const firstIntermediate = crossedObstacles
          .filter((obs) => obs.id !== domain.source && obs.id !== domain.target && obs.x >= sourceRight)
          .sort((a, b) => a.x - b.x)[0];

        if (firstIntermediate) {
          const gapLeft = sourceRight;
          const gapRight = firstIntermediate.x;
          if (gapRight > gapLeft) {
            safeEscapeX = (gapLeft + gapRight) / 2;
          } else {
            safeEscapeX = sourceRight + 20;
          }
        }

        safeApproachX = Math.min(safeApproachX, targetLeft - 12);
        safeEscapeX = Math.max(safeEscapeX, sourceRight + 12);

        const sourceBottom = sourceObstacle ? sourceObstacle.y + sourceObstacle.height : sourceY;
        const targetBottom = targetObstacle ? targetObstacle.y + targetObstacle.height : targetY;
        const routeAbove = targetY < sourceY;

        const lane = Math.abs(data?.labelLane ?? 0) % 3;
        if (routeAbove) {
          const highestCardTop = aboveRouteCardTop(
            sourceObstacle,
            targetObstacle,
            Math.min(sourceY, targetY),
            crossedObstacles.filter((item) => !containsEndpoint(item)),
          );
          const corridorY = corridorYAboveCards(
            highestCardTop,
            lane,
            left,
            right,
            phaseHeaderObstacles(obstacles),
          );
          return compact([
            { x: sourceX, y: sourceY },
            { x: safeEscapeX, y: sourceY },
            { x: safeEscapeX, y: corridorY },
            { x: safeApproachX, y: corridorY },
            { x: safeApproachX, y: targetY },
            { x: targetX, y: targetY },
          ]);
        }
        const lowestCardBottom = crossedObstacles.length
          ? Math.max(...crossedObstacles.map((item) => item.y + item.height), sourceBottom, targetBottom)
          : Math.max(sourceBottom, targetBottom);
        const corridorY = lowestCardBottom + 56 + lane * 28;
        return compact([
          { x: sourceX, y: sourceY },
          { x: safeEscapeX, y: sourceY },
          { x: safeEscapeX, y: corridorY },
          { x: safeApproachX, y: corridorY },
          { x: safeApproachX, y: targetY },
          { x: targetX, y: targetY },
        ]);
      })()
    : undefined;
  const automaticRoute = (() => {
    if (preGateSalesRoute || deniedRoute || approvedRoute) return undefined;
    const obstacles = data?.obstacles ?? [];
    if (isAuxiliaryEdge) {
      const cards = cardObstacles(obstacles);
      const sourceObstacle = cards.find((item) => item.id === domain.source);
      const targetObstacle = cards.find((item) => item.id === domain.target);
      const lane = Math.abs(data?.labelLane ?? 0) % 3;
      const sourceEscapeX =
        (sourceObstacle?.x ?? sourceX) +
        (sourceObstacle?.width ?? 0) +
        24 +
        lane * 64;
      const targetApproachX =
        (targetObstacle?.x ?? targetX) - 24 - lane * 64;
      const bottomY =
        Math.max(
          sourceObstacle?.y ?? sourceY,
          targetObstacle?.y ?? targetY,
          ...cards.map((item) => item.y + item.height),
        ) +
        56 +
        lane * 28;
      const sourceStub = stub({ x: sourceX, y: sourceY }, sourcePosition, 16);
      const targetStub = stub({ x: targetX, y: targetY }, targetPosition, MIN_END_STUB);
      return compact([
        { x: sourceX, y: sourceY },
        sourceStub,
        { x: sourceEscapeX, y: sourceY },
        { x: sourceEscapeX, y: bottomY },
        { x: targetApproachX, y: bottomY },
        { x: targetApproachX, y: targetY },
        targetStub,
        { x: targetX, y: targetY },
      ]);
    }
    const sourceObstacle = obstacles.find((item) => item.id === domain.source);
    const targetObstacle = obstacles.find((item) => item.id === domain.target);
    const sourceStub = stub({ x: sourceX, y: sourceY }, sourcePosition, 16);
    const targetStub = stub({ x: targetX, y: targetY }, targetPosition, MIN_END_STUB);
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
      const cards = cardObstacles(obstacles);
      const minSpanX = Math.min(sourceX, targetX);
      const maxSpanX = Math.max(sourceX, targetX);
      const intermediateCards = cards.filter(
        (item) =>
          item.id !== domain.source &&
          item.id !== domain.target &&
          item.x + item.width > minSpanX + 16 &&
          item.x < maxSpanX - 16,
      );

      const pathCollidesWithCards = intermediateCards.some(
        (c) =>
          c.y <= Math.max(sourceY, targetY) + 30 &&
          c.y + c.height >= Math.min(sourceY, targetY) - 30,
      );

      const needsDetour =
        pathCollidesWithCards ||
        (stacked && (escapeX < approachX || targetX < sourceX));

      if (needsDetour) {
        let safeApproachX = approachX;
        let safeEscapeX = escapeX;

        const lastIntermediateBeforeTarget = intermediateCards
          .filter((c) => c.x + c.width <= targetX)
          .sort((a, b) => (b.x + b.width) - (a.x + a.width))[0];

        if (lastIntermediateBeforeTarget && targetPosition === Position.Left) {
          const gapLeft = lastIntermediateBeforeTarget.x + lastIntermediateBeforeTarget.width;
          const gapRight = targetX;
          if (gapRight > gapLeft) {
            safeApproachX = (gapLeft + gapRight) / 2;
          } else {
            safeApproachX = targetX - 24;
          }
        }

        const firstIntermediateAfterSource = intermediateCards
          .filter((c) => c.x >= sourceX)
          .sort((a, b) => a.x - b.x)[0];

        if (firstIntermediateAfterSource && sourcePosition === Position.Right) {
          const gapLeft = sourceX;
          const gapRight = firstIntermediateAfterSource.x;
          if (gapRight > gapLeft) {
            safeEscapeX = (gapLeft + gapRight) / 2;
          } else {
            safeEscapeX = sourceX + 24;
          }
        }

        // Hard directional clamps: never cross into the node
        if (targetPosition === Position.Left) {
          safeApproachX = Math.min(safeApproachX, targetX - 14);
        } else if (targetPosition === Position.Right) {
          safeApproachX = Math.max(safeApproachX, targetX + 14);
        }

        if (sourcePosition === Position.Right) {
          safeEscapeX = Math.max(safeEscapeX, sourceX + 14);
        } else if (sourcePosition === Position.Left) {
          safeEscapeX = Math.min(safeEscapeX, sourceX - 14);
        }

        const highestCardTop = intermediateCards.length
          ? Math.min(...intermediateCards.map((c) => c.y), sourceTop, targetTop)
          : Math.min(sourceTop, targetTop);
        const lowestCardBottom = intermediateCards.length
          ? Math.max(...intermediateCards.map((c) => c.y + c.height), sourceBottom, targetBottom)
          : Math.max(sourceBottom, targetBottom);

        const lane = Math.abs(data?.labelLane ?? 0) % 3;
        const aboveY = corridorYAboveCards(
          highestCardTop,
          lane,
          minSpanX,
          maxSpanX,
          phaseHeaderObstacles(obstacles),
        );
        const belowY = lowestCardBottom + 56 + lane * 28;
        const aboveCost = Math.abs(sourceY - aboveY) + Math.abs(targetY - aboveY);
        const belowCost = Math.abs(sourceY - belowY) + Math.abs(targetY - belowY);
        const corridorY =
          targetY > sourceY + 40
            ? belowY
            : targetY < sourceY - 40
              ? aboveY
              : aboveCost <= belowCost
                ? aboveY
                : belowY;

        return compact([
          { x: sourceX, y: sourceY },
          { x: safeEscapeX, y: sourceY },
          { x: safeEscapeX, y: corridorY },
          { x: safeApproachX, y: corridorY },
          { x: safeApproachX, y: targetY },
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

  const routedCollides = Boolean(
    routed &&
    (data?.obstacles ?? []).some(
      (obs) =>
        obs.id !== domain.source &&
        obs.id !== domain.target &&
        obs.kind !== "phase-header" &&
        routed.some((pt, idx) => {
          if (idx === 0) return false;
          const prev = routed[idx - 1];
          const minX = Math.min(prev.x, pt.x);
          const maxX = Math.max(prev.x, pt.x);
          const minY = Math.min(prev.y, pt.y);
          const maxY = Math.max(prev.y, pt.y);
          return (
            minX <= obs.x + obs.width - 4 &&
            maxX >= obs.x + 4 &&
            minY <= obs.y + obs.height - 4 &&
            maxY >= obs.y + 4
          );
        }),
    ),
  );

  // Live routes win when a stored auto-layout polyline has become a long
  // detour or passes through an obstacle card.
  const storedDetour =
    Boolean(routed && automaticRoute) &&
    (routedCollides || pathLength(routed!) > pathLength(automaticRoute!) * 1.2 + 40);
  const visibleRoute = withMinEndStub(
    preGateSalesRoute ??
      deniedRoute ??
      approvedRoute ??
      (isAuxiliaryEdge
        ? automaticRoute ?? routed
        : storedDetour || routedCollides
          ? automaticRoute
          : routed) ??
      automaticRoute ??
      [],
    targetPosition,
  );
  const path = visibleRoute.length >= 2 ? roundedPath(visibleRoute) : bezierPath;
  const labelGuide = visibleRoute.length >= 2 ? visibleRoute : [
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
    visibleRoute.length >= 2 ? undefined : { x: bezierLabelX, y: bezierLabelY },
    approved,
    data?.siblingIndex ?? 0,
    data?.siblingCount ?? 1,
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
  const rawColor = getSemanticEdgeColor(domain);
  const active = data?.active;
  const color = active === false ? "#94a3b8" : rawColor;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected ? 3.8 : active ? 3.2 : 2.0,
          opacity: active === false ? 0.3 : 1,
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
        markerEnd={markerEnd}
      />
      {active ? (
        <path
          aria-hidden="true"
          d={path}
          fill="none"
          className="workflow-edge-flow pointer-events-none"
          style={{ color, stroke: color, opacity: selected ? 1 : 0.85 }}
        />
      ) : null}
      <EdgeLabelRenderer>
        <EditableEdgeLabel
          key={`${id}-${domain.label ?? ""}-${displayLabel}`}
          id={id}
          displayLabel={displayLabel}
          rawLabel={domain.label}
          color={color}
          active={active}
          approved={approved}
          approvedLabelMaxWidth={approvedLabelMaxWidth}
          placement={placement}
          selected={selected}
        />
      </EdgeLabelRenderer>
    </>
  );
}
