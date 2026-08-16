import { clone } from "@/lib/clone";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import type {
  DomainEdge,
  DomainNode,
  NodeLayout,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";

export const DENIED_RETURN_HANDLE = "rework-in";

export function isDeniedSourceHandle(sourceHandle?: string | null) {
  return Boolean(sourceHandle?.startsWith("no"));
}

export function isDeniedEdge(edge: {
  sourceHandle?: string | null;
  type?: string;
}) {
  return (
    isDeniedSourceHandle(edge.sourceHandle) ||
    ["failure", "rework", "exception", "hold"].includes(String(edge.type || ""))
  );
}

export function canReceiveDeniedReturn(type?: WorkflowNodeType) {
  return Boolean(type) && type !== "projectStart" && type !== "phase";
}

export function deniedTargetHandle(options: {
  sourceHandle?: string | null;
  preGateSales?: boolean;
  droppedHandle?: string | null;
}) {
  if (options.preGateSales) return options.droppedHandle || "in";
  if (isDeniedSourceHandle(options.sourceHandle)) return DENIED_RETURN_HANDLE;
  return options.droppedHandle || undefined;
}

export function clearEdgeRoute(file: WorkflowFile, id: string): WorkflowFile {
  const route = file.layout.edges?.[id];
  if (!route) return file;
  return {
    ...file,
    layout: {
      ...file.layout,
      edges: {
        ...file.layout.edges,
        [id]: { ...route, points: [] },
      },
    },
  };
}

export function insertNode(
  file: WorkflowFile,
  node: DomainNode,
  position: { x: number; y: number },
  parentId?: string,
): WorkflowFile {
  const size = getAdaptiveNodeSize(node);
  return {
    ...file,
    graph: { ...file.graph, nodes: [...file.graph.nodes, node] },
    layout: {
      ...file.layout,
      nodes: {
        ...file.layout.nodes,
        [node.id]: {
          nodeId: node.id,
          ...position,
          width: size.width,
          height: size.height,
          parentId,
          zIndex: parentId ? 1 : undefined,
        },
      },
    },
  };
}

export function patchNode(
  file: WorkflowFile,
  id: string,
  patch: Partial<DomainNode>,
): WorkflowFile {
  const current = file.graph.nodes.find((node) => node.id === id);
  if (!current) return file;
  const next = { ...current, ...patch };
  const layout = file.layout.nodes[id];
  const preferred = getAdaptiveNodeSize(next, layout);
  const nextSize =
    next.type === "gate"
      ? preferred
      : {
          width: Math.max(layout?.width || 0, preferred.width),
          height: Math.max(layout?.height || 0, preferred.height),
        };
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) => (node.id === id ? next : node)),
    },
    layout: layout
      ? {
          ...file.layout,
          nodes: {
            ...file.layout.nodes,
            [id]: {
              ...layout,
              width: nextSize.width,
              height: nextSize.height,
            },
          },
        }
      : file.layout,
  };
}

export function occupiedPhaseNotices(file: WorkflowFile, ids: string[]) {
  const nodeSet = new Set(ids);
  return file.graph.nodes
    .filter((node) => nodeSet.has(node.id) && node.type === "phase")
    .map((phase) => ({
      phase,
      children: file.graph.nodes.filter(
        (node) =>
          file.layout.nodes[node.id]?.parentId === phase.id &&
          !nodeSet.has(node.id),
      ),
    }))
    .filter((entry) => entry.children.length);
}

export function wouldRemoveLastProjectStart(file: WorkflowFile, ids: string[]) {
  const nodeSet = new Set(ids);
  const allProjectStarts = file.graph.nodes.filter(
    (node) => node.type === "projectStart",
  );
  const projectStarts = allProjectStarts.filter((node) => nodeSet.has(node.id));
  if (!projectStarts.length) return [];
  if (allProjectStarts.length - projectStarts.length < 1) return projectStarts;
  return [];
}

export function deleteNodesFromFile(file: WorkflowFile, ids: string[]): WorkflowFile {
  const nodeSet = new Set(ids);
  const layouts = { ...file.layout.nodes };
  ids.forEach((id) => {
    const deletedLayout = layouts[id];
    if (deletedLayout) {
      Object.values(layouts).forEach((layout) => {
        if (layout.parentId !== id || nodeSet.has(layout.nodeId)) return;
        layout.x += deletedLayout.x;
        layout.y += deletedLayout.y;
        layout.parentId = undefined;
        layout.zIndex = undefined;
      });
    }
    delete layouts[id];
  });
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.filter((node) => !nodeSet.has(node.id)),
      edges: file.graph.edges.filter(
        (edge) => !nodeSet.has(edge.source) && !nodeSet.has(edge.target),
      ),
    },
    layout: { ...file.layout, nodes: layouts },
  };
}

