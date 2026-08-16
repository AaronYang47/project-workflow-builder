"use client";

import { GripVertical, Landmark, ShieldCheck } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ComponentNoteButton } from "./component-note-button";
import {
  GATE_CARD_WIDTH,
  GATE_INTERNAL_GAP,
  GATE_PANEL_WIDTH,
  GATE_SECTION_GAP,
  GATE_SIDE_WIDTH,
  getGateLayoutMetrics,
} from "@/lib/gate-layout";
import type { GateCompletionState } from "@/lib/workflow-progress";
import type {
  DomainNode,
  GateSignatureRequirement,
} from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  iconOptions,
  saveText,
  statusStyles,
  stopBubble,
  textareaRows,
} from "./node-utils";
import { useGateContext } from "./use-gate-context";
import { DecisionCard } from "./decision-card";
import { ApprovalConditionsPanel } from "./approval-conditions-panel";
import {
  demoteToStandardService,
  promoteToPaidService,
  projectNodeUuid,
  syncPaidConditions,
} from "@/lib/project-id";
import { workflowHasPaidService } from "@/lib/workflow-progress";
import { ruleHasPaidService } from "@/lib/gate-service-types";

export function GateRules({ node }: { node: DomainNode }) {
  const {
    rules,
    outcomes,
    projectStart,
    interfaceText,
    approvedDepartment,
    approvedBy,
    checklistSatisfied,
    approvalReady,
    conditionProgress,
    conditionStyle,
    decisionStyle,
    metrics,
  } = useGateContext(node);
  const projectStartNode = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "projectStart"),
  );
  // The UUID badge identifies the project, not this gate node. Resolve the
  // project-start node's UUID so the gate card shows the same identifier as
  // every other node in the same project.
  const nodeUuid = projectNodeUuid(node, projectStartNode);
  const conditionState = conditionProgress.state;
  const decisionState: GateCompletionState = approvalReady
    ? "complete"
    : checklistSatisfied
      ? "partial"
      : conditionState;
  const GateHeaderIcon =
    iconOptions[node.config.gateIconKey as keyof typeof iconOptions] ||
    Landmark;
  const gateLabel = node.config.gateLabel?.trim() || "GATE";
  const gateHeaderColor =
    node.config.gateHeaderColor || node.color || "#0d233b";
  const gateTitleColor = node.config.gateTitleColor || "#ffffff";
  const yes = outcomes.find((outcome) => outcome.id === "yes");
  const saveRules = (nextRules: typeof rules) => {
    const store = useWorkflowStore.getState();
    const currentNode =
      store.file.graph.nodes.find((item) => item.id === node.id) || node;
    const expression = nextRules
      .map((rule) => {
        const signatures = (rule.signatures || [])
          .map(
            (item) =>
              `${item.abbreviation || item.fullName} signed by ${item.signedBy || "required signer"} for ${item.department || "required department"}`,
          )
          .join(" AND ");
        return `(${rule.label}${signatures ? ` AND ${signatures}` : ""})`;
      })
      .join(" AND ");
    const nextNode = {
      ...currentNode,
      config: {
        ...currentNode.config,
        gateRules: nextRules,
        signatureRequirements: undefined,
      },
    };
    // Setting any document's service-type tag to "Paid Service" is the user's
    // way of declaring this engagement is paid work; clearing the last one
    // is the user's way of undoing that. Mirror both transitions onto the
    // project-start node so the gate badge stays in lockstep.
    const hasPaidCondition = nextRules.some((rule) => ruleHasPaidService(rule));
    const projectStartServiceType = String(
      projectStartNode?.config?.serviceType || "",
    );
    const shouldPromoteProjectStart =
      hasPaidCondition &&
      Boolean(projectStartNode) &&
      projectStartServiceType !== "Paid Service";
    const shouldDemoteProjectStart =
      !workflowHasPaidService(store.file.graph.nodes, node.id, nextRules) &&
      Boolean(projectStartNode) &&
      projectStartServiceType === "Paid Service";
    const nextMetrics = getGateLayoutMetrics(nextNode);
    store.commit((file) => ({
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) => {
          if (item.id === node.id) return nextNode;
          if (
            shouldPromoteProjectStart &&
            projectStartNode &&
            item.id === projectStartNode.id
          ) {
            const promoted = promoteToPaidService(item);
            return {
              ...promoted,
              conditions: syncPaidConditions(promoted, true),
            };
          }
          if (
            shouldDemoteProjectStart &&
            projectStartNode &&
            item.id === projectStartNode.id
          ) {
            const demoted = demoteToStandardService(item);
            return {
              ...demoted,
              conditions: syncPaidConditions(demoted, false),
            };
          }
          return item;
        }),
        edges: file.graph.edges.map((edge) =>
          edge.source !== node.id
            ? edge
            : edge.sourceHandle === "yes"
              ? {
                  ...edge,
                  condition: {
                    expression,
                    description:
                      "Every applicable condition and required document must be satisfied, with an approving department and approver",
                  },
                }
              : edge.sourceHandle?.startsWith("no")
                ? {
                    ...edge,
                    condition: {
                      expression: `NOT (${expression || "all approval conditions"})`,
                      description:
                        "The selected denied or exception route applies",
                    },
                  }
                : edge,
        ),
      },
      layout: {
        ...file.layout,
        nodes: {
          ...file.layout.nodes,
          [node.id]: {
            ...file.layout.nodes[node.id],
            width: nextMetrics.width,
            height: nextMetrics.height,
          },
        },
      },
    }));
  };
  const updateSignature = (
    ruleId: string,
    signatureId: string,
    patch: Partial<GateSignatureRequirement>,
  ) => {
    const latest =
      useWorkflowStore
        .getState()
        .file.graph.nodes.find((item) => item.id === node.id) || node;
    const nextRules = (latest.config.gateRules || []).map((rule) =>
      rule.id !== ruleId
        ? rule
        : {
            ...rule,
            signatures: (rule.signatures || []).map((signature) =>
              signature.id === signatureId
                ? { ...signature, ...patch }
                : signature,
            ),
          },
    );
    saveRules(nextRules);
  };
  const saveApprovalField = (
    field: "approvedDepartment" | "approvedBy",
    value: string,
  ) => {
    const next = value.trim();
    if (next === node.config[field]) return;
    useWorkflowStore.getState().commit((file) => ({
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) =>
          item.id === node.id
            ? { ...item, config: { ...item.config, [field]: next } }
            : item,
        ),
      },
    }));
  };
  const updateProjectStartConfig = (
    field: "buildingCode" | "moduleCode",
    value: string,
  ) => {
    if (!projectStartNode) return;
    const next = value.trim();
    useWorkflowStore.getState().commit((file) => ({
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) =>
          item.id === projectStartNode.id
            ? { ...item, config: { ...item.config, [field]: next } }
            : item,
        ),
      },
    }));
  };
  return (
    <div
      className="nowheel absolute"
      style={{
        width: GATE_SIDE_WIDTH,
        height: (metrics.contentHeight ?? metrics.height) + 24,
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!left-[-7px] !size-3 !border-2 !border-background !bg-[#b78b3e]"
        style={{ top: metrics.gateLinkY }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="rework-in"
        aria-label="Denied return entry"
        className="!top-[-7px] !size-3 !border-2 !border-background !bg-rose-600"
        style={{ left: "78%" }}
      />
      <section
        aria-label="Decision Module card"
        data-inspector-target="config.color"
        className="absolute left-0 top-0 overflow-hidden rounded-2xl border border-[#233a54] bg-card shadow-[0_12px_32px_rgba(15,35,58,.20)]"
        style={{ width: GATE_CARD_WIDTH, height: metrics.gateCardHeight }}
      >
        <div
          data-inspector-target="config.gateHeaderColor"
          className="relative flex h-[62px] items-center px-4 pt-1 text-white"
          style={{
            background: `linear-gradient(135deg, ${gateHeaderColor}, color-mix(in srgb, ${gateHeaderColor} 72%, #0f172a))`,
          }}
        >
          <span
            data-inspector-target="config.gateTitleColor config.gateIconKey"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 shadow-inner"
            style={{ color: gateTitleColor }}
          >
            <GateHeaderIcon className="size-4.5" />
          </span>
          <input
            key={gateLabel}
            aria-label="Decision module label"
            data-inspector-target="config.gateLabel config.gateTitleColor"
            defaultValue={gateLabel}
            onBlur={(event) => {
              const value = event.target.value.trim() || "GATE";
              if (value !== gateLabel)
                useWorkflowStore.getState().updateNode(node.id, {
                  config: { ...node.config, gateLabel: value },
                });
            }}
            className="nodrag ml-2 min-w-0 max-w-[160px] flex-1 border-0 bg-transparent p-0 text-xl font-black tracking-[0.1em] outline-none"
            style={{ color: gateTitleColor }}
          />
          <span
            title={
              projectStart.showBadge
                ? `${projectStart.displayedProjectId} · Legacy ${projectStart.legacyJobNumber || "—"}`
                : "Set a Project ID on Project Start to display here"
            }
            className={`ml-auto flex shrink-0 flex-col items-end gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold leading-tight tracking-tight ${
              projectStart.showBadge
                ? "border-white/30 bg-white/15 text-white"
                : "border-white/20 bg-white/10 text-white/70"
            }`}
          >
            <span>{projectStart.displayedProjectId || "L-——"}</span>
            <span
              className={`rounded px-1 text-[7px] font-bold tracking-tight ${
                projectStart.showBadge
                  ? "bg-white/25 text-white"
                  : "bg-white/15 text-white/70"
              }`}
            >
              Legacy {projectStart.legacyJobNumber || "—"}
            </span>
          </span>
          <ComponentNoteButton
            nodeId={node.id}
            noteKey="gate-card"
            label={`${node.title} decision module card`}
            className="ml-2 border-white/20 bg-white/10 text-slate-200 hover:text-white"
          />
          <span
            role="button"
            tabIndex={0}
            aria-label="Drag Decision Module"
            className="ml-2 cursor-grab rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <GripVertical className="size-4" />
          </span>
        </div>
        <div className="nodrag px-4 pt-3 pb-7">
          <label className="block">
            <span className="sr-only">Decision name</span>
            <textarea
              key={node.title}
              aria-label="Decision name"
              data-inspector-target="title"
              defaultValue={node.title}
              rows={textareaRows(node.title, 62, 1)}
              onBlur={(event) => saveText(node, "title", event.target.value)}
              placeholder="Decision name"
              className="min-h-8 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[14px] font-bold leading-5 text-foreground outline-none"
            />
          </label>
          <label className="mt-2 block">
            <span className="sr-only">Decision content</span>
            <textarea
              key={node.description}
              aria-label="Decision content"
              data-inspector-target="description"
              defaultValue={node.description}
              rows={textareaRows(node.description, 82, 3)}
              onBlur={(event) =>
                saveText(node, "description", event.target.value)
              }
              placeholder="Commercial decision scope"
              className="min-h-[86px] w-full resize-none overflow-hidden rounded-lg border bg-muted/25 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground outline-none focus:border-[#b78b3e] focus:bg-background"
            />
          </label>
        </div>
      </section>
      {nodeUuid ? (
        <div
          className="nodrag pointer-events-none absolute z-10"
          style={{
            top: metrics.gateCardHeight + 6,
            right: 0,
          }}
        >
          <span
            title={nodeUuid}
            className="whitespace-nowrap rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-tight text-muted-foreground shadow-sm"
          >
            UUID {nodeUuid.slice(0, 8)}
          </span>
        </div>
      ) : null}
      <div
        aria-hidden
        className="absolute w-[3px] -translate-x-1/2 rounded-full bg-slate-300"
        style={{
          left: GATE_CARD_WIDTH / 2,
          top: metrics.gateCardHeight,
          height: GATE_INTERNAL_GAP,
        }}
      >
        <span
          className={cn(
            "absolute inset-x-0 top-0 h-2/3 rounded-full",
            conditionStyle.accent,
          )}
        />
        <span
          className={cn(
            "absolute -bottom-1 -left-[3px] size-2 rounded-full border-2 border-background shadow-sm",
            conditionStyle.accent,
          )}
        />
      </div>
      <ApprovalConditionsPanel
        node={node}
        rules={rules}
        conditionState={conditionState}
        conditionStyle={conditionStyle}
        conditionProgress={conditionProgress}
        interfaceText={{
          conditionsTitle: interfaceText.conditionsTitle,
          conditionsSubtitle: interfaceText.conditionsSubtitle,
          checklistTitle: interfaceText.checklistTitle,
          checklistHint: interfaceText.checklistHint,
          conditionLabel: interfaceText.conditionLabel,
          addConditionLabel: interfaceText.addConditionLabel,
          documentsLabel: interfaceText.documentsLabel,
          addDocumentLabel: interfaceText.addDocumentLabel,
        }}
        metrics={metrics}
        saveRules={saveRules}
        updateSignature={updateSignature}
      />
      <div
        className="absolute w-px -translate-x-1/2 bg-slate-300"
        style={{
          left: metrics.conditionsLeft + GATE_PANEL_WIDTH / 2,
          top: metrics.conditionsTop + metrics.conditionsHeight,
          height: GATE_SECTION_GAP,
        }}
      >
        <span
          className={cn(
            "absolute inset-x-[-1px] top-0 h-2/3 rounded-full",
            decisionStyle.accent,
          )}
        />
      </div>
      <div
        className={cn(
          "absolute size-2 -translate-x-1/2 rounded-full border-2 border-background shadow-sm",
          decisionStyle.accent,
        )}
        style={{
          left: metrics.conditionsLeft + GATE_PANEL_WIDTH / 2,
          top: metrics.decisionTop - 4,
        }}
      />
      <DecisionCard
        node={node}
        metrics={metrics}
        interfaceText={{
          decisionTitle: interfaceText.decisionTitle,
          decisionSubtitle: interfaceText.decisionSubtitle,
          departmentLabel: interfaceText.departmentLabel,
          approverLabel: interfaceText.approverLabel,
          detailsNeededLabel: interfaceText.detailsNeededLabel,
        }}
        approvedDepartment={approvedDepartment}
        approvedBy={approvedBy}
        approvalReady={approvalReady}
        checklistSatisfied={checklistSatisfied}
        decisionState={decisionState}
        decisionStyle={{ card: decisionStyle.card }}
        projectStart={projectStart}
        projectStartNodeId={projectStartNode?.id}
        outcomes={outcomes}
        saveApprovalField={saveApprovalField}
        updateProjectStartConfig={updateProjectStartConfig}
      />
    </div>
  );
}