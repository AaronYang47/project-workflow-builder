import type { Worksheet } from "exceljs";
import { getNodeDefinition } from "@/lib/node-catalog";
import { projectNodeUuid } from "@/lib/project-id";
import type {
  DomainEdge,
  DomainNode,
  WorkflowFile,
} from "@/types/workflow";
import {
  headerFill,
  headerFont,
  hexArgb,
  mixWhite,
  thinBorder,
} from "@/lib/excel-format";

const CARD_COLS = 5;
const CARD_ROWS = 9;
const GAP_COLS = 2;
const CARDS_PER_ROW = 5;
const EDGE_COLORS: Record<string, string> = {
  success: "#16866f",
  failure: "#b34a47",
  hold: "#c2410c",
  rework: "#b34a47",
  approval: "#6d5c9d",
  normal: "#3f668c",
};

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

function nodeById(file: WorkflowFile, id: string) {
  return file.graph.nodes.find((node) => node.id === id);
}

function outgoing(file: WorkflowFile, nodeId: string) {
  return file.graph.edges.filter((edge) => edge.source === nodeId);
}

function conditionSummary(node: DomainNode) {
  const rules = node.config.gateRules || [];
  if (rules.length) {
    const ready = rules.filter((rule) => rule.checked).length;
    const signatures = rules.flatMap((rule) => rule.signatures || []);
    const signed = signatures.filter((item) => item.checked).length;
    return `Rules ${ready}/${rules.length} · Signatures ${signed}/${signatures.length}`;
  }
  if (!node.conditions.length) return "No conditions";
  const ready = node.conditions.filter((item) => item.checked).length;
  return `Conditions ${ready}/${node.conditions.length}`;
}

function edgeCaption(edge: DomainEdge, file: WorkflowFile) {
  const target = nodeById(file, edge.target);
  const label = edge.label || edge.type.toUpperCase();
  return `${label} → ${target?.title || edge.target}`;
}

function paintRange(
  sheet: Worksheet,
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
  fill: string,
  borderHex: string,
) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
      cell.border = thinBorder(borderHex);
    }
  }
}

function writeCard(
  sheet: Worksheet,
  row: number,
  col: number,
  node: DomainNode,
  file: WorkflowFile,
  projectStart?: DomainNode,
) {
  const color = node.color || getNodeDefinition(node.type).color;
  const edges = outgoing(file, node.id);
  const uuid = projectNodeUuid(node, projectStart);
  const typeLabel = getNodeDefinition(node.type).label.toUpperCase();
  const stage = String(node.config.stage || node.customFields.phase || "");
  paintRange(sheet, row, col, CARD_ROWS, CARD_COLS, mixWhite(color), color);
  sheet.mergeCells(row, col, row, col + CARD_COLS - 1);
  sheet.mergeCells(row + 1, col, row + 1, col + CARD_COLS - 1);
  sheet.mergeCells(row + 2, col, row + 3, col + CARD_COLS - 1);
  sheet.mergeCells(row + 4, col, row + 4, col + CARD_COLS - 1);
  sheet.mergeCells(row + 5, col, row + 6, col + CARD_COLS - 1);
  sheet.mergeCells(row + 7, col, row + 7, col + CARD_COLS - 1);
  sheet.mergeCells(row + 8, col, row + 8, col + CARD_COLS - 1);

  const header = sheet.getCell(row, col);
  header.value = stage ? `${typeLabel}  ·  ${stage}` : typeLabel;
  header.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: hexArgb(color) },
  };

  const title = sheet.getCell(row + 1, col);
  title.value = node.title;
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0F172A" } };
  title.alignment = { vertical: "middle", wrapText: true };

  const description = sheet.getCell(row + 2, col);
  description.value = node.description || "—";
  description.font = { name: "Calibri", size: 10, color: { argb: "FF334155" } };
  description.alignment = { vertical: "top", wrapText: true };

  const summary = sheet.getCell(row + 4, col);
  summary.value = conditionSummary(node);
  summary.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF475569" } };

  const routes = sheet.getCell(row + 5, col);
  routes.value = edges.length
    ? edges.map((edge) => edgeCaption(edge, file)).join("\n")
    : "No outgoing connections";
  routes.font = { name: "Calibri", size: 9, color: { argb: "FF1E3A5F" } };
  routes.alignment = { vertical: "top", wrapText: true };

  const uuidCell = sheet.getCell(row + 7, col);
  uuidCell.value = uuid ? `UUID ${uuid}` : "";
  uuidCell.font = { name: "Calibri", size: 8, color: { argb: "FF64748B" } };

  const idCell = sheet.getCell(row + 8, col);
  idCell.value = node.id;
  idCell.font = { name: "Calibri", size: 8, color: { argb: "FF94A3B8" } };
}

function writeArrow(
  sheet: Worksheet,
  row: number,
  col: number,
  edge?: DomainEdge,
) {
  if (!edge) return;
  sheet.mergeCells(row, col, row + CARD_ROWS - 1, col + GAP_COLS - 1);
  const cell = sheet.getCell(row, col);
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  const color = EDGE_COLORS[edge.type] || "#3f668c";
  cell.value = `${edge.label || edge.type.toUpperCase()}\n→`;
  cell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: hexArgb(color) },
  };
}

