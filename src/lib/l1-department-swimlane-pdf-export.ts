import { getL1FallbackColor } from "@/lib/node-layout";
import { calendarDurationParts, conditionDurationLabel } from "@/lib/condition-duration";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import { buildProcessSchedule, salesHandoffTime } from "@/lib/process-schedule";
import { isProductionDepartmentName, isSalesDepartmentName, isTechnicalDepartmentName } from "@/lib/department-label";
import { PDF_SCHEDULE_LABEL_WIDTH, pdfScheduleExtent, processGanttPdfHtml } from "@/lib/process-gantt-pdf";
import { departmentDocumentSummary } from "@/lib/department-document-summary";
import type { DomainNode, HighLevelNode, WorkflowFile } from "@/types/workflow";

type PhaseColumn = {
  node: HighLevelNode;
  index: number;
  color: string;
  linkedNodes: DomainNode[];
};

type DepartmentConnection = {
  phaseIndex: number;
  phaseLabel: string;
  phaseTitle: string;
  phaseColor: string;
  chapterCode: string;
  partiallyInvolved: boolean;
  node: DomainNode;
};

type EvidenceItem = {
  kind: "Form" | "RC";
  code: string;
  title: string;
  description?: string;
  phaseLabel: string;
  chapterCode: string;
};

type DepartmentColumn = {
  key: string;
  label: string;
  connections: DepartmentConnection[];
  evidence: EvidenceItem[];
  colors: string[];
};

const DEPARTMENT_PALETTE = ["#0284c7", "#10b981", "#f97316", "#ca8a04", "#8b5cf6", "#f43f5e", "#14b8a6", "#64748b"];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeColor(value: string | undefined, fallback: string) {
  const candidate = value?.trim() || "";
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(candidate) ? candidate : fallback;
}

function rgba(color: string, alpha: number) {
  const hex = color.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function phaseColor(node: HighLevelNode, index: number) {
  return safeColor(node.backgroundColor, getL1FallbackColor(`${node.title} ${node.description}`, index));
}

function isChapterIdentity(node: DomainNode) {
  return Boolean(String(node.config.chapterNumber ?? "").trim()) || /^chapter\s*\d+$/i.test(node.title.trim());
}

function chapterCode(node: DomainNode) {
  const manual = String(node.config.chapterNumber ?? "").replace(/\D/g, "");
  const title = node.title.trim().match(/^chapter\s*(\d+)$/i)?.[1];
  const stage = String(node.config.stage ?? "").trim().match(/^(?:(?:chapter|department)\s*)?(\d+)$/i)?.[1];
  const value = manual || title || stage;
  return value ? `CH ${value.padStart(2, "0")}` : "";
}

function isProjectCompleteNode(node: DomainNode) {
  return node.type === "terminal" ||
    node.id === "project-complete" ||
    node.id === "close-out" ||
    /^project\s+complete$/i.test(node.title.trim());
}

function departmentIdentity(node: DomainNode) {
  const title = node.title.trim();
  const stage = String(node.config.stage ?? "").trim();
  const stageIsNumber = /^(?:(?:chapter|department)\s*)?\d+$/i.test(stage);
  const titleIsChapter = /^chapter\s*\d+$/i.test(title);
  const raw = stage && !stageIsNumber
    ? stage
    : title && !titleIsChapter
      ? title
      : node.description.trim();
  const clean = raw
    .replace(/\s+partially\s+involved\b/gi, "")
    .replace(/^(?:department|chapter|stage)\s*/i, "")
    .replace(/\s+department$/i, "")
    .trim();
  const isDefaultStart = (node.type === "projectStart" || node.id === "project-start") && !isChapterIdentity(node) && /^(project\s+)?start$/i.test(clean);
  const label = clean
    ? isDefaultStart ? "Project Start" : /\bdepartment$/i.test(clean) ? clean : `${clean} Department`
    : "Department";
  return { key: label.toLocaleLowerCase(), label };
}

function isPartiallyInvolved(node: DomainNode) {
  return /\bpartially\s+involved\b/i.test(`${node.title} ${node.description}`);
}

function phaseLabel(node: HighLevelNode, index: number) {
  const titleNumber = node.title.match(/\d+/)?.[0] || String(index + 1);
  return `P${titleNumber}`;
}

function linkedNodeIds(phase: HighLevelNode, file: WorkflowFile, nodeById: Map<string, DomainNode>) {
  const explicit = phase.linkedLayer2NodeIds ?? phase.linkedDetailedNodeIds ?? [];
  if (explicit.length) return Array.from(new Set(explicit)).filter((id) => nodeById.has(id));

  const l2PhaseById = new Map(file.graph.nodes.filter((node) => node.type === "phase").map((node) => [node.id, node]));
  return file.graph.nodes
    .filter((node) => node.type !== "phase" && node.type !== "gate" && node.type !== "decision" && node.type !== "approval")
    .filter((node) => {
      let parentId = file.layout.nodes[node.id]?.parentId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = l2PhaseById.get(parentId);
        if (parent) return parent.title.trim().toLocaleLowerCase() === phase.title.trim().toLocaleLowerCase();
        parentId = file.layout.nodes[parentId]?.parentId;
      }
      return node.config.phaseId === phase.id;
    })
    .map((node) => node.id);
}

function conditionEvidence(node: DomainNode, phase: PhaseColumn): EvidenceItem[] {
  return node.conditions.flatMap((condition) => {
    const label = condition.label?.trim() || condition.description?.trim() || "";
    if (!label) return [];
    const description = condition.description?.trim();
    return [{
      kind: "RC" as const,
      code: "RC",
      title: `${label}${conditionDurationLabel(condition) ? ` · ${conditionDurationLabel(condition)}` : ""}`,
      description: description && description.toLocaleLowerCase() !== label.toLocaleLowerCase() ? description : undefined,
      phaseLabel: phaseLabel(phase.node, phase.index),
      chapterCode: chapterCode(node),
    }];
  });
}

