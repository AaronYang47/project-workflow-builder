import { clone } from "@/lib/clone";
import type { FalconCustomerProfile } from "@/lib/falcon-customer-intelligence";
import { createProjectWorkflow } from "@/lib/project-template";
import { LEGACY_JOB_NUMBER_PATTERN, buildProjectId, currentYearSuffix } from "@/lib/project-id";
import {
  normalizeSalesQualificationAnswers,
  salesQualificationIsComplete,
  type SalesQualificationAnswers,
} from "@/lib/sales-qualification";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

export const CUSTOMER_SELECTION_FORM_ID = "falcon-customer-selection-form";
export const CUSTOMER_SELECTION_FORM_FILE_NAME = "Customer_Selection_Form.json";
export const CUSTOMER_DOCS_FIELD = "customerDocuments::release-condition::project-id-required";

export type LeadCustomerSelection = {
  customerName: string;
  customerCategory: string;
  customerProfile: FalconCustomerProfile;
  customerForm: SalesQualificationAnswers;
};

export function normalizeLeadNumber(raw: string): string {
  const trimmed = String(raw || "").trim().toUpperCase();
  const canonical = trimmed.match(/^[LP]-(\d{2})-(\d{3})$/);
  if (canonical) return `${canonical[1]}${canonical[2]}`;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 5) return digits;
  if (digits.length === 3) return `${currentYearSuffix()}${digits.padStart(3, "0")}`;
  return "";
}

export function projectIdFromLeadNumber(leadNumber: string): string {
  const digits = normalizeLeadNumber(leadNumber);
  if (!LEGACY_JOB_NUMBER_PATTERN.test(digits)) return "";
  return buildProjectId(digits.slice(2), "L", digits.slice(0, 2));
}

function isQualificationDoc(doc: { id?: string; formKind?: string; fileName?: string; code?: string }) {
  const fileName = String(doc.fileName || "");
  return (
    doc.formKind === "customer-selection" ||
    doc.id === CUSTOMER_SELECTION_FORM_ID ||
    fileName === CUSTOMER_SELECTION_FORM_FILE_NAME ||
    /^Customer_Selection_Form\./i.test(fileName) ||
    String(doc.code || "").toUpperCase().startsWith("CUST-38")
  );
}

function customerSelectionDoc(selection: LeadCustomerSelection, existingId?: string) {
  const form = normalizeSalesQualificationAnswers(selection.customerForm);
  const name = selection.customerName || selection.customerProfile.organizationName;
  const complete = salesQualificationIsComplete(Boolean(name), form);
  return {
    id: existingId || CUSTOMER_SELECTION_FORM_ID,
    title: "Form",
    code: "CUST-38",
    fileName: CUSTOMER_SELECTION_FORM_FILE_NAME,
    category: "customer" as const,
    status: (complete ? "Verified" : "Required") as "Verified" | "Required",
    checked: complete,
    required: true,
    formKind: "customer-selection" as const,
    customerCategory: selection.customerCategory || selection.customerProfile.category,
    customerName: name,
    customerProfile: selection.customerProfile,
    customerForm: form,
    notes: `${name} · ${form.decisionAuthority || "Sales"} · ${form.siteMunicipality || form.siteStatus}`,
  };
}

function upsertCustomerDocs(node: DomainNode, selection: LeadCustomerSelection): DomainNode {
  const nextFields = { ...node.customFields };
  let placed = false;
  for (const [key, value] of Object.entries(nextFields)) {
    if (!key.startsWith("customerDocuments") || typeof value !== "string") continue;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) continue;
      const index = parsed.findIndex((doc: { id?: string; formKind?: string; fileName?: string; code?: string }) =>
        isQualificationDoc(doc),
      );
      if (index >= 0) {
        parsed[index] = {
          ...parsed[index],
          ...customerSelectionDoc(selection, String(parsed[index].id || "")),
        };
        nextFields[key] = JSON.stringify(parsed);
        placed = true;
      }
    } catch {
      // ignore damaged JSON
    }
  }
  if (!placed && node.type === "projectStart") {
    nextFields[CUSTOMER_DOCS_FIELD] = JSON.stringify([customerSelectionDoc(selection)]);
    placed = true;
  }
  if (!placed) return node;
  const nextDoc = customerSelectionDoc(selection);
  return {
    ...node,
    customFields: {
      ...nextFields,
      customerName: nextDoc.customerName,
      customerCompanyId: selection.customerProfile.companyId,
      customerCategory: nextDoc.customerCategory,
      customerContactName: selection.customerForm.decisionMakerName,
      customerSiteLocation: selection.customerForm.siteMunicipality,
      customerProjectType: selection.customerForm.designStage,
    },
  };
}

