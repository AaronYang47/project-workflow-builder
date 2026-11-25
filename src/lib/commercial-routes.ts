import type { DomainNode } from "@/types/workflow";

export const COMMERCIAL_ROUTES = ["CSA", "PCS", "LOI"] as const;
export type CommercialRoute = (typeof COMMERCIAL_ROUTES)[number];
export const COMMERCIAL_ROUTE_GROUP_ID = "commercial-route-group";
/** Route Selection: the route chart with the chosen agreement below it. */
export const COMMERCIAL_ROUTE_GROUP_SIZE = { width: 760, height: 820 } as const;

export function isCommercialRouteGroupNode(node: DomainNode) {
  return node.id === COMMERCIAL_ROUTE_GROUP_ID || node.config.commercialRouteGroup === true;
}

export function commercialRouteReady(node: DomainNode, route: CommercialRoute | undefined) {
  if (route === "CSA") {
    const hours = Number(node.customFields.commercialRouteCsaHours);
    return Number.isFinite(hours) && hours > 0;
  }
  if (route === "PCS") {
    const modules = Number(node.customFields.commercialRouteModuleCount);
    const extraHours = Number(node.customFields.commercialRoutePcsExtraHours || 0);
    return (
      Number.isInteger(modules) && modules > 0 && Number.isFinite(extraHours) && extraHours >= 0
    );
  }
  if (route === "LOI") {
    const price = String(node.customFields.commercialRoutePrice ?? "").trim();
    const signed = node.conditions.some(
      (condition) => condition.id === "loi-ceo-signature-required" && condition.checked === true,
    );
    return price.length > 0 && signed;
  }
  return false;
}

export const COMMERCIAL_ROUTE_STYLE: Record<
  CommercialRoute,
  { color: string; label: string; agreement: string; height: number }
> = {
  CSA: { color: "#2563eb", label: "CSA", agreement: "[1.08]", height: 192 },
  PCS: { color: "#d97706", label: "PCS", agreement: "[1.09]", height: 192 },
  LOI: { color: "#7c3aed", label: "LOI", agreement: "[1.07]", height: 208 },
};

export const commercialRouteNodeId = (route: CommercialRoute) =>
  `commercial-route-${route.toLowerCase()}`;

export function commercialRouteForNode(node: DomainNode): CommercialRoute | undefined {
  // Keep canonical agreement cards recognizable if a saved/collaborative patch
  // accidentally overwrites the node type while editing a field.
  const canonical = COMMERCIAL_ROUTES.find((item) => node.id === commercialRouteNodeId(item));
  if (canonical) return canonical;
  if (node.type !== "commercialRule") return undefined;
  const route = node.config.commercialRoute;
  return COMMERCIAL_ROUTES.find((item) => item === route);
}

export function isCommercialRouteColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
