import type { DomainNode } from "@/types/workflow";

export const COMMERCIAL_ROUTES = ["CSA", "PCS", "LOI"] as const;
export type CommercialRoute = (typeof COMMERCIAL_ROUTES)[number];

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
  if (node.type !== "commercialRule") return undefined;
  const route = node.config.commercialRoute;
  return COMMERCIAL_ROUTES.find((item) => item === route);
}

export function isCommercialRouteColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
