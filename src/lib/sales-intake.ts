import { clone } from "@/lib/clone";
import { createDomainNode } from "@/lib/create-domain-node";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  LEGACY_JOB_NUMBER_PATTERN,
  applyNodeJobNumberToFile,
  buildProjectIdFromJobNumber,
  workflowLegacyJobNumber,
} from "@/lib/project-id";
import { normalizeProjectOperations } from "@/lib/project-operations";
import { qualificationOf, qualificationRoute, type Qualification } from "@/lib/qualification";
import {
  compactQualificationForm101,
  normalizeQualificationForm101,
  type QualificationForm101,
} from "@/lib/qualification-form-101";
import type { DomainNode, WorkflowFile } from "@/types/workflow";
import { normalizeRevisionHistory, type RevisionEntry } from "@/lib/qf-changes";

/**
 * The Sales intake site (/sales): Sales fill in only the Job number and the
 * Qualification Form [1.01] of a project. These helpers read and write exactly
 * those two parts of a project, so the server can apply a Sales submission
 * without Sales ever seeing or changing the rest of the workflow.
 */

/** Who submitted the Qualification Form from the Sales site, and when. */
export type SalesSubmission = {
  by: string;
  email: string;
  at: string;
  /** The form revision this submission was saved as. */
  revision: string;
};

export type SalesIntake = {
  jobNumber: string;
  form101: QualificationForm101;
};

/** Five digits, or empty. */
export const normalizeJobNumber = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return LEGACY_JOB_NUMBER_PATTERN.test(digits) ? digits : "";
};

export const isValidJobNumberInput = (value: string) =>
  !value.trim() || LEGACY_JOB_NUMBER_PATTERN.test(value.trim());

const qualificationNode = (file: WorkflowFile) =>
  file.graph.nodes.find((node) => node.type === "qualification");

export function salesSubmissionOf(qualification: Qualification): SalesSubmission | undefined {
  const value = (qualification as Qualification & { salesSubmission?: unknown }).salesSubmission;
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.at !== "string") return undefined;
  return {
    by: String(item.by ?? ""),
    email: String(item.email ?? ""),
    at: item.at,
    revision: String(item.revision ?? ""),
  };
}

/** The parts of a project Sales may see. */
export function readSalesIntake(file: WorkflowFile) {
  const node = qualificationNode(file);
  const qualification = node ? qualificationOf(node) : {};
  return {
    jobNumber: workflowLegacyJobNumber(file),
    form101: normalizeQualificationForm101(qualification.form101),
    submission: salesSubmissionOf(qualification),
    history: salesHistoryOf(qualification),
  };
}

/** Every Sales submission, oldest first, with what each one changed. */
export function salesHistoryOf(qualification: Qualification): RevisionEntry[] {
  return normalizeRevisionHistory(
    (qualification as Qualification & { salesHistory?: unknown }).salesHistory,
  );
}

const MAX_HISTORY = 60;

/** Next revision for a Sales submission: kept on the first one, then +1. */
export function nextSalesRevision(previous: SalesSubmission | undefined, formRevision: string) {
  if (!previous) return formRevision.trim() || "0";
  const last = Number.parseInt(previous.revision, 10);
  return Number.isFinite(last) ? String(last + 1) : formRevision.trim() || "0";
}

function addQualificationNode(file: WorkflowFile): WorkflowFile {
  const id = `qualification-${crypto.randomUUID().slice(0, 8)}`;
  const node = createDomainNode("qualification", id);
  const size = getNodeDefinition("qualification").defaultSize;
  const bottom = Object.values(file.layout.nodes).reduce(
    (max, layout) => Math.max(max, layout.y + (layout.height || 0)),
    0,
  );
  return {
    ...file,
    graph: { ...file.graph, nodes: [...file.graph.nodes, node] },
    layout: {
      ...file.layout,
      nodes: {
        ...file.layout.nodes,
        [id]: { nodeId: id, x: 0, y: bottom + 80, width: size.width, height: size.height },
      },
    },
  };
}

