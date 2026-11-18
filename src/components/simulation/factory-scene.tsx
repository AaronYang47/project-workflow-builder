"use client";

import { useId, useState, type CSSProperties } from "react";
import { closureTag, type SimDay, type SimProject } from "@/lib/simulation";
import type { DayOffPalette } from "@/lib/schedule-calendar";
import { FactoryModuleInventory } from "./factory-module-inventory";

const TRACK = { start: 52, end: 908, center: 126, height: 56 };

export function FactoryScene({
  day,
  projects,
  stepMs,
  departureMs,
  yardCapacity,
  palette,
}: {
  palette: DayOffPalette;
  day: SimDay;
  projects: SimProject[];
  stepMs: number;
  departureMs: number;
  yardCapacity: number;
}) {
  const [zoom, setZoom] = useState(1);
  const rollers = useId();
  const byId = new Map(projects.map((project) => [project.id, project]));
  const yard = Object.entries(day.yard).flatMap(([projectId, count]) =>
    Array.from({ length: count }, () => projectId),
  );
  const shipments = Object.entries(day.departures);
  const trucksPerRow = 8;
  const pickedUp = new Set(day.pickedUp);
  const bayCount = Math.max(yard.length, Math.min(yardCapacity, 24));
  const roadY = 54 + Math.ceil(bayCount / 12) * 52;
  const roadHeight = Math.max(1, Math.ceil(shipments.length / trucksPerRow)) * 58;
  const height = 226 + roadY + roadHeight + 50;
  const dayOffText = `DAY OFF · ${closureTag(day.closure).toUpperCase()}`;
  const dayOffWidth = Math.min(560, 36 + dayOffText.length * 12.5);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center justify-end">
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
      <div className="min-h-0 flex-[5] overflow-auto rounded-lg border border-slate-700">
        <svg
          role="img"
          aria-label={`Factory on ${day.date}: ${day.line.length} modules on the line, ${day.yardTotal} in the yard`}
          viewBox={`0 0 960 ${height}`}
          style={{ width: `${zoom * 100}%` }}
          className={`block select-none bg-slate-900 ${zoom === 1 ? "h-full" : ""}`}
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
            {!day.working ? (
              <g data-scene-day-off={day.closure?.kind ?? "closed"} transform="translate(480 33)">
                <rect
                  x={-dayOffWidth / 2}
                  y="-26"
                  width={dayOffWidth}
                  height="38"
                  rx="19"
                  fill={day.closure ? palette.fill[day.closure.kind] : "#64748b"}
                />
                <text
                  y="0"
                  textAnchor="middle"
                  fill={day.closure ? palette.ink[day.closure.kind] : "#fff"}
                  fontSize="20"
                  fontWeight="800"
                >
                  {dayOffText}
                </text>
              </g>
            ) : null}
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
            {shipments.map(([projectId, count], index) => {
              const project = byId.get(projectId);
              const row = Math.floor(index / trucksPerRow);
              const rowCount = Math.min(trucksPerRow, shipments.length - row * trucksPerRow);
              const column = index % trucksPerRow;
              const x = 920 - (rowCount - column) * 105;
              const y = roadY + row * 58;
              return (
                <g
                  key={`${day.date}-${projectId}`}
                  transform={`translate(${x} ${y})`}
                  data-truck-departure={projectId}
                  data-departure-count={count}
                >
                  <title>{`${project?.name ?? projectId} · ${count} modules ${pickedUp.has(projectId) ? "picked up" : "shipped to site"}`}</title>
                  <g
                    className="motion-safe:animate-[factory-truck-departure_ease-in-out_both]"
                    style={
                      {
                        animationDuration: `${departureMs}ms`,
                        "--truck-travel": `${44 + column * 105 - x}px`,
                      } as CSSProperties
                    }
                  >
                    <g data-loaded-flatbed transform="translate(0 11)">
                      {/* Dual trailer axles and tractor wheels, seen from above. */}
                      {[13, 22, 74, 91].map((axle) => (
                        <g key={axle} fill="#070b12" stroke="#475569">
                          <rect x={axle} y="1" width="7" height="7" rx="2" />
                          <rect x={axle} y="28" width="7" height="7" rx="2" />
                        </g>
                      ))}
                      <rect x="4" y="4" width="69" height="28" rx="3" fill="#94a3b8" />
                      <rect x="6" y="6" width="64" height="24" rx="2" fill="#475569" />
                      <rect x="68" y="13" width="14" height="10" fill="#94a3b8" />
                      {/* The roof outline and tie-downs identify the house module on the deck. */}
                      <rect
                        x="9"
                        y="8"
                        width="56"
                        height="20"
                        rx="2"
                        fill="#e2d2b2"
                        stroke={project?.color ?? "#64748b"}
                        strokeWidth="2"
                      />
                      <path d="M24 7v22 M51 7v22" stroke="#526172" strokeWidth="2" />
                      <path d="M75 5h17l9 5v16l-9 5H75z" fill="#e4a641" stroke="#f4ca70" />
                      <path d="M89 7l4 3v16l-4 3z" fill="#23394b" />
                      <path d="M99 11v4m0 6v4" stroke="#fff4ce" strokeWidth="2" />
                    </g>
                    <rect
                      x="19"
                      y="38"
                      width="34"
                      height="17"
                      rx="4"
                      fill="#0f172a"
                      stroke={project?.color ?? "#94a3b8"}
                    />
                    <text
                      x="36"
                      y="50"
                      textAnchor="middle"
                      fill="white"
                      fontSize="12"
                      fontWeight="700"
                    >
                      ×{count}
                    </text>
                  </g>
                </g>
              );
            })}
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
