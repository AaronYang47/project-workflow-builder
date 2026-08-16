import type { Workbook } from "exceljs";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { writeWorkflowMap } from "@/lib/excel-map";
import {
  APPROVAL_HEADERS,
  CONDITION_HEADERS,
  CONNECTION_HEADERS,
  DOCUMENT_HEADERS,
  EDGE_ROUTE_HEADERS,
  EXCEL_FORMAT,
  EXCEL_MIME,
  LAYOUT_HEADERS,
  NODE_HEADERS,
  OUTCOME_HEADERS,
  RULE_HEADERS,
  SHEETS,
  SIGNATURE_HEADERS,
  asBoolean,
  asJson,
  asNumber,
  asString,
  isBlank,
  joinList,
  readPayloadJson,
  readTable,
  splitList,
  writePayload,
  writeTable,
  type TableRow,
} from "@/lib/excel-format";
import { downloadBlob, parseWorkflowValue, serializeWorkflow } from "@/lib/serialization";
import type {
  Condition,
  DomainEdge,
  DomainNode,
  GateRule,
  GateSignatureRequirement,
  OutcomeHandle,
  ValidationRule,
  WorkflowEdgeType,
  WorkflowFile,
  WorkflowNodeType,
  WorkflowStatus,
} from "@/types/workflow";
import { EDGE_TYPES, NODE_TYPES } from "@/types/workflow";

const EXCEL_STATUSES: WorkflowStatus[] = [
  "Draft",
  "In Review",
  "Approved",
  "Archived",
];

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

function overlay<T>(current: T, next: T | undefined): T {
  return next === undefined ? current : next;
}

function overlayString(current: string, value: unknown): string {
  return isBlank(value) ? current : asString(value);
}

function defaultNode(id: string, type: WorkflowNodeType): DomainNode {
  return {
    id,
    type,
    title: id,
    description: "",
    metadata: {},
    conditions: [],
    documents: [],
    criteria: [],
    customFields: {},
    config: {},
  };
}

function parseNodeType(value: unknown, fallback: WorkflowNodeType): WorkflowNodeType {
  const type = asString(value) as WorkflowNodeType;
  return NODE_TYPES.includes(type) ? type : fallback;
}

function parseEdgeType(value: unknown, fallback: WorkflowEdgeType): WorkflowEdgeType {
  const type = asString(value) as WorkflowEdgeType;
  return EDGE_TYPES.includes(type) ? type : fallback;
}

function writeOverview(workbook: Workbook, file: WorkflowFile) {
  const sheet = workbook.addWorksheet(SHEETS.overview);
  const meta = file.graph.metadata;
  const rows: [string, string | number | boolean][] = [
    ["format", EXCEL_FORMAT],
    ["schemaVersion", file.graph.schemaVersion],
    ["name", meta.name],
    ["version", meta.version],
    ["status", meta.status],
    ["createdAt", meta.createdAt],
    ["updatedAt", meta.updatedAt],
    ["notes", meta.notes],
    ["viewport.x", file.layout.viewport.x],
    ["viewport.y", file.layout.viewport.y],
    ["viewport.zoom", file.layout.viewport.zoom],
    ["snapToGrid", file.layout.snapToGrid],
    ["gridSize", file.layout.gridSize],
    [
      "guide",
      "The Visual Flow sheet mirrors the web canvas left-to-right: each Phase is a container and every Gate is drawn inside its Phase. Edit the data sheets to change values. Layout.parentId is what restores Phase membership on import.",
    ],
  ];
  sheet.columns = [{ width: 22 }, { width: 88 }];
  sheet.addRow(["key", "value"]);
  rows.forEach(([key, value]) => sheet.addRow([key, value]));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function overviewValue(rows: TableRow[], key: string) {
  return rows.find((row) => asString(row.key) === key)?.value;
}

function nodeRow(node: DomainNode, file: WorkflowFile): TableRow {
  const layout = file.layout.nodes[node.id];
  const parent = layout?.parentId
    ? file.graph.nodes.find((item) => item.id === layout.parentId)
    : undefined;
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    description: node.description,
    color: node.color || "",
    icon: node.icon || "",
    parentId: layout?.parentId || "",
    phase: parent?.type === "phase" ? parent.title : "",
    stage: node.config.stage || "",
    projectId: node.customFields.projectId ?? "",
    nodeUuid: node.customFields.nodeUuid ?? "",
    legacyJobNumber: node.customFields.legacyJobNumber ?? "",
    serviceType: node.config.serviceType || "",
    buildingCode: node.config.buildingCode || "",
    moduleCode: node.config.moduleCode || "",
    approvedDepartment: node.config.approvedDepartment || "",
    approvedBy: node.config.approvedBy || "",
    gateLabel: node.config.gateLabel || "",
    decisionMode: node.config.decisionMode || "",
    collapsed: node.config.collapsed ?? "",
    locked: node.config.locked ?? "",
    documents: joinList(node.documents),
    criteria: joinList(node.criteria),
    metadataJson: node.metadata,
    customFieldsJson: node.customFields,
    configJson: node.config,
    nodeJson: node,
  };
}

