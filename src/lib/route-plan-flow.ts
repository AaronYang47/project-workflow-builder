import type { QualificationCase } from "@/lib/qualification";

/**
 * The Route Selection chart. Customers that take the same path share a lane:
 *
 *   ProFab, Owner VIP  → LOI → Plans? → GC → PCS
 *   Owner Regular      →       Plans? → GC → PCS
 *   GC VIP             → LOI → Plans? → PCS
 *   GC Regular         →       Plans? → PCS
 *
 * "Plans?" — with plans, straight on; without, CSA (with an LOI tag after an
 * LOI) until there are plans, then back onto the line. Every box after an LOI
 * carries a small LOI tag.
 *
 * Units are pixels at a 9–10px font; the canvas and the PDF both draw this.
 */

type Point = { x: number; y: number };

export type PlanLaneId = "loi-gc" | "owner-regular" | "gc-vip" | "gc-regular";

export type PlanBox = {
  text: string;
  x: number;
  width: number;
  y: number;
  loiTag: boolean;
  /** Smaller type for a long name (Plan Consultation). */
  fontSize?: number;
};

/** After an LOI, the consultation without plans is Plan Consultation (styled like the LOI). */
export const PLAN_CONSULTATION = "Plan Consultation";

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
  loop: Point[];
  loopLabel: Point;
  /** Plans now: back up onto the line. */
  back: Point[];
  chips: { x: number; y: number; ok: boolean; part: "yes" | "no" | "back" }[];
  question: Point;
  ends: PlanBox[];
  endLinks: [Point, Point][];
  exit: Point;
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
  const consultationWidth = 94;
  // Columns line up in every lane, so the merge sits past the widest box.
  const mergeX = csaX + consultationWidth + 34;
  const endX = mergeX + 12;
  const endGap = 14;
  const boxWidth = (text: string) => Math.ceil(text.length * 5.6 + 12);

  // Even spacing: each client box sits exactly between its two situations
  // (Owner VIP / Regular, GC VIP / Regular), so both branch lines are the same
  // distance from the box's middle line.
  const branchGap = 56;
  const yLane = {
    "loi-gc": 16,
    "owner-regular": 108,
    "gc-vip": 180,
    "gc-regular": 180 + branchGap,
  };
  const specs: { id: PlanLaneId; loi: boolean; cases: string[]; ends: string[] }[] = [
    { id: "loi-gc", loi: true, cases: ["profab", "owner-vip"], ends: ["GC", "PCS"] },
    {
      id: "owner-regular",
      loi: false,
      cases: ["owner-no-plans", "owner-plans"],
      ends: ["GC", "PCS"],
    },
    { id: "gc-vip", loi: true, cases: ["gc-vip"], ends: ["PCS"] },
    { id: "gc-regular", loi: false, cases: ["gc-no-plans", "gc-plans"], ends: ["PCS"] },
  ];

  const lanes: PlanLane[] = specs.map((spec) => {
    const yTop = yLane[spec.id];
    const yBottom = yTop + 22;
    const half = boxHeight / 2;
    const loiBox: PlanBox | undefined = spec.loi
      ? { text: "LOI", x: loiX, width: loiWidth, y: yTop, loiTag: false }
      : undefined;
    const csa: PlanBox = spec.loi
      ? {
          text: PLAN_CONSULTATION,
          x: csaX,
          width: consultationWidth,
          y: yBottom,
          loiTag: false,
          fontSize: 8,
        }
      : { text: "CSA", x: csaX, width: csaWidth, y: yBottom, loiTag: false };
    const ends: PlanBox[] = [];
    let x = endX;
    for (const text of spec.ends) {
      const width = boxWidth(text);
      ends.push({ text, x, width, y: yTop, loiTag: spec.loi });
      x += width + endGap;
    }
    const last = ends.at(-1)!;
    const loopBottom = yBottom + half + 7;
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
      loop: [
        { x: csa.x + csa.width - 6, y: yBottom + half },
        { x: csa.x + csa.width - 6, y: loopBottom },
        { x: csa.x + 8, y: loopBottom },
        { x: csa.x + 8, y: yBottom + half },
      ],
      loopLabel: { x: csa.x + csa.width + 2, y: loopBottom },
      back: [
        { x: csa.x + csa.width, y: yBottom },
        { x: mergeX, y: yBottom },
        { x: mergeX, y: yTop },
      ],
      chips: [
        { x: chipX, y: yTop, ok: true, part: "yes" },
        { x: chipX, y: yBottom, ok: false, part: "no" },
        { x: csa.x + csa.width + 8, y: yBottom, ok: true, part: "back" },
      ],
      question: { x: chipX - 1, y: yTop + 11 },
      ends,
      endLinks: ends.slice(1).map((box, index) => [
        { x: ends[index].x + ends[index].width, y: yTop },
        { x: box.x, y: yTop },
      ]),
      exit: { x: last.x + last.width, y: yTop },
    };
  });

  const lane = (id: PlanLaneId) => lanes.find((item) => item.id === id)!;
  const ownerVipY = yLane["owner-regular"] - branchGap;
  const branches: PlanBranch[] = [
    {
      caseIds: ["profab"],
      client: "ProFab",
      points: [
        { x: clientWidth, y: yLane["loi-gc"] },
        { x: joinX, y: yLane["loi-gc"] },
      ],
    },
    {
      // Owner VIP rises into the ProFab lane: the same LOI path.
      caseIds: ["owner-vip"],
      client: "Owner",
      label: "VIP",
      labelX,
      labelY: ownerVipY,
      points: [
        { x: labelX + 22, y: ownerVipY },
        { x: joinX, y: ownerVipY },
        { x: joinX, y: yLane["loi-gc"] },
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
      top: yLane["loi-gc"] - pad,
      bottom: yLane["loi-gc"] + pad,
      mid: yLane["loi-gc"],
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
  const width = Math.max(...lanes.map((item) => item.exit.x)) + 6;
  return {
    lanes,
    branches,
    trunks,
    clients,
    clientWidth,
    boxHeight,
    chip,
    width,
    // Below the last lane's "until plans" loop.
    height: Math.max(gcBottom, lanes.at(-1)!.yBottom + boxHeight / 2 + 7 + 6) + 2,
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
  const exits = layout.lanes.map((lane) => lane.exit.y);
  const busX = layout.width + 16;
  const busY = (Math.min(...exits) + Math.max(...exits)) / 2;
  return { busX, busY, width: busX + 16 };
}

/**
 * The route in words, along its lane: client → [LOI] → [CSA, without plans] →
 * GC / PCS. Until plans are chosen, it stops at "Plans?".
 */
export function routePathText(
  item: QualificationCase | undefined,
  plans: "yes" | "no" | undefined,
  layout: PlanFlowLayout = routePlanLayout(),
) {
  if (!item) return undefined;
  const lane = layout.lanes.find((candidate) => candidate.cases.includes(item.id));
  if (!lane) return undefined;
  const steps = [item.client, ...(lane.loi ? ["LOI"] : [])];
  const choice = plansOfCase(item, plans);
  if (!choice) return [...steps, "Plans?"].join(" → ");
  return [
    ...steps,
    ...(choice === "no" ? [lane.csa.text] : []),
    ...lane.ends.map((box) => box.text),
  ].join(" → ");
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
) {
  const lane = item
    ? layout.lanes.find((candidate) => candidate.cases.includes(item.id))
    : undefined;
  const plans = plansOfCase(item, plansAvailable);
  if (!lane) return { lane: undefined, plans, boxes: [] as string[], out: false };
  const boxes = [
    ...(lane.loiBox ? [lane.loiBox.text] : []),
    ...(plans === "no" ? [lane.csa.text] : []),
    ...(plans ? lane.ends.map((box) => box.text) : []),
  ];
  return { lane: lane.id, plans, boxes, out: Boolean(plans) };
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
