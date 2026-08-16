import type { Cell, Workbook, Worksheet } from "exceljs";

export const EXCEL_FORMAT = "project-workflow-builder.excel.v1";
export const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PAYLOAD_CHUNK = 30000;

export const SHEETS = {
  map: "Visual Flow",
  overview: "Overview",
  nodes: "Nodes",
  conditions: "Conditions",
  documents: "Documents",
  approvals: "Approvals",
  signatures: "Signatures",
  outcomes: "Outcomes",
  connections: "Connections",
  layout: "Layout",
  edgeRoutes: "Edge Routes",
  rules: "Validation Rules",
  payload: "_Payload",
} as const;

export const NODE_HEADERS = [
  "id",
  "type",
  "title",
  "description",
  "color",
  "icon",
  "parentId",
  "phase",
  "stage",
  "projectId",
  "nodeUuid",
  "legacyJobNumber",
  "serviceType",
  "buildingCode",
  "moduleCode",
  "approvedDepartment",
  "approvedBy",
  "gateLabel",
  "decisionMode",
  "collapsed",
  "locked",
  "documents",
  "criteria",
  "metadataJson",
  "customFieldsJson",
  "configJson",
  "nodeJson",
] as const;

export const CONDITION_HEADERS = [
  "nodeId",
  "id",
  "label",
  "required",
  "checked",
  "locked",
  "expression",
  "description",
] as const;

export const DOCUMENT_HEADERS = ["nodeId", "order", "name"] as const;

export const APPROVAL_HEADERS = [
  "nodeId",
  "id",
  "label",
  "checked",
  "requirementType",
  "condition",
  "serviceTypeId",
  "buildingCode",
  "moduleCode",
] as const;

export const SIGNATURE_HEADERS = [
  "nodeId",
  "ruleId",
  "id",
  "abbreviation",
  "fullName",
  "department",
  "signedBy",
  "checked",
  "requirementType",
  "owner",
  "receivedDate",
  "revision",
  "status",
  "serviceType",
  "revisionControlled",
  "collapsed",
  "revisionsJson",
] as const;

export const OUTCOME_HEADERS = [
  "nodeId",
  "id",
  "label",
  "edgeType",
  "color",
  "enabled",
  "rule",
] as const;

export const CONNECTION_HEADERS = [
  "id",
  "type",
  "source",
  "target",
  "sourceHandle",
  "targetHandle",
  "label",
  "lineStyle",
  "arrowStyle",
  "conditionJson",
  "customFieldsJson",
  "edgeJson",
] as const;

export const LAYOUT_HEADERS = [
  "nodeId",
  "x",
  "y",
  "width",
  "height",
  "parentId",
  "zIndex",
] as const;

export const EDGE_ROUTE_HEADERS = ["edgeId", "pointsJson"] as const;

export const RULE_HEADERS = [
  "id",
  "name",
  "enabled",
  "severity",
  "kind",
  "nodeType",
  "field",
] as const;

export type TableRow = Record<string, unknown>;

export const isBlank = (value: unknown) =>
  value === null || value === undefined || value === "";

export function rawCell(cell: Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("result" in value) return (value as { result?: unknown }).result;
    if ("text" in value && typeof (value as { text: string }).text === "string")
      return (value as { text: string }).text;
    if ("richText" in value)
      return (value as { richText: { text: string }[] }).richText
        .map((part) => part.text)
        .join("");
    if ("formula" in value)
      return (value as { result?: unknown }).result ?? "";
    if (value instanceof Date) return value.toISOString();
  }
  return value ?? "";
}

