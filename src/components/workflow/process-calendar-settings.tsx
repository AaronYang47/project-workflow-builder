"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { calendarDateDay, dayOffPalette, shutdownLabel } from "@/lib/schedule-calendar";
import type { ScheduleCalendar, ScheduleShutdown, ShutdownOverride } from "@/types/workflow";
import {
  annualShutdownForYear,
  defaultAnnualShutdown,
  shutdownCompanyBreak,
  shutdownYearKey,
  isPublishedSummer,
  CCQ_SHUTDOWN_SOURCE,
} from "@/lib/annual-shutdowns";
import { ontarioStatutoryHolidays } from "@/lib/ontario-holidays";

type CalendarSettingsProps = {
  value?: ScheduleCalendar;
  canEdit: boolean;
  workingDays: number;
  onSave: (value: ScheduleCalendar | undefined) => void;
  /** The Technical handoff the schedule works out from the Project Start Date. */
  handoffDate?: string;
  /** "factory": the L5 factory calendar; its start date is the simulation start. */
  mode?: "project" | "factory";
};

/** "Project start … · Technical handoff …" for the button title and the saved status. */
function calendarSummary(value: ScheduleCalendar, handoffDate?: string) {
  if (!value.projectStartDate) return `Calendar · Technical handoff ${value.startDate}`;
  return `Calendar · Project start ${value.projectStartDate} · Technical handoff ${handoffDate || "after Sales durations are set"}`;
}

