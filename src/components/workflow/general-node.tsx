"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Handle,
  NodeResizer,
  Position,
} from "@xyflow/react";
import {
  Check,
  GripVertical,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { getNodeDefinition } from "@/lib/node-catalog";
import { cn } from "@/lib/utils";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import {
  BUILDING_PATTERN,
  MODULE_PATTERN,
  PROJECT_ID_PATTERN,
  currentYearSuffix,
  legacyJobNumberFromProjectId,
  normalizeProjectId,
  projectIdForDisplay,
} from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { ComponentNoteButton } from "./component-note-button";
import {
  iconOptions,
  saveText,
  stopBubble,
  textareaRows,
} from "./node-utils";

export function GeneralNode({
  node,
  selected,
  emphasized,
  dimmed,
  reached = true,
}: {
  node: DomainNode;
  selected: boolean;
  emphasized?: boolean;
  dimmed?: boolean;
  reached?: boolean;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const commitTransient = useWorkflowStore((state) => state.commitTransient);
  const recordSnapshot = useWorkflowStore((state) => state.recordSnapshot);
  const fileNodes = useWorkflowStore((state) => state.file.graph.nodes);
  const projectStartNode = useMemo(
    () => fileNodes.find((item) => item.type === "projectStart"),
    [fileNodes],
  );
  const projectStartProjectId = String(
    projectStartNode?.customFields.projectId || "",
  );
  const isProjectStart = node.type === "projectStart";
  // The UUID badge identifies the project, not the individual node. Look it
  // up on project-start so every node in the same project shares the same
  // identifier (projectStart looks up itself, which trivially falls back to
  // its own customFields.nodeUuid).
  const nodeUuid = isProjectStart
    ? String(node.customFields.nodeUuid || "")
    : String(
        projectStartNode?.customFields.nodeUuid ||
          node.customFields.nodeUuid ||
          "",
      );
  const serviceType = String(
    (projectStartNode?.config as Record<string, unknown> | undefined)
      ?.serviceType || "Standard",
  );
  const displayedProjectId = projectIdForDisplay(projectStartProjectId, serviceType);
  const showProjectIdBadge = PROJECT_ID_PATTERN.test(displayedProjectId);
  const initialProjectId = isProjectStart
    ? String(
        node.customFields.projectId || node.customFields.projectNumber || "",
      )
    : "";
  const [projectIdDraft, setProjectIdDraft] = useState(initialProjectId);
  const projectIdSnapshot = useRef<typeof node | null>(null);
  useEffect(() => {
    setProjectIdDraft(initialProjectId);
  }, [initialProjectId]);
  const projectId = useMemo(
    () => normalizeProjectId(projectIdDraft.trim()),
    [projectIdDraft],
  );
  // Display values for the year/sequence inputs. We parse from projectIdDraft
  // (the live draft, not the normalized store value) so partial edits survive
  // the round-trip. When the draft is completely empty (never been edited),
  // fall back to defaults for display; once the user has started editing,
  // preserve whatever they typed, including empty segments mid-edit.
  const draftHasContent = projectIdDraft.length > 0;
  const parsedYear = useMemo(() => {
    if (!draftHasContent) return currentYearSuffix();
    const match = projectIdDraft.match(/^[LP]-(\d{0,2})-/);
    return match ? match[1] : "";
  }, [projectIdDraft, draftHasContent]);
  const parsedSeq = useMemo(() => {
    if (!draftHasContent) return "001";
    const match = projectIdDraft.match(/^[LP]-\d{0,2}-(\d{0,3})$/);
    return match ? match[1] : "";
  }, [projectIdDraft, draftHasContent]);
  // projectIdValid must reflect the *live draft*, not the normalized store value.
  // Otherwise an incomplete draft like "L-2-001" gets silently salvaged into a
  // valid "L-XX-001" by normalizeProjectId, falsely satisfying release conditions.
  const projectIdValid = isProjectStart
    ? PROJECT_ID_PATTERN.test(projectIdDraft.trim())
    : Boolean(projectStartProjectId);
  const projectIdError = isProjectStart && projectIdDraft.trim().length > 0 && !projectIdValid;
  const buildingCode = String(
    (projectStartNode?.config as Record<string, unknown> | undefined)
      ?.buildingCode || "",
  );
  const moduleCode = String(
    (projectStartNode?.config as Record<string, unknown> | undefined)
      ?.moduleCode || "",
  );
  const paidRequiresBuilding = serviceType === "Paid Service";
  const paidRequiresModule = serviceType === "Paid Service";
  const buildingValid = !paidRequiresBuilding || BUILDING_PATTERN.test(buildingCode);
  const moduleValid = !paidRequiresModule || MODULE_PATTERN.test(moduleCode);
  const legacyJobNumber = isProjectStart
    ? legacyJobNumberFromProjectId(projectId)
    : legacyJobNumberFromProjectId(projectStartProjectId);
  const writeCustomFields = (
    patch: Record<string, string | number | boolean>,
  ) => {
    commitTransient((file) => ({
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                customFields: { ...item.customFields, ...patch },
              }
            : item,
        ),
      },
    }));
  };
  const minimumSize = getAdaptiveNodeSize(node);
  const iconKey =
    node.config.iconKey && node.config.iconKey in iconOptions
      ? (node.config.iconKey as keyof typeof iconOptions)
      : "activity";
  const Icon = iconOptions[iconKey];
  const color = node.color || getNodeDefinition("general").color;
  const conditions = node.conditions || [];
  const conditionReady = (condition: DomainNode["conditions"][number]) => {
    if (condition.id === "project-id-required") {
      return isProjectStart ? projectIdValid : Boolean(projectStartProjectId);
    }
    if (condition.id === "paid-building-required") return buildingValid;
    if (condition.id === "paid-module-required") return moduleValid;
    return condition.required === false || condition.checked === true;
  };
  const requiredConditions = conditions.filter(
    (condition) => condition.required !== false,
  );
  const releaseReady = requiredConditions.every(conditionReady);
  const statusReady = reached && releaseReady;
  const saveConditions = (next: DomainNode["conditions"]) =>
    updateNode(node.id, { conditions: next });
  return (
    <div
      data-canvas-node
      data-inspector-target="color"
      className={cn(
        "workflow-node group h-full w-full overflow-hidden rounded-xl border bg-card shadow-[0_3px_12px_rgba(15,23,42,.09)] transition",
        emphasized &&
          "shadow-[0_0_0_2px_rgba(37,99,169,.28),0_8px_22px_rgba(15,23,42,.12)]",
        dimmed && "opacity-35",
      )}
      style={{ borderColor: `${color}55` }}
    >
      <NodeResizer
        minWidth={minimumSize.width}
        minHeight={minimumSize.height}
        isVisible={selected}
        onResizeEnd={(_, params) =>
          useWorkflowStore
            .getState()
            .updateLayout(
              node.id,
              { width: params.width, height: params.height },
              true,
            )
        }
        lineClassName="!border-primary"
        handleClassName="!size-2.5 !rounded-sm !border-primary !bg-background"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-slate-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: color }}
      />
      <div
        className="nowheel flex h-11 cursor-grab items-center border-b px-3 active:cursor-grabbing"
        style={{ backgroundColor: `${color}0d` }}
      >
        <label
          data-inspector-target="config.iconKey"
          className="nodrag relative mr-2 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white shadow-sm"
          style={{ backgroundColor: color }}
          title="Change icon"
        >
          <Icon className="size-3.5" />
          <select
            aria-label="Node icon"
            value={iconKey}
            onChange={(event) =>
              updateNode(node.id, {
                config: { ...node.config, iconKey: event.target.value },
              })
            }
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {Object.keys(iconOptions).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[7px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Stage
          </span>
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          <input
            key={node.config.stage}
            aria-label="Stage"
            data-inspector-target="config.stage"
            defaultValue={node.config.stage || "Stage"}
            onBlur={(event) =>
              updateNode(node.id, {
                config: {
                  ...node.config,
                  stage: event.target.value.trim() || "Stage",
                },
              })
            }
            className="nodrag h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] font-bold outline-none"
          />
        </label>
        <ComponentNoteButton
          nodeId={node.id}
          noteKey="node-card"
          label={`${node.title} node card`}
          className="ml-2"
        />
        <span
          title={
            displayedProjectId
              ? `${displayedProjectId} · Legacy ${legacyJobNumberFromProjectId(displayedProjectId) || "—"}`
              : "Set a Project ID to display here"
          }
          className={cn(
            "ml-2 flex shrink-0 flex-col items-end gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold leading-tight tracking-tight",
            displayedProjectId
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground"
          )}
        >
          <span>{displayedProjectId || "L-—"}</span>
          <span
            className={cn(
              "rounded px-1 text-[8px] font-bold tracking-tight",
              displayedProjectId
                ? "bg-primary/20 text-primary"
                : "bg-background text-muted-foreground"
            )}
          >
            Legacy {legacyJobNumberFromProjectId(displayedProjectId) || "—"}
          </span>
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label="Drag node"
          className="ml-2 shrink-0 cursor-grab text-muted-foreground/50"
        >
          <GripVertical className="size-3.5" />
        </span>
      </div>
      <div data-node-content className="nodrag nowheel space-y-3 px-3 pb-3 pt-4">
        <label data-node-title className="block pt-0.5">
          <span className="sr-only">Node name</span>
          <textarea
            key={node.title}
            aria-label="Node name"
            data-inspector-target="title"
            defaultValue={node.title}
            rows={textareaRows(node.title, 42, 1)}
            onBlur={(event) => saveText(node, "title", event.target.value)}
            placeholder="Node name"
            className="min-h-8 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm font-semibold leading-6 outline-none placeholder:text-muted-foreground"
          />
        </label>
        {node.type === "projectStart" ? (
          <div className="space-y-2">
            <label className="block rounded-lg border border-primary/20 bg-primary/[0.04] px-2.5 py-2">
              <span className="mb-1 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.14em] text-primary">
                <span>
                  Project ID <span className="text-destructive">*</span>
                </span>
                <span
                  className={cn(
                    "font-mono font-semibold tracking-normal",
                    projectIdValid
                      ? "text-emerald-600"
                      : projectIdError
                        ? "text-destructive"
                        : "text-muted-foreground",
                  )}
                >
                  {projectIdValid
                    ? "OK"
                    : projectIdError
                      ? "Format L-YY-XXX"
                      : "L-YY-XXX"}
                </span>
              </span>
              <div className="flex items-center gap-0">
                <span className="font-mono text-sm font-bold leading-6 text-muted-foreground">
                  {(projectId.match(/^[LP]-/) || ["L-"])[0]}
                </span>
                <input
                  aria-label="Project ID year"
                  value={parsedYear}
                  inputMode="numeric"
                  maxLength={2}
                  onFocus={(event) => {
                    event.stopPropagation();
                    // Snapshot a *normalized* version of projectId, so partial edits
                    // can't read corrupt legacy state.
                    const normalizedAtFocus = normalizeProjectId(
                      String(node.customFields.projectId || ""),
                    );
                    projectIdSnapshot.current = {
                      ...node,
                      customFields: {
                        ...node.customFields,
                        projectId: normalizedAtFocus,
                      },
                    } as typeof node;
                  }}
                  onChange={(event) => {
                    event.stopPropagation();
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
                    const snapshot = projectIdSnapshot.current;
                    const snapshotId = snapshot ? String(snapshot.customFields.projectId || "") : "";
                    const fallbackId = normalizeProjectId(String(node.customFields.projectId || ""));
                    const source = snapshotId || fallbackId;
                    const prefix = (source.match(/^[LP]-/) || ["L-"])[0];
                    const seqMatch = source.match(/-\d{3}$/);
                    const tail = seqMatch ? seqMatch[0].slice(1) : "001";
                    // Preserve current year segment while editing; only restore on blur
                    const composed = `${prefix}${digits}-${tail}`;
                    setProjectIdDraft(composed);
                    writeCustomFields({ projectId: composed });
                  }}
                  onBlur={(event) => {
                    event.stopPropagation();
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 2);
                    if (!digits) {
                      const snapshot = projectIdSnapshot.current;
                      const snapshotId = snapshot ? String(snapshot.customFields.projectId || "") : "";
                      const fallbackId = normalizeProjectId(String(node.customFields.projectId || ""));
                      const source = snapshotId || fallbackId;
                      const prefix = (source.match(/^[LP]-/) || ["L-"])[0];
                      const seqMatch = source.match(/-\d{3}$/);
                      const tail = seqMatch ? seqMatch[0].slice(1) : "001";
                      const restored = `${prefix}${currentYearSuffix()}-${tail}`;
                      setProjectIdDraft(restored);
                      writeCustomFields({ projectId: restored });
                    }
                    projectIdSnapshot.current = null;
                  }}
                  className="h-7 w-7 border-0 bg-transparent p-0 text-center font-mono text-sm font-bold leading-6 outline-none placeholder:text-muted-foreground/60"
                />
                <span className="font-mono text-sm font-bold leading-6 text-muted-foreground">-</span>
                <input
                  aria-label="Project ID sequence"
                  value={parsedSeq}
                  inputMode="numeric"
                  maxLength={3}
                  onFocus={(event) => {
                    event.stopPropagation();
                    const normalizedAtFocus = normalizeProjectId(
                      String(node.customFields.projectId || ""),
                    );
                    projectIdSnapshot.current = {
                      ...node,
                      customFields: {
                        ...node.customFields,
                        projectId: normalizedAtFocus,
                      },
                    } as typeof node;
                  }}
                  onChange={(event) => {
                    event.stopPropagation();
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
                    const snapshot = projectIdSnapshot.current;
                    const snapshotId = snapshot ? String(snapshot.customFields.projectId || "") : "";
                    const fallbackId = normalizeProjectId(String(node.customFields.projectId || ""));
                    const source = snapshotId || fallbackId;
                    const matchedPrefix = source.match(/^[LP]-/);
                    const prefix = matchedPrefix ? matchedPrefix[0] : "L-";
                    const yy = (source.match(/-(\d{2})-/) || [null, currentYearSuffix()])[1];
                    const composed = `${prefix}${yy}-${digits}`;
                    setProjectIdDraft(composed);
                    writeCustomFields({ projectId: composed });
                  }}
                  onBlur={(event) => {
                    event.stopPropagation();
                    if (!projectIdSnapshot.current) return;
                    if (
                      projectIdSnapshot.current.customFields.projectId !==
                      node.customFields.projectId
                    ) {
                      const before = projectIdSnapshot.current;
                      const current = useWorkflowStore.getState().file;
                      const findCurrent = current.graph.nodes.find(
                        (item) => item.id === node.id,
                      );
                      if (findCurrent?.customFields.projectId !== before.customFields.projectId) {
                        const rollback = {
                          ...current,
                          graph: {
                            ...current.graph,
                            nodes: current.graph.nodes.map((item) =>
                              item.id === node.id
                                ? {
                                    ...item,
                                    customFields: {
                                      ...item.customFields,
                                      projectId: before.customFields.projectId,
                                      legacyJobNumber:
                                        legacyJobNumberFromProjectId(
                                          String(before.customFields.projectId || ""),
                                        ),
                                    },
                                  }
                                : item,
                            ),
                          },
                        };
                        const nextState = {
                          ...current,
                          graph: {
                            ...current.graph,
                            nodes: current.graph.nodes.map((item) =>
                              item.id === node.id
                                ? {
                                    ...item,
                                    customFields: {
                                      ...item.customFields,
                                      legacyJobNumber: legacyJobNumber,
                                    },
                                  }
                                : item,
                            ),
                          },
                        };
                        recordSnapshot(rollback);
                        recordSnapshot(nextState);
                      }
                    }
                    projectIdSnapshot.current = null;
                  }}
                  placeholder="001"
                  className="h-7 w-full border-0 bg-transparent p-0 font-mono text-sm font-bold leading-6 outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            </label>
          </div>
        ) : null}
        <label className="block">
          <span className="sr-only">Node content</span>
          <textarea
            key={node.description}
            aria-label="Node content"
            data-inspector-target="description"
            defaultValue={node.description}
            rows={textareaRows(node.description, 48, 3)}
            onBlur={(event) =>
              saveText(node, "description", event.target.value)
            }
            placeholder="Add content"
            className="min-h-14 w-full resize-none overflow-hidden rounded-md border border-transparent bg-muted/35 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground outline-none focus:border-primary/40 focus:bg-background"
          />
        </label>
        <section className="rounded-lg border bg-background/70 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className={cn("size-4", statusReady ? "text-emerald-600" : "text-amber-600")} />
            <span className="text-xs font-bold uppercase tracking-wide">Release conditions</span>
            <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", statusReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
              {!reached ? "Waiting" : releaseReady ? "Ready" : "Blocked"}
            </span>
          </div>
          <div className="space-y-1.5">
            {conditions.map((condition, index) => {
              const checked = conditionReady(condition);
              return (
                <div key={condition.id || index} className="flex min-h-10 items-center gap-2 rounded-md border bg-card px-2 py-2">
                  <button
                    type="button"
                    aria-label={`Release condition ${index + 1} satisfied`}
                    disabled={condition.id === "project-id-required"}
                    onClick={stopBubble(() => saveConditions(conditions.map((item, itemIndex) => itemIndex === index ? { ...item, checked: !item.checked } : item)))}
                    className={cn("flex size-5 shrink-0 items-center justify-center rounded border", checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background")}
                  >
                    <Check className={cn("size-3.5", !checked && "opacity-0")} />
                  </button>
                  <input
                    aria-label={`Release condition ${index + 1}`}
                    value={condition.label || condition.description || ""}
                    readOnly={condition.locked}
                    onChange={(event) => { event.stopPropagation(); saveConditions(conditions.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item)); }}
                    className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
                  />
                  {condition.required !== false ? <span className="text-xs font-bold text-destructive">*</span> : null}
                  {!condition.locked ? (
                    <button type="button" aria-label={`Delete release condition ${index + 1}`} onClick={stopBubble(() => saveConditions(conditions.filter((_, itemIndex) => itemIndex !== index)))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={stopBubble(() => saveConditions([...conditions, { id: `condition-${crypto.randomUUID().slice(0, 8)}`, label: "New release condition", required: true, checked: false }]))}
            className="mt-2 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="size-3.5" /> Add condition
          </button>
        </section>
      </div>
      {nodeUuid ? (
        <div className="nodrag pointer-events-none absolute bottom-1 right-2 z-10">
          <span
            title={nodeUuid}
            className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-tight text-muted-foreground shadow-sm"
          >
            UUID {nodeUuid.slice(0, 8)}
          </span>
        </div>
      ) : null}
    </div>
  );
}