"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Settings2, Trash2 } from "lucide-react";
import { getInspectorSchema, isInspectorFieldVisible, conditionInspectorKey } from "@/lib/inspector-schema";
import { getNodeDefinition } from "@/lib/node-catalog";
import { useWorkflowStore } from "@/store/workflow-store";
import type { WorkflowEdgeType } from "@/types/workflow";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getExecutionSummary } from "@/lib/execution";
import { useShallow } from "zustand/react/shallow";
import { ConditionEditor } from "./condition-editor";
import { Field } from "./field";
import { PhaseStepsManager } from "./phase-steps-manager";

export function DetailedInspector({
  onOpenExecutionView,
}: {
  onOpenExecutionView?: (nodeId: string) => void;
}) {
  const {
    file,
    selection,
    updateNode,
    updateEdge,
    deleteSelected,
    deleteNodeCondition,
    toggleNodeInPhase,
    fitPhaseToChildren,
    focusedInspectorField,
  } =
    useWorkflowStore(
      useShallow((state) => ({
        file: state.file,
        selection: state.selection,
        updateNode: state.updateNode,
        updateEdge: state.updateEdge,
        deleteSelected: state.deleteSelected,
        deleteNodeCondition: state.deleteNodeCondition,
        toggleNodeInPhase: state.toggleNodeInPhase,
        fitPhaseToChildren: state.fitPhaseToChildren,
        focusedInspectorField: state.focusedInspectorField,
      })),
    );
  const node = file.graph.nodes.find(
    (item) => item.id === selection.nodeIds[0],
  );
  const edge = file.graph.edges.find((item) => item.id === selection.edgeId);
  const executionSummary = node
    ? getExecutionSummary(
        node.id,
        file.execution?.items,
        file.operations,
        { checklistOnly: true },
      )
    : undefined;
  const schema = useMemo(
    () => (node ? getInspectorSchema(node.type) : []),
    [node],
  );
  const activeConditionIndex = node
    ? node.conditions.findIndex(
        (condition, index) =>
          conditionInspectorKey(node.id, condition.id, index) ===
          focusedInspectorField,
      )
    : -1;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    General: true,
    Appearance: true,
    Configuration: true,
    "Document details": true,
    Controls: true,
  });
  return (
    <aside className="flex h-full min-h-0 w-[304px] max-w-[calc(100vw-16px)] shrink-0 flex-col border-l bg-panel">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Settings2 className="size-4 text-primary" />
        <span className="text-sm font-semibold">Inspector</span>
      </div>
      {!node && !edge ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
            <Settings2 className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Nothing selected</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Select a node or connection to configure its properties.
          </p>
        </div>
      ) : node ? (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="border-b p-4">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="flex size-9 shrink-0 aspect-square items-center justify-center rounded-xl text-white shadow-sm"
                style={{
                  backgroundColor:
                    node.color || getNodeDefinition(node.type).color,
                }}
              >
                {(() => {
                  const Icon = getNodeDefinition(node.type).icon;
                  return <Icon className="size-5" />;
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{node.title}</p>
                <p
                  className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  title={`${getNodeDefinition(node.type).label} · ${node.id}`}
                >
                  {getNodeDefinition(node.type).label} · {node.id}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {onOpenExecutionView ? (
              <section className="mb-5 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
                <div className="flex items-start gap-2">
                  <ClipboardList className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">L3 · Execution Requirements</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Documents, approvals, tasks, and evidence for this workflow node.
                    </p>
                  </div>
                </div>
                {executionSummary?.hasItems ? (
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                    {executionSummary.completedCount}/{executionSummary.itemCount} Requirements Complete
                    <span className="mx-1">·</span>
                    <span
                      className={
                        executionSummary.status === "Blocked"
                          ? "text-rose-600 dark:text-rose-400"
                          : executionSummary.status === "Incomplete"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {executionSummary.status}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    No execution requirements yet.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onOpenExecutionView(node.id)}
                  style={{ fontSize: "11px", lineHeight: 1.3 }}
                  className="mt-3 flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[0.68rem] font-semibold leading-snug text-primary transition-colors hover:bg-primary/10"
                >
                  <span className="min-w-0">View L3 / Execution Requirements</span>
                  <ChevronRight className="size-4 shrink-0 text-primary" />
                </button>
              </section>
            ) : null}
            {node && node.type === "gate" ? (
              <PhaseStepsManager
                phaseNode={node}
                allNodes={file.graph.nodes}
                nodeLayouts={file.layout.nodes}
                toggleNodeInPhase={toggleNodeInPhase}
                fitPhaseToChildren={fitPhaseToChildren}
              />
            ) : null}
            {node && activeConditionIndex >= 0 ? (
              <ConditionEditor
                node={node}
                conditionIndex={activeConditionIndex}
                update={(next) => updateNode(node.id, next)}
                onDelete={() =>
                  deleteNodeCondition(
                    node.id,
                    node.conditions[activeConditionIndex]?.id,
                    activeConditionIndex,
                  )
                }
              />
            ) : null}
            {Array.from(new Set(schema.map((field) => field.section))).map(
                (section) => {
                  const open = openSections[section] ?? true;
                  return (
                    <Fragment key={section}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenSections((state) => ({
                            ...state,
                            [section]: !open,
                          }))
                        }
                        className="mb-3 flex w-full items-center gap-1 text-left text-xs font-semibold"
                      >
                        {open ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                        {section}
                      </button>
                      {open ? (
                        <div className="mb-5 space-y-4">
                          {schema
                            .filter(
                              (field) =>
                                field.section === section &&
                                isInspectorFieldVisible(field, node),
                            )
                            .map((field) => (
                              <Field
                                key={field.key}
                                field={field}
                                node={node}
                                update={(next) => updateNode(node.id, next)}
                              />
                            ))}
                        </div>
                      ) : null}
                    </Fragment>
                  );
                },
              )
            }
          </div>
        </div>
      ) : edge ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 scroll-thin">
          <div>
            <p className="text-sm font-semibold">Connection</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {edge.source} → {edge.target}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              aria-label="Connection label"
              value={edge.label || ""}
              onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Semantic type</Label>
            <select
              aria-label="Connection semantic type"
              value={edge.type}
              onChange={(e) =>
                updateEdge(edge.id, {
                  type: e.target.value as WorkflowEdgeType,
                })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {[
                "normal",
                "success",
                "failure",
                "hold",
                "rework",
                "dependency",
                "supporting",
                "exception",
                "approval",
                "reopen",
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Textarea
              aria-label="Connection condition"
              value={edge.condition?.expression || ""}
              onChange={(e) =>
                updateEdge(edge.id, {
                  condition: { ...edge.condition, expression: e.target.value },
                })
              }
              placeholder="Optional expression or rule"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Line style</Label>
            <select
              aria-label="Connection line style"
              value={edge.lineStyle}
              onChange={(e) =>
                updateEdge(edge.id, {
                  lineStyle: e.target.value as typeof edge.lineStyle,
                })
              }
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option>solid</option>
              <option>dashed</option>
              <option>dotted</option>
            </select>
          </div>
        </div>
      ) : null}{" "}
      {node || edge ? (
        <div className="border-t p-3">
          <button
            type="button"
            onClick={deleteSelected}
            className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
            Delete selected
          </button>
        </div>
      ) : null}
    </aside>
  );
}
