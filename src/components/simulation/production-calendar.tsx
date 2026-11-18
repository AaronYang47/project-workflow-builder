"use client";

import { AlertTriangle, Check } from "lucide-react";
import type { SimDay, SimProject, SimResult } from "@/lib/simulation";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthTitle = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

type Item = { key: string; text: string; short: string; color: string; done: boolean };

/** What happened (or is planned) on one simulated day. */
function dayItems(day: SimDay, projects: Map<string, SimProject>): Item[] {
  const name = (id: string) => projects.get(id)?.name ?? id;
  const color = (id: string) => projects.get(id)?.color ?? "#64748b";
  return [
    ...Object.entries(day.built).map(([id, count]) => ({
      key: `built-${id}`,
      text: `${count} built · ${name(id)}`,
      short: `+${count}`,
      color: color(id),
      done: true,
    })),
    ...day.pickedUp.map((id) => ({
      key: `pickup-${id}`,
      text: `Picked up · ${name(id)}`,
      short: "Pickup",
      color: color(id),
      done: true,
    })),
    ...Object.entries(day.delivered).map(([id, count]) => ({
      key: `delivered-${id}`,
      text: `${count} on site · ${name(id)}`,
      short: `→${count}`,
      color: color(id),
      done: true,
    })),
    ...day.installedDone.map((id) => ({
      key: `installed-${id}`,
      text: `Installed · ${name(id)}`,
      short: "Done",
      color: color(id),
      done: true,
    })),
  ];
}

/**
 * Month-by-month production calendar for the whole simulation. Days up to
 * the playback day are ticked as done; later days show the plan. Warnings
 * mark days the line stopped and due dates a project misses.
 */
