/** 11 x 17 landscape, in points. */
const PAGE = { width: 1224, height: 792, margin: 36 };

/**
 * Saves the L5 results as a PDF: one page per section (results, then the
 * production calendar), each scaled to fit an 11 x 17 landscape sheet with a
 * small heading.
 */
export async function exportSimulationPdf(scenarioName: string, sections: HTMLElement[]) {
  const [{ jsPDF }, { captureToPng }] = await Promise.all([
    import("jspdf"),
    import("@/lib/export/capture"),
  ]);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: [PAGE.width, PAGE.height],
  });
  const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const heading = `L5 Construction Simulation · ${scenarioName} · ${new Date().toISOString().slice(0, 10)}`;
  for (const [index, section] of sections.entries()) {
    if (index) pdf.addPage([PAGE.width, PAGE.height], "landscape");
    pdf.setFillColor(background);
    pdf.rect(0, 0, PAGE.width, PAGE.height, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(background === "rgb(255, 255, 255)" ? "#0f172a" : "#e2e8f0");
    pdf.text(heading, PAGE.margin, PAGE.margin - 10);
    const width = section.scrollWidth;
    const height = section.scrollHeight;
    const image = await captureToPng(section, { backgroundColor: background, width, height });
    const scale = Math.min(
      (PAGE.width - PAGE.margin * 2) / width,
      (PAGE.height - PAGE.margin * 2) / height,
    );
    pdf.addImage(image, "PNG", PAGE.margin, PAGE.margin, width * scale, height * scale);
  }
  const safeName =
    scenarioName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "scenario";
  pdf.save(`L5-simulation-${safeName}.pdf`);
}
