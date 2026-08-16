import type { Borders, Cell, Worksheet } from "exceljs";
import { GATE_SERVICE_TYPES } from "@/lib/gate-service-types";
import { getInspectorSchema } from "@/lib/inspector-schema";
import { getNodeDefinition } from "@/lib/node-catalog";
import { projectNodeUuid } from "@/lib/project-id";
import {
  applyListValidation,
  asBoolean,
  asString,
  hexArgb,
  isBlank,
  KEY,
  LISTS,
  parseKey,
  rawCell,
} from "@/lib/excel-format";
import type {
  DomainNode,
  GateSignatureRequirement,
  OutcomeHandle,
  ReferenceConfig,
  RequirementType,
  WorkflowFile,
} from "@/types/workflow";

const LAST_COL = 9;
const EDIT_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFFFF7D6" },
};
const YES_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFECFDF3" },
};
const NO_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFFEE2E2" },
};

function thin(hex = "#d6d3d1"): Partial<Borders> {
  const color = { argb: hexArgb(hex) };
  return {
    top: { style: "thin", color },
    left: { style: "thin", color },
    bottom: { style: "thin", color },
    right: { style: "thin", color },
  };
}

function absolutePosition(file: WorkflowFile, nodeId: string) {
  const seen = new Set<string>();
  let x = 0;
  let y = 0;
  let current = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const layout = file.layout.nodes[current];
    if (!layout) break;
    x += layout.x;
    y += layout.y;
    current = layout.parentId || "";
  }
  return { x, y };
}

function nodeBox(file: WorkflowFile, nodeId: string) {
  const position = absolutePosition(file, nodeId);
  const layout = file.layout.nodes[nodeId];
  return {
    x: position.x,
    y: position.y,
    width: layout?.width ?? 0,
    height: layout?.height ?? 0,
  };
}

function compareCanvas(
  file: WorkflowFile,
  leftId: string,
  rightId: string,
  band?: (id: string) => number,
) {
  const left = nodeBox(file, leftId);
  const right = nodeBox(file, rightId);
  const leftBand = band ? band(leftId) : 0;
  const rightBand = band ? band(rightId) : 0;
  return leftBand - rightBand || left.x - right.x || left.y - right.y;
}

export function phasesInCanvasOrder(file: WorkflowFile) {
  return file.graph.nodes
    .filter((node) => node.type === "phase")
    .sort((a, b) => compareCanvas(file, a.id, b.id));
}

function childrenOfPhase(file: WorkflowFile, phaseId: string) {
  return file.graph.nodes
    .filter((node) => {
      if (alwaysStandalone(node)) return false;
      return file.layout.nodes[node.id]?.parentId === phaseId;
    })
    .sort((a, b) => compareCanvas(file, a.id, b.id));
}

function alwaysStandalone(node: DomainNode) {
  return node.type === "projectStart" || node.type === "terminal";
}

function independentNodes(file: WorkflowFile, phases: DomainNode[]) {
  const phaseIds = new Set(phases.map((phase) => phase.id));
  return file.graph.nodes.filter((node) => {
    if (node.type === "phase") return false;
    if (alwaysStandalone(node)) return true;
    const parentId = file.layout.nodes[node.id]?.parentId;
    return !parentId || !phaseIds.has(parentId);
  });
}

function standaloneTabTitle(node: DomainNode) {
  return node.title || getNodeDefinition(node.type).label;
}

export function buildPhaseTabs(file: WorkflowFile) {
  const phases = phasesInCanvasOrder(file);
  const loose = independentNodes(file, phases);
  const phaseBottom = phases.length
    ? Math.max(
        ...phases.map((phase) => {
          const box = nodeBox(file, phase.id);
          return box.y + box.height;
        }),
      )
    : Number.POSITIVE_INFINITY;
  const bandOf = (id: string) => (nodeBox(file, id).y >= phaseBottom ? 1 : 0);
  const sequence = [
    ...phases.map((phase) => ({ kind: "phase" as const, id: phase.id, phase })),
    ...loose.map((node) => ({ kind: "node" as const, id: node.id, node })),
  ].sort((a, b) =>
    compareCanvas(file, a.id, b.id, phases.length ? bandOf : undefined),
  );

  const tabs: {
    phase: DomainNode | undefined;
    title: string;
    nodes: DomainNode[];
  }[] = [];
  for (const item of sequence) {
    if (item.kind === "phase") {
      tabs.push({
        phase: item.phase,
        title: item.phase.title,
        nodes: childrenOfPhase(file, item.phase.id),
      });
    } else {
      tabs.push({
        phase: undefined,
        title: standaloneTabTitle(item.node),
        nodes: [item.node],
      });
    }
  }
  return tabs.length
    ? tabs
    : [
        {
          phase: undefined as DomainNode | undefined,
          title: "Workflow",
          nodes: [] as DomainNode[],
        },
      ];
}

