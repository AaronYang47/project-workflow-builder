"use client";

import { AlertTriangle } from "lucide-react";
import type { SimFactory, SimProject, SimResult } from "@/lib/simulation";

const DAY_MS = 86_400_000;
const dayNumber = (date?: string) => (date ? Date.parse(`${date}T00:00:00Z`) / DAY_MS : NaN);
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});
const formatDate = (date?: string) =>
  date ? shortDate.format(new Date(`${date}T00:00:00Z`)) : "—";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-lg font-bold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

/** A day-by-day count drawn as a filled line, with reference levels. */
function DailyChart({
  title,
  values,
  levels,
  max,
  color,
}: {
  title: string;
  values: number[];
  levels: { value: number; label: string; color: string }[];
  max: number;
  color: string;
}) {
  const width = Math.max(1, values.length - 1);
  const top = Math.max(max, ...values, 1);
  const y = (value: number) => 100 - (value / top) * 100;
  const points = values.map((value, index) => `${index},${y(value)}`).join(" ");
  return (
    <figure className="rounded-lg border bg-background p-3">
      <figcaption className="mb-2 text-xs font-bold">{title}</figcaption>
      <div className="relative h-28">
        <svg
          viewBox={`0 0 ${width} 100`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <polygon points={`0,100 ${points} ${width},100`} fill={color} fillOpacity={0.18} />
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {levels.map((level) => (
            <line
              key={level.label}
              x1={0}
              x2={width}
              y1={y(level.value)}
              y2={y(level.value)}
              stroke={level.color}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {levels.map((level) => (
          <span
            key={level.label}
            className="absolute right-0 -translate-y-full px-1 text-[10px] font-semibold"
            style={{ top: `${y(level.value)}%`, color: level.color }}
          >
            {level.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Summary, one timeline row per project, daily line and yard charts, warnings. */
export function SimulationResults({
  result,
  projects,
  factory,
}: {
  result: SimResult;
  projects: SimProject[];
  factory: SimFactory;
}) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const late = result.projects.filter((project) => project.lateDays > 0);
  const firstDay = dayNumber(result.days[0]?.date);
  const lastDay = Math.max(
    dayNumber(result.days.at(-1)?.date),
    ...projects.map((project) => dayNumber(project.dueDate)).filter(Number.isFinite),
  );
  const span = Math.max(1, lastDay - firstDay + 1);
  const left = (date?: string) => ((dayNumber(date) - firstDay) / span) * 100;
  const width = (from?: string, to?: string) =>
    Math.max(0.4, ((dayNumber(to) - dayNumber(from) + 1) / span) * 100);
  const months: { label: string; left: number }[] = [];
  if (Number.isFinite(firstDay)) {
    const cursor = new Date(firstDay * DAY_MS);
    cursor.setUTCDate(1);
    for (
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      ;
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    ) {
      const day = cursor.getTime() / DAY_MS;
      if (day > lastDay) break;
      months.push({
        label: cursor.toLocaleDateString("en-GB", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }),
        left: ((day - firstDay) / span) * 100,
      });
    }
  }

  if (!result.days.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Add projects to run the simulation.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-simulation-results>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="All done" value={formatDate(result.makespanEnd)} />
        <Stat
          label="Late projects"
          value={`${late.length} / ${result.projects.length}`}
          tone={late.length ? "bad" : "good"}
        />
        <Stat label="Most on the line" value={`${result.peakOnLine} modules`} />
        <Stat
          label="Line stopped (yard full)"
          value={`${result.blockedDays} days`}
          tone={result.blockedDays ? "bad" : undefined}
        />
      </div>

      <section aria-label="Project timeline" className="rounded-lg border bg-background p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-muted-foreground">
          <span className="text-xs font-bold text-foreground">Timeline</span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-4 rounded-sm bg-slate-500" /> On the line
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-slate-500" />{" "}
            In the yard / on the road
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-2.5 w-4 rounded-sm bg-slate-500/50" /> Installing
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-0.5 bg-red-500" /> Due date
          </span>
        </div>
        <div className="relative h-5 border-b text-[10px] text-muted-foreground">
          {months.map((month) => (
            <span
              key={month.label}
              className="absolute -translate-x-1/2"
              style={{ left: `${month.left}%` }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div className="divide-y">
          {result.priority.map((id) => {
            const project = byId.get(id);
            const row = result.projects.find((item) => item.projectId === id);
            if (!project || !row) return null;
            const after = row.pickup ?? row.installStart;
            return (
              <div
                key={id}
                data-sim-row={id}
                className="grid grid-cols-[9rem_1fr] items-center gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold" title={project.name}>
                    {project.name}
                  </p>
                  <p
                    className={`text-[10px] ${row.lateDays ? "font-semibold text-red-600" : "text-muted-foreground"}`}
                  >
                    {row.finished
                      ? row.lateDays
                        ? `${row.lateDays}d late · ${formatDate(row.completion)}`
                        : `On time · ${formatDate(row.completion)}`
                      : "Does not finish"}
                  </p>
                </div>
                <div className="relative h-6">
                  {row.firstLoad && row.productionEnd ? (
                    <div
                      data-sim-bar="line"
                      title={`On the line ${formatDate(row.firstLoad)} – ${formatDate(row.productionEnd)}`}
                      className="absolute top-0.5 h-5 rounded"
                      style={{
                        left: `${left(row.firstLoad)}%`,
                        width: `${width(row.firstLoad, row.productionEnd)}%`,
                        background: project.color,
                      }}
                    />
                  ) : null}
                  {row.productionEnd && after && after > row.productionEnd ? (
                    <div
                      data-sim-bar="wait"
                      title={`Waiting ${formatDate(row.productionEnd)} – ${formatDate(after)}`}
                      className="absolute top-1.5 h-3 rounded border border-dashed"
                      style={{
                        left: `${left(row.productionEnd)}%`,
                        width: `${width(row.productionEnd, after)}%`,
                        borderColor: project.color,
                      }}
                    />
                  ) : null}
                  {row.installStart && row.installEnd ? (
                    <div
                      data-sim-bar="install"
                      title={`Installing ${formatDate(row.installStart)} – ${formatDate(row.installEnd)}`}
                      className="absolute top-0.5 h-5 rounded"
                      style={{
                        left: `${left(row.installStart)}%`,
                        width: `${width(row.installStart, row.installEnd)}%`,
                        background: project.color,
                        opacity: 0.5,
                      }}
                    />
                  ) : null}
                  <div
                    title={`Due ${formatDate(project.dueDate)}`}
                    className="absolute -top-0.5 h-7 w-0.5 bg-red-500"
                    style={{ left: `${left(project.dueDate)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <DailyChart
          title="Modules on the line each day"
          values={result.days.map((day) => day.line.length)}
          max={factory.crowdedMax}
          color="#2563eb"
          levels={[
            {
              value: factory.targetOnLine,
              label: `${factory.targetOnLine} normal`,
              color: "#16a34a",
            },
            {
              value: factory.crowdedMax,
              label: `${factory.crowdedMax} max (tight)`,
              color: "#dc2626",
            },
          ]}
        />
        <DailyChart
          title="Modules waiting in the yard"
          values={result.days.map((day) => day.yardTotal)}
          max={factory.yardCapacity}
          color="#d97706"
          levels={[
            {
              value: factory.yardCapacity,
              label: `${factory.yardCapacity} full`,
              color: "#dc2626",
            },
          ]}
        />
      </div>

      {result.warnings.length ? (
        <section
          aria-label="Warnings"
          className="rounded-lg border border-red-500/30 bg-red-500/5 p-3"
        >
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-red-600">
            <AlertTriangle className="size-4" /> Warnings
          </h3>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
