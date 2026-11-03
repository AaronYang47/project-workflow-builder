"use client";

import { useEffect, useRef, useState } from "react";
import {
  CloudUpload,
  Download,
  FileCheck,
  FileText,
  FolderArchive,
  Loader2,
  Scale,
  Building2,
  Upload,
  X,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type UploadedFileRecord,
  getUploadedFiles,
  fetchUploadedFilesFromR2,
  uploadFileToR2,
  downloadFile,
  deleteUploadedFile,
  isFormReferenceRecord,
} from "@/lib/file-storage";
import { isCustomerSelectionForm } from "@/lib/falcon-customer-intelligence";
import { cn } from "@/lib/utils";

function titleIsFileName(title: string, fileName: string) {
  const withoutExtension = (value: string) => value.trim().replace(/\.[^.]+$/, "").toLocaleLowerCase();
  return Boolean(title.trim()) && withoutExtension(title) === withoutExtension(fileName);
}

export function R2FileDialog({
  open,
  onClose,
  initialCategory,
}: {
  open: boolean;
  onClose: () => void;
  initialCategory?: "legal" | "customer" | "supporting";
}) {
  const [activeTab, setActiveTab] = useState<"upload" | "library">("upload");
  const [category, setCategory] = useState<"legal" | "customer" | "supporting">(
    initialCategory || "legal",
  );
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileList, setFileList] = useState<UploadedFileRecord[]>([]);
  const uploadInput = useRef<HTMLInputElement>(null);

  const titleFromFileName = (fileName: string) => {
    const name = fileName.split(/[\\/]/).pop() || fileName;
    return name.replace(/\.[^.]+$/, "").trim() || name;
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetchUploadedFilesFromR2().then((remoteFiles) => {
      if (active) setFileList(remoteFiles);
    });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (activeTab === "library") {
      fetchUploadedFilesFromR2().then((remoteFiles) => {
        setFileList(remoteFiles);
      });
    }
  }, [activeTab]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setSelectedFiles(files);
    setTitle(files.length === 1 ? titleFromFileName(files[0].name) : "");
    setUploadSuccess(false);
    setUploadError("");
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    const failedFiles: File[] = [];
    const failureMessages: string[] = [];
    let uploadedCount = 0;
    try {
      const currentFiles = await fetchUploadedFilesFromR2();
      setFileList(currentFiles);
      const normalizeName = (fileName: string) => fileName.normalize("NFKC").trim().toLocaleLowerCase();
      const existingByName = new Map<string, UploadedFileRecord>();
      for (const existing of currentFiles) {
        if (existing.category === category && existing.key && !existingByName.has(normalizeName(existing.fileName))) {
          existingByName.set(normalizeName(existing.fileName), existing);
        }
      }
      const batchNames = new Set<string>();
      const batchDuplicates = new Set<string>();
      const libraryDuplicates = new Set<string>();
      for (const file of selectedFiles) {
        const name = normalizeName(file.name);
        if (batchNames.has(name)) batchDuplicates.add(file.name);
        batchNames.add(name);
        if (existingByName.has(name)) libraryDuplicates.add(file.name);
      }
      if (libraryDuplicates.size || batchDuplicates.size) {
        const details = [
          libraryDuplicates.size ? `Already in this Library category:\n${[...libraryDuplicates].map((name) => `• ${name}`).join("\n")}` : "",
          batchDuplicates.size ? `Selected more than once:\n${[...batchDuplicates].map((name) => `• ${name}`).join("\n")}` : "",
        ].filter(Boolean).join("\n\n");
        const batchNote = batchDuplicates.size ? " Later selected files with the same name will replace earlier ones." : "";
        if (!window.confirm(`${details}\n\nReplace matching Library files? Replacing keeps the existing Library link and updates its contents.${batchNote}`)) return;
      }

      for (const [index, file] of selectedFiles.entries()) {
        try {
          const existing = existingByName.get(normalizeName(file.name));
          const uploaded = await uploadFileToR2(file, {
            category,
            title: selectedFiles.length === 1 && title.trim() ? title.trim() : titleFromFileName(file.name),
            description,
            ...(existing?.key ? { replaceKey: existing.key } : {}),
          });
          existingByName.set(normalizeName(uploaded.fileName), uploaded);
          uploadedCount += 1;
        } catch (error) {
          failedFiles.push(file);
          failureMessages.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`);
        }
        setUploadProgress(index + 1);
      }
      const latest = await fetchUploadedFilesFromR2();
      setFileList(latest);
      if (failedFiles.length) {
        setSelectedFiles(failedFiles);
        setTitle(failedFiles.length === 1 ? titleFromFileName(failedFiles[0].name) : "");
        setUploadProgress(0);
        setUploadError(`${uploadedCount} uploaded; ${failedFiles.length} failed. ${failureMessages[0]}`);
        return;
      }
      setUploadSuccess(true);
      setSelectedFiles([]);
      setTitle("");
      setDescription("");
      setUploadProgress(0);
      setTimeout(() => {
        setUploadSuccess(false);
        setActiveTab("library");
      }, 1000);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const filteredFiles =
    filterCategory === "all"
      ? fileList
      : fileList.filter((f) => f.category === filterCategory);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CloudUpload className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Cloudflare R2 Document Center
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Upload & manage persistent workflow documents categorized for L3 execution
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b bg-muted/10 px-5 pt-2">
          <button
            type="button"
            onClick={() => { setUploadSuccess(false); setUploadError(""); setActiveTab("upload"); }}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer",
              activeTab === "upload"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Upload className="size-3.5" />
            Upload Files
          </button>
          <button
            type="button"
            onClick={() => {
              setFileList(getUploadedFiles());
              setActiveTab("library");
            }}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer",
              activeTab === "library"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FolderArchive className="size-3.5" />
            Library ({fileList.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 scroll-thin">
          {activeTab === "upload" ? (
            <div className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Document Category <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCategory("legal")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition-colors cursor-pointer",
                      category === "legal"
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Scale className="size-3.5" />
                    Legal Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("customer")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition-colors cursor-pointer",
                      category === "customer"
                        ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Building2 className="size-3.5" />
                    Customer Information
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategory("supporting")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition-colors cursor-pointer",
                      category === "supporting"
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <FolderArchive className="size-3.5" />
                    Supporting Documents
                  </button>
                </div>
              </div>

              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Select Files <span className="text-destructive">*</span>
                </label>
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/50 p-6 text-center hover:border-primary/50 hover:bg-primary/[0.02] cursor-pointer transition-colors">
                  <input
                    ref={uploadInput}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.png,.jpg,.jpeg,.json"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-label="Choose one or more files to upload to Library"
                  />
                  {selectedFiles.length ? (
                    <div className="flex flex-col items-center gap-1">
                      <FileCheck className="size-8 text-primary" />
                      <p className="text-xs font-bold text-foreground mt-1">{selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected</p>
                      <p className="text-[11px] text-muted-foreground">Click to change files · document names are taken from filenames</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <CloudUpload className="size-8 text-muted-foreground/60" />
                      <p className="text-xs font-semibold text-foreground mt-1">
                        Click or drag files here to upload
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        PDF, DOCX, XLSX, DWG, PNG, or JSON · up to 50 MB per file
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {/* Title & Description */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {selectedFiles.length > 1 ? "Detected Document / Form Titles" : "Document / Form Title"}{selectedFiles.length <= 1 ? <span className="text-destructive"> *</span> : null}
                  </label>
                  {selectedFiles.length > 1 ? (
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-background/60 p-2">
                      {selectedFiles.map((file, index) => <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex min-w-0 items-center gap-2 text-[11px]"><FileCheck className="size-3 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate font-medium">{titleFromFileName(file.name)}</span><span className="shrink-0 text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span><button type="button" aria-label={`Remove ${file.name} from upload batch`} onClick={() => { const next = selectedFiles.filter((_, selectedIndex) => selectedIndex !== index); setSelectedFiles(next); setTitle(next.length === 1 ? titleFromFileName(next[0].name) : ""); }} className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button></div>)}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={selectedFiles.length === 1 ? titleFromFileName(selectedFiles[0].name) : "Enter a document name or select a file"}
                      className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Description & Scope
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of requirements, authority, or purpose..."
                    className="w-full rounded-md border bg-background p-2.5 text-xs font-medium leading-relaxed text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Upload Button */}
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={handleUpload}
                  disabled={!selectedFiles.length || (selectedFiles.length === 1 && !title.trim()) || uploading}
                  className="w-full gap-2 h-9 text-xs font-bold"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Uploading {uploadProgress} of {selectedFiles.length} to Library…
                    </>
                  ) : uploadSuccess ? (
                    <>
                      <Check className="size-3.5 text-emerald-300" />
                      Uploaded Successfully!
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5" />
                      Upload to Library{selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ""}
                    </>
                  )}
                </Button>
                {uploadError ? <p role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">{uploadError}</p> : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scroll-thin">
                {["all", "legal", "customer", "supporting"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border",
                      filterCategory === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:bg-muted/80",
                    )}
                  >
                    {cat === "all" ? "All Files" : cat}
                  </button>
                ))}
              </div>

              {/* File list */}
              {filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <FileText className="size-8 opacity-40 mb-2" />
                  <p className="text-xs font-medium">No files found in this category.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                              file.category === "legal"
                                ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                                : file.category === "customer"
                                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            )}
                          >
                            {file.category}
                          </span>
                          <span className="font-mono text-xs font-bold text-foreground truncate">
                            {isFormReferenceRecord(file) ? `Form code: ${file.fileName}` : file.fileName}
                          </span>
                        </div>
                        {!titleIsFileName(file.title, file.fileName) ? <p className="text-xs font-semibold text-foreground mt-1">{file.title}</p> : null}
                        {file.description ? (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {file.description}
                          </p>
                        ) : null}
                        {isFormReferenceRecord(file) ? <p className="text-[10px] text-muted-foreground/80 mt-1">Title only · File can be uploaded later</p> : <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
                          {(file.fileSize / 1024).toFixed(1)} KB · Uploaded{" "}
                          {new Date(file.uploadedAt).toLocaleDateString()}
                        </p>}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isFormReferenceRecord(file) ? (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-muted text-muted-foreground">Title only</span>
                        ) : isCustomerSelectionForm(file) ? (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-300">
                            Built-in Form
                          </span>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadFile(file)}
                              title={`Download ${file.fileName}`}
                              aria-label={`Download ${file.fileName}`}
                              className="h-8 gap-1 text-xs font-medium cursor-pointer"
                            >
                              <Download className="size-3.5" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                if (window.confirm(`Delete "${file.fileName}" from Library?`)) {
                                  try {
                                    await deleteUploadedFile(file.id, file.key);
                                    const latest = await fetchUploadedFilesFromR2();
                                    setFileList(latest);
                                  } catch (error) {
                                    window.alert(error instanceof Error ? error.message : "Could not delete file.");
                                  }
                                }
                              }}
                              title={`Delete ${file.fileName}`}
                              aria-label={`Delete ${file.fileName}`}
                              className="h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 cursor-pointer"
                            >
                              <Trash2 className="size-3.5" />
                              <span className="hidden sm:inline">Delete</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3 bg-muted/10 text-xs text-muted-foreground">
          <span>Files are indexed and selectable in L3 execution forms.</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
