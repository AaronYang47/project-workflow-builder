"use client";
import { conditionDurationLabel } from "@/lib/condition-duration";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, FolderArchive, Scale, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { executionItemProgress, getExecutionSummary } from "@/lib/execution";
import { type ExecutionItem } from "@/types/workflow";
import {
  conditionHasL3Forms,
  conditionIsSatisfied,
  nodeReleaseReady,
  releaseConditionBlocker,
} from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { blockIfOutOfSequence } from "@/store/sequence-guard";
import { cn } from "@/lib/utils";
import { fobYardSkippedIds } from "@/lib/fob-yard";
import { isCustomerSelectionForm } from "@/lib/falcon-customer-intelligence";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import { releaseConditionForms } from "@/lib/release-condition-forms";
import {
  CustomerSelectionForm,
  customerFormIsComplete,
} from "@/components/workflow/customer-selection-form";
import { AddDocumentModal } from "./execution/add-document-modal";
import type { DocRecord } from "./execution/doc-record";
import { DOCUMENT_BOX_THEMES, DocumentBox } from "./execution/document-box";
import { CustomerInfoBox } from "./execution/customer-info-box";

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
  const updateExecutionItem = useWorkflowStore((state) => state.updateExecutionItem);
  const [addModalCategory, setAddModalCategory] = useState<
    "legal" | "customer" | "supporting" | null
  >(null);
  const [selectionFormDocId, setSelectionFormDocId] = useState<string | null>(null);

  const node = file.graph.nodes.find((item) => item.id === nodeId);
  const highLevelNodes = useWorkflowStore((state) => state.file.highLevel?.graph.nodes ?? []);

  const owningL1Node = useMemo(() => {
    if (!nodeId) return null;
    const directOwner = highLevelNodes.find((hl) => {
      const ids = hl.linkedLayer2NodeIds ?? hl.linkedDetailedNodeIds ?? [];
      return ids.includes(nodeId);
    });
    if (directOwner) return directOwner;

    // Check if node.config.stage matches any high level node
    if (node?.config?.stage && typeof node.config.stage === "string" && node.config.stage.trim()) {
      const match = highLevelNodes.find(
        (hl) =>
          hl.title.trim().toLowerCase() === (node.config.stage as string).trim().toLowerCase(),
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
  }, [highLevelNodes, nodeId, node, file.layout.nodes, file.graph.nodes]);

  const l1Title = owningL1Node?.title?.trim() || "High Level";

  const l1Color = useMemo(() => {
    if (!owningL1Node) return undefined;
    if (owningL1Node.backgroundColor && owningL1Node.backgroundColor !== "transparent") {
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
      return conditions.find((c) => c.id === activeConditionId) || conditions[0];
    }
    return conditions[0];
  }, [conditions, activeConditionId]);
  const currentConditionIndex = currentCondition ? conditions.indexOf(currentCondition) : -1;
  const activeConditionKey =
    currentCondition?.id?.trim() ||
    (currentConditionIndex >= 0 ? currentConditionIndex : undefined);
  const currentConditionHasL3Forms = Boolean(
    node && currentCondition && conditionHasL3Forms(currentCondition, node),
  );

  const l2Title = node?.title?.trim() || "Detailed Workflow";
  const l3Title =
    currentCondition?.label?.trim() || currentCondition?.description?.trim() || "Execution Layer";

  // L3 documents belong to a specific release condition. Keep the legacy
  // node-level key visible only for the first condition so existing projects
  // migrate without making one condition's files appear in every condition.
  const firstConditionId = conditions[0]?.id;
  const conditionStorageKey = currentCondition?.id?.trim() || "default";
  const useLegacyDocumentKeys =
    conditions.length === 0 || currentCondition?.id === firstConditionId;
  const customFieldForCondition = useCallback(
    (field: string) =>
      node?.customFields?.[`${field}::release-condition::${conditionStorageKey}`] ??
      (useLegacyDocumentKeys ? node?.customFields?.[field] : undefined),
    [node?.customFields, conditionStorageKey, useLegacyDocumentKeys],
  );

  const items = useMemo(
    () => (file.execution?.items || []).filter((item) => item.linkedLayer2NodeId === nodeId),
    [file.execution?.items, nodeId],
  );
  // A release condition may link to one execution task. Keep the chapter-wide
  // item list for the progress summary, but only use the selected condition's
  // linked task when calculating its L2 completion state.
  const conditionItems = useMemo(() => {
    if (!currentCondition) return [];
    if (currentCondition.linkedExecutionItemId) {
      return items.filter((item) => item.id === currentCondition.linkedExecutionItemId);
    }
    // Older workflows can have node-level tasks without condition links.
    const hasConditionLinks = conditions.some((condition) => condition.linkedExecutionItemId);
    return hasConditionLinks ? [] : items;
  }, [conditions, currentCondition, items]);

  const projectStartNode = file.graph.nodes.find((item) => item.type === "projectStart");

  const summary = getExecutionSummary(nodeId, file.execution?.items, file.operations, {
    checklistOnly: true,
  });

  const releaseReady = node
    ? nodeReleaseReady(node, projectStartNode, file.execution?.items, file.operations)
    : false;

  // 1. Required Documents Data
  const customLegalDocs: DocRecord[] = useMemo(
    () => (node ? releaseConditionForms(node, currentCondition) : []),
    [node, currentCondition],
  );

  // 2. Customer Information Forms Data (Redesigned as Form/Doc List)
  const customCustomerDocs: DocRecord[] = useMemo(() => {
    const raw = customFieldForCondition("customerDocuments");
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
  }, [customFieldForCondition]);

  // 3. Supporting Documents Data
  const customSupportingDocs: DocRecord[] = useMemo(() => {
    const raw = customFieldForCondition("supportingDocuments");
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
  }, [customFieldForCondition]);

  const saveLegalDocs = (docs: DocRecord[]) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        [`legalDocuments::release-condition::${conditionStorageKey}`]: JSON.stringify(docs),
      },
    });
  };

  const saveCustomerDocs = useCallback(
    (docs: DocRecord[]) => {
      if (!node) return;
      updateNode(node.id, {
        customFields: {
          ...node.customFields,
          [`customerDocuments::release-condition::${conditionStorageKey}`]: JSON.stringify(docs),
        },
      });
    },
    [node, updateNode, conditionStorageKey],
  );

  const skippedFormAutoCheck = useRef(new Set<string>());
  useEffect(() => {
    if (!node) return;
    const next: DocRecord[] = customCustomerDocs.map((doc) => {
      if (!isCustomerSelectionForm(doc)) return doc;
      const complete = customerFormIsComplete(doc.customerProfile, doc.customerForm);
      if (!complete) {
        skippedFormAutoCheck.current.delete(doc.id);
        if (!doc.checked) return doc;
        return {
          ...doc,
          checked: false,
          status: (doc.required ? "Required" : "Optional") as DocRecord["status"],
        };
      }
      if (doc.checked || skippedFormAutoCheck.current.has(doc.id)) return doc;
      // Out of sequence: leave it for the user (ticking shows why it's blocked).
      if (releaseConditionBlocker(useWorkflowStore.getState().file, node.id, activeConditionKey))
        return doc;
      return { ...doc, checked: true, status: "Verified" as const };
    });
    const changed = next.some(
      (doc, index) =>
        doc.checked !== customCustomerDocs[index]?.checked ||
        doc.status !== customCustomerDocs[index]?.status,
    );
    if (changed) saveCustomerDocs(next);
  }, [activeConditionKey, customCustomerDocs, node, saveCustomerDocs]);

  const saveSupportingDocs = (docs: DocRecord[]) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        [`supportingDocuments::release-condition::${conditionStorageKey}`]: JSON.stringify(docs),
      },
    });
  };

  const requiredDocs = useMemo(
    () => [
      ...customLegalDocs.filter((d) => d.required),
      ...customCustomerDocs.filter((d) => d.required),
      ...customSupportingDocs.filter((d) => d.required),
    ],
    [customLegalDocs, customCustomerDocs, customSupportingDocs],
  );

  const hasRequiredForms = requiredDocs.length > 0 || conditionItems.length > 0;

  // A condition passes only when its own required documents and linked tasks pass.
  const allRequiredChecked = useMemo(() => {
    if (!hasRequiredForms) return false;

    const docsChecked = requiredDocs.length === 0 || requiredDocs.every((d) => d.checked);
    const itemsChecked =
      conditionItems.length === 0 ||
      conditionItems.every(
        (item) =>
          executionItemProgress(item, file.operations, { checklistOnly: true }) === "complete",
      );

    return docsChecked && itemsChecked;
  }, [hasRequiredForms, requiredDocs, conditionItems, file.operations]);

  // Keep every linked L2 condition in sync with its own L3 task and required
  // documents. This also repairs older saved projects where a task was checked
  // before the condition flag was written.
  useEffect(() => {
    if (!node || !conditions.length) return;
    let changed = false;
    const updatedConditions = conditions.map((condition, index) => {
      if (!condition.linkedExecutionItemId) return condition;
      const linkedItem = file.execution?.items.find(
        (item) => item.id === condition.linkedExecutionItemId,
      );
      if (!linkedItem) return condition;
      const blocked = Boolean(releaseConditionBlocker(file, node.id, condition.id || index));

      const fields = ["customerDocuments", "supportingDocuments"];
      const documents = [
        ...releaseConditionForms(node, condition),
        ...fields.flatMap((field) => {
          const key = `${field}::release-condition::${condition.id?.trim() || "default"}`;
          const raw =
            node.customFields?.[key] ?? (index === 0 ? node.customFields?.[field] : undefined);
          if (typeof raw !== "string") return [];
          try {
            const docs = JSON.parse(raw);
            return Array.isArray(docs) ? docs : [];
          } catch {
            return [];
          }
        }),
      ];
      const requiredDocuments = documents.filter((doc) => doc.required !== false);
      const documentsComplete = requiredDocuments.every((doc) => doc.checked);
      // Specified Forms are the checklist for this step, not a second task
      // checkbox that the user must also tick inside Required Documents.
      if (
        documents.length &&
        linkedItem.checklistComplete !== documentsComplete &&
        (!documentsComplete || !blocked)
      ) {
        updateExecutionItem(linkedItem.id, { checklistComplete: documentsComplete });
      }
      const taskComplete = documents.length
        ? documentsComplete
        : executionItemProgress(linkedItem, file.operations, { checklistOnly: true }) ===
          "complete";
      const complete = taskComplete && requiredDocuments.every((doc) => doc.checked);
      const nextChecked = complete && blocked ? condition.checked === true : complete;
      if (condition.checked === nextChecked) return condition;
      changed = true;
      return { ...condition, checked: nextChecked };
    });
    if (changed) updateNode(node.id, { conditions: updatedConditions });
  }, [conditions, file, node, updateNode, updateExecutionItem]);

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

  const targetL2Id = node?.id || nodeId;
  const handleNavigateToL2 = () => {
    if (targetL2Id && onFocusNode) {
      onFocusNode(targetL2Id);
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

  const sequenceBlocker = releaseConditionBlocker(file, node.id, activeConditionKey)?.message;
  const blockCurrentCondition = () => blockIfOutOfSequence(node.id, activeConditionKey);
  const fobYardSkipped = fobYardSkippedIds(file).l2.has(node.id);

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

              <span className="text-muted-foreground/60 text-xs font-sans font-normal select-none">
                &gt;
              </span>

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

              <span className="text-muted-foreground/60 text-xs font-sans font-normal select-none">
                &gt;
              </span>

              <h1
                className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold text-violet-600 dark:text-violet-400 truncate p-0 m-0"
                title={`L3 ${l3Title}`}
              >
                <span>L3</span>
                <span>{l3Title}</span>
              </h1>

              {currentCondition
                ? (() => {
                    const isJobNumberCondition = currentCondition.id === "project-id-required";
                    const currentConditionChecked =
                      isJobNumberCondition && node
                        ? conditionIsSatisfied(
                            currentCondition,
                            node,
                            projectStartNode,
                            file.execution?.items,
                            file.operations,
                          )
                        : Boolean(currentCondition.checked);
                    return (
                      <button
                        type="button"
                        aria-label={currentConditionChecked ? "Uncheck step" : "Check step"}
                        title={
                          isJobNumberCondition
                            ? "Automatically checked when a complete Job Number is entered (no form required)"
                            : currentConditionChecked
                              ? "Uncheck step"
                              : "Mark step complete"
                        }
                        disabled={
                          isJobNumberCondition ||
                          (currentConditionHasL3Forms &&
                            !(sequenceBlocker && !currentCondition.checked))
                        }
                        onClick={() => {
                          if (isJobNumberCondition) return;
                          if (!currentCondition.checked && blockCurrentCondition()) return;
                          const nextChecked = !currentCondition.checked;
                          const updatedConditions = (node.conditions || []).map((c) =>
                            c.id === currentCondition.id ? { ...c, checked: nextChecked } : c,
                          );
                          updateNode(node.id, { conditions: updatedConditions });
                        }}
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors cursor-pointer ml-0.5",
                          currentConditionChecked
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : currentConditionHasL3Forms
                              ? "condition-forms-breathe bg-amber-500 text-white"
                              : "border-border bg-background hover:border-primary",
                        )}
                      >
                        <Check className={cn("size-3", !currentConditionChecked && "opacity-0")} />
                      </button>
                    );
                  })()
                : null}

              <span className="rounded-md border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground font-sans">
                Condition requirements
              </span>
              {currentCondition?.id === "project-id-required" ? (
                <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary font-sans">
                  No form required · Auto from Job Number
                </span>
              ) : null}
            </div>
            {currentCondition?.description && currentCondition.description.trim() !== l3Title ? (
              <p className="text-[11px] font-medium text-muted-foreground truncate max-w-md mt-0.5">
                Condition:{" "}
                <span className="font-semibold text-foreground">
                  {currentCondition.description.trim()}
                </span>
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
      {fobYardSkipped ? (
        <p
          data-fob-yard-skipped-notice
          className="shrink-0 border-b bg-slate-500/10 px-4 py-2 text-xs font-semibold text-slate-600 sm:px-6 dark:text-slate-300"
        >
          Skipped · FOB yard — Final Close has FOB yard on, so this Phase is not part of this
          project and is left out of the schedule and PDFs.
        </p>
      ) : null}

      {sequenceBlocker ? (
        <p
          role="status"
          className="shrink-0 border-b border-amber-500/25 bg-amber-500/10 px-6 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          {sequenceBlocker}
        </p>
      ) : null}

      {/* Conditions Selector Bar with Green Breathing Light on Pass */}
      {conditions.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background/50 px-4 py-2 scroll-thin sm:px-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Steps:
          </span>
          {conditions.map((condition, idx) => {
            const isSelected =
              currentCondition?.id === condition.id || (!currentCondition && idx === 0);
            const isPassed =
              node && (condition.id === "project-id-required" || condition.required !== false)
                ? conditionIsSatisfied(
                    condition,
                    node,
                    projectStartNode,
                    file.execution?.items,
                    file.operations,
                  ) ||
                  (isSelected && allRequiredChecked)
                : Boolean(condition.checked) || (isSelected && allRequiredChecked);
            const hasL3Forms = node ? conditionHasL3Forms(condition, node) : false;
            const pillKey = condition.id?.trim() || idx;
            const pillBlocked = Boolean(
              node && !isPassed && releaseConditionBlocker(file, node.id, pillKey),
            );

            return (
              <button
                key={condition.id || idx}
                type="button"
                onClick={() => onSelectCondition?.(condition.id || `condition-${idx}`)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-300 cursor-pointer border",
                  isPassed
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold condition-breathe-glow"
                    : hasL3Forms
                      ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold condition-forms-breathe"
                      : isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold shadow-2xs"
                        : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  role="checkbox"
                  aria-checked={Boolean(isPassed)}
                  aria-disabled={hasL3Forms && !pillBlocked}
                  title={
                    isPassed ? "Click to uncheck condition" : "Click to mark condition complete"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPassed && node && blockIfOutOfSequence(node.id, pillKey)) return;
                    if (hasL3Forms) return;
                    const nextChecked = !isPassed;
                    const updatedConditions = (node.conditions || []).map((c, i) =>
                      c.id === condition.id || (!c.id && i === idx)
                        ? { ...c, checked: nextChecked }
                        : c,
                    );
                    updateNode(node.id, { conditions: updatedConditions });
                  }}
                  className={cn(
                    "flex size-3.5 items-center justify-center rounded-full text-[9px] cursor-pointer hover:scale-110 transition-transform",
                    isPassed
                      ? "bg-emerald-600 text-white"
                      : hasL3Forms
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-muted text-muted-foreground border hover:border-primary",
                  )}
                >
                  {isPassed ? <Check className="size-2.5" /> : idx + 1}
                </span>
                <span className="truncate max-w-[14rem]">
                  {conditionDurationLabel(condition)
                    ? `${conditionDurationLabel(condition)} · `
                    : ""}
                  {condition.label || condition.description || `Condition ${idx + 1}`}
                </span>
                {isPassed ? <Sparkles className="size-3 text-emerald-500 animate-pulse" /> : null}
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
        {conditionItems.length > 0 &&
        customLegalDocs.length + customCustomerDocs.length + customSupportingDocs.length === 0 ? (
          <div className="mb-4 rounded-xl border bg-card p-3">
            {conditionItems.length > 0 ? (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 mt-3">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Execution Requirements
                </h3>
                <p className="mb-2 text-[10px] text-muted-foreground">
                  Complete this step when its execution requirements are satisfied.
                </p>
              </div>
            ) : null}
            {conditionItems.map((item) => {
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
                    aria-label={`Required task: ${item.title || item.type}`}
                    checked={checked}
                    onChange={() => {
                      if (!checked && blockCurrentCondition()) return;
                      handleToggleExecutionItem(item);
                    }}
                    title={sequenceBlocker}
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
          </div>
        ) : null}
        <div className="grid h-full min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ============================================================ */}
          {/* Box 1 (Left): Required Documents                                */}
          {/* ============================================================ */}
          <DocumentBox
            title="Required Documents"
            subtitle="Forms / Documents for this step"
            icon={<Scale className="size-4" />}
            theme={DOCUMENT_BOX_THEMES.indigo}
            docs={customLegalDocs}
            checkedLabel="Executed"
            codeFallback={() => "FORM"}
            lockedReason={sequenceBlocker}
            onBlocked={blockCurrentCondition}
            emptyTitle="No required documents added yet."
            addLabel="Add Required Document"
            onSave={saveLegalDocs}
            onAdd={() => setAddModalCategory("legal")}
          />
          {/* ============================================================ */}
          {/* Box 2 (Center): Customer Information (Form/Doc List)         */}
          {/* ============================================================ */}
          <CustomerInfoBox
            docs={customCustomerDocs}
            lockedReason={sequenceBlocker}
            onBlocked={blockCurrentCondition}
            onSave={saveCustomerDocs}
            onOpenForm={setSelectionFormDocId}
            onSelectionFormToggled={(docId, checked) => {
              if (checked) skippedFormAutoCheck.current.delete(docId);
              else skippedFormAutoCheck.current.add(docId);
            }}
            onAdd={() => setAddModalCategory("customer")}
          />

          {/* ============================================================ */}
          {/* Box 3 (Right): Supporting Documents                          */}
          {/* ============================================================ */}
          <DocumentBox
            title="Supporting Documents"
            subtitle="Engineering drawings, calculations & evidence"
            icon={<FolderArchive className="size-4" />}
            theme={DOCUMENT_BOX_THEMES.emerald}
            docs={customSupportingDocs}
            checkedLabel="Verified"
            codeFallback={(index) => `SUP-0${index + 1}`}
            lockedReason={sequenceBlocker}
            onBlocked={blockCurrentCondition}
            emptyTitle="No supporting documents added yet."
            addLabel="Add Supporting Document"
            onSave={saveSupportingDocs}
            onAdd={() => setAddModalCategory("supporting")}
          />
        </div>
      </div>

      {/* L3 Bottom Status Footer */}
      <footer className="shrink-0 flex items-center justify-between border-t bg-background px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              releaseReady || allRequiredChecked ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          <span>
            {releaseReady
              ? `${node.title.toUpperCase()} is ready to release.`
              : allRequiredChecked
                ? "This step is complete. Complete the remaining department requirements to release this node."
                : "Complete this step’s required documents and tasks to continue."}
          </span>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground">
          <span>L3 · Execution Layer</span> · R2 Document Sync
        </p>
      </footer>

      {/* Add Document Modal */}
      {addModalCategory ? (
        <AddDocumentModal
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
      ) : null}
      {(() => {
        const selectionFormDoc = customCustomerDocs.find((doc) => doc.id === selectionFormDocId);
        if (!selectionFormDoc) return null;
        return (
          <CustomerSelectionForm
            key={selectionFormDoc.id}
            open
            leadNumber={workflowLegacyJobNumber(file)}
            initialName={selectionFormDoc.customerName || ""}
            initialProfile={selectionFormDoc.customerProfile}
            initialAnswers={selectionFormDoc.customerForm}
            onClose={() => setSelectionFormDocId(null)}
            onSave={({ customerCategory, customerName, customerProfile, customerForm }) => {
              if (!node) return;
              const complete = customerFormIsComplete(customerProfile, customerForm);
              const blockedBySequence = Boolean(
                releaseConditionBlocker(
                  useWorkflowStore.getState().file,
                  node.id,
                  activeConditionKey,
                ),
              );
              const nextChecked = complete && !blockedBySequence ? true : selectionFormDoc.checked;
              if (complete && !blockedBySequence) {
                skippedFormAutoCheck.current.delete(selectionFormDoc.id);
              }
              const updatedDocs = customCustomerDocs.map((doc) =>
                doc.id === selectionFormDoc.id
                  ? {
                      ...doc,
                      customerCategory,
                      customerName,
                      customerProfile,
                      customerForm,
                      notes: `${customerName} · ${customerForm.decisionAuthority || "Sales"} · ${customerForm.siteMunicipality || customerForm.siteStatus}`,
                      checked: nextChecked,
                      required: true,
                      status: nextChecked ? "Verified" : "Required",
                    }
                  : doc,
              );
              const docsKey = `customerDocuments::release-condition::${conditionStorageKey}`;
              const customerIdentityFields = {
                customerName,
                customerCompanyId: customerProfile.companyId,
                customerCategory,
                customerContactName: customerForm.decisionMakerName,
                customerSiteLocation: customerForm.siteMunicipality,
                customerProjectType: customerForm.designStage,
              };
              updateNode(node.id, {
                customFields: {
                  ...node.customFields,
                  [docsKey]: JSON.stringify(updatedDocs),
                  ...(projectStartNode?.id === node.id ? customerIdentityFields : {}),
                },
              });
              if (projectStartNode && projectStartNode.id !== node.id) {
                updateNode(projectStartNode.id, {
                  customFields: {
                    ...projectStartNode.customFields,
                    ...customerIdentityFields,
                  },
                });
              }
              const leadNumber = workflowLegacyJobNumber(useWorkflowStore.getState().file);
              if (leadNumber) {
                void fetch(`/api/falcon/leads/${encodeURIComponent(leadNumber)}`, {
                  method: "PUT",
                  credentials: "include",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    customer: customerProfile,
                    form: customerForm,
                    projectId: useWorkflowStore.getState().activeProjectId,
                  }),
                }).catch(() => undefined);
              }
              setSelectionFormDocId(null);
              if (complete && blockedBySequence) {
                blockCurrentCondition();
              }
            }}
          />
        );
      })()}
    </section>
  );
}
