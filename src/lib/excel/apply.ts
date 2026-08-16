import type { Worksheet } from "exceljs";
import { getInspectorSchema } from "@/lib/inspector-schema";
import {
  asBoolean,
  asString,
  isBlank,
  KEY,
  parseKey,
  rawCell,
} from "@/lib/excel-format";
import { COMPUTED_CONDITION_IDS } from "@/lib/workflow-progress";
import { writePath } from "@/lib/object-path";
import {
  extraNodeDocuments,
  parseRequirement,
  parseServiceTypeId,
  resolveSheetNode,
  resolveSheetPhase,
  updateGraphNode,
  withSignatureDocuments,
} from "@/lib/excel/shared";
import type { WorkflowFile } from "@/types/workflow";

export function applyPhaseSheet(
  sheet: Worksheet,
  file: WorkflowFile,
): WorkflowFile {
  let next = file;
  let phaseId = "";
  let gateId = "";
  const lastRow = Math.max(sheet.rowCount, 1);
  for (let row = 1; row <= lastRow; row += 1) {
    const key = parseKey(rawCell(sheet.getCell(row, 1)));
    const kind = key.kind;
    if (kind === KEY.phase) {
      phaseId = key.id;
      const phase = resolveSheetPhase(next, sheet.name, phaseId);
      if (phase) {
        phaseId = phase.id;
        const title = asString(rawCell(sheet.getCell(row, 2)));
        if (title) {
          next = updateGraphNode(next, phase.id, (node) => ({ ...node, title }));
        }
      }
      continue;
    }
    if (kind === KEY.phaseDesc && phaseId) {
      const description = asString(rawCell(sheet.getCell(row, 3)));
      next = updateGraphNode(next, phaseId, (node) => ({ ...node, description }));
      continue;
    }
    if (kind === KEY.gate || kind === KEY.node) {
      gateId = key.id;
      continue;
    }
    if (kind === KEY.gateUuid) {
      continue;
    }
    const node = resolveSheetNode(next, gateId);
    if (!node) continue;
    gateId = node.id;
    const value = rawCell(sheet.getCell(row, 3));
    if (kind === KEY.nodeParent) {
      const parentValue = asString(value).trim();
      const parentId =
        !parentValue || parentValue === "(none)" ? undefined : parentValue;
      const layout = next.layout.nodes[node.id];
      if (layout) {
        const nextLayout = { ...layout };
        if (parentId) nextLayout.parentId = parentId;
        else delete nextLayout.parentId;
        next = {
          ...next,
          layout: {
            ...next.layout,
            nodes: {
              ...next.layout.nodes,
              [node.id]: nextLayout,
            },
          },
        };
      }
      continue;
    }
    if (kind === KEY.field && key.id) {
      const field = getInspectorSchema(node.type).find((item) => item.key === key.id);
      const nextValue =
        field?.type === "boolean" ? Boolean(asBoolean(value) ?? false) : asString(value);
      if (!field?.readOnly) {
        next = updateGraphNode(next, node.id, (item) => writePath(item, key.id, nextValue));
      }
      continue;
    }
    if (kind === KEY.gateTitle && !isBlank(value)) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        title: asString(value),
      }));
    } else if (kind === KEY.gateDescription) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        description: asString(value),
      }));
    } else if (kind === KEY.gateStatus) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, status: asString(value) },
      }));
    } else if (kind === KEY.gateOwner) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, owner: asString(value) },
      }));
    } else if (kind === KEY.gateDepartment) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        metadata: {
          ...item.metadata,
          responsibleDepartment: asString(value),
        },
        config: { ...item.config, approvedDepartment: asString(value) },
      }));
    } else if (kind === KEY.gateApprover) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        config: { ...item.config, approvedBy: asString(value) },
      }));
    } else if (kind === KEY.gateResult) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, approvalResult: asString(value) },
      }));
    } else if (kind === KEY.gateNotes) {
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        customFields: { ...item.customFields, notes: asString(value) },
      }));
    } else if (kind === KEY.condition) {
      const checked = asBoolean(rawCell(sheet.getCell(row, 2)));
      const label = asString(rawCell(sheet.getCell(row, 3)));
      const requirement = parseRequirement(rawCell(sheet.getCell(row, 5)));
      const serviceCell = rawCell(sheet.getCell(row, 6));
      const serviceText = asString(serviceCell).trim();
      const parsedService = parseServiceTypeId(serviceCell);
      const source = key.extra || "rule";
      const computed = COMPUTED_CONDITION_IDS.has(key.id);
      next = updateGraphNode(next, node.id, (item) => {
        if (source === "node") {
          return {
            ...item,
            conditions: item.conditions.map((condition) =>
              (condition.id || condition.label) === key.id
                ? {
                    ...condition,
                    checked: computed
                      ? condition.checked
                      : (checked ?? condition.checked),
                    label,
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
                    label,
                    requirementType: requirement || rule.requirementType,
                    serviceTypeId: serviceText
                      ? parsedService || rule.serviceTypeId
                      : undefined,
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
      const parsedDocumentService = parseServiceTypeId(
        rawCell(sheet.getCell(row, 10)),
      );
      next = updateGraphNode(next, node.id, (item) => {
        const extras = extraNodeDocuments(item);
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
                    abbreviation,
                    fullName,
                    status: isBlank(status) ? signature.status : status,
                    revision,
                    department: isBlank(department)
                      ? signature.department
                      : department,
                    signedBy,
                    owner,
                    serviceType:
                      parsedDocumentService || signature.serviceType,
                  },
            ),
          };
        });
        return withSignatureDocuments(item, gateRules, extras);
      });
    } else if (kind === "#outcome") {
      const label = asString(rawCell(sheet.getCell(row, 3)));
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          outcomes: (item.config.outcomes || []).map((outcome) =>
            outcome.id === key.id
              ? { ...outcome, label: label || outcome.label }
              : outcome,
          ),
        },
      }));
    } else if (kind === "#node.doc") {
      const index = Number(key.extra);
      if (Number.isFinite(index)) {
        const name = asString(rawCell(sheet.getCell(row, 2)));
        next = updateGraphNode(next, node.id, (item) => {
          const extras = extraNodeDocuments(item);
          extras[index] = name;
          return withSignatureDocuments(item, item.config.gateRules || [], extras);
        });
      }
    } else if (kind === "#ref.item") {
      const label = asString(rawCell(sheet.getCell(row, 2)));
      const color = asString(rawCell(sheet.getCell(row, 3)));
      const description = asString(rawCell(sheet.getCell(row, 4)));
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          reference: {
            ...item.config.reference,
            items: (item.config.reference?.items || []).map((entry) =>
              entry.id === key.id
                ? { ...entry, label, color, description }
                : entry,
            ),
          },
        },
      }));
    } else if (kind === "#ref.row") {
      const label = asString(rawCell(sheet.getCell(row, 2)));
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          reference: {
            ...item.config.reference,
            rows: (item.config.reference?.rows || []).map((entry) => {
              if (entry.id !== key.id) return entry;
              const approvals = [...(entry.approvals || [])];
              for (let column = 0; column < approvals.length; column += 1) {
                const checked = asBoolean(rawCell(sheet.getCell(row, 3 + column)));
                if (checked !== undefined) approvals[column] = checked;
              }
              return { ...entry, label: label || entry.label, approvals };
            }),
          },
        },
      }));
    } else if (kind === "#ref.current" || kind === "#ref.proposed" || kind === "#ref.rules") {
      const index = Number(key.id);
      const field = kind.slice(5) as "current" | "proposed" | "rules";
      const line = asString(rawCell(sheet.getCell(row, 2)));
      if (Number.isFinite(index)) {
        next = updateGraphNode(next, node.id, (item) => {
          const list = [...(item.config.reference?.[field] || [])];
          list[index] = line;
          return {
            ...item,
            config: {
              ...item.config,
              reference: { ...item.config.reference, [field]: list },
            },
          };
        });
      }
    } else if (kind === "#ref.section") {
      const line = asString(rawCell(sheet.getCell(row, 2)));
      const [itemMarker, itemIndex] = key.extra.split(":");
      next = updateGraphNode(next, node.id, (item) => ({
        ...item,
        config: {
          ...item.config,
          reference: {
            ...item.config.reference,
            sections: (item.config.reference?.sections || []).map((section) => {
              if (section.id !== key.id) return section;
              if (itemMarker === "item") {
                const items = [...(section.items || [])];
                items[Number(itemIndex)] = line;
                return { ...section, items };
              }
              return { ...section, title: line || section.title };
            }),
          },
        },
      }));
    }
  }
  return next;
}
