"use client";

import { CloudUpload, FileCheck2, Plus, X } from "lucide-react";
import {
  fetchUploadedFilesFromR2,
  isFormReferenceRecord,
  type UploadedFileRecord,
  uploadFileToR2,
} from "@/lib/file-storage";
import { isCustomerSelectionForm } from "@/lib/falcon-customer-intelligence";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  conditionText,
  findChapterCondition,
  type WorkspaceDocument,
  documentField,
  conditionDocuments,
  departmentBoardHeading,
  type DocumentDialogTarget,
  type DocumentDialogFlow,
  titleFromFileName,
} from "@/lib/release-conditions-workspace-model";
import { useEffect, useRef, useState } from "react";
import { saveConditionDocuments } from "./condition-documents";

export type DocumentDialogRequest = {
  target: DocumentDialogTarget;
  flow: DocumentDialogFlow;
  /** Optional conditions only take optional documents. */
  required: boolean;
};

/** Add one document (custom, from Library or uploaded) or several Library forms to a release condition. */
export function AddDocumentDialog({
  request,
  onClose,
}: {
  request: DocumentDialogRequest;
  onClose: () => void;
}) {
  const file = useWorkflowStore((state) => state.file);
  const [documentDialogTarget, setTarget] = useState<DocumentDialogTarget>(request.target);
  // Choosing another condition keeps the dialog open; clearing the target closes it.
  const setDocumentDialogTarget = (target: DocumentDialogTarget | null) =>
    target ? setTarget(target) : onClose();
  const documentDialogFlow = request.flow;
  const [documentLibrary, setDocumentLibrary] = useState<UploadedFileRecord[]>([]);
  const [documentMode, setDocumentMode] = useState<"custom" | "library" | "upload">("custom");
  const [selectedLibraryFileId, setSelectedLibraryFileId] = useState("");
  const [selectedLibraryFileIds, setSelectedLibraryFileIds] = useState<string[]>([]);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentRequired, setDocumentRequired] = useState(request.required);
  const [documentUploadFiles, setDocumentUploadFiles] = useState<File[]>([]);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const documentInput = useRef<HTMLInputElement>(null);

  const documentCategory = documentDialogTarget.category;
  useEffect(() => {
    let cancelled = false;
    void fetchUploadedFilesFromR2(documentCategory).then((files) => {
      if (!cancelled) setDocumentLibrary(files);
    });
    return () => {
      cancelled = true;
    };
  }, [documentCategory]);

  const addConditionDocument = async () => {
    const target = documentDialogTarget;
    if (!target || (documentMode !== "upload" && !documentTitle.trim())) return;
    setDocumentBusy(true);
    setDocumentError("");
    try {
      const field = documentField(target.category);
      const latest = useWorkflowStore
        .getState()
        .file.graph.nodes.find((node) => node.id === target.chapterId);
      const condition = findChapterCondition(latest, target.conditionId, target.conditionIndex);
      if (!latest || !condition) throw new Error("This step is no longer available.");
      const isOptional = (latest.optionalConditions ?? []).some((item) => item.id === condition.id);
      const required = isOptional ? false : documentRequired;
      const prefix =
        target.category === "legal" ? "LEG" : target.category === "customer" ? "CUST" : "SUP";
      const documents = conditionDocuments(latest, condition, field);
      if (documentMode === "upload") {
        if (!documentUploadFiles.length) throw new Error("Choose one or more files to upload.");
        const additions: WorkspaceDocument[] = [];
        for (const upload of documentUploadFiles) {
          const title = titleFromFileName(upload.name);
          const attachment = await uploadFileToR2(upload, {
            category: target.category,
            title,
            description: "",
          });
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
        saveConditionDocuments(latest.id, condition.id, target.conditionIndex, field, [
          ...documents,
          ...additions,
        ]);
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
          ...(attachment && !isFormReferenceRecord(attachment)
            ? {
                fileName: attachment.fileName,
                dataUrl: attachment.dataUrl,
                url: attachment.url,
                notes: attachment.description,
              }
            : {}),
          category: target.category,
          status: required ? "Required" : "Optional",
          checked: false,
          required,
          ...(isCustomerSelectionForm(attachment ?? {})
            ? { formKind: "customer-selection" as const }
            : {}),
        };
        const retained =
          attachment && !isFormReferenceRecord(attachment)
            ? documents.filter(
                (item) =>
                  !(
                    item.id.startsWith("catalog-") &&
                    item.title.toLowerCase() === document.title.toLowerCase()
                  ),
              )
            : documents;
        saveConditionDocuments(latest.id, condition.id, target.conditionIndex, field, [
          ...retained,
          document,
        ]);
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
    const latest = useWorkflowStore
      .getState()
      .file.graph.nodes.find((node) => node.id === target.chapterId);
    const condition = findChapterCondition(latest, target.conditionId, target.conditionIndex);
    if (!latest || !condition) {
      setDocumentError("This step is no longer available.");
      return;
    }
    const isOptional = (latest.optionalConditions ?? []).some((item) => item.id === condition.id);
    const required = isOptional ? false : documentRequired;
    const field = documentField(target.category);
    const current = conditionDocuments(latest, condition, field);
    const selected = documentLibrary.filter((item) => selectedLibraryFileIds.includes(item.id));
    const replacingTitles = new Set(
      selected
        .filter((item) => !isFormReferenceRecord(item))
        .map((item) => item.title.toLowerCase()),
    );
    const retained = current.filter(
      (item) => !(item.id.startsWith("catalog-") && replacingTitles.has(item.title.toLowerCase())),
    );
    const existing = new Set(retained.map((document) => document.title.toLowerCase()));
    const additions = selected
      .filter((item) => {
        const key = item.title.toLowerCase();
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      })
      .map(
        (attachment) =>
          ({
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: attachment.title || titleFromFileName(attachment.fileName),
            ...(isFormReferenceRecord(attachment)
              ? { code: attachment.fileName }
              : {
                  fileName: attachment.fileName,
                  dataUrl: attachment.dataUrl,
                  url: attachment.url,
                  notes: attachment.description,
                }),
            category: target.category,
            status: required ? "Required" : "Optional",
            checked: false,
            required,
            ...(isCustomerSelectionForm(attachment)
              ? { formKind: "customer-selection" as const }
              : {}),
          }) satisfies WorkspaceDocument,
      );
    saveConditionDocuments(latest.id, condition.id, target.conditionIndex, field, [
      ...retained,
      ...additions,
    ]);
    const skipped = selected.length - additions.length;
    setDocumentMessage(
      `${additions.length} form${additions.length === 1 ? "" : "s"} added${skipped ? ` · ${skipped} already existed` : ""}.`,
    );
    setSelectedLibraryFileIds([]);
  };

  const targetChapter = file.graph.nodes.find((node) => node.id === documentDialogTarget.chapterId);
  const targetCondition = findChapterCondition(
    targetChapter,
    documentDialogTarget.conditionId,
    documentDialogTarget.conditionIndex,
  );
  const targetIsOptional = Boolean(
    targetChapter?.optionalConditions?.some((condition) => condition.id === targetCondition?.id),
  );
  const categoryTitle =
    documentDialogTarget.category === "legal"
      ? "Required Document"
      : documentDialogTarget.category === "customer"
        ? "Customer Information Form"
        : "Supporting Document";
  const selectedLibraryFile = documentLibrary.find(
    (document) => document.id === selectedLibraryFileId,
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !documentBusy) setDocumentDialogTarget(null);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-chapter-document-title"
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <h2 id="add-chapter-document-title" className="text-sm font-bold">
              {documentDialogFlow === "library-batch"
                ? "Add Forms from Library"
                : `Add ${categoryTitle}`}
            </h2>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {targetChapter ? departmentBoardHeading(targetChapter).department : "Department"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close add document dialog"
            disabled={documentBusy}
            onClick={() => setDocumentDialogTarget(null)}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </header>
        {documentDialogFlow === "library-batch" ? (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {targetIsOptional ? (
                <p className="text-[11px] font-semibold">
                  Optional condition · {targetCondition?.label}
                </p>
              ) : (
                <label className="block text-[11px] font-semibold">
                  Step
                  <select
                    aria-label="Choose step for forms"
                    value={documentDialogTarget.conditionIndex}
                    onChange={(event) => {
                      const conditionIndex = Number(event.target.value);
                      const condition = targetChapter?.conditions[conditionIndex];
                      if (condition) {
                        setDocumentDialogTarget({
                          ...documentDialogTarget,
                          conditionId: condition.id,
                          conditionIndex,
                        });
                        setDocumentMessage("");
                        setDocumentError("");
                      }
                    }}
                    className="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary"
                  >
                    {targetChapter?.conditions.map((condition, index) => (
                      <option key={condition.id || index} value={index}>
                        {conditionText(condition, index)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-[10px] text-muted-foreground">
                Select one or more files from the L3 library for this step.
              </p>
              {!targetIsOptional ? (
                <fieldset>
                  <legend className="mb-1.5 text-[11px] font-semibold">Requirement level</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={documentRequired}
                      onClick={() => setDocumentRequired(true)}
                      className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${documentRequired ? "border-amber-500 bg-amber-500/10 text-amber-700" : "bg-background text-muted-foreground"}`}
                    >
                      Required
                    </button>
                    <button
                      type="button"
                      aria-pressed={!documentRequired}
                      onClick={() => setDocumentRequired(false)}
                      className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${!documentRequired ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
                    >
                      Optional
                    </button>
                  </div>
                </fieldset>
              ) : null}
              <div className="space-y-1.5">
                {documentLibrary.map((document) => {
                  const checked = selectedLibraryFileIds.includes(document.id);
                  return (
                    <label
                      key={document.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-[11px] transition ${checked ? "border-primary bg-primary/5" : "bg-background hover:border-primary/40"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedLibraryFileIds((current) =>
                            event.target.checked
                              ? [...current, document.id]
                              : current.filter((id) => id !== document.id),
                          )
                        }
                        className="size-3.5 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {document.title || titleFromFileName(document.fileName)}
                        </span>
                        <span className="block truncate text-[9px] text-muted-foreground">
                          {document.fileName}
                        </span>
                      </span>
                      {document.fileSize ? (
                        <span className="shrink-0 text-[9px] text-muted-foreground">
                          {(document.fileSize / 1024).toFixed(0)} KB
                        </span>
                      ) : null}
                    </label>
                  );
                })}
                {!documentLibrary.length ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">
                    No files in this category yet. Upload files with the + button first.
                  </p>
                ) : null}
              </div>
              {documentError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive"
                >
                  {documentError}
                </p>
              ) : null}
              {documentMessage ? (
                <p
                  role="status"
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-300"
                >
                  {documentMessage}
                </p>
              ) : null}
            </div>
            <footer className="flex shrink-0 justify-between gap-2 border-t bg-muted/20 px-4 py-3">
              <span className="self-center text-[10px] text-muted-foreground">
                {selectedLibraryFileIds.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDocumentDialogTarget(null)}
                  className="rounded-md border px-3 py-1.5 text-[11px] font-semibold"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={!selectedLibraryFileIds.length || !targetCondition}
                  onClick={addLibraryForms}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-45"
                >
                  <Plus className="size-3.5" /> Add selected forms
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="min-h-0 space-y-4 overflow-y-auto p-4">
              {targetIsOptional ? (
                <p className="text-[11px] font-semibold">
                  Optional condition · {targetCondition?.label}
                </p>
              ) : (
                <label className="block text-[11px] font-semibold">
                  Step
                  <select
                    aria-label="Choose step for document"
                    value={documentDialogTarget.conditionIndex}
                    onChange={(event) => {
                      const conditionIndex = Number(event.target.value);
                      const condition = targetChapter?.conditions[conditionIndex];
                      if (condition)
                        setDocumentDialogTarget({
                          ...documentDialogTarget,
                          conditionId: condition.id,
                          conditionIndex,
                        });
                    }}
                    className="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary"
                  >
                    {targetChapter?.conditions.map((condition, index) => (
                      <option key={condition.id || index} value={index}>
                        {conditionText(condition, index)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <fieldset>
                <legend className="mb-1.5 text-[11px] font-semibold">Document source</legend>
                <div className="grid gap-1.5">
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] ${documentMode === "custom" ? "border-primary bg-primary/5" : "bg-background"}`}
                  >
                    <input
                      type="radio"
                      name="chapter-document-source"
                      checked={documentMode === "custom"}
                      onChange={() => setDocumentMode("custom")}
                      className="accent-primary"
                    />
                    Custom entry without attached file
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] ${documentMode === "library" ? "border-primary bg-primary/5" : "bg-background"}`}
                  >
                    <input
                      type="radio"
                      name="chapter-document-source"
                      checked={documentMode === "library"}
                      onChange={() => {
                        setDocumentMode("library");
                        if (selectedLibraryFile) setDocumentTitle(selectedLibraryFile.title);
                      }}
                      className="accent-primary"
                    />
                    Choose an existing file from Library
                  </label>
                  {documentMode === "library" ? (
                    <select
                      aria-label="Choose file from Library"
                      value={selectedLibraryFileId}
                      onChange={(event) => {
                        setSelectedLibraryFileId(event.target.value);
                        const selected = documentLibrary.find(
                          (document) => document.id === event.target.value,
                        );
                        if (selected) setDocumentTitle(selected.title);
                      }}
                      className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary"
                    >
                      <option value="">Select a file from Library</option>
                      {documentLibrary.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title} · {document.fileName}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] ${documentMode === "upload" ? "border-primary bg-primary/5" : "bg-background"}`}
                  >
                    <input
                      type="radio"
                      name="chapter-document-source"
                      checked={documentMode === "upload"}
                      onChange={() => setDocumentMode("upload")}
                      className="accent-primary"
                    />
                    Upload a file from this computer
                  </label>
                  {documentMode === "upload" ? (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-[11px] text-muted-foreground hover:border-primary/50">
                      <input
                        ref={documentInput}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.png,.jpg,.jpeg,.json"
                        aria-label="Choose documents to upload"
                        onChange={(event) => {
                          const selected = Array.from(event.target.files ?? []);
                          setDocumentUploadFiles(selected);
                          if (selected.length === 1)
                            setDocumentTitle(titleFromFileName(selected[0].name));
                        }}
                        className="sr-only"
                      />
                      {documentUploadFiles.length ? (
                        <FileCheck2 className="size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <CloudUpload className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">
                        {documentUploadFiles.length
                          ? `${documentUploadFiles.length} file${documentUploadFiles.length === 1 ? "" : "s"} selected · names will be taken from filenames`
                          : "Choose one or more files to upload to Library"}
                      </span>
                    </label>
                  ) : null}
                </div>
              </fieldset>

              {documentMode !== "upload" ? (
                <label className="block text-[11px] font-semibold">
                  Display title in L3
                  <input
                    aria-label="Document title"
                    value={documentTitle}
                    onChange={(event) => setDocumentTitle(event.target.value)}
                    placeholder="Enter a document name"
                    className="mt-1.5 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary"
                  />
                </label>
              ) : documentUploadFiles.length ? (
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                  {documentUploadFiles.map((upload) => (
                    <div
                      key={`${upload.name}-${upload.size}-${upload.lastModified}`}
                      className="flex min-w-0 items-center gap-2 text-[10px]"
                    >
                      <FileCheck2 className="size-3.5 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {titleFromFileName(upload.name)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {(upload.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {!targetIsOptional ? (
                <fieldset>
                  <legend className="mb-1.5 text-[11px] font-semibold">Requirement level</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={documentRequired}
                      onClick={() => setDocumentRequired(true)}
                      className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${documentRequired ? "border-amber-500 bg-amber-500/10 text-amber-700" : "bg-background text-muted-foreground"}`}
                    >
                      Required
                    </button>
                    <button
                      type="button"
                      aria-pressed={!documentRequired}
                      onClick={() => setDocumentRequired(false)}
                      className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${!documentRequired ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
                    >
                      Optional
                    </button>
                  </div>
                </fieldset>
              ) : null}
              {documentError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive"
                >
                  {documentError}
                </p>
              ) : null}
              {documentMessage ? (
                <p
                  role="status"
                  className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-2 text-[11px] text-emerald-700 dark:text-emerald-300"
                >
                  {documentMessage}
                </p>
              ) : null}
              {!targetCondition ? (
                <p role="alert" className="text-[11px] text-destructive">
                  Choose a valid step before adding this document.
                </p>
              ) : null}
            </div>
            <footer className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-4 py-3">
              <button
                type="button"
                disabled={documentBusy}
                onClick={() => setDocumentDialogTarget(null)}
                className="rounded-md border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  documentBusy ||
                  (documentMode !== "upload" && !documentTitle.trim()) ||
                  !targetCondition ||
                  (documentMode === "library" && !selectedLibraryFile) ||
                  (documentMode === "upload" && !documentUploadFiles.length)
                }
                onClick={() => void addConditionDocument()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-45"
              >
                {documentBusy ? (
                  <CloudUpload className="size-3.5 animate-pulse" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                {documentBusy
                  ? "Saving…"
                  : documentMode === "upload" && documentUploadFiles.length > 1
                    ? `Upload ${documentUploadFiles.length} files to L3`
                    : "Add to L3"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
