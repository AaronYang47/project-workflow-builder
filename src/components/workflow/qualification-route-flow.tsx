"use client";

import { useMemo } from "react";
import { QUALIFICATION_CASES } from "@/lib/qualification";
import {
  ROUTE_FLOW_OFF,
  ROUTE_FLOW_ON,
  ROUTE_STEP_COLORS,
  ROUTE_STEP_DEFAULT,
  routeFlowExitBus,
  routeFlowLayout,
} from "@/lib/route-flow-layout";
import { roundedPath } from "@/lib/semantic-edge-geometry";

/**
 * Displays every customer situation and highlights the path from Form [1.01].
 */
export function QualificationRouteFlow({
  id,
  currentId,
  client,
  exitBus = false,
  scale = 1,
  stepLimit,
  exitEnabled = true,
  svgRef,
}: {
  svgRef?: React.Ref<SVGSVGElement>;
  /** Join every exit onto one bus and carry one line out to the right edge. */
  exitBus?: boolean;
  /** Pixels per layout unit; the chart keeps this size instead of stretching. */
  scale?: number;
  stepLimit?: number;
  exitEnabled?: boolean;
  id: string;
  currentId?: string;
  client?: string;
}) {
  const layout = useMemo(() => routeFlowLayout(QUALIFICATION_CASES, { row: 26 }), []);
  const bus = useMemo(() => routeFlowExitBus(layout), [layout]);
  const viewWidth = exitBus ? bus.width : layout.width;
  // A handed-over situation lights up the situation that carries it on too.
  const handoff = QUALIFICATION_CASES.find((item) => item.id === currentId)?.handoff;
  const lit = new Set([currentId, handoff].filter(Boolean));
  const finalRow = exitEnabled
    ? layout.rows.find((row) => row.item.id === (handoff ?? currentId))
    : undefined;
  const markerOn = `route-flow-on-${id}`;
  const markerOff = `route-flow-off-${id}`;
  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="Customer routing paths from Qualification"
      data-qualification-route-flow
      viewBox={`0 0 ${viewWidth} ${layout.height}`}
      className="nodrag mt-1 block h-auto overflow-visible text-foreground"
      style={{ fontFamily: "inherit", width: viewWidth * scale, maxWidth: "100%" }}
    >
      <defs>
        {[
          [markerOn, ROUTE_FLOW_ON],
          [markerOff, ROUTE_FLOW_OFF],
        ].map(([markerId, color]) => (
          <marker
            key={markerId}
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M1 1L9 5L1 9Z" fill={color} />
          </marker>
        ))}
      </defs>
      {layout.rows.map((row) => {
        const on = lit.has(row.item.id);
        const dim = Boolean(currentId) && !on;
        const color = on ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF;
        const stroke = on ? 2.2 : 1.2;
        const marker = `url(#${on ? markerOn : markerOff})`;
        return (
          <g
            key={row.item.id}
            aria-label={`${row.item.client} · ${row.item.situation}`}
            data-qualification-route-case={row.item.id}
            data-active={on ? "true" : undefined}
            className={dim ? "opacity-55" : undefined}
          >
            <rect
              x={layout.clientWidth + 2}
              y={row.y - 12}
              width={row.end - layout.clientWidth}
              height={24}
              rx={4}
              className={on ? "fill-emerald-500/10" : "fill-transparent"}
            />
            <path d={roundedPath(row.branch, 6)} fill="none" stroke={color} strokeWidth={stroke} />
            <text
              x={row.labelX}
              y={row.y}
              dominantBaseline="central"
              fontSize={9.5}
              fontWeight={on ? 800 : 600}
              fill={on ? ROUTE_FLOW_ON : "currentColor"}
            >
              {row.item.situation}
            </text>
            {row.lead && (
              <line
                x1={row.lead[0].x}
                y1={row.y}
                x2={row.lead[1].x}
                y2={row.y}
                stroke={color}
                strokeWidth={stroke}
                markerEnd={marker}
              />
            )}
            {row.links.map(([from, to], index) => (
              <line
                key={from.x}
                x1={from.x}
                y1={row.y}
                x2={to.x}
                y2={row.y}
                stroke={
                  on && (stepLimit === undefined || index + 1 < stepLimit)
                    ? ROUTE_FLOW_ON
                    : ROUTE_FLOW_OFF
                }
                strokeWidth={stroke}
                markerEnd={
                  on && (stepLimit === undefined || index + 1 < stepLimit)
                    ? marker
                    : `url(#${markerOff})`
                }
              />
            ))}
            {row.steps.map((step, index) => {
              const stepOn = on && (stepLimit === undefined || index < stepLimit);
              const palette = ROUTE_STEP_COLORS[step.text] ?? ROUTE_STEP_DEFAULT;
              return (
                <g key={step.x} data-qualification-flow-box={stepOn ? step.text : undefined}>
                  <rect
                    x={step.x}
                    y={row.y - layout.boxHeight / 2}
                    width={step.width}
                    height={layout.boxHeight}
                    rx={3}
                    fill={palette.fill}
                    stroke={palette.stroke}
                    strokeWidth={stepOn ? 1.8 : 1}
                  />
                  <text
                    x={step.x + step.width / 2}
                    y={row.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={9.5}
                    fontWeight={800}
                    fill={palette.text}
                  >
                    {step.text}
                  </text>
                </g>
              );
            })}
            {row.exit && (
              <circle
                data-qualification-route-exit={row.item.id}
                cx={row.exit.x}
                cy={row.exit.y}
                r={3.5}
                fill={row === finalRow ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
                stroke="#ffffff"
                strokeWidth={1.2}
              />
            )}
          </g>
        );
      })}
      {exitBus && (
        <g data-qualification-route-bus pointerEvents="none">
          {/* One line out to the edge, level with the middle of the bus. */}
          <line
            data-qualification-route-out
            x1={bus.busX}
            y1={bus.busY}
            x2={viewWidth}
            y2={bus.busY}
            stroke={finalRow ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
            strokeWidth={finalRow ? 2.2 : 1.2}
          />
          {/* Each exit runs right and curves onto the bus toward its middle; the
              chosen one carries on round the last bend and out. */}
          {[...layout.rows]
            .sort((left, right) => Number(left === finalRow) - Number(right === finalRow))
            .map((row) => {
              if (!row.exit) return null;
              const on = row === finalRow;
              const points = [
                { x: row.exit.x + 3.5, y: row.exit.y },
                { x: bus.busX, y: row.exit.y },
                { x: bus.busX, y: bus.busY },
                ...(on ? [{ x: viewWidth, y: bus.busY }] : []),
              ];
              return (
                <path
                  key={`bus-${row.item.id}`}
                  data-qualification-route-exit-line={row.item.id}
                  d={roundedPath(points, 8)}
                  fill="none"
                  stroke={on ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
                  strokeWidth={on ? 2.2 : 1}
                  strokeLinecap="round"
                />
              );
            })}
        </g>
      )}
      {/* Hand-over lines sit outside the rows so each row stays its own click target. */}
      {layout.rows.map((row) => {
        if (!row.handoff) return null;
        const on = lit.has(row.item.id);
        return (
          <path
            key={`handoff-${row.item.id}`}
            data-qualification-route-handoff={row.item.id}
            pointerEvents="none"
            d={roundedPath(row.handoff, 5)}
            fill="none"
            stroke={on ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
            strokeWidth={on ? 2.2 : 1.2}
            strokeDasharray={on ? undefined : "3 2"}
            markerEnd={`url(#${on ? markerOn : markerOff})`}
            className={currentId && !on ? "opacity-55" : undefined}
          />
        );
      })}
      {layout.clients.map((item) => {
        const on = item.client === client || item.ids.some((caseId) => lit.has(caseId));
        return (
          <g
            key={item.client}
            aria-label={item.client}
            data-qualification-route-client={item.client}
          >
            <rect
              x={1}
              y={item.top + 3}
              width={layout.clientWidth - 2}
              height={item.bottom - item.top - 6}
              rx={5}
              fill={on ? "#dcfce7" : "#f8fafc"}
              stroke={on ? ROUTE_FLOW_ON : "#64748b"}
              strokeWidth={on ? 1.8 : 1}
            />
            <text
              x={layout.clientWidth / 2}
              y={item.mid}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10.5}
              fontWeight={800}
              fill={on ? "#14532d" : "#0f172a"}
            >
              {item.client}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