export function addOrReplaceEdge(file: WorkflowFile, edge: DomainEdge): WorkflowFile {
  return {
    ...file,
    graph: {
      ...file.graph,
      edges: [
        ...file.graph.edges.filter(
          (existing) =>
            existing.source !== edge.source ||
            existing.sourceHandle !== edge.sourceHandle,
        ),
        edge,
      ],
    },
  };
}

export function duplicateNodes(file: WorkflowFile, ids: string[]) {
  const nodes = [...file.graph.nodes];
  const layouts = { ...file.layout.nodes };
  const created: string[] = [];
  ids.forEach((id) => {
    const source = file.graph.nodes.find((node) => node.id === id);
    if (!source) return;
    const nextId = `${source.type}-${crypto.randomUUID().slice(0, 8)}`;
    created.push(nextId);
    nodes.push({
      ...clone(source),
      id: nextId,
      title: `${source.title} copy`,
    });
    const old = layouts[id];
    layouts[nextId] = {
      ...old,
      nodeId: nextId,
      x: old.x + 32,
      y: old.y + 32,
    };
  });
  return {
    file: {
      ...file,
      graph: { ...file.graph, nodes },
      layout: { ...file.layout, nodes: layouts },
    },
    created,
  };
}

export function groupNodesIntoPhase(file: WorkflowFile, ids: string[], groupId: string) {
  const selectedLayouts = ids.map((id) => file.layout.nodes[id]).filter(Boolean);
  const minX = Math.min(...selectedLayouts.map((item) => item.x));
  const minY = Math.min(...selectedLayouts.map((item) => item.y));
  const maxX = Math.max(...selectedLayouts.map((item) => item.x + item.width));
  const maxY = Math.max(...selectedLayouts.map((item) => item.y + item.height));
  const group: DomainNode = {
    id: groupId,
    type: "phase",
    title: "New phase",
    description: "Grouped workflow stage",
    color: "#64748b",
    metadata: {},
    conditions: [],
    documents: [],
    criteria: [],
    customFields: {},
    config: {},
  };
  const nodes = [group, ...file.graph.nodes];
  const layouts = {
    ...file.layout.nodes,
    [groupId]: {
      nodeId: groupId,
      x: minX - 40,
      y: minY - 72,
      width: Math.max(420, maxX - minX + 80),
      height: Math.max(240, maxY - minY + 112),
      zIndex: -1,
    },
  };
  ids.forEach((id) => {
    const item = layouts[id];
    layouts[id] = {
      ...item,
      x: item.x - (minX - 40),
      y: item.y - (minY - 72),
      parentId: groupId,
      zIndex: 1,
    };
  });
  return {
    ...file,
    graph: { ...file.graph, nodes },
    layout: { ...file.layout, nodes: layouts },
  };
}

export function applyLayoutDrag(
  file: WorkflowFile,
  patches: Record<string, Partial<NodeLayout>>,
  before: Record<string, NodeLayout>,
) {
  const nodes = { ...file.layout.nodes };
  for (const [id, patch] of Object.entries(patches))
    if (nodes[id]) nodes[id] = { ...nodes[id], ...patch };
  const moved = new Set(Object.keys(patches));
  const routes = file.layout.edges
    ? Object.fromEntries(
        Object.entries(file.layout.edges).map(([edgeId, route]) => {
          const edge = file.graph.edges.find((item) => item.id === edgeId);
          if (!edge || (!moved.has(edge.source) && !moved.has(edge.target)))
            return [edgeId, route];
          const sourceBefore = before[edge.source];
          const targetBefore = before[edge.target];
          const sourceAfter = nodes[edge.source];
          const targetAfter = nodes[edge.target];
          const sourceDelta =
            sourceBefore && sourceAfter
              ? {
                  x: sourceAfter.x - sourceBefore.x,
                  y: sourceAfter.y - sourceBefore.y,
                }
              : { x: 0, y: 0 };
          const targetDelta =
            targetBefore && targetAfter
              ? {
                  x: targetAfter.x - targetBefore.x,
                  y: targetAfter.y - targetBefore.y,
                }
              : { x: 0, y: 0 };
          const lockstep =
            moved.has(edge.source) &&
            moved.has(edge.target) &&
            sourceDelta.x === targetDelta.x &&
            sourceDelta.y === targetDelta.y;
          if (!lockstep) return [edgeId, { ...route, points: [] }];
          const points = route.points.map((point) => ({
            x: point.x + sourceDelta.x,
            y: point.y + sourceDelta.y,
          }));
          return [edgeId, { ...route, points }];
        }),
      )
    : undefined;
  return {
    ...file,
    layout: { ...file.layout, nodes, edges: routes },
  };
}
