import type { WorkflowNodeType } from "@/types/workflow";
export type InspectorField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "color" | "boolean" | "select" | "tags";
  options?: string[];
  placeholder?: string;
  section: string;
  mask?: "digits";
  maxLength?: number;
  pattern?: string;
  readOnly?: boolean;
  visibleWhen?: { key: string; equals: string };
};
const common: InspectorField[] = [
  { key: "title", label: "Title", type: "text", section: "General" },
  {
    key: "description",
    label: "Description",
    type: "textarea",
    section: "General",
  },
  { key: "color", label: "Accent color", type: "color", section: "Appearance" },
];
const document: InspectorField[] = [
  {
    key: "config.document.abbreviation",
    label: "Abbreviation",
    type: "text",
    section: "Document details",
  },
];
const gate: InspectorField[] = [
  {
    key: "config.gateLabel",
    label: "Module label",
    type: "text",
    section: "Decision configuration",
  },
  {
    key: "config.gateIconKey",
    label: "Module icon",
    type: "select",
    options: [
      "activity",
      "document",
      "person",
      "building",
      "flag",
      "check",
      "settings",
      "box",
    ],
    section: "Appearance",
  },
  {
    key: "config.gateHeaderColor",
    label: "Header background",
    type: "color",
    section: "Appearance",
  },
  {
    key: "config.gateTitleColor",
    label: "Header title color",
    type: "color",
    section: "Appearance",
  },
  { key: "config.conditionsTitle", label: "Conditions heading", type: "text", section: "Interface text" },
  { key: "config.conditionsSubtitle", label: "Progress suffix", type: "text", section: "Interface text" },
  { key: "config.checklistTitle", label: "Checklist heading", type: "text", section: "Interface text" },
  { key: "config.checklistHint", label: "Checklist instruction", type: "text", section: "Interface text" },
  { key: "config.conditionLabel", label: "Condition item label", type: "text", section: "Interface text" },
  { key: "config.addConditionLabel", label: "Add condition button", type: "text", section: "Interface text" },
  { key: "config.documentsLabel", label: "Documents heading", type: "text", section: "Interface text" },
  { key: "config.addDocumentLabel", label: "Add document button", type: "text", section: "Interface text" },
  { key: "config.decisionTitle", label: "Decision heading", type: "text", section: "Interface text" },
  { key: "config.decisionSubtitle", label: "Decision subheading", type: "text", section: "Interface text" },
  { key: "config.departmentLabel", label: "Department field", type: "text", section: "Interface text" },
  { key: "config.approverLabel", label: "Approver field", type: "text", section: "Interface text" },
  { key: "config.detailsNeededLabel", label: "Incomplete status", type: "text", section: "Interface text" },
];
const general: InspectorField[] = [
  { key: "config.stage", label: "Stage", type: "text", section: "General" },
  {
    key: "config.iconKey",
    label: "Icon",
    type: "select",
    options: [
      "activity",
      "document",
      "person",
      "building",
      "flag",
      "check",
      "settings",
      "box",
    ],
    section: "Appearance",
  },
];
const configByType: Partial<Record<WorkflowNodeType, InspectorField[]>> = {
  general,
  projectStart: [
    ...general,
    {
      key: "config.serviceType",
      label: "Service type",
      type: "select",
      options: ["Standard", "Paid Service"],
      section: "Service details",
    },
    {
      key: "config.buildingCode",
      label: "Building code (B-XX)",
      type: "text",
      placeholder: "B-01",
      pattern: "^B-\\d{2}$",
      section: "Service details",
    },
    {
      key: "config.moduleCode",
      label: "Module code (M-XXX)",
      type: "text",
      placeholder: "M-001",
      pattern: "^M-\\d{3}$",
      section: "Service details",
    },
    {
      key: "customFields.projectId",
      label: "Project ID (L-YY-XXX or P-YY-XXX)",
      type: "text",
      placeholder: "L-26-001",
      pattern: "^[LP]-\\d{2}-\\d{3}$",
      section: "Project details",
    },
    {
      key: "customFields.legacyJobNumber",
      label: "Legacy Job Number (auto)",
      type: "text",
      placeholder: "26001",
      pattern: "^\\d{5}$",
      readOnly: true,
      section: "Project details",
    },
    {
      key: "customFields.nodeUuid",
      label: "UUID (auto)",
      type: "text",
      placeholder: "auto-generated",
      readOnly: true,
      section: "Project details",
    },
  ],
  document,
  gate,
};
export const getInspectorSchema = (type: WorkflowNodeType) =>
  [...common, ...(configByType[type] || [])].filter(
    (field, index, all) =>
      all.findIndex((candidate) => candidate.key === field.key) === index,
  );
