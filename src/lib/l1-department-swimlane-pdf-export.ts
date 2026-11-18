import { calendarDurationParts } from "@/lib/condition-duration";
import { fobYardTag } from "@/lib/fob-yard";
import { factoryProductionNote, isFactoryProductionRow } from "@/lib/factory-production-row";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import { buildProcessSchedule, salesHandoffTime } from "@/lib/process-schedule";
import {
  isProductionDepartmentName,
  isSalesDepartmentName,
  isTechnicalDepartmentName,
} from "@/lib/department-label";
import { PDF_SCHEDULE_LABEL_WIDTH, processGanttPdfHtml } from "@/lib/process-gantt-pdf";
import { departmentDocumentSummary } from "@/lib/department-document-summary";
import { confirmDayOffWarnings } from "@/lib/calendar-badges";
import type { DomainNode, WorkflowFile } from "@/types/workflow";
import { escapeHtml } from "@/lib/html";
import { exportPixelRatio } from "@/lib/export/canvas-limits";
import {
  DEPARTMENT_PALETTE,
  rgba,
  phaseColor,
  linkedNodeIds,
  departmentIdentity,
  gradient,
  makeColumns,
  ganttCoverage,
  evidenceHtml,
  type PhaseColumn,
} from "@/lib/l1-department-swimlane-model";
import { fitSwimlaneLayout } from "@/lib/l1-department-swimlane-fit";

