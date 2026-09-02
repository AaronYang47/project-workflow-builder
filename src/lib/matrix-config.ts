import type { ReferenceConfig } from "@/types/workflow";
import { PROFAB_FORMS } from "@/lib/profab-forms";

export type MatrixKind = "approval" | "responsibility";

const approvalColumns = [
  "Sales",
  "Technical",
  "Project Mgmt",
  "Factory / Site",
  "Management",
  "Client / Consultants",
];
const approvalRows: Array<[string, boolean[]]> = PROFAB_FORMS.map((form) => {
  const roles = [...form.approvalRoles, form.responsibleRole].join(" ").toLowerCase();
  return [
    `${form.index} · ${form.code} · ${form.title}`,
    [
      roles.includes("sales"),
      roles.includes("technical") || roles.includes("quality"),
      roles.includes("project") || roles.includes("process"),
      roles.includes("factory") || roles.includes("site") || roles.includes("logistics"),
      roles.includes("management") || roles.includes("legal") || roles.includes("commercial"),
      roles.includes("client") || roles.includes("consultant"),
    ],
  ];
});
approvalRows.push(
  ["G1 · Qualified & commercially engaged", [true, true, true, false, true, false]],
  ["G2 · Project / technical commitment", [false, true, true, false, true, true]],
  ["G3 · Production authorization", [false, true, true, true, true, false]],
  ["G4 · Factory completion / release", [false, true, true, true, true, false]],
  ["G5 · Project completion / warranty start", [false, true, true, true, true, true]],
);

const responsibilityColumns = [
  "GC / Builder",
  "ProFab / Guildcrest",
  "Client / Owner",
  "Consultants",
];
const responsibilityRows = [
  ["Client requirements and decision authority", [false, false, true, true]],
  ["Project definition and success criteria", [true, true, true, true]],
  ["Architectural design basis", [false, true, true, true]],
  ["Structural, MEP, civil, and geotechnical design", [true, true, false, true]],
  ["Modular feasibility and design coordination", [false, true, true, true]],
  ["Cost estimating and estimate assumptions", [true, true, true, true]],
  ["Permits, zoning, and authority approvals", [true, false, true, true]],
  ["Site control, survey, and geotechnical evidence", [true, false, true, true]],
  ["Foundations, servicing, and site readiness", [true, false, true, true]],
  ["Factory production planning and capacity", [false, true, false, false]],
  ["Procurement, selections, and substitutions", [true, true, true, true]],
  ["Factory production and quality control", [false, true, false, true]],
  ["Transport permits, route, and module logistics", [true, true, false, true]],
  ["Crane, lifting, module set, and temporary works", [true, true, false, true]],
  ["Installation, connections, and site interfaces", [true, true, true, true]],
  ["Commissioning, inspection, and handover", [true, true, true, true]],
  ["Deficiencies, incident response, and corrective work", [true, true, true, true]],
  ["Warranty, maintenance, notices, and final close", [true, true, true, false]],
];

export function createDefaultMatrixReference(kind: MatrixKind): ReferenceConfig {
  const source = kind === "approval" ? approvalRows : responsibilityRows;
  const columns = kind === "approval" ? approvalColumns : responsibilityColumns;
  return {
    columns: [...columns],
    rows: source.map(([label, approvals], index) => ({
      id: `${kind}-matrix-row-${index + 1}`,
      label: String(label),
      approvals: [...(approvals as boolean[])],
    })),
  };
}

export function matrixKindForNode(node: {
  type: string;
  config?: Record<string, unknown>;
}): MatrixKind | undefined {
  if (node.config?.matrixKind === "approval" || node.type === "approvalMatrix") {
    return "approval";
  }
  if (
    node.config?.matrixKind === "responsibility" ||
    node.type === "responsibilityLane"
  ) {
    return "responsibility";
  }
  return undefined;
}
