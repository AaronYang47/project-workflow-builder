import { useEffect, type RefObject } from "react";
import { getGateLayoutMetrics, GATE_SECTION_GAP } from "@/lib/gate-layout";
import { NODE_HEADER_HEIGHT } from "@/lib/node-layout";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeLayout } from "@/types/workflow";

/**
 * Monitors the DOM of workflow nodes, measuring scroll sizes and updating
 * NodeLayout width/height dynamically when content wraps or conditions expand.
 */
export function useCanvasAutoMeasure(wrapper: RefObject<HTMLDivElement | null>) {
  const updateLayouts = useWorkflowStore((state) => state.updateLayouts);

  useEffect(() => {
    const root = wrapper.current;
    if (!root) return;
    let frame = 0;
    let isMeasuring = false;

    const measure = () => {
      if (isMeasuring) return;
      isMeasuring = true;
      try {
        const current = useWorkflowStore.getState().file;
        const patches: Record<string, Partial<NodeLayout>> = {};

        // 1. Measure Approval conditions cards (Gate nodes)
        root
          .querySelectorAll<HTMLElement>('[aria-label="Approval conditions card"]')
          .forEach((card) => {
            const flowNode = card.closest<HTMLElement>(".react-flow__node");
            const id = flowNode?.dataset.id;
            const content = card.querySelector<HTMLElement>("[data-conditions-content]");
            const decision = flowNode?.querySelector<HTMLElement>("[data-decision-content]");
            const domain = current.graph.nodes.find((node) => node.id === id);
            if (!id || !content || domain?.type !== "gate") return;

            const metrics = getGateLayoutMetrics(domain);
            const conditionsHeight = Math.ceil(48 + content.scrollHeight + 16);
            const decisionHeight = decision
              ? Math.ceil(48 + decision.scrollHeight + 16)
              : metrics.decisionHeight;

            const targetHeight =
              metrics.conditionsTop +
              conditionsHeight +
              GATE_SECTION_GAP +
              decisionHeight;
            const layout = current.layout.nodes[id];
            if (!layout || Math.abs(targetHeight - layout.height) > 4) {
              patches[id] = { height: targetHeight };
            }
          });

      // 2. Measure General Node Content
      root.querySelectorAll<HTMLElement>("[data-node-content]").forEach((content) => {
        const flowNode = content.closest<HTMLElement>(".react-flow__node");
        const id = flowNode?.dataset.id;
        const domain = current.graph.nodes.find((node) => node.id === id);
        const layout = id ? current.layout.nodes[id] : undefined;
        if (
          !id ||
          !layout ||
          !domain ||
          domain.type === "gate" ||
          domain.type === "opportunityValidation"
        )
          return;

        const requiredHeight = Math.ceil(NODE_HEADER_HEIGHT + 2 + content.scrollHeight);
        if (Math.abs(requiredHeight - layout.height) > 2) {
          patches[id] = {
            ...patches[id],
            height: requiredHeight,
          };
        }
      });

      // 3. Measure Node Headers for Title Overflow
      root.querySelectorAll<HTMLElement>("[data-node-header]").forEach((header) => {
        const flowNode = header.closest<HTMLElement>(".react-flow__node");
        const id = flowNode?.dataset.id;
        const domain = id ? current.graph.nodes.find((node) => node.id === id) : undefined;
        const layout = id ? current.layout.nodes[id] : undefined;
        if (
          !id ||
          !layout ||
          !domain ||
          domain.type === "gate" ||
          domain.type === "opportunityValidation"
        )
          return;

        const overflow = Math.ceil(header.scrollWidth - header.clientWidth);
        if (overflow > 2) {
          const targetWidth = layout.width + overflow + 12;
          if (Math.abs(targetWidth - layout.width) > 2) {
            patches[id] = {
              ...patches[id],
              width: targetWidth,
            };
          }
        }
      });

      // 4. Adapt Phase Container sizes to envelope all child nodes
      for (const phase of current.graph.nodes.filter((node) => node.type === "phase")) {
        const children = Object.values(current.layout.nodes).filter(
          (layout) => layout.parentId === phase.id,
        );
        if (!children.length) continue;

        const targetWidth = Math.max(
          420,
          ...children.map((layout) => layout.x + layout.width + 42),
        );
        const targetHeight = Math.max(
          260,
          ...children.map(
            (layout) =>
              layout.y +
              (patches[layout.nodeId]?.height ?? layout.height) +
              42,
          ),
        );
        const phaseLayout = current.layout.nodes[phase.id];
        if (
          !phaseLayout ||
          Math.abs(targetWidth - phaseLayout.width) > 2 ||
          Math.abs(targetHeight - phaseLayout.height) > 2
        ) {
          patches[phase.id] = {
            width: targetWidth,
            height: targetHeight,
          };
        }
      }

      if (Object.keys(patches).length > 0) {
        updateLayouts(patches);
      }
      } finally {
        isMeasuring = false;
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const settleTimers: number[] = [];
    const observer = new ResizeObserver(schedule);
    root
      .querySelectorAll<HTMLElement>("[data-conditions-content], [data-node-content]")
      .forEach((content) => observer.observe(content));

    const measureAfterArrange = () => {
      measure();
      settleTimers.push(window.setTimeout(measure, 120));
      settleTimers.push(window.setTimeout(measure, 320));
    };

    window.addEventListener("workflow:measure-layout", measureAfterArrange);
    frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    settleTimers.push(
      ...[120, 360, 800, 1400].map((delay) => window.setTimeout(measure, delay)),
    );

    return () => {
      cancelAnimationFrame(frame);
      settleTimers.forEach(window.clearTimeout);
      observer.disconnect();
      window.removeEventListener("workflow:measure-layout", measureAfterArrange);
    };
  }, [updateLayouts, wrapper]);
}
