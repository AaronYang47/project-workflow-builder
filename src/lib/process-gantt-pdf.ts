import { buildProcessSchedule, salesHandoffTime, DAYS_PER_WEEK } from "@/lib/process-schedule";
import { ganttBarLabel, ganttDurationText } from "@/lib/gantt-bar-label";
import { isSalesDepartmentName } from "@/lib/department-label";
import type { WorkflowFile } from "@/types/workflow";

const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);

export const PDF_SCHEDULE_LABEL_WIDTH = 460;
export function pdfScheduleExtent(days: number, originDay = 0) {
  const unit = days >= 12 * DAYS_PER_WEEK ? 4 * DAYS_PER_WEEK : DAYS_PER_WEEK;
  const tick = unit * Math.max(1, Math.ceil(days / unit / 20));
  return { unit, tick, total: Math.max(unit, Math.ceil(days / tick) * tick, originDay + tick) };
}

/** A shared time axis keeps parallel work comparable across departments. */
export function processGanttPdfHtml(file: WorkflowFile, colors: Map<string, string>, options: { salesRowsWithoutBars?: boolean } = {}) {
  const schedule = buildProcessSchedule(file);
  const handoff = salesHandoffTime(schedule);
  const { unit, tick, total } = pdfScheduleExtent(schedule.totalDays, handoff.originDay ?? 0);
  const ticks = handoff.originDay === null ? [] : [
    ...(handoff.originDay > 0 ? [0] : []),
    ...Array.from({ length: Math.ceil((total - handoff.originDay) / tick) }, (_, index) => handoff.originDay! + index * tick),
  ];
  const timeLabel = (day: number) => {
    if (handoff.originDay === null) return "";
    if (day < handoff.originDay) return "";
    const elapsed = day - handoff.originDay;
    return schedule.totalDays >= 12 * DAYS_PER_WEEK
      ? `M${Number((elapsed / (4 * DAYS_PER_WEEK) + 1).toFixed(1))}`
      : `W${Number((elapsed / DAYS_PER_WEEK + 1).toFixed(1))}`;
  };
  // One faint divider per month (or week on short schedules) after Day 1.
  const dividers = handoff.originDay === null ? [] : Array.from({ length: Math.ceil((total - handoff.originDay) / unit) }, (_, index) => handoff.originDay! + index * unit).filter((day) => day > 0 && day < total);
  const estimatedWeeks = handoff.elapsedDays === null ? null : Number((handoff.elapsedDays / DAYS_PER_WEEK).toFixed(1));
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
    .gantt-axis .gantt-sales-lead{top:3px;padding:0 3px;text-align:center;font:800 19px/1.15 Arial,sans-serif;color:#1e3a8a;white-space:nowrap;overflow:hidden}
    .gantt-department{padding:4px 10px;background:#e8eef5;border-top:2px solid #b8c8d8;border-bottom:1px solid #cbd5e1;font:900 14px Arial,sans-serif;color:#172a45}
    .gantt-track{position:relative;min-height:21px;display:flex;align-items:center}
    .gantt-bar{position:absolute;height:26px;min-width:2px;border-radius:7px;z-index:2;box-shadow:0 2px 5px rgba(15,23,42,.25),inset 0 1px 0 rgba(255,255,255,.3)}
    .gantt-bar-text{position:absolute;z-index:3;margin-left:6px;white-space:nowrap;color:#000;font:800 19px Arial,sans-serif}
    .gantt-issue{padding:7px 10px;font:9px/1.4 Arial,sans-serif;color:#92400e}
  </style>
  <div class="gantt-heading">RELEASE CONDITIONS · GANTT CHART</div>
  <p class="gantt-note">${handoff.hasSalesDepartment ? "Sales lead customer qualification is excluded. Week 1 begins at the formal Sales-to-Technical handover." : "Relative weeks."} 1 month = 4 weeks · The axis switches to months for long schedules · Parallel tasks overlap. Estimated span after Sales handoff: ${estimatedWeeks === null ? "pending" : `${estimatedWeeks} ${estimatedWeeks === 1 ? "week" : "weeks"}`}.${schedule.unscheduled ? ` ${schedule.unscheduled} condition(s) not scheduled; the span is partial and may increase.` : ""}</p>
  <div class="pdf-gantt">
    <div class="gantt-row"><div class="gantt-label">RELEASE CONDITION</div><div class="gantt-axis">${handoff.hasSalesDepartment && handoff.originDay !== null && handoff.originDay > 0 ? `<span class="gantt-sales-lead" style="left:0;width:${handoff.originDay / total * 100}%">Sales lead · customer qualification</span>` : ""}${ticks.map((day) => `<span style="left:${day / total * 100}%">${timeLabel(day)}</span>`).join("")}</div></div>
    ${schedule.departments.filter((department) => department.tasks.length > 0).map((department) => `<div class="gantt-department">${escape(department.name)}</div>${department.tasks.map((task) => {
      const phase = schedule.phases[task.phaseIndex];
      const color = colors.get(phase?.id) || task.color;
      const phaseTag = phase ? `PHASE ${phase.title.match(/\d+/)?.[0] || task.phaseIndex + 1}` : "UNLINKED";
      const salesLabelOnly = options.salesRowsWithoutBars && isSalesDepartmentName(task.department);
      return `<div class="gantt-row" data-pdf-gantt-task="${escape(task.title)}" data-pdf-gantt-phase="${escape(phase?.id || "")}" data-pdf-gantt-department="${escape(task.department)}"><div class="gantt-label gantt-task-label"><span class="gantt-phase-tag" style="background:${color}">${escape(phaseTag)}</span><span class="gantt-title">${escape(task.title)}</span>${salesLabelOnly || !task.days ? "" : `<span class="gantt-task-duration">${escape(ganttDurationText(task.condition, true))}</span>`}</div><div class="gantt-track">${salesLabelOnly ? "" : task.start !== undefined && task.end !== undefined ? `<div class="gantt-bar" data-start="${task.start}" data-end="${task.end}" data-duration="${escape(ganttDurationText(task.condition, true))}" style="left:${task.start / total * 100}%;width:${task.days! / total * 100}%;background:${color};"></div><span class="gantt-bar-text" style="left:${task.end / total * 100}%;">${escape(ganttBarLabel(task.department, task.condition))}</span>` : `<span class="gantt-issue">${escape(task.issue || "Not scheduled")}</span>`}</div></div>`;
    }).join("")}`).join("")}
    ${dividers.length ? `<div class="gantt-divider-overlay" aria-hidden="true"><div></div><div class="gantt-divider-track">${dividers.map((day) => `<div class="gantt-divider" style="left:${day / total * 100}%"></div>`).join("")}</div></div>` : ""}
    ${handoff.hasSalesDepartment && handoff.originDay !== null ? `<div class="gantt-day-one-overlay" aria-hidden="true"><div></div><div class="gantt-day-one-track"><div class="gantt-day-one-line" data-day-one-origin="${handoff.originDay}" style="left:${handoff.originDay / total * 100}%"></div></div></div>` : ""}
  </div>`;
}
