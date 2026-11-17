import { readFileSync } from "node:fs";

/**
 * Page count and first-page size of a jsPDF file, formatted like Poppler's
 * `pdfinfo` ("Pages: 1", "Page size: 1224 x 792 pts") so assertions written
 * for pdfinfo keep working on machines without Poppler installed.
 */
export function pdfInfo(path: string) {
  const text = readFileSync(path).toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  const box = text.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  const size = box
    ? `${Number(box[3]) - Number(box[1])} x ${Number(box[4]) - Number(box[2])} pts`
    : "unknown";
  return `Pages: ${pages}\nPage size: ${size}\n`;
}
