import { createDomainNode } from "@/lib/create-domain-node";
import {
  COMMERCIAL_ROUTES,
  COMMERCIAL_ROUTE_STYLE,
  commercialRouteForNode,
  commercialRouteNodeId,
} from "@/lib/commercial-routes";
import { getNodeDefinition } from "@/lib/node-catalog";
import type { Condition, DomainEdge, DomainNode, NodeLayout, WorkflowFile } from "@/types/workflow";

const BYPASS_EDGE_TYPES = new Set(["failure", "rework", "reopen", "hold"]);
const CEO_SIGNATURE_CONDITION = "loi-ceo-signature-required";

function routeTitle(route: (typeof COMMERCIAL_ROUTES)[number]) {
  if (route === "CSA") return "CSA · Consultation Services";
  if (route === "PCS") return "PCS · Pre-Construction Services";
  return "LOI · Letter of Intent";
}

function routeDescription(route: (typeof COMMERCIAL_ROUTES)[number]) {
  if (route === "CSA") return "Consultation Services Agreement [1.08] · hourly services";
  if (route === "PCS") return "Pre-Construction Services Agreement [1.09] · module-based fee";
  return "Letter of Intent [1.07] · CEO signature required";
}

function routeCondition(node: DomainNode): Condition {
  const existing = node.conditions.find((condition) => condition.id === CEO_SIGNATURE_CONDITION);
  return {
    id: CEO_SIGNATURE_CONDITION,
    label: "LOI signed by the company CEO",
    description: "The company CEO must sign the LOI before this route can proceed to Estimation.",
    required: true,
    checked: existing?.checked === true,
  };
}

function makeRouteNode(route: (typeof COMMERCIAL_ROUTES)[number], previous?: DomainNode) {
  const id = previous?.id ?? commercialRouteNodeId(route);
  const base = previous ?? createDomainNode("commercialRule", id);
  return {
    ...base,
    id,
    type: "commercialRule" as const,
    title: routeTitle(route),
    description: routeDescription(route),
    color: COMMERCIAL_ROUTE_STYLE[route].color,
    conditions:
      route === "LOI"
        ? [
            ...base.conditions.filter((condition) => condition.id !== CEO_SIGNATURE_CONDITION),
            routeCondition(base),
          ]
        : base.conditions,
    customFields: {
      ...base.customFields,
      routeColor: COMMERCIAL_ROUTE_STYLE[route].color,
      commercialRoutePrice: base.customFields.commercialRoutePrice ?? "",
    },
    config: {
      ...base.config,
      commercialRoute: route,
      stage: "Qualification",
      iconKey: route === "LOI" ? "document" : "building",
    },
  } satisfies DomainNode;
}

function makeRouteEdge(
  id: string,
  source: string,
  target: string,
  route: (typeof COMMERCIAL_ROUTES)[number],
  sourceHandle: string,
  targetHandle: string,
): DomainEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: "normal",
    label: route,
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: { routeColor: COMMERCIAL_ROUTE_STYLE[route].color },
  };
}

