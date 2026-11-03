import type { Condition, DomainNode } from "@/types/workflow";
import { formReferencesForCondition } from "@/lib/form-reference-catalog";

export interface ReleaseConditionForm {
  id: string;
  title: string;
  category: "legal";
  status: "Required" | "Optional" | "Signed" | "Verified" | "Under Review";
  checked: boolean;
  required: boolean;
}

/** An explicit list, including [], overrides the specification after editing. */
export function releaseConditionForms(node: DomainNode, condition?: Condition | null): ReleaseConditionForm[] {
  if (!condition) return [];
  const key = `legalDocuments::release-condition::${condition.id?.trim() || "default"}`;
  const raw = node.customFields?.[key] ??
    (node.conditions[0]?.id === condition.id ? node.customFields?.legalDocuments : undefined);
  if (typeof raw === "string") {
    try {
      const documents = JSON.parse(raw);
      if (Array.isArray(documents)) {
        return documents.filter((doc) =>
          doc && typeof doc.id === "string" && typeof doc.title === "string" &&
          !doc.id.startsWith("legal-") &&
          doc.fileName !== "Master_Services_Agreement_2026.pdf" &&
          doc.fileName !== "NDA_Standard_Mutual_v2.pdf",
        );
      }
    } catch {
      // An invalid legacy list should not hide the specification's forms.
    }
  }
  const line = condition.description?.match(/^Forms\s*\/\s*Documents\s*:\s*(.+)$/im)?.[1];
  // Slash-separated alternatives remain one requirement (LOI / CSA / PCS).
  const catalogTitles = formReferencesForCondition(node, condition)
    .filter((form) => form.category === "legal").map((form) => form.title);
  const titles = [...new Set(catalogTitles.length ? catalogTitles
    : line ? line.split(/[,;]\s*/).map((title) => title.trim()).filter(Boolean) : [])];
  return titles.map((title, index) => ({
    id: `specified-form-${condition.id}-${index + 1}`,
    title,
    category: "legal",
    status: condition.required === false ? "Optional" : "Required",
    checked: condition.checked === true,
    required: condition.required !== false,
  }));
}
