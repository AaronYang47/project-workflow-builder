import type { Cell, Workbook, Worksheet } from "exceljs";

export const EXCEL_FORMAT = "project-workflow-builder.excel.v3";
export const EXCEL_FORMAT_LEGACY = [
  "project-workflow-builder.excel.v1",
  "project-workflow-builder.excel.v2",
] as const;
export const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PAYLOAD_CHUNK = 30000;
export const PAYLOAD_SHEET = "_Payload";

export const KEY = {
  phase: "#phase",
  phaseDesc: "#phase.desc",
  gate: "#gate",
  gateId: "#gate.id",
  gateUuid: "#gate.uuid",
  gateTitle: "#gate.title",
  gateDescription: "#gate.description",
  gateStatus: "#gate.status",
  gateOwner: "#gate.owner",
  gateDepartment: "#gate.department",
  gateApprover: "#gate.approver",
  gateResult: "#gate.result",
  gateNotes: "#gate.notes",
  section: "#section",
  condition: "#condition",
  document: "#document",
} as const;

export const LISTS = {
  boolean: '"TRUE,FALSE"',
  requirement: '"Required,Optional"',
  docStatus: '"Draft,In Review,Current,Approved,Superseded"',
  approvalResult: '"Pending,Approved,Denied,Hold"',
  gateStatus: '"Blocked,In Progress,Ready,Open,Approved"',
} as const;

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

const TRUE_TOKENS = new Set([
  "true",
  "yes",
  "y",
  "1",
  "checked",
  "signed",
  "done",
  "x",
  "☑",
  "✓",
  "✅",
]);
const FALSE_TOKENS = new Set([
  "false",
  "no",
  "n",
  "0",
  "unchecked",
  "unsigned",
  "pending",
  "☐",
  "□",
]);

export function asBoolean(value: unknown): boolean | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = asString(value).trim().toLowerCase();
  if (TRUE_TOKENS.has(text)) return true;
  if (FALSE_TOKENS.has(text)) return false;
  return undefined;
}

export function hexArgb(hex: string, alpha = "FF"): string {
  const digits = hex.replace("#", "").replace(/^0x/i, "");
  const rgb = (
    digits.length === 3
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

export function mixWhite(hex: string, amount = 0.88): string {
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

export function applyListValidation(cell: Cell, formulae: string) {
  cell.dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [formulae],
    showErrorMessage: false,
    showInputMessage: true,
    promptTitle: "Editable",
    prompt: "This value is imported back into the workflow.",
  };
}

export function parseKey(value: unknown): { kind: string; id: string; extra: string } {
  const text = asString(value).trim();
  const [kind, id = "", extra = ""] = text.split(":");
  return { kind, id, extra };
}

export function excelSheetName(title: string, used: Set<string>) {
  const phaseMatch = title.match(/^(PHASE\s*\d+)/i);
  let base = (phaseMatch?.[1] || title)
    .replace(/[\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  if (!base) base = "Phase";
  let name = base;
  let index = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${index})`;
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    index += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export function splitPayload(json: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < json.length; index += PAYLOAD_CHUNK) {
    chunks.push(json.slice(index, index + PAYLOAD_CHUNK));
  }
  return chunks.length ? chunks : [""];
}

export function writePayload(workbook: Workbook, json: string) {
  const sheet = workbook.addWorksheet(PAYLOAD_SHEET, { state: "veryHidden" });
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
  const sheet = workbook.getWorksheet(PAYLOAD_SHEET);
  if (!sheet) return undefined;
  const format = asString(rawCell(sheet.getCell(1, 2)));
  if (
    format &&
    format !== EXCEL_FORMAT &&
    !EXCEL_FORMAT_LEGACY.includes(
      format as (typeof EXCEL_FORMAT_LEGACY)[number],
    )
  )
    return undefined;
  const count = Number(rawCell(sheet.getCell(2, 2))) || 0;
  if (count <= 0) return undefined;
  let json = "";
  for (let index = 0; index < count; index += 1) {
    json += asString(rawCell(sheet.getCell(index + 3, 1)));
  }
  return json || undefined;
}

export function visibleWorksheets(workbook: Workbook): Worksheet[] {
  return workbook.worksheets.filter(
    (sheet) =>
      sheet.state !== "hidden" &&
      sheet.state !== "veryHidden" &&
      sheet.name !== PAYLOAD_SHEET &&
      !sheet.name.startsWith("_"),
  );
}
