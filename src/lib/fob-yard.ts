import { fobYardSkip } from "@/lib/high-level-workflow";
import type { DomainEdge, WorkflowFile } from "@/types/workflow";

/**
 * Everything FOB yard skips: the L1 Phases connected straight into a Final
 * Close that has FOB yard on, the L2 nodes linked to them, and any L2 frame
 * (phase or gate) whose children are all skipped.
 */
export function fobYardSkippedIds(file: WorkflowFile) {
  const highLevel = file.highLevel?.graph ?? { nodes: [], edges: [] };
  const l1 = fobYardSkip(highLevel).skippedNodeIds;
  const l2 = new Set<string>();
  if (!l1.size) return { l1, l2 };
  for (const node of highLevel.nodes) {
    if (!l1.has(node.id)) continue;
    for (const id of [...(node.linkedLayer2NodeIds ?? []), ...(node.linkedDetailedNodeIds ?? [])])
      l2.add(id);
  }
  // Frames whose children are all skipped are skipped too (inner frames first).
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of file.graph.nodes) {
      if (l2.has(node.id)) continue;
      const children = Object.values(file.layout.nodes).filter(
        (layout) => layout.parentId === node.id,
      );
      if (children.length && children.every((child) => l2.has(child.nodeId))) {
        l2.add(node.id);
        changed = true;
      }
    }
  }
  return { l1, l2 };
}

/**
 * The project as it runs with FOB yard on: skipped L1 Phases and their L2
 * nodes are removed and the flow is reconnected around them. Used for the
 * schedule and every document export. Returns the same file when nothing is
 * skipped.
 */
export function applyFobYardSkip(file: WorkflowFile): WorkflowFile {
  const { l1, l2 } = fobYardSkippedIds(file);
  if (!l1.size || !file.highLevel) return file;

  const hl = file.highLevel.graph;
  const { bypassEdges } = fobYardSkip(hl);
  const highLevelEdges = [
    ...hl.edges.filter((edge) => !l1.has(edge.source) && !l1.has(edge.target)),
    ...bypassEdges.map(({ id, source, target }) => ({ id, source, target })),
  ];

  // Reconnect L2: each kept node that fed a skipped node now feeds the first
  // kept nodes after the skipped run.
  const outgoing = new Map<string, DomainEdge[]>();
  for (const edge of file.graph.edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }
  const keptAfter = (id: string, seen = new Set<string>()): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    return (outgoing.get(id) ?? []).flatMap((edge) =>
      l2.has(edge.target) ? keptAfter(edge.target, seen) : [edge.target],
    );
  };
  const keptEdges = file.graph.edges.filter((edge) => !l2.has(edge.source) && !l2.has(edge.target));
  const bridged: DomainEdge[] = [];
  for (const edge of file.graph.edges) {
    if (l2.has(edge.source) || !l2.has(edge.target)) continue;
    for (const target of new Set(keptAfter(edge.target))) {
      const exists = [...keptEdges, ...bridged].some(
        (candidate) => candidate.source === edge.source && candidate.target === target,
      );
      if (!exists && target !== edge.source) {
        bridged.push({ ...edge, id: `fob-yard-${edge.source}-${target}`, target });
      }
    }
  }

  const layoutNodes = Object.fromEntries(
    Object.entries(file.layout.nodes).filter(([id]) => !l2.has(id)),
  );
  const layoutEdges = file.layout.edges
    ? Object.fromEntries(
        Object.entries(file.layout.edges).filter(([id]) => keptEdges.some((e) => e.id === id)),
      )
    : undefined;

  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.filter((node) => !l2.has(node.id)),
      edges: [...keptEdges, ...bridged],
    },
    layout: { ...file.layout, nodes: layoutNodes, ...(layoutEdges ? { edges: layoutEdges } : {}) },
    highLevel: {
      ...file.highLevel,
      graph: { nodes: hl.nodes.filter((node) => !l1.has(node.id)), edges: highLevelEdges },
      layout: {
        ...file.highLevel.layout,
        nodes: Object.fromEntries(
          Object.entries(file.highLevel.layout.nodes).filter(([id]) => !l1.has(id)),
        ),
      },
    },
  };
}