function writeDataSheets(workbook: Workbook, file: WorkflowFile) {
  writeTable(
    workbook.addWorksheet(SHEETS.nodes),
    NODE_HEADERS,
    file.graph.nodes.map((node) => nodeRow(node, file)),
    [22, 16, 28, 42, 12, 12, 18, 22, 14, 16, 38, 16, 18, 12, 12, 18, 16, 14, 14, 12, 10, 28, 28, 28, 28, 36, 48],
  );

  writeTable(
    workbook.addWorksheet(SHEETS.conditions),
    CONDITION_HEADERS,
    file.graph.nodes.flatMap((node) =>
      node.conditions.map((condition) => ({
        nodeId: node.id,
        id: condition.id || "",
        label: condition.label || "",
        required: condition.required ?? "",
        checked: condition.checked ?? "",
        locked: condition.locked ?? "",
        expression: condition.expression || "",
        description: condition.description || "",
      })),
    ),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.documents),
    DOCUMENT_HEADERS,
    file.graph.nodes.flatMap((node) =>
      node.documents.map((name, order) => ({
        nodeId: node.id,
        order,
        name,
      })),
    ),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.approvals),
    APPROVAL_HEADERS,
    file.graph.nodes.flatMap((node) =>
      (node.config.gateRules || []).map((rule) => ({
        nodeId: node.id,
        id: rule.id,
        label: rule.label,
        checked: rule.checked,
        requirementType: rule.requirementType || "",
        condition: rule.condition || "",
        serviceTypeId: rule.serviceTypeId || "",
        buildingCode: rule.buildingCode || "",
        moduleCode: rule.moduleCode || "",
      })),
    ),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.signatures),
    SIGNATURE_HEADERS,
    file.graph.nodes.flatMap((node) =>
      (node.config.gateRules || []).flatMap((rule) =>
        (rule.signatures || []).map((signature) => ({
          nodeId: node.id,
          ruleId: rule.id,
          id: signature.id,
          abbreviation: signature.abbreviation,
          fullName: signature.fullName,
          department: signature.department,
          signedBy: signature.signedBy,
          checked: signature.checked,
          requirementType: signature.requirementType || "",
          owner: signature.owner || "",
          receivedDate: signature.receivedDate || "",
          revision: signature.revision || "",
          status: signature.status || "",
          serviceType: signature.serviceType || "",
          revisionControlled: signature.revisionControlled ?? "",
          collapsed: signature.collapsed ?? "",
          revisionsJson: signature.revisions ?? "",
        })),
      ),
    ),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.outcomes),
    OUTCOME_HEADERS,
    file.graph.nodes.flatMap((node) =>
      (node.config.outcomes || []).map((outcome) => ({
        nodeId: node.id,
        id: outcome.id,
        label: outcome.label,
        edgeType: outcome.edgeType,
        color: outcome.color || "",
        enabled: outcome.enabled ?? "",
        rule: outcome.rule || "",
      })),
    ),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.connections),
    CONNECTION_HEADERS,
    file.graph.edges.map((edge) => ({
      id: edge.id,
      type: edge.type,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || "",
      targetHandle: edge.targetHandle || "",
      label: edge.label || "",
      lineStyle: edge.lineStyle,
      arrowStyle: edge.arrowStyle,
      conditionJson: edge.condition || "",
      customFieldsJson: edge.customFields,
      edgeJson: edge,
    })),
    [22, 12, 22, 22, 16, 16, 28, 12, 12, 36, 24, 48],
  );

  writeTable(
    workbook.addWorksheet(SHEETS.layout),
    LAYOUT_HEADERS,
    file.graph.nodes.map((node) => {
      const layout = file.layout.nodes[node.id];
      return {
        nodeId: node.id,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        width: layout?.width ?? 240,
        height: layout?.height ?? 132,
        parentId: layout?.parentId || "",
        zIndex: layout?.zIndex ?? "",
      };
    }),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.edgeRoutes),
    EDGE_ROUTE_HEADERS,
    Object.values(file.layout.edges || {}).map((route) => ({
      edgeId: route.edgeId,
      pointsJson: route.points,
    })),
  );

  writeTable(
    workbook.addWorksheet(SHEETS.rules),
    RULE_HEADERS,
    file.graph.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      severity: rule.severity,
      kind: rule.kind,
      nodeType: rule.nodeType || "",
      field: rule.field || "",
    })),
  );
}

