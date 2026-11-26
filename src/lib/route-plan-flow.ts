import type { QualificationCase } from "@/lib/qualification";
import { EDGE_CORNER_RADIUS } from "@/lib/semantic-edge-geometry";

/**
 * The Route Selection chart. Customers that take the same path share a lane:
 *
 *   ProFab         → LOI → Plans? → Plan Ready → GC (LOI)
 *   Owner VIP      → LOI → Plans? → Plan Ready → GC (LOI), or GC → PCS
 *   Owner Regular  →       Plans? → Plan Ready → GC → PCS
 *   GC VIP         → LOI → Plans? → Plan Ready
 *   GC Regular     →       Plans? → Plan Ready → PCS
 *
 * "Plans?" — with plans, straight on; without, CSA, then "Plans?" again: with
 * plans back onto the line, without, round again. The CSA and GC after an LOI
 * carry a small LOI tag.
 *
 * Units are pixels at a 9–10px font; the canvas and the PDF both draw this.
 */

type Point = { x: number; y: number };

export type PlanLaneId = "profab" | "owner-vip" | "owner-regular" | "gc-vip" | "gc-regular";

/** Owner VIP after Plan Ready: the GC under the LOI, or the GC and a PCS. */
export type PlanEndChoice = "gc-loi" | "gc-pcs";

export type PlanBox = {
  text: string;
  x: number;
  width: number;
  y: number;
  loiTag: boolean;
  /** Smaller type for a long name (Plan Ready). */
  fontSize?: number;
};

/**
 * One corner radius for every bend in the chart. Every segment next to a bend
 * is at least twice this long, so no corner is drawn smaller.
 */
export const ROUTE_FLOW_SCALE = 2.2;
/** Matches the canvas connectors' corners (EDGE_CORNER_RADIUS px) at the card's scale. */
export const ROUTE_CORNER = EDGE_CORNER_RADIUS / ROUTE_FLOW_SCALE;

/** Every lane reaches Plan Ready (green) before the GC / PCS. */
export const PLAN_READY = "Plan Ready";

export type PlanLane = {
  id: PlanLaneId;
  loi: boolean;
  /** Qualification situations that run along this lane. */
  cases: string[];
  yTop: number;
  yBottom: number;
  /** From where the customers join the lane to the LOI box or the fork. */
  entry: Point[];
  loiBox?: PlanBox;
  toFork: Point[];
  forkX: number;
  /** Plans: straight on to the end boxes. */
  yes: Point[];
  /** No plans: down to CSA. */
  no: Point[];
  csa: PlanBox;
  /** CSA until there are plans. */
  /** CSA to the second "Plans?". */
  toFork2: Point[];
  fork2X: number;
  /** Still no plans: round and back into CSA. */
  loop: Point[];
  /** Plans now: back up onto the line. */
  back: Point[];
  chips: { x: number; y: number; ok: boolean; part: "yes" | "no" | "back" | "loop" }[];
  /** Where each "Plans?" is written. */
  questions: Point[];
  ends: PlanBox[];
  endLinks: [Point, Point][];
  exit: Point;
  /**
   * Owner VIP: a second way on from Plan Ready, on the row below (GC → PCS).
   * The top row is then the "gc-loi" choice, this one "gc-pcs".
   */
  alt?: { link: Point[]; ends: PlanBox[]; endLinks: [Point, Point][]; exit: Point };
};

/** A customer's own line from its client box onto its lane. */
export type PlanBranch = {
  caseIds: string[];
  client: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  points: Point[];
};

export type PlanClient = { client: string; top: number; bottom: number; mid: number };

export type PlanFlowLayout = {
  lanes: PlanLane[];
  branches: PlanBranch[];
  /** The line a client box branches from, when it has two situations. */
  trunks: { client: string; caseIds: string[]; points: Point[] }[];
  clients: PlanClient[];
  clientWidth: number;
  boxHeight: number;
  chip: { width: number; height: number };
  width: number;
  height: number;
};

