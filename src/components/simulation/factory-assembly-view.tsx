"use client";

import { useId, useState } from "react";
import type { SimDay, SimProject } from "@/lib/simulation";

function HousingModule({
  color,
  number,
  finished = false,
}: {
  color: string;
  number?: number;
  finished?: boolean;
}) {
  return (
    <g>
      <ellipse cx="0" cy="6" rx="75" ry="13" fill="#101820" opacity="0.28" />
      <image
        href={
          finished
            ? "/simulation-assets/module-finished.png"
            : "/simulation-assets/module-building.png"
        }
        x="-85"
        y="-84"
        width="170"
        height="130"
        transform="matrix(1 .43 0 1 0 0)"
        preserveAspectRatio="xMidYMax meet"
      />
      <circle cx="0" cy="-8" r="15" fill={color} stroke="white" strokeWidth="2" />
      {number !== undefined ? (
        <text x="0" y="-3" textAnchor="middle" fontSize="14" fontWeight="700" fill="white">
          {number}
        </text>
      ) : null}
    </g>
  );
}
export function FactoryAssemblyView({
  day,
  projects,
  stepMs,
}: {
  day: SimDay;
  projects: SimProject[];
  stepMs: number;
}) {
  const [zoom, setZoom] = useState(1);
  const id = useId().replace(/:/g, "");
  const byId = new Map(projects.map((project) => [project.id, project]));
  const lineStart = { x: 566, y: 767 };
  const lineEnd = { x: 1150, y: 1258 };
  // The photograph shows a close-up of the line. Leave enough screen space for
  // each visible underframe to read as a separate room-sized structure.
  const shownLine: SimDay["line"] = [];
  for (const lineModule of [...day.line].sort((a, b) => a.progress - b.progress)) {
    const previous = shownLine.at(-1);
    if (!previous || lineModule.progress - previous.progress >= 0.34) shownLine.push(lineModule);
  }
  return (
    <section aria-label="Production line 3D view" className="mt-4">
      <h3 className="mb-2 text-sm font-bold text-slate-100">Production line · 3D view</h3>
      <div className="relative">
        <div className="absolute bottom-3 right-3 z-10 flex gap-1 rounded-lg bg-slate-950/85 p-1 text-white">
          <button
            type="button"
            aria-label="Zoom out 3D view"
            disabled={zoom === 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            className="size-9 rounded hover:bg-white/20 disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset 3D zoom"
            onClick={() => setZoom(1)}
            className="px-2 text-xs"
          >
            {zoom}×
          </button>
          <button
            type="button"
            aria-label="Zoom in 3D view"
            disabled={zoom === 2.5}
            onClick={() => setZoom(Math.min(2.5, zoom + 0.5))}
            className="size-9 rounded hover:bg-white/20 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <svg
          role="img"
          aria-label={`Factory on ${day.date}: ${day.line.length} modules on the line, ${day.yardTotal} in the yard`}
          viewBox={`${(2560 - 2560 / zoom) * 0.6} ${(1440 - 1440 / zoom) * 0.6} ${2560 / zoom} ${1440 / zoom}`}
          className="mx-auto w-full select-none rounded-lg"
          data-factory-assembly-view
        >
          <defs>
            <linearGradient id={`${id}-shade`} x2="0" y2="1">
              <stop stopColor="#0c1720" stopOpacity="0.18" />
              <stop offset="1" stopColor="#0c1720" stopOpacity="0" />
            </linearGradient>
          </defs>
          <image href="/simulation-assets/assembly-hall.jpg" width="2560" height="1440" />
          <rect width="2560" height="1440" fill={`url(#${id}-shade)`} />
          {day.blocked ? (
            <path
              d={`M${lineStart.x} ${lineStart.y} L${lineEnd.x} ${lineEnd.y}`}
              stroke="#ef4444"
              strokeWidth="50"
              opacity="0.32"
            />
          ) : null}
          {shownLine.map((item) => {
            const scale = 1.25 + item.progress * 1.05;
            return (
              <g
                key={`${item.projectId}-${item.module}`}
                data-assembly-line-module={item.projectId}
                style={{
                  transform: `translate(${lineStart.x + item.progress * (lineEnd.x - lineStart.x)}px, ${lineStart.y + item.progress * (lineEnd.y - lineStart.y)}px)`,
                  transition: `transform ${stepMs}ms linear`,
                }}
              >
                <title>{`${byId.get(item.projectId)?.name} · module ${item.module} · ${Math.round(item.progress * 100)}%`}</title>
                <g transform={`scale(${scale})`}>
                  <HousingModule
                    color={byId.get(item.projectId)?.color ?? "#64748b"}
                    number={item.module}
                    finished={item.progress >= 0.85}
                  />
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      {shownLine.length < day.line.length ? (
        <p className="px-3 pt-2 text-xs text-slate-300">
          Assembly close-up · {shownLine.length} of {day.line.length} modules shown
        </p>
      ) : null}
    </section>
  );
}