function applyOverview(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const rows = readTable(workbook.getWorksheet(SHEETS.overview));
  if (!rows.length) return file;
  const status = asString(overviewValue(rows, "status")) as WorkflowStatus;
  const createdAt = overlayString(
    file.graph.metadata.createdAt,
    overviewValue(rows, "createdAt"),
  );
  return {
    ...file,
    graph: {
      ...file.graph,
      schemaVersion: 1,
      metadata: {
        name: overlayString(file.graph.metadata.name, overviewValue(rows, "name")),
        version: overlayString(
          file.graph.metadata.version,
          overviewValue(rows, "version"),
        ),
        status: EXCEL_STATUSES.includes(status)
          ? status
          : file.graph.metadata.status,
        createdAt,
        updatedAt: overlayString(
          file.graph.metadata.updatedAt,
          overviewValue(rows, "updatedAt"),
        ),
        notes: overlayString(
          file.graph.metadata.notes,
          overviewValue(rows, "notes"),
        ),
      },
    },
    layout: {
      ...file.layout,
      viewport: {
        x: overlay(
          file.layout.viewport.x,
          asNumber(overviewValue(rows, "viewport.x")),
        ),
        y: overlay(
          file.layout.viewport.y,
          asNumber(overviewValue(rows, "viewport.y")),
        ),
        zoom: overlay(
          file.layout.viewport.zoom,
          asNumber(overviewValue(rows, "viewport.zoom")),
        ),
      },
      snapToGrid: overlay(
        file.layout.snapToGrid,
        asBoolean(overviewValue(rows, "snapToGrid")),
      ),
      gridSize: overlay(
        file.layout.gridSize,
        asNumber(overviewValue(rows, "gridSize")),
      ),
    },
  };
}

