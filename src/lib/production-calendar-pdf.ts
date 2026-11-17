import type { jsPDF } from "jspdf";
import type { WorkflowFile } from "@/types/workflow";
import { buildProcessSchedule } from "@/lib/process-schedule";
import { buildProcessTimeline, DAY_OFF_COLORS, DAY_OFF_INK, splitCalendarTask } from "@/lib/schedule-calendar";
import { calendarWorkSummary } from "@/lib/gantt-bar-label";
import { calendarSummaryBadges, calendarTextHtml } from "@/lib/calendar-badges";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import { escapeHtml as escape } from "@/lib/html";
import { DAY_MS, isoFromDay as iso, monthYearFormat as monthName } from "@/lib/calendar-date";

const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const priority = ["winter", "summer", "statutory", "weekend"] as const;
const serial = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const codes = { winter: "SD", summer: "SD", statutory: "H", weekend: "OFF", work: "" };
// Day-off fills are shared with the Gantt bars and their labels.
const colors = { winter: [DAY_OFF_COLORS.shutdown, DAY_OFF_INK.shutdown], summer: [DAY_OFF_COLORS.shutdown, DAY_OFF_INK.shutdown], statutory: [DAY_OFF_COLORS.statutory, DAY_OFF_INK.statutory], weekend: [DAY_OFF_COLORS.weekend, DAY_OFF_INK.weekend], work: ["#f0fdf4", "#166534"] };

/** A project-wide calendar uses unique dates, never a sum of overlapping tasks.
 * Up to 24 months fit one 11x17 sheet; longer projects continue on equal-size sheets. */
