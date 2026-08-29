import type { OpportunityEvaluationResult } from "@/lib/opportunity-evaluation";

export const opportunityRouteLabels: Record<string, string> = {
  CLASS_D: "Class D",
  CONSULTATION_CSA: "Consultation / CSA",
  PCS: "PCS",
  GOVERNED_LOI: "Governed LOI",
  TECHNICAL_REVIEW: "Technical Review",
  HOLD_PREQUALIFICATION: "Hold / Pre-Qualification",
  NO_GO_ARCHIVE: "No-Go / Archive",
};

const routeHandleAliases: Record<string, string[]> = {
  CLASS_D: ["pass-p1-p2", "class-d"],
  CONSULTATION_CSA: ["csa-pcs", "consultation-csa"],
  PCS: ["csa-pcs", "pcs"],
  GOVERNED_LOI: ["path-loi", "governed-loi"],
  TECHNICAL_REVIEW: ["site-feasibility", "technical-review"],
  HOLD_PREQUALIFICATION: ["site-feasibility", "hold-rework", "hold"],
  NO_GO_ARCHIVE: ["nogo-disqualified", "nogo"],
};

const routeUsesHandle = (route: string, handle: string) =>
  (routeHandleAliases[route] || []).includes(handle);

export function opportunityHandleIsActive(
  result: Pick<OpportunityEvaluationResult, "recommendedRoute" | "overallStatus" | "scoreGrade">,
  handle: string,
) {
  if (handle === "pass-p1-p2") return result.recommendedRoute === "CLASS_D" || result.overallStatus === "READY";
  if (handle === "loi-governed") return result.scoreGrade === "Strong" && !["NO-GO", "BLOCKED", "HOLD", "TECHNICAL REVIEW REQUIRED"].includes(result.overallStatus);
  if (handle === "csa-pcs") return routeUsesHandle(result.recommendedRoute, handle);
  if (handle === "site-feasibility") return routeUsesHandle(result.recommendedRoute, handle);
  if (handle === "nogo-disqualified") return result.recommendedRoute === "NO_GO_ARCHIVE";
  if (handle === "path-loi") return result.recommendedRoute === "GOVERNED_LOI";
  return false;
}

