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
  routeHighlight,
  routePlanExitBus,
  routePlanLayout,
  type PlanBox,
} from "@/lib/route-plan-flow";
import { roundedPath } from "@/lib/semantic-edge-geometry";

/**
 * Every customer's route from Qualification. Customers on the same path share
 * a lane: [LOI] → plans? → (CSA until there are plans) → GC / PCS. The path
 * from Form [1.01] is highlighted.
 */

/** The colour of a route's tag (LOI, CSA, PCS), which its lines take in the print. */
const tagColor = (text?: string) => (text ? ROUTE_STEP_COLORS[text]?.stroke : undefined);
const LOI = ROUTE_STEP_COLORS.LOI;
const YES = { stroke: "#059669", fill: "#ecfdf5", text: "#047857" };
const NO = { stroke: "#dc2626", fill: "#fef2f2", text: "#b91c1c" };

type Point = { x: number; y: number };

function Box({ box, boxHeight, on }: { box: PlanBox; boxHeight: number; on: boolean }) {
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
        strokeWidth={on ? 1.8 : 1}
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
  // The same rule the tests check: lane, boxes along the path, and the way out.
  const highlight = routeHighlight(layout, current, plans);
  const litLane = highlight.lane;
  const litPlans = highlight.plans;
  const finalLane = highlight.out ? litLane : undefined;
  const boxOn = (laneOn: boolean, text: string) => laneOn && highlight.boxes.includes(text);
  const markerOn = `route-flow-on-${id}`;
  const markerOff = `route-flow-off-${id}`;

  const line = (
    points: Point[],
    on: boolean,
    options: { arrow?: boolean; printColor?: string; part: string; dashed?: boolean },
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

      {/* Client boxes → their situations → onto a lane. */}
      {layout.trunks.map((trunk) => {
        const on = Boolean(currentId && trunk.caseIds.includes(currentId));
        return (
          <g key={`trunk-${trunk.client}`} data-route-trunk={trunk.client}>
            {line(trunk.points.slice(0, 2), on, { part: "client" })}
            {line(trunk.points.slice(2), on, { part: "trunk" })}
          </g>
        );
      })}
      {layout.branches.map((branch) => {
        const on = Boolean(currentId && branch.caseIds.includes(currentId));
        const lane = layout.lanes.find((item) =>
          item.cases.some((caseId) => branch.caseIds.includes(caseId)),
        );
        return (
          <g
            key={branch.caseIds.join("-")}
            data-route-branch={branch.caseIds.join(" ")}
            aria-label={[branch.client, branch.label].filter(Boolean).join(" · ")}
            className={currentId && !on ? "opacity-55" : undefined}
          >
            {branch.label
              ? line(
                  [
                    { x: layout.clientWidth + 10, y: branch.labelY! },
                    { x: branch.labelX! - 2, y: branch.labelY! },
                  ],
                  on,
                  { part: "branch" },
                )
              : null}
            {branch.label ? (
              <text
                x={branch.labelX}
                y={branch.labelY}
                dominantBaseline="central"
                fontSize={9.5}
                fontWeight={on ? 800 : 600}
                fill={on ? ROUTE_FLOW_ON : "currentColor"}
              >
                {branch.label}
              </text>
            ) : null}
            {line(branch.points, on, {
              part: "join",
              printColor: lane?.loi ? LOI.stroke : undefined,
            })}
          </g>
        );
      })}

      {layout.lanes.map((lane) => {
        const laneOn = lane.id === litLane;
        const viaPlans = laneOn && litPlans === "yes";
        const viaCsa = laneOn && litPlans === "no";
        const ends = viaPlans || viaCsa;
        return (
          <g
            key={lane.id}
            data-qualification-route-lane={lane.id}
            data-qualification-route-case={laneOn ? currentId : undefined}
            data-route-plans={laneOn ? litPlans : undefined}
            data-active={laneOn ? "true" : undefined}
            className={currentId && !laneOn ? "opacity-55" : undefined}
          >
            {line(lane.entry, laneOn, {
              arrow: true,
              part: "entry",
              printColor: lane.loi ? LOI.stroke : undefined,
            })}
            {line(lane.toFork, laneOn, {
              part: "to-fork",
              printColor: lane.loi ? LOI.stroke : undefined,
            })}
            {/* Plans? Yes: straight on. No: CSA until there are plans, then back on the line. */}
            {line(lane.yes, viaPlans, {
              arrow: true,
              part: "yes",
              printColor: tagColor(lane.ends[0].text),
            })}
            {line(lane.no, viaCsa, { arrow: true, part: "no", printColor: tagColor("CSA") })}
            {line(lane.loop, false, { arrow: true, part: "loop", dashed: true })}
            <text
              x={lane.loopLabel.x}
              y={lane.loopLabel.y}
              dominantBaseline="central"
              fontSize={7}
              fontStyle="italic"
              fill="#64748b"
            >
              until plans
            </text>
            {line(lane.back, viaCsa, {
              arrow: true,
              part: "back",
              printColor: tagColor(lane.ends[0].text),
            })}
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
            <text
              x={lane.question.x}
              y={lane.question.y}
              dominantBaseline="central"
              fontSize={7}
              fontStyle="italic"
              fill="#64748b"
            >
              Plans?
            </text>
            {lane.chips.map((chip) => {
              const palette = chip.ok ? YES : NO;
              const lit = (chip.part === "yes" && viaPlans) || (chip.part !== "yes" && viaCsa);
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
              <Box
                box={lane.loiBox}
                boxHeight={layout.boxHeight}
                on={boxOn(laneOn, lane.loiBox.text)}
              />
            ) : null}
            <Box box={lane.csa} boxHeight={layout.boxHeight} on={boxOn(laneOn, lane.csa.text)} />
            {lane.ends.map((box) => (
              <Box
                key={box.text}
                box={box}
                boxHeight={layout.boxHeight}
                on={boxOn(laneOn, box.text)}
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
          Boolean(
            currentId &&
            layout.branches.some(
              (branch) => branch.client === item.client && branch.caseIds.includes(currentId),
            ),
          );
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