export function routePlanLayout(): PlanFlowLayout {
  const clientWidth = 56;
  const trunkX = clientWidth + 10;
  const labelX = trunkX + 8;
  const joinX = 124;
  const boxHeight = 16;
  const chip = { width: 13, height: 11 };
  const loiX = 134;
  const loiWidth = 30;
  const forkX = 178;
  const chipX = forkX + 8;
  const csaX = 210;
  const csaWidth = 34;
  // Columns line up in every lane: the second "Plans?" sits just past CSA.
  const fork2X = csaX + csaWidth + 12;
  const chip2X = fork2X + 8;
  const mergeX = fork2X + 34;
  const endX = mergeX + 12;
  const endGap = 14;
  const boxWidth = (text: string) => Math.ceil(text.length * 5.6 + 12);

  // Even spacing: each client box sits exactly between its two situations
  // (Owner VIP / Regular, GC VIP / Regular), so both branch lines are the same
  // distance from the box's middle line.
  // Lanes are this far apart (the loop under one clears the next).
  const branchGap = 72;
  const yLane = {
    profab: 16,
    "owner-vip": 16 + branchGap,
    "owner-regular": 16 + 2 * branchGap,
    "gc-vip": 16 + 3 * branchGap,
    "gc-regular": 16 + 4 * branchGap,
  };
  const specs: {
    id: PlanLaneId;
    loi: boolean;
    cases: string[];
    ends: string[];
    alt?: string[];
  }[] = [
    // After an LOI there is no PCS of its own: on to the GC, or done at Plan Ready.
    { id: "profab", loi: true, cases: ["profab"], ends: ["GC"] },
    // Owner VIP: after Plan Ready, the GC under the LOI, or the GC and a PCS.
    { id: "owner-vip", loi: true, cases: ["owner-vip"], ends: ["GC"], alt: ["GC", "PCS"] },
    {
      id: "owner-regular",
      loi: false,
      cases: ["owner-no-plans", "owner-plans"],
      ends: ["GC", "PCS"],
    },
    { id: "gc-vip", loi: true, cases: ["gc-vip"], ends: [] },
    { id: "gc-regular", loi: false, cases: ["gc-no-plans", "gc-plans"], ends: ["PCS"] },
  ];

  const lanes: PlanLane[] = specs.map((spec) => {
    const yTop = yLane[spec.id];
    const yBottom = yTop + 22;
    const half = boxHeight / 2;
    const loiBox: PlanBox | undefined = spec.loi
      ? { text: "LOI", x: loiX, width: loiWidth, y: yTop, loiTag: false }
      : undefined;
    // Without plans: CSA, with the LOI tag after an LOI.
    const csa: PlanBox = { text: "CSA", x: csaX, width: csaWidth, y: yBottom, loiTag: spec.loi };
    const ends: PlanBox[] = [
      { text: PLAN_READY, x: endX, width: 62, y: yTop, loiTag: false, fontSize: 8.5 },
    ];
    const readyRight = endX + 62;
    // With a second way on, it leaves Plan Ready endGap along: the GCs sit past that turn.
    const firstEndX = readyRight + (spec.alt ? 2 * endGap : endGap);
    const row = (texts: string[], y: number, loiTag: boolean) => {
      const boxes: PlanBox[] = [];
      let x = firstEndX;
      for (const text of texts) {
        const width = boxWidth(text);
        boxes.push({ text, x, width, y, loiTag });
        x += width + endGap;
      }
      return boxes;
    };
    ends.push(...row(spec.ends, yTop, spec.loi));
    const last = ends.at(-1)!;
    const links = (boxes: PlanBox[], y: number) =>
      boxes.slice(1).map((box, index): [Point, Point] => [
        { x: boxes[index].x + boxes[index].width, y },
        { x: box.x, y },
      ]);
    let alt: PlanLane["alt"];
    if (spec.alt) {
      const altEnds = row(spec.alt, yBottom, false);
      const turnX = readyRight + endGap;
      const altLast = altEnds.at(-1)!;
      alt = {
        link: [
          { x: readyRight, y: yTop },
          { x: turnX, y: yTop },
          { x: turnX, y: yBottom },
          { x: altEnds[0].x, y: yBottom },
        ],
        ends: altEnds,
        endLinks: links(altEnds, yBottom),
        exit: { x: altLast.x + altLast.width, y: yBottom },
      };
    }
    // The second "Plans?" opens as wide as the first.
    const yLoop = yBottom + 22;
    return {
      ...spec,
      yTop,
      yBottom,
      entry: [
        { x: joinX, y: yTop },
        { x: loiBox ? loiBox.x : forkX, y: yTop },
      ],
      loiBox,
      toFork: loiBox
        ? [
            { x: loiBox.x + loiBox.width, y: yTop },
            { x: forkX, y: yTop },
          ]
        : [],
      forkX,
      yes: [
        { x: forkX, y: yTop },
        { x: endX, y: yTop },
      ],
      no: [
        { x: forkX, y: yTop },
        { x: forkX, y: yBottom },
        { x: csa.x, y: yBottom },
      ],
      csa,
      toFork2: [
        { x: csa.x + csa.width, y: yBottom },
        { x: fork2X, y: yBottom },
      ],
      fork2X,
      loop: [
        { x: fork2X, y: yBottom },
        { x: fork2X, y: yLoop },
        { x: chip2X + chip.width + 10, y: yLoop },
        { x: chip2X + chip.width + 10, y: yLoop + 2 * ROUTE_CORNER },
        { x: csa.x + csa.width / 2, y: yLoop + 2 * ROUTE_CORNER },
        { x: csa.x + csa.width / 2, y: yBottom + half },
      ],
      back: [
        { x: fork2X, y: yBottom },
        { x: mergeX, y: yBottom },
        { x: mergeX, y: yTop },
      ],
      chips: [
        { x: chipX, y: yTop, ok: true, part: "yes" },
        { x: chipX, y: yBottom, ok: false, part: "no" },
        { x: chip2X, y: yBottom, ok: true, part: "back" },
        { x: chip2X, y: yLoop, ok: false, part: "loop" },
      ],
      questions: [
        { x: chipX - 1, y: yTop + 11 },
        { x: chip2X - 1, y: yBottom + 11 },
      ],
      ends,
      endLinks: links(ends, yTop),
      exit: { x: last.x + last.width, y: yTop },
      alt,
    };
  });

  const lane = (id: PlanLaneId) => lanes.find((item) => item.id === id)!;
  const ownerVipY = yLane["owner-vip"];
  const branches: PlanBranch[] = [
    {
      caseIds: ["profab"],
      client: "ProFab",
      points: [
        { x: clientWidth, y: yLane.profab },
        { x: joinX, y: yLane.profab },
      ],
    },
    {
      // Owner VIP has its own LOI lane: after Plan Ready it may go another way.
      caseIds: ["owner-vip"],
      client: "Owner",
      label: "VIP",
      labelX,
      labelY: ownerVipY,
      points: [
        { x: labelX + 22, y: ownerVipY },
        { x: joinX, y: ownerVipY },
      ],
    },
    {
      caseIds: lane("owner-regular").cases,
      client: "Owner",
      label: "Regular",
      labelX,
      labelY: yLane["owner-regular"],
      points: [
        { x: labelX + 44, y: yLane["owner-regular"] },
        { x: joinX, y: yLane["owner-regular"] },
      ],
    },
    {
      caseIds: ["gc-vip"],
      client: "GC",
      label: "VIP",
      labelX,
      labelY: yLane["gc-vip"],
      points: [
        { x: labelX + 22, y: yLane["gc-vip"] },
        { x: joinX, y: yLane["gc-vip"] },
      ],
    },
    {
      caseIds: lane("gc-regular").cases,
      client: "GC",
      label: "Regular",
      labelX,
      labelY: yLane["gc-regular"],
      points: [
        { x: labelX + 44, y: yLane["gc-regular"] },
        { x: joinX, y: yLane["gc-regular"] },
      ],
    },
  ];

  // A client box reaches 14 past each of its branch lines, centred between them.
  const pad = 14;
  const ownerTop = ownerVipY - pad;
  const ownerBottom = yLane["owner-regular"] + pad;
  const gcTop = yLane["gc-vip"] - pad;
  const gcBottom = yLane["gc-regular"] + pad;
  const clients: PlanClient[] = [
    {
      client: "ProFab",
      top: yLane.profab - pad,
      bottom: yLane.profab + pad,
      mid: yLane.profab,
    },
    { client: "Owner", top: ownerTop, bottom: ownerBottom, mid: (ownerTop + ownerBottom) / 2 },
    { client: "GC", top: gcTop, bottom: gcBottom, mid: (gcTop + gcBottom) / 2 },
  ];
  const trunks = [
    {
      client: "Owner",
      caseIds: ["owner-vip", ...lane("owner-regular").cases],
      points: [
        { x: clientWidth, y: clients[1].mid },
        { x: trunkX, y: clients[1].mid },
      ],
      span: [ownerVipY, yLane["owner-regular"]],
    },
    {
      client: "GC",
      caseIds: ["gc-vip", ...lane("gc-regular").cases],
      points: [
        { x: clientWidth, y: clients[2].mid },
        { x: trunkX, y: clients[2].mid },
      ],
      span: [yLane["gc-vip"], yLane["gc-regular"]],
    },
  ].map(({ span, ...trunk }) => ({
    ...trunk,
    // The box's line in, then the branch line up and down to both situations.
    points: [...trunk.points, { x: trunkX, y: span[0] }, { x: trunkX, y: span[1] }],
  }));
  const width =
    Math.max(...lanes.flatMap((item) => [item.exit.x, ...(item.alt ? [item.alt.exit.x] : [])])) + 6;
  return {
    lanes,
    branches,
    trunks,
    clients,
    clientWidth,
    boxHeight,
    chip,
    width,
    // Below the last lane's loop back into CSA.
    height: Math.max(gcBottom, lanes.at(-1)!.yBottom + 22 + 2 * ROUTE_CORNER + 6) + 2,
  };
}