function applyNodeRow(row: TableRow, fallback?: DomainNode): DomainNode {
  const parsed = asJson<DomainNode>(row.nodeJson);
  const id = overlayString(parsed?.id || fallback?.id || "", row.id);
  const type = parseNodeType(row.type, parsed?.type || fallback?.type || "general");
  const node = {
    ...(fallback || defaultNode(id || "node", type)),
    ...(parsed || {}),
  };
  node.id = id || node.id;
  node.type = type;
  node.title = overlayString(node.title, row.title);
  node.description = overlayString(node.description, row.description);
  if (!isBlank(row.color)) node.color = asString(row.color);
  if (!isBlank(row.icon)) node.icon = asString(row.icon);
  const metadata = asJson<DomainNode["metadata"]>(row.metadataJson);
  if (metadata) node.metadata = metadata;
  const customFields = asJson<DomainNode["customFields"]>(row.customFieldsJson);
  if (customFields) node.customFields = customFields;
  const config = asJson<DomainNode["config"]>(row.configJson);
  if (config) node.config = config;
  node.metadata = node.metadata || {};
  node.customFields = { ...node.customFields };
  node.config = { ...node.config };
  if (!isBlank(row.projectId))
    node.customFields.projectId = asString(row.projectId);
  if (!isBlank(row.nodeUuid)) node.customFields.nodeUuid = asString(row.nodeUuid);
  if (!isBlank(row.legacyJobNumber))
    node.customFields.legacyJobNumber = asString(row.legacyJobNumber);
  if (!isBlank(row.stage)) node.config.stage = asString(row.stage);
  if (!isBlank(row.serviceType))
    node.config.serviceType = asString(row.serviceType);
  if (!isBlank(row.buildingCode))
    node.config.buildingCode = asString(row.buildingCode);
  if (!isBlank(row.moduleCode))
    node.config.moduleCode = asString(row.moduleCode);
  if (!isBlank(row.approvedDepartment))
    node.config.approvedDepartment = asString(row.approvedDepartment);
  if (!isBlank(row.approvedBy))
    node.config.approvedBy = asString(row.approvedBy);
  if (!isBlank(row.gateLabel)) node.config.gateLabel = asString(row.gateLabel);
  if (!isBlank(row.decisionMode))
    node.config.decisionMode = asString(row.decisionMode) as
      | "approval"
      | "binary";
  const collapsed = asBoolean(row.collapsed);
  if (collapsed !== undefined) node.config.collapsed = collapsed;
  const locked = asBoolean(row.locked);
  if (locked !== undefined) node.config.locked = locked;
  const documents = splitList(row.documents);
  if (documents) node.documents = documents;
  const criteria = splitList(row.criteria);
  if (criteria) node.criteria = criteria;
  node.conditions = Array.isArray(node.conditions) ? node.conditions : [];
  node.documents = Array.isArray(node.documents) ? node.documents : [];
  node.criteria = Array.isArray(node.criteria) ? node.criteria : [];
  return node;
}

function applyNodes(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.nodes);
  if (!sheet) return file;
  const rows = readTable(sheet);
  const byId = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const nodes = rows
    .map((row) => {
      const id = overlayString("", row.id);
      if (!id) return undefined;
      return applyNodeRow(row, byId.get(id));
    })
    .filter((node): node is DomainNode => Boolean(node));
  return { ...file, graph: { ...file.graph, nodes } };
}

function applyConditions(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.conditions);
  if (!sheet) return file;
  const grouped = new Map<string, Condition[]>();
  for (const row of readTable(sheet)) {
    const nodeId = asString(row.nodeId);
    if (!nodeId) continue;
    const condition: Condition = {
      id: overlayString("", row.id) || undefined,
      label: overlayString("", row.label) || undefined,
      required: asBoolean(row.required),
      checked: asBoolean(row.checked),
      locked: asBoolean(row.locked),
      expression: overlayString("", row.expression) || undefined,
      description: overlayString("", row.description) || undefined,
    };
    grouped.set(nodeId, [...(grouped.get(nodeId) || []), condition]);
  }
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) => ({
        ...node,
        conditions: grouped.get(node.id) || [],
      })),
    },
  };
}

function applyDocuments(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.documents);
  if (!sheet) return file;
  const grouped = new Map<string, string[]>();
  const rows = readTable(sheet).sort(
    (a, b) => (asNumber(a.order) ?? 0) - (asNumber(b.order) ?? 0),
  );
  for (const row of rows) {
    const nodeId = asString(row.nodeId);
    const name = asString(row.name);
    if (!nodeId || !name) continue;
    grouped.set(nodeId, [...(grouped.get(nodeId) || []), name]);
  }
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) => ({
        ...node,
        documents: grouped.get(node.id) || [],
      })),
    },
  };
}

