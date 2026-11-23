import { createDomainNode } from "@/lib/create-domain-node";
import {
  COMMERCIAL_ROUTES,
  COMMERCIAL_ROUTE_STYLE,
  COMMERCIAL_ROUTE_GROUP_ID,
  commercialRouteForNode,
  isCommercialRouteGroupNode,
} from "@/lib/commercial-routes";
import { getNodeDefinition } from "@/lib/node-catalog";
import type { Condition, DomainEdge, DomainNode, WorkflowFile } from "@/types/workflow";

const CEO_SIGNATURE_CONDITION = "loi-ceo-signature-required";
const BYPASS_EDGE_TYPES = new Set(["failure", "rework", "reopen", "hold"]);

function ceoCondition(previous?: Condition): Condition {
  return {
    id: CEO_SIGNATURE_CONDITION,
    label: "LOI signed by the company CEO",
    description: "The company CEO must sign the LOI before this route can proceed to Estimation.",
    required: true,
    checked: previous?.checked === true,
  };
}

function routeEdge(
  source: string,
  target: string,
  route: (typeof COMMERCIAL_ROUTES)[number],
): DomainEdge {
  return {
    id: `edge-${source}-${target}-${route.toLowerCase()}`,
    source,
    target,
    sourceHandle: route,
    targetHandle: route,
    type: "normal",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: { routeColor: COMMERCIAL_ROUTE_STYLE[route].color },
  };
}