function nodeStatus(node: DomainNode) {
  const rules = node.config.gateRules || [];
  if (rules.length) {
    const required = rules.filter((rule) => rule.requirementType !== "Optional");
    const ready = required.filter((rule) => {
      const signatures = (rule.signatures || []).filter(
        (item) => item.requirementType !== "Optional",
      );
      return rule.checked && signatures.every((item) => item.checked);
    });
    if (required.length && ready.length === required.length) return "Ready";
    if (ready.length) return "In Progress";
    return "Blocked";
  }
  if (node.conditions.length) {
    const required = node.conditions.filter((item) => item.required !== false);
    const ready = required.filter((item) => item.checked);
    if (required.length && ready.length === required.length) return "Ready";
    if (ready.length) return "In Progress";
    return "Blocked";
  }
  return "Open";
}

function serviceLabel(id?: string) {
  return GATE_SERVICE_TYPES.find((item) => item.id === id)?.label || "";
}

function parseServiceTypeId(value: unknown) {
  const text = asString(value).trim();
  if (!text) return undefined;
  return GATE_SERVICE_TYPES.find(
    (item) =>
      item.id === text || item.label.toLowerCase() === text.toLowerCase(),
  )?.id;
}

function parseRequirement(value: unknown, fallback?: RequirementType) {
  const text = asString(value).trim().toLowerCase();
  if (!text) return fallback;
  if (text === "optional" || text === "false") return "Optional" as const;
  if (text === "required" || text === "true") return "Required" as const;
  return fallback;
}

function readPath(node: DomainNode, path: string): unknown {
  return path.split(".").reduce((value: unknown, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, node as unknown);
}

function writePath(node: DomainNode, path: string, value: unknown): DomainNode {
  const result = structuredClone(node) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let cursor = result;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] = (cursor[key] as Record<string, unknown>) || {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys.at(-1)!] = value;
  return result as unknown as DomainNode;
}

const SKIP_INSPECTOR_KEYS = new Set([
  "title",
  "description",
  "color",
  "config.iconKey",
  "config.gateIconKey",
  "config.gateHeaderColor",
  "config.gateTitleColor",
  "customFields.nodeUuid",
]);

function usesGateForm(node: DomainNode) {
  return (
    node.type === "gate" ||
    node.type === "decision" ||
    Boolean(node.config.gateRules?.length)
  );
}

function interfaceText(node: DomainNode) {
  const gate = usesGateForm(node);
  return {
    conditionsTitle:
      node.config.conditionsTitle ||
      (gate ? "Approval conditions" : "Release conditions"),
    documentsLabel:
      node.config.documentsLabel || "All applicable required documents",
    departmentLabel: node.config.departmentLabel || "Department",
    approverLabel: node.config.approverLabel || "Approved by",
    decisionTitle: node.config.decisionTitle || "Decision",
    titleLabel: gate ? "Title" : "Node name",
    descriptionLabel: gate ? "Description" : "Node content",
  };
}

function styleLabel(cell: Cell) {
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF57534E" } };
  cell.alignment = { vertical: "middle" };
}

function styleRead(cell: Cell) {
  cell.font = { name: "Calibri", size: 10, color: { argb: "FF44403C" } };
  cell.alignment = { vertical: "middle", wrapText: true };
}

function writeKey(sheet: Worksheet, row: number, key: string) {
  sheet.getCell(row, 1).value = key;
}

function writeEditable(
  sheet: Worksheet,
  row: number,
  col: number,
  value: string | boolean,
  list?: string,
  checkbox = false,
) {
  const cell = sheet.getCell(row, col);
  const checked = checkbox ? Boolean(asBoolean(value) ?? value === true) : false;
  cell.value = checkbox ? (checked ? "Yes" : "No") : value;
  cell.fill = checkbox ? (checked ? YES_FILL : NO_FILL) : EDIT_FILL;
  cell.font = {
    name: "Calibri",
    size: checkbox ? 11 : 10,
    bold: checkbox,
    color: { argb: checkbox ? (checked ? "FF166534" : "FF9F1239") : "FF1C1917" },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: checkbox ? "center" : "left",
    wrapText: !checkbox,
    indent: checkbox ? 0 : 1,
  };
  cell.border = thin(checkbox ? (checked ? "#86efac" : "#fecaca") : "#e7d27a");
  if (list) applyListValidation(cell, list);
  sheet.getRow(row).height = Math.max(sheet.getRow(row).height || 0, 22);
}

function merge(sheet: Worksheet, row: number, from: number, to: number) {
  if (from === to) return;
  sheet.mergeCells(row, from, row, to);
}

