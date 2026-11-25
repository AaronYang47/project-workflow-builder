import { createDomainNode } from "@/lib/create-domain-node";
import {
  COMMERCIAL_ROUTE_GROUP_ID,
  COMMERCIAL_ROUTE_GROUP_SIZE,
  commercialRouteForNode,
  isCommercialRouteGroupNode,
} from "@/lib/commercial-routes";
import { getNodeDefinition } from "@/lib/node-catalog";
import type { Condition, DomainNode, WorkflowFile } from "@/types/workflow";

const CEO_SIGNATURE_CONDITION = "loi-ceo-signature-required";
const DEFAULT_GROUP_TITLE = "CSA / PCS / LOI";
/** Titles the app itself gave this node before; replaced by the default. */
const LEGACY_GROUP_TITLES = new Set(["", "Route Selection"]);
const LEGACY_GROUP_DESCRIPTIONS = new Set([
  "Three commercial agreement routes in one node.",
  "Choose and complete the applicable commercial agreement.",
]);
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

/**
 * Resizes a card where it stands: cards to its right in the same row move by
 * the change in width, and a frame around it widens or narrows with it and
 * grows taller if the card no longer fits. Nothing ends up underneath it.
 */
function resizeInPlace(file: WorkflowFile, nodeId: string, width: number, height: number) {
  const layout = file.layout.nodes[nodeId];
  if (!layout) return;
  const grow = width - layout.width;
  const oldRight = layout.x + layout.width;
  const rowBottom = layout.y + Math.max(layout.height, height);
  for (const other of Object.values(file.layout.nodes)) {
    if (other.nodeId === nodeId || other.parentId) continue;
    const frame =
      other.x < layout.x &&
      other.x + other.width >= oldRight - 1 &&
      other.y <= layout.y &&
      other.y + other.height >= layout.y;
    if (frame) {
      other.width += grow;
      const short = layout.y + height + 32 - (other.y + other.height);
      if (short > 0) other.height += short;
    } else if (
      grow &&
      other.x >= oldRight - 1 &&
      other.y < rowBottom &&
      other.y + other.height > layout.y
    )
      other.x += grow;
  }
  layout.width = width;
  layout.height = height;
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
    // The heading under "Route Selection" is the node's own, editable title.
    title:
      previousGroup && !LEGACY_GROUP_TITLES.has(previousGroup.title.trim())
        ? previousGroup.title
        : DEFAULT_GROUP_TITLE,
    description:
      previousGroup?.description && !LEGACY_GROUP_DESCRIPTIONS.has(previousGroup.description)
        ? previousGroup.description
        : "Choose the customer's route and fill in its CSA, PCS or LOI agreement.",
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
  // Qualification holds Form [1.01] only; Route Selection follows it.
  resizeInPlace(file, qualification.id, qSize.width, Math.max(qLayout.height, qSize.height));
  const groupLayout = file.layout.nodes[groupId];
  const { width: groupWidth, height: groupHeight } = COMMERCIAL_ROUTE_GROUP_SIZE;
  if (groupLayout && !oldIds.size) resizeInPlace(file, groupId, groupWidth, groupHeight);
  file.layout.nodes[groupId] =
    !groupLayout || oldIds.size
      ? {
          nodeId: groupId,
          x: qLayout.x + qSize.width + 120,
          y: qLayout.y,
          width: groupWidth,
          height: groupHeight,
          zIndex: 10,
        }
      : { ...groupLayout, parentId: undefined, width: groupWidth, height: groupHeight };
  const eLayout = file.layout.nodes[id];
  file.layout.nodes[id] =
    !eLayout || oldIds.size
      ? {
          nodeId: id,
          x: file.layout.nodes[groupId].x + groupWidth + 140,
          y: qLayout.y,
          width: eSize.width,
          height: eSize.height,
          zIndex: 10,
        }
      : {
          ...eLayout,
          parentId: undefined,
          width: eSize.width,
          height: eSize.height,
        };

  // Route Selection and Estimation were just added after Qualification: move
  // the cards that already follow it over, so the new pair has room.
  if (!groupLayout && !oldIds.size) {
    const qRight = qLayout.x + qLayout.width;
    const added = [file.layout.nodes[groupId], file.layout.nodes[id]];
    const addedRight = Math.max(...added.map((layout) => layout.x + layout.width)) + 120;
    const addedBottom = Math.max(...added.map((layout) => layout.y + layout.height));
    const followers = Object.values(file.layout.nodes).filter(
      (layout) =>
        !layout.parentId &&
        layout.nodeId !== groupId &&
        layout.nodeId !== id &&
        layout.x >= qRight - 1 &&
        layout.y < addedBottom &&
        layout.y + layout.height > qLayout.y,
    );
    const shift = followers.length
      ? Math.max(0, addedRight - Math.min(...followers.map((layout) => layout.x)))
      : 0;
    if (shift)
      for (const layout of Object.values(file.layout.nodes)) {
        if (layout.parentId || layout.nodeId === groupId || layout.nodeId === id) continue;
        if (followers.includes(layout)) layout.x += shift;
        else if (
          layout.x < qLayout.x &&
          layout.x + layout.width >= qRight - 1 &&
          layout.y <= qLayout.y &&
          layout.y + layout.height >= qLayout.y
        )
          layout.width += shift;
      }
  }
  // The standard lines (Qualification → Route Selection → Estimation → first
  // Department) are only laid when this structure is first built. Afterwards
  // they belong to the user: a card added in between or a rewired line is kept.
  const building = !previousGroup || !previousEstimation || oldIds.size > 0;
  if (!building) {
    // Older saves drew one line per route out of Route Selection: one line now.
    const routeLines = file.graph.edges.filter(
      (edge) => edge.source === groupId && ["CSA", "PCS", "LOI"].includes(edge.sourceHandle ?? ""),
    );
    if (routeLines.length) {
      const [first] = routeLines;
      file.graph.edges = file.graph.edges.filter((edge) => !routeLines.includes(edge));
      file.graph.edges.push({
        ...first,
        id: `edge-${groupId}-${first.target}`,
        sourceHandle: "out",
        targetHandle: "in",
        customFields: {},
      });
    }
  } else {
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
    // One link in: Qualification's chosen route continues inside CSA / PCS / LOI.
    file.graph.edges.push({
      id: `edge-${qualification.id}-${groupId}`,
      source: qualification.id,
      target: groupId,
      sourceHandle: "out",
      targetHandle: "in",
      type: "normal",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    });
    // One link out: PCS and LOI join inside the node and carry on to Estimation.
    file.graph.edges.push({
      id: `edge-${groupId}-${id}`,
      source: groupId,
      target: id,
      sourceHandle: "out",
      targetHandle: "in",
      type: "normal",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    });
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
