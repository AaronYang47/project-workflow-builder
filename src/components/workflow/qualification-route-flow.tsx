"use client";

import { useMemo } from "react";
import { QUALIFICATION_CASES } from "@/lib/qualification";
import {
  ROUTE_FLOW_OFF,
  ROUTE_FLOW_ON,
  ROUTE_STEP_COLORS,
  ROUTE_STEP_DEFAULT,
} from "@/lib/route-flow-layout";
import {
  laneOfCase,
  plansOfCase,
  routePlanExitBus,
  routePlanLayout,
  type PlanBox,
  type PlanLane,
} from "@/lib/route-plan-flow";
import { roundedPath } from "@/lib/semantic-edge-geometry";

/**
 * Every customer's route from Qualification, as one lane each: [LOI] → plans?
 * → (consultant service until there are plans) → GC / PCS. The path from
 * Form [1.01] is highlighted.
 */

/** The colour of a route's tag (LOI, CSA, PCS), which its lines take in the print. */
const tagColor = (text?: string) => (text ? ROUTE_STEP_COLORS[text]?.stroke : undefined);
const LOI = ROUTE_STEP_COLORS.LOI;
const YES = { stroke: "#059669", fill: "#ecfdf5", text: "#047857" };
const NO = { stroke: "#dc2626", fill: "#fef2f2", text: "#b91c1c" };

function Box({
  box,
  boxHeight,
  on,
  laneOn,
}: {
  box: PlanBox;
  boxHeight: number;
  on: boolean;
  laneOn: boolean;
}) {
  const palette = ROUTE_STEP_COLORS[box.text] ?? ROUTE_STEP_DEFAULT;
  const top = box.y - boxHeight / 2;
  return (
    <g data-qualification-flow-box={on ? box.text : undefined} data-route-box={box.text}>
      <rect
        x={box.x}
        y={top}
        width={box.width}
        height={boxHeight}
        rx={3}
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth={on ? 1.8 : laneOn ? 1.2 : 1}
      />
      <text
        x={box.x + box.width / 2}
        y={box.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9.5}
        fontWeight={800}
        fill={palette.text}
      >
        {box.text}
      </text>
      {box.loiTag ? (
        <g data-route-loi-tag>
          <rect
            x={box.x + box.width - 12}
            y={top - 5}
            width={16}
            height={8}
            rx={2}
            fill={LOI.stroke}
          />
          <text
            x={box.x + box.width - 4}
            y={top - 1}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={5.6}
            fontWeight={800}
            fill="#ffffff"
          >
            LOI
          </text>
        </g>
      ) : null}
    </g>
  );
}