function fillRange(
  sheet: Worksheet,
  row: number,
  from: number,
  to: number,
  argb: string,
) {
  for (let col = from; col <= to; col += 1) {
    sheet.getCell(row, col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb },
    };
  }
}

function writeField(
  sheet: Worksheet,
  row: number,
  key: string,
  label: string,
  value: string,
  list?: string,
) {
  writeKey(sheet, row, key);
  const labelCell = sheet.getCell(row, 2);
  labelCell.value = label;
  styleLabel(labelCell);
  merge(sheet, row, 3, LAST_COL);
  writeEditable(sheet, row, 3, value, list);
  return row + 1;
}

function writeReadonly(
  sheet: Worksheet,
  row: number,
  key: string,
  label: string,
  value: string,
) {
  writeKey(sheet, row, key);
  const labelCell = sheet.getCell(row, 2);
  labelCell.value = label;
  styleLabel(labelCell);
  merge(sheet, row, 3, LAST_COL);
  const cell = sheet.getCell(row, 3);
  cell.value = value;
  styleRead(cell);
  sheet.getRow(row).height = 20;
  return row + 1;
}

function departmentList(file: WorkflowFile) {
  const values = new Set<string>();
  for (const node of file.graph.nodes) {
    const department =
      node.config.approvedDepartment || node.metadata.responsibleDepartment;
    if (department) values.add(department);
    for (const rule of node.config.gateRules || []) {
      for (const signature of rule.signatures || []) {
        if (signature.department) values.add(signature.department);
      }
    }
  }
  const joined = [...values].join(",");
  return joined && joined.length < 240 ? `"${joined}"` : undefined;
}

function peopleList(file: WorkflowFile) {
  const values = new Set<string>();
  for (const node of file.graph.nodes) {
    if (node.config.approvedBy) values.add(String(node.config.approvedBy));
    if (node.customFields.owner) values.add(String(node.customFields.owner));
    for (const rule of node.config.gateRules || []) {
      for (const signature of rule.signatures || []) {
        if (signature.signedBy) values.add(signature.signedBy);
        if (signature.owner) values.add(signature.owner);
      }
    }
  }
  const joined = [...values].join(",");
  return joined && joined.length < 240 ? `"${joined}"` : undefined;
}

function serviceList() {
  return `"${GATE_SERVICE_TYPES.map((item) => item.label).join(",")}"`;
}

function writeSection(sheet: Worksheet, row: number, title: string) {
  writeKey(sheet, row, `${KEY.section}:${title}`);
  merge(sheet, row, 2, LAST_COL);
  fillRange(sheet, row, 2, LAST_COL, "FFE7E5E4");
  const cell = sheet.getCell(row, 2);
  cell.value = title;
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1C1917" } };
  cell.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(row).height = 22;
  return row + 1;
}

function writeHeaders(sheet: Worksheet, row: number, headers: string[]) {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(row, 2 + index);
    cell.value = header;
    styleLabel(cell);
  });
  sheet.getRow(row).height = 18;
  return row + 1;
}

function writeDocumentRow(
  sheet: Worksheet,
  row: number,
  document: GateSignatureRequirement,
  ruleId: string,
  lists: { departments?: string; people?: string },
) {
  writeKey(sheet, row, `${KEY.document}:${document.id}:${ruleId}`);
  writeEditable(sheet, row, 2, Boolean(document.checked), LISTS.boolean, true);
  writeEditable(sheet, row, 3, document.abbreviation || "");
  writeEditable(sheet, row, 4, document.fullName || "");
  writeEditable(sheet, row, 5, document.status || "Draft", LISTS.docStatus);
  writeEditable(sheet, row, 6, document.revision || "");
  writeEditable(
    sheet,
    row,
    7,
    document.department || "",
    lists.departments,
  );
  writeEditable(sheet, row, 8, document.signedBy || "", lists.people);
  writeEditable(sheet, row, 9, document.owner || "", lists.people);
  sheet.getRow(row).height = document.fullName && document.fullName.length > 40 ? 32 : 22;
  return row + 1;
}