function overlaySignature(
  row: TableRow,
  existing?: GateSignatureRequirement,
): GateSignatureRequirement {
  const base: GateSignatureRequirement = existing || {
    id: overlayString("signature", row.id),
    abbreviation: "",
    fullName: "",
    department: "",
    signedBy: "",
    checked: false,
  };
  return {
    ...base,
    id: overlayString(base.id, row.id),
    abbreviation: overlayString(base.abbreviation, row.abbreviation),
    fullName: overlayString(base.fullName, row.fullName),
    department: overlayString(base.department, row.department),
    signedBy: overlayString(base.signedBy, row.signedBy),
    checked: asBoolean(row.checked) ?? base.checked,
    requirementType: isBlank(row.requirementType)
      ? base.requirementType
      : (asString(row.requirementType) as GateSignatureRequirement["requirementType"]),
    owner: isBlank(row.owner) ? base.owner : asString(row.owner),
    receivedDate: isBlank(row.receivedDate) ? base.receivedDate : asString(row.receivedDate),
    revision: isBlank(row.revision) ? base.revision : asString(row.revision),
    status: isBlank(row.status) ? base.status : asString(row.status),
    serviceType: isBlank(row.serviceType) ? base.serviceType : asString(row.serviceType),
    revisionControlled:
      asBoolean(row.revisionControlled) ?? base.revisionControlled,
    collapsed: asBoolean(row.collapsed) ?? base.collapsed,
    revisions: asJson(row.revisionsJson) ?? base.revisions,
  };
}

function overlayRule(
  row: TableRow,
  existing: GateRule | undefined,
  signatures: GateSignatureRequirement[],
): GateRule {
  const base: GateRule = existing || {
    id: overlayString("rule", row.id),
    label: "",
    checked: false,
  };
  return {
    ...base,
    id: overlayString(base.id, row.id),
    label: overlayString(base.label, row.label),
    checked: asBoolean(row.checked) ?? base.checked,
    requirementType: isBlank(row.requirementType)
      ? base.requirementType
      : (asString(row.requirementType) as GateRule["requirementType"]),
    condition: isBlank(row.condition) ? base.condition : asString(row.condition),
    serviceTypeId: isBlank(row.serviceTypeId)
      ? base.serviceTypeId
      : asString(row.serviceTypeId),
    buildingCode: isBlank(row.buildingCode)
      ? base.buildingCode
      : asString(row.buildingCode),
    moduleCode: isBlank(row.moduleCode) ? base.moduleCode : asString(row.moduleCode),
    signatures,
  };
}

function applyApprovals(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const approvalSheet = workbook.getWorksheet(SHEETS.approvals);
  const signatureSheet = workbook.getWorksheet(SHEETS.signatures);
  if (!approvalSheet) return file;
  const approvalRows = readTable(approvalSheet);
  const signatureRows = readTable(signatureSheet);
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) => {
        const rows = approvalRows.filter((row) => asString(row.nodeId) === node.id);
        if (!rows.length) {
          if (!node.config.gateRules) return node;
          return { ...node, config: { ...node.config, gateRules: [] } };
        }
        const existingRules = node.config.gateRules || [];
        const gateRules = rows.map((row) => {
          const id = overlayString("", row.id);
          const existing = existingRules.find((rule) => rule.id === id);
          const signatures = signatureRows
            .filter(
              (item) =>
                asString(item.nodeId) === node.id && asString(item.ruleId) === id,
            )
            .map((item) => {
              const signatureId = overlayString("", item.id);
              return overlaySignature(
                item,
                existing?.signatures?.find((signature) => signature.id === signatureId),
              );
            });
          return overlayRule(row, existing, signatures);
        });
        return { ...node, config: { ...node.config, gateRules } };
      }),
    },
  };
}