export async function exportL1DepartmentSwimlanePdf(
  file: WorkflowFile,
  options: { gantt?: boolean } = {},
) {
  // Tasks whose window is mostly days off are flagged in the chart; ask the
  // user before printing a schedule that is unlikely to hold.
  if (options.gantt && !confirmDayOffWarnings(file)) return;
  const { captureToPng: toPng } = await import("@/lib/export/capture");
  const { jsPDF } = await import("jspdf");
  const highLevelNodes = file.highLevel?.graph.nodes || [];
  const highLevelEdges = file.highLevel?.graph.edges || [];
  const orderedNodes = orderHighLevelNodes(highLevelNodes, highLevelEdges).filter(
    (node) => node.type !== "primaryGate",
  );
  if (!orderedNodes.length)
    throw new Error("Add L1 phases before exporting the Department Swimlane PDF.");

  const nodeById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const phases: PhaseColumn[] = orderedNodes.map((node, index) => ({
    node,
    index,
    color: phaseColor(node, index),
    linkedNodes: linkedNodeIds(node, file, nodeById)
      .map((id) => nodeById.get(id))
      .filter((item): item is DomainNode => Boolean(item)),
  }));
  const allColumns = makeColumns(phases, file);
  const columns = allColumns.filter(
    (column) =>
      !options.gantt ||
      column.connections.some((connection) => connection.node.conditions.length > 0),
  );
  if (!columns.length)
    throw new Error("Link departments to L1 phases before exporting the Department Swimlane PDF.");
  const documentsByDepartment = new Map(
    allColumns.map((column) => [
      column.key,
      departmentDocumentSummary(column.connections.map((connection) => connection.node)),
    ]),
  );

  const coverage = options.gantt ? ganttCoverage(file, phases, columns) : undefined;
  const aligned = Boolean(coverage?.scheduled);
  const gap = 12;
  const paddingX = 30;
  const departmentWidth = Math.max(174, Math.min(224, 1320 / columns.length));
  const phaseWidth = Math.max(250, Math.min(340, 1320 / phases.length));
  const innerWidth = Math.max(
    columns.length * departmentWidth + Math.max(0, columns.length - 1) * gap,
    phases.length * phaseWidth + Math.max(0, phases.length - 1) * gap,
    coverage?.minimumWidth ?? 0,
  );
  const canvasWidth = Math.ceil(innerWidth + paddingX * 2);
  const projectName = file.graph.metadata.name?.trim() || "Process Workflow";
  const documentTitle = `High Level Process System Flowchart${options.gantt ? " with Gantt Chart" : ""}`;
  const deliveryTag = fobYardTag(file);
  const projectNumber =
    workflowLegacyJobNumber(file) ||
    [
      file.operations?.identity?.projectNumber,
      file.operations?.identity?.projectId,
      file.operations?.projectNumber,
    ]
      .map((value) => String(value || "").trim())
      .find((value) => /^\d{5}$/.test(value)) ||
    "";
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-99999",
    pointerEvents: "none",
    width: `${canvasWidth}px`,
    background: "#ffffff",
    color: "#0f172a",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "26px 30px 22px",
    boxSizing: "border-box",
    lineHeight: "1.3",
  });

  const schedule = buildProcessSchedule(file);
  const handoff = salesHandoffTime(schedule);
  // L5 data: once Factory Production is in L4, it replaces the general note.
  const hasFactoryProduction = schedule.tasks.some((task) =>
    isFactoryProductionRow(task.condition),
  );
  const phaseHtml = phases
    .map((phase, index) => {
      if (aligned && coverage!.ranges[index].end <= coverage!.ranges[index].start) return "";
      const title = phase.node.description.trim() || phase.node.title;
      const departmentCount = columns.filter((column) =>
        column.connections.some((connection) => connection.phaseIndex === phase.index),
      ).length;
      const scheduleIndex = schedule.phases.findIndex((item) => item.id === phase.node.id);
      const range = schedule.phaseRanges[scheduleIndex];
      const tasks = schedule.tasks.filter(
        (task) => task.phaseIndex === scheduleIndex && scheduleIndex >= 0,
      );
      const scheduled = tasks.filter((task) => task.end !== undefined);
      const containsSales =
        options.gantt && tasks.some((task) => isSalesDepartmentName(task.department));
      const countedTasks = containsSales
        ? scheduled.filter((task) => !isSalesDepartmentName(task.department))
        : scheduled;
      const technicalStarts = countedTasks
        .filter((task) => isTechnicalDepartmentName(task.department))
        .map((task) => task.start!);
      const countedStart = technicalStarts.length
        ? Math.min(...technicalStarts)
        : countedTasks.length
          ? Math.min(...countedTasks.map((task) => task.start!))
          : 0;
      const days = containsSales
        ? countedTasks.length
          ? Math.max(0, Math.max(...countedTasks.map((task) => task.end!)) - countedStart)
          : 0
        : range
          ? range.end - range.start
          : 0;
      const partial =
        countedTasks.length <
        (containsSales
          ? tasks.filter((task) => !isSalesDepartmentName(task.department)).length
          : tasks.length);
      const durationHtml =
        containsSales && !countedTasks.length
          ? '<span class="phase-duration-pending">Timing begins with Technical work</span>'
          : countedTasks.length
            ? `<div class="phase-duration-main">${calendarDurationParts(
                days,
                schedule.workingDaysPerWeek,
              )
                .map(
                  (part, index, parts) =>
                    `<span class="phase-duration-part"><span class="phase-duration-number">${part.value}${partial && index === parts.length - 1 ? "+" : ""}</span><span class="phase-duration-unit">${part.unit}</span></span>`,
                )
                .join(
                  "",
                )}</div>${partial ? '<span class="phase-duration-note">Partial estimate</span>' : ""}`
            : '<span class="phase-duration-pending">Duration not set</span>';
      // With L5 data the Phase duration already includes Factory Production, so the
      // box shows just that total; the general note stays only without L5 data.
      const actualProductionNote =
        options.gantt &&
        !hasFactoryProduction &&
        countedTasks.length &&
        tasks.some((task) => isProductionDepartmentName(task.department))
          ? '<span class="phase-actual-production-note" data-phase-actual-production-time>+ Actual Production Time [Average Time Per Module is 2 Weeks]</span>'
          : "";
      return `<div class="phase-card" data-pdf-phase-id="${escapeHtml(phase.node.id)}" style="--phase-color:${phase.color};--phase-tint:${rgba(phase.color, 0.09)};">
      <div class="phase-meta"><span>${escapeHtml(phase.node.title || `PHASE ${index + 1}`)}</span><span class="phase-involvement">${departmentCount} ${departmentCount === 1 ? "Department" : "Departments"} Involved</span></div>
      <div class="phase-title">${escapeHtml(title)}</div>
      ${phase.node.code?.trim() ? `<div class="phase-code">${escapeHtml(phase.node.code.trim())}</div>` : ""}
      <div class="phase-duration">${durationHtml}</div>
      ${actualProductionNote}
    </div>`;
    })
    .join("");

  const departmentCards = aligned
    ? coverage!.cards
    : columns.map((column) => ({ column, start: 0, end: 0 }));
  const departmentHtml = departmentCards
    .map((card, index) => {
      const column = card.column;
      if (!column) return '<div class="department-spacer"></div>';
      const colors = column.colors.length
        ? column.colors
        : [DEPARTMENT_PALETTE[index % DEPARTMENT_PALETTE.length]];
      const borderGradient = gradient(colors);
      const singlePhaseColor =
        column.connections.length === 1 ? column.connections[0].phaseColor : undefined;
      const cardClass = singlePhaseColor ? "department-card single-phase-card" : "department-card";
      const legalTitles = options.gantt ? documentsByDepartment.get(column.key)?.legal || [] : [];
      const customerTitles = options.gantt
        ? documentsByDepartment.get(column.key)?.customer || []
        : [];
      const nodeIds = new Set(column.connections.map((connection) => connection.node.id));
      const departmentTasks = schedule.tasks.filter((task) => nodeIds.has(task.nodeId));
      const scheduledTasks = departmentTasks.filter(
        (task) => task.start !== undefined && task.end !== undefined,
      );
      const departmentDays = scheduledTasks.length
        ? Math.max(...scheduledTasks.map((task) => task.end!)) -
          Math.min(...scheduledTasks.map((task) => task.start!))
        : undefined;
      const partialDuration = scheduledTasks.length < departmentTasks.length;
      // Any of this Department's nodes in its Phases (a box keeps only one node per Phase).
      const departmentFactoryRow = schedule.tasks.find((task) => {
        if (!isFactoryProductionRow(task.condition)) return false;
        const owner = nodeById.get(task.nodeId);
        const phaseId = schedule.phases[task.phaseIndex]?.id;
        // An aligned box covers one Phase's span; otherwise any of its Phases.
        const cardPhase = aligned
          ? phases[
              coverage!.ranges.findIndex(
                (range) => card.start >= range.start - 0.000001 && card.start < range.end,
              )
            ]?.node.id
          : undefined;
        return (
          owner !== undefined &&
          departmentIdentity(owner).key === column.key &&
          (cardPhase
            ? cardPhase === phaseId
            : column.connections.some(
                (connection) => phases[connection.phaseIndex]?.node.id === phaseId,
              ))
        );
      });
      const actualProductionNote = departmentFactoryRow
        ? `<span class="department-actual-production-note" data-department-factory-production>${escapeHtml(factoryProductionNote(departmentFactoryRow.days))}</span>`
        : !hasFactoryProduction &&
            isProductionDepartmentName(column.label) &&
            departmentDays !== undefined
          ? '<span class="department-actual-production-note" data-department-actual-production-time>+ Actual Production Time [Average Time Per Module is 2 Weeks]</span>'
          : "";
      const durationHtml =
        options.gantt && !isSalesDepartmentName(column.label)
          ? `<div class="department-duration" data-department-duration="${escapeHtml(column.label)}">${
              departmentDays === undefined
                ? `<span class="department-duration-pending">Duration not set</span>${departmentFactoryRow ? actualProductionNote : ""}`
                : `<div class="department-duration-main">${calendarDurationParts(
                    departmentDays,
                    schedule.workingDaysPerWeek,
                  )
                    .map(
                      (part, partIndex, parts) =>
                        `<span class="department-duration-part"><span class="department-duration-number">${part.value}${partialDuration && partIndex === parts.length - 1 ? "+" : ""}</span><span class="department-duration-unit">${part.unit}</span></span>`,
                    )
                    .join(
                      "",
                    )}</div>${actualProductionNote}${partialDuration ? '<span class="department-duration-note">Partial estimate</span>' : ""}`
            }</div>`
          : "";
      const partialInvolvement = column.connections.some(
        (connection) => connection.partiallyInvolved,
      );
      const phaseSegments = column.connections
        .map(
          (connection) =>
            `<span class="phase-segment" data-phase-index="${connection.phaseIndex}" style="background:${connection.phaseColor};"></span>`,
        )
        .join("");
      return `<div class="${cardClass}${options.gantt ? " gantt-department-card" : ""}" data-coverage-start="${card.start}" data-coverage-end="${card.end}" style="--department-gradient:${borderGradient};--department-fill:${gradient(colors, 0.09)};--department-duration-color:${colors.at(-1)};${singlePhaseColor ? `--single-phase-color:${singlePhaseColor};` : ""}">
        <div class="department-heading"><div class="department-label">${escapeHtml(column.label)}</div>${partialInvolvement ? `<span class="partial-tag">Partially Involved</span>` : ""}</div>
        ${
          legalTitles.length || customerTitles.length
            ? `<div class="department-document-groups${legalTitles.length && customerTitles.length ? " dual-document-groups" : ""}">
          ${legalTitles.length ? `<div class="department-document-item" data-department-documents="${escapeHtml(column.label)}"><strong>Required Documents</strong><ul>${legalTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul></div>` : ""}
          ${customerTitles.length ? `<div class="department-document-item" data-department-customer="${escapeHtml(column.label)}"><strong>Customer Information</strong><ul>${customerTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul></div>` : ""}
        </div>`
            : ""
        }
        ${durationHtml}
        ${phaseSegments ? `<div class="phase-strip" aria-hidden="true">${phaseSegments}</div>` : `<div class="unlinked-label">Not linked to a phase</div>`}
      </div>`;
    })
    .join("");
  const supportingDocumentsHtml =
    options.gantt &&
    allColumns.some((column) => {
      const summary = documentsByDepartment.get(column.key);
      return Boolean(summary?.supporting.length || summary?.optional.length);
    })
      ? `<div class="supporting-documents-footer"><strong>Supporting Documents</strong><div class="supporting-documents-list">${allColumns
          .flatMap((column) => {
            const summary = documentsByDepartment.get(column.key);
            const titles = summary?.supporting || [];
            const optional = summary?.optional || [];
            const optionalTitles = new Set(
              optional.map((condition) => condition.title.toLocaleLowerCase()),
            );
            const standaloneTitles = titles.filter(
              (title) => !optionalTitles.has(title.toLocaleLowerCase()),
            );
            return titles.length || optional.length
              ? [
                  `<div class="supporting-department"><b>${escapeHtml(column.label)}</b><ul>${standaloneTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}${optional.map((condition) => `<li data-optional-condition="true">${escapeHtml(condition.title)} · ${escapeHtml(condition.duration)}</li>`).join("")}</ul></div>`,
                ]
              : [];
          })
          .join("")}</div></div>`
      : "";

  const downArrows = columns.map(() => `<div class="down-arrow">↓</div>`).join("");
  const evidenceHtmlRows = columns
    .map((column, index) => {
      const colors = column.colors.length
        ? column.colors
        : [DEPARTMENT_PALETTE[index % DEPARTMENT_PALETTE.length]];
      const singlePhaseColor =
        column.connections.length === 1 ? column.connections[0].phaseColor : undefined;
      const cardClass = singlePhaseColor ? "evidence-card single-phase-card" : "evidence-card";
      return `<div class="${cardClass}" style="--department-gradient:${gradient(colors)};--department-fill:${gradient(colors, 0.065)};${singlePhaseColor ? `--single-phase-color:${singlePhaseColor};` : ""}">
      <div class="evidence-header"><span>FORMS & RELEASE CONDITIONS</span><span>${column.evidence.length}</span></div>
      ${evidenceHtml(column)}
    </div>`;
    })
    .join("");

  const alignedStyles = aligned
    ? `
    .phase-ribbon,.phase-row,.department-grid{margin-left:${PDF_SCHEDULE_LABEL_WIDTH + 1}px;margin-right:1px}
    .coverage-row{position:relative}
    .coverage-caption{position:absolute;left:0;top:0;bottom:0;width:${PDF_SCHEDULE_LABEL_WIDTH - 16}px;display:flex;align-items:center;font:900 30px/1.1 Arial,sans-serif;letter-spacing:.04em;color:#334155}
    .department-grid{column-gap:0}
    .department-card{margin:0 3px;position:relative;padding-bottom:20px;box-shadow:none}
    .department-card:last-child{margin-right:-1px}
    .phase-strip{position:absolute;bottom:10px;left:9px;right:9px;margin:0;gap:0}
    .phase-segment{position:absolute;top:0;height:4px;min-width:0;border-radius:0}
  `
    : "";
  const pendingPhases = aligned
    ? phases.filter((_, index) => coverage!.ranges[index].end <= coverage!.ranges[index].start)
    : [];
  const pendingDepartments = aligned
    ? columns.filter((column) => !coverage!.cards.some((card) => card.column?.key === column.key))
    : [];
  container.innerHTML = `<style>
    *{box-sizing:border-box}
    .document-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;border-bottom:2px solid #0f172a;padding-bottom:12px}
    .kicker{font:800 11px Arial,sans-serif;letter-spacing:.13em;color:#475569;text-transform:uppercase}
    .delivery-tag{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:999px;background:#475569;color:#fff;font:800 11px Arial,sans-serif;letter-spacing:.08em}
    .delivery-tag.fob{background:#159a75}
    h1{margin:5px 0 0;font-size:25px;line-height:1.12;color:#0f172a;overflow-wrap:anywhere}
    .project-meta{text-align:right;font-size:11px;line-height:1.4;color:#475569}
    .project-number{display:flex;align-items:baseline;justify-content:flex-end;gap:5px;font-size:12px;font-weight:800;color:#1e293b}
    .project-number-label{font-size:8px;letter-spacing:.08em;color:#64748b}
    .phase-ribbon{height:7px;margin:10px 0 7px;border-radius:99px;background:linear-gradient(90deg,${phases.map((phase, index) => `${phase.color} ${(index / phases.length) * 100}% ${((index + 1) / phases.length) * 100}%`).join(",")})}
    .section-title{margin:12px 0 6px;font:800 11px Arial,sans-serif;letter-spacing:.1em;color:#334155;text-transform:uppercase}
    .phase-row{display:grid;grid-template-columns:repeat(${phases.length},minmax(0,1fr));column-gap:0;align-items:stretch}
    .phase-card{position:relative;display:flex;flex-direction:column;min-height:82px;padding:10px 12px;border:1px solid rgba(15,23,42,.13);border-top:4px solid var(--phase-color);border-radius:8px;background:linear-gradient(135deg,var(--phase-tint),#fff 72%);}
    .phase-card:not(:last-child)::after{content:"→";position:absolute;z-index:2;right:-9px;top:27px;color:#64748b;font-size:17px;font-weight:800}
    .phase-meta{display:flex;flex-shrink:0;align-items:flex-start;font:800 12px Arial,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--phase-color)}
    .phase-meta span:first-child{flex-shrink:0}
    .phase-involvement{position:absolute;top:10px;right:12px;white-space:nowrap;text-align:right;letter-spacing:0;text-transform:none;color:#334155}
    .phase-title{flex-shrink:0;margin-top:6px;font-size:21px;font-weight:800;line-height:1.18;color:#0f172a;overflow-wrap:anywhere}
    .phase-duration{flex-shrink:0;align-self:flex-end;width:max-content;margin-top:auto;padding-top:12px;text-align:right;color:var(--phase-color);max-width:100%}
    .phase-duration-main{display:flex;flex-wrap:nowrap;justify-content:flex-end;gap:8px;white-space:nowrap}
    .phase-duration-part{display:inline-flex;flex-shrink:0;align-items:baseline;white-space:nowrap}
    .phase-duration-number{font:900 26px/1.1 Arial,sans-serif}
    .phase-duration-unit{display:inline-block;margin-left:4px;font:800 11px/1.3 Arial,sans-serif;letter-spacing:.04em}
    .phase-duration-note{display:block;margin-top:2px;color:#92400e;font:700 8px/1.3 Arial,sans-serif}
    .phase-duration-pending{font:700 10px/1.3 Arial,sans-serif;color:#64748b}
    .phase-actual-production-note{position:absolute;left:12px;right:12px;bottom:8px;text-align:right;font:800 10px/1.3 Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#dc2626}
    .phase-code{margin-top:3px;font-size:11px;color:#64748b;overflow-wrap:anywhere}
    .department-grid,.down-arrow-grid,.evidence-grid{display:grid;grid-template-columns:repeat(${columns.length},minmax(0,1fr));column-gap:${gap}px;align-items:stretch}
    .department-card{min-width:0;min-height:62px;padding:10px 9px;border:2px solid transparent;border-radius:9px;background:var(--department-fill) padding-box,var(--department-gradient) border-box;box-shadow:0 3px 10px rgba(15,23,42,.06);display:flex;flex-direction:column;justify-content:center}
    .department-card.gantt-department-card{justify-content:flex-start}
    .department-card.single-phase-card{border:3px solid var(--single-phase-color);background:var(--department-fill)}
    .department-heading{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;margin-bottom:9px}
    .department-label{min-width:0;flex:1;font-size:20px;font-weight:900;line-height:1.2;color:#0f172a;overflow-wrap:normal}
    .partial-tag{flex:0 0 auto;padding:1px 3px;border-radius:3px;background:#fff7ed;color:#9a3412;font:700 6px Arial,sans-serif;white-space:nowrap}
    .phase-strip{display:flex;gap:3px;height:4px;margin-top:8px;overflow:hidden;border-radius:99px}
    .phase-segment{flex:1;min-width:5px;border-radius:99px}
    .unlinked-label{font-size:7px;color:#94a3b8}
    .department-document-item{min-width:0;margin-top:5px;font:11px/1.18 Arial,sans-serif;color:#334155;overflow-wrap:anywhere}
    .department-document-item strong{font-size:11px;color:#334155}
    .department-document-item ul,.supporting-documents-footer ul{margin:3px 0 0;padding-left:13px;list-style:disc outside}
    .department-document-item li,.supporting-documents-footer li{margin:0}
    .gantt-department-card .department-document-item,.gantt-department-card .department-document-item strong{font-size:16px;line-height:1.08}
    .gantt-department-card .department-document-groups{min-width:0}
    .gantt-department-card .dual-document-groups{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);column-gap:12px;align-items:start}
    .gantt-department-card .department-document-item ul{margin:3px 0 0;padding-left:18px;list-style:disc outside}
    .department-document-columns{display:flex;gap:14px;min-width:0}
    .department-document-columns ul{flex:1 1 0;min-width:0}
    .gantt-department-card .department-document-item li{display:list-item;margin:1px 0;line-height:1.08;break-inside:avoid-column;overflow-wrap:anywhere}
    .department-duration{align-self:flex-end;margin-top:auto;padding-top:8px;text-align:right;color:var(--department-duration-color);max-width:100%}
    .department-duration-main{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px 6px}
    .department-duration-part{white-space:nowrap}
    .department-duration-number{font:900 26px/1.1 Arial,sans-serif}
    .department-duration-unit{display:inline-block;margin-left:4px;font:800 10px/1.2 Arial,sans-serif;letter-spacing:.04em}
    .department-actual-production-note{display:block;margin-top:3px;font:800 10px/1.3 Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#dc2626;overflow-wrap:anywhere}
    .department-duration-note{display:block;margin-top:2px;color:#92400e;font:700 7px/1.3 Arial,sans-serif}
    .department-duration-pending{font:700 8px/1.3 Arial,sans-serif;color:#64748b}
    .supporting-documents-footer{margin-top:8px;border-top:1px solid #cbd5e1;padding-top:5px;font:10px/1.18 Arial,sans-serif;color:#475569}
    .supporting-documents-list{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:3px}
    .supporting-department{min-width:140px}
    .down-arrow-grid{height:25px;align-items:center}
    .down-arrow{text-align:center;font-size:17px;line-height:1;color:#94a3b8}
    .evidence-card{min-width:0;min-height:104px;padding:8px 9px;border:2px solid transparent;border-radius:7px;background:var(--department-fill) padding-box,var(--department-gradient) border-box}
    .evidence-card.single-phase-card{border:2px solid var(--single-phase-color);background:var(--department-fill)}
    .evidence-header{display:flex;justify-content:space-between;gap:5px;margin-bottom:5px;padding-bottom:5px;border-bottom:1px solid #e2e8f0;color:#475569;font:800 7px Arial,sans-serif;letter-spacing:.06em}
    .evidence-header span:last-child{flex:0 0 auto;color:#0f172a}
    .evidence-item{padding:5px 0;border-bottom:1px solid #edf1f5}
    .evidence-item:last-child{border-bottom:0}
    .evidence-line{display:flex;align-items:flex-start;gap:4px;min-width:0;font-size:8px;line-height:1.25;color:#1e293b}
    .evidence-number{flex:0 0 auto;width:12px;height:12px;border-radius:50%;background:#e2e8f0;text-align:center;font:800 7px/12px Arial,sans-serif;color:#334155}
    .kind{flex:0 0 auto;border-radius:3px;padding:1px 3px;font:800 6px Arial,sans-serif;letter-spacing:.04em}
    .kind-form{background:#e0f2fe;color:#075985}
    .kind-rc{background:#ffedd5;color:#9a3412}
    .evidence-title{min-width:0;flex:1;overflow-wrap:anywhere;font-weight:700}
    .evidence-meta{margin:3px 0 0 16px;font:700 6px Arial,sans-serif;color:#64748b;letter-spacing:.03em}
    .evidence-description{margin:3px 0 0 16px;font-size:7px;line-height:1.25;color:#475569;overflow-wrap:anywhere}
    .empty-evidence{padding:8px 0;font-size:7px;color:#94a3b8}
    ${alignedStyles}
    .footer{margin-top:9px;border-top:1px solid #cbd5e1;padding-top:5px;font-size:9px;color:#64748b}
  </style>
  <div class="document-header">
    <div><div class="kicker">${documentTitle}</div><h1>${escapeHtml(projectName)}</h1>${deliveryTag ? `<div class="delivery-tag${deliveryTag.fobYard ? " fob" : ""}">${escapeHtml(deliveryTag.label)}</div>` : ""}</div>
    <div class="project-meta">${projectNumber ? `<div class="project-number"><span class="project-number-label">Job Number</span><span>${escapeHtml(projectNumber)}</span></div>` : ""}<div>Phases · Departments · ${options.gantt ? "Release Conditions · Gantt Chart" : "Release Conditions · Forms"}</div></div>
  </div>
  <div class="phase-ribbon"></div>
  <div class="coverage-row">${aligned ? '<div class="coverage-caption">PHASE</div>' : ""}<div class="phase-row">${phaseHtml}</div></div>
  <div class="section-title">Department coverage · color segments match the phase colors above</div>
  <div class="coverage-row">${aligned ? '<div class="coverage-caption">RESPONSIBLE DEPARTMENTS</div>' : ""}<div class="department-grid">${departmentHtml}</div></div>
  ${pendingPhases.length || pendingDepartments.length ? `<p class="gantt-note">No scheduled duration: ${[...pendingPhases.map((phase) => phase.node.title), ...pendingDepartments.map((column) => column.label)].map(escapeHtml).join(" · ")}</p>` : ""}
  ${options.gantt ? processGanttPdfHtml(file, new Map(phases.map((phase) => [phase.node.id, phase.color])), { salesRowsWithoutBars: true }) : `<div class="down-arrow-grid">${downArrows}</div><div class="evidence-grid">${evidenceHtmlRows}</div>`}
  ${supportingDocumentsHtml}
  <div class="footer">${options.gantt ? `${file.calendar ? "Calendar dates use the formal Sales-to-Technical handover as the start date. Grey intervals mark days off inside each task’s total duration; actual work equals total calendar days minus non-overlapping shutdown, statutory holiday and weekend days." : "Sales lead customer qualification before Day 1 is excluded from the elapsed-day totals. Day 1 is the formal Sales-to-Technical handover."} Phase and department color boundaries align with the Gantt time axis. Department cards show phase coverage; their widths do not represent individual task timing. ${file.releaseConditionInbox?.length || 0} unassigned condition(s) are not scheduled.` : "Department names are shown once. Phase-specific chapters, partial involvement, forms, and release conditions are listed with their source phase."}</div>`;

  document.body.appendChild(container);
  try {
    await document.fonts?.ready;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    fitSwimlaneLayout(container, {
      options,
      aligned,
      canvasWidth,
      columns,
      coverage,
      gap,
      handoff,
      phases,
    });
    const width = Math.ceil(container.offsetWidth);
    const height = Math.ceil(container.offsetHeight);
    if (!width || !height)
      throw new Error("The High Level Process System Flowchart PDF preview could not be laid out.");
    const pixelRatio = exportPixelRatio(width, height);
    const image = await toPng(container, {
      backgroundColor: "#ffffff",
      pixelRatio,
      cacheBust: true,
      width,
      height,
      style: { width: `${width}px`, height: `${height}px` },
    });
    const pageWidth = 17 * 25.4;
    const pageHeight = 11 * 25.4;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [pageWidth, pageHeight],
      compress: true,
    });
    const imageScale = Math.min(pageWidth / width, pageHeight / height);
    const imageWidth = width * imageScale;
    const imageHeight = height * imageScale;
    pdf.addImage(
      image,
      "PNG",
      (pageWidth - imageWidth) / 2,
      (pageHeight - imageHeight) / 2,
      imageWidth,
      imageHeight,
      "workflow-pdf-image",
      "FAST",
    );
    if (options.gantt) {
      const { appendProductionCalendarPages } = await import("@/lib/production-calendar-pdf");
      await appendProductionCalendarPages(pdf, file);
      const pages = pdf.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(pageWidth - 21, pageHeight - 7, 18, 5, "F");
        pdf.setFontSize(7);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`${page} / ${pages}`, pageWidth - 5, pageHeight - 3.5, { align: "right" });
      }
    }
    pdf.setProperties({
      title: `${projectName} - ${documentTitle}`,
      subject: options.gantt
        ? "Phases, departments and release condition Gantt chart"
        : "Phases, departments, release conditions and forms",
    });
    const safeName =
      `${projectNumber ? `${projectNumber}-` : ""}${projectName}`
        .toLocaleLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "workflow";
    pdf.save(
      `${safeName}-high-level-process-system-flowchart${options.gantt ? "-with-gantt-chart" : ""}.pdf`,
    );
  } finally {
    document.body.removeChild(container);
  }
}