function writeInspectorFields(sheet: Worksheet, row: number, node: DomainNode) {
  const fields = getInspectorSchema(node.type).filter(
    (field) =>
      !SKIP_INSPECTOR_KEYS.has(field.key) &&
      !field.key.startsWith("config.conditions") &&
      !field.key.startsWith("config.checklist") &&
      !field.key.startsWith("config.condition") &&
      !field.key.startsWith("config.add") &&
      !field.key.startsWith("config.documents") &&
      !field.key.startsWith("config.decision") &&
      !field.key.startsWith("config.department") &&
      !field.key.startsWith("config.approver") &&
      !field.key.startsWith("config.details"),
  );
  if (!fields.length) return row;
  for (const field of fields) {
    if (field.visibleWhen) {
      const current = String(readPath(node, field.visibleWhen.key) || "");
      if (current !== field.visibleWhen.equals) continue;
    }
    const raw = readPath(node, field.key);
    writeKey(sheet, row, `${KEY.field}:${field.key}`);
    const labelCell = sheet.getCell(row, 2);
    labelCell.value = field.label;
    styleLabel(labelCell);
    merge(sheet, row, 3, LAST_COL);
    if (field.type === "boolean") {
      writeEditable(sheet, row, 3, Boolean(raw), LISTS.boolean, true);
    } else if (field.type === "select" && field.options?.length) {
      writeEditable(
        sheet,
        row,
        3,
        String(raw ?? ""),
        `"${field.options.join(",")}"`,
      );
    } else if (field.readOnly) {
      const cell = sheet.getCell(row, 3);
      cell.value = String(raw ?? "");
      styleRead(cell);
    } else {
      writeEditable(sheet, row, 3, String(raw ?? ""));
    }
    row += 1;
  }
  return row;
}

function writeReference(sheet: Worksheet, row: number, node: DomainNode) {
  const reference = node.config.reference as ReferenceConfig | undefined;
  if (!reference) return row;
  if (reference.items?.length) {
    row = writeSection(sheet, row, "Legend items");
    row = writeHeaders(sheet, row, ["Label", "Color", "Description"]);
    for (const item of reference.items) {
      writeKey(sheet, row, `#ref.item:${item.id}`);
      writeEditable(sheet, row, 2, item.label || "");
      writeEditable(sheet, row, 3, item.color || "");
      merge(sheet, row, 4, LAST_COL);
      writeEditable(sheet, row, 4, item.description || "");
      row += 1;
    }
  }
  if (reference.columns?.length || reference.rows?.length) {
    row = writeSection(sheet, row, "Approval matrix");
    const columns = reference.columns || [];
    writeKey(sheet, row, `#ref.columns`);
    columns.forEach((column, index) => {
      writeEditable(sheet, row, 3 + index, column);
    });
    const header = sheet.getCell(row, 2);
    header.value = "Action";
    styleLabel(header);
    row += 1;
    for (const tableRow of reference.rows || []) {
      writeKey(sheet, row, `#ref.row:${tableRow.id}`);
      writeEditable(sheet, row, 2, tableRow.label || "");
      (tableRow.approvals || []).forEach((checked, index) => {
        writeEditable(sheet, row, 3 + index, Boolean(checked), LISTS.boolean, true);
      });
      row += 1;
    }
  }
  const writeLines = (title: string, kind: string, lines: string[] | undefined) => {
    if (!lines?.length) return row;
    row = writeSection(sheet, row, title);
    lines.forEach((line, index) => {
      writeKey(sheet, row, `#ref.${kind}:${index}`);
      merge(sheet, row, 2, LAST_COL);
      writeEditable(sheet, row, 2, line);
      row += 1;
    });
    return row;
  };
  row = writeLines("Current", "current", reference.current);
  row = writeLines("Proposed", "proposed", reference.proposed);
  row = writeLines("Rules", "rules", reference.rules);
  if (reference.sections?.length) {
    for (const section of reference.sections) {
      row = writeSection(sheet, row, section.title || "Section");
      writeKey(sheet, row - 1, `#ref.section:${section.id}`);
      (section.items || []).forEach((item, index) => {
        writeKey(sheet, row, `#ref.section:${section.id}:item:${index}`);
        merge(sheet, row, 2, LAST_COL);
        writeEditable(sheet, row, 2, item);
        row += 1;
      });
    }
  }
  return row;
}

function isPositiveOutcome(outcome: OutcomeHandle) {
  return outcome.id === "yes" || outcome.edgeType === "success";
}

function writeOutcomes(sheet: Worksheet, row: number, node: DomainNode) {
  const outcomes = (node.config.outcomes || []) as OutcomeHandle[];
  if (!outcomes.length) return row;
  for (const outcome of outcomes) {
    const positive = isPositiveOutcome(outcome);
    const label = outcome.label || (positive ? "Approved" : "Denied");
    writeKey(sheet, row, `#outcome:${outcome.id}`);
    const name = sheet.getCell(row, 2);
    name.value = positive ? "Yes" : "No";
    styleLabel(name);
    merge(sheet, row, 3, LAST_COL);
    const cell = sheet.getCell(row, 3);
    cell.value = label;
    cell.fill = positive ? YES_FILL : NO_FILL;
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: positive ? "FF166534" : "FF9F1239" },
    };
    cell.alignment = { vertical: "middle", indent: 1 };
    cell.border = thin(positive ? "#86efac" : "#fecaca");
    sheet.getRow(row).height = 24;
    row += 1;
  }
  return row;
}

