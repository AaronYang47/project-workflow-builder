/**
 * Model for the L3 Release Conditions workspace: condition documents grouped
 * by category, chapter headings, process-map groups and dialog types.
 * Pure functions only; the page is components/workflow/release-conditions-workspace.tsx.
 */
import { formReferencesForCondition } from "@/lib/form-reference-catalog";
import { releaseConditionForms } from "@/lib/release-condition-forms";
import { fobYardSkip, orderHighLevelNodes } from "@/lib/high-level-workflow";
import { getL1FallbackColor } from "@/lib/node-layout";
import { type Condition, type DomainNode, type WorkflowFile } from "@/types/workflow";

export const conditionText = (condition: Condition, index: number) =>
  condition.label || condition.description || `Release condition ${index + 1}`;
export const chapterConditions = (node: DomainNode) => [
  ...node.conditions,
  ...(node.optionalConditions ?? []),
];
export const findChapterCondition = (
  node: DomainNode | undefined,
  id: string | undefined,
  index: number,
) =>
  node
    ? id
      ? chapterConditions(node).find((condition) => condition.id === id)
      : chapterConditions(node)[index]
    : undefined;
export type WorkspaceDocument = {
  id: string;
  title: string;
  code?: string;
  fileName?: string;
  dataUrl?: string;
  url?: string;
  checked?: boolean;
  required?: boolean;
  status?: string;
  notes?: string;
  category?: "legal" | "customer" | "supporting";
  formKind?: "customer-selection";
  [key: string]: unknown;
};
export type DocumentCategory = "legal" | "customer" | "supporting";
export type DocumentField = "legalDocuments" | "customerDocuments" | "supportingDocuments";
export function documentField(category: DocumentCategory): DocumentField {
  return category === "legal"
    ? "legalDocuments"
    : category === "customer"
      ? "customerDocuments"
      : "supportingDocuments";
}
export function categoryForField(field: DocumentField): DocumentCategory {
  return field === "legalDocuments"
    ? "legal"
    : field === "customerDocuments"
      ? "customer"
      : "supporting";
}
export const DOCUMENT_GROUPS = [
  { field: "legalDocuments", title: "Required Documents", tint: "indigo" },
  { field: "customerDocuments", title: "Customer Information", tint: "sky" },
  { field: "supportingDocuments", title: "Supporting Documents", tint: "emerald" },
] as const;
export function conditionDocuments(
  node: DomainNode,
  condition: Condition,
  field: (typeof DOCUMENT_GROUPS)[number]["field"],
): WorkspaceDocument[] {
  if (field === "legalDocuments") {
    return releaseConditionForms(node, condition).map((document) => ({
      ...document,
      id: document.id,
      title: document.title,
      checked: document.checked,
      required: document.required,
      status: document.status,
    }));
  }

  const conditionId = condition.id?.trim() || "default";
  const key = `${field}::release-condition::${conditionId}`;
  const raw =
    node.customFields?.[key] ??
    (node.conditions[0]?.id === condition.id ? node.customFields?.[field] : undefined);
  if (typeof raw !== "string")
    return formReferencesForCondition(node, condition)
      .filter((form) => form.category === categoryForField(field))
      .map((form) => ({
        id: `catalog-${form.category}-${form.code}-${condition.id || "default"}`,
        title: form.title,
        code: form.code,
        category: form.category,
        checked: false,
        required: form.category !== "supporting",
        status: form.category === "supporting" ? "Optional" : "Required",
      }));

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((document): document is WorkspaceDocument =>
        Boolean(
          document &&
          typeof document === "object" &&
          "id" in document &&
          typeof document.id === "string" &&
          "title" in document &&
          typeof document.title === "string",
        ),
      )
      .filter((document) => {
        if (field === "customerDocuments") {
          return (
            !document.id?.startsWith("cust-") &&
            document.fileName !== "Customer_Project_Spec_2026.pdf" &&
            document.fileName !== "Client_Signatory_Authorization.pdf"
          );
        }
        return (
          !document.id?.startsWith("supp-") &&
          document.fileName !== "Site_Foundation_Survey_Plan.pdf" &&
          document.fileName !== "Class_CD_Cost_Estimate_Model.xlsx"
        );
      });
  } catch {
    return [];
  }
}
export function conditionFormCount(node: DomainNode, condition: Condition) {
  return DOCUMENT_GROUPS.reduce(
    (count, group) => count + conditionDocuments(node, condition, group.field).length,
    0,
  );
}
export function departmentBoardHeading(node: DomainNode) {
  const stage = String(node.config.stage ?? "").trim();
  const title = node.title.trim();
  const titleChapter = title.match(/^chapter\s*(\d+)$/i)?.[1];
  const stageChapter = stage.match(/^(?:(?:chapter|department)\s*)?(\d+)$/i)?.[1];
  const chapterNumber = titleChapter || stageChapter;
  const rawDepartment = stageChapter
    ? ""
    : stage
        .replace(/^(?:department|chapter)\s*/i, "")
        .replace(/\s+department$/i, "")
        .trim();
  const rawName = rawDepartment || (!titleChapter ? title : "");
  const partiallyInvolved = /\s+partially\s+involved$/i.test(rawName);
  const departmentName = rawName
    .replace(/\s+partially\s+involved$/i, "")
    .replace(/^department\s*/i, "")
    .replace(/\s+department$/i, "")
    .trim();
  return {
    department:
      departmentName && !/^department$/i.test(departmentName)
        ? `${departmentName} Department${partiallyInvolved ? " Partially Involved" : ""}`
        : "Department",
    chapter: chapterNumber ? `CHAPTER ${chapterNumber.padStart(2, "0")}` : title,
  };
}
export type ProcessMapGroup = {
  id: string;
  kind: string;
  title: string;
  description: string;
  color: string;
  chapters: DomainNode[];
  /** Skipped because Final Close has FOB yard on. */
  skipped?: boolean;
};
export type DocumentDialogTarget = {
  chapterId: string;
  conditionId?: string;
  conditionIndex: number;
  category: DocumentCategory;
};
export type DocumentDialogFlow = "single" | "library-batch";
export function titleFromFileName(fileName: string) {
  const name = fileName.split(/[\\/]/).pop() || fileName;
  return name.replace(/\.[^.]+$/, "").trim() || name;
}
/** "PHASE 3 · CONSTRUCTION": the step's name, with its description when it has one. */
export function processStepName(group: ProcessMapGroup) {
  const title = group.title.trim();
  const description = group.description.trim();
  if (!description || description.toLowerCase() === title.toLowerCase()) return title;
  if (!title) return description;
  return `${title} · ${description}`;
}
export function chapterPhaseId(chapter: DomainNode, file: WorkflowFile) {
  const nodeById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const configPhaseId =
    typeof chapter.config.phaseId === "string" ? chapter.config.phaseId : undefined;
  if (configPhaseId && nodeById.get(configPhaseId)?.type === "phase") return configPhaseId;
  let parentId = file.layout.nodes[chapter.id]?.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeById.get(parentId);
    if (parent?.type === "phase") return parent.id;
    parentId = file.layout.nodes[parentId]?.parentId;
  }
  return undefined;
}
export function fitConditionText(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

/**
 * Groups Departments (L2 chapters) by process step for the process map: by
 * their L1 links when any exist, otherwise by the L2 phase that contains
 * them; Departments with no link go into a final "No process link" group.
 */
export function buildProcessMap(file: WorkflowFile, chapters: DomainNode[]) {
  const highLevel = file.highLevel?.graph;
  const orderedHighLevel = highLevel ? orderHighLevelNodes(highLevel.nodes, highLevel.edges) : [];
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const skippedSteps = highLevel ? fobYardSkip(highLevel).skippedNodeIds : new Set<string>();
  const highLevelGroups = orderedHighLevel.map((step, index) => {
    const linkedIds = step.linkedLayer2NodeIds ?? step.linkedDetailedNodeIds ?? [];
    const linkedChapters = linkedIds.flatMap((id) => {
      const chapter = chapterById.get(id);
      return chapter ? [chapter] : [];
    });
    return {
      id: step.id,
      kind: step.type,
      title: step.title,
      description: step.description,
      color:
        step.backgroundColor && step.backgroundColor !== "transparent"
          ? step.backgroundColor
          : getL1FallbackColor(step.title, index),
      chapters: linkedChapters,
      skipped: skippedSteps.has(step.id),
    } satisfies ProcessMapGroup;
  });
  const hasHighLevelDepartmentLinks = highLevelGroups.some((group) => group.chapters.length > 0);

  let groups: ProcessMapGroup[];
  if (hasHighLevelDepartmentLinks) {
    groups = highLevelGroups;
  } else {
    const phaseNodes = file.graph.nodes
      .filter((node) => node.type === "phase")
      .sort(
        (left, right) =>
          (file.layout.nodes[left.id]?.x ?? 0) - (file.layout.nodes[right.id]?.x ?? 0),
      );
    groups = phaseNodes.map((phase, index) => ({
      id: phase.id,
      kind: "phase",
      title: phase.title,
      description: phase.description,
      color: phase.color || getL1FallbackColor(phase.description || phase.title, index),
      chapters: chapters.filter((chapter) => chapterPhaseId(chapter, file) === phase.id),
    }));
  }

  const linkedChapterIds = new Set(
    groups.flatMap((group) => group.chapters.map((chapter) => chapter.id)),
  );
  const unlinkedChapters = chapters.filter((chapter) => !linkedChapterIds.has(chapter.id));
  if (unlinkedChapters.length) {
    groups = [
      ...groups,
      {
        id: "__unlinked-process-step__",
        kind: "unlinked",
        title: "No process link",
        description: "Assign this Department to an L1 step to place it in the process map.",
        color: "#64748b",
        chapters: unlinkedChapters,
      },
    ];
  }

  const locationsByChapter = new Map<string, Array<{ group: ProcessMapGroup; position: number }>>();
  for (const group of groups) {
    group.chapters.forEach((chapter, position) => {
      locationsByChapter.set(chapter.id, [
        ...(locationsByChapter.get(chapter.id) ?? []),
        { group, position },
      ]);
    });
  }
  return { groups, locationsByChapter };
}