function applyOutcomes(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.outcomes);
  if (!sheet) return file;
  const grouped = new Map<string, OutcomeHandle[]>();
  for (const row of readTable(sheet)) {
    const nodeId = asString(row.nodeId);
    if (!nodeId) continue;
    const outcome: OutcomeHandle = {
      id: overlayString("outcome", row.id),
      label: overlayString("", row.label),
      edgeType: parseEdgeType(row.edgeType, "normal"),
      color: overlayString("", row.color) || undefined,
      enabled: asBoolean(row.enabled),
      rule: overlayString("", row.rule) || undefined,
    };
    grouped.set(nodeId, [...(grouped.get(nodeId) || []), outcome]);
  }
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) =>
        grouped.has(node.id)
          ? {
              ...node,
              config: { ...node.config, outcomes: grouped.get(node.id) },
            }
          : node,
      ),
    },
  };
}

function applyConnections(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.connections);
  if (!sheet) return file;
  const edges = readTable(sheet)
    .map((row) => {
      const parsed = asJson<DomainEdge>(row.edgeJson);
      const id = overlayString(parsed?.id || "", row.id);
      const source = overlayString(parsed?.source || "", row.source);
      const target = overlayString(parsed?.target || "", row.target);
      if (!id || !source || !target) return undefined;
      const edge: DomainEdge = {
        ...(parsed || {
          id,
          source,
          target,
          type: "normal",
          lineStyle: "solid",
          arrowStyle: "arrow",
          customFields: {},
        }),
        id,
        source,
        target,
        type: parseEdgeType(row.type, parsed?.type || "normal"),
        label: overlayString(parsed?.label || "", row.label) || parsed?.label,
        sourceHandle:
          overlayString(parsed?.sourceHandle || "", row.sourceHandle) ||
          parsed?.sourceHandle,
        targetHandle:
          overlayString(parsed?.targetHandle || "", row.targetHandle) ||
          parsed?.targetHandle,
        lineStyle:
          (asString(row.lineStyle) as DomainEdge["lineStyle"]) ||
          parsed?.lineStyle ||
          "solid",
        arrowStyle:
          (asString(row.arrowStyle) as DomainEdge["arrowStyle"]) ||
          parsed?.arrowStyle ||
          "arrow",
        condition: asJson<Condition>(row.conditionJson) ?? parsed?.condition,
        customFields:
          asJson<DomainEdge["customFields"]>(row.customFieldsJson) ??
          parsed?.customFields ??
          {},
      };
      if (!["solid", "dashed", "dotted"].includes(edge.lineStyle))
        edge.lineStyle = "solid";
      if (!["arrow", "closed", "none"].includes(edge.arrowStyle))
        edge.arrowStyle = "arrow";
      return edge;
    })
    .filter((edge): edge is DomainEdge => Boolean(edge));
  return { ...file, graph: { ...file.graph, edges } };
}

function applyLayout(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.layout);
  const nodes = { ...file.layout.nodes };
  if (sheet) {
    for (const row of readTable(sheet)) {
      const nodeId = asString(row.nodeId);
      if (!nodeId) continue;
      const x = asNumber(row.x);
      const y = asNumber(row.y);
      const width = asNumber(row.width);
      const height = asNumber(row.height);
      const zIndex = asNumber(row.zIndex);
      nodes[nodeId] = {
        nodeId,
        x: x ?? nodes[nodeId]?.x ?? 0,
        y: y ?? nodes[nodeId]?.y ?? 0,
        width: width ?? nodes[nodeId]?.width ?? 240,
        height: height ?? nodes[nodeId]?.height ?? 132,
        parentId:
          overlayString(nodes[nodeId]?.parentId || "", row.parentId) ||
          undefined,
        zIndex: zIndex ?? nodes[nodeId]?.zIndex,
      };
    }
  }
  for (const node of file.graph.nodes) {
    if (nodes[node.id]) continue;
    const size = getAdaptiveNodeSize(node);
    nodes[node.id] = {
      nodeId: node.id,
      x: 64,
      y: 64,
      width: size.width,
      height: size.height,
    };
  }
  Object.keys(nodes).forEach((id) => {
    if (!file.graph.nodes.some((node) => node.id === id)) delete nodes[id];
  });
  return { ...file, layout: { ...file.layout, nodes } };
}

