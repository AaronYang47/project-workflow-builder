import { getL1FallbackColor } from "@/lib/node-layout";
import { conditionDurationLabel } from "@/lib/condition-duration";
import { buildProcessSchedule, salesHandoffTime } from "@/lib/process-schedule";
import { PDF_SCHEDULE_LABEL_WIDTH, pdfScheduleExtent } from "@/lib/process-gantt-pdf";
import { departmentDocumentSummary } from "@/lib/department-document-summary";
import { buildProcessTimeline } from "@/lib/schedule-calendar";
import type { DomainNode, HighLevelNode, WorkflowFile } from "@/types/workflow";
import { escapeHtml } from "@/lib/html";

/** Data behind the L1 department swimlane PDF: phases, department columns, evidence and Gantt coverage. */

export type PhaseColumn = {
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
  kind: "Form" | "Step";
  code: string;
  title: string;
  description?: string;
  phaseLabel: string;
  chapterCode: string;
};

export type DepartmentColumn = {
  key: string;
  label: string;
  connections: DepartmentConnection[];
  evidence: EvidenceItem[];
  colors: string[];
};

export const DEPARTMENT_PALETTE = [
  "#0284c7",
  "#10b981",
  "#f97316",
  "#ca8a04",
  "#8b5cf6",
  "#f43f5e",
  "#14b8a6",
  "#64748b",
];

function safeColor(value: string | undefined, fallback: string) {
  const candidate = value?.trim() || "";
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(candidate) ? candidate : fallback;
}

