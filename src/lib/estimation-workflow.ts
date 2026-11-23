import { createDomainNode } from "@/lib/create-domain-node";
import type { WorkflowFile } from "@/types/workflow";

/** Insert [1.06] between Qualification and its normal downstream route. Idempotent for saved projects. */
export function ensureEstimationWorkflow(input: WorkflowFile, estimationId?: string): WorkflowFile {
  const qualification = input.graph.nodes.find((node) => node.type === "qualification");
  if (!qualification) return input;
  const existing = input.graph.nodes.find((node) => node.type === "estimation");
  const id = estimationId ?? existing?.id ?? "estimation-1-06";
  const file = structuredClone(input);
  if (!existing) file.graph.nodes.push(createDomainNode("estimation", id));
  const qLayout = file.layout.nodes[qualification.id];
  if (!file.layout.nodes[id]) {
    const start = file.graph.nodes.find((node) => node.type === "projectStart");
    const startLayout = start ? file.layout.nodes[start.id] : undefined;
    const absoluteX = (nodeId: string) => {
      let x = 0;
      let current: (typeof file.layout.nodes)[string] | undefined = file.layout.nodes[nodeId];
      const seen = new Set<string>();
      while (current && !seen.has(current.nodeId)) {
        seen.add(current.nodeId);
        x += current.x;
        current = current.parentId ? file.layout.nodes[current.parentId] : undefined;
      }
      return x;
    };
    const width = qLayout?.width ?? 1180;
    // Preserve the existing qualification-to-start spacing by moving only
    // the qualification card left; the new card takes its former position.
    const desiredX = (qLayout?.x ?? 0) + width + 160;
    const startX = start && startLayout ? absoluteX(start.id) : undefined;
    const estimatorX =
      startX !== undefined && desiredX + 520 + 120 > startX ? startX - 520 - 120 : desiredX;
    if (qLayout && estimatorX < desiredX) qLayout.x -= desiredX - estimatorX;
    file.layout.nodes[id] = {
      nodeId: id,
      x: estimatorX,
      y: qLayout?.y ?? 80,
      width: 520,
      height: 560,
      zIndex: 1,
    };
  }
  const direct = file.graph.edges.filter(
    (edge) =>
      edge.source === qualification.id &&
      edge.target !== id &&
      !["failure", "rework", "reopen", "hold"].includes(edge.type),
  );
  file.graph.edges = file.graph.edges.map((edge) =>
    direct.includes(edge) ? { ...edge, source: id, sourceHandle: "out" } : edge,
  );
  const start = file.graph.nodes.find((node) => node.type === "projectStart");
  if (!direct.length && start && !file.graph.edges.some((edge) => edge.source === id)) {
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
  // Each route has its own output and matching Estimation input. Replace the
  // older single edge as well as incomplete route sets in saved workflows.
  file.graph.edges = file.graph.edges.filter(
    (edge) => !(edge.source === qualification.id && edge.target === id),
  );
  for (const route of ["CSA", "PCS", "LOI"] as const) {
    file.graph.edges.push({
      id: `edge-${qualification.id}-${id}-${route.toLowerCase()}`,
      source: qualification.id,
      target: id,
      sourceHandle: route,
      targetHandle: route,
      type: "normal",
      label: route,
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    });
  }
  // Keep the L1 view in sync when Qualification already has a linked L1 card.
  const highLevel = file.highLevel;
  if (highLevel) {
    // Older releases inserted Estimation as a separate L1 Phase. Fold that
    // legacy card back into the same L1 process step as Qualification.
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
          edges.push({
            id: edgeId,
            source: before.source,
            target: after.target,
          });
        }
      }
      highLevel.graph.edges = edges;
      highLevel.graph.nodes = highLevel.graph.nodes.filter((node) => node.id !== legacyId);
      const { [legacyId]: _legacyLayout, ...remainingLayouts } = highLevel.layout.nodes;
      void _legacyLayout;
      highLevel.layout.nodes = remainingLayouts;
    }

    const l1Source = highLevel.graph.nodes.find((node) =>
      (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).includes(qualification.id),
    );
    if (l1Source) {
      const linked = (l1Source.linkedLayer2NodeIds ?? l1Source.linkedDetailedNodeIds ?? []).filter(
        (linkedId) => linkedId !== id,
      );
      const qualificationIndex = linked.indexOf(qualification.id);
      linked.splice(qualificationIndex + 1, 0, id);
      l1Source.linkedLayer2NodeIds = linked;
      l1Source.linkedDetailedNodeIds = [...linked];
    }
  }
  return file;
}
