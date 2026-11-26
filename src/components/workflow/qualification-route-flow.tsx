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
  laneHighlight,
  plansOfCase,
  routeHighlight,
  routePlanExitBus,
  routePlanLayout,
  type PlanBox,
  type PlanLaneId,
  PLAN_READY,
  ROUTE_CORNER,
} from "@/lib/route-plan-flow";
import { roundedPath } from "@/lib/semantic-edge-geometry";

/**
 * Every customer's route from Qualification. Customers on the same path share
 * a lane: [LOI] → plans? → (CSA until there are plans) → GC / PCS. The path
 * from Form [1.01] is highlighted.
 */

const LOI = ROUTE_STEP_COLORS.LOI;
/**
 * Print colours by stage: an LOI lane is purple all the way; otherwise orange
 * until CSA, blue from CSA, and green from Plan Ready on.
 */
const PRINT_STAGE = {
  before: ROUTE_STEP_COLORS.PCS.stroke,
  csa: ROUTE_STEP_COLORS.CSA.stroke,
  ready: ROUTE_STEP_COLORS["Plan Ready"].stroke,
} as const;
const printStage = (loi: boolean | undefined, stage: keyof typeof PRINT_STAGE) =>
  loi ? LOI.stroke : PRINT_STAGE[stage];
const YES = { stroke: "#059669", fill: "#ecfdf5", text: "#047857" };
const NO = { stroke: "#dc2626", fill: "#fef2f2", text: "#b91c1c" };
const GREY = { stroke: "#94a3b8", fill: "#f8fafc", text: "#64748b" };

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
        fill={on && box.text === PLAN_READY ? "#bbf7d0" : palette.fill}
        stroke={on && box.text === PLAN_READY ? ROUTE_FLOW_ON : palette.stroke}
        strokeWidth={on ? 1.8 : 1}
      />
      <text
        x={box.x + box.width / 2}
        y={box.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={box.fontSize ?? 9.5}
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
  consultPlans,
  laneId,
  onChoosePlans,
  onChooseConsultPlans,
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
  /** The lane of the customer the form describes, lit even before plans are chosen. */
  laneId?: PlanLaneId;
  /** Tapping ✓ / ✗ at "Plans?" on the lit lane chooses it (tap again to clear). */
  onChoosePlans?: (plans: "yes" | "no" | undefined) => void;
  /** The second "Plans?", after CSA / Consultation. */
  consultPlans?: "yes" | "no";
  onChooseConsultPlans?: (plans: "yes" | "no" | undefined) => void;
}) {
  const layout = useMemo(() => routePlanLayout(), []);
  const bus = useMemo(() => routePlanExitBus(layout), [layout]);
  const viewWidth = exitBus ? bus.width : layout.width;
  const left = bus.left;
  const current = QUALIFICATION_CASES.find((item) => item.id === currentId);
  // The same rule the tests check: lane, boxes along the path, and the way out.
  const highlight = laneId
    ? laneHighlight(layout, laneId, plansOfCase(current, plans), consultPlans)
    : routeHighlight(layout, current, plans, consultPlans);
  const litLane = highlight.lane;
  const litPlans = highlight.plans;
  const finalLane = highlight.out ? litLane : undefined;
  // The customer type the form describes: its box, its own way in and its branch light up.
  const litClient = litLane ? client : undefined;
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
        d={roundedPath(points, ROUTE_CORNER)}
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
      viewBox={`${-left} 0 ${viewWidth + left} ${layout.height}`}
      className="nodrag mt-1 block h-auto overflow-visible text-foreground"
      style={{ fontFamily: "inherit", width: (viewWidth + left) * scale, maxWidth: "100%" }}
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

      {/* Each client has its own way in from the left. */}
      <g data-route-entries pointerEvents="none">
        <path
          d={roundedPath(
            [
              { x: -left + 4, y: layout.clients[0].mid },
              { x: -left + 4, y: layout.clients.at(-1)!.mid },
            ],
            ROUTE_CORNER,
          )}
          fill="none"
          data-print-route-color={PRINT_STAGE.before}
          stroke={ROUTE_FLOW_OFF}
          strokeWidth={1.2}
        />
        {/* The way in (from the card's edge) and on along the entry line to the lit client. */}
        <line
          data-route-entry-in
          data-print-route-color={PRINT_STAGE.before}
          x1={-left}
          y1={bus.entryY}
          x2={-left + 4}
          y2={bus.entryY}
          stroke={litClient ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
          strokeWidth={litClient ? 2.2 : 1.2}
        />
        {litClient ? (
          <path
            d={roundedPath(
              [
                { x: -left + 4, y: bus.entryY },
                {
                  x: -left + 4,
                  y: layout.clients.find((item) => item.client === litClient)?.mid ?? bus.entryY,
                },
              ],
              ROUTE_CORNER,
            )}
            fill="none"
            data-print-route-color={PRINT_STAGE.before}
            stroke={ROUTE_FLOW_ON}
            strokeWidth={2.2}
          />
        ) : null}
        {layout.clients.map((item) => {
          const on = litClient === item.client;
          return (
            <line
              key={`entry-${item.client}`}
              data-route-entry={item.client}
              data-route-entry-on={on ? "true" : undefined}
              data-print-route-color={printStage(
                // ProFab only ever goes through an LOI, so its way in is purple.
                layout.branches
                  .filter((branch) => branch.client === item.client)
                  .every(
                    (branch) =>
                      layout.lanes.find((lane) =>
                        lane.cases.some((caseId) => branch.caseIds.includes(caseId)),
                      )?.loi,
                  ),
                "before",
              )}
              x1={-left + 4}
              y1={item.mid}
              x2={1}
              y2={item.mid}
              stroke={on ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF}
              strokeWidth={on ? 2.2 : 1.2}
              markerEnd={`url(#${on ? markerOn : markerOff})`}
            />
          );
        })}
      </g>

      {/* Client boxes → their situations → onto a lane. */}
      {layout.trunks.map((trunk) => {
        const on = trunk.client === litClient;
        // Lit only from the box to the chosen situation, not on to the other one.
        const litBranch = on
          ? layout.branches.find(
              (branch) =>
                branch.client === trunk.client &&
                layout.lanes
                  .find((item) => item.id === litLane)
                  ?.cases.some((caseId) => branch.caseIds.includes(caseId)),
            )
          : undefined;
        const [, , ...ends] = trunk.points;
        return (
          <g key={`trunk-${trunk.client}`} data-route-trunk={trunk.client}>
            {line(trunk.points.slice(0, 2), on, {
              part: "client",
              printColor: PRINT_STAGE.before,
            })}
            {line(ends, false, { part: "trunk", printColor: PRINT_STAGE.before })}
            {litBranch?.labelY !== undefined
              ? line(
                  [
                    { x: ends[0].x, y: trunk.points[1].y },
                    { x: ends[0].x, y: litBranch.labelY },
                  ],
                  true,
                  { part: "trunk-lit", printColor: PRINT_STAGE.before },
                )
              : null}
          </g>
        );
      })}
      {layout.branches.map((branch) => {
        const lane = layout.lanes.find((item) =>
          item.cases.some((caseId) => branch.caseIds.includes(caseId)),
        );
        const on = branch.client === litClient && lane?.id === litLane;
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
                  { part: "branch", printColor: printStage(lane?.loi, "before") },
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
              printColor: printStage(lane?.loi, "before"),
            })}
          </g>
        );
      })}

      {layout.lanes.map((lane) => {
        const laneOn = lane.id === litLane;
        const viaPlans = laneOn && litPlans === "yes";
        const viaCsa = laneOn && litPlans === "no";
        // Second "Plans?": ✓ on to Plan Ready, ✗ round again into CSA / Consultation.
        const consultDone = viaCsa && highlight.consultPlans === "yes";
        const consultLoop = viaCsa && highlight.loop;
        const ends = highlight.out && laneOn;
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
              printColor: printStage(lane.loi, "before"),
            })}
            {line(lane.toFork, laneOn, {
              part: "to-fork",
              printColor: printStage(lane.loi, "before"),
            })}
            {/* Plans? Yes: straight on. No: CSA until there are plans, then back on the line. */}
            {line(lane.yes, viaPlans, {
              arrow: true,
              part: "yes",
              printColor: printStage(lane.loi, "before"),
            })}
            {line(lane.no, viaCsa, {
              arrow: true,
              part: "no",
              printColor: printStage(lane.loi, "before"),
            })}
            {/* Second "Plans?": ✓ back onto the line, ✗ round and back into CSA / Consultation. */}
            {line(lane.toFork2, viaCsa, {
              part: "to-fork2",
              printColor: printStage(lane.loi, "csa"),
            })}
            {line(lane.loop, consultLoop, {
              arrow: true,
              part: "loop",
              dashed: true,
              printColor: printStage(lane.loi, "csa"),
            })}
            {line(lane.back, consultDone, {
              arrow: true,
              part: "back",
              printColor: printStage(lane.loi, "csa"),
            })}
            {lane.endLinks.map((link, index) => (
              <line
                key={`end-${index}`}
                data-route-part="end"
                data-print-route-color={printStage(lane.loi, "ready")}
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
                key={`question-${index}`}
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
              // Grey until chosen; only the lit lane's ✓ / ✗ can be chosen.
              const palette = chip.ok ? YES : NO;
              // First "Plans?" (yes / no) and the second, after CSA / Consultation (back / loop).
              const second = chip.part === "back" || chip.part === "loop";
              const choice: "yes" | "no" = chip.ok ? "yes" : "no";
              const current = second ? highlight.consultPlans : litPlans;
              const open = second ? viaCsa : laneOn;
              const choose = second ? onChooseConsultPlans : onChoosePlans;
              const chosen = Boolean(open && current === choice);
              const clickable = Boolean(open && choose);
              const lit = chosen;
              const colour = chosen ? palette : GREY;
              return (
                <g
                  key={chip.part}
                  data-route-chip={chip.part}
                  data-route-chip-chosen={chosen ? "true" : undefined}
                  role={clickable ? "button" : undefined}
                  aria-label={
                    clickable
                      ? `${second ? "Plans after consultation" : "Plans"}: ${choice}`
                      : undefined
                  }
                  aria-pressed={clickable ? chosen : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  style={clickable ? { cursor: "pointer" } : undefined}
                  onClick={clickable ? () => choose!(chosen ? undefined : choice) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          choose!(chosen ? undefined : choice);
                        }
                      : undefined
                  }
                >
                  {/* A larger, invisible tap area. */}
                  {clickable ? (
                    <rect
                      x={chip.x - 4}
                      y={chip.y - layout.chip.height / 2 - 4}
                      width={layout.chip.width + 8}
                      height={layout.chip.height + 8}
                      fill="transparent"
                    />
                  ) : null}
                  <rect
                    x={chip.x}
                    y={chip.y - layout.chip.height / 2}
                    width={layout.chip.width}
                    height={layout.chip.height}
                    rx={2.5}
                    fill={chosen ? colour.stroke : colour.fill}
                    stroke={colour.stroke}
                    strokeWidth={chosen || lit ? 1.6 : clickable ? 1.2 : 0.9}
                  />
                  <text
                    x={chip.x + layout.chip.width / 2}
                    y={chip.y + 0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={8}
                    fontWeight={800}
                    fill={chosen ? "#ffffff" : colour.text}
                    pointerEvents="none"
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
              data-print-route-color={printStage(lane.loi, "ready")}
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
            data-print-route-color={PRINT_STAGE.ready}
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
                  data-print-route-color={printStage(lane.loi, "ready")}
                  d={roundedPath(points, ROUTE_CORNER)}
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
        const on = item.client === litClient;
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