export function rgba(color: string, alpha: number) {
  const hex = color.replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

export function phaseColor(node: HighLevelNode, index: number) {
  return safeColor(
    node.backgroundColor,
    getL1FallbackColor(`${node.title} ${node.description}`, index),
  );
}

function isChapterIdentity(node: DomainNode) {
  return (
    Boolean(String(node.config.chapterNumber ?? "").trim()) ||
    /^chapter\s*\d+$/i.test(node.title.trim())
  );
}

function chapterCode(node: DomainNode) {
  const manual = String(node.config.chapterNumber ?? "").replace(/\D/g, "");
  const title = node.title.trim().match(/^chapter\s*(\d+)$/i)?.[1];
  const stage = String(node.config.stage ?? "")
    .trim()
    .match(/^(?:(?:chapter|department)\s*)?(\d+)$/i)?.[1];
  const value = manual || title || stage;
  return value ? `CH ${value.padStart(2, "0")}` : "";
}

function isProjectCompleteNode(node: DomainNode) {
  return (
    node.type === "terminal" ||
    node.id === "project-complete" ||
    node.id === "close-out" ||
    /^project\s+complete$/i.test(node.title.trim())
  );
}

export function departmentIdentity(node: DomainNode) {
  const title = node.title.trim();
  const stage = String(node.config.stage ?? "").trim();
  const stageIsNumber = /^(?:(?:chapter|department)\s*)?\d+$/i.test(stage);
  const titleIsChapter = /^chapter\s*\d+$/i.test(title);
  const raw =
    stage && !stageIsNumber ? stage : title && !titleIsChapter ? title : node.description.trim();
  const clean = raw
    .replace(/\s+partially\s+involved\b/gi, "")
    .replace(/^(?:department|chapter|stage)\s*/i, "")
    .replace(/\s+department$/i, "")
    .trim();
  const isDefaultStart =
    (node.type === "projectStart" || node.id === "project-start") &&
    !isChapterIdentity(node) &&
    /^(project\s+)?start$/i.test(clean);
  const label = clean
    ? isDefaultStart
      ? "Project Start"
      : /\bdepartment$/i.test(clean)
        ? clean
        : `${clean} Department`
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

export function linkedNodeIds(
  phase: HighLevelNode,
  file: WorkflowFile,
  nodeById: Map<string, DomainNode>,
) {
  const explicit = phase.linkedLayer2NodeIds ?? phase.linkedDetailedNodeIds ?? [];
  if (explicit.length) return Array.from(new Set(explicit)).filter((id) => nodeById.has(id));

  const l2PhaseById = new Map(
    file.graph.nodes.filter((node) => node.type === "phase").map((node) => [node.id, node]),
  );
  return file.graph.nodes
    .filter(
      (node) =>
        node.type !== "phase" &&
        node.type !== "gate" &&
        node.type !== "decision" &&
        node.type !== "approval",
    )
    .filter((node) => {
      let parentId = file.layout.nodes[node.id]?.parentId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = l2PhaseById.get(parentId);
        if (parent)
          return parent.title.trim().toLocaleLowerCase() === phase.title.trim().toLocaleLowerCase();
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
    return [
      {
        kind: "Step" as const,
        code: "STEP",
        title: `${label}${conditionDurationLabel(condition) ? ` · ${conditionDurationLabel(condition)}` : ""}`,
        description:
          description && description.toLocaleLowerCase() !== label.toLocaleLowerCase()
            ? description
            : undefined,
        phaseLabel: phaseLabel(phase.node, phase.index),
        chapterCode: chapterCode(node),
      },
    ];
  });
}

function formsForNode(node: DomainNode, phase: PhaseColumn, file: WorkflowFile): EvidenceItem[] {
  const linkedConditionIds = new Set(
    node.conditions
      .map((condition) => condition.linkedExecutionItemId)
      .filter((id): id is string => Boolean(id)),
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
    if (
      !title ||
      executionForms.some((form) => form.title.toLocaleLowerCase() === title.toLocaleLowerCase())
    )
      return [];
    return [
      {
        kind: "Form" as const,
        code: `DOC-${String(index + 1).padStart(2, "0")}`,
        title,
        phaseLabel: phaseLabel(phase.node, phase.index),
        chapterCode: chapterCode(node),
      },
    ];
  });
  return [...executionForms, ...documents];
}

function blendWithWhite(color: string, amount: number) {
  const hex = color.replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex;
  const value = Number.parseInt(normalized, 16);
  const channel = (shift: number) => Math.round(255 - (255 - ((value >> shift) & 255)) * amount);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

export function gradient(colors: string[], tint = 1) {
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

export function makeColumns(phases: PhaseColumn[], file: WorkflowFile) {
  const columnsByKey = new Map<string, DepartmentColumn>();

  phases.forEach((phase) => {
    for (const node of phase.linkedNodes) {
      if (
        ["phase", "gate", "decision", "approval"].includes(node.type) ||
        isProjectCompleteNode(node)
      )
        continue;
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

      const existing = column.connections.find(
        (connection) => connection.phaseIndex === phase.index,
      );
      if (existing) {
        existing.chapterCode = Array.from(
          new Set([existing.chapterCode, chapterCode(node)].filter(Boolean)),
        ).join(" · ");
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
        if (
          !column.evidence.some(
            (existingItem) =>
              `${existingItem.kind}:${existingItem.code}:${existingItem.title.toLocaleLowerCase()}:${existingItem.phaseLabel}:${existingItem.chapterCode}` ===
              key,
          )
        ) {
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
    phases.flatMap((phase) =>
      phase.linkedNodes.flatMap((node) =>
        (file.execution?.items || [])
          .filter(
            (item) =>
              item.linkedLayer2NodeId === node.id ||
              node.conditions.some((condition) => condition.linkedExecutionItemId === item.id),
          )
          .map((item) => item.id),
      ),
    ),
  );
  const unassignedForms: EvidenceItem[] = (file.execution?.items || [])
    .filter(
      (item) =>
        !linkedFormIds.has(item.id) &&
        (!item.linkedLayer2NodeId || !linkedIds.has(item.linkedLayer2NodeId)),
    )
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
    column.colors = Array.from(
      new Set(column.connections.map((connection) => connection.phaseColor)),
    );
  }
  return ordered;
}

/** Department coverage is schematic: divide each phase among its linked
 * departments, without using individual RC starts. Consecutive pieces of the
 * same department become one card, even when they span a phase boundary. */
export function ganttCoverage(
  file: WorkflowFile,
  phases: PhaseColumn[],
  columns: DepartmentColumn[],
) {
  const schedule = buildProcessSchedule(file);
  const handoff = salesHandoffTime(schedule);
  const timeline = buildProcessTimeline(file, schedule);
  const { total } = pdfScheduleExtent(
    timeline.totalDays,
    timeline.originDay ?? 0,
    timeline.enabled,
  );
  const ranges = phases.map((phase) => {
    const index = schedule.phases.findIndex((item) => item.id === phase.node.id);
    const range = index < 0 ? { start: 0, end: 0 } : schedule.phaseRanges[index];
    return {
      start: timeline.toDisplayDay(range.start, "end"),
      end: timeline.toDisplayDay(range.end, "end"),
    };
  });
  const cards: { column?: DepartmentColumn; start: number; end: number }[] = [];
  ranges.forEach((range, phaseIndex) => {
    if (range.end <= range.start) return;
    const linked = columns.filter((column) =>
      column.connections.some((connection) => connection.phaseIndex === phaseIndex),
    );
    const portions: (DepartmentColumn | undefined)[] = linked.length ? linked : [undefined];
    const weights = portions.map((column) => {
      if (!column) return 1;
      const documents = departmentDocumentSummary(
        column.connections.map((connection) => connection.node),
      );
      return 1 + (documents.legal.length + documents.customer.length) * 0.2;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let usedWeight = 0;
    portions.forEach((column, index) => {
      const start = range.start + ((range.end - range.start) * usedWeight) / totalWeight;
      usedWeight += weights[index];
      const end = range.start + ((range.end - range.start) * usedWeight) / totalWeight;
      const last = cards.at(-1);
      if (column && last?.column?.key === column.key && Math.abs(last.end - start) < 0.000001)
        last.end = end;
      else cards.push({ column, start, end });
    });
  });
  // Size the printed timeline for phase and department cards. A one-day bar
  // must not force a several-thousand-pixel page and shrink every PDF label.
  const minimumAxisWidth = Math.max(
    1180,
    ...ranges
      .filter((range) => range.end > range.start)
      .map((range) => (110 * total) / (range.end - range.start)),
    ...cards.filter((card) => card.column).map((card) => (100 * total) / (card.end - card.start)),
  );
  return {
    total,
    ranges,
    cards,
    minimumWidth: PDF_SCHEDULE_LABEL_WIDTH + Math.min(1900, minimumAxisWidth),
    scheduled: handoff.elapsedDays !== null && handoff.elapsedDays > 0,
  };
}

export function evidenceHtml(column: DepartmentColumn) {
  if (!column.evidence.length) {
    return `<div class="empty-evidence">No linked forms or steps</div>`;
  }
  return column.evidence
    .map(
      (item, index) => `
    <div class="evidence-item">
      <div class="evidence-line"><span class="evidence-number">${index + 1}</span><span class="kind kind-${item.kind.toLocaleLowerCase()}">${escapeHtml(item.kind)}${item.kind === "Form" && item.code ? ` · ${escapeHtml(item.code)}` : ""}</span><span class="evidence-title">${escapeHtml(item.title)}${item.kind === "Step" ? "*" : ""}</span></div>
      <div class="evidence-meta">${escapeHtml(item.phaseLabel)}${item.chapterCode ? ` · ${escapeHtml(item.chapterCode)}` : ""}</div>
      ${item.description ? `<div class="evidence-description">${escapeHtml(item.description)}</div>` : ""}
    </div>`,
    )
    .join("");
}
