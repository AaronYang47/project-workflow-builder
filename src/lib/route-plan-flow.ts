import type { QualificationCase } from "@/lib/qualification";

/**
 * The Route Selection chart: each kind of customer runs along its own lane.
 * After any LOI, the lane asks whether there are plans. With plans it goes
 * straight on; without, it goes through a consultant service (CS after an LOI,
 * CSA otherwise), asks again, and loops back until there are plans. ProFab and
 * Owner lanes finish with the GC and PCS; GC lanes finish with PCS.
 *
 * Units are pixels at a 9–10px font; the canvas and the PDF both draw this.
 */

type Point = { x: number; y: number };

export type PlanLaneId = "profab" | "owner-vip" | "owner-regular" | "gc-vip" | "gc-regular";

export type PlanBox = { text: string; x: number; width: number; y: number; loiTag: boolean };

export type PlanLane = {
  id: PlanLaneId;
  client: "ProFab" | "Owner" | "GC";
  /** "VIP" / "Regular"; ProFab has none. */
  label?: string;
  loi: boolean;
  /** Qualification situations shown on this lane. */
  cases: string[];
  yTop: number;
  yBottom: number;
  yLoop: number;
  /** Client box (or its branch) to the first box or the first question. */
  entry: Point[];
  labelX?: number;
  loiBox?: PlanBox;
  /** From the LOI (or the entry) to the first "Plans?" fork. */
  toFork: Point[];
  forkX: number;
  /** Plans: straight on along the top to the end boxes. */
  yes: Point[];
  /** No plans: down to the consultant service. */
  no: Point[];
  service: PlanBox;
  /** Consultant service to the second fork. */
  toFork2: Point[];
  fork2X: number;
  /** Plans now: back up onto the top line. */
  yes2: Point[];
  /** Still no plans: round and back into the consultant service. */
  loop: Point[];
  chips: { x: number; y: number; ok: boolean; part: "yes" | "no" | "yes2" | "loop" }[];
  /** Where each "Plans?" question is written. */
  questions: Point[];
  ends: PlanBox[];
  /** Arrows between the end boxes. */
  endLinks: [Point, Point][];
  exit: Point;
};

export type PlanClient = { client: string; top: number; bottom: number; mid: number };

export type PlanFlowLayout = {
  lanes: PlanLane[];
  clients: PlanClient[];
  clientWidth: number;
  boxHeight: number;
  chip: { width: number; height: number };
  width: number;
  height: number;
};

const LANES: {
  id: PlanLaneId;
  client: PlanLane["client"];
  label?: string;
  loi: boolean;
  cases: string[];
}[] = [
  { id: "profab", client: "ProFab", loi: true, cases: ["profab"] },
  { id: "owner-vip", client: "Owner", label: "VIP", loi: true, cases: ["owner-vip"] },
  {
    id: "owner-regular",
    client: "Owner",
    label: "Regular",
    loi: false,
    cases: ["owner-no-plans", "owner-plans"],
  },
  { id: "gc-vip", client: "GC", label: "VIP", loi: true, cases: ["gc-vip"] },
  {
    id: "gc-regular",
    client: "GC",
    label: "Regular",
    loi: false,
    cases: ["gc-no-plans", "gc-plans"],
  },
];

