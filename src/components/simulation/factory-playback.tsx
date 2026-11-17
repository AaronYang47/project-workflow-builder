"use client";

import { useEffect, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import type { SimFactory, SimProject, SimResult } from "@/lib/simulation";
import { FactoryScene } from "./factory-scene";

const SPEEDS = [1, 3, 7, 15] as const;
const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function ControlButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-9 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Day-by-day playback of the simulated factory, like a management game. */
export function FactoryPlayback({
  result,
  projects,
  factory,
}: {
  result: SimResult;
  projects: SimProject[];
  factory: SimFactory;
}) {
  const last = Math.max(0, result.days.length - 1);
  const [requestedIndex, setDayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(3);
  const index = Math.min(requestedIndex, last);
  const day = result.days[index];
  const stepMs = Math.round(1000 / speed);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setDayIndex((current) => {
        if (current >= last) {
          queueMicrotask(() => setPlaying(false));
          return last;
        }
        return current + 1;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [playing, stepMs, last]);

  if (!day) return null;
  const onLine = day.line.length;
  const lineTone =
    onLine > factory.normalMax
      ? "text-red-600"
      : onLine > factory.targetOnLine
        ? "text-amber-600"
        : "text-emerald-600";
  const nameOf = new Map(projects.map((project) => [project.id, project]));
  const recentEvents = result.days
    .slice(0, index + 1)
    .flatMap((item) => item.events.map((event) => ({ date: item.date, event })))
    .slice(-6)
    .reverse();
  const paceWeeks =
    day.paceDays && factory.calendar?.workWeek === "mon-thu"
      ? day.paceDays / 4
      : day.paceDays
        ? day.paceDays / 7
        : 0;

  return (
    <section
      aria-label="Factory playback"
      data-factory-playback
      className="overflow-hidden rounded-xl border bg-gradient-to-b from-sky-50 to-slate-100 dark:from-slate-900 dark:to-slate-950"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/80 px-3 py-2 backdrop-blur">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Day {index + 1} of {result.days.length}
          </p>
          <p data-playback-date className="text-sm font-black">
            {longDate.format(new Date(`${day.date}T00:00:00Z`))}
            {!day.working ? (
              <span className="ml-2 rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                FACTORY CLOSED
              </span>
            ) : null}
          </p>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">On the line </span>
          <strong data-playback-on-line className={lineTone}>
            {onLine}
          </strong>
          <span className="text-muted-foreground"> / {factory.targetOnLine}</span>
        </div>
        <div className="text-xs">
          <span className="text-muted-foreground">Yard </span>
          <strong className={day.yardTotal >= factory.yardCapacity ? "text-red-600" : ""}>
            {day.yardTotal}
          </strong>
          <span className="text-muted-foreground"> / {factory.yardCapacity}</span>
        </div>
        {paceWeeks ? (
          <div className="text-xs text-muted-foreground">
            Pace <strong className="text-foreground">{paceWeeks.toFixed(1)} weeks</strong> per
            module
          </div>
        ) : null}
        {day.blocked ? (
          <span className="animate-pulse rounded bg-red-600 px-2 py-1 text-[11px] font-black text-white">
            LINE STOPPED · YARD FULL
          </span>
        ) : null}
      </div>

      <div className="relative px-2 pt-2">
        <FactoryScene
          day={day}
          projects={projects}
          stepMs={playing ? stepMs : 250}
          yardCapacity={factory.yardCapacity}
        />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          {projects.map((project) => (
            <span
              key={project.id}
              className="flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold shadow-sm"
            >
              <i className="size-2.5 rounded-sm" style={{ background: project.color }} />
              {project.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-t bg-background/80 p-3 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <ControlButton label="Back to start" onClick={() => setDayIndex(0)}>
              <SkipBack className="size-4" />
            </ControlButton>
            <ControlButton
              label="Previous day"
              onClick={() => setDayIndex(Math.max(0, index - 1))}
              disabled={index === 0}
            >
              <StepBack className="size-4" />
            </ControlButton>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                if (!playing && index >= last) setDayIndex(0);
                setPlaying(!playing);
              }}
              className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? "Pause" : "Play"}
            </button>
            <ControlButton
              label="Next day"
              onClick={() => setDayIndex(Math.min(last, index + 1))}
              disabled={index >= last}
            >
              <StepForward className="size-4" />
            </ControlButton>
            <ControlButton label="Jump to end" onClick={() => setDayIndex(last)}>
              <SkipForward className="size-4" />
            </ControlButton>
            <div role="radiogroup" aria-label="Speed" className="ml-2 flex rounded-md border p-0.5">
              {SPEEDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={speed === value}
                  onClick={() => setSpeed(value)}
                  className={`rounded px-2 py-1 text-[11px] font-bold ${speed === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {value} d/s
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            aria-label="Simulation day"
            min={0}
            max={last}
            value={index}
            onChange={(event) => {
              setPlaying(false);
              setDayIndex(Number(event.target.value));
            }}
            className="w-full accent-primary"
          />
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
          <p className="text-[11px] font-bold">Sites</p>
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
      </div>
    </section>
  );
}