/** The lane a Qualification situation runs along. */
export function laneOfCase(caseId: string | undefined, layout: PlanFlowLayout) {
  return caseId ? layout.lanes.find((lane) => lane.cases.includes(caseId))?.id : undefined;
}

/** With or without plans, for a situation (Regular situations say so themselves). */
export function plansOfCase(
  item: QualificationCase | undefined,
  plansAvailable?: "yes" | "no",
): "yes" | "no" | undefined {
  if (!item) return undefined;
  if (item.id.endsWith("-no-plans")) return "no";
  if (item.id.endsWith("-plans")) return "yes";
  return plansAvailable;
}

/** Where every lane leaves the chart: onto one bus, and one line out from its middle. */
export function routePlanExitBus(layout: PlanFlowLayout) {
  const exits = layout.lanes.flatMap((lane) => [
    lane.exit.y,
    ...(lane.alt ? [lane.alt.exit.y] : []),
  ]);
  const busX = layout.width + 16;
  const busY = (Math.min(...exits) + Math.max(...exits)) / 2;
  // Room on the left for each client's own entry arrow; the way in joins the
  // entry line halfway between its first and last client.
  const entryY = (layout.clients[0].mid + layout.clients.at(-1)!.mid) / 2;
  return { busX, busY, width: busX + 16, left: 18, entryY, entryX: 4 };
}

