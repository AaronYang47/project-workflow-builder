"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type UploadedFileRecord,
  getUploadedFiles,
  uploadFileToR2,
  downloadFile,
} from "@/lib/file-storage";
import { cn } from "@/lib/utils";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [fileList, setFileList] = useState<UploadedFileRecord[]>([]);

  useEffect(() => {
    if (open) {
      setFileList(getUploadedFiles());
      setUploadSuccess(false);
      if (initialCategory) setCategory(initialCategory);
    }
  }, [open, initialCategory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title) {
        // Auto-fill title from clean filename
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await uploadFileToR2(selectedFile, {
        category,
        title: title || selectedFile.name,
        description,
      });
      setFileList(getUploadedFiles());
      setUploadSuccess(true);
      setSelectedFile(null);
      setTitle("");
      setDescription("");
      setTimeout(() => {
        setUploadSuccess(false);
        setActiveTab("library");
      }, 1000);
    } catch {
      alert("Upload failed. Please try again.");
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
            onClick={() => setActiveTab("upload")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition-colors cursor-pointer",
              activeTab === "upload"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Upload className="size-3.5" />
            Upload File
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
            R2 File Library ({fileList.length})
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
                  Select File <span className="text-destructive">*</span>
                </label>
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/50 p-6 text-center hover:border-primary/50 hover:bg-primary/[0.02] cursor-pointer transition-colors">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    aria-label="Choose file to upload to R2"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-1">
                      <FileCheck className="size-8 text-primary" />
                      <p className="text-xs font-bold text-foreground mt-1">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB · Click to change file
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <CloudUpload className="size-8 text-muted-foreground/60" />
                      <p className="text-xs font-semibold text-foreground mt-1">
                        Click or drag file here to upload
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        PDF, DOCX, XLSX, DWG, PNG, or JSON up to 50MB
                      </p>
                    </div>
                  )}
                </label>
              </div>

              {/* Title & Description */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    Document / Form Title <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Master Services & Route Agreement 2026"
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                  />
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
                  disabled={!selectedFile || uploading}
                  className="w-full gap-2 h-9 text-xs font-bold"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Uploading to R2 Storage…
                    </>
                  ) : uploadSuccess ? (
                    <>
                      <Check className="size-3.5 text-emerald-300" />
                      Uploaded Successfully!
                    </>
                  ) : (
                    <>
                      <Upload className="size-3.5" />
                      Upload to R2 Storage
                    </>
                  )}
                </Button>
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
                            {file.fileName}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground mt-1">
                          {file.title}
                        </p>
                        {file.description ? (
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {file.description}
                          </p>
                        ) : null}
                        <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
                          {(file.fileSize / 1024).toFixed(1)} KB · Uploaded{" "}
                          {new Date(file.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadFile(file)}
                        title={`Download ${file.fileName}`}
                        aria-label={`Download ${file.fileName}`}
                        className="h-8 shrink-0 gap-1 text-xs font-medium"
                      >
                        <Download className="size-3.5" />
                        Download
                      </Button>
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