/** Add the three commercial branches before [1.06]. Safe to run for old and saved workflows. */
export function ensureEstimationWorkflow(input: WorkflowFile, estimationId?: string): WorkflowFile {
  const qualification = input.graph.nodes.find((node) => node.type === "qualification");
  if (!qualification) return input;

  const file = structuredClone(input);
  const currentQualification = file.graph.nodes.find((node) => node.id === qualification.id)!;
  const obsoleteChoiceIds = new Set(
    file.graph.nodes
      .filter(
        (node) =>
          node.id === "commercial-route-choice" || node.config.commercialRouteChoice === true,
      )
      .map((node) => node.id),
  );
  file.graph.nodes = file.graph.nodes.filter((node) => !obsoleteChoiceIds.has(node.id));
  file.graph.edges = file.graph.edges.filter(
    (edge) => !obsoleteChoiceIds.has(edge.source) && !obsoleteChoiceIds.has(edge.target),
  );
  for (const choiceId of obsoleteChoiceIds) delete file.layout.nodes[choiceId];
  const existingEstimation = file.graph.nodes.find((node) => node.type === "estimation");
  const id = estimationId ?? existingEstimation?.id ?? "estimation-1-06";
  const estimation = file.graph.nodes.find((node) => node.id === id);
  if (!estimation) file.graph.nodes.push(createDomainNode("estimation", id));

  const routeNodes = Object.fromEntries(
    COMMERCIAL_ROUTES.map((route) => {
      const previous = file.graph.nodes.find((node) => commercialRouteForNode(node) === route);
      const node = makeRouteNode(route, previous);
      if (previous) {
        file.graph.nodes = file.graph.nodes.map((item) => (item.id === previous.id ? node : item));
      } else {
        file.graph.nodes.push(node);
      }
      return [route, node] as const;
    }),
  );
  const routeIds = new Set(COMMERCIAL_ROUTES.map((route) => routeNodes[route].id));

  const qualificationSize = getNodeDefinition("qualification").defaultSize;
  const estimationSize = getNodeDefinition("estimation").defaultSize;
  const qualificationLayout = (file.layout.nodes[currentQualification.id] ||= {
    nodeId: currentQualification.id,
    x: 0,
    y: 80,
    width: qualificationSize.width,
    height: qualificationSize.height,
  });
  qualificationLayout.width = qualificationSize.width;
  qualificationLayout.height = qualificationSize.height;

  const routeLayoutsMissing = COMMERCIAL_ROUTES.some(
    (route) => !file.layout.nodes[routeNodes[route].id],
  );
  const estimationLayoutMissing = !file.layout.nodes[id];
  const routeXs = COMMERCIAL_ROUTES.map((route) => file.layout.nodes[routeNodes[route].id]?.x);
  const routesNotAligned =
    routeXs.every((x) => x !== undefined) &&
    Math.max(...(routeXs as number[])) - Math.min(...(routeXs as number[])) > 2;
  const shouldPlaceManagedNodes =
    routeLayoutsMissing ||
    estimationLayoutMissing ||
    obsoleteChoiceIds.size > 0 ||
    routesNotAligned;

  const start = file.graph.nodes.find((node) => node.type === "projectStart");
  const startLayout = start ? file.layout.nodes[start.id] : undefined;
  const absoluteX = (nodeId: string) => {
    let x = 0;
    let current: NodeLayout | undefined = file.layout.nodes[nodeId];
    const seen = new Set<string>();
    while (current && !seen.has(current.nodeId)) {
      seen.add(current.nodeId);
      x += current.x;
      current = current.parentId ? file.layout.nodes[current.parentId] : undefined;
    }
    return x;
  };

  if (shouldPlaceManagedNodes) {
    const routeWidth = 320;
    const qualificationX = qualificationLayout.x;
    const routeX = qualificationX + qualificationSize.width + 160;
    let estimationX = routeX + routeWidth + 140;
    const startX = start && startLayout ? absoluteX(start.id) : undefined;
    const shift =
      startX !== undefined && estimationX + estimationSize.width + 120 > startX
        ? estimationX + estimationSize.width + 120 - startX
        : 0;
    qualificationLayout.x -= shift;
    estimationX -= shift;
    const y = qualificationLayout.y;
    const stackTop = Math.max(y, 220);
    for (const [index, route] of COMMERCIAL_ROUTES.entries()) {
      const node = routeNodes[route];
      const size = getNodeDefinition("commercialRule").defaultSize;
      const height = route === "LOI" ? 208 : 192;
      file.layout.nodes[node.id] = {
        nodeId: node.id,
        x: routeX - shift,
        y: stackTop + index * 248,
        width: Math.max(size.width, routeWidth),
        height,
        zIndex: 10,
      };
    }
    file.layout.nodes[id] = {
      nodeId: id,
      x: estimationX,
      y,
      width: estimationSize.width,
      height: estimationSize.height,
      zIndex: 10,
    };
  } else {
    for (const route of COMMERCIAL_ROUTES) {
      const routeLayout = file.layout.nodes[routeNodes[route].id];
      if (routeLayout) {
        routeLayout.width = Math.max(routeLayout.width, 320);
        routeLayout.height = Math.max(routeLayout.height, route === "LOI" ? 208 : 192);
      }
    }
    const layout = file.layout.nodes[id];
    if (layout) {
      layout.width = Math.max(layout.width, estimationSize.width);
      layout.height = estimationSize.height;
    }
  }

  const routeIdsToFilter = routeIds;
  const directDownstream = file.graph.edges.filter(
    (edge) =>
      edge.source === currentQualification.id &&
      edge.target !== id &&
      !routeIdsToFilter.has(edge.target) &&
      !BYPASS_EDGE_TYPES.has(edge.type),
  );
  file.graph.edges = file.graph.edges
    .filter((edge) => {
      if (
        edge.source === currentQualification.id &&
        (edge.target === id || routeIdsToFilter.has(edge.target))
      )
        return false;
      if (routeIdsToFilter.has(edge.source) && edge.target === id) return false;
      return true;
    })
    .map((edge) =>
      directDownstream.includes(edge) ? { ...edge, source: id, sourceHandle: "out" } : edge,
    );

  for (const route of COMMERCIAL_ROUTES) {
    const routeNode = routeNodes[route];
    file.graph.edges.push(
      makeRouteEdge(
        `edge-${currentQualification.id}-${routeNode.id}`,
        currentQualification.id,
        routeNode.id,
        route,
        route,
        "in",
      ),
      makeRouteEdge(`edge-${routeNode.id}-${id}`, routeNode.id, id, route, "out", "in"),
    );
  }

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

  // Keep legacy L1 data usable and remove the earlier fake Estimation phase.
  const highLevel = file.highLevel;
  if (highLevel) {
    for (const step of highLevel.graph.nodes) {
      if (step.linkedLayer2NodeIds)
        step.linkedLayer2NodeIds = step.linkedLayer2NodeIds.filter(
          (id) => !obsoleteChoiceIds.has(id),
        );
      if (step.linkedDetailedNodeIds)
        step.linkedDetailedNodeIds = step.linkedDetailedNodeIds.filter(
          (id) => !obsoleteChoiceIds.has(id),
        );
    }
    const legacyId = `high-level-${id}`;
    const legacy = highLevel.graph.nodes.some((node) => node.id === legacyId);
    if (legacy) {
      const incoming = highLevel.graph.edges.filter((edge) => edge.target === legacyId);
      const outgoing = highLevel.graph.edges.filter((edge) => edge.source === legacyId);
      const edges = highLevel.graph.edges.filter(
        (edge) => edge.source !== legacyId && edge.target !== legacyId,
      );
      const existingPairs = new Set(edges.map((edge) => `${edge.source}\0${edge.target}`));
      const existingIds = new Set(edges.map((edge) => edge.id));
      for (const before of incoming) {
        for (const after of outgoing) {
          const key = `${before.source}\0${after.target}`;
          if (before.source === after.target || existingPairs.has(key)) continue;
          existingPairs.add(key);
          let edgeId = `high-level-edge-${before.id}-without-${legacyId}-${after.id}`;
          let suffix = 2;
          while (existingIds.has(edgeId)) edgeId = `${edgeId}-${suffix++}`;
          existingIds.add(edgeId);
          edges.push({ id: edgeId, source: before.source, target: after.target });
        }
      }
      highLevel.graph.edges = edges;
      highLevel.graph.nodes = highLevel.graph.nodes.filter((node) => node.id !== legacyId);
      const { [legacyId]: _legacyLayout, ...remainingLayouts } = highLevel.layout.nodes;
      void _legacyLayout;
      highLevel.layout.nodes = remainingLayouts;
    }

    const l1Source = highLevel.graph.nodes.find((node) =>
      (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).includes(
        currentQualification.id,
      ),
    );
    if (l1Source) {
      const managedIds = new Set([...routeIds, id]);
      const linked = (l1Source.linkedLayer2NodeIds ?? l1Source.linkedDetailedNodeIds ?? []).filter(
        (linkedId) => !managedIds.has(linkedId),
      );
      const qualificationIndex = linked.indexOf(currentQualification.id);
      linked.splice(
        qualificationIndex + 1,
        0,
        ...COMMERCIAL_ROUTES.map((route) => routeNodes[route].id),
        id,
      );
      l1Source.linkedLayer2NodeIds = linked;
      l1Source.linkedDetailedNodeIds = [...linked];
    }
  }

  return file;
}