function writeGateBlock(
  sheet: Worksheet,
  startRow: number,
  node: DomainNode,
  file: WorkflowFile,
  projectStart?: DomainNode,
  lists: { departments?: string; people?: string } = {},
) {
  const labels = interfaceText(node);
  const parentId = file.layout.nodes[node.id]?.parentId || "";
  const color = node.color || getNodeDefinition(node.type).color;
  const status = String(node.customFields.status || nodeStatus(node));
  const gateForm = usesGateForm(node);
  let row = startRow;
  writeKey(sheet, row, `${KEY.node}:${node.id}`);
  merge(sheet, row, 2, LAST_COL);
  fillRange(sheet, row, 2, LAST_COL, hexArgb(color));
  const header = sheet.getCell(row, 2);
  header.value = `${node.title}    ·    ${getNodeDefinition(node.type).label}    ·    ${status}`;
  header.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(row).height = 28;
  row += 1;

  row = writeReadonly(sheet, row, KEY.gateId, "Node ID", node.id);
  row = writeReadonly(sheet, row, KEY.nodeParent, "Phase membership", parentId || "(none)");
  row = writeReadonly(
    sheet,
    row,
    KEY.gateUuid,
    "UUID",
    projectNodeUuid(node, projectStart) || String(node.customFields.nodeUuid || ""),
  );
  row = writeField(sheet, row, KEY.gateTitle, labels.titleLabel, node.title);
  sheet.getRow(row - 1).height = 24;
  row = writeField(sheet, row, KEY.gateDescription, labels.descriptionLabel, node.description);
  sheet.getRow(row - 1).height = 36;
  row = writeInspectorFields(sheet, row, node);
  row += 1;

  const nodeConditions = node.conditions || [];
  const rules = node.config.gateRules || [];
  if (nodeConditions.length || rules.length) {
    row = writeSection(sheet, row, labels.conditionsTitle);
    writeKey(sheet, row, "");
    const conditionHeaders = [
      [2, "Yes/No"],
      [3, "Condition"],
      [5, "Requirement"],
      [6, "Service"],
    ] as const;
    conditionHeaders.forEach(([col, header]) => {
      const cell = sheet.getCell(row, col);
      cell.value = header;
      styleLabel(cell);
    });
    merge(sheet, row, 3, 4);
    sheet.getRow(row).height = 18;
    row += 1;
    for (const condition of nodeConditions) {
      writeKey(
        sheet,
        row,
        `${KEY.condition}:${condition.id || condition.label || ""}:node`,
      );
      writeEditable(sheet, row, 2, Boolean(condition.checked), LISTS.boolean, true);
      merge(sheet, row, 3, 4);
      writeEditable(sheet, row, 3, condition.label || "");
      writeEditable(
        sheet,
        row,
        5,
        condition.required === false ? "Optional" : "Required",
        LISTS.requirement,
      );
      row += 1;
    }
    for (const rule of rules) {
      writeKey(sheet, row, `${KEY.condition}:${rule.id}:rule`);
      writeEditable(sheet, row, 2, Boolean(rule.checked), LISTS.boolean, true);
      merge(sheet, row, 3, 4);
      writeEditable(sheet, row, 3, rule.label || "");
      writeEditable(
        sheet,
        row,
        5,
        rule.requirementType || "Required",
        LISTS.requirement,
      );
      writeEditable(
        sheet,
        row,
        6,
        serviceLabel(rule.serviceTypeId),
        serviceList(),
      );
      row += 1;
      const documents = rule.signatures || [];
      if (documents.length) {
        row = writeSection(sheet, row, labels.documentsLabel);
        row = writeHeaders(sheet, row, [
          "Yes/No",
          "Code",
          "Document",
          "Status",
          "Revision",
          "Department",
          "Responsible Person",
          "Owner",
        ]);
        for (const document of documents) {
          row = writeDocumentRow(sheet, row, document, rule.id, lists);
        }
        row += 1;
      }
    }
  }

  const signatureNames = new Set(
    (node.config.gateRules || []).flatMap((rule) =>
      (rule.signatures || []).map((item) => item.abbreviation),
    ),
  );
  const extraDocuments = (node.documents || []).filter(
    (name) => !signatureNames.has(name),
  );
  if (extraDocuments.length) {
    row = writeSection(sheet, row, labels.documentsLabel);
    extraDocuments.forEach((name, index) => {
      writeKey(sheet, row, `#node.doc:${node.id}:${index}`);
      merge(sheet, row, 2, LAST_COL);
      writeEditable(sheet, row, 2, name);
      row += 1;
    });
  }

  if (gateForm) {
    row += 1;
    row = writeSection(sheet, row, labels.decisionTitle);
    row = writeField(
      sheet,
      row,
      KEY.gateDepartment,
      labels.departmentLabel,
      node.config.approvedDepartment || node.metadata.responsibleDepartment || "",
      lists.departments,
    );
    row = writeField(
      sheet,
      row,
      KEY.gateApprover,
      labels.approverLabel,
      node.config.approvedBy || "",
      lists.people,
    );
    row = writeOutcomes(sheet, row, node);
  } else if (node.customFields.notes) {
    row = writeField(
      sheet,
      row,
      KEY.gateNotes,
      "Notes",
      String(node.customFields.notes || ""),
    );
  }

  row = writeReference(sheet, row, node);
  row += 2;
  return row;
}

