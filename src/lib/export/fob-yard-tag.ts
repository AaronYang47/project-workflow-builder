import type { jsPDF } from "jspdf";
import { fobYardTag } from "@/lib/fob-yard";
import type { WorkflowFile } from "@/types/workflow";

/** Stamps the FOB yard / Site Work tag at the top centre of every page, where
 * the report headers leave space. */
export function stampFobYardTag(pdf: jsPDF, file: WorkflowFile) {
  const tag = fobYardTag(file);
  if (!tag) return;
  const k = pdf.internal.scaleFactor; // points per document unit
  const fontPt = 9;
  const padX = 7 / k;
  const height = 16 / k;
  const margin = 10 / k;
  const fill: [number, number, number] = tag.fobYard ? [21, 154, 117] : [71, 85, 105];
  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontPt);
    const width = pdf.getTextWidth(tag.label) + padX * 2;
    const x = (pdf.internal.pageSize.getWidth() - width) / 2;
    pdf.setFillColor(...fill);
    pdf.roundedRect(x, margin, width, height, height / 2, height / 2, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.text(tag.label, x + padX, margin + height / 2, { baseline: "middle" });
  }
}