/**
 * The route in words, along its lane: client → [LOI] → [CSA, without plans] →
 * GC / PCS. Until plans are chosen, it stops at "Plans?".
 */
export function routePathText(
  item: QualificationCase | undefined,
  plans: "yes" | "no" | undefined,
  layout: PlanFlowLayout = routePlanLayout(),
  /** Owner VIP: the way on after Plan Ready. */
  endChoice?: PlanEndChoice,
  consultPlans?: "yes" | "no",
) {
  if (!item) return undefined;
  const lane = layout.lanes.find((candidate) => candidate.cases.includes(item.id));
  if (!lane) return undefined;
  const steps = [item.client, ...(lane.loi ? ["LOI"] : [])];
  const choice = plansOfCase(item, plans);
  if (!choice) return [...steps, "Plans?"].join(" → ");
  if (lane.alt && choice === "no" && consultPlans !== "yes")
    return [...steps, lane.csa.text, "Plans?"].join(" → ");
  const ends =
    lane.alt && endChoice === "gc-pcs"
      ? lane.alt.ends.map((box) => box.text)
      : lane.alt
        ? [endChoice === "gc-loi" ? "GC (LOI)" : "GC (LOI) or GC + PCS?"]
        : // Plan Ready is a state on the way, not an agreement in the route.
          lane.ends.filter((box) => box.text !== PLAN_READY).map((box) => box.text);
  return [...steps, ...(choice === "no" ? [lane.csa.text] : []), ...ends].join(" → ");
}

