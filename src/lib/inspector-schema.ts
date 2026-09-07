import { readPath } from "@/lib/object-path";
import type { DomainNode, WorkflowNodeType } from "@/types/workflow";

export function conditionInspectorKey(
  nodeId: string,
  conditionId: string | undefined,
  index: number,
) {
  return `condition:${nodeId}:${conditionId ?? index}`;
}

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

export function isInspectorFieldVisible(field: InspectorField, node: DomainNode) {
  if (!field.visibleWhen) return true;
  return (
    String(readPath(node, field.visibleWhen.key) || "") ===
    field.visibleWhen.equals
  );
}
