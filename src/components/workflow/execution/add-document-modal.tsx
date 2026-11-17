"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type UploadedFileRecord,
  getUploadedFiles,
  fetchUploadedFilesFromR2,
} from "@/lib/file-storage";
import { isCustomerSelectionForm } from "@/lib/falcon-customer-intelligence";
import type { DocRecord } from "./doc-record";

// Modal for adding a new form/document to L3 from R2 file library or custom
export function AddDocumentModal({
  category,
  onClose,
  onAdd,
}: {
  category: "legal" | "customer" | "supporting";
  onClose: () => void;
  onAdd: (doc: DocRecord) => void;
}) {
  const [availableFiles, setAvailableFiles] = useState<UploadedFileRecord[]>(() =>
    getUploadedFiles(category),
  );
  const [selectedFileId, setSelectedFileId] = useState(() => availableFiles[0]?.id || "custom");
  const [customTitle, setCustomTitle] = useState(() => availableFiles[0]?.title || "");
  const [isRequired, setIsRequired] = useState(true);
  const userEdited = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetchUploadedFilesFromR2(category).then((remoteFiles) => {
      if (cancelled) return;
      setAvailableFiles(remoteFiles);
      if (!userEdited.current && remoteFiles.length > 0) {
        setSelectedFileId(remoteFiles[0].id);
        setCustomTitle((current) => (current.trim() ? current : remoteFiles[0].title));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const categoryLabel =
    category === "legal"
      ? "Required Document"
      : category === "customer"
        ? "Customer Information Form"
        : "Supporting Document";

  const handleSelectFile = (file: UploadedFileRecord) => {
    userEdited.current = true;
    setSelectedFileId(file.id);
    setCustomTitle(file.title);
  };

  const handleSubmit = () => {
    const selectedFile = availableFiles.find((f) => f.id === selectedFileId);
    const title = customTitle.trim() || selectedFile?.title || "New Document Form";
    const prefix = category === "legal" ? "LEG" : category === "customer" ? "CUST" : "SUP";
    const customerSelection = isCustomerSelectionForm(selectedFile || {});
    const newDoc: DocRecord = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      code: `${prefix}-${Math.floor(10 + Math.random() * 90)}`,
      fileName: selectedFile ? selectedFile.fileName : undefined,
      dataUrl: selectedFile?.dataUrl,
      url: selectedFile?.url,
      category,
      status: isRequired ? "Required" : "Optional",
      checked: false,
      required: isRequired,
      notes: selectedFile?.description,
      ...(customerSelection ? { formKind: "customer-selection" as const } : {}),
    };
    onAdd(newDoc);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-card shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Add {categoryLabel}</h2>
              <p className="text-[11px] text-muted-foreground">
                Select from Cloudflare R2 uploaded files or create a custom form
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-thin">
          {/* Requirement Selector */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Requirement Level <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsRequired(true)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-colors cursor-pointer",
                  isRequired
                    ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40 shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="size-2 rounded-full bg-amber-500" />
                Required
              </button>
              <button
                type="button"
                onClick={() => setIsRequired(false)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-colors cursor-pointer",
                  !isRequired
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40 shadow-xs"
                    : "border-slate-200 dark:border-slate-800 bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="size-2 rounded-full bg-slate-400" />
                Optional
              </button>
            </div>
          </div>

          {/* R2 Library Files */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Select Attached File from R2 Library
            </label>
            {availableFiles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-muted-foreground bg-muted/10">
                No R2 files uploaded in this category yet. You can enter a custom form name below or
                upload files via &quot;Upload Forms&quot; in the title.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-2 max-h-52 overflow-y-auto scroll-thin bg-muted/10">
                {availableFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => handleSelectFile(file)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                      selectedFileId === file.id
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary/50 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 bg-background hover:border-primary/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="selectedFile"
                      checked={selectedFileId === file.id}
                      onChange={() => handleSelectFile(file)}
                      className="mt-0.5 size-3.5 accent-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold text-foreground truncate">
                          {file.fileName}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {(file.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <p className="font-semibold text-foreground mt-0.5">{file.title}</p>
                      {file.description ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                          {file.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}

                <div
                  onClick={() => {
                    userEdited.current = true;
                    setSelectedFileId("custom");
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                    selectedFileId === "custom"
                      ? "border-primary bg-primary/[0.08] ring-1 ring-primary/50 shadow-xs"
                      : "border-slate-200 dark:border-slate-800 bg-background hover:border-primary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="selectedFile"
                    checked={selectedFileId === "custom"}
                    onChange={() => {
                      userEdited.current = true;
                      setSelectedFileId("custom");
                    }}
                    className="size-3.5 accent-primary"
                  />
                  <span className="font-medium text-muted-foreground">
                    Custom entry without attached file
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Form Title */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Display Title in L3 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => {
                userEdited.current = true;
                setCustomTitle(e.target.value);
              }}
              placeholder="e.g. Master Services Agreement 2026"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-background px-3.5 py-2.5 text-xs font-medium text-foreground shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!customTitle.trim()}
            className="h-8 text-xs font-bold gap-1 cursor-pointer"
          >
            <Plus className="size-3.5" />
            Add to L3 List
          </Button>
        </div>
      </div>
    </div>
  );
}
