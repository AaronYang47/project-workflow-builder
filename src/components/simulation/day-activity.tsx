"use client";

import type { SimProject, SimResult } from "@/lib/simulation";

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
  if (!day) return null;
  const nameOf = new Map(projects.map((project) => [project.id, project]));
  const recentEvents = result.days
    .slice(0, index + 1)
    .flatMap((item) => item.events.map((event) => ({ date: item.date, event })))
    .slice(-8)
    .reverse();
  return (
    <section
      aria-label="Today"
      data-day-activity
      className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-2"
    >
      <div className="space-y-1.5">
        <p className="text-xs font-bold">Events up to {day.date}</p>
        <ol aria-label="Events" className="space-y-0.5 text-[11px]">
          {recentEvents.length ? (
            recentEvents.map((item, position) => (
              <li
                key={`${item.date}-${item.event}-${position}`}
                className={position === 0 ? "font-semibold" : "text-muted-foreground"}
              >
                <span className="mr-2 font-mono text-[10px] text-muted-foreground">
                  {item.date}
                </span>
                {item.event}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">Press Play to start the factory.</li>
          )}
        </ol>
      </div>
      <div aria-label="Sites" className="space-y-1.5">
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
