import { releaseConditionForms } from "@/lib/release-condition-forms";
import { ganttDurationText } from "@/lib/gantt-bar-label";
import { formReferencesForCondition } from "@/lib/form-reference-catalog";
import type { Condition, DomainNode } from "@/types/workflow";

function titlesFromStoredDocuments(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const documents: unknown = JSON.parse(raw);
    if (!Array.isArray(documents)) return [];
    return documents.flatMap((document) => {
      if (!document || typeof document !== "object") return [];
      const record = document as { id?: unknown; title?: unknown; fileName?: unknown };
      if (typeof record.id === "string" && record.id.startsWith("supp-")) return [];
      if (record.fileName === "Site_Foundation_Survey_Plan.pdf" || record.fileName === "Class_CD_Cost_Estimate_Model.xlsx") return [];
      const title = typeof record.title === "string" ? record.title.trim() : "";
      return title ? [title] : [];
    });
  } catch {
    return [];
  }
}

function supportingDocumentsForCondition(node: DomainNode, condition: Condition) {
  const key = `supportingDocuments::release-condition::${condition.id?.trim() || "default"}`;
  const raw = node.customFields?.[key] ??
    (node.conditions[0]?.id === condition.id ? node.customFields?.supportingDocuments : undefined);
  return typeof raw === "string" ? titlesFromStoredDocuments(raw)
    : formReferencesForCondition(node, condition).filter((form) => form.category === "supporting").map((form) => form.title);
}

function customerDocumentsForCondition(node: DomainNode, condition: Condition) {
  const key = `customerDocuments::release-condition::${condition.id?.trim() || "default"}`;
  const raw = node.customFields?.[key] ??
    (node.conditions[0]?.id === condition.id ? node.customFields?.customerDocuments : undefined);
  if (typeof raw !== "string") return formReferencesForCondition(node, condition)
    .filter((form) => form.category === "customer").map((form) => form.title);
  try {
    const documents: unknown = JSON.parse(raw);
    if (!Array.isArray(documents)) return [];
    return documents.flatMap((document) => {
      if (!document || typeof document !== "object") return [];
      const item = document as { id?: unknown; title?: unknown; code?: unknown; fileName?: unknown };
      if (typeof item.id === "string" && item.id.startsWith("cust-")) return [];
      if (["Customer_Project_Spec_2026.pdf", "Client_Signatory_Authorization.pdf"].includes(String(item.fileName || ""))) return [];
      const title = typeof item.title === "string" ? item.title.trim() : "";
      if (!title) return [];
      const code = typeof item.code === "string" ? item.code.trim() : "";
      return [title === "Form" && code ? `${title} · ${code}` : title];
    });
  } catch {
    return [];
  }
}

/** L3 documents assigned to the linked release conditions of these chapters. */
export function departmentDocumentSummary(nodes: DomainNode[]) {
  const legal = new Set<string>();
  const customer = new Set<string>();
  const supporting = new Set<string>();
  const optional: { title: string; duration: string }[] = [];
  for (const node of new Map(nodes.map((item) => [item.id, item])).values()) {
    for (const condition of node.conditions) {
      releaseConditionForms(node, condition).forEach((form) => legal.add(form.title.trim()));
      customerDocumentsForCondition(node, condition).forEach((title) => customer.add(title));
      supportingDocumentsForCondition(node, condition).forEach((title) => supporting.add(title));
    }
    for (const condition of node.optionalConditions ?? []) {
      supportingDocumentsForCondition(node, condition).forEach((title) => supporting.add(title));
      optional.push({
        title: condition.label?.trim() || condition.description?.trim() || "Optional condition",
        duration: ganttDurationText(condition) || "Duration not set",
      });
    }
  }
  return { legal: [...legal].filter(Boolean), customer: [...customer].filter(Boolean), supporting: [...supporting], optional };
}
