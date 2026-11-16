import { buildProcessSchedule, salesHandoffTime, DAYS_PER_WEEK } from "@/lib/process-schedule";
import { ganttCalendarBarLabel, ganttBarLabel, ganttDurationText, calendarWorkSummary } from "@/lib/gantt-bar-label";
import { calendarTextHtml, taskCalendarBadges } from "@/lib/calendar-badges";
import { isSalesDepartmentName } from "@/lib/department-label";
import type { WorkflowFile } from "@/types/workflow";
import { buildProcessTimeline, calendarTickDays, pauseSegmentBackground } from "@/lib/schedule-calendar";
import { escapeHtml as escape } from "@/lib/html";


export const PDF_SCHEDULE_LABEL_WIDTH = 460;
export function pdfScheduleExtent(days: number, originDay = 0, calendar = false) {
  const unit = calendar ? calendarTickDays(days, 10) : days >= 12 * DAYS_PER_WEEK ? 4 * DAYS_PER_WEEK : DAYS_PER_WEEK;
  const tick = unit * Math.max(1, Math.ceil(days / unit / 20));
  return { unit, tick, total: Math.max(unit, Math.ceil(days / tick) * tick, originDay + tick) };
}

/** A shared time axis keeps parallel work comparable across departments. */
export function processGanttPdfHtml(file: WorkflowFile, colors: Map<string, string>, options: { salesRowsWithoutBars?: boolean } = {}) {
  const schedule = buildProcessSchedule(file);
  const timeline = buildProcessTimeline(file, schedule);
  const handoff = { ...salesHandoffTime(schedule), originDay: timeline.originDay };
  const { unit, tick, total } = pdfScheduleExtent(timeline.totalDays, handoff.originDay ?? 0, timeline.enabled);
  const ticks = handoff.originDay === null ? [] : [
    ...(handoff.originDay > 0 ? [0] : []),
    ...Array.from({ length: Math.ceil((total - handoff.originDay) / tick) }, (_, index) => handoff.originDay! + index * tick),
  ];
  const timeLabel = (day: number) => {
    if (handoff.originDay === null) return "";
    if (day < handoff.originDay) return "";
    if (timeline.enabled) return timeline.dateLabel(day);
    const elapsed = day - handoff.originDay;
    return schedule.totalDays >= 12 * DAYS_PER_WEEK
      ? `M${Number((elapsed / (4 * DAYS_PER_WEEK) + 1).toFixed(1))}`
      : `W${Number((elapsed / DAYS_PER_WEEK + 1).toFixed(1))}`;
  };
  // One faint divider per month (or week on short schedules) after Day 1.
  const dividers = handoff.originDay === null ? [] : Array.from({ length: Math.ceil((total - handoff.originDay) / unit) }, (_, index) => handoff.originDay! + index * unit).filter((day) => day > 0 && day < total);
  const estimatedWeeks = handoff.elapsedDays === null ? null : Number((handoff.elapsedDays / schedule.workingDaysPerWeek).toFixed(1));
  return `<style>
    .gantt-heading{margin:14px 0 5px;font:800 13px Arial,sans-serif;letter-spacing:.08em;color:#1e293b}
    .gantt-note{margin:3px 0 7px;font:11px/1.3 Arial,sans-serif;color:#475569}
    .pdf-gantt{position:relative;border:1px solid #b8c8d8;border-radius:7px;overflow:hidden}
    .gantt-day-one-overlay{position:absolute;inset:0;z-index:2;display:grid;grid-template-columns:${PDF_SCHEDULE_LABEL_WIDTH}px minmax(0,1fr);pointer-events:none}
    .gantt-day-one-track{position:relative}
    .gantt-day-one-line{position:absolute;top:0;bottom:0;border-left:2px solid #0f766e}
    .gantt-divider-overlay{position:absolute;inset:0;z-index:1;display:grid;grid-template-columns:${PDF_SCHEDULE_LABEL_WIDTH}px minmax(0,1fr);pointer-events:none}
    .gantt-divider-track{position:relative}
    .gantt-divider{position:absolute;top:0;bottom:0;border-left:1px dashed rgba(100,116,139,.35)}
    .gantt-row{display:grid;grid-template-columns:${PDF_SCHEDULE_LABEL_WIDTH}px minmax(0,1fr);border-bottom:1px solid #e2e8f0;min-height:21px}
    .gantt-row[data-pdf-gantt-task]{min-height:30px}
    .gantt-row:nth-child(even){background:#f8fafc}
    .gantt-row:last-child{border-bottom:0}
    .gantt-label{padding:2px 9px;font:700 22px/1.02 Arial,sans-serif;overflow-wrap:anywhere}
    .gantt-task-label{position:relative;z-index:1;display:flex;align-items:center;gap:6px;white-space:nowrap}
    .gantt-phase-tag{flex:0 0 auto;border-radius:4px;padding:3px 6px;color:#fff;font:800 16px/1.1 Arial,sans-serif;white-space:nowrap}
    .gantt-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gantt-task-duration{flex:0 0 auto;margin-left:3px;border-radius:3px;background:#e2e8f0;padding:2px 4px;font:800 12px/1 Arial,sans-serif;color:#334155}
    .gantt-meta{font:8px/1.4 Arial,sans-serif;color:#64748b;margin-top:2px}
    .gantt-axis{position:relative;min-height:33px;background:#eaf0f6}
    .gantt-axis span{position:absolute;top:2px;padding-left:5px;font:800 22px Arial,sans-serif;color:#334155}
    .gantt-axis span.gantt-calendar-date{font:800 16px/1.2 Arial,sans-serif;white-space:nowrap}
    .gantt-axis .gantt-sales-lead{top:3px;padding:0 3px;text-align:center;font:800 19px/1.15 Arial,sans-serif;color:#1e3a8a;white-space:nowrap;overflow:hidden}
    .gantt-department{padding:4px 10px;background:#e8eef5;border-top:2px solid #b8c8d8;border-bottom:1px solid #cbd5e1;font:900 14px Arial,sans-serif;color:#172a45}
    .gantt-track{position:relative;min-height:21px;display:flex;align-items:center}
    .gantt-bar{position:absolute;height:26px;min-width:0;border-radius:0;z-index:2;box-shadow:none}
    .gantt-bar-text{display:inline-flex;align-items:center;gap:10px;position:absolute;z-index:3;margin-left:6px;white-space:nowrap;color:#000;font:800 19px Arial,sans-serif}
    .gantt-issue{padding:7px 10px;font:9px/1.4 Arial,sans-serif;color:#92400e}
    .gantt-task-label.gantt-interrupted-label{display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:0;white-space:normal}
    .gantt-task-heading{display:flex;align-items:center;gap:6px;white-space:nowrap}
    .gantt-task-pauses{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px}
    .gantt-task-pause-label{border-radius:3px;background:#e5e7eb;padding:2px 4px;color:#1f2937;font:800 12px/1.2 Arial,sans-serif}
    .gantt-pause-segment{position:absolute;height:26px;min-width:0;border-radius:0;box-shadow:none;background:#94a3b8;color:#fff;font:800 12px/26px Arial,sans-serif;padding:0;white-space:nowrap;overflow:hidden}
    .gantt-department-calendar{min-height:30px;background:#f3f4f6!important}
    .gantt-calendar-label{background:#e5e7eb;color:#1f2937;font:800 14px/1.2 Arial,sans-serif;display:flex;align-items:center}
    .gantt-calendar-pause{position:absolute;height:22px;border-radius:4px;background:#6b7280;color:#fff;font:800 12px/22px Arial,sans-serif;padding:0 4px;white-space:nowrap;overflow:hidden}
  </style>
  <div class="gantt-heading">RELEASE CONDITIONS · GANTT CHART</div>
  <p class="gantt-note">${timeline.enabled ? `Technical handoff: ${escape(timeline.calendar!.startDate)}. Calendar dates shown; shutdown dates are inclusive. Total task durations include all days off: 1W = 7 calendar days. Actual work = total days minus non-overlapping shutdowns, statutory holidays and weekends.${timeline.calendar!.workWeek === "mon-thu" ? " Work Monday–Thursday; Friday–Sunday are off." : ""}` : `${handoff.hasSalesDepartment ? "Sales lead customer qualification is excluded. Week 1 begins at the formal Sales-to-Technical handover." : "Relative weeks."} 1 month = 4 weeks · The axis switches to months for long schedules · Parallel tasks overlap.`} Estimated span after Sales handoff: ${estimatedWeeks === null ? "pending" : `${estimatedWeeks} ${estimatedWeeks === 1 ? "week" : "weeks"}`}${timeline.enabled ? " total elapsed time" : ""}.${schedule.unscheduled ? ` ${schedule.unscheduled} condition(s) not scheduled; the span is partial and may increase.` : ""}</p>
  <div class="pdf-gantt">
    <div class="gantt-row"><div class="gantt-label">RELEASE CONDITION</div><div class="gantt-axis">${handoff.hasSalesDepartment && handoff.originDay !== null && handoff.originDay > 0 ? `<span class="gantt-sales-lead" style="left:0;width:${handoff.originDay / total * 100}%">Sales lead · customer qualification</span>` : ""}${ticks.map((day) => `<span${timeline.enabled ? ' class="gantt-calendar-date"' : ""} style="left:${day / total * 100}%">${timeLabel(day)}</span>`).join("")}</div></div>
    ${schedule.departments.filter((department) => department.tasks.length > 0).map((department) => `<div class="gantt-department">${escape(department.name)}</div>${department.tasks.map((task) => {
      const phase = schedule.phases[task.phaseIndex];
      const color = colors.get(phase?.id) || task.color;
      const phaseTag = phase ? `PHASE ${phase.title.match(/\d+/)?.[0] || task.phaseIndex + 1}` : "UNLINKED";
      const salesLabelOnly = options.salesRowsWithoutBars && isSalesDepartmentName(task.department);
      const start = task.start === undefined ? 0 : timeline.toDisplayDay(task.start);
      const end = task.end === undefined ? 0 : timeline.toDisplayDay(task.end, "end");
      const segments = task.start === undefined || task.end === undefined || salesLabelOnly ? [] : timeline.taskSegments(task.start, task.end);
      const pauses = segments.filter((segment) => segment.kind === "pause");
      const shutdownDays = pauses.reduce((sum, pause) => sum + pause.end - pause.start, 0);
      const endLabel = timeline.enabled ? ganttCalendarBarLabel(task.department, task.condition, pauses) : ganttBarLabel(task.department, task.condition).toUpperCase();
      const summary = calendarWorkSummary(task.days ?? 0, pauses);
      // PDF labels stay short: department + duration, then actual work days.
      // Zero actual work is printed red so impossible windows stand out.
      const workHtml = `<span data-calendar-tag="work" style="display:inline-block;flex:0 0 auto;white-space:nowrap;font:800 19px/1.2 Arial,sans-serif;color:#15803d">ACTUAL WORK <span data-actual-work-days="${summary.workDays}" style="${summary.workDays === 0 ? "color:#dc2626;font-weight:900" : ""}">${summary.workDays}D</span></span>`;
      const labelHtml = timeline.enabled
        ? `${calendarTextHtml(taskCalendarBadges(task.department, task.condition, pauses, color).filter((badge) => badge.kind === "department"))} ${workHtml}`
        : calendarTextHtml([{ kind: "department", text: endLabel, background: color, color: "#ffffff" }]);
      const heading = `<span class="gantt-phase-tag" style="background:${color}">${escape(phaseTag)}</span><span class="gantt-title">${escape(task.title)}</span>${salesLabelOnly || !task.days ? "" : `<span class="gantt-task-duration">${escape(ganttDurationText(task.condition, true, schedule.workingDaysPerWeek).toUpperCase())}</span>`}`;
      const corners = (index: number) => `border-radius:${index === 0 ? "6px" : "0"} ${index === segments.length - 1 ? "6px 6px" : "0 0"} ${index === 0 ? "6px" : "0"};`;
      const bars = segments.map((segment, index) => segment.kind === "work"
        ? `<div class="gantt-bar" data-start="${task.start}" data-end="${task.end}" data-duration="${escape(ganttDurationText(task.condition, true, schedule.workingDaysPerWeek).toUpperCase())}" data-segment-start="${segment.start}" data-segment-end="${segment.end}"${timeline.enabled ? ` data-calendar-start="${timeline.dateAt(start)}" data-calendar-end="${timeline.dateAt(end - 1)}"` : ""} style="left:${segment.start / total * 100}%;width:${(segment.end - segment.start) / total * 100}%;background:${color};${corners(index)}"></div>`
        : `<div class="gantt-pause-segment" data-pdf-task-pause data-pdf-pause-periods="${escape(segment.periods.map((period) => period.id).join(" "))}" data-segment-start="${segment.start}" data-segment-end="${segment.end}" title="${escape(segment.description)}" style="left:${segment.start / total * 100}%;width:${(segment.end - segment.start) / total * 100}%;background:${pauseSegmentBackground(segment)};${corners(index)}"></div>`).join("");
      return `<div class="gantt-row" data-pdf-gantt-task="${escape(task.title)}" data-pdf-gantt-phase="${escape(phase?.id || "")}" data-pdf-gantt-department="${escape(task.department)}"><div class="gantt-label gantt-task-label">${heading}</div><div class="gantt-track">${salesLabelOnly ? "" : task.start !== undefined && task.end !== undefined ? `${bars}<span class="gantt-bar-text" title="${escape(summary.formula)}"${shutdownDays ? ` data-shutdown-days="${shutdownDays}"` : ""} style="left:${end / total * 100}%;">${labelHtml}</span>` : `<span class="gantt-issue">${escape(task.issue || "Not scheduled")}</span>`}</div></div>`;
    }).join("")}`).join("")}
    ${dividers.length ? `<div class="gantt-divider-overlay" aria-hidden="true"><div></div><div class="gantt-divider-track">${dividers.map((day) => `<div class="gantt-divider" style="left:${day / total * 100}%"></div>`).join("")}</div></div>` : ""}
    ${handoff.hasSalesDepartment && handoff.originDay !== null ? `<div class="gantt-day-one-overlay" aria-hidden="true"><div></div><div class="gantt-day-one-track"><div class="gantt-day-one-line" data-day-one-origin="${handoff.originDay}" style="left:${handoff.originDay / total * 100}%"></div></div></div>` : ""}
  </div>`;
}