function writeSection(
  sheet: Worksheet,
  startRow: number,
  title: string,
  color: string,
  nodes: DomainNode[],
  file: WorkflowFile,
  projectStart?: DomainNode,
) {
  if (!nodes.length) return startRow;
  const columns = Math.min(CARDS_PER_ROW, nodes.length) * (CARD_COLS + GAP_COLS);
  sheet.mergeCells(startRow, 1, startRow, Math.max(columns, CARD_COLS));
  const heading = sheet.getCell(startRow, 1);
  heading.value = title;
  heading.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  heading.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: hexArgb(color) },
  };
  heading.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(startRow).height = 26;

  let row = startRow + 2;
  for (let index = 0; index < nodes.length; index += CARDS_PER_ROW) {
    const slice = nodes.slice(index, index + CARDS_PER_ROW);
    slice.forEach((node, offset) => {
      const col = 1 + offset * (CARD_COLS + GAP_COLS);
      writeCard(sheet, row, col, node, file, projectStart);
      if (offset < slice.length - 1) {
        const next = slice[offset + 1];
        const edge = outgoing(file, node.id).find(
          (item) => item.target === next.id,
        );
        writeArrow(sheet, row, col + CARD_COLS, edge);
      }
    });
    for (let extra = 0; extra < CARD_ROWS; extra += 1) {
      sheet.getRow(row + extra).height = extra === 1 ? 24 : extra === 2 || extra === 5 ? 32 : 18;
    }
    row += CARD_ROWS + 2;
  }
  return row;
}

function writePathTable(
  sheet: Worksheet,
  startRow: number,
  file: WorkflowFile,
) {
  sheet.mergeCells(startRow, 1, startRow, 8);
  const heading = sheet.getCell(startRow, 1);
  heading.value = "Approval and connection paths";
  heading.font = headerFont;
  heading.fill = headerFill;
  heading.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(startRow).height = 22;

  const headers = ["From", "From ID", "Route", "Type", "To", "To ID", "Condition"];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(startRow + 1, index + 1);
    cell.value = header;
    cell.font = { name: "Calibri", size: 10, bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    cell.border = thinBorder("#94a3b8");
  });

  file.graph.edges.forEach((edge, index) => {
    const source = nodeById(file, edge.source);
    const target = nodeById(file, edge.target);
    const color = EDGE_COLORS[edge.type] || "#3f668c";
    const values = [
      source?.title || edge.source,
      edge.source,
      edge.label || edge.type.toUpperCase(),
      edge.type,
      target?.title || edge.target,
      edge.target,
      edge.condition?.expression || edge.condition?.description || "",
    ];
    values.forEach((value, column) => {
      const cell = sheet.getCell(startRow + 2 + index, column + 1);
      cell.value = value;
      cell.border = thinBorder("#cbd5e1");
      cell.alignment = { vertical: "middle", wrapText: true };
      if (column === 2) {
        cell.font = { bold: true, color: { argb: hexArgb(color) } };
      }
    });
    sheet.getRow(startRow + 2 + index).height = 22;
  });
}

export function writeWorkflowMap(sheet: Worksheet, file: WorkflowFile) {
  sheet.views = [{ state: "frozen", ySplit: 3, showGridLines: false, zoomScale: 90 }];
  sheet.properties.tabColor = { argb: "FF2563A9" };
  for (let column = 1; column <= 40; column += 1) sheet.getColumn(column).width = 14;

  const meta = file.graph.metadata;
  sheet.mergeCells(1, 1, 1, 18);
  const title = sheet.getCell(1, 1);
  title.value = `${meta.name}  ·  ${meta.version}  ·  ${meta.status}`;
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF0F172A" } };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, 18);
  const hint = sheet.getCell(2, 1);
  hint.value =
    "Visual overview of the workflow. Edit Nodes, Conditions, Documents, Approvals, Connections, and Layout sheets to change data, then Import Excel. Canvas positions are restored from the Layout sheet.";
  hint.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF64748B" } };
  sheet.getRow(2).height = 20;

  const projectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  const phases = file.graph.nodes
    .filter((node) => node.type === "phase")
    .sort(
      (a, b) =>
        absolutePosition(file, a.id).x - absolutePosition(file, b.id).x,
    );
  const childIds = new Set(
    Object.values(file.layout.nodes)
      .filter((layout) => layout.parentId)
      .map((layout) => layout.nodeId),
  );
  const ungrouped = file.graph.nodes
    .filter(
      (node) =>
        node.type !== "phase" &&
        !childIds.has(node.id) &&
        !file.graph.nodes.some(
          (item) => file.layout.nodes[item.id]?.parentId === node.id,
        ),
    )
    .sort(
      (a, b) =>
        absolutePosition(file, a.id).x - absolutePosition(file, b.id).x ||
        absolutePosition(file, a.id).y - absolutePosition(file, b.id).y,
    );

  let row = 4;
  if (ungrouped.length) {
    row = writeSection(
      sheet,
      row,
      "Workflow",
      "#1e3a5f",
      ungrouped,
      file,
      projectStart,
    );
  }
  for (const phase of phases) {
    const children = file.graph.nodes
      .filter((node) => file.layout.nodes[node.id]?.parentId === phase.id)
      .sort(
        (a, b) =>
          (file.layout.nodes[a.id]?.x || 0) - (file.layout.nodes[b.id]?.x || 0),
      );
    row = writeSection(
      sheet,
      row,
      phase.title || "Phase",
      phase.color || "#64748b",
      children.length ? children : [phase],
      file,
      projectStart,
    );
  }
  writePathTable(sheet, row + 1, file);
}
