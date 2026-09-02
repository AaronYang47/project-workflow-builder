import {
  REFERENCE_NODE_TYPES,
  type DomainNode,
  type ValidationIssue,
  type WorkflowFile,
  type WorkflowNodeType,
} from "@/types/workflow";
import { readPath } from "@/lib/object-path";
import { getProfabForm } from "@/lib/profab-forms";

const requiredFields: Partial<Record<DomainNode["type"], string[]>> = {
  document: ["title"],
  general: ["title", "config.stage"],
  gate: ["config.approvedDepartment", "config.approvedBy"],
  approval: ["title"],
  activity: ["title"],
};

export function validateWorkflow(file: WorkflowFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { nodes, edges, rules } = file.graph;
  const projectStarts = nodes.filter((node) => node.type === "projectStart");
  if (projectStarts.length !== 1)
    issues.push({
      id: "project-start-count",
      severity: "error",
      code: "PROJECT_START_COUNT",
      message:
        projectStarts.length === 0
          ? "The workflow is missing Project Start"
          : "The workflow contains more than one Project Start",
      nodeId: projectStarts[0]?.id,
    });
  for (const projectStart of projectStarts) {
    if (edges.some((edge) => edge.target === projectStart.id))
      issues.push({
        id: `project-start-incoming-${projectStart.id}`,
        severity: "error",
        code: "PROJECT_START_INCOMING",
        message: "Project Start cannot have an incoming connection",
        nodeId: projectStart.id,
      });
    if (
      nodes.length > 1 &&
      !edges.some((edge) => edge.source === projectStart.id)
    )
      issues.push({
        id: `project-start-outgoing-${projectStart.id}`,
        severity: "error",
        code: "PROJECT_START_DISCONNECTED",
        message: "Project Start must connect to the first workflow node",
        nodeId: projectStart.id,
      });
  }
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id))
      issues.push({
        id: `duplicate-${node.id}`,
        severity: "error",
        code: "DUPLICATE_ID",
        message: `Duplicate node ID: ${node.id}`,
        nodeId: node.id,
      });
    ids.add(node.id);
  }
  for (const highLevelNode of file.highLevel?.graph.nodes || []) {
    const linkedLayer2NodeIds = new Set([
      ...(highLevelNode.linkedLayer2NodeIds || []),
      ...(highLevelNode.linkedDetailedNodeIds || []),
    ]);
    for (const linkedId of linkedLayer2NodeIds) {
      if (ids.has(linkedId)) continue;
      issues.push({
        id: `broken-l1-l2-${highLevelNode.id}-${linkedId}`,
        severity: "error",
        code: "BROKEN_L1_L2_REFERENCE",
        message: `L1 “${highLevelNode.title}” references missing L2 node “${linkedId}”`,
      });
    }
  }
  const executionItems = file.execution?.items || [];
  const executionItemIds = new Set(executionItems.map((item) => item.id));
  for (const item of executionItems) {
    if (!ids.has(item.linkedLayer2NodeId)) {
      issues.push({
        id: `broken-l3-l2-${item.id}-${item.linkedLayer2NodeId}`,
        severity: "error",
        code: "BROKEN_L3_L2_REFERENCE",
        message: `${item.catalogId ? "Controlled L3 record" : "L3 item"} “${item.title}” references missing L2 node “${item.linkedLayer2NodeId}”`,
      });
      continue;
    }
    const controlledForm = getProfabForm(item);
    if (
      controlledForm &&
      ids.has(controlledForm.linkedLayer2NodeId) &&
      item.linkedLayer2NodeId !== controlledForm.linkedLayer2NodeId
    ) {
      issues.push({
        id: `noncanonical-controlled-form-${item.id}-${item.linkedLayer2NodeId}`,
        severity: "error",
        code: "NONCANONICAL_CONTROLLED_FORM_LINK",
        message: `Controlled L3 record “${item.title}” must remain linked to canonical L2 node “${controlledForm.linkedLayer2NodeId}”`,
        nodeId: item.linkedLayer2NodeId,
      });
    }
  }
  for (const node of nodes) {
    node.conditions.forEach((condition, index) => {
      const linkedId = condition.linkedExecutionItemId;
      if (!linkedId || executionItemIds.has(linkedId)) return;
      issues.push({
        id: `broken-l2-l3-${node.id}-${condition.id || index}-${linkedId}`,
        severity: "error",
        code: "BROKEN_L2_L3_REFERENCE",
        message: `L2 condition in “${node.title}” references missing L3 item “${linkedId}”`,
        nodeId: node.id,
      });
    });
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id))
      issues.push({
        id: `duplicate-${edge.id}`,
        severity: "error",
        code: "DUPLICATE_ID",
        message: `Duplicate edge ID: ${edge.id}`,
        edgeId: edge.id,
      });
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target))
      issues.push({
        id: `broken-${edge.id}`,
        severity: "error",
        code: "BROKEN_REFERENCE",
        message: `Connection “${edge.label || edge.id}” references a missing node`,
        edgeId: edge.id,
      });
    if (
      edge.condition?.linkedExecutionItemId &&
      !executionItemIds.has(edge.condition.linkedExecutionItemId)
    )
      issues.push({
        id: `broken-l2-l3-edge-${edge.id}-${edge.condition.linkedExecutionItemId}`,
        severity: "error",
        code: "BROKEN_L2_L3_REFERENCE",
        message: `L2 connection “${edge.label || edge.id}” references missing L3 item “${edge.condition.linkedExecutionItemId}”`,
        edgeId: edge.id,
      });
    const source = nodes.find((node) => node.id === edge.source);
    if (
      edge.sourceHandle &&
      source?.config.outcomes &&
      !source.config.outcomes.some((handle) => handle.id === edge.sourceHandle)
    )
      issues.push({
        id: `handle-${edge.id}`,
        severity: "error",
        code: "INVALID_HANDLE",
        message: `Connection uses missing outcome handle “${edge.sourceHandle}”`,
        edgeId: edge.id,
        nodeId: edge.source,
      });
  }
  const exemptTypes = new Set<WorkflowNodeType>([
    "note",
    "document",
    "documentGroup",
    "phase",
    ...REFERENCE_NODE_TYPES,
  ]);
  const startNodes = nodes.filter(
    (node) =>
      !edges.some(
        (edge) =>
          edge.target === node.id &&
          !["rework", "reopen", "failure"].includes(edge.type),
      ) && !exemptTypes.has(node.type),
  );
  const connected = new Set(
    edges.flatMap((edge) => [edge.source, edge.target]),
  );
  nodes
    .filter((node) => !connected.has(node.id) && !exemptTypes.has(node.type))
    .forEach((node) =>
      issues.push({
        id: `orphan-${node.id}`,
        severity: "warning",
        code: "ORPHAN_NODE",
        message: `“${node.title}” is not connected`,
        nodeId: node.id,
      }),
    );
  nodes
    .filter(
      (node) =>
        !["end", "terminal"].includes(node.type) &&
        node.config.stage?.trim().toLowerCase() !== "archive" &&
        !exemptTypes.has(node.type) &&
        !edges.some((edge) => edge.source === node.id),
    )
    .forEach((node) =>
      issues.push({
        id: `outgoing-${node.id}`,
        severity: "warning",
        code: "MISSING_ROUTE",
        message: `“${node.title}” has no outgoing route`,
        nodeId: node.id,
      }),
    );
  const reachable = new Set<string>();
  const queue = startNodes.map((node) => node.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    edges
      .filter((edge) => edge.source === id)
      .forEach((edge) => queue.push(edge.target));
  }
  nodes
    .filter((node) => !reachable.has(node.id) && !exemptTypes.has(node.type))
    .forEach((node) =>
      issues.push({
        id: `unreachable-${node.id}`,
        severity: "warning",
        code: "UNREACHABLE",
        message: `“${node.title}” cannot be reached from a Start node`,
        nodeId: node.id,
      }),
    );
  for (const node of nodes)
    for (const field of requiredFields[node.type] || [])
      if (!readPath(node, field))
        issues.push({
          id: `required-${node.id}-${field}`,
          severity: "error",
          code: "REQUIRED_FIELD",
          message: `“${node.title || node.type}” is missing ${field.split(".").at(-1)}`,
          nodeId: node.id,
        });
  for (const rule of rules.filter(
    (item) => item.enabled && item.kind === "requiredField" && item.field,
  ))
    for (const node of nodes.filter(
      (item) => !rule.nodeType || item.type === rule.nodeType,
    ))
      if (!readPath(node, rule.field!))
        issues.push({
          id: `rule-${rule.id}-${node.id}`,
          severity: rule.severity,
          code: "CUSTOM_RULE",
          message: `${rule.name}: “${node.title}”`,
          nodeId: node.id,
        });
  if (rules.some((rule) => rule.enabled && rule.kind === "disallowCycles")) {
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const hasCycle = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const cycle = edges
        .filter((e) => e.source === id)
        .some((e) => hasCycle(e.target));
      visiting.delete(id);
      visited.add(id);
      return cycle;
    };
    if (nodes.some((node) => hasCycle(node.id)))
      issues.push({
        id: "cycle",
        severity: "warning",
        code: "CYCLE",
        message: "The workflow contains a cycle while cycles are disallowed",
      });
  }
  return issues;
}
