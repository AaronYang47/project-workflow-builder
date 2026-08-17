"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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
  const anchorFor = useCallback(
    (outcome: OutcomeHandle): { side: Position; offsetPercent: number } => {
      const anchor = outcome.anchor ?? "right";
      const offsetPercent = Math.max(
        0,
        Math.min(1, outcome.anchorOffset ?? 0.5),
      );
      return {
        side:
          anchor === "left"
            ? Position.Left
            : anchor === "top"
              ? Position.Top
              : anchor === "bottom"
                ? Position.Bottom
                : Position.Right,
        offsetPercent,
      };
    },
    [],
  );
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
        "relative min-h-[272px] w-full overflow-visible rounded-2xl border px-3 pb-7 pt-3 shadow-[0_8px_24px_rgba(15,23,42,.10)] transition-colors",
        decisionStyle.card,
      )}
    >
      <div data-decision-header className="mb-2 flex min-h-7 items-center gap-1">
        <span className="mr-2 flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
          <ShieldCheck className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            data-inspector-target="config.decisionTitle"
            className="block text-[9px] font-black uppercase tracking-[0.14em] text-foreground"
          >
            {interfaceText.decisionTitle}
          </span>
          <span
            data-inspector-target="config.decisionSubtitle"
            className="mt-0.5 block text-[7px] font-medium text-muted-foreground"
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
            "ml-1 shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[7px] font-black uppercase tracking-wider",
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
            "block rounded-lg border bg-background/80 px-2 py-1 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
            checklistSatisfied && !approvedDepartment && "border-amber-400",
          )}
        >
          <span className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
            <Building2 className="size-2.5" />
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
            className="min-h-6 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[9px] font-semibold leading-4 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
          />
        </label>
        <label
          data-inspector-target="config.approverLabel"
          className={cn(
            "block rounded-lg border bg-background/80 px-2 py-1 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
            checklistSatisfied && !approvedBy && "border-amber-400",
          )}
        >
          <span className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
            <UserRound className="size-2.5" />
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
            className="min-h-6 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[9px] font-semibold leading-4 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
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
              "block rounded-lg border bg-background/80 px-2 py-1 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
              projectStart.paidMissingBuilding && "border-amber-400",
            )}
          >
            <span className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
              <Building2 className="size-2.5" />
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
              className="min-h-6 w-full border-0 bg-transparent p-0 font-mono text-[9px] font-semibold leading-4 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </label>
          <label
            className={cn(
              "block rounded-lg border bg-background/80 px-2 py-1 transition focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
              projectStart.paidMissingModule && "border-amber-400",
            )}
          >
            <span className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
              <Boxes className="size-2.5" />
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
              className="min-h-6 w-full border-0 bg-transparent p-0 font-mono text-[9px] font-semibold leading-4 outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </label>
        </div>
      ) : null}
<div data-decision-outcomes className="nodrag space-y-1.5">
        <OutcomeRow
          outcome={outcomes.find((outcome) => outcome.id === "yes") || {
            id: "yes",
            label: "APPROVED",
            edgeType: "success",
          }}
          defaultLabel="APPROVED"
          icon={<CheckCircle2 className="mr-1.5 size-3.5 shrink-0" />}
          active={approvalReady}
          activeClassName="border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm ring-1 ring-emerald-500/15 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
          inactiveClassName="border-slate-200 bg-slate-50/70 text-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500"
          activeMeta={approvalReady ? `${approvedDepartment} · ${approvedBy}` : ""}
          inactiveMeta="DETAILS REQUIRED"
          activeMetaTitle={
            approvalReady ? `${approvedDepartment} · ${approvedBy}` : "Department and approver required"
          }
          node={node}
          accent="emerald"
          anchorFor={anchorFor}
        />
        {outcomes
          .filter((outcome) => outcome.id !== "yes")
          .map((outcome) => (
            <OutcomeRow
              key={outcome.id}
              outcome={outcome}
              defaultLabel="DENIED"
              icon={<XCircle className="mr-1.5 size-3.5 shrink-0" />}
              active={checklistSatisfied}
              activeClassName="border-rose-300 bg-rose-50 text-rose-800 shadow-sm ring-1 ring-rose-500/15 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
              inactiveClassName="border-slate-200 bg-slate-50/70 text-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500"
              activeMeta={outcome.rule || "CONDITIONS NOT MET"}
              inactiveMeta="CONDITIONS NOT MET"
              activeMetaTitle={outcome.label || "denied"}
              node={node}
              accent="rose"
              anchorFor={anchorFor}
            />
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
          className="whitespace-nowrap rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-tight text-muted-foreground shadow-sm"
        >
          UUID {nodeUuid.slice(0, 8)}
        </span>
      </div>
    ) : null}
    </div>
    </Fragment>
  );
}

interface OutcomeRowProps {
  outcome: OutcomeHandle;
  defaultLabel: string;
  icon: React.ReactNode;
  active: boolean;
  activeClassName: string;
  inactiveClassName: string;
  activeMeta: string;
  inactiveMeta: string;
  activeMetaTitle: string;
  node: DomainNode;
  accent: "emerald" | "rose";
  anchorFor: (outcome: OutcomeHandle) => {
    side: Position;
    offsetPercent: number;
  };
}