function applyEdgeRoutes(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.edgeRoutes);
  if (!sheet) return file;
  const edges: NonNullable<WorkflowFile["layout"]["edges"]> = {};
  for (const row of readTable(sheet)) {
    const edgeId = asString(row.edgeId);
    const points = asJson<NonNullable<WorkflowFile["layout"]["edges"]>[string]["points"]>(
      row.pointsJson,
    );
    if (!edgeId || !points) continue;
    edges[edgeId] = { edgeId, points };
  }
  return { ...file, layout: { ...file.layout, edges } };
}

function applyRules(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const sheet = workbook.getWorksheet(SHEETS.rules);
  if (!sheet) return file;
  const rules = readTable(sheet)
    .map((row) => {
      const id = asString(row.id);
      const name = asString(row.name);
      if (!id || !name) return undefined;
      const rule: ValidationRule = {
        id,
        name,
        enabled: asBoolean(row.enabled) ?? true,
        severity:
          asString(row.severity) === "warning" ||
          asString(row.severity) === "info"
            ? (asString(row.severity) as ValidationRule["severity"])
            : "error",
        kind:
          asString(row.kind) === "disallowCycles" ||
          asString(row.kind) === "requireOutgoing"
            ? (asString(row.kind) as ValidationRule["kind"])
            : "requiredField",
        nodeType: isBlank(row.nodeType)
          ? undefined
          : parseNodeType(row.nodeType, "general"),
        field: overlayString("", row.field) || undefined,
      };
      return rule;
    })
    .filter((rule): rule is ValidationRule => Boolean(rule));
  return { ...file, graph: { ...file.graph, rules } };
}

function applyNodeParents(workbook: Workbook, file: WorkflowFile): WorkflowFile {
  const rows = readTable(workbook.getWorksheet(SHEETS.nodes));
  if (!rows.length) return file;
  const nodes = { ...file.layout.nodes };
  for (const row of rows) {
    const nodeId = asString(row.id);
    const parentId = asString(row.parentId);
    if (!nodeId || isBlank(row.parentId) || nodes[nodeId]?.parentId) continue;
    const current = nodes[nodeId];
    nodes[nodeId] = {
      nodeId,
      x: current?.x ?? 64,
      y: current?.y ?? 64,
      width: current?.width ?? 240,
      height: current?.height ?? 132,
      parentId,
      zIndex: current?.zIndex,
    };
  }
  return { ...file, layout: { ...file.layout, nodes } };
}

export async function workflowToExcelBuffer(
  file: WorkflowFile,
): Promise<ArrayBuffer> {
  const ExcelJS = await exceljs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Project Workflow Builder";
  workbook.created = new Date(file.graph.metadata.createdAt || Date.now());
  workbook.modified = new Date();
  writeWorkflowMap(workbook.addWorksheet(SHEETS.map), file);
  writeOverview(workbook, file);
  writeDataSheets(workbook, file);
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
  file = applyOverview(workbook, file);
  file = applyNodes(workbook, file);
  file = applyConditions(workbook, file);
  file = applyDocuments(workbook, file);
  file = applyApprovals(workbook, file);
  file = applyOutcomes(workbook, file);
  file = applyConnections(workbook, file);
  file = applyLayout(workbook, file);
  file = applyNodeParents(workbook, file);
  file = applyEdgeRoutes(workbook, file);
  file = applyRules(workbook, file);
  return parseWorkflowValue(file);
}

export async function downloadWorkflowExcel(file: WorkflowFile) {
  const buffer = await workflowToExcelBuffer(file);
  const name = `${file.graph.metadata.name.replace(/\W+/g, "-").toLowerCase() || "workflow"}.xlsx`;
  downloadBlob(name, buffer, EXCEL_MIME);
}
