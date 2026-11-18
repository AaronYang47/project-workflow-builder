/**
 * L1 Start / Final Close rules: one of each, and the Phases a Final Close
 * with FOB yard on skips (with the display-only bypass lines around them).
 * Re-exported from high-level-workflow.
 */
import type { HighLevelEdge, HighLevelNode, HighLevelWorkflow } from "@/types/workflow";

/**
 * L1 allows exactly one Start and one Final Close. Extra copies (for example a
 * Final Close dragged in and renamed "Phase 4") lose a connection point, so
 * they are turned back into Phase nodes. The kept Final Close is the one named
 * "Final Close", otherwise the rightmost; the kept Start is the leftmost.
 */
export function demoteExtraHighLevelTerminals(highLevel: HighLevelWorkflow): HighLevelWorkflow {
  const x = (id: string) => highLevel.layout.nodes[id]?.x ?? 0;
  const pick = (type: "start" | "end") => {
    const matches = highLevel.graph.nodes.filter((node) => node.type === type);
    if (matches.length < 2) return undefined;
    if (type === "end") {
      const named = matches.find((node) => /final\s*close/i.test(node.title));
      if (named) return named.id;
    }
    return [...matches].sort((a, b) => (type === "end" ? x(b.id) - x(a.id) : x(a.id) - x(b.id)))[0]
      .id;
  };
  const keep = { start: pick("start"), end: pick("end") };
  if (!keep.start && !keep.end) return highLevel;
  return {
    ...highLevel,
    graph: {
      ...highLevel.graph,
      nodes: highLevel.graph.nodes.map((node) =>
        (node.type === "start" || node.type === "end") &&
        keep[node.type] &&
        keep[node.type] !== node.id
          ? { ...node, type: "phase" as const }
          : node,
      ),
    },
  };
}

/** Phases Final Close skips by default: those connected straight into it. */
export function defaultFobYardSkipPhaseIds(
  graph: { nodes: HighLevelNode[]; edges: HighLevelEdge[] },
  endId: string,
) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.target === endId && byId.get(edge.source)?.type === "phase")
    .map((edge) => edge.source);
}

/** The Phases a Final Close skips: the user's choice, or the default. */
export function fobYardSkipPhaseIds(
  graph: { nodes: HighLevelNode[]; edges: HighLevelEdge[] },
  end: HighLevelNode,
) {
  if (end.type !== "end" || !end.fobYard) return [];
  const phaseIds = new Set(graph.nodes.filter((node) => node.type === "phase").map((n) => n.id));
  return (end.fobYardSkipPhaseIds ?? defaultFobYardSkipPhaseIds(graph, end.id)).filter((id) =>
    phaseIds.has(id),
  );
}

/**
 * When Final Close has FOB yard on, the Phases chosen on it (by default the
 * Phase connected straight into it) are skipped. Returns those Phases, the
 * lines touching them (drawn grey) and display-only bypass lines from each
 * kept step before a skipped run to the first kept steps after it.
 */
export function fobYardSkip(graph: { nodes: HighLevelNode[]; edges: HighLevelEdge[] }) {
  const skippedNodeIds = new Set<string>();
  const skippedEdgeIds = new Set<string>();
  const bypassEdges: Array<HighLevelEdge & { skippedNodeIds: string[] }> = [];
  for (const end of graph.nodes) {
    for (const id of fobYardSkipPhaseIds(graph, end)) skippedNodeIds.add(id);
  }
  if (!skippedNodeIds.size) return { skippedNodeIds, skippedEdgeIds, bypassEdges };
  for (const edge of graph.edges) {
    if (skippedNodeIds.has(edge.source) || skippedNodeIds.has(edge.target)) {
      skippedEdgeIds.add(edge.id);
    }
  }
  // From a skipped step, every kept step reached through skipped steps only.
  const keptAfter = (
    id: string,
    via: string[],
    seen: Set<string>,
  ): Array<{ target: string; via: string[] }> => {
    if (seen.has(id)) return [];
    seen.add(id);
    return graph.edges
      .filter((edge) => edge.source === id)
      .flatMap((edge) =>
        skippedNodeIds.has(edge.target)
          ? keptAfter(edge.target, [...via, edge.target], seen)
          : [{ target: edge.target, via }],
      );
  };
  for (const edge of graph.edges) {
    if (skippedNodeIds.has(edge.source) || !skippedNodeIds.has(edge.target)) continue;
    for (const { target, via } of keptAfter(edge.target, [edge.target], new Set())) {
      const exists = [...graph.edges, ...bypassEdges].some(
        (candidate) => candidate.source === edge.source && candidate.target === target,
      );
      if (!exists && target !== edge.source) {
        bypassEdges.push({
          id: `fob-yard-bypass-${edge.source}-${target}`,
          source: edge.source,
          target,
          skippedNodeIds: via,
        });
      }
    }
  }
  return { skippedNodeIds, skippedEdgeIds, bypassEdges };
}
