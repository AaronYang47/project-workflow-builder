"use client";

import type { SimDay, SimProject } from "@/lib/simulation";
import { boxFaces, iso, points, shade, tile } from "./iso";

/** World layout, in floor units. */
const LINE = { x: 2, y: 3.2, length: 24, width: 2.8 };
const MODULE = { length: 1.05, width: 2.4, height: 1.3 };
const YARD = { x: 28, y: 0.4, columns: 5, rows: 3, slotX: 1.35, slotY: 2.8 };
const ROAD = { y: 10.2, width: 2.2, from: -2, to: 46 };
const FLOOR = { length: 35.5, width: 9.4 };

const bounds = (() => {
  const corners = [
    iso(ROAD.from, 0, 4),
    iso(ROAD.to, 0, 4),
    iso(ROAD.from, ROAD.y + ROAD.width),
    iso(ROAD.to, ROAD.y + ROAD.width),
    iso(0, 0, 4),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    x: Math.min(...xs) - 10,
    y: Math.min(...ys) - 10,
    width: Math.max(...xs) - Math.min(...xs) + 20,
    height: Math.max(...ys) - Math.min(...ys) + 20,
  };
})();

function ModuleBox({ color, faded = false }: { color: string; faded?: boolean }) {
  const faces = boxFaces(MODULE.length, MODULE.width, MODULE.height);
  return (
    <g opacity={faded ? 0.55 : 1}>
      <polygon points={faces.left} fill={shade(color, -0.35)} />
      <polygon points={faces.right} fill={shade(color, -0.15)} />
      <polygon
        points={faces.top}
        fill={shade(color, 0.2)}
        stroke={shade(color, -0.4)}
        strokeWidth={0.6}
      />
    </g>
  );
}