export function writePhaseSheet(
  sheet: Worksheet,
  phase: DomainNode | undefined,
  nodes: DomainNode[],
  file: WorkflowFile,
  tabTitle?: string,
) {
  const lists = {
    departments: departmentList(file),
    people: peopleList(file),
  };
  const projectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  const independent = !phase;
  const color = phase?.color || nodes[0]?.color || "#2563a9";
  sheet.views = [{ state: "frozen", ySplit: 2, showGridLines: true, zoomScale: 100 }];
  sheet.properties.tabColor = { argb: hexArgb(color) };
  sheet.getColumn(1).hidden = true;
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 36;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 16;
  sheet.getColumn(7).width = 22;
  sheet.getColumn(8).width = 22;
  sheet.getColumn(9).width = 18;

  writeKey(sheet, 1, phase ? `${KEY.phase}:${phase.id}` : "#independent");
  merge(sheet, 1, 2, LAST_COL);
  fillRange(sheet, 1, 2, LAST_COL, hexArgb(color));
  const title = sheet.getCell(1, 2);
  title.value = tabTitle || phase?.title || (nodes[0] ? standaloneTabTitle(nodes[0]) : "Workflow");
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(1).height = 32;

  if (phase) {
    writeKey(sheet, 2, KEY.phaseDesc);
    const hint = sheet.getCell(2, 2);
    hint.value = "Description";
    styleLabel(hint);
    merge(sheet, 2, 3, LAST_COL);
    writeEditable(sheet, 2, 3, phase.description || "");
  } else {
    const standalone = nodes[0];
    const kindLabel = standalone
      ? getNodeDefinition(standalone.type).label
      : "Standalone";
    const hint = sheet.getCell(2, 2);
    hint.value = kindLabel;
    styleLabel(hint);
    merge(sheet, 2, 3, LAST_COL);
    const detail = sheet.getCell(2, 3);
    detail.value =
      standalone?.type === "projectStart" || standalone?.type === "terminal"
        ? `${kindLabel} always has its own tab.`
        : `${kindLabel} is independent on the canvas, so it has its own tab. Phase tabs only group items placed inside a Phase.`;
    styleRead(detail);
  }
  sheet.getRow(2).height = 28;

  const note = sheet.getCell(3, 2);
  note.value = independent
    ? "Fields, labels, Yes/No, and Approved/Denied values match the web app canvas. Yellow cells import back into the web app."
    : "This tab contains only nodes that live inside this Phase on the canvas. Yes is green, No is red. Yellow cells import back into the web app.";
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF78716C" } };
  merge(sheet, 3, 2, LAST_COL);
  sheet.getRow(3).height = 28;

  let row = 5;
  if (!nodes.length) {
    sheet.getCell(row, 2).value = independent
      ? "No independent nodes."
      : "No nodes in this phase.";
    styleLabel(sheet.getCell(row, 2));
    return;
  }
  for (const child of nodes) {
    row = writeGateBlock(sheet, row, child, file, projectStart, lists);
  }
}

function updateNode(
  file: WorkflowFile,
  nodeId: string,
  updater: (node: DomainNode) => DomainNode,
): WorkflowFile {
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) =>
        node.id === nodeId ? updater(node) : node,
      ),
    },
  };
}

function findNode(
  file: WorkflowFile,
  gateId: string,
  uuid: string,
): DomainNode | undefined {
  const projectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  return (
    file.graph.nodes.find((node) => node.id === gateId) ||
    file.graph.nodes.find((node) => {
      if (!uuid) return false;
      return (
        String(node.customFields.nodeUuid || "") === uuid ||
        projectNodeUuid(node, projectStart) === uuid
      );
    })
  );
}

