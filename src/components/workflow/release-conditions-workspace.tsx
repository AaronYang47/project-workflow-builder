"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CloudUpload, Download, FileCheck2, FileUp, FolderArchive, GripVertical, ListChecks, MapPin, Pencil, Plus, Search, Trash2, Undo2, Redo2, X } from "lucide-react";
import { WorkflowLayerNavigation } from "./workflow-layer-navigation";
import { AuthGate } from "./auth-gate";
import { CloudProjectControls } from "./cloud-project-controls";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import { isReleaseConditionChapter, RELEASE_CONDITION_INBOX_ID } from "@/lib/release-condition-inbox";
import { downloadReleaseConditionTemplate, parseReleaseConditionExcel } from "@/lib/release-condition-excel";
import { fetchUploadedFilesFromR2, isFormReferenceRecord, type UploadedFileRecord, uploadFileToR2 } from "@/lib/file-storage";
import { formReferencesForCondition } from "@/lib/form-reference-catalog";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { orderReleaseConditionChapters } from "@/lib/release-condition-order";
import { conditionDurationLabel } from "@/lib/condition-duration";
import { getL1FallbackColor } from "@/lib/node-layout";
import { isCustomerSelectionForm } from "@/lib/falcon-customer-intelligence";
import { releaseConditionForms } from "@/lib/release-condition-forms";
import { type Condition, type DomainNode, type WorkflowFile } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { CollaboratorPresence } from "./collaborator-presence";
import { CollaborationControlOverlay } from "./collaboration-control-overlay";

const conditionText = (condition: Condition, index: number) =>
  condition.label || condition.description || `Release condition ${index + 1}`;

const chapterConditions = (node: DomainNode) => [...node.conditions, ...(node.optionalConditions ?? [])];
const findChapterCondition = (node: DomainNode | undefined, id: string | undefined, index: number) =>
  node ? id ? chapterConditions(node).find((condition) => condition.id === id) : chapterConditions(node)[index] : undefined;

type WorkspaceDocument = {
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

type DocumentCategory = "legal" | "customer" | "supporting";
type DocumentField = "legalDocuments" | "customerDocuments" | "supportingDocuments";

function documentField(category: DocumentCategory): DocumentField {
  return category === "legal" ? "legalDocuments" : category === "customer" ? "customerDocuments" : "supportingDocuments";
}

function categoryForField(field: DocumentField): DocumentCategory {
  return field === "legalDocuments" ? "legal" : field === "customerDocuments" ? "customer" : "supporting";
}

const DOCUMENT_GROUPS = [
  { field: "legalDocuments", title: "Legal Documents", tint: "indigo" },
  { field: "customerDocuments", title: "Customer Information", tint: "sky" },
  { field: "supportingDocuments", title: "Supporting Documents", tint: "emerald" },
] as const;

function conditionDocuments(node: DomainNode, condition: Condition, field: typeof DOCUMENT_GROUPS[number]["field"]): WorkspaceDocument[] {
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
  const raw = node.customFields?.[key] ?? (node.conditions[0]?.id === condition.id ? node.customFields?.[field] : undefined);
  if (typeof raw !== "string") return formReferencesForCondition(node, condition)
    .filter((form) => form.category === categoryForField(field))
    .map((form) => ({ id: `catalog-${form.category}-${form.code}-${condition.id || "default"}`, title: form.title, code: form.code, category: form.category, checked: false, required: form.category !== "supporting", status: form.category === "supporting" ? "Optional" : "Required" }));

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((document): document is WorkspaceDocument =>
      Boolean(document && typeof document === "object" && "id" in document && typeof document.id === "string" && "title" in document && typeof document.title === "string"),
    ).filter((document) => {
      if (field === "customerDocuments") {
        return !document.id?.startsWith("cust-") &&
          document.fileName !== "Customer_Project_Spec_2026.pdf" &&
          document.fileName !== "Client_Signatory_Authorization.pdf";
      }
      return !document.id?.startsWith("supp-") &&
        document.fileName !== "Site_Foundation_Survey_Plan.pdf" &&
        document.fileName !== "Class_CD_Cost_Estimate_Model.xlsx";
    });
  } catch {
    return [];
  }
}

function conditionFormCount(node: DomainNode, condition: Condition) {
  return DOCUMENT_GROUPS.reduce((count, group) => count + conditionDocuments(node, condition, group.field).length, 0);
}

function departmentBoardHeading(node: DomainNode) {
  const stage = String(node.config.stage ?? "").trim();
  const title = node.title.trim();
  const titleChapter = title.match(/^chapter\s*(\d+)$/i)?.[1];
  const stageChapter = stage.match(/^(?:(?:chapter|department)\s*)?(\d+)$/i)?.[1];
  const chapterNumber = titleChapter || stageChapter;
  const rawDepartment = stageChapter
    ? ""
    : stage.replace(/^(?:department|chapter)\s*/i, "").replace(/\s+department$/i, "").trim();
  const rawName = rawDepartment || (!titleChapter ? title : "");
  const partiallyInvolved = /\s+partially\s+involved$/i.test(rawName);
  const departmentName = rawName.replace(/\s+partially\s+involved$/i, "").replace(/^department\s*/i, "").replace(/\s+department$/i, "").trim();
  return {
    department: departmentName && !/^department$/i.test(departmentName)
      ? `${departmentName} Department${partiallyInvolved ? " Partially Involved" : ""}`
      : "Department",
    chapter: chapterNumber ? `CHAPTER ${chapterNumber.padStart(2, "0")}` : title,
  };
}

type ProcessMapGroup = {
  id: string;
  kind: string;
  title: string;
  description: string;
  color: string;
  chapters: DomainNode[];
};

type DocumentDialogTarget = {
  chapterId: string;
  conditionId?: string;
  conditionIndex: number;
  category: DocumentCategory;
};

type DocumentDialogFlow = "single" | "library-batch";

function titleFromFileName(fileName: string) {
  const name = fileName.split(/[\\/]/).pop() || fileName;
  return name.replace(/\.[^.]+$/, "").trim() || name;
}

function processStepName(group: ProcessMapGroup) {
  const description = group.description.trim();
  if (description) return description;
  return group.title.replace(/^phase\s*\d+$/i, "Phase").trim() || group.title;
}

