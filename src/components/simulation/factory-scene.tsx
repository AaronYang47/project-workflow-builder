"use client";

import { useId, useState } from "react";
import { FactoryModuleInventory } from "./factory-module-inventory";
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
        y="-115"
        width="170"
        height="130"
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
function TransportTruck({ color }: { color: string }) {
  return (
    <g>
      <image href="/simulation-assets/truck.png" x="-125" y="-140" width="250" height="188" />
      <circle cx="0" cy="-8" r="12" fill={color} stroke="white" strokeWidth="2" />
    </g>
  );
}

export function FactoryScene({
  day,
  projects,
  stepMs,
  yardCapacity,
}: {
  day: SimDay;
  projects: SimProject[];
  stepMs: number;
  yardCapacity: number;
}) {
  const [zoom, setZoom] = useState(1);
  const id = useId().replace(/:/g, "");
  const byId = new Map(projects.map((project) => [project.id, project]));
  const yard = Object.entries(day.yard).flatMap(([projectId, count]) =>
    Array.from({ length: count }, (_, index) => ({ projectId, index })),
  );
  // Keep the complete yard count visible without stacking buildings on top of one another.
  const columns = Math.max(4, Math.ceil(Math.sqrt(Math.max(yardCapacity, yard.length))));
  const yardScale = Math.min(0.58, 2.5 / columns);
  const traffic = Object.entries(day.inTransit).filter(([, count]) => count > 0);
  return (
    <div className="w-full">
      <div className="relative">
        <div className="absolute bottom-3 right-3 z-10 flex gap-1 rounded-lg bg-slate-950/85 p-1 text-white">
          <button
            type="button"
            aria-label="Zoom out factory"
            disabled={zoom === 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            className="size-9 rounded hover:bg-white/20 disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Reset factory zoom"
            onClick={() => setZoom(1)}
            className="px-2 text-xs"
          >
            {zoom}×
          </button>
          <button
            type="button"
            aria-label="Zoom in factory"
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
          data-factory-scene
        >
          <defs>
            <linearGradient id={`${id}-shade`} x2="0" y2="1">
              <stop stopColor="#0c1720" stopOpacity="0.18" />
              <stop offset="1" stopColor="#0c1720" stopOpacity="0" />
            </linearGradient>
          </defs>
          <image href="/simulation-assets/factory-realistic.jpg" width="2560" height="1440" />
          <rect width="2560" height="1440" fill={`url(#${id}-shade)`} />
          {day.blocked ? (
            <path d="M840 630 L1500 1000" stroke="#ef4444" strokeWidth="50" opacity="0.32" />
          ) : null}
          {[...day.line]
            .sort((a, b) => a.progress - b.progress)
            .map((item) => {
              const scale = 0.7 + item.progress * 0.35;
              return (
                <g
                  key={`${item.projectId}-${item.module}`}
                  data-scene-line-module={item.projectId}
                  style={{
                    transform: `translate(${850 + item.progress * 650}px, ${635 + item.progress * 365}px)`,
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
          {yard.map((item, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            return (
              <g
                key={`${item.projectId}-${item.index}`}
                data-scene-yard-module={item.projectId}
                transform={`translate(${2070 + (column * 330) / columns - (row * 210) / columns} ${615 + (column * 110) / columns + (row * 185) / columns}) scale(${yardScale})`}
              >
                <title>{`${byId.get(item.projectId)?.name} · yard module ${item.index + 1}`}</title>
                <HousingModule color={byId.get(item.projectId)?.color ?? "#64748b"} finished />
              </g>
            );
          })}
          {traffic.map(([projectId, count], index) => (
            <g key={`${day.date}-${projectId}`} data-truck={projectId}>
              <title>{`${byId.get(projectId)?.name} · ${count} modules in transit`}</title>
              <animateTransform
                attributeName="transform"
                type="translate"
                from="1630 1290"
                to="2440 840"
                dur={`${4 + index}s`}
                repeatCount="indefinite"
              />
              <TransportTruck color={byId.get(projectId)?.color ?? "#64748b"} />
            </g>
          ))}
          {day.pickedUp.map((projectId, index) => (
            <g
              key={projectId}
              data-pickup={projectId}
              transform={`translate(${1940 + (index % 3) * 140} ${1090 - (index % 3) * 78}) scale(.8)`}
            >
              <title>{`${byId.get(projectId)?.name} picked up`}</title>
              <TransportTruck color={byId.get(projectId)?.color ?? "#64748b"} />
            </g>
          ))}
          <g fontFamily="system-ui, sans-serif" fontSize="25" fontWeight="700" fill="white">
            <rect
              x="1810"
              y="470"
              width="590"
              height="60"
              rx="14"
              fill={day.yardTotal >= yardCapacity ? "#991b1b" : "#14242ddd"}
            />
            <text x="1840" y="510">
              FOB YARD · {day.yardTotal} / {yardCapacity}
            </text>
            <rect x="940" y="1090" width="360" height="58" rx="14" fill="#14242ddd" />
            <text x="970" y="1128">
              PRODUCTION LINE
            </text>
          </g>
        </svg>
      </div>
      <FactoryModuleInventory day={day} projects={projects} yardCapacity={yardCapacity} />
    </div>
  );
}
