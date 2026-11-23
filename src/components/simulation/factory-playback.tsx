"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarDays,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  X,
} from "lucide-react";
import { closureTag, type SimFactory, type SimProject, type SimResult } from "@/lib/simulation";
import { dayOffPalette } from "@/lib/schedule-calendar";
import { FactoryScene } from "./factory-scene";
import { ProductionCalendar } from "./production-calendar";

const TRUCK_DEPARTURE_MS = 2600;
const SPEEDS = [1, 3, 7, 15] as const;
/** Window event that opens or closes the production calendar ({ open }). */
export const CALENDAR_EVENT = "construction-simulation:calendar";
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
      className="flex size-8 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40"
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
  index: requestedIndex,
  setIndex: setDayIndex,
}: {
  result: SimResult;
  projects: SimProject[];
  factory: SimFactory;
  /** Playback day, shared with the charts and the Today card. */
  index: number;
  setIndex: Dispatch<SetStateAction<number>>;
}) {
  const last = Math.max(0, result.days.length - 1);
  // Open on the day the first module goes on the line: earlier days are an idle factory.
  const firstProductionIndex = Math.max(
    0,
    result.days.findIndex((item) => item.line.length > 0),
  );
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(3);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // The PDF export opens the calendar to capture it.
  useEffect(() => {
    const onRequest = (event: Event) =>
      setCalendarOpen((event as CustomEvent<{ open: boolean }>).detail.open);
    window.addEventListener(CALENDAR_EVENT, onRequest);
    return () => window.removeEventListener(CALENDAR_EVENT, onRequest);
  }, []);
  const index = Math.min(requestedIndex, last);
  const day = result.days[index];
  const stepMs = Math.round(1000 / speed);
  const palette = dayOffPalette(factory.calendar);

  const hasDepartures = day ? Object.keys(day.departures).length > 0 : false;
  useEffect(() => {
    if (!playing) return;
    const showDeparture =
      hasDepartures && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = showDeparture ? Math.max(stepMs, TRUCK_DEPARTURE_MS) : stepMs;
    const timer = window.setTimeout(() => {
      if (index >= last) setPlaying(false);
      else setDayIndex(index + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, stepMs, hasDepartures, index, last, setDayIndex]);

  if (!day) return null;
  const onLine = day.line.length;
  const lineTone =
    onLine > factory.normalMax
      ? "text-red-600"
      : onLine > factory.targetOnLine
        ? "text-amber-600"
        : "text-emerald-600";
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
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-gradient-to-b from-sky-50 to-slate-100 dark:from-slate-900 dark:to-slate-950"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background/80 px-2 py-1.5 backdrop-blur">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Day {index + 1} of {result.days.length}
          </p>
          <p data-playback-date className="text-sm font-black">
            {longDate.format(new Date(`${day.date}T00:00:00Z`))}
            {!day.working ? (
              <span
                data-playback-day-off={day.closure?.kind ?? "closed"}
                className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                style={
                  day.closure
                    ? {
                        background: palette.fill[day.closure.kind],
                        color: palette.ink[day.closure.kind],
                      }
                    : undefined
                }
              >
                Day off · {closureTag(day.closure)}
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
        {day.tight ? (
          <span
            data-playback-tight
            className="rounded bg-red-600/90 px-2 py-1 text-[11px] font-black text-white"
          >
            TIGHT LINE · {day.line.length} MODULES
          </span>
        ) : null}
      </div>

      <div className="relative order-last flex min-h-0 flex-1 flex-col bg-gradient-to-b from-sky-50 to-slate-100 p-2 dark:from-slate-900 dark:to-slate-950">
        {index < firstProductionIndex ? (
          <div
            data-line-idle
            className="absolute inset-x-0 top-1/3 z-10 mx-auto flex w-fit flex-wrap items-center gap-2 rounded-lg border bg-background/95 px-4 py-2 text-xs shadow-lg"
          >
            <span>
              Line idle · production starts{" "}
              <strong>
                {longDate.format(new Date(`${result.days[firstProductionIndex].date}T00:00:00Z`))}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setDayIndex(firstProductionIndex)}
              className="rounded-md bg-primary px-2.5 py-1 font-bold text-primary-foreground"
            >
              Jump to first module
            </button>
          </div>
        ) : null}

        <div className="mb-1 flex max-h-10 shrink-0 flex-wrap gap-1 overflow-y-auto">
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
        <FactoryScene
          day={day}
          projects={projects}
          stepMs={playing ? stepMs : 250}
          departureMs={TRUCK_DEPARTURE_MS}
          yardCapacity={factory.yardCapacity}
          palette={palette}
        />
      </div>

      <div className="grid shrink-0 gap-1 border-b bg-background/95 p-2 backdrop-blur">
        <div className="space-y-1">
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
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground"
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
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-bold hover:bg-muted"
            >
              <CalendarDays className="size-4" /> Production calendar
            </button>
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
        </div>
      </div>
      <Dialog.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[100]" />
          <Dialog.Content
            data-production-calendar-dialog
            className="liquid-glass-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-7xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none"
          >
            <div className="liquid-glass-header flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <Dialog.Title className="flex items-center gap-2 text-sm font-bold">
                  <CalendarDays className="size-4" /> Production calendar
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                  Ticks follow the playback day ({result.days[index]?.date}). Click a day to jump
                  the factory there.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close production calendar"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
              <ProductionCalendar
                result={result}
                projects={projects}
                index={index}
                palette={palette}
                onSelect={(position) => {
                  setPlaying(false);
                  setDayIndex(position);
                }}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