export function routePlanLayout(): PlanFlowLayout {
  const clientWidth = 56;
  const trunkX = clientWidth + 10;
  const labelX = trunkX + 8;
  const boxHeight = 16;
  const chip = { width: 13, height: 11 };
  const loiX = 124;
  const loiWidth = 30;
  const forkX = 168;
  const chipX = forkX + 8;
  const serviceX = 206;
  const serviceWidth = 32;
  const fork2X = serviceX + serviceWidth + 12;
  const chip2X = fork2X + 8;
  const mergeX = 294;
  const endX = 306;
  const endGap = 14;
  const boxWidth = (text: string) => Math.ceil(text.length * 5.6 + 12);
  const laneStep = 62;
  const groupGap = 10;

  const lanes: PlanLane[] = [];
  const clients: PlanClient[] = [];
  let y = 14;
  let width = 0;
  let previousClient = "";
  for (const spec of LANES) {
    if (previousClient && spec.client !== previousClient) y += groupGap;
    previousClient = spec.client;
    const yTop = y;
    const yBottom = yTop + 22;
    const yLoop = yBottom + 21;
    const half = boxHeight / 2;
    const labelEnd = spec.label ? labelX + spec.label.length * 5.6 + 4 : clientWidth;
    const loiBox: PlanBox | undefined = spec.loi
      ? { text: "LOI", x: loiX, width: loiWidth, y: yTop, loiTag: false }
      : undefined;
    const entryEnd = loiBox ? loiBox.x : forkX;
    const service: PlanBox = {
      text: spec.loi ? "CS" : "CSA",
      x: serviceX,
      width: serviceWidth,
      y: yBottom,
      loiTag: spec.loi,
    };
    const endTexts = spec.client === "GC" ? ["PCS"] : ["GC", "PCS"];
    const ends: PlanBox[] = [];
    let x = endX;
    for (const text of endTexts) {
      const w = boxWidth(text);
      ends.push({ text, x, width: w, y: yTop, loiTag: spec.loi });
      x += w + endGap;
    }
    const last = ends.at(-1)!;
    const serviceMid = service.x + service.width / 2;
    lanes.push({
      ...spec,
      yTop,
      yBottom,
      yLoop,
      labelX: spec.label ? labelX : undefined,
      entry: [
        { x: labelEnd + (spec.label ? 2 : 0), y: yTop },
        { x: entryEnd, y: yTop },
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
        { x: service.x, y: yBottom },
      ],
      service,
      toFork2: [
        { x: service.x + service.width, y: yBottom },
        { x: fork2X, y: yBottom },
      ],
      fork2X,
      yes2: [
        { x: fork2X, y: yBottom },
        { x: mergeX, y: yBottom },
        { x: mergeX, y: yTop },
      ],
      loop: [
        { x: fork2X, y: yBottom },
        { x: fork2X, y: yLoop },
        { x: mergeX - 8, y: yLoop },
        { x: mergeX - 8, y: yLoop + 8 },
        { x: serviceMid, y: yLoop + 8 },
        { x: serviceMid, y: yBottom + half },
      ],
      chips: [
        { x: chipX, y: yTop, ok: true, part: "yes" },
        { x: chipX, y: yBottom, ok: false, part: "no" },
        { x: chip2X, y: yBottom, ok: true, part: "yes2" },
        { x: chip2X, y: yLoop, ok: false, part: "loop" },
      ],
      questions: [
        { x: chipX - 1, y: yTop + 11 },
        { x: chip2X + 1, y: yBottom + 10.5 },
      ],
      ends,
      endLinks: ends.slice(1).map((box, index) => [
        { x: ends[index].x + ends[index].width, y: yTop },
        { x: box.x, y: yTop },
      ]),
      exit: { x: last.x + last.width, y: yTop },
    });
    width = Math.max(width, last.x + last.width + 6);
    const client = clients.find((item) => item.client === spec.client);
    const top = yTop - 12;
    const bottom = yLoop + 12;
    if (client) {
      client.bottom = bottom;
      client.mid = (client.top + client.bottom) / 2;
    } else clients.push({ client: spec.client, top, bottom, mid: (top + bottom) / 2 });
    y += laneStep;
  }
  return {
    lanes,
    clients,
    clientWidth,
    boxHeight,
    chip,
    width,
    height: clients.at(-1)!.bottom + 2,
  };
}

/** The lane that shows a Qualification situation. */
export const laneOfCase = (caseId: string | undefined) =>
  caseId ? LANES.find((lane) => lane.cases.includes(caseId))?.id : undefined;

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
