import { QF_ANNEX_1, QF_ANNEX_2 } from "@/lib/qf-pdf-annex";
import {
  ANNEX_1_CATEGORIES,
  ANNEX_2_BY_DISCIPLINE,
  DISCIPLINE_DEFINITIONS,
  type DisciplineKey,
  type OccupancyGroupCode,
  type ProjectDocumentKey,
  type SupplyScopeCode,
  type TargetDateKey,
} from "@/lib/qualification-form-101";

/**
 * Qualification Form [1.01] labels in English and in French (as printed on the
 * form). Only what people read changes with the language; saved values do not.
 */

export type Lang = "en" | "fr";

type Labels = {
  discipline: Record<DisciplineKey, string>;
  disciplineNote: Partial<Record<DisciplineKey, string>>;
  document: Record<ProjectDocumentKey, string>;
  targetDate: Record<TargetDateKey, string>;
  occupancy: Record<OccupancyGroupCode, { title: string; text: string }>;
  supply: Record<SupplyScopeCode, string>;
  /** Saved issue status (English) → what is shown. */
  issueStatus: Record<string, string>;
  yes: string;
  no: string;
};

export const QF_LABELS: Record<Lang, Labels> = {
  en: {
    discipline: {
      civil: "Civil",
      architectural: "Architecture",
      structural: "Structure",
      mechanical: "Mechanical",
      electrical: "Electrical",
      plumbing: "Plumbing",
      fireProtection: "Fire protection",
    },
    disciplineNote: {
      civil: "The position AND orientation of every foundation are required.",
      mechanical:
        "Pay particular attention to equipment installed outside the modules by other parties.",
    },
    document: {
      permit: "Permit",
      archDrawings: "Architectural drawings (with site plan)",
      bylawsZoning: "Municipal bylaws / zoning",
      productSpecs: "Product requirements / specs",
      classEstimate: "Class estimate (CEC)",
      existingRfis: "Existing RFIs",
      priorCorrespondence: "Earlier emails / instructions",
    },
    targetDate: {
      contractSignature: "Contract signature",
      design: "Design",
      consultantApproval: "Consultant approval",
      productSelection: "Product selection",
      factoryProduction: "Factory production",
      delivery: "Delivery",
    },
    occupancy: {
      A: { title: "Assembly", text: "Group A — places where people gather" },
      C: { title: "Residential", text: "Group C — homes, apartments" },
      D: { title: "Business & personal services", text: "Group D — offices, services" },
      E: { title: "Mercantile", text: "Group E — stores, retail" },
    },
    supply: {
      "FI/SI": "PROFAB supplies & installs",
      "F/S": "PROFAB supplies only",
      "FIA/SIO": "Others supply & install",
    },
    issueStatus: {},
    yes: "Yes",
    no: "No",
  },
  fr: {
    discipline: {
      civil: "Génie civil",
      architectural: "Architecture",
      structural: "Structure",
      mechanical: "Mécanique",
      electrical: "Électricité",
      plumbing: "Plomberie",
      fireProtection: "Protection incendie",
    },
    disciplineNote: {
      civil: "La position ET l’orientation de chaque fondation sont requises.",
      mechanical:
        "Porter une attention particulière à l’équipement installé à l’extérieur des modules par d’autres parties.",
    },
    document: {
      permit: "Permis",
      archDrawings: "Dessins d’architecture (avec plan d’implantation)",
      bylawsZoning: "Règlements municipaux / zonage",
      productSpecs: "Exigences / devis des produits",
      classEstimate: "Estimation de classe (CEC)",
      existingRfis: "RFI existantes",
      priorCorrespondence: "Courriels / instructions antérieurs",
    },
    targetDate: {
      contractSignature: "Signature du contrat",
      design: "Conception",
      consultantApproval: "Approbation des consultants",
      productSelection: "Sélection des produits",
      factoryProduction: "Production en usine",
      delivery: "Livraison",
    },
    occupancy: {
      A: { title: "Réunion", text: "Groupe A — lieux de rassemblement" },
      C: { title: "Habitation", text: "Groupe C — maisons, logements" },
      D: {
        title: "Affaires et services personnels",
        text: "Groupe D — bureaux, services",
      },
      E: { title: "Commercial", text: "Groupe E — magasins, commerce de détail" },
    },
    supply: {
      "FI/SI": "PROFAB fournit et installe",
      "F/S": "PROFAB fournit seulement",
      "FIA/SIO": "Fourni et installé par d’autres",
    },
    issueStatus: {
      "Preliminary / Concept": "Préliminaire / concept",
      "Issued for Permit": "Émis pour permis",
      "Issued for Tender": "Émis pour soumission",
      "Issued for Construction": "Émis pour construction",
      "As-Built / Record": "Tel que construit",
    },
    yes: "Oui",
    no: "Non",
  },
};

/** "1.2. Foundation plan: dimensioned…" → "Foundation plan" (French: before " : "). */
export const shortExample = (example: string) =>
  example
    .replace(/^\d+(\.\d+)?\.\s*/, "")
    .split(/\s?[:?]/)[0]
    .split(" — ")[0]
    .split(" (")[0]
    .trim();

/** The form's Annex 2 examples for a discipline, short, in the chosen language. */
export function disciplineExamples(key: DisciplineKey, lang: Lang) {
  if (lang === "en") return ANNEX_2_BY_DISCIPLINE[key].map(shortExample);
  const index = DISCIPLINE_DEFINITIONS.findIndex((item) => item.key === key);
  return (QF_ANNEX_2[index]?.items ?? []).map(([fr]) => shortExample(fr));
}

/** The form's Annex 1 categories, short, in the chosen language. */
export function specialExamples(lang: Lang) {
  return ANNEX_1_CATEGORIES.map((category, index) =>
    lang === "en"
      ? { title: category.category, items: category.items.map(shortExample) }
      : {
          title: QF_ANNEX_1[index]?.title[0] ?? category.category,
          items: (QF_ANNEX_1[index]?.items ?? []).map(([fr]) => shortExample(fr)),
        },
  );
}
