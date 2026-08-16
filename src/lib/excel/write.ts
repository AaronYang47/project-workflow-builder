import type { Borders, Cell, Worksheet } from "exceljs";
import { GATE_SERVICE_TYPES } from "@/lib/gate-service-types";
import {
  getInspectorSchema,
  isInspectorFieldVisible,
} from "@/lib/inspector-schema";
import { getNodeDefinition } from "@/lib/node-catalog";
import { projectNodeUuid } from "@/lib/project-id";
import {
  applyListValidation,
  asBoolean,
  hexArgb,
  KEY,
  LISTS,
} from "@/lib/excel-format";
import {
  conditionDisplaySatisfied,
  nodeStatusLabel,
} from "@/lib/workflow-progress";
import { readPath } from "@/lib/object-path";
import {
  extraNodeDocuments,
  interfaceText,
  parseServiceTypeId,
  serviceLabel,
  usesGateForm,
} from "@/lib/excel/shared";
import { standaloneTabTitle } from "@/lib/excel/tabs";
import type {
  DomainNode,
  GateSignatureRequirement,
  OutcomeHandle,
  ReferenceConfig,
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

function thin(hex = "#d6d3d1"): Partial<Borders> {
  const color = { argb: hexArgb(hex) };
  return {
    top: { style: "thin", color },
    left: { style: "thin", color },
    bottom: { style: "thin", color },
    right: { style: "thin", color },
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
  writeEditable(
    sheet,
    row,
    10,
    serviceLabel(parseServiceTypeId(document.serviceType)),
    serviceList(),
  );
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
    if (!isInspectorFieldVisible(field, node)) continue;
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
  const status = nodeStatusLabel(node, projectStart);
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
      writeEditable(
        sheet,
        row,
        2,
        conditionDisplaySatisfied(condition, node, projectStart),
        LISTS.boolean,
        true,
      );
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
      const documents = rule.signatures || [];
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
        documents.length ? "" : serviceLabel(rule.serviceTypeId),
        serviceList(),
      );
      row += 1;
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
          "Service",
        ]);
        for (const document of documents) {
          row = writeDocumentRow(sheet, row, document, rule.id, lists);
        }
        row += 1;
      }
    }
  }

  const extraDocuments = extraNodeDocuments(node);
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
  sheet.getColumn(10).width = 28;

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
