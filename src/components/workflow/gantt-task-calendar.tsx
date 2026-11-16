"use client";

import { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, X } from "lucide-react";
import { DAY_OFF_COLORS, DAY_OFF_INK, type CalendarPause } from "@/lib/schedule-calendar";
import type { CalendarBadge, CalendarSummary } from "@/lib/calendar-badges";
import { CalendarTags } from "./calendar-tags";

const DAY_MS = 86_400_000;
const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const priority = ["winter", "summer", "statutory", "weekend"] as const;
const dayStyles = {
  work: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  winter: "", summer: "", statutory: "", weekend: "",
};
// Day-off fills are shared with the Gantt bars, tags and PDF calendar.
const dayOffStyle = { winter: "shutdown", summer: "shutdown", statutory: "statutory", weekend: "weekend" } as const;
const dayCodes = { work: "", winter: "WINTER", summer: "SUMMER", statutory: "STATS", weekend: "OFF" };
export type TaskCalendarValue = {
  key: string; title: string; department: string; color: string;
  startDate: string; endDate: string; summary: CalendarSummary;
  periods: CalendarPause[]; badges: CalendarBadge[];
};

export function GanttTaskCalendar({ value, onDismiss, onRestoreFocus }: { value: TaskCalendarValue; onDismiss: () => void; onRestoreFocus: () => void }) {
  const first = new Date(`${value.startDate}T00:00:00Z`), last = new Date(`${value.endDate}T00:00:00Z`);
  const firstMonth = first.getUTCFullYear() * 12 + first.getUTCMonth();
  const lastMonth = last.getUTCFullYear() * 12 + last.getUTCMonth();
  const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => firstMonth + index);
  const startDay = first.getTime() / DAY_MS, endDay = last.getTime() / DAY_MS;
  const closedDates = useMemo(() => {
    const dates = new Map<number, CalendarPause[]>();
    const start = Date.parse(`${value.startDate}T00:00:00Z`) / DAY_MS, end = Date.parse(`${value.endDate}T00:00:00Z`) / DAY_MS;
    for (const period of value.periods) {
      const from = Math.max(start, Date.parse(`${period.startDate}T00:00:00Z`) / DAY_MS), to = Math.min(end, Date.parse(`${period.endDate}T00:00:00Z`) / DAY_MS);
      for (let day = from; day <= to; day += 1) dates.set(day, [...(dates.get(day) ?? []), period]);
    }
    return dates;
  }, [value.startDate, value.endDate, value.periods]);
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/20 backdrop-blur-[3px]" />
      <Dialog.Content data-task-calendar aria-label="Task calendar" className="fixed left-1/2 top-1/2 z-[111] flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-[1500px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/40 bg-background/80 text-foreground shadow-2xl backdrop-blur-2xl outline-none" style={{ width: `min(calc(100vw - 2rem), ${Math.min(1500, Math.max(640, months.length * 286 + 48))}px)` }} onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}>
        <header className="shrink-0 border-b bg-panel/40 px-5 py-4 sm:px-6" style={{ borderTop: `4px solid ${value.color}` }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground"><CalendarDays className="size-4" />Task production calendar</p><Dialog.Title className="text-lg font-bold leading-snug sm:text-2xl">{value.title}</Dialog.Title><Dialog.Description className="mt-2 text-xs text-muted-foreground">{value.department} · {value.startDate} – {value.endDate} (inclusive) · {value.summary.totalDays} calendar days · {months.length} months</Dialog.Description></div>
            <Dialog.Close asChild><button type="button" aria-label="Close task calendar" className="flex size-10 shrink-0 items-center justify-center rounded-xl border hover:bg-muted"><X className="size-5" /></button></Dialog.Close>
          </div>
          <div className="mt-4"><CalendarTags badges={value.badges} /></div>
          <p className="mt-2 text-[10px] text-muted-foreground">OFF is the total of stats, shutdown and weekend deductions. Overlapping dates count once. Shutdown takes priority, then stats, then weekends.</p>
        </header>
        <div className="min-h-0 overflow-auto p-4 sm:p-6" role="region" aria-label="All months in this task bar" data-calendar-months>
          <div className="mx-auto flex w-max gap-4">
            {months.map((monthId) => {
              const year = Math.floor(monthId / 12), month = monthId % 12, monthStart = Date.UTC(year, month, 1) / DAY_MS;
              const offset = (new Date(monthStart * DAY_MS).getUTCDay() + 6) % 7;
              return <section key={monthId} data-calendar-month={`${year}-${String(month + 1).padStart(2, "0")}`} className="w-[270px] shrink-0 overflow-hidden rounded-xl border border-white/30 bg-panel/40 p-3 sm:p-4">
                <h3 className="mb-3 text-sm font-bold">{monthName.format(new Date(monthStart * DAY_MS))}</h3>
                <div role="grid" aria-label={monthName.format(new Date(monthStart * DAY_MS))}>
                  <div role="row" className="mb-1 grid grid-cols-7 gap-1">{weekdays.map((name) => <span role="columnheader" key={name} className="text-center text-[10px] text-muted-foreground">{name}</span>)}</div>
                  {Array.from({ length: 6 }, (_, week) => <div role="row" key={week} className="grid grid-cols-7 gap-1 py-0.5">{Array.from({ length: 7 }, (_, weekday) => {
                    const day = monthStart - offset + week * 7 + weekday, date = new Date(day * DAY_MS), inMonth = date.getUTCMonth() === month;
                    const inTask = inMonth && day >= startDay && day <= endDay, closures = inTask ? closedDates.get(day) ?? [] : [];
                    const kind = priority.find((kind) => closures.some((period) => period.kind === kind)) ?? "work";
                    const description = inTask ? closures.length ? [...new Set(closures.map((period) => period.label))].join(" / ") : "Working day" : "Outside this task";
                    return <span key={day} role="gridcell" data-calendar-date={inMonth ? iso(day) : undefined} data-in-task={inTask ? "true" : undefined} data-day-off={inTask && kind !== "work" ? kind : undefined} aria-label={`${iso(day)} · ${description}`} title={`${iso(day)} · ${description}`} className={`flex h-10 flex-col items-center justify-center rounded-lg text-xs leading-4 ${inTask ? dayStyles[kind] : "text-muted-foreground/30"}`} style={inTask && kind !== "work" ? { background: DAY_OFF_COLORS[dayOffStyle[kind]], color: DAY_OFF_INK[dayOffStyle[kind]] } : undefined}><span className="font-semibold">{inMonth ? date.getUTCDate() : ""}</span>{inTask && dayCodes[kind] && <span aria-hidden="true" className="text-[6px] font-bold leading-2 sm:text-[7px]">{dayCodes[kind]}</span>}</span>;
                  })}</div>)}
                </div>
              </section>;
            })}
          </div>
        </div>
        <footer className="shrink-0 border-t bg-panel/40 px-5 py-3 text-[11px] text-muted-foreground sm:px-8"><strong className="text-foreground">{value.summary.formula}</strong><span className="ml-3">1W = 7 calendar days. Dates outside the task are muted.</span></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
