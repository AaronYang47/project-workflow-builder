"use client";

import { Fragment } from "react";
import {
  Boxes,
  Building2,
  CheckCircle2,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ComponentNoteButton } from "./component-note-button";
import { GATE_PANEL_WIDTH, type GateLayoutMetrics } from "@/lib/gate-layout";
import {
  projectNodeUuid,
  sanitizeBuildingCode,
  sanitizeModuleCode,
} from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";
import { textareaRows } from "./node-utils";
import type { DomainNode, OutcomeHandle } from "@/types/workflow";

export interface GateProjectStart {
  serviceType: string;
  buildingCode: string;
  moduleCode: string;
  paidMissingBuilding: boolean;
  paidMissingModule: boolean;
}

export interface GateInterfaceText {
  decisionTitle: string;
  decisionSubtitle: string;
  departmentLabel: string;
  approverLabel: string;
  detailsNeededLabel: string;
}

/**
 * The bottom card of a Gate node: shows the approval department/approver,
 * optionally the project's paid-service codes, and the YES / NO outcome
 * rows that React Flow connects to.
 */
export function DecisionCard({
  node,
  metrics,
  interfaceText,
  approvedDepartment,
  approvedBy,
  approvalReady,
  checklistSatisfied,
  decisionState,
  decisionStyle,
  projectStart,
  projectStartNodeId,
  outcomes,
  saveApprovalField,
  onChangeLocationCode,
}: {
  node: DomainNode;
  metrics: GateLayoutMetrics & {
    decisionTop: number;
    conditionsLeft: number;
    contentHeight?: number;
    height: number;
  };
  interfaceText: GateInterfaceText;
  approvedDepartment: string;
  approvedBy: string;
  approvalReady: boolean;
  checklistSatisfied: boolean;
  decisionState: string;
  decisionStyle: { card: string };
  projectStart: GateProjectStart;
  projectStartNodeId: string | undefined;
  outcomes: OutcomeHandle[];
  saveApprovalField: (
    field: "approvedDepartment" | "approvedBy",
    value: string,
  ) => void;
  onChangeLocationCode: (
    field: "buildingCode" | "moduleCode",
    value: string,
  ) => void;
}) {
  const projectStartNode = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "projectStart"),
  );
  const nodeUuid = projectNodeUuid(node, projectStartNode);
  const yes = outcomes.find((outcome) => outcome.id === "yes");
  return (
    <Fragment>
    <div
      className="absolute"
      style={{
        left: metrics.conditionsLeft,
        top: metrics.decisionTop,
        width: GATE_PANEL_WIDTH,
      }}
    >
    <section
      data-completion-state={decisionState}
      data-decision-content=""
      aria-label="Approval decision card"
      className={cn(
        "l2-node-card relative min-h-[272px] w-full overflow-visible rounded-2xl border px-3 pb-7 pt-3 shadow-[0_8px_24px_rgba(15,23,42,.10)] transition-colors",
        decisionStyle.card,
      )}
    >
      <div data-decision-header className="mb-2 flex min-h-7 items-center gap-1">
        <span className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
          <ShieldCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            data-inspector-target="config.decisionTitle"
            className="block text-xs font-black uppercase tracking-[0.14em] text-foreground"
          >
            {interfaceText.decisionTitle}
          </span>
          <span
            data-inspector-target="config.decisionSubtitle"
            className="mt-0.5 block text-[11px] font-medium text-muted-foreground"
          >
            {interfaceText.decisionSubtitle}
          </span>
        </span>
        <ComponentNoteButton
          nodeId={node.id}
          noteKey="decision"
          label={`${node.title} decision`}
          className="ml-auto"
        />
        <span
          data-inspector-target="config.detailsNeededLabel"
          className={cn(
            "ml-1 shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
            approvalReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
          )}
        >
          {approvalReady ? "Ready" : interfaceText.detailsNeededLabel}
        </span>
      </div>
      <div data-decision-fields className="nodrag mb-2 grid grid-cols-2 gap-2">
        <label
          data-inspector-target="config.departmentLabel"
          className={cn(
            "block rounded-lg border bg-background/80 px-2.5 py-1.5 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
            checklistSatisfied && !approvedDepartment && "border-amber-400",
          )}
        >
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Building2 className="size-3" />
            {interfaceText.departmentLabel} *
          </span>
          <textarea
            aria-label="Approved department"
            defaultValue={approvedDepartment}
            rows={textareaRows(approvedDepartment, 38, 1)}
            onBlur={(event) =>
              saveApprovalField("approvedDepartment", event.target.value)
            }
            placeholder="e.g. Finance"
            className="min-h-6 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-xs font-semibold leading-5 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        </label>
        <label
          data-inspector-target="config.approverLabel"
          className={cn(
            "block rounded-lg border bg-background/80 px-2.5 py-1.5 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
            checklistSatisfied && !approvedBy && "border-amber-400",
          )}
        >
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <UserRound className="size-3" />
            {interfaceText.approverLabel} *
          </span>
          <textarea
            aria-label="Approved by"
            defaultValue={approvedBy}
            rows={textareaRows(approvedBy, 38, 1)}
            onBlur={(event) =>
              saveApprovalField("approvedBy", event.target.value)
            }
            placeholder="Name"
            className="min-h-6 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-xs font-semibold leading-5 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        </label>
      </div>
      {projectStart.serviceType === "Paid Service" && projectStartNodeId ? (
        <div
          data-decision-service-codes
          className="nodrag mb-2 grid grid-cols-2 gap-2"
        >
          <label
            className={cn(
              "block rounded-lg border bg-background/80 px-2.5 py-1.5 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
              projectStart.paidMissingBuilding && "border-amber-400",
            )}
          >
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Building2 className="size-3" />
              Building (B-XX) *
            </span>
            <input
              aria-label="Building code (from Decision card)"
              value={projectStart.buildingCode}
              onChange={(event) =>
                onChangeLocationCode(
                  "buildingCode",
                  sanitizeBuildingCode(event.target.value),
                )
              }
              placeholder="B-01"
              className="min-h-6 w-full border-0 bg-transparent p-0 font-mono text-xs font-semibold leading-5 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </label>
          <label
            className={cn(
              "block rounded-lg border bg-background/80 px-2.5 py-1.5 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
              projectStart.paidMissingModule && "border-amber-400",
            )}
          >
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Boxes className="size-3" />
              Module (M-XXX) *
            </span>
            <input
              aria-label="Module code (from Decision card)"
              value={projectStart.moduleCode}
              onChange={(event) =>
                onChangeLocationCode(
                  "moduleCode",
                  sanitizeModuleCode(event.target.value),
                )
              }
              placeholder="M-001"
              className="min-h-6 w-full border-0 bg-transparent p-0 font-mono text-xs font-semibold leading-5 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </label>
        </div>
      ) : null}
      <div data-decision-outcomes className="nodrag space-y-1.5">
        <div
          className={cn(
            "relative flex min-h-10 min-w-0 items-center overflow-visible rounded-lg border px-3 py-2 text-xs font-bold leading-5 transition",
            approvalReady
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "border-slate-200 bg-slate-50/70 text-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500",
          )}
        >
          <CheckCircle2 className="mr-2 size-4 shrink-0" />
          <span className="min-w-0 truncate">{yes?.label || "APPROVED"}</span>
          <span
            title={
              approvalReady
                ? `${approvedDepartment} · ${approvedBy}`
                : "Department and approver required"
            }
            className="ml-auto max-w-[170px] shrink truncate text-[10px] font-semibold"
          >
            {approvalReady
              ? `${approvedDepartment} · ${approvedBy}`
              : "DETAILS REQUIRED"}
          </span>
          <ComponentNoteButton
            nodeId={node.id}
            noteKey="outcome:yes"
            label={`${node.title} approved outcome`}
            className="ml-2 size-5"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="yes"
            title={
              approvalReady
                ? "Connect approved route"
                : "Connect route now; it becomes active after approval details are complete"
            }
            className="!right-[-10px] !z-50 !size-5 !border-[3px] !border-background !bg-emerald-600 !opacity-100"
          />
        </div>
        {outcomes
          .filter((outcome) => outcome.id !== "yes")
          .map((outcome) => (
            <div
              key={outcome.id}
              className={cn(
                "relative flex min-h-10 min-w-0 items-center overflow-visible rounded-lg border px-3 py-2 text-xs font-bold leading-5 transition",
                !checklistSatisfied
                  ? "border-rose-300 bg-rose-50 text-rose-800 shadow-sm dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                  : "border-slate-200 bg-slate-50/70 text-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500",
              )}
            >
              <XCircle className="mr-2 size-4 shrink-0" />
              <span className="min-w-0 truncate">
                {outcome.label || "DENIED"}
              </span>
              <span className="ml-auto max-w-[230px] shrink truncate text-[10px] font-semibold">
                {outcome.rule || "CONDITIONS NOT MET"}
              </span>
              <ComponentNoteButton
                nodeId={node.id}
                noteKey={`outcome:${outcome.id}`}
                label={`${node.title} ${outcome.label || "denied"} outcome`}
                className="ml-2 size-5"
              />
              <Handle
                type="source"
                position={Position.Right}
                id={outcome.id}
                title={`Connect ${outcome.label || "denied"} route`}
                className="!right-[-10px] !z-50 !size-5 !border-[3px] !border-background !bg-rose-600 !opacity-100"
              />
            </div>
          ))}
      </div>
    </section>
    {nodeUuid ? (
      <div
        className="nodrag pointer-events-none absolute right-0 z-10"
        style={{ top: "100%", marginTop: 6 }}
      >
        <span
          title={nodeUuid}
          className="whitespace-nowrap rounded bg-muted/70 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-muted-foreground shadow-sm"
        >
          UUID {nodeUuid.slice(0, 8)}
        </span>
      </div>
    ) : null}
    </div>
    </Fragment>
  );
}
