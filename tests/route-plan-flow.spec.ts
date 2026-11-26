import { expect, test } from "playwright/test";
import { QUALIFICATION_CASES, qualificationCaseFor } from "../src/lib/qualification";
import { createEmptyQualificationForm101 } from "../src/lib/qualification-form-101";
import { EDGE_CORNER_RADIUS } from "../src/lib/semantic-edge-geometry";
import {
  ROUTE_CORNER,
  ROUTE_FLOW_SCALE,
  laneOfCase,
  routeHighlight,
  routePlanExitBus,
  routePathText,
  routePlanLayout,
  type PlanEndChoice,
  type PlanFlowLayout,
} from "../src/lib/route-plan-flow";

type Plans = "yes" | "no" | undefined;
type End = PlanEndChoice | undefined;

/** What the chart lights for one situation: its lane, its boxes, and whether it reaches the exit. */
function lit(caseId: string, plans: Plans, consult?: Plans, end?: End) {
  const item = QUALIFICATION_CASES.find((candidate) => candidate.id === caseId);
  return routeHighlight(routePlanLayout(), item, plans, consult, end);
}

const EXPECTED: Record<
  string,
  { lane: string; loi: boolean; ends: string[]; ownPlans?: "yes" | "no"; client: string }
> = {
  profab: { lane: "profab", loi: true, ends: ["GC"], client: "ProFab" },
  // Owner VIP has its own lane: after Plan Ready, GC (LOI) or GC + PCS (see below).
  "owner-vip": { lane: "owner-vip", loi: true, ends: ["GC"], client: "Owner" },
  "owner-plans": {
    lane: "owner-regular",
    loi: false,
    ends: ["GC", "PCS"],
    ownPlans: "yes",
    client: "Owner",
  },
  "owner-no-plans": {
    lane: "owner-regular",
    loi: false,
    ends: ["GC", "PCS"],
    ownPlans: "no",
    client: "Owner",
  },
  // After an LOI there is no PCS.
  "gc-vip": { lane: "gc-vip", loi: true, ends: [], client: "GC" },
  "gc-plans": { lane: "gc-regular", loi: false, ends: ["PCS"], ownPlans: "yes", client: "GC" },
  "gc-no-plans": { lane: "gc-regular", loi: false, ends: ["PCS"], ownPlans: "no", client: "GC" },
};

test("every situation lights its own lane, with and without plans", () => {
  const layout = routePlanLayout();
  expect(Object.keys(EXPECTED).sort()).toEqual(QUALIFICATION_CASES.map((item) => item.id).sort());
  for (const item of QUALIFICATION_CASES) {
    const expected = EXPECTED[item.id];
    // Owner VIP chooses its way on after Plan Ready: checked in its own test.
    if (item.id === "owner-vip") {
      expect(laneOfCase(item.id, layout)).toBe("owner-vip");
      continue;
    }
    expect(laneOfCase(item.id, layout), item.id).toBe(expected.lane);
    for (const chosen of ["yes", "no", undefined] as Plans[]) {
      const plans = expected.ownPlans ?? chosen;
      const label = `${item.id} / plans ${chosen ?? "not chosen"}`;
      const result = lit(item.id, chosen);
      expect(result.lane, label).toBe(expected.lane);
      const start = expected.loi ? ["LOI"] : [];
      if (!plans) {
        // Until plans are chosen, only the way in is lit and the route stops at "Plans?".
        expect(result.boxes, label).toEqual(start);
        expect(result.out, label).toBe(false);
        expect(routePathText(item, chosen), label).toBe(
          [expected.client, ...start, "Plans?"].join(" → "),
        );
        continue;
      }
      // Without plans: CSA (with the LOI tag after an LOI).
      const middle = plans === "no" ? ["CSA"] : [];
      expect(routePathText(item, chosen), label).toBe(
        [expected.client, ...start, ...middle, ...expected.ends].join(" → "),
      );
      if (plans === "yes") {
        // Every finished path reaches the green Plan Ready before the GC / PCS.
        expect(result.boxes, label).toEqual([...start, "Plan Ready", ...expected.ends]);
        expect(result.out, label).toBe(true);
        continue;
      }
      // The second "Plans?", after CSA.
      for (const consult of ["yes", "no", undefined] as Plans[]) {
        const again = lit(item.id, chosen, consult);
        const sub = `${label} / after consultation ${consult ?? "not chosen"}`;
        if (consult === "yes") {
          expect(again.boxes, sub).toEqual([...start, ...middle, "Plan Ready", ...expected.ends]);
          expect(again.out, sub).toBe(true);
          expect(again.loop, sub).toBe(false);
        } else {
          // Not yet, or still no plans (round again): it stops before Plan Ready.
          expect(again.boxes, sub).toEqual([...start, ...middle]);
          expect(again.out, sub).toBe(false);
          expect(again.loop, sub).toBe(consult === "no");
        }
      }
    }
  }
});