/**
 * Writes a Sales submission into a project: the Qualification Form (as the
 * Qualification card's own Save does) and the Job number on Project Start.
 * Nothing else in the project changes.
 */
export function applySalesIntake(
  input: WorkflowFile,
  intake: SalesIntake,
  submission?: SalesSubmission,
  historyEntry?: RevisionEntry,
): WorkflowFile {
  let file = qualificationNode(input) ? input : addQualificationNode(input);
  const node = qualificationNode(file)!;
  const form = compactQualificationForm101(normalizeQualificationForm101(intake.form101));
  const previous = qualificationOf(node);
  const history = historyEntry
    ? [...salesHistoryOf(previous), historyEntry].slice(-MAX_HISTORY)
    : undefined;
  const next: Qualification & {
    salesSubmission?: SalesSubmission;
    salesHistory?: RevisionEntry[];
  } = {
    ...previous,
    form101: {
      ...form,
      revision: submission?.revision ?? form.revision,
      updatedAt: submission?.at ?? new Date().toISOString(),
    },
    clientCategory: undefined,
    customerTier: undefined,
    customerHistory: undefined,
    plansAvailable: undefined,
    commercialPath: undefined,
    ...(submission ? { salesSubmission: submission } : {}),
    ...(history ? { salesHistory: history } : {}),
  };
  next.commercialPath = qualificationRoute(next);
  file = {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((item): DomainNode =>
        item.id === node.id ? { ...item, config: { ...item.config, qualification: next } } : item,
      ),
    },
  };

  const digits = normalizeJobNumber(intake.jobNumber);
  const start = file.graph.nodes.find((item) => item.type === "projectStart");
  if (start && digits !== workflowLegacyJobNumber(file)) {
    const projectId = digits
      ? buildProjectIdFromJobNumber(
          digits,
          String(start.customFields.projectId || ""),
          String(start.config?.serviceType || ""),
        )
      : "";
    file = applyNodeJobNumberToFile(file, start.id, { projectId });
  }
  return file;
}

/**
 * A project saved as a template: the same workflow with nothing that belongs
 * to one project (Qualification answers, Job number, Calendar dates, gate and
 * approval records).
 */
export function templateFromWorkflow(input: WorkflowFile): WorkflowFile {
  let file = clone(input);
  file.graph.nodes = file.graph.nodes.map((node) => {
    if (node.type !== "qualification") return node;
    const rest = { ...qualificationOf(node) } as Qualification & {
      salesSubmission?: unknown;
      salesHistory?: unknown;
    };
    delete rest.form101;
    delete rest.salesSubmission;
    delete rest.salesHistory;
    delete rest.techReview;
    return { ...node, config: { ...node.config, qualification: rest } };
  });
  const start = file.graph.nodes.find((node) => node.type === "projectStart");
  if (start && workflowLegacyJobNumber(file))
    file = applyNodeJobNumberToFile(file, start.id, { projectId: "" });
  if (file.calendar) file.calendar = { ...file.calendar, startDate: "", projectStartDate: "" };
  file.operations = normalizeProjectOperations(undefined, file.graph.metadata.name, "");
  return file;
}

/** A new project made from a template. */
export function projectFromTemplate(template: WorkflowFile, name: string): WorkflowFile {
  const file = clone(template);
  const now = new Date().toISOString();
  file.graph.metadata = {
    ...file.graph.metadata,
    name,
    status: "Draft",
    createdAt: now,
    updatedAt: now,
  };
  file.operations = normalizeProjectOperations(undefined, name, "");
  return file;
}

export const SALES_NEW_DRAFT_PREFIX = "new-";
export const isNewDraftKey = (key: string) => key.startsWith(SALES_NEW_DRAFT_PREFIX);

/** A Sales draft: what the form held when Sales last typed, before Submit. */
export type SalesDraft = {
  projectName?: string;
  jobNumber: string;
  form101: QualificationForm101;
  updatedAt?: string;
};