export function productionCalendarPageHtml(file: WorkflowFile): string[] {
  const schedule = buildProcessSchedule(file), timeline = buildProcessTimeline(file, schedule);
  const tasks = schedule.tasks.filter((task) => task.start !== undefined && task.end !== undefined);
  const name = file.graph.metadata.name || "Project workflow", job = workflowLegacyJobNumber(file) || "PROJECT";
  const start = Math.min(...tasks.map((task) => task.start!)), end = Math.max(...tasks.map((task) => task.end!));
  const enabled = timeline.enabled && tasks.length > 0;
  const startDate = enabled ? timeline.dateAt(start) : "", endDate = enabled ? timeline.dateAt(end - 1) : "";
  const first = enabled ? new Date(`${startDate}T00:00:00Z`) : null, last = enabled ? new Date(`${endDate}T00:00:00Z`) : null;
  const firstMonth = first ? first.getUTCFullYear() * 12 + first.getUTCMonth() : 0, lastMonth = last ? last.getUTCFullYear() * 12 + last.getUTCMonth() : -1;
  const months = Array.from({ length: Math.max(0, lastMonth - firstMonth + 1) }, (_, index) => firstMonth + index);
  const summary = calendarWorkSummary(enabled ? end - start : 0, enabled ? splitCalendarTask(start, end, timeline.nonWorkingPeriods).filter((part) => part.kind === "pause") : []);
  const departments = schedule.departments.filter((department) => department.tasks.some((task) => task.start !== undefined)).map((department) => ({ ...department, color: department.tasks.find((task) => task.start !== undefined)!.color }));
  const active = new Map<string, typeof departments>();
  for (const department of departments) {
    const dates = new Set<string>();
    for (const task of department.tasks) if (task.start !== undefined && task.end !== undefined) {
      for (let day = task.start; day < task.end; day += 1) dates.add(timeline.dateAt(day));
    }
    for (const date of dates) active.set(date, [...(active.get(date) ?? []), department]);
  }
  const periods = timeline.nonWorkingPeriods.map((period) => ({ ...period, from: serial(period.startDate), to: serial(period.endDate) }));
  const chunks = months.length ? Array.from({ length: Math.ceil(months.length / 24) }, (_, index) => months.slice(index * 24, (index + 1) * 24)) : [[]];
  return chunks.map((chunk, sheet) => {
    const columns = chunk.length <= 2 ? chunk.length || 1 : chunk.length <= 6 ? 3 : chunk.length <= 12 ? 4 : chunk.length <= 18 ? 6 : 8;
    const rows = Math.max(1, Math.ceil(chunk.length / columns));
    const monthHtml = chunk.map((monthId) => {
      const year = Math.floor(monthId / 12), month = monthId % 12, monthStart = Date.UTC(year, month, 1) / DAY_MS;
      const offset = (new Date(monthStart * DAY_MS).getUTCDay() + 6) % 7;
      const cells = Array.from({ length: 42 }, (_, index) => {
        const day = monthStart - offset + index, date = new Date(day * DAY_MS), inMonth = date.getUTCMonth() === month;
        const inside = inMonth && day >= serial(startDate) && day <= serial(endDate);
        const closed = inside ? periods.filter((period) => period.from <= day && day <= period.to) : [];
        const kind = priority.find((kind) => closed.some((period) => period.kind === kind)) ?? "work";
        const owners = inside ? active.get(iso(day)) ?? [] : [];
        const [bg, fg] = inside ? colors[kind] : ["#ffffff", "#cbd5e1"];
        return `<div class="pc-day" data-pc-date="${inMonth ? iso(day) : ""}"${inside ? ' data-in-project="true"' : ""}${inside && kind !== "work" ? ` data-day-off="${kind}"` : ""} style="background:${bg};color:${fg}"><b>${inMonth ? date.getUTCDate() : ""}</b><span class="pc-code">${inside ? codes[kind] : ""}</span><span class="pc-owners">${owners.map((owner) => `<i style="background:${owner.color}"></i>`).join("")}</span></div>`;
      }).join("");
      return `<section class="pc-month" data-production-month="${year}-${String(month + 1).padStart(2, "0")}"><h3>${monthName.format(new Date(monthStart * DAY_MS))}</h3><div class="pc-week">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div><div class="pc-days">${cells}</div></section>`;
    }).join("");
    const legend = departments.map((department) => {
      const scheduled = department.tasks.filter((task) => task.start !== undefined && task.end !== undefined);
      const from = Math.min(...scheduled.map((task) => task.start!)), to = Math.max(...scheduled.map((task) => task.end!));
      return `<div class="pc-department"><i style="background:${department.color}"></i><strong>${escape(department.name.replace(/^Department\s+/i, ""))}</strong><span>${timeline.dateAt(from)} - ${timeline.dateAt(to - 1)}</span></div>`;
    }).join("");
    return `<div class="production-calendar-page" data-production-calendar-page="${sheet + 1}"><style>
      .production-calendar-page{width:2400px;height:1553px;box-sizing:border-box;background:#f7f9fc;color:#15243b;padding:54px 60px 40px;font:20px/1.3 Arial,sans-serif;display:flex;flex-direction:column;gap:22px}
      .production-calendar-page *{box-sizing:border-box}.production-calendar-page .pc-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #15243b;padding-bottom:22px}.production-calendar-page .pc-kicker{font-size:18px;font-weight:800;letter-spacing:.18em;color:#64748b}.production-calendar-page h1{font-size:42px;line-height:1.1;margin:8px 0}.production-calendar-page .pc-subtitle{color:#64748b;font-size:18px}.production-calendar-page .pc-job{text-align:right;font-size:21px;font-weight:800}.production-calendar-page .pc-job span{display:block;color:#64748b;font-size:16px;margin-top:8px}
      .production-calendar-page .pc-summary{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.production-calendar-page .pc-summary small{font-size:17px;color:#64748b;margin-left:auto}.production-calendar-page .pc-grid{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));gap:16px;flex:1;min-height:0}
      .production-calendar-page .pc-month{background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:${rows >= 3 ? 12 : 16}px;min-height:0;display:flex;flex-direction:column;gap:8px}.production-calendar-page h3{font-size:${columns > 6 ? 23 : 27}px;line-height:1;margin:0 0 6px;font-weight:800}.production-calendar-page .pc-week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:${columns > 6 ? 12 : 14}px;font-weight:700;color:#64748b}.production-calendar-page .pc-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr));gap:4px;min-height:0;flex:1}.production-calendar-page .pc-day{border-radius:6px;position:relative;padding:${rows >= 3 ? 2 : 5}px;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.production-calendar-page .pc-day b{font-size:${columns > 6 ? 17 : rows >= 3 ? 20 : 25}px;line-height:1}.production-calendar-page .pc-code{font-size:${columns > 6 ? 6 : rows >= 3 ? 7 : 10}px;font-weight:800;margin-top:2px;line-height:1}.production-calendar-page .pc-owners{position:absolute;bottom:3px;left:3px;right:3px;display:flex;gap:2px;height:4px}.production-calendar-page .pc-owners i{flex:1;border-radius:2px}
      .production-calendar-page .pc-legend{display:flex;flex-wrap:wrap;gap:10px}.production-calendar-page .pc-department{display:flex;align-items:center;gap:8px;border:1px solid #dbe3ee;background:#fff;border-radius:7px;padding:8px 12px;font-size:16px}.production-calendar-page .pc-department i{width:12px;height:12px;border-radius:3px}.production-calendar-page .pc-department span{font-size:14px;color:#64748b}.production-calendar-page .pc-footer{border-top:1px solid #dbe3ee;padding-top:12px;color:#64748b;font-size:15px;display:flex;justify-content:space-between;gap:30px}.production-calendar-page .pc-empty{flex:1;display:flex;align-items:center;justify-content:center;border:2px dashed #cbd5e1;border-radius:14px;color:#64748b;font-size:34px}
      </style><header class="pc-header"><div><div class="pc-kicker">PROJECT PRODUCTION CALENDAR</div><h1>${escape(name)}</h1><div class="pc-subtitle">${enabled ? `${startDate} - ${endDate} · ${months.length} months · Whole project schedule` : "Whole project calendar"}</div></div><div class="pc-job">${escape(job)}<span>11 × 17 in · Landscape${chunks.length > 1 ? ` · Calendar sheet ${sheet + 1}/${chunks.length}` : ""}</span></div></header>
      ${enabled ? `<div class="pc-summary">${calendarTextHtml([{ kind: "total", text: `TOTAL ${summary.totalDays}D`, background: "#15243b", color: "#fff" }, ...calendarSummaryBadges(summary).map((badge) => badge.kind === "work" ? { ...badge, text: `WORKING DAYS ${summary.workDays}D` } : badge)], 21)}<small>${file.calendar?.workWeek === "mon-thu" ? "MON–THU WORK · FRI–SUN OFF" : "7-DAY WEEK"}</small></div><div class="pc-grid">${monthHtml}</div><div class="pc-legend">${legend}</div>` : '<div class="pc-empty">Set the Calendar handoff date and complete task durations to generate dated calendars.</div>'}
      <footer class="pc-footer"><span>Counts are unique days across the project range, not a sum of overlapping tasks. OFF = stats + shutdown + weekend. Overlapping dates count once.</span><span>Day markers show active departments. SD = shutdown · H = stat holiday · OFF = weekend.</span></footer></div>`;
  });
}

export async function appendProductionCalendarPages(pdf: jsPDF, file: WorkflowFile) {
  const { captureToPng: toPng } = await import("@/lib/export/capture");
  for (const [index, html] of productionCalendarPageHtml(file).entries()) {
    const container = document.createElement("div");
    Object.assign(container.style, { position: "fixed", left: "-100000px", top: "0", width: "2400px", height: "1553px", pointerEvents: "none" });
    container.innerHTML = html;
    document.body.appendChild(container);
    try {
      await document.fonts.ready;
      const data = await toPng(container.firstElementChild as HTMLElement, { backgroundColor: "#f7f9fc", width: 2400, height: 1553, pixelRatio: 1.6, cacheBust: true });
      pdf.addPage([17 * 25.4, 11 * 25.4], "landscape");
      pdf.addImage(data, "PNG", 0, 0, 17 * 25.4, 11 * 25.4, `production-calendar-${index}`, "FAST");
    } finally { container.remove(); }
  }
}