test("Owner VIP has its own LOI lane: after Plan Ready, GC (LOI) or GC + PCS", () => {
  const item = QUALIFICATION_CASES.find((candidate) => candidate.id === "owner-vip")!;
  const layout = routePlanLayout();
  const lane = layout.lanes.find((candidate) => candidate.id === "owner-vip")!;
  // Not shared with ProFab any more.
  expect(layout.lanes.find((candidate) => candidate.id === "profab")!.cases).toEqual(["profab"]);
  expect(lane.cases).toEqual(["owner-vip"]);
  expect(lane.ends.map((box) => [box.text, box.loiTag])).toEqual([
    ["Plan Ready", false],
    ["GC", true],
  ]);
  expect(lane.alt!.ends.map((box) => box.text)).toEqual(["GC", "PCS"]);
  // The second way leaves Plan Ready and drops to the row below.
  expect(lane.alt!.link[0]).toEqual({ x: lane.ends[0].x + lane.ends[0].width, y: lane.yTop });
  expect(lane.alt!.link.at(-1)).toEqual({ x: lane.alt!.ends[0].x, y: lane.yBottom });
  expect(lane.alt!.ends[0].x).toBe(lane.ends[1].x);

  for (const [plans, consult, middle] of [
    ["yes", undefined, []],
    ["no", "yes", ["CSA"]],
  ] as [Plans, Plans, string[]][]) {
    // Plan Ready lights, but it goes on only once a way is chosen.
    const open = lit("owner-vip", plans, consult);
    expect(open.boxes).toEqual(["LOI", ...middle, "Plan Ready"]);
    expect(open.out).toBe(false);
    expect(routePathText(item, plans, layout, undefined, consult)).toBe(
      ["Owner", "LOI", ...middle, "GC (LOI) or GC + PCS?"].join(" → "),
    );
    const loi = lit("owner-vip", plans, consult, "gc-loi");
    expect(loi.boxes).toEqual(["LOI", ...middle, "Plan Ready", "GC"]);
    expect(loi.out).toBe(true);
    expect(routePathText(item, plans, layout, "gc-loi", consult)).toBe(
      ["Owner", "LOI", ...middle, "GC (LOI)"].join(" → "),
    );
    const pcs = lit("owner-vip", plans, consult, "gc-pcs");
    expect(pcs.boxes).toEqual(["LOI", ...middle, "Plan Ready", "GC", "PCS"]);
    expect(pcs.out).toBe(true);
    expect(routePathText(item, plans, layout, "gc-pcs", consult)).toBe(
      ["Owner", "LOI", ...middle, "GC", "PCS"].join(" → "),
    );
  }
  // Before Plan Ready, the choice changes nothing.
  expect(lit("owner-vip", "no", undefined, "gc-pcs").boxes).toEqual(["LOI", "CSA"]);
  expect(routePathText(item, "no", layout, "gc-pcs")).toBe("Owner → LOI → CSA → Plans?");
  // ProFab goes straight on to its GC (LOI).
  expect(lit("profab", "yes").out).toBe(true);
});

test("plans come from the choice on Route Selection, not from the form's drawings answer", () => {
  const form = createEmptyQualificationForm101();
  form.sectionA.parties.owner = { company: "Laurier", contact: "Marie" };
  form.sectionA.documents.archDrawings = { available: "yes", locationOrDate: "" };
  expect(qualificationCaseFor({ form101: form })).toBeUndefined();
  expect(qualificationCaseFor({ form101: form, routePlans: "no" })?.id).toBe("owner-no-plans");
  expect(qualificationCaseFor({ form101: form, routePlans: "yes" })?.id).toBe("owner-plans");
  form.sectionA.parties.gc = { company: "Côté", contact: "Luc" };
  expect(qualificationCaseFor({ form101: form, routePlans: "no" })?.id).toBe("gc-no-plans");
});

