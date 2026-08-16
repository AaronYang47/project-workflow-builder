import type { Border, Worksheet } from "exceljs";
import { getNodeDefinition } from "@/lib/node-catalog";
import { projectNodeUuid } from "@/lib/project-id";
import { isReferenceNodeType } from "@/types/workflow";
import type {
  DomainEdge,
  DomainNode,
  WorkflowEdgeType,
  WorkflowFile,
} from "@/types/workflow";
import { hexArgb, mixWhite } from "@/lib/excel-format";

const GATE_COLS = 8;
const ARROW_COLS = 2;
const PHASE_PAD = 1;
const CANVAS_ROW = 6;
const EDGE_COLORS: Record<string, string> = {
  success: "#16866f",
  failure: "#b34a47",
  hold: "#c2410c",
  rework: "#b45309",
  approval: "#6d5c9d",
  normal: "#3f668c",
  dependency: "#64748b",
  supporting: "#64748b",
  exception: "#aa5540",
  reopen: "#7c3aed",
};
const ROUTE_NAMES: Record<WorkflowEdgeType, string> = {
  success: "APPROVE",
  failure: "REJECT",
  hold: "HOLD",
  rework: "REWORK",
  approval: "APPROVAL",
  normal: "NEXT",
  dependency: "DEPENDENCY",
  supporting: "SUPPORT",
  exception: "EXCEPTION",
  reopen: "REOPEN",
};

type LineKind =
  | "banner"
  | "title"
  | "text"
  | "section"
  | "item"
  | "route"
  | "meta";
interface CardLine {
  text: string;
  kind: LineKind;
  color?: string;
}
type FlowBlock =
  | { kind: "phase"; phase: DomainNode; children: DomainNode[]; x: number }
  | { kind: "node"; node: DomainNode; x: number };

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

function routeName(edge: DomainEdge) {
  return edge.label || ROUTE_NAMES[edge.type] || edge.type.toUpperCase();
}

function mark(checked?: boolean) {
  return checked ? "☑" : "☐";
}

function nodeStatus(node: DomainNode) {
  const rules = node.config.gateRules || [];
  if (rules.length) {
    const required = rules.filter((rule) => rule.requirementType !== "Optional");
    const ready = required.filter((rule) => {
      const signatures = (rule.signatures || []).filter(
        (item) => item.requirementType !== "Optional",
      );
      return (
        rule.checked && signatures.every((item) => item.checked)
      );
    });
    if (required.length && ready.length === required.length)
      return { label: "READY", color: "#16866f" };
    if (ready.length) return { label: "IN PROGRESS", color: "#c2410c" };
    return { label: "BLOCKED", color: "#b34a47" };
  }
  if (node.conditions.length) {
    const required = node.conditions.filter((item) => item.required !== false);
    const ready = required.filter((item) => item.checked);
    if (required.length && ready.length === required.length)
      return { label: "READY", color: "#16866f" };
    if (ready.length) return { label: "IN PROGRESS", color: "#c2410c" };
    return { label: "BLOCKED", color: "#b34a47" };
  }
  return { label: "OPEN", color: "#3f668c" };
}