function formsForNode(node: DomainNode, phase: PhaseColumn, file: WorkflowFile): EvidenceItem[] {
  const linkedConditionIds = new Set(
    node.conditions.map((condition) => condition.linkedExecutionItemId).filter((id): id is string => Boolean(id)),
  );
  const executionForms = (file.execution?.items || [])
    .filter((item) => item.linkedLayer2NodeId === node.id || linkedConditionIds.has(item.id))
    .map((item) => ({
      kind: "Form" as const,
      code: item.documentCode || item.documentNumber || item.catalogId || "FORM",
      title: item.title,
      description: item.description?.trim() || undefined,
      phaseLabel: phaseLabel(phase.node, phase.index),
      chapterCode: chapterCode(node),
    }));
  const documents = node.documents.flatMap((document, index) => {
    const title = document.trim();
    if (!title || executionForms.some((form) => form.title.toLocaleLowerCase() === title.toLocaleLowerCase())) return [];
    return [{
      kind: "Form" as const,
      code: `DOC-${String(index + 1).padStart(2, "0")}`,
      title,
      phaseLabel: phaseLabel(phase.node, phase.index),
      chapterCode: chapterCode(node),
    }];
  });
  return [...executionForms, ...documents];
}

function blendWithWhite(color: string, amount: number) {
  const hex = color.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  const value = Number.parseInt(normalized, 16);
  const channel = (shift: number) => Math.round(255 - (255 - ((value >> shift) & 255)) * amount);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function gradient(colors: string[], tint = 1) {
  const unique = Array.from(new Set(colors));
  if (unique.length <= 1) {
    // One-phase departments use that phase's solid color; gradients are only
    // reserved for departments connected to multiple phases.
    const color = unique[0] || "#64748b";
    return tint >= 1 ? color : blendWithWhite(color, tint);
  }
  const stops = unique.map((color, index) => {
    const renderedColor = tint >= 1 ? color : blendWithWhite(color, tint);
    const position = (index / (unique.length - 1)) * 100;
    return `${renderedColor} ${position}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function makeColumns(phases: PhaseColumn[], file: WorkflowFile) {
  const columnsByKey = new Map<string, DepartmentColumn>();

  phases.forEach((phase) => {
    for (const node of phase.linkedNodes) {
      if (["phase", "gate", "decision", "approval"].includes(node.type) || isProjectCompleteNode(node)) continue;
      const identity = departmentIdentity(node);
      let column = columnsByKey.get(identity.key);
      if (!column) {
        column = {
          key: identity.key,
          label: identity.label,
          connections: [],
          evidence: [],
          colors: [],
        };
        columnsByKey.set(identity.key, column);
      }

      const existing = column.connections.find((connection) => connection.phaseIndex === phase.index);
      if (existing) {
        existing.chapterCode = Array.from(new Set([existing.chapterCode, chapterCode(node)].filter(Boolean))).join(" · ");
        existing.partiallyInvolved ||= isPartiallyInvolved(node);
        existing.node = node;
      } else {
        column.connections.push({
          phaseIndex: phase.index,
          phaseLabel: phaseLabel(phase.node, phase.index),
          phaseTitle: phase.node.description.trim() || phase.node.title,
          phaseColor: phase.color,
          chapterCode: chapterCode(node),
          partiallyInvolved: isPartiallyInvolved(node),
          node,
        });
      }
      column.colors.push(phase.color);

      const nextEvidence = [...formsForNode(node, phase, file), ...conditionEvidence(node, phase)];
      for (const item of nextEvidence) {
        const key = `${item.kind}:${item.code}:${item.title.toLocaleLowerCase()}:${item.phaseLabel}:${item.chapterCode}`;
        if (!column.evidence.some((existingItem) => `${existingItem.kind}:${existingItem.code}:${existingItem.title.toLocaleLowerCase()}:${existingItem.phaseLabel}:${existingItem.chapterCode}` === key)) {
          column.evidence.push(item);
        }
      }
    }
  });

  const columns = Array.from(columnsByKey.values()).map((column) => ({
    ...column,
    connections: column.connections.sort((left, right) => left.phaseIndex - right.phaseIndex),
    evidence: column.evidence,
    colors: Array.from(new Set(column.colors)),
  }));
  const ordered = columns;

  // Any execution item without a linked chapter remains visible in a final
  // Unassigned column instead of silently disappearing from the export.
  const linkedIds = new Set(phases.flatMap((phase) => phase.linkedNodes.map((node) => node.id)));
  const linkedFormIds = new Set(
    phases.flatMap((phase) => phase.linkedNodes.flatMap((node) =>
      (file.execution?.items || [])
        .filter((item) => item.linkedLayer2NodeId === node.id || node.conditions.some((condition) => condition.linkedExecutionItemId === item.id))
        .map((item) => item.id),
    )),
  );
  const unassignedForms: EvidenceItem[] = (file.execution?.items || [])
    .filter((item) => !linkedFormIds.has(item.id) && (!item.linkedLayer2NodeId || !linkedIds.has(item.linkedLayer2NodeId)))
    .map((item) => ({
      kind: "Form",
      code: item.documentCode || item.documentNumber || item.catalogId || "FORM",
      title: item.title,
      description: item.description?.trim() || undefined,
      phaseLabel: "Unassigned",
      chapterCode: "",
    }));
  if (unassignedForms.length) {
    ordered.push({
      key: "unassigned",
      label: "Unassigned Forms",
      connections: [],
      evidence: unassignedForms,
      colors: ["#64748b"],
    });
  }

  // The final fallback is useful for workflows whose phase nodes were created
  // before explicit L1-to-L2 links existed.
  for (const column of ordered) {
    column.connections.sort((left, right) => left.phaseIndex - right.phaseIndex);
    column.colors = Array.from(new Set(column.connections.map((connection) => connection.phaseColor)));
  }
  return ordered;
}

/** Department coverage is schematic: divide each phase among its linked
 * departments, without using individual RC starts. Consecutive pieces of the
 * same department become one card, even when they span a phase boundary. */
function ganttCoverage(file: WorkflowFile, phases: PhaseColumn[], columns: DepartmentColumn[]) {
  const schedule = buildProcessSchedule(file);
  const handoff = salesHandoffTime(schedule);
  const { total } = pdfScheduleExtent(schedule.totalDays, handoff.originDay ?? 0);
  const ranges = phases.map((phase) => {
    const index = schedule.phases.findIndex((item) => item.id === phase.node.id);
    return index < 0 ? { start: 0, end: 0 } : schedule.phaseRanges[index];
  });
  const cards: { column?: DepartmentColumn; start: number; end: number }[] = [];
  ranges.forEach((range, phaseIndex) => {
    if (range.end <= range.start) return;
    const linked = columns.filter((column) => column.connections.some((connection) => connection.phaseIndex === phaseIndex));
    const portions: (DepartmentColumn | undefined)[] = linked.length ? linked : [undefined];
    const weights = portions.map((column) => {
      if (!column) return 1;
      const documents = departmentDocumentSummary(column.connections.map((connection) => connection.node));
      return 1 + (documents.legal.length + documents.customer.length) * .2;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let usedWeight = 0;
    portions.forEach((column, index) => {
      const start = range.start + (range.end - range.start) * usedWeight / totalWeight;
      usedWeight += weights[index];
      const end = range.start + (range.end - range.start) * usedWeight / totalWeight;
      const last = cards.at(-1);
      if (column && last?.column?.key === column.key && Math.abs(last.end - start) < .000001) last.end = end;
      else cards.push({ column, start, end });
    });
  });
  // Size the printed timeline for phase and department cards. A one-day bar
  // must not force a several-thousand-pixel page and shrink every PDF label.
  const minimumAxisWidth = Math.max(1180,
    ...ranges.filter((range) => range.end > range.start).map((range) => 110 * total / (range.end - range.start)),
    ...cards.filter((card) => card.column).map((card) => 100 * total / (card.end - card.start)));
  return { total, ranges, cards, minimumWidth: PDF_SCHEDULE_LABEL_WIDTH + Math.min(1900, minimumAxisWidth),
    scheduled: handoff.elapsedDays !== null && handoff.elapsedDays > 0 };
}

function evidenceHtml(column: DepartmentColumn) {
  if (!column.evidence.length) {
    return `<div class="empty-evidence">No linked forms or release conditions</div>`;
  }
  return column.evidence.map((item, index) => `
    <div class="evidence-item">
      <div class="evidence-line"><span class="evidence-number">${index + 1}</span><span class="kind kind-${item.kind.toLocaleLowerCase()}">${escapeHtml(item.kind)}${item.kind === "Form" && item.code ? ` · ${escapeHtml(item.code)}` : ""}</span><span class="evidence-title">${escapeHtml(item.title)}${item.kind === "RC" ? "*" : ""}</span></div>
      <div class="evidence-meta">${escapeHtml(item.phaseLabel)}${item.chapterCode ? ` · ${escapeHtml(item.chapterCode)}` : ""}</div>
      ${item.description ? `<div class="evidence-description">${escapeHtml(item.description)}</div>` : ""}
    </div>`).join("");
}

export async function exportL1DepartmentSwimlanePdf(file: WorkflowFile, options: { gantt?: boolean } = {}) {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");
  const highLevelNodes = file.highLevel?.graph.nodes || [];
  const highLevelEdges = file.highLevel?.graph.edges || [];
  const orderedNodes = orderHighLevelNodes(highLevelNodes, highLevelEdges).filter((node) => node.type !== "primaryGate");
  if (!orderedNodes.length) throw new Error("Add L1 phases before exporting the Department Swimlane PDF.");

  const nodeById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const phases: PhaseColumn[] = orderedNodes.map((node, index) => ({
    node,
    index,
    color: phaseColor(node, index),
    linkedNodes: linkedNodeIds(node, file, nodeById).map((id) => nodeById.get(id)).filter((item): item is DomainNode => Boolean(item)),
  }));
  const allColumns = makeColumns(phases, file);
  const columns = allColumns.filter((column) =>
    !options.gantt || column.connections.some((connection) => connection.node.conditions.length > 0));
  if (!columns.length) throw new Error("Link departments to L1 phases before exporting the Department Swimlane PDF.");
  const documentsByDepartment = new Map(allColumns.map((column) => [column.key,
    departmentDocumentSummary(column.connections.map((connection) => connection.node))]));

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
  const projectNumber = workflowLegacyJobNumber(file) || [
    file.operations?.identity?.projectNumber,
    file.operations?.identity?.projectId,
    file.operations?.projectNumber,
  ].map((value) => String(value || "").trim()).find((value) => /^\d{5}$/.test(value)) || "";
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
  const phaseHtml = phases.map((phase, index) => {
    if (aligned && coverage!.ranges[index].end <= coverage!.ranges[index].start) return "";
    const title = phase.node.description.trim() || phase.node.title;
    const departmentCount = columns.filter((column) => column.connections.some((connection) => connection.phaseIndex === phase.index)).length;
    const scheduleIndex = schedule.phases.findIndex((item) => item.id === phase.node.id);
    const range = schedule.phaseRanges[scheduleIndex];
    const tasks = schedule.tasks.filter((task) => task.phaseIndex === scheduleIndex && scheduleIndex >= 0);
    const scheduled = tasks.filter((task) => task.end !== undefined);
    const containsSales = options.gantt && tasks.some((task) => isSalesDepartmentName(task.department));
    const countedTasks = containsSales ? scheduled.filter((task) => !isSalesDepartmentName(task.department)) : scheduled;
    const technicalStarts = countedTasks.filter((task) => isTechnicalDepartmentName(task.department)).map((task) => task.start!);
    const countedStart = technicalStarts.length ? Math.min(...technicalStarts) : countedTasks.length ? Math.min(...countedTasks.map((task) => task.start!)) : 0;
    const days = containsSales
      ? countedTasks.length ? Math.max(0, Math.max(...countedTasks.map((task) => task.end!)) - countedStart) : 0
      : range ? range.end - range.start : 0;
    const partial = countedTasks.length < (containsSales ? tasks.filter((task) => !isSalesDepartmentName(task.department)).length : tasks.length);
    const durationHtml = containsSales && !countedTasks.length
      ? '<span class="phase-duration-pending">Timing begins with Technical work</span>'
      : countedTasks.length
      ? `<div class="phase-duration-main">${calendarDurationParts(days).map((part, index, parts) => `<span class="phase-duration-part"><span class="phase-duration-number">${part.value}${partial && index === parts.length - 1 ? "+" : ""}</span><span class="phase-duration-unit">${part.unit}</span></span>`).join("")}</div>${partial ? '<span class="phase-duration-note">Partial estimate</span>' : ""}`
      : '<span class="phase-duration-pending">Duration not set</span>';
    return `<div class="phase-card" data-pdf-phase-id="${escapeHtml(phase.node.id)}" style="--phase-color:${phase.color};--phase-tint:${rgba(phase.color, 0.09)};">
      <div class="phase-meta"><span>${escapeHtml(phase.node.title || `PHASE ${index + 1}`)}</span><span class="phase-involvement">${departmentCount} ${departmentCount === 1 ? "Department" : "Departments"} Involved</span></div>
      <div class="phase-title">${escapeHtml(title)}</div>
      ${phase.node.code?.trim() ? `<div class="phase-code">${escapeHtml(phase.node.code.trim())}</div>` : ""}
      <div class="phase-duration">${durationHtml}</div>
    </div>`;
  }).join("");

  const departmentCards = aligned ? coverage!.cards : columns.map((column) => ({ column, start: 0, end: 0 }));
  const departmentHtml = departmentCards.map((card, index) => {
    const column = card.column;
    if (!column) return '<div class="department-spacer"></div>';
    const colors = column.colors.length ? column.colors : [DEPARTMENT_PALETTE[index % DEPARTMENT_PALETTE.length]];
    const borderGradient = gradient(colors);
    const singlePhaseColor = column.connections.length === 1 ? column.connections[0].phaseColor : undefined;
    const cardClass = singlePhaseColor ? "department-card single-phase-card" : "department-card";
    const legalTitles = options.gantt ? documentsByDepartment.get(column.key)?.legal || [] : [];
    const customerTitles = options.gantt ? documentsByDepartment.get(column.key)?.customer || [] : [];
    const nodeIds = new Set(column.connections.map((connection) => connection.node.id));
    const departmentTasks = schedule.tasks.filter((task) => nodeIds.has(task.nodeId));
    const scheduledTasks = departmentTasks.filter((task) => task.start !== undefined && task.end !== undefined);
    const departmentDays = scheduledTasks.length
      ? Math.max(...scheduledTasks.map((task) => task.end!)) - Math.min(...scheduledTasks.map((task) => task.start!)) : undefined;
    const partialDuration = scheduledTasks.length < departmentTasks.length;
    const actualProductionNote = isProductionDepartmentName(column.label) && departmentDays !== undefined
      ? '<span class="department-actual-production-note" data-department-actual-production-time>+ Actual Production Time [Average Time Per Module is 2 Weeks]</span>' : "";
    const durationHtml = options.gantt && !isSalesDepartmentName(column.label) ? `<div class="department-duration" data-department-duration="${escapeHtml(column.label)}">${departmentDays === undefined
      ? '<span class="department-duration-pending">Duration not set</span>'
      : `<div class="department-duration-main">${calendarDurationParts(departmentDays).map((part, partIndex, parts) => `<span class="department-duration-part"><span class="department-duration-number">${part.value}${partialDuration && partIndex === parts.length - 1 ? "+" : ""}</span><span class="department-duration-unit">${part.unit}</span></span>`).join("")}</div>${actualProductionNote}${partialDuration ? '<span class="department-duration-note">Partial estimate</span>' : ""}`}</div>` : "";
    const partialInvolvement = column.connections.some((connection) => connection.partiallyInvolved);
    const phaseSegments = column.connections.map((connection) =>
      `<span class="phase-segment" data-phase-index="${connection.phaseIndex}" style="background:${connection.phaseColor};"></span>`,
    ).join("");
    return `<div class="${cardClass}${options.gantt ? " gantt-department-card" : ""}" data-coverage-start="${card.start}" data-coverage-end="${card.end}" style="--department-gradient:${borderGradient};--department-fill:${gradient(colors, 0.09)};--department-duration-color:${colors.at(-1)};${singlePhaseColor ? `--single-phase-color:${singlePhaseColor};` : ""}">
        <div class="department-heading"><div class="department-label">${escapeHtml(column.label)}</div>${partialInvolvement ? `<span class="partial-tag">Partially Involved</span>` : ""}</div>
        ${legalTitles.length || customerTitles.length ? `<div class="department-document-groups${legalTitles.length && customerTitles.length ? " dual-document-groups" : ""}">
          ${legalTitles.length ? `<div class="department-document-item" data-department-documents="${escapeHtml(column.label)}"><strong>Legal Documents</strong><ul>${legalTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul></div>` : ""}
          ${customerTitles.length ? `<div class="department-document-item" data-department-customer="${escapeHtml(column.label)}"><strong>Customer Information</strong><ul>${customerTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul></div>` : ""}
        </div>` : ""}
        ${durationHtml}
        ${phaseSegments ? `<div class="phase-strip" aria-hidden="true">${phaseSegments}</div>` : `<div class="unlinked-label">Not linked to a phase</div>`}
      </div>`;
  }).join("");
  const supportingDocumentsHtml = options.gantt && allColumns.some((column) => {
    const summary = documentsByDepartment.get(column.key);
    return Boolean(summary?.supporting.length || summary?.optional.length);
  })
    ? `<div class="supporting-documents-footer"><strong>Supporting Documents</strong><div class="supporting-documents-list">${allColumns.flatMap((column) => {
      const summary = documentsByDepartment.get(column.key);
      const titles = summary?.supporting || [];
      const optional = summary?.optional || [];
      const optionalTitles = new Set(optional.map((condition) => condition.title.toLocaleLowerCase()));
      const standaloneTitles = titles.filter((title) => !optionalTitles.has(title.toLocaleLowerCase()));
      return titles.length || optional.length ? [`<div class="supporting-department"><b>${escapeHtml(column.label)}</b><ul>${standaloneTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}${optional.map((condition) => `<li data-optional-condition="true">${escapeHtml(condition.title)} · ${escapeHtml(condition.duration)}</li>`).join("")}</ul></div>`] : [];
    }).join("")}</div></div>` : "";

  const downArrows = columns.map(() => `<div class="down-arrow">↓</div>`).join("");
  const evidenceHtmlRows = columns.map((column, index) => {
    const colors = column.colors.length ? column.colors : [DEPARTMENT_PALETTE[index % DEPARTMENT_PALETTE.length]];
    const singlePhaseColor = column.connections.length === 1 ? column.connections[0].phaseColor : undefined;
    const cardClass = singlePhaseColor ? "evidence-card single-phase-card" : "evidence-card";
    return `<div class="${cardClass}" style="--department-gradient:${gradient(colors)};--department-fill:${gradient(colors, 0.065)};${singlePhaseColor ? `--single-phase-color:${singlePhaseColor};` : ""}">
      <div class="evidence-header"><span>FORMS & RELEASE CONDITIONS</span><span>${column.evidence.length}</span></div>
      ${evidenceHtml(column)}
    </div>`;
  }).join("");

  const alignedStyles = aligned ? `
    .phase-ribbon,.phase-row,.department-grid{margin-left:${PDF_SCHEDULE_LABEL_WIDTH + 1}px;margin-right:1px}
    .coverage-row{position:relative}
    .coverage-caption{position:absolute;left:0;top:0;bottom:0;width:${PDF_SCHEDULE_LABEL_WIDTH - 16}px;display:flex;align-items:center;font:900 30px/1.1 Arial,sans-serif;letter-spacing:.04em;color:#334155}
    .department-grid{column-gap:0}
    .department-card{margin:0 3px;position:relative;padding-bottom:20px;box-shadow:none}
    .department-card:last-child{margin-right:-1px}
    .phase-strip{position:absolute;bottom:10px;left:9px;right:9px;margin:0;gap:0}
    .phase-segment{position:absolute;top:0;height:4px;min-width:0;border-radius:0}
  ` : "";
  const pendingPhases = aligned ? phases.filter((_, index) => coverage!.ranges[index].end <= coverage!.ranges[index].start) : [];
  const pendingDepartments = aligned ? columns.filter((column) => !coverage!.cards.some((card) => card.column?.key === column.key)) : [];
  container.innerHTML = `<style>
    *{box-sizing:border-box}
    .document-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;border-bottom:2px solid #0f172a;padding-bottom:12px}
    .kicker{font:800 11px Arial,sans-serif;letter-spacing:.13em;color:#475569;text-transform:uppercase}
    h1{margin:5px 0 0;font-size:25px;line-height:1.12;color:#0f172a;overflow-wrap:anywhere}
    .project-meta{text-align:right;font-size:11px;line-height:1.4;color:#475569}
    .project-number{display:flex;align-items:baseline;justify-content:flex-end;gap:5px;font-size:12px;font-weight:800;color:#1e293b}
    .project-number-label{font-size:8px;letter-spacing:.08em;color:#64748b}
    .phase-ribbon{height:7px;margin:10px 0 7px;border-radius:99px;background:linear-gradient(90deg,${phases.map((phase,index)=>`${phase.color} ${(index/phases.length)*100}% ${((index+1)/phases.length)*100}%`).join(",")})}
    .section-title{margin:12px 0 6px;font:800 11px Arial,sans-serif;letter-spacing:.1em;color:#334155;text-transform:uppercase}
    .phase-row{display:grid;grid-template-columns:repeat(${phases.length},minmax(0,1fr));column-gap:0;align-items:stretch}
    .phase-card{position:relative;display:flex;flex-direction:column;min-height:82px;padding:10px 12px;border:1px solid rgba(15,23,42,.13);border-top:4px solid var(--phase-color);border-radius:8px;background:linear-gradient(135deg,var(--phase-tint),#fff 72%);}
    .phase-card:not(:last-child)::after{content:"→";position:absolute;z-index:2;right:-9px;top:27px;color:#64748b;font-size:17px;font-weight:800}
    .phase-meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:4px 8px;font:800 12px Arial,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--phase-color)}
    .phase-meta span:first-child{flex-shrink:0}
    .phase-involvement{margin-left:auto;text-align:right;white-space:nowrap;letter-spacing:0;text-transform:none;color:#334155}
    .phase-title{margin-top:6px;font-size:21px;font-weight:800;line-height:1.18;color:#0f172a;overflow-wrap:anywhere}
    .phase-duration{align-self:flex-end;margin-top:auto;padding-top:12px;text-align:right;color:var(--phase-color);max-width:100%}
    .phase-duration-main{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 8px}
    .phase-duration-part{white-space:nowrap}
    .phase-duration-number{font:900 26px/1.1 Arial,sans-serif}
    .phase-duration-unit{display:inline-block;margin-left:4px;font:800 11px/1.3 Arial,sans-serif;letter-spacing:.04em}
    .phase-duration-note{display:block;margin-top:2px;color:#92400e;font:700 8px/1.3 Arial,sans-serif}
    .phase-duration-pending{font:700 10px/1.3 Arial,sans-serif;color:#64748b}
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
    <div><div class="kicker">${documentTitle}</div><h1>${escapeHtml(projectName)}</h1></div>
    <div class="project-meta">${projectNumber ? `<div class="project-number"><span class="project-number-label">Job Number</span><span>${escapeHtml(projectNumber)}</span></div>` : ""}<div>Phases · Departments · ${options.gantt ? "Release Conditions · Gantt Chart" : "Release Conditions · Forms"}</div></div>
  </div>
  <div class="phase-ribbon"></div>
  <div class="coverage-row">${aligned ? '<div class="coverage-caption">PHASE</div>' : ""}<div class="phase-row">${phaseHtml}</div></div>
  <div class="section-title">Department coverage · color segments match the phase colors above</div>
  <div class="coverage-row">${aligned ? '<div class="coverage-caption">RESPONSIBLE DEPARTMENTS</div>' : ""}<div class="department-grid">${departmentHtml}</div></div>
  ${pendingPhases.length || pendingDepartments.length ? `<p class="gantt-note">No scheduled duration: ${[...pendingPhases.map((phase) => phase.node.title), ...pendingDepartments.map((column) => column.label)].map(escapeHtml).join(" · ")}</p>` : ""}
  ${options.gantt ? processGanttPdfHtml(file, new Map(phases.map((phase) => [phase.node.id, phase.color])), { salesRowsWithoutBars: true }) : `<div class="down-arrow-grid">${downArrows}</div><div class="evidence-grid">${evidenceHtmlRows}</div>`}
  ${supportingDocumentsHtml}
  <div class="footer">${options.gantt ? `Sales lead customer qualification before Day 1 is excluded from the elapsed-day totals. Day 1 is the formal Sales-to-Technical handover. Phase and department color boundaries align with the Gantt time axis. Department cards show phase coverage; their widths do not represent individual task timing. ${file.releaseConditionInbox?.length || 0} unassigned condition(s) are not scheduled.` : "Department names are shown once. Phase-specific chapters, partial involvement, forms, and release conditions are listed with their source phase."}</div>`;

  document.body.appendChild(container);
  try {
    await document.fonts?.ready;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    // Expand the layout itself to the sheet aspect ratio before rasterizing.
    // This uses spare paper width without stretching the text or task bars.
    if (options.gantt) {
      const sheetWidth = Math.max(canvasWidth, Math.ceil(container.offsetHeight * 17 / 11));
      container.style.width = `${sheetWidth}px`;
    }
    const targetHeight = container.offsetWidth * 11 / 17;
    if (options.gantt && container.offsetHeight > targetHeight) {
      const rows = container.querySelectorAll(".pdf-gantt .gantt-row").length;
      const excessPerRow = rows ? (container.offsetHeight - targetHeight) / rows : 0;
      const rowHeight = Math.max(20, 21 - excessPerRow);
      const compactRows = document.createElement("style");
      compactRows.textContent = `
        .pdf-gantt .gantt-row:not([data-pdf-gantt-task]),.pdf-gantt .gantt-track{min-height:${rowHeight}px}
        .pdf-gantt .gantt-label{padding:2px 9px}
        .pdf-gantt .gantt-department{padding:4px 10px}
        .pdf-gantt .gantt-bar{height:${Math.max(26, rowHeight - 1)}px}
      `;
      container.appendChild(compactRows);
    }
    const initialHeight = container.offsetHeight;
    const textScale = Math.min(1.2, Math.max(1, Math.sqrt(targetHeight / initialHeight)));
    if (textScale > 1.01) {
      const adaptiveType = document.createElement("style");
      adaptiveType.textContent = `
        .phase-title{font-size:${21 * textScale}px}
        .department-label{font-size:${20 * textScale}px}
        .department-document-item,.department-document-item strong{font-size:${11 * textScale}px}
        .gantt-department-card .department-document-item,.gantt-department-card .department-document-item strong{font-size:${16 * textScale}px}
        .gantt-label{font-size:${22 * textScale}px}
        .gantt-department{font-size:${14 * textScale}px}
        .gantt-axis span{font-size:${22 * textScale}px}
        .gantt-bar-text{font-size:${19 * textScale}px}
        .evidence-line{font-size:${8 * textScale}px}
      `;
      container.appendChild(adaptiveType);
    }
    if (container.offsetHeight < targetHeight && options.gantt && handoff.hasSalesDepartment) {
      const ganttRows = Array.from(container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-row, .pdf-gantt .gantt-department"));
      const perRow = ganttRows.length ? (targetHeight - container.offsetHeight) / ganttRows.length : 0;
      ganttRows.forEach((row) => { row.style.minHeight = `${row.offsetHeight + perRow}px`; });
    } else if (container.offsetHeight < targetHeight) {
      const phaseRow = container.querySelector<HTMLElement>(".phase-row");
      const departmentGrid = container.querySelector<HTMLElement>(".department-grid");
      const ganttRows = Array.from(container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-row, .pdf-gantt .gantt-department"));
      const evidenceRows = Array.from(container.querySelectorAll<HTMLElement>(".evidence-card"));
      const remaining = targetHeight - container.offsetHeight;
      const phaseShare = remaining * .16;
      const departmentShare = remaining * .19;
      if (phaseRow) {
        const height = phaseRow.offsetHeight + phaseShare;
        phaseRow.querySelectorAll<HTMLElement>(".phase-card").forEach((card) => { card.style.minHeight = `${height}px`; });
      }
      if (departmentGrid) {
        const height = departmentGrid.offsetHeight + departmentShare;
        departmentGrid.querySelectorAll<HTMLElement>(".department-card").forEach((card) => { card.style.minHeight = `${height}px`; });
      }
      const detailRows = options.gantt ? ganttRows : evidenceRows;
      const detailShare = remaining - phaseShare - departmentShare;
      if (detailRows.length) {
        const perRow = options.gantt ? detailShare / detailRows.length : detailShare;
        detailRows.forEach((row) => { row.style.minHeight = `${row.offsetHeight + perRow}px`; });
      } else if (departmentGrid) {
        departmentGrid.querySelectorAll<HTMLElement>(".department-card").forEach((card) => {
          card.style.minHeight = `${card.offsetHeight + detailShare}px`;
        });
      }
    }
    const alignTimeline = () => {
    if (aligned) {
      const { total, ranges, cards } = coverage!;
      const axis = container.querySelector<HTMLElement>(".gantt-axis")!.getBoundingClientRect();
      const x = (day: number) => axis.left + day / total * axis.width;
      const activeRanges = ranges.filter((range) => range.end > range.start);
      const scheduleEnd = Math.max(...ranges.map((range) => range.end));
      const trailing = Math.max(0, total - scheduleEnd);
      // The last cards stretch to the axis end, so their color lines must too.
      const shownEnd = (end: number) => end >= scheduleEnd ? total : end;
      const extendLastToAxisEnd = (widths: number[]) => widths.map((width, index) =>
        `${width + (index === widths.length - 1 ? trailing / total * axis.width : 0)}px`).join(" ");
      container.querySelector<HTMLElement>(".phase-row")!.style.gridTemplateColumns = extendLastToAxisEnd(activeRanges.map((range) => (range.end - range.start) / total * axis.width));
      container.querySelector<HTMLElement>(".department-grid")!.style.gridTemplateColumns = extendLastToAxisEnd(cards.map((card) => (card.end - card.start) / total * axis.width));
      container.querySelector<HTMLElement>(".phase-ribbon")!.style.background = `linear-gradient(90deg, ${phases.flatMap((phase, index) => {
        const range = ranges[index];
        return range.end > range.start ? [`${phase.color} ${range.start / total * 100}% ${shownEnd(range.end) / total * 100}%`] : [];
      }).join(", ")})`;
      // Project each card's color strips onto the same global
      // axis. Task starts never enter this calculation, so parallel work keeps
      // the original single-row department presentation.
      container.querySelectorAll<HTMLElement>(".department-card").forEach((card) => {
        const start = Number(card.dataset.coverageStart);
        const end = Number(card.dataset.coverageEnd);
        card.querySelectorAll<HTMLElement>(".phase-segment").forEach((segment) => {
          const index = Number(segment.dataset.phaseIndex);
          const range = ranges[index];
          const from = Math.max(start, range.start);
          const to = Math.min(shownEnd(end), shownEnd(range.end));
          if (to <= from) { segment.style.display = "none"; return; }
          const strip = segment.parentElement!.getBoundingClientRect();
          segment.style.left = `${x(from) - strip.left}px`;
          segment.style.width = `${x(to) - x(from)}px`;
        });
      });
    } else {
      // Both rows share physical color boundaries. A department shared by two
      // phases places their boundary halfway between its two color segments.
      const phaseRow = container.querySelector<HTMLElement>(".phase-row")!;
      const rowBounds = phaseRow.getBoundingClientRect();
      const segments = Array.from(container.querySelectorAll<HTMLElement>(".phase-segment"));
      const boundaries = [0];
      for (let index = 0; index < phases.length - 1; index += 1) {
        const current = segments.filter((segment) => Number(segment.dataset.phaseIndex) === index);
        const next = segments.filter((segment) => Number(segment.dataset.phaseIndex) === index + 1);
        const end = current.length ? Math.max(...current.map((segment) => segment.getBoundingClientRect().right)) : undefined;
        const start = next.length ? Math.min(...next.map((segment) => segment.getBoundingClientRect().left)) : undefined;
        const boundary = end !== undefined && start !== undefined
          ? (end + start) / 2 - rowBounds.left
          : rowBounds.width * (index + 1) / phases.length;
        boundaries.push(Math.max(boundaries[index] + 1, Math.min(rowBounds.width - (phases.length - index - 1), boundary)));
      }
      boundaries.push(rowBounds.width);
      phaseRow.style.gridTemplateColumns = phases.map((_, index) => `${boundaries[index + 1] - boundaries[index]}px`).join(" ");
      container.querySelector<HTMLElement>(".phase-ribbon")!.style.background = `linear-gradient(90deg, ${phases.map((phase, index) =>
        `${phase.color} ${boundaries[index] / rowBounds.width * 100}% ${boundaries[index + 1] / rowBounds.width * 100}%`,
      ).join(", ")})`;
    }
    if (options.gantt) {
      const handoffLine = container.querySelector<HTMLElement>(".gantt-day-one-line")?.getBoundingClientRect();
      if (handoffLine) container.querySelectorAll<HTMLElement>(".gantt-task-label").forEach((label) => {
        // The Sales-lead interval contains no colored task bars. Use that
        // available space for full, single-line condition names, stopping
        // early if this particular task begins before the handoff line.
        const barLeft = label.closest(".gantt-row")?.querySelector<HTMLElement>(".gantt-bar")?.getBoundingClientRect().left;
        const rightEdge = Math.min(handoffLine.left, barLeft ?? Infinity);
        label.style.width = `${Math.max(PDF_SCHEDULE_LABEL_WIDTH, rightEdge - label.getBoundingClientRect().left - 4)}px`;
      });
    }
    };
    alignTimeline();
    if (options.gantt) {
      const grid = container.querySelector<HTMLElement>(".department-grid");
      const cards = Array.from(grid?.querySelectorAll<HTMLElement>(".gantt-department-card") || []);
      if (grid && cards.length) {
        // Measure each card at its natural height before the shared grid row
        // stretches it. Narrow cards establish a useful height for the wider
        // document lists; the print layout can then use its spare width.
        grid.style.alignItems = "start";
        cards.forEach((card) => { card.style.minHeight = ""; });
        const widest = Math.max(...cards.map((card) => card.offsetWidth));
        const narrow = cards.filter((card) => card.offsetWidth < widest * .68);
        const referenceHeight = Math.max(...(narrow.length ? narrow : cards).map((card) => card.offsetHeight));
        cards.forEach((card) => {
          const legalList = card.querySelector<HTMLElement>("[data-department-documents] ul");
          const itemCount = legalList?.children.length || 0;
        const originalWidth = card === cards.at(-1) && aligned
          ? (coverage!.cards.at(-1)!.end - coverage!.cards.at(-1)!.start) / coverage!.total * container.querySelector<HTMLElement>(".gantt-axis")!.offsetWidth
          : card.offsetWidth;
        if (!legalList || itemCount < 5 || legalList.offsetWidth < 210 || originalWidth < widest * .78) return;
          legalList.style.columnCount = "2";
          legalList.style.columnFill = "balance";
          legalList.style.columnGap = "14px";
          if (itemCount >= 9 && legalList.offsetWidth >= 360 && card.offsetHeight > referenceHeight + 8) {
            legalList.style.columnCount = "3";
          }
        });
        grid.style.alignItems = "stretch";
      }
    }
    // Titles wrap between words; a card too narrow for its longest word shrinks the title.
    container.querySelectorAll<HTMLElement>(".department-label").forEach((label) => {
      for (let size = Number.parseFloat(getComputedStyle(label).fontSize); size > 11 && label.scrollWidth > label.clientWidth + 1; size -= 1) {
        label.style.fontSize = `${size - 1}px`;
      }
    });
    const salesLead = container.querySelector<HTMLElement>(".gantt-sales-lead");
    if (salesLead && salesLead.scrollWidth > salesLead.clientWidth + 1) {
      // Too narrow for one line: use up to two lines at the largest size that
      // fits, and let the axis row grow before the sheet is fitted to 11x17.
      salesLead.style.whiteSpace = "normal";
      for (let size = 19; size > 10; size -= 1) {
        salesLead.style.fontSize = `${size}px`;
        if (salesLead.scrollWidth <= salesLead.clientWidth + 1 && salesLead.offsetHeight <= size * 1.15 * 2 + 1) break;
      }
      const axis = salesLead.parentElement!;
      axis.style.minHeight = `${Math.max(axis.offsetHeight, salesLead.offsetHeight + 6)}px`;
    }
    if (options.gantt) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const desiredHeight = container.offsetWidth * 11 / 17;
        const currentHeight = container.offsetHeight;
        if (Math.abs(currentHeight - desiredHeight) <= 2) break;
        if (currentHeight > desiredHeight) {
          container.style.width = `${Math.ceil(currentHeight * 17 / 11)}px`;
        } else {
          const rows = Array.from(container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-row, .pdf-gantt .gantt-department"));
          const extra = rows.length ? (desiredHeight - currentHeight) / rows.length : 0;
          rows.forEach((row) => { row.style.minHeight = `${row.offsetHeight + extra}px`; });
        }
        alignTimeline();
      }
    }
    // Labels sit after their bars; one near the chart end moves before its bar.
    container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-bar-text").forEach((text) => {
      const track = text.parentElement!.getBoundingClientRect();
      if (text.getBoundingClientRect().right <= track.right - 2) return;
      const bar = text.previousElementSibling as HTMLElement;
      text.style.left = "auto";
      text.style.marginLeft = "0";
      text.style.right = `${track.right - bar.getBoundingClientRect().left + 6}px`;
    });
    container.querySelectorAll<HTMLElement>(".pdf-gantt .gantt-title").forEach((title) => {
      // Keep condition names on one line even when the lead interval is short.
      // Only titles that need it shrink; the task rows retain one height.
      for (let attempt = 0; attempt < 3 && title.scrollWidth > title.clientWidth + 1; attempt += 1) {
        const size = Number.parseFloat(getComputedStyle(title).fontSize);
        title.style.fontSize = `${Math.max(12, size * title.clientWidth / title.scrollWidth * .97)}px`;
      }
    });
    const width = Math.ceil(container.offsetWidth);
    const height = Math.ceil(container.offsetHeight);
    if (!width || !height) throw new Error("The High Level Process System Flowchart PDF preview could not be laid out.");
    const pixelRatio = Math.min(2, 12000 / Math.max(width, height), Math.sqrt(32_000_000 / (width * height)));
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
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageWidth, pageHeight], compress: true });
    const imageScale = Math.min(pageWidth / width, pageHeight / height);
    const imageWidth = width * imageScale;
    const imageHeight = height * imageScale;
    pdf.addImage(image, "PNG", (pageWidth - imageWidth) / 2, (pageHeight - imageHeight) / 2, imageWidth, imageHeight, "workflow-pdf-image", "FAST");
    pdf.setProperties({ title: `${projectName} - ${documentTitle}`, subject: options.gantt ? "Phases, departments and release condition Gantt chart" : "Phases, departments, release conditions and forms" });
    const safeName = `${projectNumber ? `${projectNumber}-` : ""}${projectName}`
      .toLocaleLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "workflow";
    pdf.save(`${safeName}-high-level-process-system-flowchart${options.gantt ? "-with-gantt-chart" : ""}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
