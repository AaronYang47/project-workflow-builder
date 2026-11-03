import { downloadBlob } from "@/lib/serialization";
import { isReleaseConditionChapter } from "@/lib/release-condition-inbox";
import type { WorkflowFile } from "@/types/workflow";

export interface ReleaseConditionSpreadsheetRow {
  label: string;
  chapterName: string;
  conditionId: string;
}

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function exceljs() {
  const mod = await import("exceljs");
  return (mod.default ?? mod) as typeof import("exceljs");
}

export async function downloadReleaseConditionTemplate(file: WorkflowFile) {
  const ExcelJS = await exceljs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Falcon Process Building System";
  const sheet = workbook.addWorksheet("Conditions");
  sheet.columns = [
    { header: "Release Condition", key: "condition", width: 64 },
    { header: "Department (optional)", key: "chapter", width: 42 },
    { header: "Condition ID (keep for existing rows)", key: "id", width: 52 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:C1";
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.getColumn(1).alignment = { vertical: "top", wrapText: true };
  sheet.getColumn(2).alignment = { vertical: "top", wrapText: true };
  sheet.getColumn(3).alignment = { vertical: "top" };
  for (const condition of file.releaseConditionInbox ?? []) {
    sheet.addRow([condition.label || condition.description || "", "", condition.id || ""]);
  }
  const chapters = file.graph.nodes.filter(isReleaseConditionChapter);
  for (const chapter of chapters) {
    for (const condition of chapter.conditions) {
      sheet.addRow([condition.label || condition.description || "", chapter.title, condition.id || ""]);
    }
  }
  for (let index = 2; index <= sheet.rowCount; index++) {
    sheet.getCell(`C${index}`).font = { color: { argb: "FF64748B" } };
  }

  const guide = workbook.addWorksheet("How to use");
  guide.getColumn(1).width = 70;
  guide.getColumn(2).width = 40;
  guide.getColumn(3).width = 52;
  guide.addRow(["Fill one release condition per row on the Conditions sheet. Existing conditions are already included."]);
  guide.addRow(["Column A: edit the condition text. Column B: enter an existing Department name, or leave blank for Unassigned."]);
  guide.addRow(["Column C: keep the ID on existing rows. Leave it blank when adding a new condition. Reimporting existing rows updates them without duplicates."]);
  guide.addRow(["Removing a row from Excel does not delete it from the project; use Delete in the workspace."]);
  guide.addRow([]);
  guide.addRow(["Sample new row — copy the values into a blank row on Conditions:"]);
  guide.addRow(["Release Condition", "Department (optional)", "Condition ID (keep for existing rows)"]);
  guide.addRow(["Permit drawing approved", chapters[0]?.title ?? "", ""]);
  guide.addRow([]);
  guide.addRow(["Existing Departments"]);
  for (const chapter of chapters) guide.addRow([chapter.title]);
  guide.getRow(7).font = { bold: true };
  guide.getRow(10).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob("release-conditions-template.xlsx", buffer as ArrayBuffer, EXCEL_MIME);
}

function cellText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => typeof part?.text === "string" ? part.text : "").join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }
  return "";
}

export async function parseReleaseConditionExcel(data: ArrayBuffer): Promise<ReleaseConditionSpreadsheetRow[]> {
  const ExcelJS = await exceljs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.getWorksheet("Conditions") ?? workbook.worksheets[0];
  if (!sheet) throw new Error("The workbook has no worksheet.");
  const headers = sheet.getRow(1).values;
  const headerValues = Array.isArray(headers) ? headers.map((value) => cellText(value).toLowerCase()) : [];
  const conditionColumn = headerValues.findIndex((value) => value === "release condition" || value === "condition");
  const chapterColumn = headerValues.findIndex((value) => value === "department" || value === "department (optional)" || value === "department name" || value === "chapter" || value === "chapter (optional)" || value === "chapter name");
  const idColumn = headerValues.findIndex((value) => value === "condition id" || value === "condition id (keep for existing rows)");
  if (conditionColumn < 1) throw new Error("The first row needs a ‘Release Condition’ column. Please use the downloaded template.");

  const rows: ReleaseConditionSpreadsheetRow[] = [];
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const label = cellText(row.getCell(conditionColumn).value);
    const chapterName = chapterColumn > 0 ? cellText(row.getCell(chapterColumn).value) : "";
    const conditionId = idColumn > 0 ? cellText(row.getCell(idColumn).value) : "";
    if (!label && !chapterName && !conditionId) continue;
    if (!label) throw new Error(`Row ${index} has a Department but no Release Condition.`);
    rows.push({ label, chapterName, conditionId });
  }
  if (!rows.length) throw new Error("No release conditions were found in the spreadsheet.");
  return rows;
}
