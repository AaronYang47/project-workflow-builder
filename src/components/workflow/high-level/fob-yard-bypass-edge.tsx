"use client";

import { BaseEdge, EdgeLabelRenderer, useStore, type Edge, type EdgeProps } from "@xyflow/react";

export type FobYardBypassEdge = Edge<
  { skippedNodeIds: string[]; active?: boolean },
  "fobYardBypass"
>;

const RADIUS = 12;
const CLEARANCE = 44;
const LABEL_GAP = 6;

/** Display-only route from the step before the skipped Phases to the step
 * after them, drawn underneath every skipped Phase so it never crosses one. */
export function FobYardBypassEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
  style,
}: EdgeProps<FobYardBypassEdge>) {
  const skippedIds = data?.skippedNodeIds ?? [];
  // A number, so the edge only re-renders when the lowest bottom moves.
  const skippedBottom = useStore((state) =>
    Math.max(
      Math.max(sourceY, targetY),
      ...skippedIds.map((id) => {
        const node = state.nodeLookup.get(id);
        return node ? node.internals.positionAbsolute.y + (node.measured.height ?? 0) : -Infinity;
      }),
    ),
  );
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
          data-edge-label={id}
          className={`nodrag nopan pointer-events-none absolute rounded-full border bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${data?.active ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-slate-400/50 text-slate-500"}`}
          style={{
            // Just below the line, so the line never runs through the text.
            transform: `translate(-50%, 0) translate(${(outX + inX) / 2}px, ${laneY + LABEL_GAP}px)`,
          }}
        >
          FOB yard
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
