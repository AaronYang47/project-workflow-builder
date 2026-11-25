"use client";

import { useMemo } from "react";
import { QUALIFICATION_CASES } from "@/lib/qualification";
import {
  ROUTE_FLOW_OFF,
  ROUTE_FLOW_ON,
  ROUTE_STEP_COLORS,
  ROUTE_STEP_DEFAULT,
  routeFlowLayout,
} from "@/lib/route-flow-layout";
import { roundedPath } from "@/lib/semantic-edge-geometry";

/**
 * Every customer situation as a flowchart with lines and arrows. Clicking a
 * branch (or a client type) chooses it; the chosen path is drawn in green.
 */
export function QualificationRouteFlow({
  id,
  currentId,
  client,
  onPickCase,
  onPickClient,
}: {
  id: string;
  currentId?: string;
  client?: string;
  onPickCase: (caseId: string) => void;
  onPickClient: (client: string) => void;
}) {
  const layout = useMemo(() => routeFlowLayout(QUALIFICATION_CASES, { row: 26 }), []);
  // A handed-over situation lights up the situation that carries it on too.
  const handoff = QUALIFICATION_CASES.find((item) => item.id === currentId)?.handoff;
  const lit = new Set([currentId, handoff].filter(Boolean));
  const markerOn = `route-flow-on-${id}`;
  const markerOff = `route-flow-off-${id}`;
  const keyPick = (action: () => void) => (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };
  return (
    <svg
      data-qualification-route-flow
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="nodrag mt-1 block h-auto w-full overflow-visible text-foreground"
      style={{ fontFamily: "inherit" }}
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
        const pick = () => onPickCase(row.item.id);
        return (
          <g
            key={row.item.id}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${row.item.client} · ${row.item.situation}`}
            data-qualification-route-case={row.item.id}
            data-active={on ? "true" : undefined}
            onClick={pick}
            onKeyDown={keyPick(pick)}
            className={`cursor-pointer outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 ${dim ? "opacity-55" : ""}`}
          >
            <rect
              x={layout.clientWidth + 2}
              y={row.y - 12}
              width={row.end - layout.clientWidth}
              height={24}
              rx={4}
              className={on ? "fill-emerald-500/10" : "fill-transparent hover:fill-primary/5"}
            />
            <path d={roundedPath(row.branch, 4)} fill="none" stroke={color} strokeWidth={stroke} />
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
            {row.links.map(([from, to]) => (
              <line
                key={from.x}
                x1={from.x}
                y1={row.y}
                x2={to.x}
                y2={row.y}
                stroke={color}
                strokeWidth={stroke}
                markerEnd={marker}
              />
            ))}
            {row.steps.map((step) => {
              const palette = ROUTE_STEP_COLORS[step.text] ?? ROUTE_STEP_DEFAULT;
              return (
                <g key={step.x} data-qualification-flow-box={on ? step.text : undefined}>
                  <rect
                    x={step.x}
                    y={row.y - layout.boxHeight / 2}
                    width={step.width}
                    height={layout.boxHeight}
                    rx={3}
                    fill={palette.fill}
                    stroke={palette.stroke}
                    strokeWidth={on ? 1.8 : 1}
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
          </g>
        );
      })}
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
        const pick = () => onPickClient(item.client);
        return (
          <g
            key={item.client}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={item.client}
            data-qualification-route-client={item.client}
            onClick={pick}
            onKeyDown={keyPick(pick)}
            className="cursor-pointer outline-none"
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
