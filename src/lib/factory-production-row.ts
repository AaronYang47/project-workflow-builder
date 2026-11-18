import type { Condition } from "@/types/workflow";

/** A Factory Production row that L5 added to L4 (shown red in the PDFs). */
export const isFactoryProductionRow = (condition: Condition) =>
  /^factory-production(-\d+)?$/.test(condition.id ?? "");

/** Red in every PDF: the Factory Production row and its notes. */
export const FACTORY_PRODUCTION_RED = "#dc2626";

/** "FACTORY PRODUCTION · 116 DAYS" for the PDF Phase and Department boxes. */
export const factoryProductionNote = (days?: number) =>
  `Factory Production${days ? ` · ${days} days` : ""}`;