function OutcomeRow({
  outcome,
  defaultLabel,
  icon,
  active,
  activeClassName,
  inactiveClassName,
  activeMeta,
  inactiveMeta,
  activeMetaTitle,
  node,
  accent,
  anchorFor,
}: OutcomeRowProps) {
  const setOutcomeAnchor = useWorkflowStore((state) => state.setOutcomeAnchor);
  const anchor = anchorFor(outcome);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const anchors: Array<"right" | "left" | "top" | "bottom"> = [
    "right",
    "left",
    "top",
    "bottom",
  ];

  useEffect(() => {
    if (!hovering) return;
    const card = cardRef.current;
    if (!card) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-outcome-anchor]")) return;
      const button = target.closest("[data-outcome-handle]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const moveHandler = (moveEvent: PointerEvent) => {
        const rect = card.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const y = moveEvent.clientY - rect.top;
        const ratios: Record<"right" | "left" | "top" | "bottom", number> = {
          right: 1 - x / rect.width,
          left: x / rect.width,
          top: y / rect.height,
          bottom: 1 - y / rect.height,
        };
        const side = (Object.keys(ratios) as Array<keyof typeof ratios>).reduce(
          (best, key) => (ratios[key] > ratios[best] ? key : best),
          "right" as keyof typeof ratios,
        );
        let offsetPercent = 0.5;
        if (side === "right" || side === "left") {
          offsetPercent = Math.max(
            0,
            Math.min(1, (y / rect.height) || 0.5),
          );
        } else {
          offsetPercent = Math.max(
            0,
            Math.min(1, (x / rect.width) || 0.5),
          );
        }
        setOutcomeAnchor(node.id, outcome.id, {
          anchor: side,
          anchorOffset: offsetPercent,
        });
      };
      const upHandler = () => {
        window.removeEventListener("pointermove", moveHandler);
        window.removeEventListener("pointerup", upHandler);
      };
      window.addEventListener("pointermove", moveHandler);
      window.addEventListener("pointerup", upHandler);
    };
    card.addEventListener("pointerdown", onPointerDown);
    return () => card.removeEventListener("pointerdown", onPointerDown);
  }, [hovering, node.id, outcome.id, setOutcomeAnchor]);

  const handlePositionStyle = (() => {
    if (anchor.side === Position.Right) {
      return { right: -10, top: `${anchor.offsetPercent * 100}%` };
    }
    if (anchor.side === Position.Left) {
      return { left: -10, top: `${anchor.offsetPercent * 100}%` };
    }
    if (anchor.side === Position.Top) {
      return { top: -10, left: `${anchor.offsetPercent * 100}%` };
    }
    return { bottom: -10, left: `${anchor.offsetPercent * 100}%` };
  })();

  const accentBg = accent === "emerald" ? "bg-emerald-600" : "bg-rose-600";

  return (
      <div
        ref={cardRef}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "relative flex min-h-10 min-w-0 items-center overflow-visible rounded-lg border px-2.5 py-2 text-[9px] font-black leading-4 transition",
          active ? activeClassName : inactiveClassName,
        )}
      >
        {icon}
        <span className="min-w-0 truncate">{outcome.label || defaultLabel}</span>
        <span
          title={activeMetaTitle}
          className="ml-auto max-w-[170px] shrink truncate text-[7px] font-semibold"
        >
          {active ? activeMeta : inactiveMeta}
        </span>
        <ComponentNoteButton
          nodeId={node.id}
          noteKey={`outcome:${outcome.id}`}
          label={`${node.title} ${outcome.label || defaultLabel.toLowerCase()} outcome`}
          className="ml-2 size-5"
        />
        <Handle
          type="source"
          position={anchor.side}
          id={outcome.id}
          title={`Connect ${outcome.label || defaultLabel.toLowerCase()} route (drag the chip to choose where it exits)`}
          className={cn(
            "!z-50 !size-5 !cursor-crosshair !border-[3px] !border-background !opacity-100 shadow-md",
            accentBg,
          )}
          style={handlePositionStyle}
        />
        {hovering
          ? anchors.map((side) => (
              <span
                key={side}
                data-outcome-anchor={side}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOutcomeAnchor(node.id, outcome.id, {
                    anchor: side,
                    anchorOffset: 0.5,
                  });
                }}
                className={cn(
                  "nodrag nopan absolute flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border bg-background/95 text-[8px] font-bold uppercase tracking-wide text-muted-foreground shadow-sm hover:border-primary/60 hover:text-primary",
                  accent === "emerald"
                    ? "border-emerald-300"
                    : "border-rose-300",
                  side === "right" && "-right-7 top-1/2 -translate-y-1/2",
                  side === "left" && "-left-7 top-1/2 -translate-y-1/2",
                  side === "top" && "left-1/2 -top-7 -translate-x-1/2",
                  side === "bottom" && "bottom-[-1.75rem] left-1/2 -translate-x-1/2",
                )}
                title={`Anchor to ${side}`}
              >
                {side === "right" ? "R" : side === "left" ? "L" : side === "top" ? "T" : "B"}
              </span>
            ))
          : null}
      </div>
  );
}