export function ProductionCalendar({
  result,
  projects,
  index,
  onSelect,
}: {
  result: SimResult;
  projects: SimProject[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const firstDay = dayNumber(result.days[0].date);
  const dayByDate = new Map(result.days.map((day, position) => [day.date, { day, position }]));
  const completion = new Map(result.projects.map((row) => [row.projectId, row]));
  const missedDue = new Map<string, string[]>();
  for (const project of projects) {
    const row = completion.get(project.id);
    if (!row || (row.finished && row.lateDays === 0)) continue;
    missedDue.set(project.dueDate, [...(missedDue.get(project.dueDate) ?? []), project.name]);
  }
  const dueOn = new Map<string, SimProject[]>();
  for (const project of projects)
    dueOn.set(project.dueDate, [...(dueOn.get(project.dueDate) ?? []), project]);

  const current = result.days[index];
  const doneSoFar = result.days.slice(0, index + 1);
  const builtSoFar = doneSoFar.reduce(
    (sum, day) => sum + Object.values(day.built).reduce((a, b) => a + b, 0),
    0,
  );
  const totalModules = projects.reduce((sum, project) => sum + project.modules, 0);
  const finishedSoFar = result.projects.filter(
    (row) => row.completion && row.completion <= current.date,
  ).length;
  const warningsSoFar =
    doneSoFar.filter((day) => day.blocked).length +
    [...missedDue.keys()].filter((date) => date <= current.date).length;

  // Months from the first simulated day to the last day or due date.
  const lastDay = Math.max(
    dayNumber(result.days.at(-1)!.date),
    ...projects.map((project) => dayNumber(project.dueDate)).filter(Number.isFinite),
  );
  const months: { title: string; cells: (number | null)[] }[] = [];
  const cursor = new Date(firstDay * DAY_MS);
  cursor.setUTCDate(1);
  while (cursor.getTime() / DAY_MS <= lastDay && months.length < 60) {
    const start = cursor.getTime() / DAY_MS;
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const length = Math.round(next.getTime() / DAY_MS - start);
    const lead = (cursor.getUTCDay() + 6) % 7;
    months.push({
      title: monthTitle.format(cursor),
      cells: [
        ...Array.from({ length: lead }, () => null),
        ...Array.from({ length }, (_, offset) => start + offset),
      ],
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return (
    <section aria-label="Production calendar" data-production-calendar className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span data-calendar-built>
          <Check className="mr-1 inline size-3.5 text-emerald-600" />
          {builtSoFar}/{totalModules} modules built
        </span>
        <span>
          <Check className="mr-1 inline size-3.5 text-emerald-600" />
          {finishedSoFar}/{projects.length} projects complete
        </span>
        <span className={warningsSoFar ? "font-semibold text-red-600" : "text-muted-foreground"}>
          <AlertTriangle className="mr-1 inline size-3.5" />
          {warningsSoFar} warnings so far
        </span>
        <span className="text-muted-foreground">
          Ticked days are done as of the playback day; click a day to jump there.
        </span>
        <span className="text-muted-foreground">
          <b>+N</b> built · <b>→N</b> on site · <b>Pickup</b> FOB collected · <b>Done</b> installed
          · <b className="text-red-600">Due</b> due date · faded = still to come
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {months.map((month) => (
          <div key={month.title} className="rounded-lg border bg-background p-2">
            <h4 className="mb-1 text-xs font-bold">{month.title}</h4>
            <div className="grid grid-cols-7 gap-0.5 text-[9px]">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday} className="text-center font-semibold text-muted-foreground">
                  {weekday}
                </span>
              ))}
              {month.cells.map((value, position) => {
                if (value === null) return <span key={`blank-${position}`} />;
                const date = isoOf(value);
                const entry = dayByDate.get(date);
                const past = entry ? entry.position <= index : false;
                const isCurrent = entry?.position === index;
                const items = entry ? dayItems(entry.day, byId) : [];
                const warnings = [
                  ...(entry?.day.blocked ? ["Line stopped · yard full"] : []),
                  ...(missedDue.get(date) ?? []).map((name) => `${name} due · not done`),
                ];
                const due = dueOn.get(date) ?? [];
                const title = [
                  date,
                  ...(entry && !entry.day.working ? ["Factory closed"] : []),
                  ...items.map((item) => `${past ? "✓" : "·"} ${item.text}`),
                  ...due.map((project) => `Due · ${project.name}`),
                  ...warnings.map((warning) => `⚠ ${warning}`),
                ].join("\n");
                return (
                  <button
                    key={date}
                    type="button"
                    title={title}
                    aria-label={title.replace(/\n/g, " · ")}
                    data-calendar-day={date}
                    data-done={past && items.length ? "true" : undefined}
                    data-warning={warnings.length && (past || !entry) ? "true" : undefined}
                    disabled={!entry}
                    onClick={() => entry && onSelect(entry.position)}
                    className={`flex min-h-12 flex-col items-stretch rounded border p-0.5 text-left ${
                      isCurrent ? "ring-2 ring-primary" : ""
                    } ${entry && !entry.day.working ? "bg-muted/60" : "bg-background"} ${
                      warnings.length ? "border-red-400" : "border-border/60"
                    } ${past ? "" : "opacity-60"} disabled:cursor-default`}
                  >
                    <span className="flex items-center justify-between font-semibold">
                      {Number(date.slice(8))}
                      {warnings.length ? (
                        <AlertTriangle className="size-3 text-red-600" />
                      ) : past && items.length ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : null}
                    </span>
                    {items.slice(0, 2).map((item) => (
                      <span
                        key={item.key}
                        className="truncate rounded px-0.5 leading-3 text-white"
                        style={{ background: item.color }}
                      >
                        {past ? "✓" : ""}
                        {item.short}
                      </span>
                    ))}
                    {items.length > 2 ? (
                      <span className="text-muted-foreground">+{items.length - 2} more</span>
                    ) : null}
                    {due.map((project) => (
                      <span
                        key={`due-${project.id}`}
                        className="truncate font-bold leading-3 text-red-600"
                      >
                        Due
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