export function asString(value: unknown): string {
  if (isBlank(value)) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

export function asBoolean(value: unknown): boolean | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = asString(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(asString(value).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function asJson<T>(value: unknown): T | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(asString(value)) as T;
  } catch {
    return undefined;
  }
}

export function encodeCell(value: unknown): string | number | boolean {
  if (isBlank(value)) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function hexArgb(hex: string, alpha = "FF"): string {
  const digits = hex.replace("#", "").replace(/^0x/i, "");
  const rgb = (digits.length === 3
    ? digits
        .split("")
        .map((part) => part + part)
        .join("")
    : digits
  )
    .padEnd(6, "0")
    .slice(0, 6)
    .toUpperCase();
  return `${alpha}${rgb}`;
}

export function mixWhite(hex: string, amount = 0.84): string {
  const argb = hexArgb(hex);
  const r = Number.parseInt(argb.slice(2, 4), 16);
  const g = Number.parseInt(argb.slice(4, 6), 16);
  const b = Number.parseInt(argb.slice(6, 8), 16);
  const mix = (channel: number) =>
    Math.round(channel + (255 - channel) * amount);
  return `FF${[mix(r), mix(g), mix(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export const thinBorder = (hex = "#94a3b8") => {
  const color = { argb: hexArgb(hex) };
  return {
    top: { style: "thin" as const, color },
    left: { style: "thin" as const, color },
    bottom: { style: "thin" as const, color },
    right: { style: "thin" as const, color },
  };
};

export const headerFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FF1E3A5F" },
};

export const headerFont = {
  name: "Calibri",
  size: 10,
  bold: true,
  color: { argb: "FFFFFFFF" },
};

export function styleHeaderRow(sheet: Worksheet, columns: number) {
  const row = sheet.getRow(1);
  row.height = 22;
  for (let column = 1; column <= columns; column += 1) {
    const cell = row.getCell(column);
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thinBorder("#1e3a5f");
  }
}

export function writeTable(
  sheet: Worksheet,
  headers: readonly string[],
  rows: TableRow[],
  widths?: number[],
) {
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  sheet.addRow([...headers]);
  styleHeaderRow(sheet, headers.length);
  for (const row of rows) {
    sheet.addRow(headers.map((header) => encodeCell(row[header])));
  }
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width =
      widths?.[index] ?? Math.min(42, Math.max(14, header.length + 4));
  });
}

export function readTable(sheet: Worksheet | undefined): TableRow[] {
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  const lastColumn = Math.max(sheet.columnCount, headerRow.cellCount);
  for (let column = 1; column <= lastColumn; column += 1) {
    headers[column] = asString(rawCell(headerRow.getCell(column))).trim();
  }
  const rows: TableRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const excelRow = sheet.getRow(index);
    const row: TableRow = {};
    let empty = true;
    headers.forEach((header, column) => {
      if (!header) return;
      const value = rawCell(excelRow.getCell(column));
      row[header] = value;
      if (!isBlank(value)) empty = false;
    });
    if (!empty) rows.push(row);
  }
  return rows;
}

export function splitPayload(json: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < json.length; index += PAYLOAD_CHUNK) {
    chunks.push(json.slice(index, index + PAYLOAD_CHUNK));
  }
  return chunks.length ? chunks : [""];
}

export function writePayload(workbook: Workbook, json: string) {
  const sheet = workbook.addWorksheet(SHEETS.payload, {
    state: "hidden",
  });
  sheet.getCell(1, 1).value = "format";
  sheet.getCell(1, 2).value = EXCEL_FORMAT;
  sheet.getCell(2, 1).value = "chunkCount";
  const chunks = splitPayload(json);
  sheet.getCell(2, 2).value = chunks.length;
  chunks.forEach((chunk, index) => {
    sheet.getCell(index + 3, 1).value = chunk;
  });
}

export function readPayloadJson(workbook: Workbook): string | undefined {
  const sheet = workbook.getWorksheet(SHEETS.payload);
  if (!sheet) return undefined;
  const format = asString(rawCell(sheet.getCell(1, 2)));
  if (format && format !== EXCEL_FORMAT) return undefined;
  const count = asNumber(rawCell(sheet.getCell(2, 2))) ?? 0;
  if (count <= 0) return undefined;
  let json = "";
  for (let index = 0; index < count; index += 1) {
    json += asString(rawCell(sheet.getCell(index + 3, 1)));
  }
  return json || undefined;
}

export function joinList(values: string[] | undefined): string {
  return (values || []).join(" | ");
}

export function splitList(value: unknown): string[] | undefined {
  if (isBlank(value)) return undefined;
  return asString(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}
