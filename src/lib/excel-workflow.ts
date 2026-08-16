import type { Workbook } from "exceljs";
import {
  EXCEL_MIME,
  excelSheetName,
  readPayloadJson,
  visibleWorksheets,
  writePayload,
} from "@/lib/excel-format";
import {
  applyPhaseSheet,
  buildPhaseTabs,
  writePhaseSheet,
} from "@/lib/excel-phase";
import { downloadBlob, parseWorkflowValue, serializeWorkflow } from "@/lib/serialization";
import type { WorkflowFile } from "@/types/workflow";

async function exceljs() {
  const mod = await import("exceljs");
  return (mod.default ?? mod) as typeof import("exceljs");
}

function writePhaseWorkbook(workbook: Workbook, file: WorkflowFile) {
  const used = new Set<string>();
  const tabs = buildPhaseTabs(file);
  for (const tab of tabs) {
    const name = excelSheetName(tab.title || tab.phase?.title || "Workflow", used);
    const sheet = workbook.addWorksheet(name);
    writePhaseSheet(sheet, tab.phase, tab.nodes, file, tab.title);
  }
}

export async function workflowToExcelBuffer(
  file: WorkflowFile,
): Promise<ArrayBuffer> {
  const ExcelJS = await exceljs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Project Workflow Builder";
  workbook.created = new Date(file.graph.metadata.createdAt || Date.now());
  workbook.modified = new Date();
  writePhaseWorkbook(workbook, file);
  writePayload(workbook, serializeWorkflow(file));
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export const MISSING_WORKFLOW_PAYLOAD =
  "This Excel file is missing the hidden workflow payload. Export from Project Workflow Builder, then import that file.";
export const DAMAGED_WORKFLOW_PAYLOAD =
  "This Excel file's workflow payload is damaged and cannot be imported. Export a fresh copy from Project Workflow Builder.";

export async function parseWorkflowExcel(
  data: ArrayBuffer | Uint8Array | Buffer,
): Promise<WorkflowFile> {
  const ExcelJS = await exceljs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as ArrayBuffer);
  const payloadJson = readPayloadJson(workbook);
  if (!payloadJson) {
    throw new Error(MISSING_WORKFLOW_PAYLOAD);
  }
  let file: WorkflowFile;
  try {
    file = parseWorkflowValue(JSON.parse(payloadJson));
  } catch {
    throw new Error(DAMAGED_WORKFLOW_PAYLOAD);
  }
  for (const sheet of visibleWorksheets(workbook)) {
    file = applyPhaseSheet(sheet, file);
  }
  return parseWorkflowValue(file);
}

export async function downloadWorkflowExcel(file: WorkflowFile) {
  const buffer = await workflowToExcelBuffer(file);
  const name = `${file.graph.metadata.name.replace(/\W+/g, "-").toLowerCase() || "workflow"}.xlsx`;
  downloadBlob(name, buffer, EXCEL_MIME);
}
