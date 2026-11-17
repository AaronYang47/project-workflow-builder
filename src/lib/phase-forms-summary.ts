import { departmentDocumentSummary } from "@/lib/department-document-summary";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { linkedNodeIds, phaseColor } from "@/lib/l1-department-swimlane-pdf-export";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

export type PhaseForms = {
  id: string;
  title: string;
  description: string;
  color: string;
  legal: string[];
  customer: string[];
  supporting: string[];
};

/** One entry per form, ignoring differences in capitals ("Notice of Concern" / "Notice Of Concern"). */
const uniqueTitles = (titles: string[]) =>
  [
    ...new Map(titles.map((title) => [title.trim().toLocaleLowerCase(), title.trim()])).values(),
  ].filter(Boolean);

/**
 * The forms each L1 phase needs, from the release conditions of its linked
 * departments: the same legal / customer / supporting split as the Gantt report.
 */
export function phaseFormsSummary(file: WorkflowFile): PhaseForms[] {
  const highLevel = file.highLevel?.graph;
  if (!highLevel) return [];
  const nodeById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  return orderHighLevelNodes(highLevel.nodes, highLevel.edges)
    .filter((node) => node.type !== "primaryGate")
    .map((node, index) => {
      const chapters = linkedNodeIds(node, file, nodeById)
        .map((id) => nodeById.get(id))
        .filter((chapter): chapter is DomainNode => Boolean(chapter));
      const documents = departmentDocumentSummary(chapters);
      return {
        id: node.id,
        title: node.title.trim() || `Phase ${index + 1}`,
        description: node.description.trim(),
        color: phaseColor(node, index),
        legal: uniqueTitles(documents.legal),
        customer: uniqueTitles(documents.customer),
        supporting: uniqueTitles([
          ...documents.supporting,
          ...documents.optional.map((item) => item.title),
        ]),
      };
    });
}

export type PrintHeader = {
  kicker: string;
  title: string;
  details: { label: string; value: string }[];
};

/** Title block for the printed L1 / L2 flowchart: the project and what this sheet shows. */
export function flowchartPrintHeader(
  file: WorkflowFile,
  layer: "l1" | "l2",
  phaseCount: number,
): PrintHeader {
  const metadata = file.graph.metadata;
  const jobNumber =
    workflowLegacyJobNumber(file) ||
    [
      file.operations?.identity?.projectNumber,
      file.operations?.identity?.projectId,
      file.operations?.projectNumber,
    ]
      .map((value) => String(value || "").trim())
      .find((value) => /^\d{5}$/.test(value)) ||
    "Not set";
  return {
    kicker:
      layer === "l1" ? "L1 · High-Level Process Flowchart" : "L2 · Detailed Workflow Flowchart",
    title: metadata.name?.trim() || "Process Workflow",
    details: [
      { label: "Job Number", value: jobNumber },
      { label: "Version", value: metadata.version?.trim() || "—" },
      {
        label: "Status",
        value: metadata.status
          ? metadata.status.charAt(0).toUpperCase() + metadata.status.slice(1)
          : "—",
      },
      { label: "Phases", value: String(phaseCount) },
      {
        label: "Exported",
        value: new Date().toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      },
    ],
  };
}
