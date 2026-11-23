import type { DomainNode } from "@/types/workflow";
import { qualificationOf } from "@/lib/qualification";

/** Fields from PROFAB Preliminary Estimation [1.06]. Monetary values are CAD before tax. */
export type PreliminaryEstimation = {
  basePrice: number;
  optionsAndCredits: number;
  moduleBudget: number;
  totalProjectBudget: number;
  preparedBy: string;
  reviewed: boolean;
};

export function preliminaryEstimationOf(node: DomainNode): PreliminaryEstimation {
  const fields = node.customFields;
  const amount = (key: string) => {
    const value = Number(fields[key]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const options = Number(fields.estimationOptionsAndCredits);
  return {
    basePrice: amount("estimationBasePrice"),
    optionsAndCredits: Number.isFinite(options) ? options : 0,
    moduleBudget: amount("estimationModuleBudget"),
    totalProjectBudget: amount("estimationTotalProjectBudget"),
    preparedBy: String(fields.estimationPreparedBy || "").trim(),
    reviewed: fields.estimationReviewed === true,
  };
}

export function estimateSummary(node: DomainNode, qualification?: DomainNode) {
  const estimate = preliminaryEstimationOf(node);
  const source = qualification ? qualificationOf(qualification).form101?.sectionA : undefined;
  const area = Number(source?.grossAreaSqFt);
  const total = estimate.basePrice + estimate.optionsAndCredits;
  return {
    ...estimate,
    total,
    perSqFt: area > 0 ? total / area : undefined,
    projectName: source?.projectName || "",
    projectAddress: source?.projectAddress || "",
    grossAreaSqFt: area > 0 ? area : undefined,
    client: source?.parties?.client?.company || "",
    budgetFits: estimate.moduleBudget > 0 ? total <= estimate.moduleBudget : undefined,
  };
}

export function preliminaryEstimationReady(node: DomainNode) {
  const estimate = estimateSummary(node);
  return (
    estimate.reviewed &&
    estimate.basePrice > 0 &&
    estimate.preparedBy.length > 0 &&
    estimate.budgetFits !== false
  );
}
