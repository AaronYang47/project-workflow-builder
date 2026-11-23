"use client";

import { useCallback } from "react";
import { chapterLabel } from "@/lib/chapter-label";
import { getAdaptiveNodeSize, getL1FallbackColor } from "@/lib/node-layout";
import { type DomainNode, type WorkflowNodeType } from "@/types/workflow";
import type { ReactFlowInstance } from "@xyflow/react";
import type { WorkflowState } from "@/store/workflow-store";
import type { WorkflowFile } from "@/types/workflow";

/** Drop a node from the node library onto the L2 canvas: wraps the selection in a
 * new phase, places a gate under the dropped-on node, or adds the node inside the
 * phase under the pointer. */
export function useCanvasDrop({
  flow,
  file,
  selection,
  addNode,
  addPhaseWrappingNodes,
  addGateUnderNode,
}: {
  flow: ReactFlowInstance;
  file: WorkflowFile;
  selection: WorkflowState["selection"];
  addNode: WorkflowState["addNode"];
  addPhaseWrappingNodes: WorkflowState["addPhaseWrappingNodes"];
  addGateUnderNode: WorkflowState["addGateUnderNode"];
}) {
  return useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/workflow-node") as WorkflowNodeType;
      if (!type) return;
      const position = flow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const highLevelNodes = file.highLevel?.graph.nodes || [];
      const getPhaseInfo = (targetNode: DomainNode) => {
        // 1. Direct L1 link
        const directL1 = highLevelNodes.find((hl) => {
          const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
          return ids.includes(targetNode.id);
        });
        if (directL1) {
          return {
            title: directL1.title,
            color: directL1.backgroundColor || "#0d9488",
          };
        }
        // 2. Stage match
        if (targetNode.config?.stage) {
          const stageStr = String(targetNode.config.stage).trim().toLowerCase();
          const stageMatch = highLevelNodes.find(
            (hl) => hl.title.trim().toLowerCase() === stageStr,
          );
          if (stageMatch) {
            return {
              title: stageMatch.title,
              color: stageMatch.backgroundColor || "#0d9488",
            };
          }
          return {
            title: chapterLabel(String(targetNode.config.stage)),
            color: targetNode.color || "#0d9488",
          };
        }
        return {
          title: targetNode.title || "Phase",
          color: targetNode.color || "#0d9488",
        };
      };

      const resolveAbs = (id: string) => {
        const l = file.layout.nodes[id];
        if (!l) return { x: 0, y: 0, width: 270, height: 220 };
        let x = l.x;
        let y = l.y;
        let currParentId = l.parentId;
        while (currParentId && file.layout.nodes[currParentId]) {
          const pl = file.layout.nodes[currParentId];
          x += pl.x;
          y += pl.y;
          currParentId = pl.parentId;
        }
        const domain = file.graph.nodes.find((n) => n.id === id);
        const adaptive = domain ? getAdaptiveNodeSize(domain, l) : { width: 280, height: 360 };
        return {
          x,
          y,
          width: l.width || adaptive.width,
          height: l.height || adaptive.height,
        };
      };

      if (type === "phase") {
        // Step nodes (non-phase, non-gate)
        const stepNodes = file.graph.nodes.filter((n) => n.type !== "phase" && n.type !== "gate");

        // Find which step node is targeted (cursor is dropped above it or over it)
        const targetNode = stepNodes.find((n) => {
          const bounds = resolveAbs(n.id);
          const xMatch = position.x >= bounds.x - 60 && position.x <= bounds.x + bounds.width + 60;
          const yMatch =
            position.y >= bounds.y - 240 && position.y <= bounds.y + bounds.height + 60;
          return xMatch && yMatch;
        });

        if (targetNode) {
          // Determine covered nodes based on L1 link
          const directL1 = highLevelNodes.find((hl) => {
            const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
            return ids.includes(targetNode.id);
          });

          let coveredNodes = [targetNode];
          if (directL1) {
            const linkedIds = directL1.linkedLayer2NodeIds ?? directL1.linkedDetailedNodeIds ?? [];
            const l1Steps = stepNodes.filter((n) => linkedIds.includes(n.id));
            if (l1Steps.length > 0) {
              coveredNodes = l1Steps;
            }
          } else if (selection.nodeIds.length > 1 && selection.nodeIds.includes(targetNode.id)) {
            coveredNodes = stepNodes.filter((n) => selection.nodeIds.includes(n.id));
          } else {
            const targetStage = targetNode.config?.stage;
            if (targetStage) {
              const sameStageNodes = stepNodes.filter(
                (n) => n.config?.stage === targetStage && !file.layout.nodes[n.id]?.parentId,
              );
              if (sameStageNodes.length > 0) {
                coveredNodes = sameStageNodes;
              }
            }
          }

          // Also check if any Gate exists whose children are part of coveredNodes:
          const gateNodes = file.graph.nodes.filter((n) => n.type === "gate");
          const gatesToInclude = gateNodes.filter((g) => {
            const gateChildren = stepNodes.filter(
              (n) => file.layout.nodes[n.id]?.parentId === g.id,
            );
            return (
              gateChildren.length > 0 &&
              gateChildren.some((c) => coveredNodes.some((cn) => cn.id === c.id))
            );
          });

          const allCoveredIds = Array.from(
            new Set([...coveredNodes.map((n) => n.id), ...gatesToInclude.map((g) => g.id)]),
          );

          // Compute enclosing bounding box
          const boundsList = allCoveredIds.map((id) => resolveAbs(id));
          const minX = Math.min(...boundsList.map((b) => b.x));
          const maxX = Math.max(...boundsList.map((b) => b.x + b.width));
          const minY = Math.min(...boundsList.map((b) => b.y));
          const maxY = Math.max(...boundsList.map((b) => b.y + b.height));

          const containsGate = gatesToInclude.length > 0;
          const PAD_X = 36;
          const PAD_TOP = containsGate ? 360 : 180;
          const PAD_BOTTOM = containsGate ? 40 : 48;

          const phaseInfo = getPhaseInfo(targetNode);
          const phaseColor = directL1
            ? directL1.backgroundColor && directL1.backgroundColor !== "transparent"
              ? directL1.backgroundColor
              : getL1FallbackColor(directL1.title, highLevelNodes.indexOf(directL1))
            : phaseInfo.color;

          const phaseProps = {
            x: minX - PAD_X,
            y: minY - PAD_TOP,
            width: Math.max(380, maxX - minX + PAD_X * 2),
            height: Math.max(280, maxY - (minY - PAD_TOP) + PAD_BOTTOM),
            title: directL1 ? directL1.title : phaseInfo.title,
            color: phaseColor,
          };

          addPhaseWrappingNodes(phaseProps, allCoveredIds);
          return;
        }

        // Standalone phase if not dropped over a node
        addNode("phase", position);
        return;
      }

      if (type === "gate") {
        // 1. Check if dropped near or below an existing Phase
        const phaseNodes = file.graph.nodes.filter((n) => n.type === "phase");
        const targetPhase = phaseNodes.find((p) => {
          const l = file.layout.nodes[p.id];
          if (!l) return false;
          return (
            position.x >= l.x - 80 &&
            position.x <= l.x + l.width + 80 &&
            position.y >= l.y - 60 &&
            position.y <= l.y + l.height + 350
          );
        });

        if (targetPhase) {
          const pl = file.layout.nodes[targetPhase.id]!;
          const gateWidth = pl.width || 620;
          const gateX = pl.x;
          const gateY = pl.y + pl.height + 28;

          addGateUnderNode({
            x: gateX,
            y: gateY,
            width: gateWidth,
            height: 220,
            title: `${targetPhase.title} · Gate`,
            color: targetPhase.color || "#7c3aed",
            stage: targetPhase.title,
          });
          return;
        }

        // 2. Check if dropped near or below a Step node
        const stepNodes = file.graph.nodes.filter((n) => n.type !== "phase" && n.type !== "gate");
        const targetStep = stepNodes.find((n) => {
          const bounds = resolveAbs(n.id);
          return (
            position.x >= bounds.x - 60 &&
            position.x <= bounds.x + bounds.width + 60 &&
            position.y >= bounds.y - 60 &&
            position.y <= bounds.y + bounds.height + 350
          );
        });

        if (targetStep) {
          const stepLayout = file.layout.nodes[targetStep.id];
          if (stepLayout?.parentId && file.layout.nodes[stepLayout.parentId]) {
            const pl = file.layout.nodes[stepLayout.parentId]!;
            const parentPhase = file.graph.nodes.find((n) => n.id === stepLayout.parentId);
            const gateWidth = 620;
            const gateX = pl.x + Math.max(0, (pl.width - gateWidth) / 2);
            const gateY = pl.y + pl.height + 40;

            addGateUnderNode({
              x: gateX,
              y: gateY,
              width: gateWidth,
              height: 268,
              title: parentPhase ? `${parentPhase.title} · Gate` : "Gate",
              color: parentPhase?.color || "#7c3aed",
              stage: parentPhase?.title,
            });
            return;
          }

          const bounds = resolveAbs(targetStep.id);
          const gateWidth = 620;
          const gateX = bounds.x + Math.max(0, (bounds.width - gateWidth) / 2);
          const gateY = bounds.y + bounds.height + 40;
          const phaseInfo = getPhaseInfo(targetStep);

          addGateUnderNode({
            x: gateX,
            y: gateY,
            width: gateWidth,
            height: 268,
            title: `${phaseInfo.title} · Gate`,
            color: phaseInfo.color,
            stage: phaseInfo.title,
          });
          return;
        }

        // Standalone gate
        addGateUnderNode({
          x: position.x,
          y: position.y,
          width: 620,
          height: 268,
        });
        return;
      }

      // Default for other node types
      const phase = file.graph.nodes
        .filter((node) => node.type === "phase")
        .map((node) => file.layout.nodes[node.id])
        .find(
          (layout) =>
            layout &&
            position.x >= layout.x &&
            position.x <= layout.x + layout.width &&
            position.y >= layout.y &&
            position.y <= layout.y + layout.height,
        );

      addNode(
        type,
        phase && type !== "estimation"
          ? {
              x: Math.max(24, position.x - phase.x),
              y: Math.max(112, position.y - phase.y),
            }
          : position,
        type === "estimation" ? undefined : phase?.nodeId,
      );
    },
    [
      addGateUnderNode,
      addNode,
      addPhaseWrappingNodes,
      file.graph.nodes,
      file.highLevel?.graph.nodes,
      file.layout.nodes,
      flow,
      selection.nodeIds,
    ],
  );
}
