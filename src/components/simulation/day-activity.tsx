"use client";

import { useEffect, useRef } from "react";
import type { SimProject, SimResult } from "@/lib/simulation";

type EventRow = { event: string; from: string; to: string; count: number };

/** Every event up to `index`, newest first; repeats on consecutive event days merge into one row. */
export function eventRows(result: SimResult, index: number): EventRow[] {
  const rows: EventRow[] = [];
  for (const day of result.days.slice(0, index + 1)) {
    for (const event of day.events) {
      const last = rows.at(-1);
      if (last && last.event === event) {
        last.to = day.date;
        last.count += 1;
      } else rows.push({ event, from: day.date, to: day.date, count: 1 });
    }
  }
  return rows.reverse();
}

/**
 * "Today" on the playback day: the latest events and each site's delivery
 * and installation progress.
 */
export function DayActivity({
  result,
  projects,
  index,
}: {
  result: SimResult;
  projects: SimProject[];
  index: number;
}) {
  const day = result.days[Math.min(index, result.days.length - 1)];
  const list = useRef<HTMLOListElement>(null);
  // The newest event is at the top: bring it back into view as the day moves.
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [index]);
  if (!day) return null;
  const nameOf = new Map(projects.map((project) => [project.id, project]));
  const rows = eventRows(result, index);
  return (
    <section
      aria-label="Today"
      data-day-activity
      className="grid shrink-0 grid-cols-2 gap-2 rounded-lg border bg-background p-2"
    >
      <div className="space-y-1.5">
        <p className="text-xs font-bold">
          Events up to {day.date}
          <span className="ml-2 font-normal text-muted-foreground">newest first</span>
        </p>
        <ol
          ref={list}
          aria-label="Events"
          data-event-list
          className="scroll-thin max-h-[clamp(2.5rem,8dvh,5rem)] space-y-0.5 overflow-y-auto pr-1 text-[11px]"
        >
          {rows.length ? (
            rows.map((item, position) => (
              <li
                key={`${item.from}-${item.event}-${position}`}
                className={position === 0 ? "font-semibold" : "text-muted-foreground"}
              >
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">
                  {item.count > 1 ? `${item.from} – ${item.to}` : item.from}
                </span>
                {item.event}
                {item.count > 1 ? (
                  <span className="ml-1 rounded bg-muted px-1 text-[10px]">×{item.count}</span>
                ) : null}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">Press Play to start the factory.</li>
          )}
        </ol>
      </div>
      <div
        aria-label="Sites"
        className="max-h-[clamp(3.75rem,11dvh,6.125rem)] space-y-1.5 overflow-y-auto overscroll-contain"
      >
        <p className="text-xs font-bold">Sites</p>
        {Object.entries(day.sites).length ? (
          Object.entries(day.sites).map(([projectId, site]) => {
            const project = nameOf.get(projectId);
            const installing = day.installing.includes(projectId);
            return (
              <div key={projectId} data-site={projectId} className="rounded-md border p-2">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="truncate">{project?.name}</span>
                  <span className={installing ? "text-emerald-600" : "text-muted-foreground"}>
                    {site.installed === site.modules
                      ? "Done"
                      : installing
                        ? "Installing"
                        : site.arrived
                          ? "Waiting for crew"
                          : "Not started"}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full"
                    style={{
                      width: `${(site.installed / Math.max(1, site.modules)) * 100}%`,
                      background: project?.color,
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {site.arrived}/{site.modules} delivered · {site.installed} installed
                </p>
              </div>
            );
          })
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No ship-and-install projects. FOB yard projects are collected at the yard.
          </p>
        )}
      </div>
    </section>
  );
}
