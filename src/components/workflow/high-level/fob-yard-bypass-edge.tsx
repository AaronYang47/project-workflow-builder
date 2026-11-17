"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

export type FobYardBypassEdge = Edge<{ skippedNodeId: string }, "fobYardBypass">;

const RADIUS = 12;
const CLEARANCE = 44;

/** Display-only route from the step before a skipped Phase to Final Close,
 * drawn underneath the skipped Phase so it never crosses it. */
export function FobYardBypassEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
}: EdgeProps<FobYardBypassEdge>) {
  const skipped = useInternalNode(data?.skippedNodeId ?? "");
  const skippedBottom = skipped
    ? skipped.internals.positionAbsolute.y + (skipped.measured.height ?? 0)
    : Math.max(sourceY, targetY);
  const laneY = Math.max(sourceY, targetY, skippedBottom) + CLEARANCE;
  const outX = sourceX + 24;
  const inX = targetX - 24;
  const r = RADIUS;
  const path = [
    `M ${sourceX} ${sourceY}`,
    `L ${outX - r} ${sourceY}`,
    `Q ${outX} ${sourceY} ${outX} ${sourceY + r}`,
    `L ${outX} ${laneY - r}`,
    `Q ${outX} ${laneY} ${outX + r} ${laneY}`,
    `L ${inX - r} ${laneY}`,
    `Q ${inX} ${laneY} ${inX} ${laneY - r}`,
    `L ${inX} ${targetY + r}`,
    `Q ${inX} ${targetY} ${inX + r} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute rounded-full border border-emerald-500/40 bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
          style={{
            transform: `translate(-50%, -50%) translate(${(outX + inX) / 2}px, ${laneY}px)`,
          }}
        >
          FOB yard
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