/**
 * What the chart lights for a situation: its lane, the boxes along its path
 * (in order), and whether it reaches the way out. The chart and the tests both
 * use this.
 */
export function routeHighlight(
  layout: PlanFlowLayout,
  item: QualificationCase | undefined,
  plansAvailable?: "yes" | "no",
  consultPlans?: "yes" | "no",
  endChoice?: PlanEndChoice,
) {
  const laneId = item ? layout.lanes.find((lane) => lane.cases.includes(item.id))?.id : undefined;
  return laneHighlight(layout, laneId, plansOfCase(item, plansAvailable), consultPlans, endChoice);
}

/** The same for a lane, when the customer is known but plans may not be chosen yet. */
export function laneHighlight(
  layout: PlanFlowLayout,
  laneId: PlanLaneId | undefined,
  plans: "yes" | "no" | undefined,
  /** The second "Plans?", after CSA. */
  consultPlans?: "yes" | "no",
  /** Owner VIP: the way on after Plan Ready. */
  endChoice?: PlanEndChoice,
) {
  const lane = laneId ? layout.lanes.find((candidate) => candidate.id === laneId) : undefined;
  if (!lane)
    return {
      lane: undefined,
      plans,
      consultPlans,
      endChoice: undefined,
      boxes: [] as string[],
      out: false,
      loop: false,
    };
  // Every finished path goes through Plan Ready: plans at once, or after CSA.
  const done = plans === "yes" || (plans === "no" && consultPlans === "yes");
  // Owner VIP goes on only once the way after Plan Ready is chosen.
  const chosenEnd = done && lane.alt ? endChoice : undefined;
  const out = done && (!lane.alt || Boolean(chosenEnd));
  const after =
    chosenEnd === "gc-pcs" ? lane.alt!.ends : lane.ends.filter((box) => box.text !== PLAN_READY);
  const boxes = [
    ...(lane.loiBox ? [lane.loiBox.text] : []),
    ...(plans === "no" ? [lane.csa.text] : []),
    ...(done ? [PLAN_READY] : []),
    ...(out ? after.map((box) => box.text) : []),
  ];
  return {
    lane: lane.id,
    plans,
    consultPlans: plans === "no" ? consultPlans : undefined,
    endChoice: chosenEnd,
    boxes,
    out,
    // Still no plans after CSA: round again.
    loop: plans === "no" && consultPlans === "no",
  };
}

/** The lane for a customer type (from the form's parties), whatever the plans. */
export function laneForCustomer(
  clientCategory: "ProFab" | "Owner" | "GC" | undefined,
  customerTier: "vip" | "regular" | undefined,
): PlanLaneId | undefined {
  if (clientCategory === "ProFab") return "profab";
  if (clientCategory === "Owner") return customerTier === "vip" ? "owner-vip" : "owner-regular";
  if (clientCategory === "GC") return customerTier === "vip" ? "gc-vip" : "gc-regular";
  return undefined;
}

/** The route so far when the customer is known but plans are not chosen yet. */
export function pendingRouteText(
  clientCategory: "ProFab" | "Owner" | "GC" | undefined,
  customerTier: "vip" | "regular" | undefined,
) {
  if (!clientCategory) return undefined;
  const loi = clientCategory === "ProFab" || customerTier === "vip";
  return [clientCategory, ...(loi ? ["LOI"] : []), "Plans?"].join(" → ");
}