export function QualificationRouteFlow({
  id,
  currentId,
  client,
  plans,
  exitBus = false,
  scale = 1,
  svgRef,
}: {
  svgRef?: React.Ref<SVGSVGElement>;
  /** Join every exit onto one bus and carry one line out to the right edge. */
  exitBus?: boolean;
  /** Pixels per layout unit; the chart keeps this size instead of stretching. */
  scale?: number;
  id: string;
  currentId?: string;
  client?: string;
  /** Whether the project has plans (for situations that do not say so themselves). */
  plans?: "yes" | "no";
}) {
  const layout = useMemo(() => routePlanLayout(), []);
  const bus = useMemo(() => routePlanExitBus(layout), [layout]);
  const viewWidth = exitBus ? bus.width : layout.width;
  const current = QUALIFICATION_CASES.find((item) => item.id === currentId);
  const litLane = laneOfCase(currentId);
  const litPlans = plansOfCase(current, plans);
  // The route reaches the end once we know which way the plans question goes.
  const finalLane = litLane && litPlans ? litLane : undefined;
  const markerOn = `route-flow-on-${id}`;
  const markerOff = `route-flow-off-${id}`;

  const segment = (
    lane: PlanLane,
    points: { x: number; y: number }[],
    on: boolean,
    options: { arrow?: boolean; printColor?: string; part: string; dashed?: boolean } = {
      part: "",
    },
  ) =>
    points.length ? (
      <path
        data-route-part={options.part}
        data-route-part-on={on ? "true" : undefined}
        data-print-route-color={options.printColor}
        d={roundedPath(points, 5)}
        fill="none"
        stroke={on ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
        strokeWidth={on ? 2.2 : 1.2}
        strokeDasharray={options.dashed && !on ? "3 2" : undefined}
        markerEnd={options.arrow ? `url(#${on ? markerOn : markerOff})` : undefined}
      />
    ) : null;

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

      {/* Each client box branches into its lanes. */}
      {layout.clients.map((item) => {
        const lanes = layout.lanes.filter((lane) => lane.client === item.client);
        if (lanes.length < 2) return null;
        const on = lanes.some((lane) => lane.id === litLane);
        const trunkX = layout.clientWidth + 10;
        return (
          <path
            key={`trunk-${item.client}`}
            d={roundedPath(
              [
                { x: trunkX, y: lanes[0].yTop },
                { x: trunkX, y: lanes.at(-1)!.yTop },
              ],
              4,
            )}
            fill="none"
            stroke={on ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
            strokeWidth={on ? 2.2 : 1.2}
          />
        );
      })}

      {layout.lanes.map((lane) => {
        const laneOn = lane.id === litLane;
        const dim = Boolean(currentId) && !laneOn;
        const viaPlans = laneOn && litPlans === "yes";
        const viaService = laneOn && litPlans === "no";
        const ends = viaPlans || viaService;
        const trunkX = layout.clientWidth + 10;
        return (
          <g
            key={lane.id}
            aria-label={[lane.client, lane.label].filter(Boolean).join(" · ")}
            data-qualification-route-lane={lane.id}
            data-qualification-route-case={laneOn ? currentId : undefined}
            data-route-plans={laneOn ? litPlans : undefined}
            data-active={laneOn ? "true" : undefined}
            className={dim ? "opacity-55" : undefined}
          >
            {/* Client box → its branch → the lane. */}
            {lane.label
              ? segment(
                  lane,
                  [
                    {
                      x: layout.clientWidth,
                      y: layout.clients.find((c) => c.client === lane.client)!.mid,
                    },
                    { x: trunkX, y: layout.clients.find((c) => c.client === lane.client)!.mid },
                  ],
                  laneOn,
                  { part: "client" },
                )
              : null}
            {lane.label
              ? segment(
                  lane,
                  [
                    { x: trunkX, y: lane.yTop },
                    { x: (lane.labelX ?? trunkX) - 2, y: lane.yTop },
                  ],
                  laneOn,
                  { part: "branch" },
                )
              : null}
            {lane.label ? (
              <text
                x={lane.labelX}
                y={lane.yTop}
                dominantBaseline="central"
                fontSize={9.5}
                fontWeight={laneOn ? 800 : 600}
                fill={laneOn ? ROUTE_FLOW_ON : "currentColor"}
              >
                {lane.label}
              </text>
            ) : null}
            {segment(lane, lane.entry, laneOn, {
              arrow: true,
              part: "entry",
              printColor: lane.loi ? LOI.stroke : undefined,
            })}
            {segment(lane, lane.toFork, laneOn, {
              part: "to-fork",
              printColor: lane.loi ? LOI.stroke : undefined,
            })}

            {/* Plans? Yes: straight on. No: the consultant service, until there are plans. */}
            {segment(lane, lane.yes, viaPlans, {
              arrow: true,
              part: "yes",
              printColor: tagColor(lane.ends[0].text),
            })}
            {segment(lane, lane.no, viaService, {
              arrow: true,
              part: "no",
              printColor: tagColor(lane.service.text),
            })}
            {segment(lane, lane.toFork2, viaService, { part: "to-fork2" })}
            {segment(lane, lane.yes2, viaService, {
              arrow: true,
              part: "yes2",
              printColor: tagColor(lane.ends[0].text),
            })}
            {segment(lane, lane.loop, false, { arrow: true, part: "loop", dashed: true })}
            {lane.endLinks.map((link, index) => (
              <line
                key={`end-${index}`}
                data-route-part="end"
                data-print-route-color={tagColor(lane.ends[index + 1]?.text)}
                x1={link[0].x}
                y1={link[0].y}
                x2={link[1].x}
                y2={link[1].y}
                stroke={ends ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
                strokeWidth={ends ? 2.2 : 1.2}
                markerEnd={`url(#${ends ? markerOn : markerOff})`}
              />
            ))}

            {lane.questions.map((point, index) => (
              <text
                key={`q-${index}`}
                x={point.x}
                y={point.y}
                dominantBaseline="central"
                fontSize={7}
                fontStyle="italic"
                fill="#64748b"
              >
                Plans?
              </text>
            ))}
            {lane.chips.map((chip) => {
              const palette = chip.ok ? YES : NO;
              const lit =
                (chip.part === "yes" && viaPlans) ||
                ((chip.part === "no" || chip.part === "yes2") && viaService);
              return (
                <g key={chip.part} data-route-chip={chip.part}>
                  <rect
                    x={chip.x}
                    y={chip.y - layout.chip.height / 2}
                    width={layout.chip.width}
                    height={layout.chip.height}
                    rx={2.5}
                    fill={palette.fill}
                    stroke={palette.stroke}
                    strokeWidth={lit ? 1.6 : 0.9}
                  />
                  <text
                    x={chip.x + layout.chip.width / 2}
                    y={chip.y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={8}
                    fontWeight={800}
                    fill={palette.text}
                  >
                    {chip.ok ? "✓" : "✗"}
                  </text>
                </g>
              );
            })}

            {lane.loiBox ? (
              <Box box={lane.loiBox} boxHeight={layout.boxHeight} on={laneOn} laneOn={laneOn} />
            ) : null}
            <Box box={lane.service} boxHeight={layout.boxHeight} on={viaService} laneOn={laneOn} />
            {lane.ends.map((box) => (
              <Box
                key={box.text}
                box={box}
                boxHeight={layout.boxHeight}
                on={ends}
                laneOn={laneOn}
              />
            ))}
            <circle
              data-qualification-route-exit={lane.id}
              data-print-route-color={tagColor(lane.ends.at(-1)?.text)}
              cx={lane.exit.x}
              cy={lane.exit.y}
              r={3.5}
              fill={lane.id === finalLane ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
              stroke="#ffffff"
              strokeWidth={1.2}
            />
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
            stroke={finalLane ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
            strokeWidth={finalLane ? 2.2 : 1.2}
          />
          {[...layout.lanes]
            .sort((left, right) => Number(left.id === finalLane) - Number(right.id === finalLane))
            .map((lane) => {
              const on = lane.id === finalLane;
              const points = [
                { x: lane.exit.x + 3.5, y: lane.exit.y },
                { x: bus.busX, y: lane.exit.y },
                { x: bus.busX, y: bus.busY },
                ...(on ? [{ x: viewWidth, y: bus.busY }] : []),
              ];
              return (
                <path
                  key={`bus-${lane.id}`}
                  data-qualification-route-exit-line={lane.id}
                  data-print-route-color={tagColor(lane.ends.at(-1)?.text)}
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

      {layout.clients.map((item) => {
        const on =
          item.client === client ||
          layout.lanes.some((lane) => lane.client === item.client && lane.id === litLane);
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
