import { useEffect, type RefObject } from "react";
import { type useReactFlow } from "@xyflow/react";
import { fitCanvasToWorkflow } from "@/lib/flow-helpers";

type ReactFlowInstance = ReturnType<typeof useReactFlow>;

/**
 * Attaches global canvas event listeners for node focusing, zoom-to-fit,
 * and high-resolution PNG/SVG image export.
 */
export function useCanvasExport(
  flow: ReactFlowInstance,
  wrapper: RefObject<HTMLDivElement | null>,
  viewType: "l1" | "l2" = "l2",
) {
  // Focus node event
  useEffect(() => {
    const focus = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      let attempts = 0;
      const focusWhenMeasured = () => {
        if (!flow.viewportInitialized) {
          if (attempts < 32) {
            attempts += 1;
            window.setTimeout(focusWhenMeasured, 50);
          }
          return;
        }

        const canvasRect = wrapper.current?.getBoundingClientRect();
        if (!canvasRect?.width || !canvasRect.height) {
          if (attempts < 32) {
            attempts += 1;
            window.setTimeout(focusWhenMeasured, 50);
          }
          return;
        }

        const node = flow.getInternalNode(id);
        if (!node?.measured.width || !node.measured.height) {
          if (attempts < 32) {
            attempts += 1;
            window.setTimeout(focusWhenMeasured, 50);
          }
          return;
        }
        flow.fitView({ nodes: [{ id }], duration: 500, padding: 0.18, maxZoom: 1.25 });
      };

      focusWhenMeasured();
    };
    const focusMany = (event: Event) => {
      const ids = (event as CustomEvent<string[]>).detail;
      const nodes = ids.map((id) => ({ id })).filter((node) =>
        flow.getNodes().some((current) => current.id === node.id),
      );
      if (!nodes.length) return;
      flow.fitView({ nodes, duration: 500, padding: 0.8, maxZoom: 1.25 });
    };
    window.addEventListener("workflow:focus-node", focus);
    window.addEventListener("workflow:focus-nodes", focusMany);
    return () => {
      window.removeEventListener("workflow:focus-node", focus);
      window.removeEventListener("workflow:focus-nodes", focusMany);
    };
  }, [flow, wrapper]);

  // Fit canvas event
  useEffect(() => {
    const fit = () => fitCanvasToWorkflow(flow);
    window.addEventListener("workflow:fit", fit);
    return () => window.removeEventListener("workflow:fit", fit);
  }, [flow]);

  // Full-scale image & PDF export helper
  useEffect(() => {
    const capture = async (
      event: Event & {
        detail?: { format: string };
      },
    ) => {
      const detail = event.detail ?? { format: "png" };

      // Specialized document exporters own every other format. Unknown
      // requests must never fall through to an SVG with a misleading suffix.
      if (!["png", "svg", "pdf", "l1-pdf", "l2-pdf"].includes(detail.format)) return;
      if (detail.format === "l1-pdf" && viewType !== "l1") return;
      if (detail.format === "l2-pdf" && viewType !== "l2") return;

      const wrapperEl = wrapper.current;
      const flowElement = wrapperEl?.querySelector<HTMLElement>(".react-flow");
      const viewport = flowElement?.querySelector<HTMLElement>(
        ".react-flow__viewport",
      );
      if (!flowElement || !viewport) return;

      const bounds = flow.getNodesBounds(flow.getNodes());
      const padding = viewType === "l1" ? 44 : 56;
      const targetWidth = Math.max(1, Math.round(bounds.width + padding * 2));
      const targetHeight = Math.max(1, Math.round(bounds.height + padding * 2));

      const original = {
        viewportTransform: viewport.style.getPropertyValue("transform"),
        viewportTransformPriority: viewport.style.getPropertyPriority("transform"),
      };

      // Keep the live React Flow container at its original size. Resizing it
      // triggers its ResizeObserver and can change the viewport during capture.
      viewport.style.setProperty("transform", `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`, "important");
      // Stay below browser canvas dimension and area limits for large projects.
      const pixelRatio = Math.min(2, 12000 / Math.max(targetWidth, targetHeight), Math.sqrt(32000000 / (targetWidth * targetHeight)));
      const captureStyle = { width: `${targetWidth}px`, height: `${targetHeight}px` };

      try {
        const backgroundColor =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--canvas-export")
            .trim() || "#ffffff";

        if (
          detail.format === "pdf" ||
          detail.format === "l1-pdf" ||
          detail.format === "l2-pdf"
        ) {
          const { toPng } = await import("html-to-image");
          const { jsPDF } = await import("jspdf");
          const data = await toPng(flowElement, {
            backgroundColor,
            pixelRatio,
            style: captureStyle,
            width: targetWidth,
            height: targetHeight,
            filter: (node: HTMLElement) =>
              !node.classList?.contains("react-flow__controls") &&
              !node.classList?.contains("react-flow__minimap"),
          });

          const orientation =
            targetWidth >= targetHeight ? "landscape" : "portrait";
          // PDF readers impose a page size limit as well; scale the page and
          // its image together without changing the workflow's proportions.
          const pageScale = Math.min(1, 12000 / Math.max(targetWidth, targetHeight));
          const pdfWidth = targetWidth * pageScale;
          const pdfHeight = targetHeight * pageScale;
          const pdf = new jsPDF({
            orientation,
            unit: "px",
            format: [pdfWidth, pdfHeight],
          });
          pdf.addImage(data, "PNG", 0, 0, pdfWidth, pdfHeight);

          const downloadName =
            detail.format === "l1-pdf"
              ? "workflow-L1-high-level.pdf"
              : detail.format === "l2-pdf"
                ? "workflow-L2-detailed.pdf"
                : "workflow.pdf";

          pdf.save(downloadName);
          return;
        }

        const { toPng, toSvg } = await import("html-to-image");
        const data =
          detail.format === "png"
            ? await toPng(flowElement, {
                backgroundColor,
                pixelRatio,
                style: captureStyle,
                width: targetWidth,
                height: targetHeight,
                filter: (node: HTMLElement) =>
                  !node.classList?.contains("react-flow__controls") &&
                  !node.classList?.contains("react-flow__minimap"),
              })
            : await toSvg(flowElement, {
                backgroundColor,
                style: captureStyle,
                width: targetWidth,
                height: targetHeight,
                filter: (node: HTMLElement) =>
                  !node.classList?.contains("react-flow__controls") &&
                  !node.classList?.contains("react-flow__minimap"),
              });

        const anchor = document.createElement("a");
        anchor.download = `workflow.${detail.format}`;
        anchor.href = data;
        anchor.click();
      } finally {
        viewport.style.setProperty("transform", original.viewportTransform, original.viewportTransformPriority);
      }
    };

    window.addEventListener("workflow:export", capture as EventListener);
    return () =>
      window.removeEventListener("workflow:export", capture as EventListener);
  }, [flow, wrapper, viewType]);
}
