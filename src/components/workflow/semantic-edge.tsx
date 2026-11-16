"use client";

import { useEffect, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import { cardObstacles, corridorYAboveCards, aboveRouteCardTop, phaseHeaderObstacles } from "@/lib/edge-routing";
import { type SemanticFlowEdge, getSemanticEdgeColor, pathLength, stub, MIN_END_STUB, withMinEndStub, compact, roundedPath, routedPoints, placeLabel } from "@/lib/semantic-edge-geometry";

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
            opacity: active === false ? 0.8 : 1,
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
        const intermediateObstacles = crossedObstacles.filter(
          (obs) =>
            obs.id !== domain.source &&
            obs.id !== domain.target &&
            !containsEndpoint(obs),
        );
        if (intermediateObstacles.length === 0 && targetLeft >= sourceRight - 10) {
          return undefined;
        }
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

      const intermediateCards = cards.filter(
        (item) =>
          item.id !== domain.source &&
          item.id !== domain.target &&
          !containsEndpoint(item) &&
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
  const chapterConnection = data?.chapterConnection;
  const chapterRoute = chapterConnection?.points.map((point, index, points) => {
    if (index === 0) return { x: sourceX, y: sourceY };
    if (index === points.length - 1) return { x: targetX, y: targetY };
    if (index === 1) return { x: point.x, y: sourceY };
    if (index === points.length - 2) return { x: point.x, y: targetY };
    return point;
  });
  const visibleRoute = chapterRoute ?? withMinEndStub(
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
  const placement = chapterConnection?.label ? { point: chapterConnection.label, avoided: false } : placeLabel(
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
  const color = rawColor;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected ? 3.8 : active ? 3.2 : 2.0,
          opacity: active === false ? 0.65 : 1,
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
