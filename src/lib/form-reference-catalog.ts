import type { Condition, DomainNode } from "@/types/workflow";

export type FormReferenceCategory = "legal" | "customer" | "supporting";
export type FormReference = { code: string; title: string; category: FormReferenceCategory };

const titles: Record<string, string> = {
  CQF: "Client Qualification Form", NDA: "NDA", EDAT: "EDAT", PQ: "Preliminary Quotation",
  SDR: "Site Discovery Report", FS: "Feasibility Study", PCS: "PCS", CSA: "CSA", LOI: "LOI",
  PRM: "Preliminary RM Form", SMO: "SMO Form", PMRF: "Photography & Media Release Form",
  SOW: "Scope of Work", CEC: "Cost Estimate Classification", WMA: "Warranty & Maintenance Agreement",
  SA: "Sales Agreement", PSO: "Product Signoff Form", MAI: "Module Assembly Instruction",
  PS: "Project Summary", CO: "Change Order", CD: "Change Directive",
  DDSS: "Delegated Design Service Statement", MPS: "Module Production Schedule",
  MQC: "Module Quality Control", QAI: "Quality Assurance Inspection", MSO: "Module Sign-Off",
  ABDP: "As-Built Documentation Package", TRR: "Transport Readiness Report",
  IRF: "Incident Report Form", IRL: "Incident Response Log", MISS: "Module Installation Support Service",
  NOC: "Notice of Concern", RNOC: "Response to Notice of Concern",
  MSI: "Module Site Inspection Report", MDR: "Module Delivery and Receipt Form",
  MIC: "Module Installation Checklist", WSVR: "Weatherproofing & Seal Verification Report",
  DPLR: "Deficiency & Punch List Report", FIPC: "Final Inspection Project Closeout Report",
  CSHF: "Client Satisfaction & Handover Form", UCV: "Utility Connection Verification",
  MDAR: "Module Damage Assessment Report", SSP: "Site Safety Plan",
};

