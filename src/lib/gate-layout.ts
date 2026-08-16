import type { DomainNode } from "@/types/workflow";
import { ruleHasPaidService } from "@/lib/gate-service-types";

export const GATE_PANEL_WIDTH = 620;
export const GATE_CARD_WIDTH = GATE_PANEL_WIDTH;
export const GATE_CARD_HEIGHT = 224;
export const GATE_INTERNAL_GAP = 36;
export const GATE_SIDE_WIDTH = GATE_PANEL_WIDTH;
export const GATE_SECTION_GAP = 42;
export const GATE_DECISION_HEIGHT = 272;

export interface GateLayoutMetrics {
  width: number;
  height: number;
  gateCardHeight: number;
  gateLinkY: number;
  conditionsLeft: number;
  conditionsTop: number;
  conditionsHeight: number;
  decisionTop: number;
  decisionHeight: number;
  contentHeight: number;
}
const GATE_CONDITIONS_BASE_HEIGHT = 140;
const GATE_RULE_BASE_HEIGHT = 126;
const GATE_RULE_GAP = 10;
const GATE_SIGNATURE_COLLAPSED_HEIGHT = 72;
const GATE_SIGNATURE_EXPANDED_HEIGHT = 226;
const GATE_SIGNATURE_SERVICE_TYPE_HEIGHT = 40;
const GATE_PAID_CODES_HEIGHT = 64;
const GATE_EMPTY_REVISION_HISTORY_HEIGHT = 98;
const GATE_REVISION_HISTORY_HEADER_HEIGHT = 56;
const GATE_REVISION_ROW_HEIGHT = 108;

const wrappedLines = (value: string | undefined, charactersPerLine: number) =>
  Math.max(1, Math.ceil((value?.length || 0) / charactersPerLine));

export function getGateLayoutMetrics(
  node: Pick<DomainNode, "config" | "title" | "description">,
) {
  const gateTitleLines = wrappedLines(node.title, 64);
  const gateDescriptionLines = wrappedLines(node.description, 84);
  const gateCardHeight = Math.max(
    GATE_CARD_HEIGHT,
    106 + gateTitleLines * 20 + gateDescriptionLines * 16,
  );
  const rules = node.config.gateRules || [];
  const ruleHeight = rules.length
    ? rules.reduce(
        (sum, rule) =>
          sum +
          GATE_RULE_BASE_HEIGHT +
          (ruleHasPaidService(rule) ? GATE_PAID_CODES_HEIGHT : 0) +
          Math.max(0, wrappedLines(rule.label, 64) - 2) * 14,
        0,
      ) +
      Math.max(0, rules.length - 1) * GATE_RULE_GAP
    : GATE_RULE_BASE_HEIGHT;
  const signatureHeight = rules.reduce(
    (sum, rule) =>
      sum +
      (rule.signatures || []).reduce((documentHeight, signature) => {
        if (signature.collapsed)
          return documentHeight + GATE_SIGNATURE_COLLAPSED_HEIGHT;
        const topLines = Math.max(
          wrappedLines(signature.abbreviation, 8),
          wrappedLines(signature.fullName, 34),
        );
        const peopleLines = Math.max(
          wrappedLines(signature.department, 18),
          wrappedLines(signature.signedBy, 18),
          wrappedLines(signature.owner, 18),
        );
        const revisionCount = signature.revisions?.length || 0;
        const revisionHistoryHeight = !signature.revisionControlled
          ? 0
          : revisionCount
            ? GATE_REVISION_HISTORY_HEADER_HEIGHT +
              revisionCount * GATE_REVISION_ROW_HEIGHT
            : GATE_EMPTY_REVISION_HISTORY_HEIGHT;
        return (
          documentHeight +
          GATE_SIGNATURE_EXPANDED_HEIGHT +
          GATE_SIGNATURE_SERVICE_TYPE_HEIGHT +
          revisionHistoryHeight +
          (topLines - 1) * 16 +
          (peopleLines - 1) * 16
        );
      }, 0),
    0,
  );
  const conditionsHeight =
    GATE_CONDITIONS_BASE_HEIGHT + ruleHeight + signatureHeight;
  const outcomeCount = Math.max(2, node.config.outcomes?.length || 0);
  const outcomeExtra = (node.config.outcomes || []).reduce(
    (total, outcome) =>
      total +
      Math.max(
        0,
        wrappedLines(`${outcome.label} ${outcome.rule || ""}`, 56) - 1,
      ) *
        20,
    0,
  );
  const decisionHeight =
    GATE_DECISION_HEIGHT + Math.max(0, outcomeCount - 2) * 44 + outcomeExtra;
  const conditionsTop = gateCardHeight + GATE_INTERNAL_GAP;
  const decisionTop = conditionsTop + conditionsHeight + GATE_SECTION_GAP;
  const contentHeight = decisionTop + decisionHeight;
  const height = Math.max(contentHeight, 720);

  return {
    width: GATE_SIDE_WIDTH,
    height,
    gateCardHeight,
    gateLinkY: gateCardHeight / 2,
    conditionsLeft: 0,
    conditionsTop,
    conditionsHeight,
    decisionTop,
    decisionHeight,
    contentHeight,
  };
}

export function withMeasuredGateHeight(
  metrics: GateLayoutMetrics,
  layoutHeight?: number,
): GateLayoutMetrics {
  if (!layoutHeight) return metrics;
  const measuredConditions =
    layoutHeight -
    metrics.conditionsTop -
    GATE_SECTION_GAP -
    metrics.decisionHeight;
  if (measuredConditions <= metrics.conditionsHeight) return metrics;
  const extra = measuredConditions - metrics.conditionsHeight;
  return {
    ...metrics,
    conditionsHeight: metrics.conditionsHeight + extra,
    decisionTop: metrics.decisionTop + extra,
    contentHeight: metrics.contentHeight + extra,
    height: Math.max(metrics.height, layoutHeight),
  };
}
