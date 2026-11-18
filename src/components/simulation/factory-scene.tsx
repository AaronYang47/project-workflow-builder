"use client";

import { useId, useState } from "react";
import type { SimDay, SimProject } from "@/lib/simulation";

/** Coordinates follow the roller bed and yard in the Dreamina background plate. */
function HousingModule({ color, number }: { color: string; number?: number }) {
  return (
    <g>
      <ellipse cx="0" cy="6" rx="75" ry="13" fill="#101820" opacity="0.28" />
      <path d="M-70 -28 L-15 -58 L70 -10 L15 20 Z" fill="#dce1df" stroke="#626f75" />
      <path d="M-70 -28 L15 20 L15 -24 L-70 -72 Z" fill="#f1eee5" stroke="#7a8586" />
      <path d="M15 20 L70 -10 L70 -54 L15 -24 Z" fill="#b6c0c0" stroke="#647277" />
      <path d="M-70 -72 L-15 -102 L70 -54 L15 -24 Z" fill="#e7e9e4" stroke="#889493" />
      <path d="M-70 -70 L15 -22 L15 -14 L-70 -62 Z" fill={color} />
      <path d="M15 -22 L70 -52 L70 -44 L15 -14 Z" fill={color} opacity="0.8" />
      {[-54, -26].map((x) => (
        <g key={x} transform={`translate(${x} ${x * 0.565 - 2})`}>
          <path
            d="M0 -36 L20 -25 L20 -6 L0 -17 Z"
            fill="#293e4b"
            stroke="#9aa7ad"
            strokeWidth="2"
          />
          <path d="M2 -34 L18 -25 L2 -19 Z" fill="#a7c6d0" opacity="0.65" />
        </g>
      ))}
      <path d="M35 7 L35 -22 L49 -30 L49 -1 Z" fill="#52646c" stroke="#d2d8d6" strokeWidth="2" />
      <path
        d="M-65 -76 L-12 -104 M-40 -62 L13 -91 M-14 -47 L39 -76 M12 -32 L65 -61"
        stroke="#bac3c1"
        strokeWidth="1.5"
      />
      {number !== undefined ? (
        <text x="-5" y="-49" textAnchor="middle" fontSize="15" fontWeight="700" fill="#34434a">
          {number}
        </text>
      ) : null}
    </g>
  );
}

function TransportTruck({ color }: { color: string }) {
  return (
    <g>
      <ellipse cx="0" cy="17" rx="116" ry="24" fill="#101820" opacity="0.3" />
      <path d="M-115 5 L30 -76 L81 -47 L-65 34 Z" fill="#505b61" stroke="#273138" strokeWidth="4" />
      {[-70, -42, 66, 86].map((x) => (
        <ellipse
          key={x}
          cx={x}
          cy={-x * 0.56 + 3}
          rx="9"
          ry="15"
          fill="#172025"
          stroke="#69747a"
          strokeWidth="3"
        />
      ))}
      <g transform="translate(-16 -15) scale(.85)">
        <HousingModule color={color} />
      </g>
      <path d="M67 -30 L110 -54 L110 -97 L67 -74 Z" fill="#c29235" stroke="#695a39" />
      <path d="M67 -74 L110 -97 L84 -112 L42 -89 Z" fill="#edc66a" stroke="#695a39" />
      <path d="M42 -89 L67 -74 L67 -30 L42 -44 Z" fill="#e2b04b" stroke="#695a39" />
      <path
        d="M71 -75 L105 -94 L105 -76 L71 -57 Z"
        fill="#284653"
        stroke="#bdc9c8"
        strokeWidth="2"
      />
      <path d="M46 -84 L62 -75 L62 -58 L46 -67 Z" fill="#365461" />
      <path d="M72 -40 L105 -58" stroke="#eee5cd" strokeWidth="5" />
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
    <div className="relative w-full">
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
                data-line-module={item.projectId}
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
              data-yard-module={item.projectId}
              transform={`translate(${2070 + (column * 330) / columns - (row * 210) / columns} ${615 + (column * 110) / columns + (row * 185) / columns}) scale(${yardScale})`}
            >
              <title>{`${byId.get(item.projectId)?.name} · yard module ${item.index + 1}`}</title>
              <HousingModule color={byId.get(item.projectId)?.color ?? "#64748b"} />
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
  );
}
