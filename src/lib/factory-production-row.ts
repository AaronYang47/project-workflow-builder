import type { Condition } from "@/types/workflow";

/** A Factory Production row that L5 added to L4 (shown red in the PDFs). */
export const isFactoryProductionRow = (condition: Condition) =>
  /^factory-production(-\d+)?$/.test(condition.id ?? "");

/** Red in every PDF: the Factory Production row and its notes. */
export const FACTORY_PRODUCTION_RED = "#dc2626";

/** "FACTORY PRODUCTION · 116 DAYS" for the PDF Phase and Department boxes. */
export const factoryProductionNote = (days?: number) =>
  `Factory Production${days ? ` · ${days} days` : ""}`;

/** A row whose timing comes from L5: the Factory Production row or a step L5 filled in. Its title is red. */
export const isL5DrivenRow = (condition: Condition) =>
  isFactoryProductionRow(condition) || Boolean(condition.simulated);