/** Maintain Qualification → one agreement node → one Estimation node for saved workflows. */
export function ensureEstimationWorkflow(input: WorkflowFile, estimationId?: string): WorkflowFile {
  const qualification = input.graph.nodes.find((node) => node.type === "qualification");
  if (!qualification) return input;
  const file = structuredClone(input);
  const oldNodes = file.graph.nodes.filter(
    (node) =>
      commercialRouteForNode(node) ||
      node.id === "commercial-route-choice" ||
      node.config.commercialRouteChoice === true,
  );
  const oldIds = new Set(oldNodes.map((node) => node.id));
  const oldPcs = oldNodes.find((node) => commercialRouteForNode(node) === "PCS");
  const oldLoi = oldNodes.find((node) => commercialRouteForNode(node) === "LOI");
  const previousGroup = file.graph.nodes.find(isCommercialRouteGroupNode);
  const groupId = previousGroup?.id ?? COMMERCIAL_ROUTE_GROUP_ID;
  const base = previousGroup ?? createDomainNode("commercialRule", groupId);
  const group: DomainNode = {
    ...base,
    id: groupId,
    type: "commercialRule",
    title: "CSA / PCS / LOI",
    description: "Three commercial agreement routes in one node.",
    conditions: [
      ceoCondition(
        base.conditions.find((item) => item.id === CEO_SIGNATURE_CONDITION) ??
          oldLoi?.conditions.find((item) => item.id === CEO_SIGNATURE_CONDITION),
      ),
    ],
    customFields: {
      ...base.customFields,
      commercialRouteModuleCount:
        base.customFields.commercialRouteModuleCount ??
        oldPcs?.customFields.commercialRouteModuleCount ??
        "",
      commercialRoutePrice:
        base.customFields.commercialRoutePrice ?? oldLoi?.customFields.commercialRoutePrice ?? "",
    },
    config: { ...base.config, commercialRouteGroup: true, stage: "Qualification" },
  };
  const previousEstimation = file.graph.nodes.find((node) => node.type === "estimation");
  const id = estimationId ?? previousEstimation?.id ?? "estimation-1-06";
  const estimation =
    file.graph.nodes.find((node) => node.id === id) ?? createDomainNode("estimation", id);
  file.graph.nodes = file.graph.nodes.filter(
    (node) => !oldIds.has(node.id) && node.id !== groupId && node.id !== id,
  );
  file.graph.nodes.push(group, estimation);
  for (const oldId of oldIds) delete file.layout.nodes[oldId];

  const qSize = getNodeDefinition("qualification").defaultSize;
  const eSize = getNodeDefinition("estimation").defaultSize;
  const qLayout = (file.layout.nodes[qualification.id] ||= {
    nodeId: qualification.id,
    x: 0,
    y: 80,
    width: qSize.width,
    height: qSize.height,
  });
  qLayout.width = qSize.width;
  qLayout.height = Math.max(qLayout.height, qSize.height);
  const groupLayout = file.layout.nodes[groupId];
  file.layout.nodes[groupId] =
    !groupLayout || oldIds.size
      ? {
          nodeId: groupId,
          x: qLayout.x + qSize.width + 120,
          y: qLayout.y,
          width: 380,
          height: 650,
          zIndex: 10,
        }
      : { ...groupLayout, parentId: undefined, width: 380, height: 650 };
  const eLayout = file.layout.nodes[id];
  file.layout.nodes[id] =
    !eLayout || oldIds.size
      ? {
          nodeId: id,
          x: file.layout.nodes[groupId].x + 520,
          y: qLayout.y,
          width: eSize.width,
          height: eSize.height,
          zIndex: 10,
        }
      : {
          ...eLayout,
          parentId: undefined,
          width: Math.max(eLayout.width, eSize.width),
          height: eSize.height,
        };

  const managed = new Set([...oldIds, groupId, id]);
  const directDownstream = file.graph.edges.filter(
    (edge) =>
      edge.source === qualification.id &&
      !managed.has(edge.target) &&
      !BYPASS_EDGE_TYPES.has(edge.type),
  );
  file.graph.edges = file.graph.edges
    .filter(
      (edge) =>
        !oldIds.has(edge.source) &&
        !oldIds.has(edge.target) &&
        !(edge.source === qualification.id && managed.has(edge.target)) &&
        !(edge.source === groupId && edge.target === id),
    )
    .map((edge) =>
      directDownstream.some((item) => item.id === edge.id)
        ? { ...edge, source: id, sourceHandle: "out" }
        : edge,
    );
  for (const route of COMMERCIAL_ROUTES)
    file.graph.edges.push(routeEdge(qualification.id, groupId, route));
  for (const route of COMMERCIAL_ROUTES)
    file.graph.edges.push({ ...routeEdge(groupId, id, route), targetHandle: "in" });
  const start = file.graph.nodes.find((node) => node.type === "projectStart");
  if (
    !directDownstream.length &&
    start &&
    !file.graph.edges.some((edge) => edge.source === id && edge.target === start.id)
  ) {
    file.graph.edges.push({
      id: `edge-${id}-${start.id}`,
      source: id,
      target: start.id,
      sourceHandle: "out",
      targetHandle: "in",
      type: "normal",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    });
  }

  // Estimation and its agreement are L2 cards, never L1 phase frames.
  if (file.highLevel) {
    const unlink = new Set([...oldIds, groupId, id]);
    for (const step of file.highLevel.graph.nodes) {
      if (step.linkedLayer2NodeIds)
        step.linkedLayer2NodeIds = step.linkedLayer2NodeIds.filter((nodeId) => !unlink.has(nodeId));
      if (step.linkedDetailedNodeIds)
        step.linkedDetailedNodeIds = step.linkedDetailedNodeIds.filter(
          (nodeId) => !unlink.has(nodeId),
        );
    }
    const legacyId = `high-level-${id}`;
    const incoming = file.highLevel.graph.edges.filter((edge) => edge.target === legacyId);
    const outgoing = file.highLevel.graph.edges.filter((edge) => edge.source === legacyId);
    file.highLevel.graph.edges = file.highLevel.graph.edges.filter(
      (edge) => edge.source !== legacyId && edge.target !== legacyId,
    );
    for (const before of incoming)
      for (const after of outgoing) {
        if (
          before.source !== after.target &&
          !file.highLevel.graph.edges.some(
            (edge) => edge.source === before.source && edge.target === after.target,
          )
        ) {
          file.highLevel.graph.edges.push({
            id: `high-level-edge-${before.source}-${after.target}`,
            source: before.source,
            target: after.target,
          });
        }
      }
    file.highLevel.graph.nodes = file.highLevel.graph.nodes.filter((node) => node.id !== legacyId);
    delete file.highLevel.layout.nodes[legacyId];
  }
  return file;
}
