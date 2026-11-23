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
    const estimatorX = startX !== undefined && desiredX + 520 + 120 > startX
      ? startX - 520 - 120
      : desiredX;
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
    (edge) => edge.source === qualification.id &&
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
  if (!file.graph.edges.some((edge) => edge.source === qualification.id && edge.target === id)) {
    file.graph.edges.push({
      id: `edge-${qualification.id}-${id}`,
      source: qualification.id,
      target: id,
      sourceHandle: "out",
      targetHandle: "in",
      type: "normal",
      label: "Passed",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    });
  }
  // Keep the L1 view in sync when Qualification already has a linked L1 card.
  const highLevel = file.highLevel;
  const l1Source = highLevel?.graph.nodes.find((node) =>
    (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).includes(qualification.id),
  );
  if (highLevel && l1Source) {
    const l1Id = `high-level-${id}`;
    if (!highLevel.graph.nodes.some((node) => node.id === l1Id)) {
      highLevel.graph.nodes.push({
        id: l1Id,
        type: "phase",
        title: "Estimation",
        description: "S [1.06] Preliminary Estimation",
        code: "1.06",
        backgroundColor: "#0f766e",
        linkedLayer2NodeIds: [id],
      });
      const sourceLayout = highLevel.layout.nodes[l1Source.id];
      highLevel.layout.nodes[l1Id] = {
        nodeId: l1Id,
        x: (sourceLayout?.x ?? 0) + 380,
        y: sourceLayout?.y ?? 0,
      };
      const nextEdges = highLevel.graph.edges.filter((edge) => edge.source === l1Source.id);
      const downstream = new Set<string>();
      const queue = nextEdges.map((edge) => edge.target);
      while (queue.length) {
        const target = queue.shift()!;
        if (downstream.has(target) || target === l1Source.id) continue;
        downstream.add(target);
        queue.push(...highLevel.graph.edges.filter((edge) => edge.source === target).map((edge) => edge.target));
      }
      for (const target of downstream) {
        const layout = highLevel.layout.nodes[target];
        if (layout) layout.x += 380;
      }
      highLevel.graph.edges = highLevel.graph.edges.map((edge) =>
        nextEdges.includes(edge) ? { ...edge, source: l1Id } : edge,
      );
      if (nextEdges.length) highLevel.graph.edges.push({
        id: `high-level-edge-${l1Source.id}-${l1Id}`,
        source: l1Source.id,
        target: l1Id,
      });
    }
  }
  return file;
}
