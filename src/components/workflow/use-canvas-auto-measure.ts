import { useEffect, type RefObject } from "react";
import { getGateLayoutMetrics, GATE_SECTION_GAP } from "@/lib/gate-layout";
import { NODE_HEADER_HEIGHT } from "@/lib/node-layout";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeLayout } from "@/types/workflow";

const CONTENT_SELECTOR = "[data-conditions-content], [data-node-content]";

/**
 * Monitors the DOM of workflow nodes, measuring scroll sizes and updating
 * NodeLayout width/height dynamically when content wraps or conditions expand.
 */
export function useCanvasAutoMeasure(
  wrapper: RefObject<HTMLDivElement | null>,
) {
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
          .querySelectorAll<HTMLElement>(
            '[aria-label="Approval conditions card"]',
          )
          .forEach((card) => {
            const flowNode = card.closest<HTMLElement>(".react-flow__node");
            const id = flowNode?.dataset.id;
            const content = card.querySelector<HTMLElement>(
              "[data-conditions-content]",
            );
            const decision = flowNode?.querySelector<HTMLElement>(
              "[data-decision-content]",
            );
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
        root
          .querySelectorAll<HTMLElement>("[data-node-content]")
          .forEach((content) => {
            const flowNode = content.closest<HTMLElement>(".react-flow__node");
            const id = flowNode?.dataset.id;
            const domain = current.graph.nodes.find((node) => node.id === id);
            const layout = id ? current.layout.nodes[id] : undefined;
            if (
              !id ||
              !layout ||
              !domain ||
              domain.type === "gate"
            ) {
              return;
            }

            const requiredHeight = Math.ceil(
              NODE_HEADER_HEIGHT + 2 + content.scrollHeight,
            );
            if (Math.abs(requiredHeight - layout.height) > 2) {
              patches[id] = {
                ...patches[id],
                height: requiredHeight,
              };
            }
          });

        // 3. Measure Node Headers for Title Overflow
        root
          .querySelectorAll<HTMLElement>("[data-node-header]")
          .forEach((header) => {
            const flowNode = header.closest<HTMLElement>(".react-flow__node");
            const id = flowNode?.dataset.id;
            const domain = id
              ? current.graph.nodes.find((node) => node.id === id)
              : undefined;
            const layout = id ? current.layout.nodes[id] : undefined;
            if (
              !id ||
              !layout ||
              !domain ||
              domain.type === "gate"
            ) {
              return;
            }

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

        // 4. Adapt Phase & Gate Container sizes to envelope all member nodes (including Gate and Steps)
        for (const container of current.graph.nodes.filter(
          (node) => node.type === "phase" || node.type === "gate",
        )) {
          const isPhase = container.type === "phase";
          const memberLayouts = Object.values(current.layout.nodes).filter(
            (layout) => {
              if (layout.nodeId === container.id) return false;
              if (layout.parentId === container.id) return true;
              if (
                isPhase &&
                layout.parentId &&
                current.layout.nodes[layout.parentId]?.parentId === container.id
              ) {
                return true;
              }
              return false;
            },
          );
          if (!memberLayouts.length) continue;

          const containerLayout = current.layout.nodes[container.id];
          if (!containerLayout) continue;

          const maxMemberRight = Math.max(
            ...memberLayouts.map((l) => {
              const w = patches[l.nodeId]?.width ?? l.width ?? 280;
              return l.x + w;
            }),
          );

          const maxMemberBottom = Math.max(
            ...memberLayouts.map((l) => {
              const h = patches[l.nodeId]?.height ?? l.height ?? 360;
              return l.y + h;
            }),
          );

          const padX = isPhase ? 36 : 24;
          const padBottom = isPhase ? 48 : 36;

          const targetWidth = Math.max(
            isPhase ? 380 : 340,
            maxMemberRight - containerLayout.x + padX,
          );
          const targetHeight = Math.max(
            isPhase ? 280 : 240,
            maxMemberBottom - containerLayout.y + padBottom,
          );

          if (
            Math.abs(targetWidth - containerLayout.width) > 4 ||
            Math.abs(targetHeight - containerLayout.height) > 4
          ) {
            patches[container.id] = {
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
    const observedContent = new WeakSet<Element>();
    const observeContent = () => {
      root
        .querySelectorAll<HTMLElement>(CONTENT_SELECTOR)
        .forEach((content) => {
          if (observedContent.has(content)) return;
          observedContent.add(content);
          observer.observe(content);
        });
    };
    const mutationObserver = new MutationObserver(() => {
      observeContent();
      schedule();
    });
    observeContent();
    mutationObserver.observe(root, { childList: true, subtree: true });

    const measureAfterArrange = () => {
      measure();
      settleTimers.push(window.setTimeout(measure, 120));
      settleTimers.push(window.setTimeout(measure, 320));
    };

    window.addEventListener("workflow:measure-layout", measureAfterArrange);
    frame = requestAnimationFrame(() => requestAnimationFrame(measure));
    settleTimers.push(
      ...[120, 360, 800, 1400].map((delay) =>
        window.setTimeout(measure, delay),
      ),
    );

    return () => {
      cancelAnimationFrame(frame);
      settleTimers.forEach(window.clearTimeout);
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener(
        "workflow:measure-layout",
        measureAfterArrange,
      );
    };
  }, [updateLayouts, wrapper]);
}
