"use client";

import { useId, useState } from "react";
import type { SimDay, SimProject } from "@/lib/simulation";
import { FactoryModuleInventory } from "./factory-module-inventory";

const TRACK = { start: 52, end: 908, center: 126, height: 56 };

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
  const rollers = useId();
  const byId = new Map(projects.map((project) => [project.id, project]));
  const yard = Object.entries(day.yard).flatMap(([projectId, count]) =>
    Array.from({ length: count }, () => projectId),
  );
  const shipments = [
    ...Object.entries(day.inTransit)
      .filter(([, count]) => count > 0)
      .map(([projectId, count]) => ({
        projectId,
        label: String(count),
        detail: `${count} in transit`,
      })),
    ...day.pickedUp.map((projectId) => ({ projectId, label: "↑", detail: "Picked up today" })),
  ];
  const bayCount = Math.max(yard.length, Math.min(yardCapacity, 24));
  const roadY = 54 + Math.ceil(bayCount / 12) * 52;
  const roadHeight = Math.max(1, Math.ceil(shipments.length / 12)) * 58;
  const height = 226 + roadY + roadHeight + 50;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center rounded-md border border-slate-700 text-white">
          <button
            type="button"
            aria-label="Zoom out factory"
            disabled={zoom === 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            className="size-8 disabled:opacity-40"
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
            className="size-8 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <svg
          role="img"
          aria-label={`Factory on ${day.date}: ${day.line.length} modules on the line, ${day.yardTotal} in the yard`}
          viewBox={`0 0 960 ${height}`}
          style={{ width: `${zoom * 100}%` }}
          className="block min-w-[620px] select-none bg-slate-900"
          data-factory-scene
        >
          <defs>
            <pattern id={rollers} width="16" height="8" patternUnits="userSpaceOnUse">
              <rect width="16" height="8" fill="#334155" />
              <rect x="4" width="7" height="8" rx="2" fill="#94a3b8" />
            </pattern>
          </defs>

          <g data-roller-track>
            <text x="28" y="33" fill="#e2e8f0" fontSize="20" fontWeight="600">
              Production line
            </text>
            <text x="932" y="33" textAnchor="end" fill="#cbd5e1" fontSize="18">
              {day.line.length} modules
            </text>
            <rect
              x="28"
              y="78"
              width="904"
              height="96"
              rx="10"
              fill={day.blocked ? "#421f29" : "#17283a"}
              stroke={day.blocked ? "#fb7185" : "#475569"}
            />
            {[TRACK.center - TRACK.height / 2, TRACK.center + TRACK.height / 2].map((y) => (
              <rect
                key={y}
                x="36"
                y={y - 4}
                width="888"
                height="8"
                rx="3"
                fill={`url(#${rollers})`}
              />
            ))}
            {day.line.map((item) => {
              const project = byId.get(item.projectId);
              const progress = Math.min(1, Math.max(0, item.progress));
              const x = TRACK.start + progress * (TRACK.end - TRACK.start);
              return (
                <g
                  key={`${item.projectId}-${item.module}`}
                  data-scene-line-module={item.projectId}
                  style={{
                    transform: `translate(${x}px, ${TRACK.center}px)`,
                    transition: `transform ${stepMs}ms linear`,
                  }}
                >
                  <title>{`${project?.name ?? item.projectId} · Module #${item.module} · ${Math.round(progress * 100)}%`}</title>
                  <rect
                    x="-15"
                    y={-TRACK.height / 2}
                    width="30"
                    height={TRACK.height}
                    rx="4"
                    fill={project?.color ?? "#475569"}
                    stroke="#e2e8f0"
                  />
                  <rect x="-11" y="-18" width="22" height="36" rx="3" fill="#0f172a" />
                  <text y="5" textAnchor="middle" fill="white" fontSize="13" fontWeight="700">
                    {item.module}
                  </text>
                </g>
              );
            })}
            <text x="28" y="205" fill="#94a3b8" fontSize="15">
              Module entry
            </text>
            <text x="932" y="205" textAnchor="end" fill="#94a3b8" fontSize="15">
              Exit to yard →
            </text>
          </g>
          <g data-yard-floor-plan transform="translate(0 226)">
            <text x="28" y="33" fill="#e2e8f0" fontSize="20" fontWeight="600">
              Yard
            </text>
            <text x="932" y="33" textAnchor="end" fill="#cbd5e1" fontSize="18">
              {day.yardTotal} / {yardCapacity} occupied
            </text>
            {Array.from({ length: bayCount }, (_, index) => {
              const project = byId.get(yard[index]);
              return (
                <g
                  key={index}
                  transform={`translate(${28 + (index % 12) * 76} ${52 + Math.floor(index / 12) * 52})`}
                  data-scene-yard-module={yard[index]}
                >
                  <title>
                    {project ? `Bay ${index + 1} · ${project.name}` : `Bay ${index + 1} · empty`}
                  </title>
                  <rect
                    width="68"
                    height="43"
                    rx="5"
                    fill={project?.color ?? "#17283a"}
                    stroke="#64748b"
                    strokeDasharray={project ? undefined : "4 4"}
                  />
                  <text
                    x="34"
                    y="27"
                    textAnchor="middle"
                    fill={project ? "#fff" : "#94a3b8"}
                    fontSize="16"
                    paintOrder="stroke"
                    stroke={project ? "#0f172a" : undefined}
                    strokeWidth="2"
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
            <rect
              x="28"
              y={roadY}
              width="904"
              height={roadHeight}
              rx="8"
              fill="#1e293b"
              stroke="#475569"
            />
            <path d={`M44 ${roadY + 29} H916`} stroke="#64748b" strokeDasharray="12 10" />
            {shipments.map((event, index) => (
              <g
                key={index}
                transform={`translate(${46 + (index % 12) * 72} ${roadY + Math.floor(index / 12) * 58 + 14})`}
              >
                <title>{`${byId.get(event.projectId)?.name ?? event.projectId} · ${event.detail}`}</title>
                <rect
                  width="48"
                  height="30"
                  rx="3"
                  fill={byId.get(event.projectId)?.color ?? "#475569"}
                  stroke="#94a3b8"
                />
                <rect x="49" y="4" width="12" height="22" rx="3" fill="#cbd5e1" />
                <text
                  x="24"
                  y="20"
                  textAnchor="middle"
                  fill="white"
                  fontSize="15"
                  paintOrder="stroke"
                  stroke="#0f172a"
                  strokeWidth="2"
                >
                  {event.label}
                </text>
              </g>
            ))}
            <text x="28" y={roadY + roadHeight + 28} fill="#94a3b8" fontSize="15">
              Shipping lane →
            </text>
          </g>
        </svg>
      </div>
      <FactoryModuleInventory day={day} projects={projects} yardCapacity={yardCapacity} />
    </div>
  );
}