function chapterPhaseId(chapter: DomainNode, file: WorkflowFile) {
  const nodeById = new Map(file.graph.nodes.map((node) => [node.id, node]));
  const configPhaseId = typeof chapter.config.phaseId === "string" ? chapter.config.phaseId : undefined;
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

function fitConditionText(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function ConditionTextArea({ value, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { fitConditionText(ref.current); }, [value]);
  return <textarea {...props} ref={ref} value={value} />;
}

export function ReleaseConditionsWorkspace() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDescription, setChapterDescription] = useState("");
  const [chapterOwnerId, setChapterOwnerId] = useState("");
  const [selectedProcessNodeId, setSelectedProcessNodeId] = useState<string | null>(null);
  const [selectedProcessConditionRef, setSelectedProcessCondition] = useState<{ id?: string; index: number } | null>(null);
  const [selectedProcessStepId, setSelectedProcessStepId] = useState<string | null>(null);
  const [documentsPopupOpen, setDocumentsPopupOpen] = useState(false);
  const [optionalEditorChapterId, setOptionalEditorChapterId] = useState<string | null>(null);
  const [optionalTitle, setOptionalTitle] = useState("");
  const [optionalDuration, setOptionalDuration] = useState("");
  const [optionalUnit, setOptionalUnit] = useState<"days" | "weeks">("days");
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelMessage, setExcelMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [documentDialogTarget, setDocumentDialogTarget] = useState<DocumentDialogTarget | null>(null);
  const [documentDialogFlow, setDocumentDialogFlow] = useState<DocumentDialogFlow>("single");
  const [documentLibrary, setDocumentLibrary] = useState<UploadedFileRecord[]>([]);
  const [documentMode, setDocumentMode] = useState<"custom" | "library" | "upload">("custom");
  const [selectedLibraryFileId, setSelectedLibraryFileId] = useState("");
  const [selectedLibraryFileIds, setSelectedLibraryFileIds] = useState<string[]>([]);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentRequired, setDocumentRequired] = useState(true);
  const [documentUploadFiles, setDocumentUploadFiles] = useState<File[]>([]);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const excelInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const file = useWorkflowStore((state) => state.file);
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));
  const collaborationRoomId = useCollaborationStore((state) => state.roomId);
  const collaborationEditorId = useCollaborationStore((state) => state.editorPeerId);
  const workflowHref = collaborationRoomId !== "local-only"
    ? `/?room=${encodeURIComponent(collaborationRoomId)}${collaborationEditorId ? `&editor=${encodeURIComponent(collaborationEditorId)}` : ""}`
    : "/";
  const hydrated = useWorkflowStore((state) => state.hydrated);
  const past = useWorkflowStore((state) => state.past);
  const future = useWorkflowStore((state) => state.future);
  const addLines = useWorkflowStore((state) => state.addReleaseConditionLines);
  const ensureReleaseConditionIds = useWorkflowStore((state) => state.ensureReleaseConditionIds);
  const importReleaseConditions = useWorkflowStore((state) => state.importReleaseConditions);
  const setInbox = useWorkflowStore((state) => state.setReleaseConditionInbox);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const addNode = useWorkflowStore((state) => state.addNode);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const updateHighLevelNode = useWorkflowStore((state) => state.updateHighLevelNode);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const inbox = file.releaseConditionInbox ?? [];

  const documentCategory = documentDialogTarget?.category;
  useEffect(() => {
    if (!documentCategory) return;
    let cancelled = false;
    void fetchUploadedFilesFromR2(documentCategory).then((files) => {
      if (!cancelled) setDocumentLibrary(files);
    });
    return () => { cancelled = true; };
  }, [documentCategory]);

  const openDocumentDialog = (chapter: DomainNode, condition: Condition, conditionIndex: number, category: DocumentCategory) => {
    const isOptional = (chapter.optionalConditions ?? []).some((item) => item.id === condition.id);
    if (isOptional && category !== "supporting") return;
    setDocumentDialogFlow("single");
    setDocumentMode("custom");
    setSelectedLibraryFileId("");
    setSelectedLibraryFileIds([]);
    setDocumentTitle("");
    setDocumentRequired(!isOptional);
    setDocumentUploadFiles([]);
    setDocumentError("");
    setDocumentMessage("");
    setDocumentDialogTarget({ chapterId: chapter.id, conditionId: condition.id, conditionIndex, category });
  };

  const openLibraryBatchDialog = (chapter: DomainNode, condition: Condition, conditionIndex: number, category: DocumentCategory) => {
    const isOptional = (chapter.optionalConditions ?? []).some((item) => item.id === condition.id);
    if (isOptional && category !== "supporting") return;
    setDocumentDialogFlow("library-batch");
    setSelectedLibraryFileId("");
    setSelectedLibraryFileIds([]);
    setDocumentTitle("");
    setDocumentRequired(!isOptional);
    setDocumentUploadFiles([]);
    setDocumentError("");
    setDocumentMessage("");
    setDocumentDialogTarget({ chapterId: chapter.id, conditionId: condition.id, conditionIndex, category });
  };

  const persistConditionDocuments = (chapterId: string, conditionId: string | undefined, conditionIndex: number, field: DocumentField, documents: WorkspaceDocument[]) => {
    const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapterId);
    if (!latest) return;
    const condition = findChapterCondition(latest, conditionId, conditionIndex);
    if (!condition) return;
    if ((latest.optionalConditions ?? []).some((item) => item.id === condition.id) && field !== "supportingDocuments") return;
    const key = `${field}::release-condition::${condition.id?.trim() || "default"}`;
    updateNode(latest.id, {
      customFields: { ...latest.customFields, [key]: JSON.stringify(documents) },
    });
  };

  const removeConditionDocument = (chapter: DomainNode, conditionId: string | undefined, conditionIndex: number, field: DocumentField, documentId: string) => {
    const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapter.id);
    const condition = findChapterCondition(latest, conditionId, conditionIndex);
    if (!latest || !condition) return;
    const documents = conditionDocuments(latest, condition, field).filter((document) => document.id !== documentId);
    persistConditionDocuments(latest.id, condition.id, conditionIndex, field, documents);
  };

  const addConditionDocument = async () => {
    const target = documentDialogTarget;
    if (!target || (documentMode !== "upload" && !documentTitle.trim())) return;
    setDocumentBusy(true);
    setDocumentError("");
    try {
      const field = documentField(target.category);
      const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === target.chapterId);
      const condition = findChapterCondition(latest, target.conditionId, target.conditionIndex);
      if (!latest || !condition) throw new Error("This release condition is no longer available.");
      const isOptional = (latest.optionalConditions ?? []).some((item) => item.id === condition.id);
      if (isOptional && target.category !== "supporting") throw new Error("Optional conditions accept supporting documents only.");
      const required = isOptional ? false : documentRequired;
      const prefix = target.category === "legal" ? "LEG" : target.category === "customer" ? "CUST" : "SUP";
      const documents = conditionDocuments(latest, condition, field);
      if (documentMode === "upload") {
        if (!documentUploadFiles.length) throw new Error("Choose one or more files to upload.");
        const additions: WorkspaceDocument[] = [];
        for (const upload of documentUploadFiles) {
          const title = titleFromFileName(upload.name);
          const attachment = await uploadFileToR2(upload, { category: target.category, title, description: "" });
          additions.push({
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            code: `${prefix}-${Math.floor(10 + Math.random() * 90)}`,
            fileName: attachment.fileName,
            dataUrl: attachment.dataUrl,
            url: attachment.url,
            notes: attachment.description,
            category: target.category,
            status: required ? "Required" : "Optional",
            checked: false,
            required,
          });
        }
        persistConditionDocuments(latest.id, condition.id, target.conditionIndex, field, [...documents, ...additions]);
      } else {
        let attachment: UploadedFileRecord | undefined;
        if (documentMode === "library") {
          attachment = documentLibrary.find((item) => item.id === selectedLibraryFileId);
          if (!attachment) throw new Error("Select a file from Library or choose a custom entry.");
        }
        const document: WorkspaceDocument = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: documentTitle.trim(),
          code: `${prefix}-${Math.floor(10 + Math.random() * 90)}`,
          ...(attachment && !isFormReferenceRecord(attachment) ? { fileName: attachment.fileName, dataUrl: attachment.dataUrl, url: attachment.url, notes: attachment.description } : {}),
          category: target.category,
          status: required ? "Required" : "Optional",
          checked: false,
          required,
          ...(isCustomerSelectionForm(attachment ?? {}) ? { formKind: "customer-selection" as const } : {}),
        };
        const retained = attachment && !isFormReferenceRecord(attachment)
          ? documents.filter((item) => !(item.id.startsWith("catalog-") && item.title.toLowerCase() === document.title.toLowerCase()))
          : documents;
        persistConditionDocuments(latest.id, condition.id, target.conditionIndex, field, [...retained, document]);
      }
      setDocumentDialogTarget(null);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Could not add this document.");
    } finally {
      setDocumentBusy(false);
    }
  };

  const addLibraryForms = () => {
    const target = documentDialogTarget;
    if (!target || !selectedLibraryFileIds.length) return;
    const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === target.chapterId);
    const condition = findChapterCondition(latest, target.conditionId, target.conditionIndex);
    if (!latest || !condition) {
      setDocumentError("This release condition is no longer available.");
      return;
    }
    const isOptional = (latest.optionalConditions ?? []).some((item) => item.id === condition.id);
    if (isOptional && target.category !== "supporting") {
      setDocumentError("Optional conditions accept supporting documents only.");
      return;
    }
    const required = isOptional ? false : documentRequired;
    const field = documentField(target.category);
    const current = conditionDocuments(latest, condition, field);
    const selected = documentLibrary.filter((item) => selectedLibraryFileIds.includes(item.id));
    const replacingTitles = new Set(selected.filter((item) => !isFormReferenceRecord(item)).map((item) => item.title.toLowerCase()));
    const retained = current.filter((item) => !(item.id.startsWith("catalog-") && replacingTitles.has(item.title.toLowerCase())));
    const existing = new Set(retained.map((document) => document.title.toLowerCase()));
    const additions = selected.filter((item) => {
      const key = item.title.toLowerCase();
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    }).map((attachment) => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: attachment.title || titleFromFileName(attachment.fileName),
      ...(isFormReferenceRecord(attachment) ? { code: attachment.fileName } : { fileName: attachment.fileName, dataUrl: attachment.dataUrl, url: attachment.url, notes: attachment.description }),
      category: target.category,
      status: required ? "Required" : "Optional",
      checked: false,
      required,
      ...(isCustomerSelectionForm(attachment) ? { formKind: "customer-selection" as const } : {}),
    } satisfies WorkspaceDocument));
    persistConditionDocuments(latest.id, condition.id, target.conditionIndex, field, [...retained, ...additions]);
    const skipped = selected.length - additions.length;
    setDocumentMessage(`${additions.length} form${additions.length === 1 ? "" : "s"} added${skipped ? ` · ${skipped} already existed` : ""}.`);
    setSelectedLibraryFileIds([]);
  };

  const chapters = useMemo(() => file.graph.nodes.filter(isReleaseConditionChapter), [file.graph.nodes]);
  const orderedChapters = useMemo(() => orderReleaseConditionChapters(chapters, file), [chapters, file]);
  const needle = query.trim().toLowerCase();
  const boardChapters = needle ? [...orderedChapters].sort((left, right) =>
    Number(right.conditions.some((condition, index) => conditionText(condition, index).toLowerCase().includes(needle))) -
    Number(left.conditions.some((condition, index) => conditionText(condition, index).toLowerCase().includes(needle)))) : orderedChapters;
  const visibleInbox = inbox.map((condition, index) => ({ condition, index }))
    .filter(({ condition, index }) => !needle || conditionText(condition, index).toLowerCase().includes(needle));
  const assignedCount = chapters.reduce((count, chapter) => count + chapter.conditions.length, 0);
  const matchCount = visibleInbox.length + chapters.reduce((count, chapter) => count + chapter.conditions.filter((condition, index) =>
    !needle || conditionText(condition, index).toLowerCase().includes(needle)).length, 0);
  const processMap = useMemo(() => {
    const highLevel = file.highLevel?.graph;
    const orderedHighLevel = highLevel
      ? orderHighLevelNodes(highLevel.nodes, highLevel.edges)
      : [];
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
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
        color: step.backgroundColor && step.backgroundColor !== "transparent"
          ? step.backgroundColor
          : getL1FallbackColor(step.title, index),
        chapters: linkedChapters,
      } satisfies ProcessMapGroup;
    });
    const hasHighLevelDepartmentLinks = highLevelGroups.some((group) => group.chapters.length > 0);

    let groups: ProcessMapGroup[];
    if (hasHighLevelDepartmentLinks) {
      groups = highLevelGroups;
    } else {
      const phaseNodes = file.graph.nodes.filter((node) => node.type === "phase")
        .sort((left, right) => (file.layout.nodes[left.id]?.x ?? 0) - (file.layout.nodes[right.id]?.x ?? 0));
      groups = phaseNodes.map((phase, index) => ({
        id: phase.id,
        kind: "phase",
        title: phase.title,
        description: phase.description,
        color: phase.color || getL1FallbackColor(phase.description || phase.title, index),
        chapters: chapters.filter((chapter) => chapterPhaseId(chapter, file) === phase.id),
      }));
    }

    const linkedChapterIds = new Set(groups.flatMap((group) => group.chapters.map((chapter) => chapter.id)));
    const unlinkedChapters = chapters.filter((chapter) => !linkedChapterIds.has(chapter.id));
    if (unlinkedChapters.length) {
      groups = [...groups, {
        id: "__unlinked-process-step__",
        kind: "unlinked",
        title: "No process link",
        description: "Assign this Department to an L1 step to place it in the process map.",
        color: "#64748b",
        chapters: unlinkedChapters,
      }];
    }

    const locationsByChapter = new Map<string, Array<{ group: ProcessMapGroup; position: number }>>();
    for (const group of groups) {
      group.chapters.forEach((chapter, position) => {
        locationsByChapter.set(chapter.id, [...(locationsByChapter.get(chapter.id) ?? []), { group, position }]);
      });
    }
    return { groups, locationsByChapter };
  }, [chapters, file]);

  const selectProcessLocation = (nodeId: string | null, condition?: { id?: string; index: number } | null, stepId?: string | null, scrollToBoard = false) => {
    setSelectedProcessNodeId(nodeId);
    setSelectedProcessCondition(condition ?? null);
    const location = nodeId ? processMap.locationsByChapter.get(nodeId)?.find((entry) => !stepId || entry.group.id === stepId) : undefined;
    setSelectedProcessStepId(stepId ?? location?.group.id ?? null);
    if (scrollToBoard && nodeId) {
      window.requestAnimationFrame(() => {
        const target = Array.from(document.querySelectorAll<HTMLElement>("[data-release-condition-chapter-id]"))
          .find((element) => element.dataset.releaseConditionChapterId === nodeId);
        target?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      });
    }
  };
  const selectedProcessChapter = chapters.find((chapter) => chapter.id === selectedProcessNodeId);
  const selectedProcessLocation = selectedProcessNodeId
    ? processMap.locationsByChapter.get(selectedProcessNodeId)?.find((entry) => entry.group.id === selectedProcessStepId)
      ?? processMap.locationsByChapter.get(selectedProcessNodeId)?.[0]
    : undefined;
  const selectedProcessConditionIndex = selectedProcessConditionRef && selectedProcessChapter
    ? chapterConditions(selectedProcessChapter).findIndex((condition, index) => selectedProcessConditionRef.id
      ? condition.id === selectedProcessConditionRef.id
      : index === selectedProcessConditionRef.index)
    : -1;
  const selectedProcessCondition = selectedProcessConditionIndex >= 0 && selectedProcessChapter
    ? chapterConditions(selectedProcessChapter)[selectedProcessConditionIndex]
    : undefined;
  const selectedProcessConditionIsOptional = Boolean(selectedProcessChapter && selectedProcessConditionIndex >= selectedProcessChapter.conditions.length);

  const addDraft = () => {
    if (addLines(draft)) {
      setDraft("");
      setMobileAddOpen(false);
    }
  };
  const downloadTemplate = async () => {
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      ensureReleaseConditionIds();
      await downloadReleaseConditionTemplate(useWorkflowStore.getState().file);
    } catch {
      setExcelMessage({ text: "Could not create the Excel template. Please try again.", error: true });
    } finally {
      setExcelBusy(false);
    }
  };
  const importExcel = async (upload?: File) => {
    if (!upload) return;
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      if (!upload.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx Excel file.");
      if (upload.size > 10 * 1024 * 1024) throw new Error("The Excel file must be smaller than 10 MB.");
      const rows = await parseReleaseConditionExcel(await upload.arrayBuffer());
      const latestChapters = useWorkflowStore.getState().file.graph.nodes.filter(isReleaseConditionChapter);
      const byName = new Map<string, string | null>();
      const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
      for (const chapter of latestChapters) {
        const key = normalize(chapter.title);
        byName.set(key, byName.has(key) ? null : chapter.id);
      }
      const unmatched = new Set<string>();
      const prepared = rows.map((row) => {
        const chapterId = row.chapterName ? byName.get(normalize(row.chapterName)) : undefined;
        if (row.chapterName && !chapterId) {
          if (row.conditionId) throw new Error(`Department “${row.chapterName}” was not found. Fix the name before updating existing conditions.`);
          unmatched.add(row.chapterName);
        }
        return { label: row.label, chapterId: chapterId || undefined, conditionId: row.conditionId || undefined };
      });
      const result = importReleaseConditions(prepared);
      const detail = unmatched.size ? ` Unmatched Departments: ${[...unmatched].join(", ")}; those conditions are unassigned.` : "";
      setExcelMessage({ text: `Processed ${rows.length} rows: ${result.addedAssigned} added to Departments, ${result.addedUnassigned} added to Unassigned, ${result.updated} updated, ${result.moved} moved, ${result.unchanged} unchanged.${detail}`, error: false });
      setMobileAddOpen(false);
    } catch (error) {
      setExcelMessage({ text: error instanceof Error ? error.message : "Could not read the Excel file.", error: true });
    } finally {
      setExcelBusy(false);
      if (excelInput.current) excelInput.current.value = "";
    }
  };
  const setInboxCondition = (index: number, patch: Partial<Condition>) => {
    const latest = useWorkflowStore.getState().file.releaseConditionInbox ?? [];
    const conditionId = inbox[index]?.id;
    const currentIndex = conditionId ? latest.findIndex((condition) => condition.id === conditionId) : index;
    if (currentIndex < 0 || !latest[currentIndex]) return;
    setInbox(latest.map((condition, current) => current === currentIndex ? { ...condition, ...patch } : condition));
  };
  const createOptionalCondition = (chapterId: string) => {
    if (!canEditWorkflow || !optionalTitle.trim()) return;
    const duration = Number(optionalDuration);
    if (!Number.isInteger(duration) || duration <= 0) return;
    const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapterId);
    if (!latest) return;
    updateNode(chapterId, { optionalConditions: [...(latest.optionalConditions ?? []), {
      id: `optional-${crypto.randomUUID()}`, label: optionalTitle.trim(), duration, durationUnit: optionalUnit,
    }] });
    setOptionalEditorChapterId(null);
    setOptionalTitle("");
    setOptionalDuration("");
    setOptionalUnit("days");
  };
  const updateOptionalCondition = (chapterId: string, conditionId: string | undefined, patch: Partial<Condition>) => {
    if (!canEditWorkflow || !conditionId) return;
    const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapterId);
    if (!latest) return;
    updateNode(chapterId, { optionalConditions: (latest.optionalConditions ?? []).map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition) });
  };
  const removeOptionalCondition = (chapterId: string, conditionId: string | undefined) => {
    if (!canEditWorkflow || !conditionId) return;
    const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapterId);
    if (!latest) return;
    const customFields = { ...latest.customFields };
    delete customFields[`supportingDocuments::release-condition::${conditionId}`];
    updateNode(chapterId, { optionalConditions: (latest.optionalConditions ?? []).filter((condition) => condition.id !== conditionId), customFields });
    if (selectedProcessCondition?.id === conditionId) setDocumentsPopupOpen(false);
  };
  const move = (sourceId: string, sourceIndex: number, targetId: string, targetIndex?: number) => {
    const target = chapters.find((chapter) => chapter.id === targetId);
    if (!target && targetId !== RELEASE_CONDITION_INBOX_ID) return;
    moveCondition(sourceId, sourceIndex, targetId, targetIndex ?? (target?.conditions.length ?? inbox.length));
  };
  const startCreateChapter = () => {
    setEditingChapterId(null);
    setChapterTitle("");
    setChapterDescription("");
    setChapterOwnerId("");
    setCreatingChapter(true);
  };
  const startEditChapter = (chapter: DomainNode) => {
    const owner = file.highLevel?.graph.nodes.find((node) => (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).includes(chapter.id));
    setCreatingChapter(false);
    setEditingChapterId(chapter.id);
    setChapterTitle(chapter.title);
    setChapterDescription(chapter.description ?? "");
    setChapterOwnerId(owner?.id ?? "");
  };
  const saveChapter = () => {
    const title = chapterTitle.trim();
    if (!title) return;
    const currentFile = useWorkflowStore.getState().file;
    let id = editingChapterId;
    if (creatingChapter) {
      const layouts = Object.values(currentFile.layout.nodes);
      const right = Math.max(0, ...layouts.map((layout) => layout.x + layout.width));
      id = addNode("general", { x: right + 80, y: 220 });
    }
    if (!id) return;
    updateNode(id, { title, description: chapterDescription.trim() });
    const latest = useWorkflowStore.getState().file;
    for (const node of latest.highLevel?.graph.nodes ?? []) {
      const links = node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [];
      if (node.id === chapterOwnerId && !links.includes(id)) {
        updateHighLevelNode(node.id, { linkedLayer2NodeIds: [...links, id] });
      } else if (node.id !== chapterOwnerId && links.includes(id)) {
        updateHighLevelNode(node.id, { linkedLayer2NodeIds: links.filter((linkedId) => linkedId !== id) });
      }
    }
    setCreatingChapter(false);
    setEditingChapterId(null);
    if (id) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-release-condition-drop-node-id="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "end", behavior: "smooth" }));
  };
  const chapterForm = (mode: "create" | "edit") => (
    <form aria-label={mode === "create" ? "Create Department" : "Edit Department"} onSubmit={(event) => { event.preventDefault(); saveChapter(); }} className="space-y-2 rounded-lg border border-primary/35 bg-background p-3 shadow-md">
      <label className="block text-[10px] font-semibold text-muted-foreground">Department name
        <input autoFocus aria-label="Department name" value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} maxLength={100} className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary" />
      </label>
      <label className="block text-[10px] font-semibold text-muted-foreground">Department description
        <textarea aria-label="Department description" value={chapterDescription} onChange={(event) => setChapterDescription(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary" />
      </label>
      <label className="block text-[10px] font-semibold text-muted-foreground">Show under L1
        <select aria-label="L1 Department owner" value={chapterOwnerId} onChange={(event) => setChapterOwnerId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary">
          <option value="">No L1 link</option>
          {(file.highLevel?.graph.nodes ?? []).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => { setCreatingChapter(false); setEditingChapterId(null); }} className="rounded-md border px-2.5 py-1.5 text-[11px]">Cancel</button>
        <button type="submit" disabled={!chapterTitle.trim()} className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40">{mode === "create" ? "Add Department" : "Save Department"}</button>
      </div>
    </form>
  );

  return (
    <AuthGate>
      <main className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b bg-panel px-3 sm:min-h-16 sm:gap-3 sm:px-4 lg:px-6">
          <Link href={workflowHref} aria-label="Back to workflow" className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary sm:flex"><ListChecks className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold lg:text-base">L3 · Conditions</h1>
            <p className="truncate text-[11px] text-muted-foreground">{file.graph.metadata.name || "Current project"} · Plan conditions across Departments</p>
          </div>
          <div className="hidden shrink-0 items-center gap-2 text-[11px] sm:flex">
            <span className="rounded-full border bg-background px-2.5 py-1">{inbox.length} unassigned</span>
            <span className="rounded-full border bg-background px-2.5 py-1">{assignedCount} assigned</span>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={undo} disabled={!past.length} aria-label="Undo condition change" className="flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground disabled:opacity-40"><Undo2 className="size-4" /></button>
            <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo condition change" className="flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground disabled:opacity-40"><Redo2 className="size-4" /></button>
          </div>
          <CloudProjectControls saveOnly readOnly={!canEditWorkflow} />
          <CollaboratorPresence />
          <div className="w-full pb-2"><WorkflowLayerNavigation currentLayer="L3" /></div>
        </header>
        <CollaborationControlOverlay />

        {!hydrated ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading release conditions…</div> : (
          <div className="flex min-h-0 flex-1 flex-row">
            <section
              aria-label="Unassigned release conditions"
              data-release-condition-drop-node-id={RELEASE_CONDITION_INBOX_ID}
              data-release-condition-count={inbox.length}
              className="flex h-full w-[40vw] min-w-[135px] max-w-[180px] shrink-0 flex-col border-r bg-panel lg:w-[350px] lg:max-w-none"
            >
              <div className="shrink-0 border-b p-2 lg:p-4">
                <div className="flex items-start justify-between gap-1 lg:items-center lg:gap-2">
                  <div className="min-w-0"><h2 className="text-xs font-bold leading-4 lg:text-sm">Unassigned conditions</h2><p className="mt-0.5 hidden text-[11px] text-muted-foreground lg:block">Paste one condition per line.</p></div>
                  <div className="flex shrink-0 flex-col items-center gap-1 lg:flex-row lg:gap-2"><span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary lg:px-2 lg:text-xs">{inbox.length}</span><button type="button" aria-label="Add or import conditions" aria-expanded={mobileAddOpen} onClick={() => setMobileAddOpen(true)} className="flex size-8 items-center justify-center rounded-lg border text-primary lg:hidden"><Plus className="size-4" /></button></div>
                </div>
                {mobileAddOpen ? <button type="button" aria-label="Dismiss add or import panel" onClick={() => setMobileAddOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" /> : null}
                <div className={mobileAddOpen ? "fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border bg-panel p-4 shadow-2xl lg:static lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" : "hidden lg:block"}>
                <div className="flex items-center justify-between lg:hidden"><h3 className="text-sm font-bold">Add or import conditions</h3><button type="button" aria-label="Close add or import panel" onClick={() => setMobileAddOpen(false)} className="flex size-9 items-center justify-center rounded-lg border"><Plus className="size-4 rotate-45" /></button></div>
                <textarea
                  aria-label="Enter release conditions, one per line"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addDraft(); }}
                  placeholder={"Permit drawing approved\nProduct data sheet received\nSite review complete"}
                  rows={6}
                  className="mt-3 w-full resize-none rounded-lg border bg-background px-3 py-2 text-xs leading-5 outline-none focus:border-primary"
                />
                <button type="button" onClick={addDraft} disabled={!draft.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-45">
                  <Plus className="size-4" /> Add conditions
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={downloadTemplate} disabled={excelBusy} className="flex items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-[11px] font-semibold hover:border-primary/60 disabled:opacity-50"><Download className="size-3.5" /> Excel template</button>
                  <button type="button" onClick={() => excelInput.current?.click()} disabled={excelBusy} className="flex items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-[11px] font-semibold hover:border-primary/60 disabled:opacity-50"><FileUp className="size-3.5" /> Import Excel</button>
                  <input ref={excelInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Select release conditions Excel file" onChange={(event) => { void importExcel(event.target.files?.[0]); }} className="sr-only" />
                </div>
                </div>
                {excelMessage ? <p role={excelMessage.error ? "alert" : "status"} className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-4 ${excelMessage.error ? "border-destructive/50 text-destructive" : "border-emerald-500/40 text-emerald-400"}`}>{excelMessage.text}</p> : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 p-2 pb-1 lg:p-3 lg:pb-2">
                  <label className="relative block">
                    <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground lg:left-2.5 lg:size-4" />
                    <input aria-label="Search release conditions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-full min-w-0 rounded-lg border bg-background pl-7 pr-2 text-[11px] outline-none focus:border-primary lg:pl-9 lg:pr-3 lg:text-xs" />
                  </label>
                  {needle ? <p className="mt-1 text-[10px] text-muted-foreground">{matchCount} matching conditions across this project</p> : null}
                </div>
                <div data-release-condition-list className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-4 scroll-thin lg:px-3">
                  {visibleInbox.map(({ condition, index }) => (
                    <div key={condition.id || index} data-release-condition-index={index} data-release-condition-node-id={RELEASE_CONDITION_INBOX_ID} role="group" aria-label={`Unassigned release condition ${index + 1}`} className="rounded-lg border bg-card p-1.5 shadow-xs lg:p-2.5">
                      <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:gap-2">
                        <button type="button" aria-label={`Drag unassigned release condition ${index + 1}`} disabled={!chapters.length} onPointerDown={(event) => beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, { nodeId: RELEASE_CONDITION_INBOX_ID, index, label: conditionText(condition, index) }, (target) => move(RELEASE_CONDITION_INBOX_ID, index, target.nodeId, target.index))} className="flex size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 lg:size-7"><GripVertical className="size-4" /></button>
                        <ConditionTextArea aria-label={`Unassigned condition text ${index + 1}`} value={condition.label ?? condition.description ?? `Release condition ${index + 1}`} onChange={(event) => setInboxCondition(index, { label: event.target.value })} onBlur={(event) => { const label = event.target.value.trim(); if (label && label !== condition.label) setInboxCondition(index, { label }); }} rows={1} className="min-w-0 flex-1 basis-[calc(100%-32px)] resize-none overflow-hidden bg-transparent text-[11px] leading-4 outline-none lg:basis-auto lg:text-xs lg:leading-5" />
                        <button type="button" aria-label={`Delete unassigned release condition ${index + 1}`} onClick={() => setInbox(inbox.filter((_, current) => current !== index))} className="ml-auto flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:ml-0 lg:size-7"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {!visibleInbox.length ? <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{needle ? "No unassigned conditions match this search." : "Drag conditions from a Department here to unassign them."}</p> : null}
                </div>
              </div>
            </section>

            <section aria-label="Department condition board" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 justify-end border-b px-3 py-2 lg:px-5">
                <button type="button" onClick={startCreateChapter} aria-label="New Department" className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-3.5" /> Department</button>
              </div>
              <section aria-label="Process map" className="shrink-0 border-b bg-muted/10">
                <div className="scroll-thin overflow-x-auto px-3 py-2.5 lg:px-5">
                  {processMap.groups.length ? (
                    <div className="flex min-w-max items-stretch gap-2">
                      {processMap.groups.map((group, groupIndex) => {
                        const kindLabel = group.kind === "start" ? "START" : group.kind === "end" ? "FINISH" : group.kind === "primaryGate" ? "GATE" : group.kind === "unlinked" ? "UNLINKED" : "PHASE";
                        return (
                          <div key={group.id} className="flex items-stretch gap-2">
                            <div className="w-[210px] shrink-0 overflow-hidden rounded-lg border bg-background shadow-xs" style={{ borderColor: `${group.color}66` }}>
                              <button type="button" aria-pressed={selectedProcessStepId === group.id && !selectedProcessNodeId} onClick={() => selectProcessLocation(null, null, group.id)} className={`flex w-full flex-col items-start border-l-[3px] px-2.5 py-2 text-left transition ${selectedProcessStepId === group.id && !selectedProcessNodeId ? "process-selection-glow" : "hover:bg-muted/50"}`} style={{ borderLeftColor: group.color }}>
                                <span className="text-[8px] font-black uppercase tracking-[0.13em]" style={{ color: group.color }}>{kindLabel}</span>
                                <span className="mt-0.5 w-full whitespace-normal break-words text-[11px] font-bold leading-4" title={processStepName(group)}>{processStepName(group)}</span>
                              </button>
                              <div className="space-y-1 border-t p-1.5">
                                {group.chapters.length ? group.chapters.map((chapter) => {
                                  const heading = departmentBoardHeading(chapter);
                                  const isSelected = selectedProcessNodeId === chapter.id && selectedProcessStepId === group.id;
                                  return (
                                    <button key={chapter.id} type="button" aria-pressed={isSelected} onClick={() => selectProcessLocation(chapter.id, null, group.id, true)} className={`flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-left transition ${isSelected ? "process-selection-glow" : "hover:border-primary/55 hover:bg-primary/[0.04]"}`} style={{ borderColor: isSelected ? undefined : `${group.color}55`, backgroundColor: isSelected ? undefined : `${group.color}0d` }}>
                                      <span className="min-w-0"><span className="block truncate text-[10px] font-semibold" title={heading.department}>{heading.department}</span><span className="block truncate text-[8px] text-muted-foreground" title={heading.chapter}>{heading.chapter}</span></span>
                                      {chapter.conditions.length ? <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground">{chapter.conditions.length} RC</span> : null}
                                    </button>
                                  );
                                }) : <p className="px-1 py-2 text-center text-[9px] text-muted-foreground">No linked departments</p>}
                              </div>
                            </div>
                            {groupIndex < processMap.groups.length - 1 ? <ArrowRight aria-hidden className="mt-8 size-4 shrink-0 self-start text-muted-foreground/60" /> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="rounded-md border border-dashed bg-background px-3 py-2 text-[10px] text-muted-foreground">Add process phases and link Departments to show their locations here.</p>}
                </div>
                {selectedProcessNodeId || selectedProcessStepId ? <div aria-live="polite" className="flex min-h-10 items-center gap-2 border-t bg-primary/[0.035] px-3 py-2 lg:px-5">
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 text-[10px] leading-4">
                    <span className="mr-1.5 font-bold uppercase tracking-wide text-primary">Process location</span>
                    {selectedProcessChapter && selectedProcessLocation ? (() => {
                      const heading = departmentBoardHeading(selectedProcessChapter);
                      const processGroups = processMap.groups.filter((group) => group.kind !== "unlinked");
                      const stepIndex = processGroups.findIndex((group) => group.id === selectedProcessLocation.group.id);
                      const group = selectedProcessLocation.group;
                      const locationLabel = group.kind === "unlinked"
                        ? "Not linked to an L1 process step"
                        : `Step ${stepIndex + 1} of ${processGroups.length} · ${processStepName(group)}`;
                      const conditionIndex = selectedProcessCondition
                        ? selectedProcessConditionIndex
                        : -1;
                      const selectedConditionLabel = conditionIndex >= 0 && selectedProcessCondition
                        ? conditionText(selectedProcessCondition, conditionIndex)
                        : "";
                      return <><span className="font-semibold text-foreground">{locationLabel}</span><span className="text-muted-foreground"> · </span><span className="font-semibold text-foreground">{heading.department} · {heading.chapter}</span>{selectedConditionLabel ? <><span className="text-muted-foreground"> · Form / RC: </span><span className="font-medium text-foreground">{selectedConditionLabel}</span></> : null}</>;
                    })() : selectedProcessStepId ? (() => {
                      const group = processMap.groups.find((item) => item.id === selectedProcessStepId);
                      const processGroups = processMap.groups.filter((item) => item.kind !== "unlinked");
                      const stepIndex = processGroups.findIndex((item) => item.id === selectedProcessStepId);
                      return group ? <span className="font-semibold text-foreground">{group.kind === "unlinked" ? group.title : `Step ${stepIndex + 1} of ${processGroups.length} · ${processStepName(group)}`} · Select a Department to see its forms</span> : <span className="text-muted-foreground">Select a department or form to see its process position.</span>;
                    })() : <span className="text-muted-foreground">Select a department or form to see its process position.</span>}
                  </div>
                </div> : null}
              </section>
              {creatingChapter ? <div className="shrink-0 border-b p-3 lg:p-4">{chapterForm("create")}</div> : null}
              {chapters.length ? (
                <div data-release-condition-board className="scroll-thin flex min-h-0 flex-1 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain p-2 sm:gap-4 sm:p-4 lg:p-5">
                  {boardChapters.map((chapter) => {
                    const visible = chapter.conditions.map((condition, index) => ({ condition, index }))
                      .filter(({ condition, index }) => !needle || conditionText(condition, index).toLowerCase().includes(needle) || DOCUMENT_GROUPS.some((group) => conditionDocuments(chapter, condition, group.field).some((document) => `${document.title} ${document.fileName ?? ""}`.toLowerCase().includes(needle))));
                    const visibleOptional = (chapter.optionalConditions ?? []).map((condition, index) => ({ condition, index }))
                      .filter(({ condition, index }) => !needle || conditionText(condition, index).toLowerCase().includes(needle));
                    const heading = departmentBoardHeading(chapter);
                    return (
                      <div key={chapter.id} role="group" data-release-condition-chapter data-release-condition-chapter-id={chapter.id} data-release-condition-drop-node-id={chapter.id} data-release-condition-count={chapter.conditions.length} aria-label={`${heading.department}, ${heading.chapter}`} style={{ width: "fit-content", minWidth: "min(320px, 84vw)", maxWidth: "min(460px, 92vw)" }} className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/70 shadow-sm transition ${selectedProcessNodeId === chapter.id ? "process-selection-glow" : ""}`}>
                        <div className="shrink-0 border-b bg-primary/[0.06] px-3 py-3">
                          <div className="flex items-center justify-between gap-2"><button type="button" aria-pressed={selectedProcessNodeId === chapter.id && !selectedProcessConditionRef} onClick={() => selectProcessLocation(chapter.id)} className="min-w-0 flex-1 text-left"><h3 className="truncate text-sm font-bold" title={heading.department}>{heading.department}</h3><span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground" title={chapter.title}>{heading.chapter}</span></button><div className="flex shrink-0 items-center gap-1">{chapter.type === "general" ? <button type="button" aria-label={`Edit ${chapter.title} Department`} onClick={() => startEditChapter(chapter)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"><Pencil className="size-3.5" /></button> : null}<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{chapter.conditions.length}</span></div></div>
                        </div>
                        {editingChapterId === chapter.id ? <div className="shrink-0 p-2">{chapterForm("edit")}</div> : null}
                        <section aria-label="Release conditions" className="flex min-h-0 flex-1 flex-col p-3">
                          <header className="mb-2 flex shrink-0 items-center justify-between gap-2 border-b pb-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Release Conditions</h4>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">{visible.length}{needle ? ` / ${chapter.conditions.length}` : ""}</span>
                          </header>
                          <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                            {visible.map(({ condition, index }) => {
                              const formsCount = conditionFormCount(chapter, condition);
                              const selected = selectedProcessNodeId === chapter.id && (selectedProcessConditionRef?.id ? selectedProcessConditionRef.id === condition.id : selectedProcessConditionRef?.index === index);
                              return (
                                <div key={condition.id || index} data-release-condition-index={index} data-release-condition-node-id={chapter.id} role="group" aria-label={`Release condition ${index + 1}: ${conditionText(condition, index)}`} className={`flex min-w-0 items-stretch overflow-hidden rounded-lg border transition ${selected ? "border-primary bg-primary/[0.08] ring-1 ring-primary/30 shadow-sm" : "bg-background/70 hover:border-primary/45 hover:bg-background"}`}>
                                  <button type="button" aria-label={`Drag release condition ${index + 1}`} onPointerDown={(event) => beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, { nodeId: chapter.id, index, label: conditionText(condition, index) }, (target) => move(chapter.id, index, target.nodeId, target.index))} className="flex w-8 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground hover:bg-primary/10"><GripVertical className="size-3.5" /></button>
                                  <button type="button" aria-pressed={selected} onClick={() => { selectProcessLocation(chapter.id, { id: condition.id, index }); setDocumentsPopupOpen(true); }} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-2.5 text-left">
                                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                                    <span className="min-w-0 flex-1"><span className="block break-words text-[11px] font-semibold leading-4 text-foreground">{conditionText(condition, index)}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">Release condition{conditionDurationLabel(condition) ? ` · ${conditionDurationLabel(condition)}` : ""}</span></span>
                                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${formsCount ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{formsCount} {formsCount === 1 ? "form" : "forms"}</span>
                                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/70" />
                                  </button>
                                </div>
                              );
                            })}
                            {!visible.length ? <p className="rounded-lg border border-dashed p-4 text-center text-[10px] leading-4 text-muted-foreground">{needle ? "No release conditions or forms match this search." : "No release conditions in this Department."}</p> : null}
                          </div>
                        </section>
                        <section aria-label={`Optional conditions for ${heading.department} ${heading.chapter}`} className="flex max-h-[45%] min-h-0 shrink-0 flex-col border-t px-3 py-2">
                          <header className="mb-2 flex shrink-0 items-center justify-between gap-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Optional Conditions <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{(chapter.optionalConditions ?? []).length}</span></h4>
                            {canEditWorkflow ? <button type="button" aria-label={`Add Optional Condition to ${heading.department} ${heading.chapter}`} onClick={() => { setOptionalEditorChapterId(chapter.id); setOptionalTitle(""); setOptionalDuration(""); setOptionalUnit("days"); }} className="flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-semibold text-primary hover:bg-primary/10"><Plus className="size-3" /> Add Optional Condition</button> : null}
                          </header>
                          {optionalEditorChapterId === chapter.id ? <form aria-label={`New optional condition for ${heading.department} ${heading.chapter}`} onSubmit={(event) => { event.preventDefault(); createOptionalCondition(chapter.id); }} className="mb-2 grid shrink-0 gap-1.5 rounded-lg border bg-background/70 p-2">
                            <input aria-label="Optional condition name" value={optionalTitle} onChange={(event) => setOptionalTitle(event.target.value)} placeholder="Optional condition name" className="h-8 rounded border bg-background px-2 text-[11px]" required />
                            <div className="flex gap-1.5"><input aria-label="Optional condition duration" type="number" min="1" step="1" value={optionalDuration} onChange={(event) => setOptionalDuration(event.target.value)} placeholder="Time needed" className="h-8 min-w-0 flex-1 rounded border bg-background px-2 text-[11px]" required /><select aria-label="Optional condition duration unit" value={optionalUnit} onChange={(event) => setOptionalUnit(event.target.value as "days" | "weeks")} className="h-8 rounded border bg-background px-2 text-[11px]"><option value="days">Days</option><option value="weeks">Weeks</option></select></div>
                            <div className="flex justify-end gap-1.5"><button type="button" onClick={() => setOptionalEditorChapterId(null)} className="rounded border px-2 py-1 text-[10px]">Cancel</button><button type="submit" className="rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Save Optional Condition</button></div>
                          </form> : null}
                          <div className="scroll-thin min-h-0 space-y-1.5 overflow-y-auto pr-1">
                            {visibleOptional.map(({ condition, index }) => {
                              return <div key={condition.id || index} role="group" aria-label={`Optional condition: ${conditionText(condition, index)}`} className="rounded-lg border bg-background/70 p-2">
                                <div className="flex items-start gap-1.5"><span className="min-w-0 flex-1 text-left text-[11px] font-semibold text-foreground">{conditionText(condition, index)}</span>{canEditWorkflow ? <button type="button" aria-label={`Remove optional condition ${conditionText(condition, index)}`} onClick={() => removeOptionalCondition(chapter.id, condition.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button> : null}</div>
                                <div className="mt-1.5 flex items-center gap-1.5"><input aria-label={`Time needed for ${conditionText(condition, index)}`} type="number" min="1" step="1" value={condition.duration ?? ""} disabled={!canEditWorkflow} onChange={(event) => { const value = event.target.valueAsNumber; updateOptionalCondition(chapter.id, condition.id, { duration: Number.isInteger(value) && value > 0 ? value : undefined }); }} className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-[10px]" /><select aria-label={`Time unit for ${conditionText(condition, index)}`} value={condition.durationUnit || "days"} disabled={!canEditWorkflow} onChange={(event) => updateOptionalCondition(chapter.id, condition.id, { durationUnit: event.target.value as "days" | "weeks" })} className="h-7 rounded border bg-background px-1 text-[10px]"><option value="days">Days</option><option value="weeks">Weeks</option></select></div>
                              </div>;
                            })}
                            {!visibleOptional.length ? <p className="rounded border border-dashed p-2 text-center text-[9px] text-muted-foreground">{needle ? "No optional conditions match this search." : "No optional conditions."}</p> : null}
                          </div>
                        </section>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><ListChecks className="size-9 text-muted-foreground" /><p className="text-sm font-semibold">No Departments yet</p><p className="max-w-sm text-xs text-muted-foreground">Use + Department above to create your first Department.</p></div>}
            </section>
          </div>
        )}
        {documentsPopupOpen && selectedProcessChapter && selectedProcessCondition ? (() => {
          const chapter = selectedProcessChapter;
          const condition = selectedProcessCondition;
          const conditionIndex = selectedProcessConditionIndex;
          const heading = departmentBoardHeading(chapter);
          const documentColumns = DOCUMENT_GROUPS.filter((group) => !selectedProcessConditionIsOptional || group.field === "supportingDocuments").map((group) => ({
            ...group,
            documents: conditionDocuments(chapter, condition, group.field).filter((document) => {
              if (!needle || conditionText(condition, conditionIndex).toLowerCase().includes(needle)) return true;
              return `${document.title} ${document.fileName ?? ""}`.toLowerCase().includes(needle);
            }),
          }));
          return (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentsPopupOpen(false); }}>
              <section role="dialog" aria-modal="true" aria-labelledby="release-condition-forms-title" className="flex max-h-[88dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/50 bg-background/65 shadow-2xl backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55 dark:border-white/15">
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/40 bg-background/35 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4 dark:border-white/10">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">{heading.department} · {heading.chapter}</p>
                    <h2 id="release-condition-forms-title" className="mt-1 truncate text-sm font-bold sm:text-base">{conditionText(condition, conditionIndex)}</h2>
                    <p className="mt-1 text-[10px] text-muted-foreground">{selectedProcessConditionIsOptional ? "Supporting documents for this optional condition" : "Forms linked to this release condition"}</p>
                  </div>
                  {canEditWorkflow && !selectedProcessConditionIsOptional ? <Link href={`${workflowHref}${workflowHref.includes("?") ? "&" : "?"}executionNode=${encodeURIComponent(chapter.id)}&condition=${encodeURIComponent(condition.id || "")}`} className="shrink-0 rounded border px-2 py-1 text-[10px] font-semibold text-primary">Forms & execution details</Link> : null}
                  <button type="button" aria-label="Close forms window" onClick={() => setDocumentsPopupOpen(false)} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/40 bg-background/45 text-muted-foreground transition hover:bg-background/75 hover:text-foreground dark:border-white/10"><X className="size-4" /></button>
                </header>
                <div className={`scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-5 ${selectedProcessConditionIsOptional ? "" : "md:grid-cols-3"}`}>
                  {documentColumns.map((column) => {
                    const colors = column.tint === "indigo"
                      ? { border: "border-indigo-500/30", header: "bg-indigo-500/[0.09] text-indigo-700 dark:text-indigo-300", badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", hover: "hover:border-indigo-500/45" }
                      : column.tint === "sky"
                        ? { border: "border-sky-500/30", header: "bg-sky-500/[0.09] text-sky-700 dark:text-sky-300", badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300", hover: "hover:border-sky-500/45" }
                        : { border: "border-emerald-500/30", header: "bg-emerald-500/[0.09] text-emerald-700 dark:text-emerald-300", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", hover: "hover:border-emerald-500/45" };
                    const completed = column.documents.filter((document) => document.checked).length;
                    const category = categoryForField(column.field);
                    return (
                      <section key={column.field} aria-label={column.title} className={`flex min-h-52 min-w-0 flex-col overflow-hidden rounded-xl border bg-background/35 backdrop-blur-xl ${colors.border}`}>
                        <header className={`flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10 ${colors.header}`}>
                          <h3 className="min-w-0 text-[11px] font-bold leading-4">{column.title}</h3>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${colors.badge}`}>{completed}/{column.documents.length}</span>
                            <button type="button" onClick={() => openDocumentDialog(chapter, condition, conditionIndex, category)} aria-label={`Add ${column.title}`} title={`Add ${column.title}`} className="flex size-6 items-center justify-center rounded text-current transition hover:bg-background/70"><Plus className="size-3.5" /></button>
                          </div>
                        </header>
                        <button type="button" onClick={() => openLibraryBatchDialog(chapter, condition, conditionIndex, category)} aria-label={`Add Forms from Library to ${column.title}`} className="mx-2 mt-2 flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-white/50 bg-background/35 px-2 py-1.5 text-[9px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary dark:border-white/15"><FolderArchive className="size-3" /> Add Forms from Library</button>
                        <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                          {column.documents.map((document) => (
                            <div key={document.id || document.title} className={`flex min-w-0 items-stretch rounded-lg border bg-background/50 ${colors.hover}`}>
                              <div className="min-w-0 flex-1 px-2.5 py-2">
                                <p className="break-words text-[10px] font-semibold leading-4 text-foreground">{document.title}</p>
                                {document.fileName ? <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{document.fileName}</p> : <p className="mt-0.5 text-[9px] text-muted-foreground">Custom entry · no attached file</p>}
                                <span className={`mt-1 inline-flex rounded px-1 py-0.5 text-[8px] font-bold uppercase ${document.checked ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : document.required === false ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{document.checked ? "Done" : document.required === false ? "Optional" : "Required"}</span>
                              </div>
                              <button type="button" aria-label={`Remove ${document.title}`} title="Remove form from this release condition" onClick={() => removeConditionDocument(chapter, condition.id, conditionIndex, column.field, document.id)} className="flex w-8 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                            </div>
                          ))}
                          {!column.documents.length ? <p className="rounded-lg border border-dashed border-white/50 px-2 py-4 text-center text-[9px] leading-4 text-muted-foreground dark:border-white/15">No forms added.</p> : null}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            </div>
          );
        })() : null}
        {documentDialogTarget ? (() => {
          const targetChapter = file.graph.nodes.find((node) => node.id === documentDialogTarget.chapterId);
          const targetCondition = findChapterCondition(targetChapter, documentDialogTarget.conditionId, documentDialogTarget.conditionIndex);
          const targetIsOptional = Boolean(targetChapter?.optionalConditions?.some((condition) => condition.id === targetCondition?.id));
          const categoryTitle = documentDialogTarget.category === "legal"
            ? "Legal Document"
            : documentDialogTarget.category === "customer"
              ? "Customer Information Form"
              : "Supporting Document";
          const selectedLibraryFile = documentLibrary.find((document) => document.id === selectedLibraryFileId);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !documentBusy) setDocumentDialogTarget(null); }}>
              <section role="dialog" aria-modal="true" aria-labelledby="add-chapter-document-title" className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
                <header className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-4 py-3">
                  <div className="min-w-0">
                    <h2 id="add-chapter-document-title" className="text-sm font-bold">{documentDialogFlow === "library-batch" ? "Add Forms from Library" : `Add ${categoryTitle}`}</h2>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{targetChapter ? departmentBoardHeading(targetChapter).department : "Department"}</p>
                  </div>
                  <button type="button" aria-label="Close add document dialog" disabled={documentBusy} onClick={() => setDocumentDialogTarget(null)} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
                </header>
                {documentDialogFlow === "library-batch" ? <>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {targetIsOptional ? <p className="text-[11px] font-semibold">Optional condition · {targetCondition?.label}</p> : <label className="block text-[11px] font-semibold">Release condition
                      <select aria-label="Choose release condition for forms" value={documentDialogTarget.conditionIndex} onChange={(event) => {
                        const conditionIndex = Number(event.target.value);
                        const condition = targetChapter?.conditions[conditionIndex];
                        if (condition) { setDocumentDialogTarget({ ...documentDialogTarget, conditionId: condition.id, conditionIndex }); setDocumentMessage(""); setDocumentError(""); }
                      }} className="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary">
                        {targetChapter?.conditions.map((condition, index) => <option key={condition.id || index} value={index}>{conditionText(condition, index)}</option>)}
                      </select>
                    </label>}
                    <p className="text-[10px] text-muted-foreground">Select one or more files from the L3 library for this release condition.</p>
                    {!targetIsOptional ? <fieldset>
                      <legend className="mb-1.5 text-[11px] font-semibold">Requirement level</legend>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" aria-pressed={documentRequired} onClick={() => setDocumentRequired(true)} className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${documentRequired ? "border-amber-500 bg-amber-500/10 text-amber-700" : "bg-background text-muted-foreground"}`}>Required</button>
                        <button type="button" aria-pressed={!documentRequired} onClick={() => setDocumentRequired(false)} className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${!documentRequired ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}>Optional</button>
                      </div>
                    </fieldset> : null}
                    <div className="space-y-1.5">
                      {documentLibrary.map((document) => {
                        const checked = selectedLibraryFileIds.includes(document.id);
                        return <label key={document.id} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-[11px] transition ${checked ? "border-primary bg-primary/5" : "bg-background hover:border-primary/40"}`}>
                          <input type="checkbox" checked={checked} onChange={(event) => setSelectedLibraryFileIds((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id))} className="size-3.5 accent-primary" />
                          <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{document.title || titleFromFileName(document.fileName)}</span><span className="block truncate text-[9px] text-muted-foreground">{document.fileName}</span></span>
                          {document.fileSize ? <span className="shrink-0 text-[9px] text-muted-foreground">{(document.fileSize / 1024).toFixed(0)} KB</span> : null}
                        </label>;
                      })}
                      {!documentLibrary.length ? <p className="rounded-md border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">No files in this category yet. Upload files with the + button first.</p> : null}
                    </div>
                    {documentError ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">{documentError}</p> : null}
                    {documentMessage ? <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">{documentMessage}</p> : null}
                  </div>
                  <footer className="flex shrink-0 justify-between gap-2 border-t bg-muted/20 px-4 py-3">
                    <span className="self-center text-[10px] text-muted-foreground">{selectedLibraryFileIds.length} selected</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDocumentDialogTarget(null)} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold">Close</button>
                      <button type="button" disabled={!selectedLibraryFileIds.length || !targetCondition} onClick={addLibraryForms} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-45"><Plus className="size-3.5" /> Add selected forms</button>
                    </div>
                  </footer>
                </> : <>
                <div className="min-h-0 space-y-4 overflow-y-auto p-4">
                  {targetIsOptional ? <p className="text-[11px] font-semibold">Optional condition · {targetCondition?.label}</p> : <label className="block text-[11px] font-semibold">Release condition
                    <select aria-label="Choose release condition for document" value={documentDialogTarget.conditionIndex} onChange={(event) => {
                      const conditionIndex = Number(event.target.value);
                      const condition = targetChapter?.conditions[conditionIndex];
                      if (condition) setDocumentDialogTarget({ ...documentDialogTarget, conditionId: condition.id, conditionIndex });
                    }} className="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary">
                      {targetChapter?.conditions.map((condition, index) => <option key={condition.id || index} value={index}>{conditionText(condition, index)}</option>)}
                    </select>
                  </label>}

                  <fieldset>
                    <legend className="mb-1.5 text-[11px] font-semibold">Document source</legend>
                    <div className="grid gap-1.5">
                      <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] ${documentMode === "custom" ? "border-primary bg-primary/5" : "bg-background"}`}>
                        <input type="radio" name="chapter-document-source" checked={documentMode === "custom"} onChange={() => setDocumentMode("custom")} className="accent-primary" />
                        Custom entry without attached file
                      </label>
                      <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] ${documentMode === "library" ? "border-primary bg-primary/5" : "bg-background"}`}>
                        <input type="radio" name="chapter-document-source" checked={documentMode === "library"} onChange={() => { setDocumentMode("library"); if (selectedLibraryFile) setDocumentTitle(selectedLibraryFile.title); }} className="accent-primary" />
                        Choose an existing file from Library
                      </label>
                      {documentMode === "library" ? <select aria-label="Choose file from Library" value={selectedLibraryFileId} onChange={(event) => {
                        setSelectedLibraryFileId(event.target.value);
                        const selected = documentLibrary.find((document) => document.id === event.target.value);
                        if (selected) setDocumentTitle(selected.title);
                      }} className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary">
                        <option value="">Select a file from Library</option>
                        {documentLibrary.map((document) => <option key={document.id} value={document.id}>{document.title} · {document.fileName}</option>)}
                      </select> : null}
                      <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] ${documentMode === "upload" ? "border-primary bg-primary/5" : "bg-background"}`}>
                        <input type="radio" name="chapter-document-source" checked={documentMode === "upload"} onChange={() => setDocumentMode("upload")} className="accent-primary" />
                        Upload a file from this computer
                      </label>
                      {documentMode === "upload" ? <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-[11px] text-muted-foreground hover:border-primary/50">
                        <input ref={documentInput} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.png,.jpg,.jpeg,.json" aria-label="Choose documents to upload" onChange={(event) => {
                          const selected = Array.from(event.target.files ?? []);
                          setDocumentUploadFiles(selected);
                          if (selected.length === 1) setDocumentTitle(titleFromFileName(selected[0].name));
                        }} className="sr-only" />
                        {documentUploadFiles.length ? <FileCheck2 className="size-4 shrink-0 text-emerald-600" /> : <CloudUpload className="size-4 shrink-0" />}
                        <span className="min-w-0 truncate">{documentUploadFiles.length ? `${documentUploadFiles.length} file${documentUploadFiles.length === 1 ? "" : "s"} selected · names will be taken from filenames` : "Choose one or more files to upload to Library"}</span>
                      </label> : null}
                    </div>
                  </fieldset>

                  {documentMode !== "upload" ? <label className="block text-[11px] font-semibold">Display title in L3
                    <input aria-label="Document title" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Enter a document name" className="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary" />
                  </label> : documentUploadFiles.length ? <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                    {documentUploadFiles.map((upload) => <div key={`${upload.name}-${upload.size}-${upload.lastModified}`} className="flex min-w-0 items-center gap-2 text-[10px]"><FileCheck2 className="size-3.5 shrink-0 text-emerald-600" /><span className="min-w-0 flex-1 truncate font-medium">{titleFromFileName(upload.name)}</span><span className="shrink-0 text-muted-foreground">{(upload.size / 1024).toFixed(0)} KB</span></div>)}
                  </div> : null}

                  {!targetIsOptional ? <fieldset>
                    <legend className="mb-1.5 text-[11px] font-semibold">Requirement level</legend>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" aria-pressed={documentRequired} onClick={() => setDocumentRequired(true)} className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${documentRequired ? "border-amber-500 bg-amber-500/10 text-amber-700" : "bg-background text-muted-foreground"}`}>Required</button>
                      <button type="button" aria-pressed={!documentRequired} onClick={() => setDocumentRequired(false)} className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${!documentRequired ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}>Optional</button>
                    </div>
                  </fieldset> : null}
                  {documentError ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">{documentError}</p> : null}
                  {documentMessage ? <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">{documentMessage}</p> : null}
                  {!targetCondition ? <p role="alert" className="text-[11px] text-destructive">Choose a valid release condition before adding this document.</p> : null}
                </div>
                <footer className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-4 py-3">
                  <button type="button" disabled={documentBusy} onClick={() => setDocumentDialogTarget(null)} className="rounded-md border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={documentBusy || (documentMode !== "upload" && !documentTitle.trim()) || !targetCondition || (documentMode === "library" && !selectedLibraryFile) || (documentMode === "upload" && !documentUploadFiles.length)} onClick={() => void addConditionDocument()} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-45">
                    {documentBusy ? <CloudUpload className="size-3.5 animate-pulse" /> : <Plus className="size-3.5" />}
                    {documentBusy ? "Saving…" : documentMode === "upload" && documentUploadFiles.length > 1 ? `Upload ${documentUploadFiles.length} files to L3` : "Add to L3"}
                  </button>
                </footer>
                </>}
              </section>
            </div>
          );
        })() : null}
      </main>
    </AuthGate>
  );
}