function createProjectStartNode(id: string, projectId: string, leadNumber: string): DomainNode {
  return {
    id,
    type: "projectStart",
    title: "Project Start",
    description: "Start the project and establish its project record.",
    color: "#2563a9",
    metadata: {},
    conditions: [
      {
        id: "project-id-required",
        label: "Job Number is entered",
        required: false,
        checked: Boolean(projectId),
        locked: true,
      },
    ],
    documents: [],
    criteria: [],
    customFields: {
      projectId,
      legacyJobNumber: leadNumber,
      nodeUuid: crypto.randomUUID(),
    },
    config: { serviceType: "Standard", buildingCode: "", moduleCode: "" },
  };
}

function ensureHighLevelStart(file: WorkflowFile, projectStartId: string): WorkflowFile {
  const highLevel = file.highLevel || {
    graph: { nodes: [], edges: [] },
    layout: { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } },
  };
  const existingStart = highLevel.graph.nodes.find((node) => node.type === "start");
  if (existingStart) {
    const linked = new Set(existingStart.linkedLayer2NodeIds || []);
    linked.add(projectStartId);
    return {
      ...file,
      highLevel: {
        ...highLevel,
        graph: {
          ...highLevel.graph,
          nodes: highLevel.graph.nodes.map((node) =>
            node.id === existingStart.id
              ? { ...node, linkedLayer2NodeIds: [...linked] }
              : node,
          ),
        },
      },
    };
  }
  const id = `high-level-start-${crypto.randomUUID().slice(0, 8)}`;
  return {
    ...file,
    highLevel: {
      ...highLevel,
      graph: {
        ...highLevel.graph,
        nodes: [
          {
            id,
            type: "start",
            title: "Start",
            description: "High-level process entry point",
            linkedLayer2NodeIds: [projectStartId],
          },
          ...highLevel.graph.nodes,
        ],
      },
      layout: {
        ...highLevel.layout,
        nodes: {
          ...highLevel.layout.nodes,
          [id]: { nodeId: id, x: 80, y: 120 },
        },
      },
    },
  };
}

export function applyLeadSelectionToWorkflow(
  file: WorkflowFile,
  leadNumber: string,
  selection: LeadCustomerSelection,
): WorkflowFile {
  const digits = normalizeLeadNumber(leadNumber);
  const projectId = projectIdFromLeadNumber(digits);
  const next = clone(file);
  const now = new Date().toISOString();
  next.graph.metadata = {
    ...next.graph.metadata,
    updatedAt: now,
  };

  let start = next.graph.nodes.find((node) => node.type === "projectStart");
  if (!start) {
    const id = `projectStart-${crypto.randomUUID().slice(0, 8)}`;
    start = createProjectStartNode(id, projectId, digits);
    next.graph.nodes = [start, ...next.graph.nodes];
    next.layout.nodes[id] = {
      nodeId: id,
      x: 80,
      y: 80,
      width: 384,
      height: 408,
      zIndex: 1,
    };
  } else {
    start = {
      ...start,
      customFields: {
        ...start.customFields,
        projectId: String(start.customFields.projectId || projectId),
        legacyJobNumber: String(start.customFields.legacyJobNumber || digits),
      },
      conditions: start.conditions || [],
    };
    next.graph.nodes = next.graph.nodes.map((node) =>
      node.id === start!.id ? start! : node,
    );
  }

  next.graph.nodes = next.graph.nodes.map((node) => upsertCustomerDocs(node, selection));
  const withForm = next.graph.nodes.find((node) => node.type === "projectStart") || start;
  return ensureHighLevelStart(next, withForm.id);
}

export function createLeadProjectWorkflow(
  leadNumber: string,
  selection: LeadCustomerSelection,
): WorkflowFile {
  const digits = normalizeLeadNumber(leadNumber);
  const name = selection.customerName || selection.customerProfile.organizationName || "New Project";
  const created = createProjectWorkflow(name, digits);
  return applyLeadSelectionToWorkflow(created, digits, selection);
}

export function extractLeadSelectionFromWorkflow(file: WorkflowFile | null | undefined) {
  const nodes = file?.graph.nodes || [];
  const ordered = [
    ...nodes.filter((node) => node.type !== "projectStart"),
    ...nodes.filter((node) => node.type === "projectStart"),
  ];
  for (const node of ordered) {
    for (const value of Object.values(node.customFields || {})) {
      if (typeof value !== "string") continue;
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) continue;
        const doc = parsed.find((item: { formKind?: string; id?: string; fileName?: string; code?: string; customerForm?: unknown }) =>
          isQualificationDoc(item) && item.customerForm,
        );
        if (doc?.customerForm) {
          return {
            customerName: String(doc.customerName || ""),
            customerCategory: String(doc.customerCategory || ""),
            customerProfile: doc.customerProfile as FalconCustomerProfile,
            customerForm: normalizeSalesQualificationAnswers(doc.customerForm),
          } satisfies LeadCustomerSelection;
        }
      } catch {
        // keep scanning
      }
    }
  }
  return null;
}