function cardLines(
  node: DomainNode,
  file: WorkflowFile,
  projectStart?: DomainNode,
  phaseTitle?: string,
): CardLine[] {
  const typeLabel = getNodeDefinition(node.type).label.toUpperCase();
  const status = nodeStatus(node);
  const uuid = projectNodeUuid(node, projectStart);
  const lines: CardLine[] = [
    {
      text: `${typeLabel}    ${status.label}`,
      kind: "banner",
      color: node.color || getNodeDefinition(node.type).color,
    },
    { text: node.title, kind: "title" },
  ];
  if (phaseTitle) {
    lines.push({ text: `Phase: ${phaseTitle}`, kind: "meta" });
  }
  if (node.description) {
    lines.push({ text: node.description, kind: "text" });
  }
  if (node.conditions.length) {
    lines.push({ text: "CONDITIONS", kind: "section" });
    for (const condition of node.conditions) {
      lines.push({
        text: `${mark(condition.checked)}  ${condition.label || condition.id || "Condition"}${condition.required === false ? "" : " *"}`,
        kind: "item",
        color: condition.checked ? "#16866f" : "#b34a47",
      });
    }
  }
  if (node.documents.length) {
    lines.push({ text: "DOCUMENTS", kind: "section" });
    for (const document of node.documents) {
      lines.push({ text: `•  ${document}`, kind: "item" });
    }
  }
  const rules = node.config.gateRules || [];
  if (rules.length) {
    lines.push({ text: "APPROVALS", kind: "section" });
    for (const rule of rules) {
      lines.push({
        text: `${mark(rule.checked)}  ${rule.label}${rule.requirementType ? `  ·  ${rule.requirementType}` : ""}`,
        kind: "item",
        color: rule.checked ? "#16866f" : "#b34a47",
      });
      for (const signature of rule.signatures || []) {
        lines.push({
          text: `    ${mark(signature.checked)}  ${signature.abbreviation || signature.fullName}  ·  ${signature.department || signature.signedBy || "unsigned"}`,
          kind: "item",
          color: signature.checked ? "#16866f" : "#64748b",
        });
      }
    }
  }
  if (node.config.approvedDepartment || node.config.approvedBy || node.type === "gate") {
    lines.push({ text: "DECISION", kind: "section" });
    lines.push({
      text: `Department: ${node.config.approvedDepartment || "—"}`,
      kind: "item",
    });
    lines.push({
      text: `Approved by: ${node.config.approvedBy || "—"}`,
      kind: "item",
    });
  }
  const edges = outgoing(file, node.id);
  lines.push({ text: "ROUTES", kind: "section" });
  if (edges.length) {
    for (const edge of edges) {
      const target = nodeById(file, edge.target);
      lines.push({
        text: `${routeName(edge)}  →  ${target?.title || edge.target}`,
        kind: "route",
        color: EDGE_COLORS[edge.type] || "#3f668c",
      });
    }
  } else {
    lines.push({ text: "No outgoing connection", kind: "meta" });
  }
  if (uuid) lines.push({ text: `UUID ${uuid}`, kind: "meta" });
  lines.push({ text: node.id, kind: "meta" });
  return lines;
}

function patchBorder(
  sheet: Worksheet,
  row: number,
  col: number,
  side: "top" | "left" | "bottom" | "right",
  hex: string,
  style: Border["style"] = "medium",
) {
  const cell = sheet.getCell(row, col);
  cell.border = {
    ...(cell.border || {}),
    [side]: { style, color: { argb: hexArgb(hex) } },
  };
}