type Department = "sales" | "technical" | "purchasing" | "production" | "site";
type Rule = { department: Department; condition: RegExp; codes: string[]; category: FormReferenceCategory };
const rules: Rule[] = [
  { department: "sales", condition: /^client qualification/, codes: ["CQF"], category: "customer" },
  { department: "sales", condition: /^nda edat/, codes: ["NDA", "EDAT"], category: "legal" },
  { department: "sales", condition: /^preliminary quotation/, codes: ["PQ"], category: "legal" },
  { department: "sales", condition: /^site discovery report/, codes: ["SDR"], category: "legal" },
  { department: "sales", condition: /^feasibility study/, codes: ["FS"], category: "legal" },
  { department: "sales", condition: /^determine commercial path/, codes: ["PCS", "CSA", "LOI"], category: "legal" },
  { department: "sales", condition: /^preliminary rm/, codes: ["PRM", "SMO"], category: "legal" },
  { department: "sales", condition: /^photography media release/, codes: ["PMRF"], category: "legal" },
  { department: "technical", condition: /^scope of work/, codes: ["SOW"], category: "legal" },
  { department: "technical", condition: /^cost estimate classification/, codes: ["CEC"], category: "legal" },
  { department: "technical", condition: /^warranty maintenance agreement/, codes: ["WMA"], category: "legal" },
  { department: "technical", condition: /^sales agreement/, codes: ["SA"], category: "legal" },
  { department: "technical", condition: /^product signoff form/, codes: ["PSO"], category: "legal" },
  { department: "technical", condition: /^module assembly instruction/, codes: ["MAI"], category: "legal" },
  { department: "technical", condition: /^project summary/, codes: ["PS"], category: "supporting" },
  { department: "technical", condition: /^change order/, codes: ["CO"], category: "supporting" },
  { department: "technical", condition: /^change directive/, codes: ["CD"], category: "supporting" },
  { department: "technical", condition: /^delegated design service statement/, codes: ["DDSS"], category: "supporting" },
  { department: "purchasing", condition: /^change order/, codes: ["CO"], category: "supporting" },
  { department: "purchasing", condition: /^change directive/, codes: ["CD"], category: "supporting" },
  { department: "production", condition: /^module production schedule/, codes: ["MPS"], category: "legal" },
  { department: "production", condition: /^module quality control/, codes: ["MQC", "QAI"], category: "legal" },
  { department: "production", condition: /^module sign off/, codes: ["MSO"], category: "legal" },
  { department: "production", condition: /^as built documentation package/, codes: ["ABDP"], category: "legal" },
  { department: "production", condition: /^transport readiness report/, codes: ["TRR"], category: "legal" },
  { department: "production", condition: /^change order/, codes: ["CO"], category: "supporting" },
  { department: "production", condition: /^change directive/, codes: ["CD"], category: "supporting" },
  { department: "production", condition: /^incident report form/, codes: ["IRF"], category: "supporting" },
  { department: "production", condition: /^incident response log/, codes: ["IRL"], category: "supporting" },
  { department: "production", condition: /^module installation support service/, codes: ["MISS"], category: "supporting" },
  { department: "production", condition: /^notice of concern/, codes: ["NOC"], category: "supporting" },
  { department: "production", condition: /^response to notice of concern/, codes: ["RNOC"], category: "supporting" },
  { department: "site", condition: /^module site inspection report/, codes: ["MSI"], category: "legal" },
  { department: "site", condition: /^module delivery receipt form/, codes: ["MDR"], category: "legal" },
  { department: "site", condition: /^module installation checklist/, codes: ["MIC"], category: "legal" },
  { department: "site", condition: /^weatherproofing seal verification report/, codes: ["WSVR"], category: "legal" },
  { department: "site", condition: /^deficiency punch list report/, codes: ["DPLR"], category: "legal" },
  { department: "site", condition: /^final inspection project closeout report/, codes: ["FIPC"], category: "legal" },
  { department: "site", condition: /^as built documentation package/, codes: ["ABDP"], category: "legal" },
  { department: "site", condition: /^client satisfaction handover form/, codes: ["CSHF"], category: "legal" },
  { department: "site", condition: /^change order/, codes: ["CO"], category: "supporting" },
  { department: "site", condition: /^change directive/, codes: ["CD"], category: "supporting" },
  { department: "site", condition: /^utility connection verification/, codes: ["UCV"], category: "supporting" },
  { department: "site", condition: /^module damage assessment report/, codes: ["MDAR"], category: "supporting" },
  { department: "site", condition: /^incident report form/, codes: ["IRF"], category: "supporting" },
  { department: "site", condition: /^incident response log/, codes: ["IRL"], category: "supporting" },
  { department: "site", condition: /^site safety plan/, codes: ["SSP"], category: "supporting" },
];

const normalize = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim().replace(/\band\b/g, "").replace(/\s+/g, " ").trim();
function departmentOf(node: DomainNode): Department | undefined {
  const value = normalize(String(node.config.stage || node.title));
  if (/\bsales?\b/.test(value)) return "sales";
  if (/\btech(?:nical)?\b/.test(value)) return "technical";
  if (/\bpurchas(?:e|ing)\b/.test(value)) return "purchasing";
  if (/\bproduction\b/.test(value)) return "production";
  if (/\bsite\b|\bafter service\b/.test(value)) return "site";
  return undefined;
}

export function formReferencesForCondition(node: DomainNode, condition: Condition): FormReference[] {
  const department = departmentOf(node);
  if (!department) return [];
  const name = normalize(condition.label || condition.description || "");
  return rules.filter((rule) => rule.department === department && rule.condition.test(name))
    .flatMap((rule) => rule.codes.map((code) => ({ code, title: titles[code], category: rule.category })));
}

export const formReferenceCatalog: FormReference[] = [...new Map(rules.flatMap((rule) =>
  rule.codes.map((code) => [`${rule.category}:${code}`, { code, title: titles[code], category: rule.category }] as const),
)).values()];
