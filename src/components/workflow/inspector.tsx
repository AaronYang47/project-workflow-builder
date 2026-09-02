"use client";
import { Fragment, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  getInspectorSchema,
  isInspectorFieldVisible,
  conditionInspectorKey,
  type InspectorField,
} from "@/lib/inspector-schema";
import { getNodeDefinition } from "@/lib/node-catalog";
import {
  normalizeProjectIdInput,
  promoteToPaidService,
  shouldAutoPromoteToPaid,
  syncPaidConditions,
} from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";
import type { Condition, DomainNode, WorkflowEdgeType } from "@/types/workflow";
import { readPath, writePath } from "@/lib/object-path";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HighLevelInspector } from "./high-level-inspector";
import { getExecutionSummary } from "@/lib/execution";

const applyPromoteToPaid = (node: DomainNode): DomainNode => {
  const promoted = promoteToPaidService(node);
  return { ...promoted, conditions: syncPaidConditions(promoted, true) };
};

function Field({
  field,
  node,
  update,
}: {
  field: InspectorField;
  node: DomainNode;
  update: (node: DomainNode) => void;
}) {
  const raw = readPath(node, field.key);
  const initial = useRef<DomainNode | null>(null);
  const setFocusedInspectorField =
    useWorkflowStore.getState().setFocusedInspectorField;
  const onContainerFocus = () => setFocusedInspectorField(field.key);
  const onContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setFocusedInspectorField(undefined);
  };
  const set = (value: unknown, transient = false) => {
    const store = useWorkflowStore.getState();
    const next = writePath(node, field.key, value);
    if (transient) {
      if (!initial.current) initial.current = structuredClone(node);
      store.commitTransient((file) => ({
        ...file,
        graph: {
          ...file.graph,
          nodes: file.graph.nodes.map((item) =>
            item.id === node.id ? next : item,
          ),
        },
      }));
    } else update(next);
  };
  const finish = () => {
    if (!initial.current) return;
    useWorkflowStore.getState().recordSnapshot({
      ...useWorkflowStore.getState().file,
      graph: {
        ...useWorkflowStore.getState().file.graph,
        nodes: useWorkflowStore
          .getState()
          .file.graph.nodes.map((item) =>
            item.id === node.id ? initial.current! : item,
          ),
      },
    });
    initial.current = null;
  };
  const textProps = { onBlur: finish };
  const textValue =
    field.type === "tags" && Array.isArray(raw)
      ? raw.join(", ")
      : field.type === "text" && field.mask === "digits"
        ? String(raw || "").replace(/\D/g, "")
        : String(raw || "");
  return (
    <div
      className="space-y-1.5"
      onFocus={onContainerFocus}
      onBlur={onContainerBlur}
    >
      <Label>{field.label}</Label>
      {field.type === "textarea" ? (
        <Textarea
          aria-label={field.label}
          value={String(raw || "")}
          onChange={(e) => set(e.target.value, true)}
          {...textProps}
        />
      ) : field.type === "boolean" ? (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(raw)}
          aria-label={field.label}
          onClick={() => set(!raw)}
          className={`flex h-8 w-full items-center rounded-md border px-2 text-xs ${raw ? "border-primary/40 bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
        >
          <span
            className={`mr-2 h-4 w-7 rounded-full p-0.5 ${raw ? "bg-primary" : "bg-muted-foreground/35"}`}
          >
            <span
              className={`block size-3 rounded-full bg-white transition ${raw ? "translate-x-3" : ""}`}
            />
          </span>
          {raw ? "Enabled" : "Disabled"}
        </button>
      ) : field.type === "select" ? (
        <select
          aria-label={field.label}
          value={String(raw || "")}
          onChange={(e) => {
            if (field.key === "config.serviceType") {
              const currentProjectId = String(
                readPath(node, "customFields.projectId") || "",
              );
              const desiredPrefix = e.target.value === "Paid Service" ? "P" : "L";
              const next = writePath(node, "customFields.projectId", currentProjectId.replace(/^[LP]-/, `${desiredPrefix}-`));
              update({
                ...next,
                config: { ...next.config, serviceType: e.target.value },
                conditions: syncPaidConditions(node, e.target.value === "Paid Service"),
              });
              return;
            }
            set(e.target.value);
          }}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : field.type === "color" ? (
        <div className="flex gap-2">
          <input
            aria-label={`${field.label} color picker`}
            type="color"
            value={String(raw || "#64748b")}
            onChange={(e) => set(e.target.value, true)}
            onBlur={finish}
            className="h-9 w-11 rounded border bg-background p-1"
          />
          <Input
            aria-label={field.label}
            value={String(raw || "")}
            onChange={(e) => set(e.target.value, true)}
            {...textProps}
          />
        </div>
      ) : (
        <Input
          aria-label={field.label}
          value={textValue}
          placeholder={field.placeholder}
          maxLength={
            field.mask === "digits" && field.maxLength
              ? field.maxLength
              : field.maxLength
          }
          inputMode={field.mask === "digits" ? "numeric" : undefined}
          readOnly={field.readOnly}
          onChange={(e) => {
            const raw = e.target.value;
            const value =
              field.type === "tags"
                ? raw
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                : field.mask === "digits"
                  ? raw.replace(/\D/g, "").slice(0, field.maxLength || undefined)
                  : field.readOnly
                    ? textValue
                    : field.key === "customFields.projectId"
                      ? normalizeProjectIdInput(raw, String(node.config?.serviceType || ""))
                      : raw;
            set(value, true);
            // Typing a complete B-XX / M-XXX value implicitly means this is
            // a Paid Service project, so promote serviceType and rewrite
            // the Project ID prefix in one shot.
            if (
              shouldAutoPromoteToPaid(field.key, String(value)) &&
              String(node.config?.serviceType || "") !== "Paid Service"
            ) {
              const promoted = applyPromoteToPaid({
                ...node,
                config: { ...node.config, [field.key.replace(/^config\./, "")]: value },
              });
              update(promoted);
            }
          }}
          {...textProps}
        />
      )}
    </div>
  );
}

function OutcomeEditor({
  node,
  update,
}: {
  node: DomainNode;
  update: (node: DomainNode) => void;
}) {
  const outcomes = node.config.outcomes || [];
  const yes = outcomes.find((item) => item.id === "yes")?.label || "YES";
  const no = outcomes.find((item) => item.id === "no")?.label || "NO";
  const setLabel = (outcomeId: "yes" | "no", value: string) => {
    const fallback = outcomeId === "yes" ? "YES" : "NO";
    const trimmed = value.trim() || fallback;
    const nextOutcomes = outcomes.some((item) => item.id === outcomeId)
      ? outcomes.map((item) =>
          item.id === outcomeId ? { ...item, label: trimmed } : item,
        )
      : [
          ...outcomes,
          {
            id: outcomeId,
            label: trimmed,
            edgeType:
              outcomeId === "yes"
                ? ("dependency" as WorkflowEdgeType)
                : ("supporting" as WorkflowEdgeType),
          },
        ];
    update({ ...node, config: { ...node.config, outcomes: nextOutcomes } });
  };
  return (
    <section className="border-t pt-4">
      <Label>Outcome handles</Label>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Every Decision Module has exactly two routes. Edit the labels used on
        the green and red outputs.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Yes route
          </span>
          <Input
            aria-label="Yes outcome label"
            value={yes}
            onChange={(e) => setLabel("yes", e.target.value)}
            className="border-emerald-200 bg-emerald-50 text-emerald-700 focus-visible:ring-emerald-500 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            No route
          </span>
          <Input
            aria-label="No outcome label"
            value={no}
            onChange={(e) => setLabel("no", e.target.value)}
            className="border-rose-200 bg-rose-50 text-rose-700 focus-visible:ring-rose-500 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          />
        </label>
      </div>
    </section>
  );
}

function ConditionEditor({
  node,
  conditionIndex,
  update,
  onDelete,
}: {
  node: DomainNode;
  conditionIndex: number;
  update: (node: DomainNode) => void;
  onDelete: () => void;
}) {
  const condition = node.conditions[conditionIndex];
  if (!condition) return null;

  const updateCondition = (patch: Partial<Condition>) => {
    update({
      ...node,
      conditions: node.conditions.map((item, index) =>
        index === conditionIndex ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <section className="mb-5 rounded-xl border border-primary/25 bg-primary/[0.045] p-3.5 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold">Release condition {conditionIndex + 1}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Edit the condition content here. The node card remains a compact status view.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {condition.locked ? (
            <span className="rounded-full border border-border/80 bg-muted/55 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Managed
            </span>
          ) : (
            <button
              type="button"
              aria-label={`Delete release condition ${conditionIndex + 1}`}
              title="Delete this release condition"
              onClick={onDelete}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label>Condition text</Label>
          <Textarea
            aria-label={`Release condition ${conditionIndex + 1} text`}
            value={condition.label || ""}
            readOnly={condition.locked}
            onChange={(event) => updateCondition({ label: event.target.value })}
            placeholder="Describe what must be true before this node can proceed."
            className="min-h-16 resize-y bg-background/75 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Supporting detail</Label>
          <Textarea
            aria-label={`Release condition ${conditionIndex + 1} supporting detail`}
            value={condition.description || ""}
            readOnly={condition.locked}
            onChange={(event) => updateCondition({ description: event.target.value })}
            placeholder="Optional context passed into the L3 requirement."
            className="min-h-14 resize-y bg-background/75 text-xs"
          />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={condition.required !== false}
          aria-label={`Release condition ${conditionIndex + 1} required`}
          disabled={condition.locked}
          onClick={() => updateCondition({ required: condition.required === false })}
          className={`flex h-9 w-full items-center rounded-md border px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${condition.required !== false ? "border-primary/40 bg-primary/10 text-primary" : "bg-background/75 text-muted-foreground"}`}
        >
          <span
            className={`mr-2 h-4 w-7 rounded-full p-0.5 ${condition.required !== false ? "bg-primary" : "bg-muted-foreground/35"}`}
          >
            <span
              className={`block size-3 rounded-full bg-white transition ${condition.required !== false ? "translate-x-3" : ""}`}
            />
          </span>
          {condition.required !== false ? "Required" : "Optional"}
        </button>
      </div>
    </section>
  );
}

import { useShallow } from "zustand/react/shallow";

function DetailedInspector({
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
    "Decision configuration": true,
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
            {node.type === "gate" ? (
              <OutcomeEditor
                node={node}
                update={(next) => updateNode(node.id, next)}
              />
            ) : null}
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

export function Inspector({
  highLevelMode = false,
  onOpenExecutionView,
}: {
  highLevelMode?: boolean;
  onOpenExecutionView?: (nodeId: string) => void;
}) {
  return highLevelMode ? (
    <HighLevelInspector />
  ) : (
    <DetailedInspector onOpenExecutionView={onOpenExecutionView} />
  );
}