export function ProcessCalendarButton(props: CalendarSettingsProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={props.mode === "factory" ? "Factory calendar years" : "Calendar"}
          title={
            props.value ? calendarSummary(props.value, props.handoffDate) : "Set schedule calendar"
          }
          className="inline-flex items-center gap-1.5 rounded-lg border bg-panel px-3 py-2 font-semibold hover:bg-muted"
        >
          <CalendarDays className="size-3.5" />
          {props.mode === "factory" ? "Customize years…" : "Calendar"}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[100]" />
        <Dialog.Content className="liquid-glass-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none">
          <div className="liquid-glass-header flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-sm font-bold">
                <CalendarDays className="size-4" />
                Calendar
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {props.mode === "factory"
                  ? "Factory working days: annual shutdowns (including one-off years), working week and statutory holidays."
                  : "Set the start date, annual shutdowns, working week and statutory holidays."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close Calendar"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <ProcessCalendarSettings
              key={JSON.stringify(props.value ?? null)}
              {...props}
              onSave={(value) => {
                props.onSave(value);
                setOpen(false);
              }}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ProcessCalendarSettings({
  value,
  canEdit,
  workingDays,
  onSave,
  mode = "project",
  handoffDate,
}: CalendarSettingsProps) {
  const startLabel = "Technical handoff date";
  const projectStartLabel = "Project Start Date";
  const [projectStartDate, setProjectStartDate] = useState(value?.projectStartDate ?? "");
  const hasProjectStart = mode === "project" && calendarDateDay(projectStartDate) !== null;
  const [handoffInput, setStartDate] = useState(value?.startDate ?? "");
  // With a Project Start Date, dates count from it; the handoff date only fills the required field.
  const startDate = hasProjectStart ? projectStartDate : handoffInput;
  const shutdowns = value?.shutdowns ?? [];
  const [shutdownOverrides, setShutdownOverrides] = useState<Record<string, ShutdownOverride>>(
    value?.shutdownOverrides ?? {},
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [yearInput, setYearInput] = useState(
    (value?.projectStartDate ?? value?.startDate)?.slice(0, 4) ?? String(new Date().getFullYear()),
  );
  const [editing, setEditing] = useState<Partial<Record<ScheduleShutdown["kind"], boolean>>>({});
  const [fourDayWeek, setFourDayWeek] = useState(value?.workWeek === "mon-thu" || !value);
  const [error, setError] = useState("");
  const [includeOntario, setIncludeOntario] = useState(
    value ? value.holidayRegion === "CA-ON" : true,
  );
  const [holidayOverrides, setHolidayOverrides] = useState<Record<string, string | null>>(
    value?.holidayOverrides ?? {},
  );
  const [dayOffColors, setDayOffColors] = useState<NonNullable<ScheduleCalendar["dayOffColors"]>>(
    value?.dayOffColors ?? {},
  );
  const palette = dayOffPalette({ dayOffColors });
  const shutdownDays = shutdowns.reduce((sum, period) => {
    const start = calendarDateDay(period.startDate),
      end = calendarDateDay(period.endDate);
    return sum + (start !== null && end !== null ? Math.max(0, end - start + 1) : 0);
  }, 0);
  const holidayYears =
    calendarDateDay(startDate) === null
      ? []
      : Array.from(
          { length: Math.ceil((workingDays + shutdownDays) / (fourDayWeek ? 140 : 250)) + 2 },
          (_, index) => Number(startDate.slice(0, 4)) + index,
        ).filter((year) => year <= 9999);
  const holidays = holidayYears.flatMap(ontarioStatutoryHolidays);
  const selectedYear = Number(yearInput);
  const validYear = Number.isInteger(selectedYear) && selectedYear >= 1900 && selectedYear <= 9998;
  const previewYear = validYear
    ? selectedYear
    : Math.min(9998, Math.max(1900, Number(startDate.slice(0, 4)) || new Date().getFullYear()));
  const draft: ScheduleCalendar = {
    startDate: calendarDateDay(handoffInput) !== null ? handoffInput : startDate,
    ...(hasProjectStart ? { projectStartDate } : {}),
    shutdowns,
    automaticShutdowns: true,
    shutdownOverrides,
    ...(fourDayWeek ? { workWeek: "mon-thu" } : {}),
    ...(includeOntario ? { holidayRegion: "CA-ON", holidayOverrides } : {}),
    ...(Object.keys(dayOffColors).length ? { dayOffColors } : {}),
  };
  const setOverride = (kind: ScheduleShutdown["kind"], override: ShutdownOverride) =>
    setShutdownOverrides((current) => ({
      ...current,
      [shutdownYearKey(kind, previewYear)]: override,
    }));
  return (
    <form
      aria-label="Schedule calendar"
      className="p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) return;
        if (calendarDateDay(startDate) === null) {
          setError(`Choose a valid ${projectStartLabel} or ${startLabel}.`);
          return;
        }
        if (
          Object.entries(shutdownOverrides).some(
            ([key, override]) =>
              override &&
              override !== "automatic" &&
              (calendarDateDay(override.startDate) === null ||
                calendarDateDay(override.endDate) === null ||
                override.endDate < override.startDate ||
                override.startDate.slice(0, 4) !== key.slice(-4)),
          )
        ) {
          setError(
            "Each custom shutdown needs valid start and end dates. Start in its selected year; the end cannot be before the start.",
          );
          return;
        }
        if (
          includeOntario &&
          Object.values(holidayOverrides).some(
            (date) => date !== null && calendarDateDay(date) === null,
          )
        ) {
          setError("Enter a valid date for each statutory holiday.");
          return;
        }
        setError("");
        onSave(draft);
      }}
    >
      <p className="mt-1 text-xs text-muted-foreground">
        {mode === "factory"
          ? "The factory line only moves on working days. "
          : "Project Start Date is the day Sales starts work; the Technical handoff (M1) follows from the Sales step durations. Without it, the Technical handoff date anchors the schedule. Total task durations include all days off: 1 week = 7 calendar days. Grey days are deducted to show actual working days; task durations do not expand. "}
        {fourDayWeek
          ? "Work Monday–Thursday; Friday–Sunday are non-working days."
          : "No weekly days off selected."}
      </p>
      <fieldset disabled={!canEdit} className="mt-4 space-y-3 disabled:opacity-60">
        {mode === "project" ? (
          <label className="block max-w-xs text-xs font-semibold">
            {projectStartLabel}{" "}
            <span className="font-normal text-muted-foreground">· Sales starts work</span>
            <input
              type="date"
              aria-label={projectStartLabel}
              value={projectStartDate}
              onChange={(event) => {
                setProjectStartDate(event.target.value);
                if (calendarDateDay(event.target.value) !== null) {
                  setYearInput(event.target.value.slice(0, 4));
                  setEditing({});
                }
              }}
              className="mt-1 block min-h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </label>
        ) : null}
        {mode === "project" && hasProjectStart ? (
          <p data-calculated-handoff className="max-w-md text-xs">
            <strong>{startLabel}:</strong>{" "}
            {handoffDate && value?.projectStartDate === projectStartDate
              ? `${handoffDate} (calculated from the Sales step durations)`
              : "calculated from the Sales step durations after you save"}
          </p>
        ) : null}
        {mode === "project" && !hasProjectStart ? (
          <label className="block max-w-xs text-xs font-semibold">
            {startLabel}
            <input
              type="date"
              aria-label={startLabel}
              value={handoffInput}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (calendarDateDay(event.target.value) !== null) {
                  setYearInput(event.target.value.slice(0, 4));
                  setEditing({});
                }
              }}
              className="mt-1 block min-h-10 w-full rounded-md border bg-background px-3 text-sm"
            />
          </label>
        ) : null}
        <label className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs font-semibold">
          <input
            type="checkbox"
            checked={fourDayWeek}
            onChange={(event) => setFourDayWeek(event.target.checked)}
          />
          Work Monday–Thursday · Friday–Sunday weekend
        </label>
        <div data-day-off-colors className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs">Gantt bar colours</strong>
            {Object.keys(dayOffColors).length ? (
              <button
                type="button"
                onClick={() => setDayOffColors({})}
                className="min-h-8 rounded-md border px-2.5 text-xs font-semibold"
              >
                Reset colours
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Colours for days off inside each Gantt bar, its tags, the task calendar and the PDF
            calendar.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["weekend", "Weekend"],
                ["statutory", "Stats"],
                ["shutdown", "Shutdown"],
              ] as const
            ).map(([kind, label]) => (
              <label
                key={kind}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 text-xs font-semibold"
              >
                <input
                  type="color"
                  aria-label={`${label} colour`}
                  value={palette.fill[kind]}
                  onChange={(event) =>
                    setDayOffColors((current) => ({ ...current, [kind]: event.target.value }))
                  }
                  className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: palette.fill[kind], color: palette.ink[kind] }}
                >
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs">Automatic annual shutdowns</strong>
            <button
              type="button"
              aria-expanded={customOpen}
              onClick={() => setCustomOpen((open) => !open)}
              className="min-h-9 rounded-md border px-3 text-xs font-semibold"
            >
              Customize a year
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Summer follows published Québec construction vacation dates; later years are
            automatically projected. Winter starts on the first Monday of December’s final two weeks
            and ends January 1 inclusive. Work resumes after weekends and statutory holidays.
          </p>
          <a
            href={CCQ_SHUTDOWN_SOURCE}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-primary underline"
          >
            CCQ summer shutdown source
          </a>
          {customOpen && (
            <label className="block max-w-40 text-xs font-semibold">
              Shutdown year
              <input
                type="number"
                min="1900"
                max="9998"
                step="1"
                list="shutdown-years"
                aria-label="Shutdown year"
                value={yearInput}
                onChange={(event) => {
                  setYearInput(event.target.value);
                  setEditing({});
                }}
                className="mt-1 block min-h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
              <datalist id="shutdown-years">
                {Array.from(
                  { length: 21 },
                  (_, index) => Number(startDate.slice(0, 4)) || new Date().getFullYear(),
                ).map((year, index) => (
                  <option key={year + index} value={year + index} />
                ))}
              </datalist>
            </label>
          )}
          {customOpen && !validYear && (
            <p role="alert" className="text-xs text-destructive">
              Choose a year from 1900 to 9998.
            </p>
          )}
          {(["summer", "winter"] as const).map((kind) => {
            const key = shutdownYearKey(kind, previewYear),
              override = shutdownOverrides[key];
            const periods = annualShutdownForYear(draft, kind, previewYear);
            const period = periods[0] ?? defaultAnnualShutdown(kind, previewYear);
            const custom =
              (override && override !== "automatic") ||
              (override === undefined &&
                shutdowns.some(
                  (item) =>
                    item.kind === kind && item.startDate.slice(0, 4) === String(previewYear),
                ));
            const status =
              override === null
                ? "Cancelled"
                : custom
                  ? "Custom"
                  : kind === "summer"
                    ? isPublishedSummer(previewYear)
                      ? "CCQ published"
                      : "Projected"
                    : "Company winter rule";
            return (
              <div
                key={kind}
                data-annual-shutdown={key}
                className="space-y-2 rounded-md border bg-background p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs">
                    {shutdownLabel(kind)} · {previewYear}
                  </strong>
                  <span className="text-xs text-muted-foreground">{status}</span>
                </div>
                {override === null ? (
                  <p className="text-xs text-muted-foreground">
                    No {kind} shutdown for {previewYear}. Weekends and statutory holidays still
                    apply.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {periods.map((item) => {
                      const companyBreak =
                        calendarDateDay(item.startDate) !== null &&
                        calendarDateDay(item.endDate) !== null &&
                        item.endDate >= item.startDate
                          ? shutdownCompanyBreak(draft, item)
                          : { startDate: "pending", endDate: "pending", resumes: "" };
                      return (
                        <div key={item.id} className="space-y-2">
                          <dl className="grid gap-2 text-xs sm:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">Shutdown starts</dt>
                              <dd className="font-semibold">{item.startDate}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Shutdown ends (inclusive)</dt>
                              <dd className="font-semibold">{item.endDate}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Work resumes</dt>
                              <dd className="font-semibold">
                                {companyBreak.resumes || "Pending calendar dates"}
                              </dd>
                            </div>
                          </dl>
                          <p className="text-xs text-muted-foreground">
                            Company break including weekends / holidays:{" "}
                            <strong>
                              {companyBreak.startDate} – {companyBreak.endDate || "pending"}
                            </strong>{" "}
                            (inclusive).
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {customOpen && validYear && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-label={`Edit ${shutdownLabel(kind)} ${previewYear}`}
                      onClick={() => {
                        setOverride(kind, { startDate: period.startDate, endDate: period.endDate });
                        setEditing((current) => ({ ...current, [kind]: true }));
                      }}
                      className="min-h-9 rounded-md border px-3 text-xs"
                    >
                      Edit dates
                    </button>
                    <button
                      type="button"
                      aria-label={`Cancel ${shutdownLabel(kind)} ${previewYear}`}
                      onClick={() => {
                        setOverride(kind, null);
                        setEditing((current) => ({ ...current, [kind]: false }));
                      }}
                      className="min-h-9 rounded-md border px-3 text-xs"
                    >
                      Cancel this year
                    </button>
                    <button
                      type="button"
                      aria-label={`Reset ${shutdownLabel(kind)} ${previewYear}`}
                      onClick={() => {
                        setOverride(kind, "automatic");
                        setEditing((current) => ({ ...current, [kind]: false }));
                      }}
                      className="min-h-9 rounded-md border px-3 text-xs"
                    >
                      Use automatic dates
                    </button>
                  </div>
                )}
                {customOpen &&
                  validYear &&
                  editing[kind] &&
                  override &&
                  override !== "automatic" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs">
                        Start date
                        <input
                          type="date"
                          aria-label={`${shutdownLabel(kind)} ${previewYear} start date`}
                          min={`${previewYear}-01-01`}
                          max={`${previewYear}-12-31`}
                          value={override.startDate}
                          onChange={(event) =>
                            setOverride(kind, { ...override, startDate: event.target.value })
                          }
                          className="mt-1 block min-h-10 w-full rounded-md border bg-panel px-3 text-sm"
                        />
                      </label>
                      <label className="text-xs">
                        End date (inclusive)
                        <input
                          type="date"
                          aria-label={`${shutdownLabel(kind)} ${previewYear} end date`}
                          min={override.startDate}
                          value={override.endDate}
                          onChange={(event) =>
                            setOverride(kind, { ...override, endDate: event.target.value })
                          }
                          className="mt-1 block min-h-10 w-full rounded-md border bg-panel px-3 text-sm"
                        />
                      </label>
                    </div>
                  )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Dates generate for every year the schedule reaches. Changes and cancellations affect
            only the selected season/year; “Use automatic dates” restores that year. Previously
            saved shutdowns are retained as custom dates for their year.
          </p>
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          <label className="flex min-h-8 items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={includeOntario}
              onChange={(event) => setIncludeOntario(event.target.checked)}
            />
            Include Ontario statutory holidays
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Automatically pauses work for the 9 Ontario statutory holidays each year. Dates shared
            with a shutdown count once. Uses statutory dates; adjust below for company substitute
            days.
          </p>
          <a
            href="https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-primary underline"
          >
            Ontario holiday source
          </a>
          {includeOntario && holidays.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold">
                Review / adjust holiday dates ({holidayYears.join(", ")})
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="rounded-md border bg-background p-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        aria-label={`Include ${holiday.name} ${holiday.date.slice(0, 4)}`}
                        checked={holidayOverrides[holiday.id] !== null}
                        onChange={(event) =>
                          setHolidayOverrides((current) => ({
                            ...current,
                            [holiday.id]: event.target.checked ? holiday.date : null,
                          }))
                        }
                      />
                      {holiday.name} · {holiday.date.slice(0, 4)}
                    </label>
                    {holidayOverrides[holiday.id] !== null && (
                      <input
                        type="date"
                        aria-label={`${holiday.name} ${holiday.date.slice(0, 4)} date`}
                        value={holidayOverrides[holiday.id] ?? holiday.date}
                        onChange={(event) =>
                          setHolidayOverrides((current) => ({
                            ...current,
                            [holiday.id]: event.target.value,
                          }))
                        }
                        className="mt-1 block min-h-10 w-full rounded-md border bg-panel px-2 text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setHolidayOverrides({})}
                className="mt-2 min-h-9 rounded-md border px-3 text-xs"
              >
                Reset Ontario holiday dates
              </button>
            </details>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="min-h-10 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            Apply calendar
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onSave(undefined)}
              className="min-h-10 rounded-md border px-3 text-xs"
            >
              Use relative weeks / months
            </button>
          )}
          <span role="status" className="text-xs text-muted-foreground">
            {value
              ? `Saved · ${calendarSummary(value, handoffDate).replace(/^Calendar · /, "")}`
              : "No calendar set · showing relative weeks / months"}
          </span>
        </div>
      </fieldset>
    </form>
  );
}