function fillRect(
  sheet: Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  fill: string,
) {
  for (let row = r1; row <= r2; row += 1) {
    for (let col = c1; col <= c2; col += 1) {
      sheet.getCell(row, col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
    }
  }
}

function strokeRect(
  sheet: Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  hex: string,
  style: Border["style"] = "medium",
) {
  for (let col = c1; col <= c2; col += 1) {
    patchBorder(sheet, r1, col, "top", hex, style);
    patchBorder(sheet, r2, col, "bottom", hex, style);
  }
  for (let row = r1; row <= r2; row += 1) {
    patchBorder(sheet, row, c1, "left", hex, style);
    patchBorder(sheet, row, c2, "right", hex, style);
  }
}

function writeLine(
  sheet: Worksheet,
  row: number,
  col: number,
  cols: number,
  line: CardLine,
  bodyFill: string,
) {
  sheet.mergeCells(row, col, row, col + cols - 1);
  fillRect(sheet, row, col, row, col + cols - 1, bodyFill);
  const cell = sheet.getCell(row, col);
  cell.value = line.text;
  cell.alignment = {
    vertical: line.kind === "title" || line.kind === "banner" ? "middle" : "top",
    wrapText: true,
    indent: line.kind === "item" || line.kind === "route" ? 1 : 0,
  };
  if (line.kind === "banner") {
    fillRect(sheet, row, col, row, col + cols - 1, hexArgb(line.color || "#1e3a5f"));
    cell.font = {
      name: "Calibri",
      size: 9,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
  } else if (line.kind === "title") {
    cell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF0F172A" } };
    sheet.getRow(row).height = 22;
  } else if (line.kind === "section") {
    cell.font = {
      name: "Calibri",
      size: 9,
      bold: true,
      color: { argb: "FF1E3A5F" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
  } else if (line.kind === "route") {
    cell.font = {
      name: "Calibri",
      size: 9,
      bold: true,
      color: { argb: hexArgb(line.color || "#3f668c") },
    };
  } else if (line.kind === "item") {
    cell.font = {
      name: "Calibri",
      size: 9,
      color: { argb: hexArgb(line.color || "#334155") },
    };
  } else if (line.kind === "meta") {
    cell.font = { name: "Calibri", size: 8, color: { argb: "FF64748B" } };
  } else {
    cell.font = { name: "Calibri", size: 9, color: { argb: "FF475569" } };
    sheet.getRow(row).height = 28;
  }
}

function writeCard(
  sheet: Worksheet,
  row: number,
  col: number,
  height: number,
  node: DomainNode,
  file: WorkflowFile,
  projectStart?: DomainNode,
  phaseTitle?: string,
) {
  const color = node.color || getNodeDefinition(node.type).color;
  const body = mixWhite(color, 0.9);
  const lines = cardLines(node, file, projectStart, phaseTitle);
  fillRect(sheet, row, col, row + height - 1, col + GATE_COLS - 1, body);
  lines.forEach((line, index) => {
    writeLine(sheet, row + index, col, GATE_COLS, line, body);
  });
  strokeRect(
    sheet,
    row,
    col,
    row + height - 1,
    col + GATE_COLS - 1,
    color,
    "medium",
  );
}

function writeArrow(
  sheet: Worksheet,
  row: number,
  col: number,
  height: number,
  edge?: DomainEdge,
) {
  if (!edge) return;
  sheet.mergeCells(row, col, row + height - 1, col + ARROW_COLS - 1);
  const color = EDGE_COLORS[edge.type] || "#3f668c";
  const cell = sheet.getCell(row, col);
  cell.value = `${routeName(edge)}\n→`;
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.font = {
    name: "Calibri",
    size: 9,
    bold: true,
    color: { argb: hexArgb(color) },
  };
}

function edgeBetween(file: WorkflowFile, sourceId: string, targetId: string) {
  return outgoing(file, sourceId).find((edge) => edge.target === targetId);
}

function rightmostId(block: FlowBlock) {
  if (block.kind === "node") return block.node.id;
  return block.children[block.children.length - 1]?.id || block.phase.id;
}

function leftmostId(block: FlowBlock) {
  if (block.kind === "node") return block.node.id;
  return block.children[0]?.id || block.phase.id;
}

function writePhase(
  sheet: Worksheet,
  row: number,
  col: number,
  phase: DomainNode,
  children: DomainNode[],
  cardHeight: number,
  file: WorkflowFile,
  projectStart?: DomainNode,
) {
  const inner = Math.max(1, children.length);
  const width =
    PHASE_PAD +
    inner * GATE_COLS +
    Math.max(0, inner - 1) * ARROW_COLS +
    PHASE_PAD;
  const headerRows = 2;
  const height = headerRows + 1 + cardHeight + 1;
  const color = phase.color || "#64748b";
  fillRect(
    sheet,
    row,
    col,
    row + height - 1,
    col + width - 1,
    mixWhite(color, 0.94),
  );
  sheet.mergeCells(row, col, row + headerRows - 1, col + width - 1);
  fillRect(
    sheet,
    row,
    col,
    row + headerRows - 1,
    col + width - 1,
    hexArgb(color),
  );
  const header = sheet.getCell(row, col);
  header.value = `${phase.title || "Phase"}    ·    ${children.length} node${children.length === 1 ? "" : "s"}`;
  header.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(row).height = 22;
  const gateRow = row + headerRows + 1;
  const nodes = children.length ? children : [];
  nodes.forEach((node, index) => {
    const gateCol = col + PHASE_PAD + index * (GATE_COLS + ARROW_COLS);
    writeCard(
      sheet,
      gateRow,
      gateCol,
      cardHeight,
      node,
      file,
      projectStart,
      phase.title,
    );
    if (index < nodes.length - 1) {
      writeArrow(
        sheet,
        gateRow,
        gateCol + GATE_COLS,
        cardHeight,
        edgeBetween(file, node.id, nodes[index + 1].id),
      );
    }
  });
  strokeRect(
    sheet,
    row,
    col,
    row + height - 1,
    col + width - 1,
    color,
    "medium",
  );
  return { width, height };
}

function writeStandalone(
  sheet: Worksheet,
  row: number,
  col: number,
  node: DomainNode,
  cardHeight: number,
  file: WorkflowFile,
  projectStart?: DomainNode,
) {
  const color = node.color || getNodeDefinition(node.type).color;
  const height = 2 + 1 + cardHeight + 1;
  fillRect(
    sheet,
    row,
    col,
    row + height - 1,
    col + GATE_COLS + 1,
    mixWhite(color, 0.94),
  );
  sheet.mergeCells(row, col, row + 1, col + GATE_COLS + 1);
  fillRect(sheet, row, col, row + 1, col + GATE_COLS + 1, hexArgb(color));
  const header = sheet.getCell(row, col);
  header.value = getNodeDefinition(node.type).label;
  header.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", indent: 1 };
  writeCard(
    sheet,
    row + 3,
    col + 1,
    cardHeight,
    node,
    file,
    projectStart,
  );
  strokeRect(
    sheet,
    row,
    col,
    row + height - 1,
    col + GATE_COLS + 1,
    color,
    "medium",
  );
  return { width: GATE_COLS + 2, height };
}

function flowBlocks(file: WorkflowFile): FlowBlock[] {
  const phases = file.graph.nodes
    .filter((node) => node.type === "phase")
    .map((phase) => {
      const children = file.graph.nodes
        .filter((node) => file.layout.nodes[node.id]?.parentId === phase.id)
        .sort((a, b) => {
          const left = file.layout.nodes[a.id];
          const right = file.layout.nodes[b.id];
          return (left?.x || 0) - (right?.x || 0) || (left?.y || 0) - (right?.y || 0);
        });
      return {
        kind: "phase" as const,
        phase,
        children,
        x: absolutePosition(file, phase.id).x,
      };
    });
  const nested = new Set(
    phases.flatMap((block) => [
      block.phase.id,
      ...block.children.map((node) => node.id),
    ]),
  );
  const loose = file.graph.nodes
    .filter(
      (node) =>
        !nested.has(node.id) &&
        !isReferenceNodeType(node.type) &&
        node.type !== "phase",
    )
    .map((node) => ({
      kind: "node" as const,
      node,
      x: absolutePosition(file, node.id).x,
    }));
  return [...phases, ...loose].sort((a, b) => a.x - b.x);
}

function writeLegend(sheet: Worksheet) {
  const items: [string, string][] = [
    ["APPROVE / YES", "#16866f"],
    ["REJECT / NO", "#b34a47"],
    ["HOLD", "#c2410c"],
    ["REWORK", "#b45309"],
    ["NEXT", "#3f668c"],
  ];
  items.forEach(([label, color], index) => {
    const col = 1 + index * 3;
    sheet.mergeCells(3, col, 3, col + 2);
    const cell = sheet.getCell(3, col);
    cell.value = label;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: hexArgb(color) },
    };
  });
  sheet.getRow(3).height = 18;
}

export function writeWorkflowMap(sheet: Worksheet, file: WorkflowFile) {
  sheet.views = [
    { state: "frozen", ySplit: 4, showGridLines: false, zoomScale: 85 },
  ];
  sheet.properties.tabColor = { argb: "FF2563A9" };

  const meta = file.graph.metadata;
  sheet.mergeCells(1, 1, 1, 18);
  const title = sheet.getCell(1, 1);
  title.value = `${meta.name}  ·  ${meta.version}  ·  ${meta.status}`;
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF0F172A" } };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, 18);
  const hint = sheet.getCell(2, 1);
  hint.value =
    "Canvas replica · left → right. Each Phase is a container; every Gate is drawn inside its Phase. Connections show APPROVE / REJECT / HOLD / REWORK. Layout.parentId restores Phase membership on import.";
  hint.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF64748B" } };
  sheet.getRow(2).height = 20;
  writeLegend(sheet);

  const projectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  const blocks = flowBlocks(file);
  const lineCounts = blocks.flatMap((block) =>
    block.kind === "phase"
      ? (block.children.length ? block.children : [block.phase]).map(
          (node) =>
            cardLines(
              node,
              file,
              projectStart,
              block.kind === "phase" ? block.phase.title : undefined,
            ).length,
        )
      : [cardLines(block.node, file, projectStart).length],
  );
  const cardHeight = Math.max(12, ...lineCounts, 1);
  let col = 2;
  let maxRow = CANVAS_ROW;
  const placed: { block: FlowBlock; col: number; width: number }[] = [];

  for (const block of blocks) {
    if (block.kind === "phase") {
      const size = writePhase(
        sheet,
        CANVAS_ROW,
        col,
        block.phase,
        block.children,
        cardHeight,
        file,
        projectStart,
      );
      placed.push({ block, col, width: size.width });
      maxRow = Math.max(maxRow, CANVAS_ROW + size.height);
      col += size.width + ARROW_COLS;
    } else {
      const size = writeStandalone(
        sheet,
        CANVAS_ROW,
        col,
        block.node,
        cardHeight,
        file,
        projectStart,
      );
      placed.push({ block, col, width: size.width });
      maxRow = Math.max(maxRow, CANVAS_ROW + size.height);
      col += size.width + ARROW_COLS;
    }
  }

  placed.forEach((item, index) => {
    const next = placed[index + 1];
    if (!next) return;
    const source = rightmostId(item.block);
    const target = leftmostId(next.block);
    writeArrow(
      sheet,
      CANVAS_ROW + 3,
      item.col + item.width,
      cardHeight,
      edgeBetween(file, source, target) ||
        outgoing(file, source).find((edge) =>
          next.block.kind === "phase"
            ? next.block.children.some((node) => node.id === edge.target)
            : edge.target === target,
        ),
    );
  });

  const nested = new Set(
    blocks.flatMap((block) =>
      block.kind === "phase"
        ? [block.phase.id, ...block.children.map((node) => node.id)]
        : [block.node.id],
    ),
  );
  const references = file.graph.nodes.filter(
    (node) => isReferenceNodeType(node.type) && !nested.has(node.id),
  );
  if (references.length) {
    const row = maxRow + 2;
    sheet.mergeCells(row, 2, row, 10);
    const heading = sheet.getCell(row, 2);
    heading.value = "Reference cards (below the main canvas)";
    heading.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FF334155" } };
    let refCol = 2;
    references.forEach((node) => {
      const height = cardLines(node, file, projectStart).length;
      writeCard(sheet, row + 2, refCol, height, node, file, projectStart);
      refCol += GATE_COLS + 1;
    });
    col = Math.max(col, refCol);
  }

  for (let column = 1; column <= Math.max(col + 2, 24); column += 1) {
    sheet.getColumn(column).width = 12;
  }
}
