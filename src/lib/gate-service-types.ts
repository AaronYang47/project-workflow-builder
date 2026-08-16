// Service-type taxonomy used by Gate nodes and the demo project-start flow.
// Single source of truth — the demo seeds a `serviceLegend` node with the
// same items, and GateRules uses them when tagging approval conditions.
export interface GateServiceType {
  id: "paid" | "included" | "free" | "tbd";
  label: string;
  color: string;
  description: string;
}

export const GATE_SERVICE_TYPES: readonly GateServiceType[] = [
  {
    id: "paid",
    label: "Paid Service",
    color: "#7ca86b",
    description: "Additional paid work outside the included contract scope.",
  },
  {
    id: "included",
    label: "Included in Paid Service / Contract",
    color: "#d6a52a",
    description:
      "Work already included in the approved agreement or paid service scope.",
  },
  {
    id: "free",
    label: "Free / No-Charge Service",
    color: "#5a8fc7",
    description:
      "Strategic or approved work provided without a client charge.",
  },
  {
    id: "tbd",
    label: "TBD / Depends on Scope",
    color: "#8a6caf",
    description:
      "Classification must be confirmed after scope and responsibility are clarified.",
  },
] as const;

export const getGateServiceType = (id: string | undefined) =>
  GATE_SERVICE_TYPES.find((type) => type.id === id);

export function parseGateServiceTypeId(
  value: unknown,
): GateServiceType["id"] | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const lower = text.toLowerCase();
  const match = GATE_SERVICE_TYPES.find(
    (item) => item.id === text || item.label.toLowerCase() === lower,
  );
  if (match) return match.id;
  if (lower === "included / tbd") return "tbd";
  return undefined;
}

export function documentServiceTypeId(
  signature: { serviceType?: string },
  fallback?: string,
) {
  return (
    parseGateServiceTypeId(signature.serviceType) ||
    parseGateServiceTypeId(fallback)
  );
}

export function ruleHasPaidService(rule: {
  serviceTypeId?: string;
  signatures?: { serviceType?: string }[];
}) {
  if (rule.serviceTypeId === "paid") return true;
  return (rule.signatures || []).some(
    (signature) => documentServiceTypeId(signature, rule.serviceTypeId) === "paid",
  );
}