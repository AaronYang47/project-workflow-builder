"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  FolderArchive,
  Layers3,
  Mail,
  Phone,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  executionItemIsGateRequired,
  executionItemProgress,
  getExecutionSummary,
} from "@/lib/execution";
import {
  isReferenceNodeType,
  type Condition,
  type DomainNode,
  type ExecutionItem,
} from "@/types/workflow";
import type { ProjectOperations } from "@/types/project-operations";
import { nodeReleaseReady } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  LayerContextMinimap,
  type ContextMapNode,
} from "./layer-context-minimap";
import { DetailedWorkflowDialog } from "./detailed-workflow-dialog";

export interface DocRecord {
  id: string;
  title: string;
  code?: string;
  category: "legal" | "supporting";
  status: "Required" | "Optional" | "Signed" | "Verified" | "Under Review";
  checked: boolean;
  required: boolean;
  notes?: string;
  sourceItemId?: string;
}

export function ExecutionView({
  nodeId,
  focusItemId,
  activeConditionId,
  onSelectCondition,
  onBack,
  onFocusNode,
}: {
  nodeId: string;
  focusItemId?: string | null;
  activeConditionId?: string | null;
  onSelectCondition?: (conditionId: string) => void;
  onBack: () => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const file = useWorkflowStore((state) => state.file);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const updateExecutionItem = useWorkflowStore(
    (state) => state.updateExecutionItem,
  );
  const [l2ContextOpen, setL2ContextOpen] = useState(false);

  const node = file.graph.nodes.find((item) => item.id === nodeId);
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

  // 1. Legal Documents & Supporting Documents Data Management
  const customLegalDocs: DocRecord[] = useMemo(() => {
    const raw = node?.customFields?.legalDocuments;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        // fallthrough
      }
    }
    // Default seed for legal documents if none customized yet
    return [
      {
        id: "legal-msa",
        title: "Master Services & Commercial Route Agreement",
        code: "LEG-MSA-01",
        category: "legal",
        status: "Signed",
        checked: true,
        required: true,
        notes: "Authorized commercial route engagement",
      },
      {
        id: "legal-nda",
        title: "Non-Disclosure & Confidentiality Agreement",
        code: "LEG-NDA-02",
        category: "legal",
        status: "Signed",
        checked: true,
        required: true,
      },
      {
        id: "legal-permit",
        title: "Statutory Authority & Regulatory Compliance Permit",
        code: "LEG-PERMIT-03",
        category: "legal",
        status: "Required",
        checked: false,
        required: true,
      },
    ];
  }, [node?.customFields?.legalDocuments]);

  const customSupportingDocs: DocRecord[] = useMemo(() => {
    const raw = node?.customFields?.supportingDocuments;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        // fallthrough
      }
    }
    // Default seed for supporting documents
    return [
      {
        id: "supp-spec",
        title: "Design Basis & Architectural Specification Package",
        code: "ENG-DWG-01",
        category: "supporting",
        status: "Verified",
        checked: true,
        required: true,
      },
      {
        id: "supp-site",
        title: "Site & Foundation Geotechnical Survey Report",
        code: "ENG-SITE-02",
        category: "supporting",
        status: "Verified",
        checked: true,
        required: true,
      },
      {
        id: "supp-estimate",
        title: "Class C / D Project Cost Estimate Model",
        code: "EST-COST-03",
        category: "supporting",
        status: "Required",
        checked: false,
        required: true,
      },
      {
        id: "supp-sow",
        title: "Scope of Work (SOW) & Responsibility Matrix",
        code: "OPS-SOW-04",
        category: "supporting",
        status: "Optional",
        checked: false,
        required: false,
      },
    ];
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

  const saveSupportingDocs = (docs: DocRecord[]) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        supportingDocuments: JSON.stringify(docs),
      },
    });
  };

  // 2. Customer Information Data Management
  const customerInfo = useMemo(() => {
    const fields = node?.customFields || {};
    const ops = file.operations;
    return {
      organizationName:
        String(fields.customerOrganization || fields.clientName || ops?.clientName || "").trim() ||
        "ProFab Global Energy Corp",
      primaryContact:
        String(fields.customerPrimaryContact || fields.contactName || "").trim() ||
        "Alexandre Martin",
      contactRole:
        String(fields.customerContactRole || fields.contactTitle || "").trim() ||
        "VP Technical Operations & Commercial Sponsor",
      contactEmail:
        String(fields.customerContactEmail || fields.email || "").trim() ||
        "a.martin@profab-energy.com",
      contactPhone:
        String(fields.customerContactPhone || fields.phone || "").trim() ||
        "+1 (514) 890-2100",
      ownerType:
        String(fields.customerOwnerType || fields.ownerType || "").trim() ||
        "Commercial Infrastructure",
      decisionAuthority:
        String(fields.customerDecisionAuthority || fields.decisionAuthority || "").trim() ||
        "Authorized Executive Committee",
      notes:
        String(fields.customerRequirements || fields.customerNotes || "").trim() ||
        "Client requires full statutory compliance certification with bilingual English/French execution records prior to production release.",
    };
  }, [node?.customFields, file.operations]);

  const saveCustomerField = (field: string, value: string) => {
    if (!node) return;
    updateNode(node.id, {
      customFields: {
        ...node.customFields,
        [field]: value,
      },
    });
  };

  // Toggle checks on execution items or custom docs
  const handleToggleExecutionItem = (item: ExecutionItem) => {
    updateExecutionItem(item.id, {
      checklistComplete: item.checklistComplete !== true,
    });
  };

  const layer2ContextNodes = useMemo<ContextMapNode[]>(() => {
    const positionCache = new Map<string, { x: number; y: number }>();
    const resolvePosition = (
      id: string,
      seen = new Set<string>(),
    ): { x: number; y: number } => {
      const cached = positionCache.get(id);
      if (cached) return cached;
      const layout = file.layout.nodes[id];
      if (!layout || seen.has(id)) return { x: 0, y: 0 };
      seen.add(id);
      const parent = layout.parentId
        ? resolvePosition(layout.parentId, seen)
        : { x: 0, y: 0 };
      const position = { x: parent.x + layout.x, y: parent.y + layout.y };
      positionCache.set(id, position);
      return position;
    };

    const rawNodes = file.graph.nodes
      .map((workflowNode, graphIndex) => {
        const position = resolvePosition(workflowNode.id);
        const supportingSourceXs = isReferenceNodeType(workflowNode.type)
          ? file.graph.edges
              .filter((edge) => edge.target === workflowNode.id)
              .map((edge) => resolvePosition(edge.source).x)
          : [];
        return {
          id: workflowNode.id,
          label: workflowNode.title,
          rawX: position.x,
          orderX: supportingSourceXs.length
            ? Math.max(...supportingSourceXs) + 0.5
            : position.x,
          graphIndex,
          width: 180,
          height: 96,
          color:
            workflowNode.color || getNodeDefinition(workflowNode.type).color,
          active: workflowNode.id === nodeId,
          container: workflowNode.type === "phase",
          type: workflowNode.type,
        };
      })
      .sort(
        (a, b) =>
          a.orderX - b.orderX || a.rawX - b.rawX || a.graphIndex - b.graphIndex,
      );
    return rawNodes.map((workflowNode, index) => {
      return {
        id: workflowNode.id,
        label: workflowNode.label,
        x: index * (workflowNode.width + 40),
        y: 100 - workflowNode.height / 2,
        width: workflowNode.width,
        height: workflowNode.height,
        color: workflowNode.color,
        active: workflowNode.active,
        container: workflowNode.container,
        type: workflowNode.type,
      };
    });
  }, [file.graph.edges, file.graph.nodes, file.layout.nodes, nodeId]);

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
  const supportingCheckedCount = customSupportingDocs.filter(
    (d) => d.checked,
  ).length;

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
            onClick={onBack}
            aria-label="Back to L2 Detailed Workflow"
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="size-3.5" />
            Back to L2
          </Button>
          <div className="min-w-0 border-l pl-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                L3 · Execution Layer
              </span>
              <span className="text-xs text-muted-foreground">/</span>
              <h1 className="truncate text-sm font-bold text-foreground">
                {node.title}
              </h1>
              <span className="rounded-md border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Required files
              </span>
            </div>
            {currentCondition ? (
              <p className="text-[11px] font-medium text-muted-foreground truncate max-w-md">
                Condition: <span className="font-semibold text-foreground">{currentCondition.label || currentCondition.description}</span>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setL2ContextOpen(true)}
            aria-label="Open L2 detailed workflow"
            title="Open L2 detailed workflow"
            className="h-8 gap-1.5 text-xs font-medium"
          >
            <Layers3 className="size-3.5 text-primary" />
            L2 Minimap
          </Button>
        </div>
      </header>

      {/* Conditions Selector Bar (if node has multiple conditions) */}
      {conditions.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background/50 px-4 py-2 scroll-thin sm:px-6">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Release Conditions:
          </span>
          {conditions.map((condition, idx) => {
            const isSelected =
              currentCondition?.id === condition.id ||
              (!currentCondition && idx === 0);
            return (
              <button
                key={condition.id || idx}
                type="button"
                onClick={() => onSelectCondition?.(condition.id || `condition-${idx}`)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary font-semibold shadow-2xs"
                    : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 items-center justify-center rounded-full text-[9px]",
                    condition.checked
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground border",
                  )}
                >
                  {condition.checked ? <Check className="size-2.5" /> : idx + 1}
                </span>
                <span className="truncate max-w-[14rem]">
                  {condition.label || condition.description || `Condition ${idx + 1}`}
                </span>
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
                    Contracts, statutory deeds & regulatory permits
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                {legalCheckedCount}/{customLegalDocs.length} Executed
              </span>
            </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
              {customLegalDocs.map((doc, index) => (
                <label
                  key={doc.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
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
                    className="mt-0.5 size-4 shrink-0 accent-indigo-600 rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        {doc.code || `LEG-0${index + 1}`}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase",
                          doc.checked
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                        )}
                      >
                        {doc.checked ? "Executed" : "Required"}
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
                </label>
              ))}

              {/* Items from execution layer belonging to this node that are documents */}
              {items.map((item) => {
                const checked =
                  executionItemProgress(item, file.operations, {
                    checklistOnly: true,
                  }) === "complete";
                return (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
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
                      className="mt-0.5 size-4 shrink-0 accent-indigo-600 rounded"
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
                  </label>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const newDoc: DocRecord = {
                    id: `legal-${Date.now()}`,
                    title: "New Statutory / Legal Execution Addendum",
                    code: `LEG-ADD-0${customLegalDocs.length + 1}`,
                    category: "legal",
                    status: "Required",
                    checked: false,
                    required: true,
                  };
                  saveLegalDocs([...customLegalDocs, newDoc]);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-600 cursor-pointer"
              >
                <Plus className="size-3.5" />
                Add Legal Document
              </button>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Box 2 (Center): Customer Information                         */}
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
                    Client profile, primary contacts & authorization
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 border border-sky-500/20">
                Profile Active
              </span>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-thin text-xs">
              <div>
                <label className="block font-semibold text-foreground mb-1 text-[11px]">
                  Customer / Organization Legal Name
                </label>
                <input
                  type="text"
                  defaultValue={customerInfo.organizationName}
                  onBlur={(e) =>
                    saveCustomerField("customerOrganization", e.target.value)
                  }
                  placeholder="e.g. ProFab Global Energy Corp"
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-foreground mb-1 text-[11px]">
                    Primary Contact Name
                  </label>
                  <input
                    type="text"
                    defaultValue={customerInfo.primaryContact}
                    onBlur={(e) =>
                      saveCustomerField("customerPrimaryContact", e.target.value)
                    }
                    placeholder="Full name"
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1 text-[11px]">
                    Contact Role & Title
                  </label>
                  <input
                    type="text"
                    defaultValue={customerInfo.contactRole}
                    onBlur={(e) =>
                      saveCustomerField("customerContactRole", e.target.value)
                    }
                    placeholder="e.g. VP Operations"
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-foreground mb-1 text-[11px]">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <input
                      type="email"
                      defaultValue={customerInfo.contactEmail}
                      onBlur={(e) =>
                        saveCustomerField("customerContactEmail", e.target.value)
                      }
                      placeholder="client@company.com"
                      className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1 text-[11px]">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <input
                      type="tel"
                      defaultValue={customerInfo.contactPhone}
                      onBlur={(e) =>
                        saveCustomerField("customerContactPhone", e.target.value)
                      }
                      placeholder="+1 (555) 000-0000"
                      className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-foreground mb-1 text-[11px]">
                    Owner / Facility Type
                  </label>
                  <select
                    defaultValue={customerInfo.ownerType}
                    onChange={(e) =>
                      saveCustomerField("customerOwnerType", e.target.value)
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  >
                    <option value="Commercial Infrastructure">Commercial Infrastructure</option>
                    <option value="Industrial Process Plant">Industrial Process Plant</option>
                    <option value="Institutional / Healthcare">Institutional / Healthcare</option>
                    <option value="Residential Multi-Unit">Residential Multi-Unit</option>
                    <option value="Public / Statutory Entity">Public / Statutory Entity</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1 text-[11px]">
                    Decision Authority / Signer
                  </label>
                  <input
                    type="text"
                    defaultValue={customerInfo.decisionAuthority}
                    onBlur={(e) =>
                      saveCustomerField("customerDecisionAuthority", e.target.value)
                    }
                    placeholder="Authorized signatory"
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1 text-[11px]">
                  Customer Specific Requirements & Notes
                </label>
                <textarea
                  rows={3}
                  defaultValue={customerInfo.notes}
                  onBlur={(e) =>
                    saveCustomerField("customerRequirements", e.target.value)
                  }
                  placeholder="Special instructions, delivery constraints, or site conditions..."
                  className="w-full rounded-md border bg-background p-2.5 text-xs font-medium leading-relaxed text-foreground outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-sky-500/[0.06] border border-sky-500/20 p-2 text-[11px] text-sky-800 dark:text-sky-200">
                <CheckCircle2 className="size-3.5 shrink-0 text-sky-600" />
                <span>Customer profile is saved and linked with this L2 node.</span>
              </div>
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
                    Engineering packages, estimates, specs & evidence
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {supportingCheckedCount}/{customSupportingDocs.length} Verified
              </span>
            </header>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
              {customSupportingDocs.map((doc, index) => (
                <label
                  key={doc.id}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
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
                    className="mt-0.5 size-4 shrink-0 accent-emerald-600 rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                        {doc.code || `SUP-0${index + 1}`}
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase",
                          doc.checked
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-slate-400/15 text-slate-600 dark:text-slate-400",
                        )}
                      >
                        {doc.checked ? "Verified" : doc.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-snug text-foreground">
                      {doc.title}
                    </p>
                  </div>
                </label>
              ))}

              <button
                type="button"
                onClick={() => {
                  const newDoc: DocRecord = {
                    id: `supp-${Date.now()}`,
                    title: "Technical Calculation & Vendor Evidence Sheet",
                    code: `ENG-VND-0${customSupportingDocs.length + 1}`,
                    category: "supporting",
                    status: "Required",
                    checked: false,
                    required: true,
                  };
                  saveSupportingDocs([...customSupportingDocs, newDoc]);
                }}
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
              releaseReady ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
          <span>
            {releaseReady
              ? `${node.title.toUpperCase()} is ready to release.`
              : "Complete and verify required documents to release this node."}
          </span>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground">
          L3 Interface · 3-Box Architecture
        </p>
      </footer>

      {/* L2 Minimap Dialog */}
      <DetailedWorkflowDialog
        open={l2ContextOpen}
        onOpenChange={setL2ContextOpen}
      >
        <div className="h-full overflow-auto bg-canvas p-4">
          <LayerContextMinimap
            level="L2"
            title="Detailed Workflow"
            nodes={layer2ContextNodes}
            edges={file.graph.edges}
            activeLabel={node.title}
            onOpenParent={onBack}
            onOpenNode={(targetNodeId) => {
              if (!targetNodeId) return;
              useWorkflowStore.getState().selectNodes([targetNodeId]);
              setL2ContextOpen(false);
              onFocusNode?.(targetNodeId);
            }}
            expandable
            className="w-full"
          />
        </div>
      </DetailedWorkflowDialog>
    </section>
  );
}

