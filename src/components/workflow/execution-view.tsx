"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  CloudUpload,
  Download,
  FileCheck2,
  FileText,
  FolderArchive,
  Plus,
  Scale,
  Trash2,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  executionItemProgress,
  getExecutionSummary,
} from "@/lib/execution";
import {
  isReferenceNodeType,
  type DomainNode,
  type ExecutionItem,
} from "@/types/workflow";
import { nodeReleaseReady } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  type UploadedFileRecord,
  getUploadedFiles,
  downloadFile,
} from "@/lib/file-storage";

export interface DocRecord {
  id: string;
  title: string;
  code?: string;
  fileName?: string;
  dataUrl?: string;
  url?: string;
  category: "legal" | "customer" | "supporting";
  status: "Required" | "Optional" | "Signed" | "Verified" | "Under Review";
  checked: boolean;
  required: boolean;
  notes?: string;
  sourceItemId?: string;
}

// Modal for adding a new form/document to L3 from R2 file library or custom
function AddDocumentModal({
  open,
  category,
  onClose,
  onAdd,
}: {
  open: boolean;
  category: "legal" | "customer" | "supporting" | null;
  onClose: () => void;
  onAdd: (doc: DocRecord) => void;
}) {
  const [selectedFileId, setSelectedFileId] = useState<string>("custom");
  const [customTitle, setCustomTitle] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [availableFiles, setAvailableFiles] = useState<UploadedFileRecord[]>([]);

  useEffect(() => {
    if (open && category) {
      const files = getUploadedFiles(category);
      setAvailableFiles(files);
      if (files.length > 0) {
        setSelectedFileId(files[0].id);
        setCustomTitle(files[0].title);
      } else {
        setSelectedFileId("custom");
        setCustomTitle("");
      }
      setIsRequired(true);
    }
  }, [open, category]);

  if (!open || !category) return null;

  const categoryLabel =
    category === "legal"
      ? "Legal Document"
      : category === "customer"
        ? "Customer Information Form"
        : "Supporting Document";

  const handleSelectFile = (file: UploadedFileRecord) => {
    setSelectedFileId(file.id);
    setCustomTitle(file.title);
  };

  const handleSubmit = () => {
    const selectedFile = availableFiles.find((f) => f.id === selectedFileId);
    const title = customTitle.trim() || selectedFile?.title || "New Document Form";
    const prefix = category === "legal" ? "LEG" : category === "customer" ? "CUST" : "SUP";
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
    };
    onAdd(newDoc);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Add {categoryLabel}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Select from Cloudflare R2 uploaded files or create a custom form
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
                    ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
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
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
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
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                No R2 files uploaded in this category yet. You can enter a custom form name below or upload files via &quot;Upload Forms&quot; in the title.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto scroll-thin pr-1">
                {availableFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => handleSelectFile(file)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                      selectedFileId === file.id
                        ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40 shadow-xs"
                        : "border-border bg-background hover:border-primary/30",
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
                  onClick={() => setSelectedFileId("custom")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                    selectedFileId === "custom"
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40 shadow-xs"
                      : "border-border bg-background hover:border-primary/30",
                  )}
                >
                  <input
                    type="radio"
                    name="selectedFile"
                    checked={selectedFileId === "custom"}
                    onChange={() => setSelectedFileId("custom")}
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
            <label className="block text-xs font-semibold text-foreground mb-1">
              Display Title in L3 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement 2026"
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-muted/10">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!customTitle.trim()}
            className="h-8 text-xs font-bold gap-1"
          >
            <Plus className="size-3.5" />
            Add to L3 List
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExecutionView({
  nodeId,
  focusItemId,
  activeConditionId,
  onSelectCondition,
  onBack,
  onFocusNode,
  onOpenLayer1Node,
}: {
  nodeId: string;
  focusItemId?: string | null;
  activeConditionId?: string | null;
  onSelectCondition?: (conditionId: string) => void;
  onBack: () => void;
  onFocusNode?: (nodeId: string) => void;
  onOpenLayer1Node?: (nodeId: string) => void;
}) {
  const file = useWorkflowStore((state) => state.file);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const updateExecutionItem = useWorkflowStore(
    (state) => state.updateExecutionItem,
  );
  const [addModalCategory, setAddModalCategory] = useState<
    "legal" | "customer" | "supporting" | null
  >(null);

  const node = file.graph.nodes.find((item) => item.id === nodeId);
  const highLevelNodes = useWorkflowStore(
    (state) => state.file.highLevel?.graph.nodes ?? [],
  );

  const owningL1Node = useMemo(() => {
    if (!nodeId) return null;
    const directOwner = highLevelNodes.find((hl) => {
      const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
      return ids.includes(nodeId);
    });
    if (directOwner) return directOwner;

    // Check if node.config.stage matches any high level node
    if (
      node?.config?.stage &&
      typeof node.config.stage === "string" &&
      node.config.stage.trim()
    ) {
      const match = highLevelNodes.find(
        (hl) =>
          hl.title.trim().toLowerCase() ===
          (node.config.stage as string).trim().toLowerCase(),
      );
      if (match) return match;
    }

    // Check parent node in L2 graph
    const layoutParentId = nodeId ? file.layout.nodes[nodeId]?.parentId : undefined;
    if (layoutParentId) {
      const parentNode = file.graph.nodes.find((n) => n.id === layoutParentId);
      if (parentNode) {
        const parentOwner = highLevelNodes.find((hl) => {
          const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
          return ids.includes(parentNode.id);
        });
        if (parentOwner) return parentOwner;
      }
    }

    return highLevelNodes[0] || null;
  }, [highLevelNodes, nodeId, node?.config?.stage, file.layout.nodes, file.graph.nodes]);

  const l1Title = owningL1Node?.title?.trim() || "High Level";

  const l1Color = useMemo(() => {
    if (!owningL1Node) return undefined;
    if (
      owningL1Node.backgroundColor &&
      owningL1Node.backgroundColor !== "transparent"
    ) {
      return owningL1Node.backgroundColor;
    }
    const title = (owningL1Node.title || "").toUpperCase();
    if (title.includes("INITIAL CONTACT")) return "#10b981"; // emerald-500
    if (title.includes("PRE-CONSTRUCTION")) return "#f59e0b"; // amber-500
    if (title.includes("READINESS")) return "#8b5cf6"; // violet-500
    if (title.includes("FACTORY PRODUCTION")) return "#f97316"; // orange-500
    if (title.includes("DELIVERY")) return "#06b6d4"; // cyan-500
    if (title.includes("COMMISSIONING")) return "#14b8a6"; // teal-500
    return "#0ea5e9"; // sky-500
  }, [owningL1Node]);

  const l2Color = node?.color || undefined;

  const conditions = useMemo(() => node?.conditions || [], [node?.conditions]);
  const currentCondition = useMemo(() => {
    if (!conditions.length) return null;
    if (activeConditionId) {
      return (
        conditions.find((c) => c.id === activeConditionId) || conditions[0]
      );
    }
    return conditions[0];
  }, [conditions, activeConditionId]);

  const l2Title = node?.title?.trim() || "Detailed Workflow";
  const l3Title =
    currentCondition?.label?.trim() ||
    currentCondition?.description?.trim() ||
    "Execution Layer";

  const items = useMemo(
    () =>
      (file.execution?.items || []).filter(
        (item) => item.linkedLayer2NodeId === nodeId,
      ),
    [file.execution?.items, nodeId],
  );

  const projectStartNode = file.graph.nodes.find(
    (item) => item.type === "projectStart",
  );

  const summary = getExecutionSummary(
    nodeId,
    file.execution?.items,
    file.operations,
    { checklistOnly: true },
  );

  const releaseReady = node
    ? nodeReleaseReady(
        node,
        projectStartNode,
        file.execution?.items,
        file.operations,
      )
    : false;

  // 1. Legal Documents Data
  const customLegalDocs: DocRecord[] = useMemo(() => {
    const raw = node?.customFields?.legalDocuments;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (doc) =>
              !doc.id?.startsWith("legal-") &&
              doc.fileName !== "Master_Services_Agreement_2026.pdf" &&
              doc.fileName !== "NDA_Standard_Mutual_v2.pdf",
          );
        }
      } catch {
        // fallthrough
      }
    }
    return [];
  }, [node?.customFields?.legalDocuments]);

  // 2. Customer Information Forms Data (Redesigned as Form/Doc List)
  const customCustomerDocs: DocRecord[] = useMemo(() => {
    const raw = node?.customFields?.customerDocuments;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (doc) =>
              !doc.id?.startsWith("cust-") &&
              doc.fileName !== "Customer_Project_Spec_2026.pdf" &&
              doc.fileName !== "Client_Signatory_Authorization.pdf",
          );
        }
      } catch {
        // fallthrough
      }
    }
    return [];
  }, [node?.customFields?.customerDocuments]);

  // 3. Supporting Documents Data
  const customSupportingDocs: DocRecord[] = useMemo(() => {
    const raw = node?.customFields?.supportingDocuments;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (doc) =>
              !doc.id?.startsWith("supp-") &&
              doc.fileName !== "Site_Foundation_Survey_Plan.pdf" &&
              doc.fileName !== "Class_CD_Cost_Estimate_Model.xlsx",
          );
        }
      } catch {
        // fallthrough
      }
    }
    return [];
  }, [node?.customFields?.supportingDocuments]);

  const saveLegalDocs = (docs: DocRecord[]) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        legalDocuments: JSON.stringify(docs),
      },
    });
  };

  const saveCustomerDocs = (docs: DocRecord[]) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        customerDocuments: JSON.stringify(docs),
      },
    });
  };

  const saveSupportingDocs = (docs: DocRecord[]) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        supportingDocuments: JSON.stringify(docs),
      },
    });
  };

  // Check if all Required items across all 3 boxes and execution items are checked
  const allRequiredChecked = useMemo(() => {
    const requiredDocs = [
      ...customLegalDocs.filter((d) => d.required),
      ...customCustomerDocs.filter((d) => d.required),
      ...customSupportingDocs.filter((d) => d.required),
    ];
    const itemsChecked =
      items.length === 0 ||
      items.every(
        (item) =>
          executionItemProgress(item, file.operations, { checklistOnly: true }) === "complete",
      );

    if (requiredDocs.length === 0) {
      return releaseReady || itemsChecked;
    }
    return requiredDocs.every((d) => d.checked) && itemsChecked;
  }, [customLegalDocs, customCustomerDocs, customSupportingDocs, items, file.operations, releaseReady]);

  // Automatically update L2 Release Condition when all required items pass
  useEffect(() => {
    if (!node || !currentCondition) return;
    if (currentCondition.checked !== allRequiredChecked) {
      const updatedConditions = (node.conditions || []).map((c) =>
        c.id === currentCondition.id ? { ...c, checked: allRequiredChecked } : c,
      );
      updateNode(node.id, { conditions: updatedConditions });
    }
  }, [allRequiredChecked, currentCondition, node, updateNode]);

  // Toggle checks on execution items
  const handleToggleExecutionItem = (item: ExecutionItem) => {
    updateExecutionItem(item.id, {
      checklistComplete: item.checklistComplete !== true,
    });
  };

  const handleNavigateToL1 = () => {
    const l1Id = owningL1Node?.id || highLevelNodes[0]?.id;
    if (l1Id) {
      if (onOpenLayer1Node) {
        onOpenLayer1Node(l1Id);
      } else {
        useWorkflowStore.getState().selectHighLevelNodes([l1Id]);
        onBack();
      }
    } else {
      onBack();
    }
  };

  const handleNavigateToL2 = () => {
    if (node?.id && onFocusNode) {
      onFocusNode(node.id);
    } else {
      onBack();
    }
  };


  if (!node) {
    return (
      <section
        aria-label="L3 Execution Layer"
        className="relative z-10 flex h-full min-w-0 flex-1 flex-col bg-canvas"
      >
        <div className="flex items-center gap-3 border-b bg-background px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            aria-label="Back to L2 Detailed Workflow"
          >
            <ArrowLeft className="size-3.5" />
            Back to L2
          </Button>
          <p className="text-sm text-muted-foreground">
            The selected workflow node is no longer available.
          </p>
        </div>
      </section>
    );
  }

  const legalCheckedCount = customLegalDocs.filter((d) => d.checked).length;
  const customerCheckedCount = customCustomerDocs.filter((d) => d.checked).length;
  const supportingCheckedCount = customSupportingDocs.filter((d) => d.checked).length;

  return (
    <section
      aria-label="L3 Execution Layer"
      className="relative z-10 flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas"
    >
      {/* L3 Top Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNavigateToL2}
            aria-label="Back to L2 Detailed Workflow"
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="size-3.5" />
            Back to L2
          </Button>
          <div className="min-w-0 border-l pl-3">
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <button
                type="button"
                onClick={handleNavigateToL1}
                title={`Navigate to L1 · ${l1Title}`}
                className={cn(
                  "inline-flex items-center gap-1 font-sans text-xs font-semibold hover:underline cursor-pointer transition-colors p-0 m-0 bg-transparent border-0",
                  !l1Color && "text-emerald-600 dark:text-emerald-400",
                )}
                style={l1Color ? { color: l1Color } : undefined}
              >
                <span>L1</span>
                <span>{l1Title}</span>
              </button>

              <span className="text-muted-foreground/60 text-xs font-sans font-normal select-none">&gt;</span>

              <button
                type="button"
                onClick={handleNavigateToL2}
                title="Back to L2 Detailed Workflow"
                className={cn(
                  "inline-flex items-center gap-1 font-sans text-xs font-semibold hover:underline cursor-pointer transition-colors p-0 m-0 bg-transparent border-0",
                  !l2Color && "text-sky-600 dark:text-sky-400",
                )}
                style={l2Color ? { color: l2Color } : undefined}
              >
                <span>L2</span>
                <span>{l2Title}</span>
              </button>

              <span className="text-muted-foreground/60 text-xs font-sans font-normal select-none">&gt;</span>

              <h1
                className="inline-flex items-center gap-1 font-sans text-xs font-semibold text-violet-600 dark:text-violet-400 truncate p-0 m-0"
                title={`L3 ${l3Title}`}
              >
                <span>L3</span>
                <span>{l3Title}</span>
              </h1>

              <span className="rounded-md border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground font-sans">
                Required files
              </span>
            </div>
            {currentCondition?.description && currentCondition.description.trim() !== l3Title ? (
              <p className="text-[11px] font-medium text-muted-foreground truncate max-w-md mt-0.5">
                Condition: <span className="font-semibold text-foreground">{currentCondition.description.trim()}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "rounded-full border px-3 py-0.5 text-xs font-semibold",
              summary.status === "Blocked"
                ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : summary.status === "Incomplete"
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {summary.completedCount}/{summary.itemCount} Checked · {summary.status}
          </div>
        </div>
      </header>

      {/* Conditions Selector Bar with Green Breathing Light on Pass */}
      {conditions.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background/50 px-4 py-2 scroll-thin sm:px-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Release Conditions:
          </span>
          {conditions.map((condition, idx) => {
            const isSelected =
              currentCondition?.id === condition.id ||
              (!currentCondition && idx === 0);
            const isPassed = condition.checked || (isSelected && allRequiredChecked);

            return (
              <button
                key={condition.id || idx}
                type="button"
                onClick={() => onSelectCondition?.(condition.id || `condition-${idx}`)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-300 cursor-pointer border",
                  isPassed
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold condition-breathe-glow"
                    : isSelected
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-2xs"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 items-center justify-center rounded-full text-[9px]",
                    isPassed
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground border",
                  )}
                >
                  {isPassed ? <Check className="size-2.5" /> : idx + 1}
                </span>
                <span className="truncate max-w-[14rem]">
                  {condition.label || condition.description || `Condition ${idx + 1}`}
                </span>
                {isPassed ? (
                  <Sparkles className="size-3 text-emerald-500 animate-pulse" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 3-Box Evenly Distributed Layout */}
      <div
        data-testid="required-file-checklist"
        className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 lg:p-5"
      >
        <div className="grid h-full min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-3">
          
          {/* ============================================================ */}
          {/* Box 1 (Left): Legal Documents                                */}
          {/* ============================================================ */}
          <div className="flex flex-col rounded-xl border bg-card/70 backdrop-blur-xs shadow-xs overflow-hidden">
            <header className="flex items-center justify-between border-b px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Scale className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Legal Documents
                  </h2>
                  <p className="text-[10px] text-muted-foreground">
                    Contracts, deeds & regulatory permits
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                {legalCheckedCount}/{customLegalDocs.length} Executed
              </span>
            </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
              {customLegalDocs.length === 0 && items.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                  <FileText className="size-8 opacity-30 mb-2" />
                  <p className="text-xs font-medium">No legal documents added yet.</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">Click &quot;+ Add Legal Document&quot; below to add from uploaded forms.</p>
                </div>
              ) : null}
              {customLegalDocs.map((doc, index) => (
                <div
                  key={doc.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    doc.checked
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : "border-border/80 bg-background hover:border-indigo-500/40",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Required file: ${doc.title}`}
                    checked={doc.checked}
                    onChange={() => {
                      const updated = [...customLegalDocs];
                      updated[index] = { ...doc, checked: !doc.checked };
                      saveLegalDocs(updated);
                    }}
                    className="mt-1 size-4 shrink-0 accent-indigo-600 rounded cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {doc.code || `LEG-0${index + 1}`}
                        </span>
                        {doc.fileName ? (
                          <span
                            title={doc.fileName}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-foreground font-medium max-w-[130px] truncate"
                          >
                            <FileText className="size-2.5 text-primary shrink-0" />
                            <span className="truncate">{doc.fileName}</span>
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0",
                          doc.checked
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : doc.required
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-slate-400/15 text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {doc.checked ? "Executed" : doc.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-snug text-foreground">
                      {doc.title}
                    </p>
                    {doc.notes ? (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        {doc.notes}
                      </p>
                    ) : null}
                  </div>

                  {/* Actions: Download and Delete */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {doc.fileName ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          downloadFile(doc);
                        }}
                        title={`Download ${doc.fileName}`}
                        aria-label={`Download ${doc.fileName}`}
                        className="size-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        saveLegalDocs(customLegalDocs.filter((_, i) => i !== index));
                      }}
                      title="Remove document"
                      aria-label="Remove document"
                      className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Items from execution layer belonging to this node */}
              {items.map((item) => {
                const checked =
                  executionItemProgress(item, file.operations, {
                    checklistOnly: true,
                  }) === "complete";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                      checked
                        ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                        : "border-border/80 bg-background hover:border-indigo-500/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Required file: ${item.title || item.type}`}
                      checked={checked}
                      onChange={() => handleToggleExecutionItem(item)}
                      className="mt-1 size-4 shrink-0 accent-indigo-600 rounded cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {item.documentCode || item.catalogId || "CONTROLLED"}
                        </span>
                        <span className="rounded px-1.5 py-0.2 text-[9px] font-bold uppercase bg-muted text-muted-foreground">
                          {checked ? "Checked" : "Required"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold leading-snug text-foreground">
                        {item.title || item.type}
                      </p>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setAddModalCategory("legal")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-600 cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Legal Document
              </button>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Box 2 (Center): Customer Information (Form/Doc List)         */}
          {/* ============================================================ */}
          <div className="flex flex-col rounded-xl border bg-card/70 backdrop-blur-xs shadow-xs overflow-hidden">
            <header className="flex items-center justify-between border-b px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Building2 className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Customer Information
                  </h2>
                  <p className="text-[10px] text-muted-foreground">
                    Client specifications & authorization forms
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 border border-sky-500/20">
                {customerCheckedCount}/{customCustomerDocs.length} Verified
              </span>
            </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
              {customCustomerDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                  <FileText className="size-8 opacity-30 mb-2" />
                  <p className="text-xs font-medium">No customer forms added yet.</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">Click &quot;+ Add Customer Information Form&quot; below to add from uploaded forms.</p>
                </div>
              ) : null}
              {customCustomerDocs.map((doc, index) => (
                <div
                  key={doc.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    doc.checked
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : "border-border/80 bg-background hover:border-sky-500/40",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Required file: ${doc.title}`}
                    checked={doc.checked}
                    onChange={() => {
                      const updated = [...customCustomerDocs];
                      updated[index] = { ...doc, checked: !doc.checked };
                      saveCustomerDocs(updated);
                    }}
                    className="mt-1 size-4 shrink-0 accent-sky-600 rounded cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {doc.code || `CUST-0${index + 1}`}
                        </span>
                        {doc.fileName ? (
                          <span
                            title={doc.fileName}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-foreground font-medium max-w-[130px] truncate"
                          >
                            <FileText className="size-2.5 text-sky-500 shrink-0" />
                            <span className="truncate">{doc.fileName}</span>
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0",
                          doc.checked
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : doc.required
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-slate-400/15 text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {doc.checked ? "Verified" : doc.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-snug text-foreground">
                      {doc.title}
                    </p>
                    {doc.notes ? (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        {doc.notes}
                      </p>
                    ) : null}
                  </div>

                  {/* Actions: Download and Delete */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {doc.fileName ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          downloadFile(doc);
                        }}
                        title={`Download ${doc.fileName}`}
                        aria-label={`Download ${doc.fileName}`}
                        className="size-6 text-muted-foreground hover:text-sky-600 hover:bg-sky-500/10"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        saveCustomerDocs(customCustomerDocs.filter((_, i) => i !== index));
                      }}
                      title="Remove form"
                      aria-label="Remove form"
                      className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setAddModalCategory("customer")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sky-500/50 hover:bg-sky-500/5 hover:text-sky-600 cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Customer Information Form
              </button>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Box 3 (Right): Supporting Documents                          */}
          {/* ============================================================ */}
          <div className="flex flex-col rounded-xl border bg-card/70 backdrop-blur-xs shadow-xs overflow-hidden">
            <header className="flex items-center justify-between border-b px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <FolderArchive className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Supporting Documents
                  </h2>
                  <p className="text-[10px] text-muted-foreground">
                    Engineering drawings, calculations & evidence
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {supportingCheckedCount}/{customSupportingDocs.length} Verified
              </span>
            </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
              {customSupportingDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                  <FileText className="size-8 opacity-30 mb-2" />
                  <p className="text-xs font-medium">No supporting documents added yet.</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">Click &quot;+ Add Supporting Document&quot; below to add from uploaded forms.</p>
                </div>
              ) : null}
              {customSupportingDocs.map((doc, index) => (
                <div
                  key={doc.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    doc.checked
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : "border-border/80 bg-background hover:border-emerald-500/40",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Required file: ${doc.title}`}
                    checked={doc.checked}
                    onChange={() => {
                      const updated = [...customSupportingDocs];
                      updated[index] = { ...doc, checked: !doc.checked };
                      saveSupportingDocs(updated);
                    }}
                    className="mt-1 size-4 shrink-0 accent-emerald-600 rounded cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {doc.code || `SUP-0${index + 1}`}
                        </span>
                        {doc.fileName ? (
                          <span
                            title={doc.fileName}
                            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-foreground font-medium max-w-[130px] truncate"
                          >
                            <FileText className="size-2.5 text-emerald-600 shrink-0" />
                            <span className="truncate">{doc.fileName}</span>
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0",
                          doc.checked
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : doc.required
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "bg-slate-400/15 text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {doc.checked ? "Verified" : doc.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-snug text-foreground">
                      {doc.title}
                    </p>
                    {doc.notes ? (
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        {doc.notes}
                      </p>
                    ) : null}
                  </div>

                  {/* Actions: Download and Delete */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {doc.fileName ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          downloadFile(doc);
                        }}
                        title={`Download ${doc.fileName}`}
                        aria-label={`Download ${doc.fileName}`}
                        className="size-6 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        saveSupportingDocs(customSupportingDocs.filter((_, i) => i !== index));
                      }}
                      title="Remove document"
                      aria-label="Remove document"
                      className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setAddModalCategory("supporting")}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-emerald-600 cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Supporting Document
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* L3 Bottom Status Footer */}
      <footer className="shrink-0 flex items-center justify-between border-t bg-background px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              allRequiredChecked ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          <span>
            {allRequiredChecked
              ? `${node.title.toUpperCase()} is ready to release.`
              : "Complete and verify all required documents to release this node."}
          </span>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground">
          <span>L3 · Execution Layer</span> · R2 Document Sync
        </p>
      </footer>

      {/* Add Document Modal */}
      <AddDocumentModal
        open={addModalCategory !== null}
        category={addModalCategory}
        onClose={() => setAddModalCategory(null)}
        onAdd={(newDoc) => {
          if (newDoc.category === "legal") {
            saveLegalDocs([...customLegalDocs, newDoc]);
          } else if (newDoc.category === "customer") {
            saveCustomerDocs([...customCustomerDocs, newDoc]);
          } else if (newDoc.category === "supporting") {
            saveSupportingDocs([...customSupportingDocs, newDoc]);
          }
        }}
      />
    </section>
  );
}