test("the chart is laid out evenly", () => {
  const layout: PlanFlowLayout = routePlanLayout();
  // Each client box sits exactly between its two situations.
  for (const client of ["Owner", "GC"]) {
    const box = layout.clients.find((item) => item.client === client)!;
    const rows = layout.branches
      .filter((branch) => branch.client === client)
      .map((branch) => branch.labelY!);
    expect(rows, client).toHaveLength(2);
    expect(box.mid, client).toBeCloseTo((rows[0] + rows[1]) / 2, 5);
    expect(box.mid - Math.min(...rows), client).toBeCloseTo(Math.max(...rows) - box.mid, 5);
  }
  // Owner and GC branch the same distance apart.
  const gap = (client: string) => {
    const rows = layout.branches.filter((b) => b.client === client).map((b) => b.labelY!);
    return Math.abs(rows[1] - rows[0]);
  };
  expect(gap("Owner")).toBe(gap("GC"));
  // ProFab sits level with its lane.
  expect(layout.clients[0].mid).toBe(layout.lanes[0].yTop);
  // Client boxes and lanes never overlap.
  for (let index = 1; index < layout.clients.length; index++)
    expect(layout.clients[index].top).toBeGreaterThan(layout.clients[index - 1].bottom);
  for (let index = 1; index < layout.lanes.length; index++) {
    const above = layout.lanes[index - 1];
    const loopBottom = above.loop[3].y;
    expect(layout.lanes[index].yTop - layout.boxHeight / 2).toBeGreaterThan(loopBottom + 6);
  }
  expect(layout.height).toBeGreaterThanOrEqual(layout.lanes.at(-1)!.loop[3].y);
  // Lines meet the boxes: into the LOI or the fork, out onto the end boxes, back up at the merge.
  for (const lane of layout.lanes) {
    expect(lane.entry.at(-1)!.x).toBe(lane.loiBox ? lane.loiBox.x : lane.forkX);
    expect(lane.yes.at(-1)!.x).toBe(lane.ends[0].x);
    expect(lane.no.at(-1)!.x).toBe(lane.csa.x);
    expect(lane.toFork2[0].x).toBe(lane.csa.x + lane.csa.width);
    expect(lane.back[0].x).toBe(lane.fork2X);
    // ✗ at the second "Plans?" loops back into CSA from below.
    expect(lane.loop.at(-1)!.x).toBe(lane.csa.x + lane.csa.width / 2);
    expect(lane.loop.at(-1)!.y).toBe(lane.csa.y + layout.boxHeight / 2);
    expect(lane.questions).toHaveLength(2);
    expect(lane.fork2X).toBe(layout.lanes[0].fork2X);
    expect(lane.back.at(-1)!.y).toBe(lane.yTop);
    expect(lane.exit.x).toBe(lane.ends.at(-1)!.x + lane.ends.at(-1)!.width);
    // Every lane lines up on the same columns.
    expect(lane.forkX).toBe(layout.lanes[0].forkX);
    expect(lane.csa.x).toBe(layout.lanes[0].csa.x);
    expect(lane.ends[0].x).toBe(layout.lanes[0].ends[0].x);
  }
});

test("every bend in the chart has the same radius", () => {
  const layout = routePlanLayout();
  const bus = routePlanExitBus(layout);
  type P = { x: number; y: number };
  const polylines: [string, P[]][] = [];
  for (const lane of layout.lanes) {
    for (const key of ["entry", "toFork", "yes", "no", "toFork2", "loop", "back"] as const)
      polylines.push([`${lane.id} ${key}`, lane[key]]);
    for (const [name, exit] of [
      ["exit", lane.exit],
      ...(lane.alt ? [["alt exit", lane.alt.exit] as const] : []),
    ] as const)
      polylines.push([
        `${lane.id} ${name}`,
        [
          { x: exit.x + 3.5, y: exit.y },
          { x: bus.busX, y: exit.y },
          { x: bus.busX, y: bus.busY },
          { x: bus.width, y: bus.busY },
        ],
      ]);
    if (lane.alt) polylines.push([`${lane.id} alt`, lane.alt.link]);
  }
  for (const branch of layout.branches)
    polylines.push([`${branch.caseIds.join("+")} branch`, branch.points]);
  for (const [name, all] of polylines) {
    // A lane level with the bus runs straight into it: no bend there.
    const points = all.filter(
      (point, index) => !index || point.x !== all[index - 1].x || point.y !== all[index - 1].y,
    );
    for (let index = 1; index < points.length - 1; index++) {
      const before = Math.hypot(
        points[index].x - points[index - 1].x,
        points[index].y - points[index - 1].y,
      );
      const after = Math.hypot(
        points[index + 1].x - points[index].x,
        points[index + 1].y - points[index].y,
      );
      // Long enough on both sides for the full corner, so none is drawn smaller.
      expect(Math.min(before, after), `${name} corner ${index}`).toBeGreaterThanOrEqual(
        2 * ROUTE_CORNER - 1e-9,
      );
    }
  }
  // The chart's corners match the canvas connectors at the card's scale.
  expect(ROUTE_CORNER * ROUTE_FLOW_SCALE).toBeCloseTo(EDGE_CORNER_RADIUS, 5);
});
