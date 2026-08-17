import { PHASE_HEADER_HEIGHT } from "@/lib/node-layout";

export type RouteObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "phase-header";
};

const spansOverlap = (
  left: number,
  right: number,
  obstacle: Pick<RouteObstacle, "x" | "width">,
) => obstacle.x < right && obstacle.x + obstacle.width > left;

export function phaseHeaderObstacles(
  obstacles: RouteObstacle[],
): RouteObstacle[] {
  return obstacles.filter((item) => item.kind === "phase-header");
}

export function cardObstacles(obstacles: RouteObstacle[]): RouteObstacle[] {
  return obstacles.filter((item) => item.kind !== "phase-header");
}

export function aboveRouteCardTop(
  source: RouteObstacle | undefined,
  target: RouteObstacle | undefined,
  fallback: number,
  extraCards: RouteObstacle[] = [],
) {
  const tops = [source?.y, target?.y, ...extraCards.map((item) => item.y)].filter(
    (value): value is number => Number.isFinite(value),
  );
  return tops.length ? Math.min(...tops) : fallback;
}

export function corridorYAboveCards(
  cardTop: number,
  lane: number,
  spanLeft: number,
  spanRight: number,
  headers: RouteObstacle[],
) {
  const preferred = cardTop - 48 - (Math.abs(lane) % 3) * 18;
  const crossed = headers.filter((header) =>
    spansOverlap(spanLeft, spanRight, header),
  );
  if (!crossed.length) return preferred;

  let y = preferred;
  for (const header of crossed) {
    const top = header.y;
    const bottom = header.y + (header.height || PHASE_HEADER_HEIGHT);
    const gutterMin = bottom + 14;
    const gutterMax = cardTop - 16;
    const hitsHeader = y < bottom + 12 && y > top - 36;
    if (!hitsHeader) continue;
    if (gutterMax >= gutterMin) {
      y = Math.min(gutterMax, Math.max(gutterMin, (gutterMin + gutterMax) / 2));
      continue;
    }
    y = top - 40 - (Math.abs(lane) % 3) * 16;
  }
  return y;
}
