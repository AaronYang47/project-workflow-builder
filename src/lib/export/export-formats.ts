import type { WorkflowFile } from "@/types/workflow";

/** Every export the toolbar can request. Canvas formats are rendered by the
 * visible canvas; document formats build their own PDF from the workflow. */
export type ExportFormat =
  | "png"
  | "svg"
  | "pdf"
  | "l1-pdf"
  | "l1-swimlane-pdf"
  | "l1-gantt-pdf"
  | "l2-pdf"
  | "l3-pdf"
  | "tech-pdf"
  | "presentation-pdf"
  | "presentation-no-conditions-pdf";

export const DOCUMENT_EXPORT_FORMATS = [
  "l1-swimlane-pdf",
  "l1-gantt-pdf",
  "l3-pdf",
  "tech-pdf",
  "presentation-pdf",
  "presentation-no-conditions-pdf",
] as const satisfies readonly ExportFormat[];
export type DocumentExportFormat = (typeof DOCUMENT_EXPORT_FORMATS)[number];

export const isDocumentExportFormat = (format: ExportFormat): format is DocumentExportFormat =>
  (DOCUMENT_EXPORT_FORMATS as readonly ExportFormat[]).includes(format);

/** Event the toolbar dispatches; WorkflowBuilder and the canvases listen. */
export const EXPORT_EVENT = "workflow:export";
export type ExportEventDetail = { format: ExportFormat; switched?: boolean };
export const requestExport = (format: ExportFormat) =>
  window.dispatchEvent(new CustomEvent<ExportEventDetail>(EXPORT_EVENT, { detail: { format } }));

/** Builds a document PDF. Each exporter is loaded only when used, so jsPDF
 * and the large report builders stay out of the initial page bundle. */
export async function exportDocument(format: DocumentExportFormat, source: WorkflowFile) {
  // With FOB yard on, documents show the project without the skipped Phase.
  const { applyFobYardSkip } = await import("@/lib/fob-yard");
  const file = applyFobYardSkip(source);
  switch (format) {
    case "l1-swimlane-pdf":
    case "l1-gantt-pdf": {
      const { exportL1DepartmentSwimlanePdf } =
        await import("@/lib/l1-department-swimlane-pdf-export");
      return exportL1DepartmentSwimlanePdf(file, { gantt: format === "l1-gantt-pdf" });
    }
    case "l3-pdf": {
      const { exportL3ExecutionPdf } = await import("@/lib/l3-pdf-export");
      return exportL3ExecutionPdf(file);
    }
    case "tech-pdf": {
      const { exportPresentationPdf } = await import("@/lib/presentation-pdf-export");
      return exportPresentationPdf(file);
    }
    case "presentation-pdf":
    case "presentation-no-conditions-pdf": {
      const { exportExecutivePresentationPdf } =
        await import("@/lib/executive-presentation-pdf-export");
      return exportExecutivePresentationPdf(file, {
        includeReleaseConditions: format === "presentation-pdf",
      });
    }
  }
}

/** html-to-image rejects with a bare Event when the browser refuses to draw
 * the page image (usually a canvas size limit), so name that case clearly. */
export const exportErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof Event !== "undefined" && error instanceof Event)
    return "Could not export document: the browser could not render the page image. Try again on a computer, or export a smaller section.";
  return "Could not export document.";
};
