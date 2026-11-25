import type { QualificationCase } from "@/lib/qualification";

type Point = { x: number; y: number };

export type RouteFlowStep = { text: string; x: number; width: number };
export type RouteFlowRow = {
  item: QualificationCase;
  y: number;
  /** Client box → shared branch line → the situation label. */
  branch: Point[];
  labelX: number;
  /** Arrow from the end of the label to the first step. */
  lead: [Point, Point];
  steps: RouteFlowStep[];
  /** Arrows between consecutive steps. */
  links: [Point, Point][];
  end: number;
};
export type RouteFlowClient = {
  client: string;
  top: number;
  bottom: number;
  mid: number;
  ids: string[];
};
export type RouteFlowLayout = {
  clients: RouteFlowClient[];
  rows: RouteFlowRow[];
  clientWidth: number;
  boxHeight: number;
  width: number;
  height: number;
};

/**
 * Lays out every customer situation as a small flowchart: each client type is
 * a box that branches into its situations, and each situation leads by arrows
 * through the steps it takes. Units are pixels at a 9–10px font; the canvas
 * and the PDF both draw from this, so they always match.
 */
export function routeFlowLayout(
  cases: QualificationCase[],
  { row = 24, groupGap = 8, charWidth = 5.6, labelCharWidth = 5.4 } = {},
): RouteFlowLayout {
  const clientWidth = 56;
  const busX = clientWidth + 10;
  const labelX = busX + 8;
  const boxHeight = 16;
  const gap = 18;
  const longestLabel = Math.max(...cases.map((item) => item.situation.length));
  const stepsX = Math.ceil(labelX + longestLabel * labelCharWidth + gap + 6);
  const boxWidth = (text: string) => Math.ceil(text.length * charWidth + 12);
  const clients: RouteFlowClient[] = [];
  const rows: RouteFlowRow[] = [];
  let y = 2;
  let width = 0;
  for (const client of [...new Set(cases.map((item) => item.client))]) {
    const group = cases.filter((item) => item.client === client);
    const top = y;
    const bottom = top + row * group.length;
    const mid = (top + bottom) / 2;
    clients.push({ client, top, bottom, mid, ids: group.map((item) => item.id) });
    group.forEach((item, index) => {
      const rowY = top + row * index + row / 2;
      const labelEnd = labelX + item.situation.length * labelCharWidth + 4;
      let x = stepsX;
      const steps: RouteFlowStep[] = [];
      const links: [Point, Point][] = [];
      item.steps.forEach((text, stepIndex) => {
        if (stepIndex > 0)
          links.push([
            { x: x - gap + 1, y: rowY },
            { x: x - 2, y: rowY },
          ]);
        const stepWidth = boxWidth(text);
        steps.push({ text, x, width: stepWidth });
        x += stepWidth + gap;
      });
      const end = x - gap;
      width = Math.max(width, end);
      rows.push({
        item,
        y: rowY,
        branch: [
          { x: clientWidth, y: mid },
          { x: busX, y: mid },
          { x: busX, y: rowY },
          { x: labelX - 2, y: rowY },
        ],
        labelX,
        lead: [
          { x: labelEnd, y: rowY },
          { x: stepsX - 2, y: rowY },
        ],
        steps,
        links,
        end,
      });
    });
    y = bottom + groupGap;
  }
  return {
    clients,
    rows,
    clientWidth,
    boxHeight,
    width: Math.ceil(width + 2),
    height: Math.ceil(y - groupGap + 2),
  };
}

/** Box colours for the steps, shared by the canvas and the PDF. */
export const ROUTE_STEP_COLORS: Record<string, { stroke: string; fill: string; text: string }> = {
  CSA: { stroke: "#2563eb", fill: "#eff6ff", text: "#1d4ed8" },
  PCS: { stroke: "#d97706", fill: "#fffbeb", text: "#b45309" },
  LOI: { stroke: "#7c3aed", fill: "#f5f3ff", text: "#6d28d9" },
  "Owner's GC": { stroke: "#b45309", fill: "#fef3c7", text: "#92400e" },
};
export const ROUTE_STEP_DEFAULT = { stroke: "#475569", fill: "#f1f5f9", text: "#334155" };
export const ROUTE_FLOW_ON = "#16a34a";
export const ROUTE_FLOW_OFF = "#94a3b8";
