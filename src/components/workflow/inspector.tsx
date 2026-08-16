"use client";
import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Settings2, Trash2 } from "lucide-react";
import {
  getInspectorSchema,
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
import type { DomainNode, WorkflowEdgeType } from "@/types/workflow";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const readPath = (object: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce(
      (value: unknown, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      object,
    );
const isFieldVisible = (field: InspectorField, node: DomainNode): boolean => {
  if (!field.visibleWhen) return true;
  return String(readPath(node, field.visibleWhen.key) || "") === field.visibleWhen.equals;
};
const writePath = (
  object: DomainNode,
  path: string,
  value: unknown,
): DomainNode => {
  const result = structuredClone(object) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let cursor = result;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] = (cursor[key] as Record<string, unknown>) || {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys.at(-1)!] = value;
  return result as unknown as DomainNode;
};
// When a complete B-XX / M-XXX value lands on a project-start node, switch
// serviceType → "Paid Service" and rewrite the Project ID prefix so the
// stored ID always matches the chosen service type. Returns the updated
// node so callers can apply it once. Conditions are synced here so the
// paid-service requirements appear alongside the auto-promoted fields.
const applyPromoteToPaid = (node: DomainNode): DomainNode => ({
  ...promoteToPaidService(node),
  conditions: syncPaidConditions(node, true),
});

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

export function Inspector() {
  const { file, selection, updateNode, updateEdge, deleteSelected } =
    useWorkflowStore();
  const node = file.graph.nodes.find(
    (item) => item.id === selection.nodeIds[0],
  );
  const edge = file.graph.edges.find((item) => item.id === selection.edgeId);
  const schema = useMemo(
    () => (node ? getInspectorSchema(node.type) : []),
    [node],
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    General: true,
    Appearance: true,
    Configuration: true,
    "Document details": true,
    Controls: true,
    "Decision configuration": true,
  });
  return (
    <aside className="flex h-full w-[304px] shrink-0 flex-col border-l bg-panel">
      <div className="flex h-12 items-center gap-2 border-b px-3">
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
        <div className="scroll-thin flex-1 overflow-y-auto">
          <div className="border-b p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex size-9 items-center justify-center rounded-lg text-white"
                style={{
                  backgroundColor:
                    node.color || getNodeDefinition(node.type).color,
                }}
              >
                {(() => {
                  const Icon = getNodeDefinition(node.type).icon;
                  return <Icon className="size-4" />;
                })()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{node.title}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {getNodeDefinition(node.type).label} · {node.id}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4">
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
                              isFieldVisible(field, node),
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
            )}
            {node.type === "gate" ? (
              <OutcomeEditor
                node={node}
                update={(next) => updateNode(node.id, next)}
              />
            ) : null}
          </div>
        </div>
      ) : edge ? (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