function Truck({ color, loaded, label }: { color: string; loaded: boolean; label?: string }) {
  const cab = boxFaces(1.4, 1.8, 1.4);
  const bed = boxFaces(4.2, 1.8, 0.35);
  const cargo = boxFaces(3.6, 1.6, 1.1);
  const offset = (x: number, y: number, z: number) => {
    const p = iso(x, y, z);
    return `translate(${p.x} ${p.y})`;
  };
  return (
    <g>
      <g transform={offset(0, 0, 0)}>
        <polygon points={bed.left} fill="#334155" />
        <polygon points={bed.right} fill="#475569" />
        <polygon points={bed.top} fill="#64748b" />
      </g>
      {loaded ? (
        <g transform={offset(0.3, 0.1, 0.35)}>
          <polygon points={cargo.left} fill={shade(color, -0.35)} />
          <polygon points={cargo.right} fill={shade(color, -0.15)} />
          <polygon points={cargo.top} fill={shade(color, 0.2)} />
        </g>
      ) : null}
      <g transform={offset(4.2, 0, 0)}>
        <polygon points={cab.left} fill="#b45309" />
        <polygon points={cab.right} fill="#d97706" />
        <polygon points={cab.top} fill="#fbbf24" />
      </g>
      {label ? (
        <text
          {...iso(2.5, 0, 2.6)}
          textAnchor="middle"
          className="fill-foreground text-[13px] font-bold"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/**
 * The factory on one simulated day: the moving line with its modules, the
 * yard, and trucks heading to sites or collecting from the FOB yard.
 * Modules glide to their next position over `stepMs`.
 */
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
  const colorOf = new Map(projects.map((project) => [project.id, project.color]));
  const nameOf = new Map(projects.map((project) => [project.id, project.name]));
  const perDay = new Map(
    projects.map((project) => [
      project.id,
      project.delivery.kind === "site" ? Math.max(1, project.delivery.modulesPerDay) : 1,
    ]),
  );

  const yardModules = Object.entries(day.yard).flatMap(([projectId, count]) =>
    Array.from({ length: count }, () => projectId),
  );
  const slotsPerLayer = YARD.columns * YARD.rows;
  const yardSlots = Math.max(yardCapacity, yardModules.length);
  const trucks = Object.entries(day.inTransit).flatMap(([projectId, count]) =>
    Array.from(
      { length: Math.min(3, Math.ceil(count / (perDay.get(projectId) ?? 1))) },
      () => projectId,
    ),
  );

  const lineModules = [...day.line].sort((a, b) => a.progress - b.progress);

  return (
    <svg
      role="img"
      aria-label={`Factory on ${day.date}: ${day.line.length} modules on the line, ${day.yardTotal} in the yard`}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      className="mx-auto h-auto max-h-[300px] w-full select-none"
      data-factory-scene
    >
      {/* Back walls and floor */}
      <polygon
        points={points([
          [0, 0, 0],
          [FLOOR.length, 0, 0],
          [FLOOR.length, 0, 3.2],
          [0, 0, 3.2],
        ])}
        fill="#cbd5e1"
        opacity={0.55}
      />
      <polygon
        points={points([
          [0, 0, 0],
          [0, FLOOR.width, 0],
          [0, FLOOR.width, 3.2],
          [0, 0, 3.2],
        ])}
        fill="#94a3b8"
        opacity={0.55}
      />
      <polygon points={tile(0, 0, FLOOR.length, FLOOR.width)} fill="#e2e8f0" stroke="#94a3b8" />
      {Array.from({ length: Math.floor(FLOOR.length / 2) }, (_, index) => (
        <polygon key={index} points={tile(index * 2, 0, 0.04, FLOOR.width, 0.01)} fill="#cbd5e1" />
      ))}

      {/* The line */}
      <polygon
        points={tile(LINE.x - 0.3, LINE.y - 0.2, LINE.length + 0.6, LINE.width + 0.4, 0.02)}
        fill="#475569"
      />
      <polygon
        points={tile(LINE.x, LINE.y, LINE.length, LINE.width, 0.05)}
        fill={day.blocked ? "#7f1d1d" : "#334155"}
      />
      {Array.from({ length: 24 }, (_, index) => (
        <polygon
          key={index}
          points={tile(LINE.x + index, LINE.y, 0.08, LINE.width, 0.06)}
          fill="#64748b"
        />
      ))}

      {lineModules.map((item) => {
        const position = iso(
          LINE.x + item.progress * (LINE.length - MODULE.length),
          LINE.y + 0.2,
          0.06,
        );
        return (
          <g
            key={`${item.projectId}#${item.module}`}
            data-line-module={item.projectId}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              transition: `transform ${stepMs}ms linear`,
            }}
          >
            <title>{`${nameOf.get(item.projectId)} · module ${item.module} · ${Math.round(item.progress * 100)}%`}</title>
            <ModuleBox color={colorOf.get(item.projectId) ?? "#64748b"} />
          </g>
        );
      })}

      {/* Line labels, in front of the modules */}
      <text
        {...iso(LINE.x - 0.4, LINE.y + LINE.width + 2.2)}
        className="fill-slate-600 text-[15px] font-bold"
      >
        LINE START
      </text>
      <text
        {...iso(LINE.x + LINE.length - 1, LINE.y + LINE.width + 2.2)}
        className="fill-slate-600 text-[15px] font-bold"
      >
        LINE END → YARD
      </text>

      {/* Yard */}
      <polygon
        points={tile(
          YARD.x - 0.3,
          0.1,
          YARD.columns * YARD.slotX + 0.4,
          YARD.rows * YARD.slotY + 0.6,
          0.02,
        )}
        fill={day.yardTotal >= yardCapacity ? "#fecaca" : "#fef3c7"}
        stroke="#d97706"
        strokeDasharray="4 3"
      />
      {Array.from({ length: Math.min(slotsPerLayer, yardSlots) }, (_, index) => {
        const column = index % YARD.columns;
        const row = Math.floor(index / YARD.columns);
        return (
          <polygon
            key={index}
            points={tile(
              YARD.x + column * YARD.slotX,
              YARD.y + row * YARD.slotY,
              MODULE.length,
              MODULE.width,
              0.03,
            )}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={0.6}
            opacity={0.6}
          />
        );
      })}
      {yardModules
        .map((projectId, index) => {
          const layer = Math.floor(index / slotsPerLayer);
          const slot = index % slotsPerLayer;
          return {
            projectId,
            index,
            x: YARD.x + (slot % YARD.columns) * YARD.slotX,
            y: YARD.y + Math.floor(slot / YARD.columns) * YARD.slotY,
            z: layer * MODULE.height,
          };
        })
        .sort((a, b) => a.z - b.z || a.x + a.y - (b.x + b.y))
        .map((item) => {
          const position = iso(item.x, item.y, item.z);
          return (
            <g
              key={`yard-${item.index}`}
              data-yard-module={item.projectId}
              transform={`translate(${position.x} ${position.y})`}
            >
              <ModuleBox color={colorOf.get(item.projectId) ?? "#64748b"} />
            </g>
          );
        })}
      <text {...iso(YARD.x + 2, -1.2, 3.4)} className="fill-amber-700 text-[16px] font-black">
        FOB YARD {day.yardTotal}/{yardCapacity}
      </text>

      {/* Road out of the factory */}
      <polygon points={tile(ROAD.from, ROAD.y, ROAD.to - ROAD.from, ROAD.width)} fill="#1f2937" />
      <polygon
        points={tile(ROAD.from, ROAD.y + ROAD.width / 2 - 0.05, ROAD.to - ROAD.from, 0.1, 0.01)}
        fill="#facc15"
        opacity={0.7}
      />
      <text
        {...iso(ROAD.to - 3, ROAD.y + ROAD.width + 1.6)}
        className="fill-slate-600 text-[15px] font-bold"
      >
        TO SITES →
      </text>

      {trucks.map((projectId, index) => {
        const start = iso(32 + index * 5.5, ROAD.y + 0.2);
        const end = iso(ROAD.to - 5, ROAD.y + 0.2);
        return (
          <g key={`truck-${projectId}-${index}`} data-truck={projectId}>
            <animateTransform
              attributeName="transform"
              type="translate"
              from={`${start.x} ${start.y}`}
              to={`${end.x} ${end.y}`}
              dur={`${2.5 + index * 0.6}s`}
              repeatCount="indefinite"
            />
            <Truck color={colorOf.get(projectId) ?? "#64748b"} loaded />
          </g>
        );
      })}

      {day.pickedUp.map((projectId, index) => {
        const position = iso(YARD.x - 1 + index * 5, ROAD.y + 0.2);
        return (
          <g
            key={`pickup-${projectId}`}
            data-pickup={projectId}
            transform={`translate(${position.x} ${position.y})`}
          >
            <Truck
              color={colorOf.get(projectId) ?? "#64748b"}
              loaded
              label={`${nameOf.get(projectId)} picked up`}
            />
          </g>
        );
      })}
    </svg>
  );
}
