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
  const skippedTitles = file.highLevel.graph.nodes
    .filter((node) => l1.has(node.id))
    .map((node) => node.title.trim());

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
  const keptAfter = (
    id: string,
    via: string[],
    seen: Set<string>,
  ): Array<{ target: string; via: string[] }> => {
    if (seen.has(id)) return [];
    seen.add(id);
    return (outgoing.get(id) ?? []).flatMap((edge) =>
      l2.has(edge.target)
        ? keptAfter(edge.target, [...via, edge.target], seen)
        : [{ target: edge.target, via }],
    );
  };
  const keptEdges = file.graph.edges.filter((edge) => !l2.has(edge.source) && !l2.has(edge.target));
  const bridged: DomainEdge[] = [];
  for (const edge of file.graph.edges) {
    if (l2.has(edge.source) || !l2.has(edge.target)) continue;
    for (const { target, via } of keptAfter(edge.target, [edge.target], new Set())) {
      const exists = [...keptEdges, ...bridged].some(
        (candidate) => candidate.source === edge.source && candidate.target === target,
      );
      if (!exists && target !== edge.source) {
        bridged.push({
          ...edge,
          id: `fob-yard-${edge.source}-${target}`,
          target,
          label: "FOB yard",
          customFields: { ...edge.customFields, fobYardSkippedNodeIds: via.join(",") },
        });
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

  const skipped: WorkflowFile = {
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
  skippedTitlesByFile.set(skipped, skippedTitles);
  return skipped;
}

const skippedTitlesByFile = new WeakMap<WorkflowFile, string[]>();

/**
 * Delivery tag every PDF carries: "FOB YARD · PHASE 4 SKIPPED" when Final
 * Close has FOB yard on, otherwise "SITE WORK COMPLETION". Works on the
 * original file or on the result of applyFobYardSkip. Undefined without a
 * Final Close.
 */
export function fobYardTag(file: WorkflowFile): { label: string; fobYard: boolean } | undefined {
  const end = file.highLevel?.graph.nodes.find((node) => node.type === "end");
  if (!end) return undefined;
  if (!end.fobYard) return { label: "SITE WORK COMPLETION", fobYard: false };
  const titles =
    skippedTitlesByFile.get(file) ??
    (file.highLevel?.graph.nodes ?? [])
      .filter((node) => fobYardSkippedIds(file).l1.has(node.id))
      .map((node) => node.title.trim());
  return {
    label: titles.length ? `FOB YARD · ${titles.join(", ")} SKIPPED`.toUpperCase() : "FOB YARD",
    fobYard: true,
  };
}

export const FOB_YARD_COMPLETION = "FOB Yard Completion";
export const SITE_WORK_COMPLETION = "Site Work Completion";
const MANAGED_COMPLETION_TEXTS = new Set(
  [FOB_YARD_COMPLETION, SITE_WORK_COMPLETION, "Project completion and warranty are recorded"].map(
    (text) => text.toLowerCase(),
  ),
);
const isManagedText = (text?: string) =>
  MANAGED_COMPLETION_TEXTS.has((text ?? "").trim().toLowerCase());

/**
 * The completion release condition of every L2 node linked to Final Close
 * reads "FOB Yard Completion" when FOB yard is on, otherwise "Site Work
 * Completion". Only the default completion condition (or one already showing
 * either text) is managed, so custom conditions are left alone. Returns the
 * same file when nothing changes.
 */
export function syncFinalCloseCompletion(file: WorkflowFile): WorkflowFile {
  const ends = (file.highLevel?.graph.nodes ?? []).filter((node) => node.type === "end");
  if (!ends.length) return file;
  const wanted = new Map<string, string>();
  for (const end of ends) {
    const text = end.fobYard ? FOB_YARD_COMPLETION : SITE_WORK_COMPLETION;
    for (const id of end.linkedLayer2NodeIds ?? end.linkedDetailedNodeIds ?? [])
      wanted.set(id, text);
  }
  let changed = false;
  const nodes = file.graph.nodes.map((node) => {
    const text = wanted.get(node.id);
    if (!text) return node;
    const index = node.conditions.findIndex(
      (condition) =>
        condition.id === "project-completion-recorded" ||
        isManagedText(condition.label || condition.description),
    );
    if (index < 0) return node;
    const condition = node.conditions[index];
    const next = {
      ...condition,
      label: text,
      ...(condition.description && isManagedText(condition.description)
        ? { description: text }
        : {}),
    };
    if (next.label === condition.label && next.description === condition.description) return node;
    changed = true;
    return {
      ...node,
      conditions: node.conditions.map((item, itemIndex) => (itemIndex === index ? next : item)),
    };
  });
  return changed ? { ...file, graph: { ...file.graph, nodes } } : file;
}

/** Whether the project's Final Close has FOB yard on; undefined without a Final Close. */
export function finalCloseFobYard(file: WorkflowFile): boolean | undefined {
  const ends = (file.highLevel?.graph.nodes ?? []).filter((node) => node.type === "end");
  return ends.length ? ends.some((node) => node.fobYard === true) : undefined;
}

/**
 * Turns FOB yard on or off on the project's Final Close (L1), which L2–L4
 * follow, and updates the completion release condition text to match.
 */
export function setFinalCloseFobYard(file: WorkflowFile, fobYard: boolean): WorkflowFile {
  const highLevel = file.highLevel;
  if (!highLevel || finalCloseFobYard(file) === undefined) return file;
  return syncFinalCloseCompletion({
    ...file,
    highLevel: {
      ...highLevel,
      graph: {
        ...highLevel.graph,
        nodes: highLevel.graph.nodes.map((node) =>
          node.type === "end" ? { ...node, fobYard } : node,
        ),
      },
    },
  });
}
