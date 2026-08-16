import type { Borders, Cell, Worksheet } from "exceljs";
import { GATE_SERVICE_TYPES } from "@/lib/gate-service-types";
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
  RequirementType,
  WorkflowFile,
} from "@/types/workflow";

const LAST_COL = 9;
const EDIT_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFFFF7D6" },
};
const CHECK_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFECFDF3" },
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

function absoluteX(file: WorkflowFile, nodeId: string) {
  const seen = new Set<string>();
  let x = 0;
  let current = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const layout = file.layout.nodes[current];
    if (!layout) break;
    x += layout.x;
    current = layout.parentId || "";
  }
  return x;
}

function childrenOfPhase(file: WorkflowFile, phaseId: string) {
  return file.graph.nodes
    .filter((node) => file.layout.nodes[node.id]?.parentId === phaseId)
    .sort((a, b) => {
      const left = file.layout.nodes[a.id];
      const right = file.layout.nodes[b.id];
      return (left?.x || 0) - (right?.x || 0) || (left?.y || 0) - (right?.y || 0);
    });
}

export function phasesInCanvasOrder(file: WorkflowFile) {
  return file.graph.nodes
    .filter((node) => node.type === "phase")
    .sort((a, b) => absoluteX(file, a.id) - absoluteX(file, b.id));
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
  cell.value = value;
  cell.fill = checkbox ? CHECK_FILL : EDIT_FILL;
  cell.font = {
    name: "Calibri",
    size: checkbox ? 11 : 10,
    bold: checkbox,
    color: { argb: checkbox ? "FF166534" : "FF1C1917" },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: checkbox ? "center" : "left",
    wrapText: !checkbox,
    indent: checkbox ? 0 : 1,
  };
  cell.border = thin(checkbox ? "#86efac" : "#e7d27a");
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

function writeGateBlock(
  sheet: Worksheet,
  startRow: number,
  node: DomainNode,
  file: WorkflowFile,
  projectStart?: DomainNode,
  lists: { departments?: string; people?: string } = {},
) {
  const color = node.color || getNodeDefinition(node.type).color;
  const status = String(node.customFields.status || nodeStatus(node));
  let row = startRow;
  writeKey(sheet, row, `${KEY.gate}:${node.id}`);
  merge(sheet, row, 2, LAST_COL);
  fillRange(sheet, row, 2, LAST_COL, hexArgb(color));
  const header = sheet.getCell(row, 2);
  header.value = `${node.title}    ·    ${getNodeDefinition(node.type).label}    ·    ${status}`;
  header.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(row).height = 28;
  row += 1;

  row = writeReadonly(sheet, row, KEY.gateId, "Gate ID", node.id);
  row = writeReadonly(
    sheet,
    row,
    KEY.gateUuid,
    "UUID",
    projectNodeUuid(node, projectStart) || String(node.customFields.nodeUuid || ""),
  );
  row = writeField(sheet, row, KEY.gateTitle, "Gate Name", node.title);
  sheet.getRow(row - 1).height = 24;
  row = writeField(sheet, row, KEY.gateDescription, "Description", node.description);
  sheet.getRow(row - 1).height = 36;
  row = writeField(
    sheet,
    row,
    KEY.gateStatus,
    "Status",
    status,
    LISTS.gateStatus,
  );
  row = writeField(
    sheet,
    row,
    KEY.gateOwner,
    "Owner",
    String(node.customFields.owner || ""),
    lists.people,
  );
  row = writeField(
    sheet,
    row,
    KEY.gateDepartment,
    "Responsible Department",
    node.config.approvedDepartment || node.metadata.responsibleDepartment || "",
    lists.departments,
  );
  row = writeField(
    sheet,
    row,
    KEY.gateApprover,
    "Approver",
    node.config.approvedBy || "",
    lists.people,
  );
  row = writeField(
    sheet,
    row,
    KEY.gateResult,
    "Approval Result",
    String(node.customFields.approvalResult || "Pending"),
    LISTS.approvalResult,
  );
  row = writeField(
    sheet,
    row,
    KEY.gateNotes,
    "Notes",
    String(node.customFields.notes || ""),
  );
  sheet.getRow(row - 1).height = 32;
  row += 1;

  const nodeConditions = node.conditions || [];
  const rules = node.config.gateRules || [];
  if (nodeConditions.length || rules.length) {
    row = writeSection(sheet, row, "CONDITIONS");
    writeKey(sheet, row, "");
    const conditionHeaders = [
      [2, "Done"],
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
        row = writeSection(sheet, row, "REQUIRED DOCUMENTS");
        row = writeHeaders(sheet, row, [
          "Signed",
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

  row += 2;
  return row;
}

export function writePhaseSheet(
  sheet: Worksheet,
  phase: DomainNode,
  file: WorkflowFile,
) {
  const lists = {
    departments: departmentList(file),
    people: peopleList(file),
  };
  const projectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  const children = childrenOfPhase(file, phase.id);
  const color = phase.color || "#57534e";
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

  writeKey(sheet, 1, `${KEY.phase}:${phase.id}`);
  merge(sheet, 1, 2, LAST_COL);
  fillRange(sheet, 1, 2, LAST_COL, hexArgb(color));
  const title = sheet.getCell(1, 2);
  title.value = phase.title;
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(1).height = 32;

  writeKey(sheet, 2, KEY.phaseDesc);
  const hint = sheet.getCell(2, 2);
  hint.value = "Description";
  styleLabel(hint);
  merge(sheet, 2, 3, LAST_COL);
  writeEditable(sheet, 2, 3, phase.description);
  sheet.getRow(2).height = 28;

  const note = sheet.getCell(3, 2);
  note.value =
    "Each block is one Gate. Green TRUE/FALSE cells are checkboxes. Yellow cells and dropdowns import back into the web app. This sheet is a form — not a flowchart.";
  note.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF78716C" } };
  merge(sheet, 3, 2, LAST_COL);
  sheet.getRow(3).height = 20;

  let row = 5;
  if (!children.length) {
    sheet.getCell(row, 2).value = "No gates in this phase.";
    styleLabel(sheet.getCell(row, 2));
    return;
  }
  for (const child of children) {
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
    if (kind === KEY.gate) {
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
    if (phaseId) {
      const layout = next.layout.nodes[node.id];
      if (layout && layout.parentId !== phaseId) {
        next = {
          ...next,
          layout: {
            ...next.layout,
            nodes: {
              ...next.layout.nodes,
              [node.id]: { ...layout, parentId: phaseId },
            },
          },
        };
      }
    }
    const value = rawCell(sheet.getCell(row, 3));
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
    }
  }
  return next;
}
