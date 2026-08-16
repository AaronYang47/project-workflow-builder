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

function emptyWorkflow(): WorkflowFile {
  const now = new Date().toISOString();
  return {
    graph: {
      schemaVersion: 1,
      metadata: {
        name: "Untitled Project",
        version: "v1.0-draft",
        status: "Draft",
        createdAt: now,
        updatedAt: now,
        notes: "",
      },
      nodes: [],
      edges: [],
      rules: [],
    },
    layout: {
      nodes: {},
      viewport: { x: 0, y: 0, zoom: 1 },
      snapToGrid: true,
      gridSize: 16,
    },
  };
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

export async function parseWorkflowExcel(
  data: ArrayBuffer | Uint8Array | Buffer,
): Promise<WorkflowFile> {
  const ExcelJS = await exceljs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as ArrayBuffer);
  const payloadJson = readPayloadJson(workbook);
  let file = emptyWorkflow();
  if (payloadJson) {
    try {
      file = parseWorkflowValue(JSON.parse(payloadJson));
    } catch {
      file = emptyWorkflow();
    }
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