function findPhase(
  file: WorkflowFile,
  sheetName: string,
  phaseId: string,
) {
  return (
    file.graph.nodes.find((node) => node.id === phaseId && node.type === "phase") ||
    file.graph.nodes.find(
      (node) =>
        node.type === "phase" &&
        (node.title === sheetName ||
          node.title.toLowerCase() === sheetName.toLowerCase() ||
          node.title.toLowerCase().startsWith(sheetName.toLowerCase())),
    )
  );
}

export function applyPhaseSheet(
  sheet: Worksheet,
  file: WorkflowFile,
): WorkflowFile {
  let next = file;
  let phaseId = "";
  let gateId = "";
  let uuid = "";
  const lastRow = Math.max(sheet.rowCount, 1);
  for (let row = 1; row <= lastRow; row += 1) {
    const key = parseKey(rawCell(sheet.getCell(row, 1)));
    const kind = key.kind;
    if (kind === KEY.phase) {
      phaseId = key.id;
      const phase = findPhase(next, sheet.name, phaseId);
      if (phase) {
        phaseId = phase.id;
        const title = asString(rawCell(sheet.getCell(row, 2)));
        if (title) {
          next = updateNode(next, phase.id, (node) => ({ ...node, title }));
        }
      }
      continue;
    }
    if (kind === KEY.phaseDesc && phaseId) {
      const description = asString(rawCell(sheet.getCell(row, 3)));
      next = updateNode(next, phaseId, (node) => ({ ...node, description }));
      continue;
    }
    if (kind === KEY.gate || kind === KEY.node) {
      gateId = key.id;
      uuid = "";
      continue;
    }
    if (kind === KEY.gateUuid) {
      uuid = asString(rawCell(sheet.getCell(row, 3)));
      continue;
    }
    const node = findNode(next, gateId, uuid);
    if (!node) continue;
    gateId = node.id;
    const value = rawCell(sheet.getCell(row, 3));
    if (kind === KEY.nodeParent) {
      const parentValue = asString(value).trim();
      const parentId =
        !parentValue || parentValue === "(none)" ? undefined : parentValue;
      const layout = next.layout.nodes[node.id];
      if (layout) {
        const nextLayout = { ...layout };
        if (parentId) nextLayout.parentId = parentId;
        else delete nextLayout.parentId;
        next = {
          ...next,
          layout: {
            ...next.layout,
            nodes: {
              ...next.layout.nodes,
              [node.id]: nextLayout,
            },
          },
        };
      }
      continue;
    }
    if (kind === KEY.field && key.id) {
      const field = getInspectorSchema(node.type).find((item) => item.key === key.id);
      const nextValue =
        field?.type === "boolean" ? Boolean(asBoolean(value) ?? false) : asString(value);
      if (!field?.readOnly) {
        next = updateNode(next, node.id, (item) => writePath(item, key.id, nextValue));
      }
      continue;
    }
    if (kind === KEY.gateTitle && !isBlank(value)) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        title: asString(value),
      }));
    } else if (kind === KEY.gateDescription) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        description: asString(value),
      }));
    } else if (kind === KEY.gateStatus) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, status: asString(value) },
      }));
    } else if (kind === KEY.gateOwner) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, owner: asString(value) },
      }));
    } else if (kind === KEY.gateDepartment) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        metadata: {
          ...item.metadata,
          responsibleDepartment: asString(value),
        },
        config: { ...item.config, approvedDepartment: asString(value) },
      }));
    } else if (kind === KEY.gateApprover) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        config: { ...item.config, approvedBy: asString(value) },
      }));
    } else if (kind === KEY.gateResult) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, approvalResult: asString(value) },
      }));
    } else if (kind === KEY.gateNotes) {
      next = updateNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, notes: asString(value) },
      }));
    } else if (kind === KEY.condition) {
      const checked = asBoolean(rawCell(sheet.getCell(row, 2)));
      const label = asString(rawCell(sheet.getCell(row, 3)));
      const requirement = parseRequirement(rawCell(sheet.getCell(row, 5)));
      const serviceTypeId = parseServiceTypeId(rawCell(sheet.getCell(row, 6)));
      const source = key.extra || "rule";
      next = updateNode(next, node.id, (item) => {
        if (source === "node") {
          return {
            ...item,
            conditions: item.conditions.map((condition) =>
              (condition.id || condition.label) === key.id
                ? {
                    ...condition,
                    checked: checked ?? condition.checked,
                    label: label || condition.label,
                    required:
                      requirement === "Optional"
                        ? false
                        : requirement === "Required"
                          ? true
                          : condition.required,
                  }
                : condition,
            ),
          };
        }
        return {
          ...item,
          config: {
            ...item.config,
            gateRules: (item.config.gateRules || []).map((rule) =>
              rule.id === key.id
                ? {
                    ...rule,
                    checked: checked ?? rule.checked,
                    label: label || rule.label,
                    requirementType: requirement || rule.requirementType,
                    serviceTypeId: serviceTypeId || rule.serviceTypeId,
                  }
                : rule,
            ),
          },
        };
      });
    } else if (kind === KEY.document) {
      const documentId = key.id;
      const ruleId = key.extra;
      const checked = asBoolean(rawCell(sheet.getCell(row, 2)));
      const abbreviation = asString(rawCell(sheet.getCell(row, 3)));
      const fullName = asString(rawCell(sheet.getCell(row, 4)));
      const status = asString(rawCell(sheet.getCell(row, 5)));
      const revision = asString(rawCell(sheet.getCell(row, 6)));
      const department = asString(rawCell(sheet.getCell(row, 7)));
      const signedBy = asString(rawCell(sheet.getCell(row, 8)));
      const owner = asString(rawCell(sheet.getCell(row, 9)));
      next = updateNode(next, node.id, (item) => {
        const gateRules = (item.config.gateRules || []).map((rule) => {
          if (ruleId && rule.id !== ruleId) return rule;
          return {
            ...rule,
            signatures: (rule.signatures || []).map((signature) =>
              signature.id !== documentId
                ? signature
                : {
                    ...signature,
                    checked: checked ?? signature.checked,
                    abbreviation: abbreviation || signature.abbreviation,
                    fullName: fullName || signature.fullName,
                    status: isBlank(status) ? signature.status : status,
                    revision,
                    department: isBlank(department)
                      ? signature.department
                      : department,
                    signedBy,
                    owner,
                  },
            ),
          };
        });
        return {
          ...item,
          documents: gateRules.flatMap((rule) =>
            (rule.signatures || [])
              .map((signature) => signature.abbreviation)
              .filter(Boolean),
          ),
          config: { ...item.config, gateRules },
        };
      });
    } else if (kind === "#outcome") {
      const label = asString(rawCell(sheet.getCell(row, 3)));
      next = updateNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          outcomes: (item.config.outcomes || []).map((outcome) =>
            outcome.id === key.id
              ? { ...outcome, label: label || outcome.label }
              : outcome,
          ),
        },
      }));
    } else if (kind === "#node.doc") {
      const index = Number(key.extra);
      if (Number.isFinite(index)) {
        const name = asString(rawCell(sheet.getCell(row, 2)));
        next = updateNode(next, node.id, (item) => {
          const documents = [...item.documents];
          documents[index] = name;
          return { ...item, documents };
        });
      }
    } else if (kind === "#ref.item") {
      const label = asString(rawCell(sheet.getCell(row, 2)));
      const color = asString(rawCell(sheet.getCell(row, 3)));
      const description = asString(rawCell(sheet.getCell(row, 4)));
      next = updateNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          reference: {
            ...item.config.reference,
            items: (item.config.reference?.items || []).map((entry) =>
              entry.id === key.id
                ? { ...entry, label, color, description }
                : entry,
            ),
          },
        },
      }));
    } else if (kind === "#ref.row") {
      const label = asString(rawCell(sheet.getCell(row, 2)));
      next = updateNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          reference: {
            ...item.config.reference,
            rows: (item.config.reference?.rows || []).map((entry) => {
              if (entry.id !== key.id) return entry;
              const approvals = [...(entry.approvals || [])];
              for (let column = 0; column < approvals.length; column += 1) {
                const checked = asBoolean(rawCell(sheet.getCell(row, 3 + column)));
                if (checked !== undefined) approvals[column] = checked;
              }
              return { ...entry, label: label || entry.label, approvals };
            }),
          },
        },
      }));
    } else if (kind === "#ref.current" || kind === "#ref.proposed" || kind === "#ref.rules") {
      const index = Number(key.id);
      const field = kind.slice(5) as "current" | "proposed" | "rules";
      const line = asString(rawCell(sheet.getCell(row, 2)));
      if (Number.isFinite(index)) {
        next = updateNode(next, node.id, (item) => {
          const list = [...(item.config.reference?.[field] || [])];
          list[index] = line;
          return {
            ...item,
            config: {
              ...item.config,
              reference: { ...item.config.reference, [field]: list },
            },
          };
        });
      }
    } else if (kind === "#ref.section") {
      const line = asString(rawCell(sheet.getCell(row, 2)));
      const [itemMarker, itemIndex] = key.extra.split(":");
      next = updateNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          reference: {
            ...item.config.reference,
            sections: (item.config.reference?.sections || []).map((section) => {
              if (section.id !== key.id) return section;
              if (itemMarker === "item") {
                const items = [...(section.items || [])];
                items[Number(itemIndex)] = line;
                return { ...section, items };
              }
              return { ...section, title: line || section.title };
            }),
          },
        },
      }));
    }
  }
  return next;
}
