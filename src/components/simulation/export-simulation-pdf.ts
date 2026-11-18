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
    // Take an expanded copy so compact panels and the phone's hidden Results view
    // can still export every timeline row and warning.
    const isResults = section.hasAttribute("data-simulation-results");
    const content = isResults ? (section.cloneNode(true) as HTMLElement) : section;
    if (isResults) {
      Object.assign(content.style, {
        position: "fixed",
        left: "-10000px",
        top: "0",
        width: "960px",
        height: "auto",
      });
      for (const list of content.querySelectorAll<HTMLElement>("[data-simulation-export-expand]")) {
        list.style.maxHeight = "none";
        list.style.overflow = "visible";
      }
      for (const chart of content.querySelectorAll<HTMLElement>("[data-daily-chart]")) {
        chart.style.minHeight = "160px";
      }
      document.body.appendChild(content);
    }
    const width = content.scrollWidth;
    const height = content.scrollHeight;
    let image: string;
    try {
      image = await captureToPng(content, { backgroundColor: background, width, height });
    } finally {
      if (isResults) content.remove();
    }
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
