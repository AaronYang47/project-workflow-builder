"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import { Check, GripVertical, Plus, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { getNodeDefinition } from "@/lib/node-catalog";
import { cn } from "@/lib/utils";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import {
  PROJECT_ID_PATTERN,
  currentYearSuffix,
  legacyJobNumberFromProjectId,
  normalizeProjectId,
  projectNodeUuid,
} from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { conditionHasL3Forms, conditionIsSatisfied, nodeReleaseReady } from "@/lib/workflow-progress";
import { conditionInspectorKey } from "@/lib/inspector-schema";
import { ComponentNoteButton } from "./component-note-button";
import { ProjectIdBadge } from "./project-id-badge";
import { iconOptions, saveText, stopBubble, textareaRows } from "./node-utils";
import { getNodeColor } from "./high-level-node";

import { useProjectIdDraft } from "./use-project-id-draft";

const CONDITION_ROW_STEP = 46;

export function GeneralNode({
  node,
  selected,
  emphasized,
  dimmed,
  reached = true,
  phaseColor,
}: {
  node: DomainNode;
  selected: boolean;
  emphasized?: boolean;
  dimmed?: boolean;
  reached?: boolean;
  phaseColor?: string;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const deleteNodeCondition = useWorkflowStore(
    (state) => state.deleteNodeCondition,
  );
  const updateExecutionItem = useWorkflowStore(
    (state) => state.updateExecutionItem,
  );
  const commitTransient = useWorkflowStore((state) => state.commitTransient);
  const recordSnapshot = useWorkflowStore((state) => state.recordSnapshot);
  const fileNodes = useWorkflowStore((state) => state.file.graph.nodes);
  const executionItems = useWorkflowStore(
    (state) => state.file.execution?.items ?? [],
  );
  const operations = useWorkflowStore((state) => state.file.operations);
  const projectStartNode = useMemo(
    () => fileNodes.find((item) => item.type === "projectStart"),
    [fileNodes],
  );

  const {
    isProjectStart,
    projectStartProjectId,
    nodeUuid,
    projectIdDraft,
    setProjectIdDraft,
    projectIdSnapshotRef,
    projectId,
    parsedYear,
    parsedSeq,
    projectIdValid,
    projectIdError,
    legacyJobNumber,
    writeCustomFields,
  } = useProjectIdDraft({
    node,
    projectStartNode,
    commitTransient,
  });
  const minimumSize = getAdaptiveNodeSize(node);
  const iconKey =
    node.config.iconKey && node.config.iconKey in iconOptions
      ? (node.config.iconKey as keyof typeof iconOptions)
      : "activity";
  const Icon = iconOptions[iconKey];
  const effectiveColor =
    phaseColor || node.color || getNodeDefinition("general").color;
  const color = effectiveColor;
  const conditions = node.conditions || [];
  const statusReady = reached && nodeReleaseReady(
    node,
    projectStartNode,
    executionItems,
    operations,
  );
  const focusedInspectorField = useWorkflowStore(
    (state) => state.focusedInspectorField,
  );
  const nodeColor = useMemo(() => getNodeColor(effectiveColor), [effectiveColor]);
  const [draggingConditionIndex, setDraggingConditionIndex] = useState<number | null>(null);
  const [dragOverConditionIndex, setDragOverConditionIndex] = useState<number | null>(null);
  const [dragTargetConditionIndex, setDragTargetConditionIndex] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [dragRowStep, setDragRowStep] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const saveConditions = (next: DomainNode["conditions"]) =>
    updateNode(node.id, { conditions: next });
  const reorderConditions = (targetIndex: number) => {
    if (draggingConditionIndex === null || draggingConditionIndex === targetIndex) return;
    const nextConditions = [...conditions];
    const [movedCondition] = nextConditions.splice(draggingConditionIndex, 1);
    if (!movedCondition) return;
    nextConditions.splice(targetIndex, 0, movedCondition);
    saveConditions(nextConditions);
  };
  const finishConditionDrag = () => {
    if (dragOverConditionIndex !== null) reorderConditions(dragOverConditionIndex);
    setDraggingConditionIndex(null);
    setDragOverConditionIndex(null);
    setDragTargetConditionIndex(null);
    setDragStartY(null);
    setDragRowStep(0);
    setDragOffsetY(0);
  };
  return (
    <Fragment>
      <div className="relative h-full w-full overflow-visible">
        <div
          data-canvas-node
          data-selected={selected || undefined}
          data-inspector-target="color"
          data-glass-tint={nodeColor ? "true" : undefined}
          className={cn(
            "workflow-node l2-node-card group h-full w-full overflow-hidden rounded-xl border bg-card shadow-[0_3px_12px_rgba(15,23,42,.09)] transition duration-200",
            node.type === "projectStart" &&
              "rounded-2xl border-2 shadow-[0_6px_18px_rgba(37,99,169,.12)]",
            selected &&
              "ring-2 ring-primary/80 ring-offset-2 ring-offset-background shadow-lg",
            emphasized &&
              "shadow-[0_0_0_2px_rgba(37,99,169,.28),0_8px_22px_rgba(15,23,42,.12)]",
            dimmed && "opacity-35",
          )}
          style={{
            borderColor: nodeColor ? nodeColor.border : `${color}55`,
            ...(nodeColor
              ? ({ "--node-glass-tint": nodeColor.tint } as React.CSSProperties)
              : {}),
          }}
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
          <div
            data-node-header
            className="flex h-14 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing"
            style={{
              backgroundColor: nodeColor
                ? `color-mix(in srgb, rgb(${nodeColor.tint}) 16%, transparent)`
                : `${color}18`,
              borderColor: nodeColor
                ? `color-mix(in srgb, rgb(${nodeColor.tint}) 30%, transparent)`
                : `${color}33`,
            }}
          >
            <label
              data-inspector-target="config.iconKey"
              className="nodrag relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white shadow-sm"
              style={{ backgroundColor: color }}
              title="Change icon"
            >
              <Icon className="size-4" />
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
            <label className="flex shrink-0 items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Stage
              </span>
              <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
              <input
                key={node.config.stage}
                aria-label="Stage"
                data-inspector-target="config.stage"
                defaultValue={node.config.stage || "Stage"}
                size={Math.max(4, (node.config.stage || "Stage").length)}
                onBlur={(event) =>
                  updateNode(node.id, {
                    config: {
                      ...node.config,
                      stage: event.target.value.trim() || "Stage",
                    },
                  })
                }
                className="nodrag h-8 w-auto min-w-[4.5rem] shrink-0 border-0 bg-transparent p-0 text-xs font-bold outline-none"
              />
            </label>
            <ProjectIdBadge className="ml-auto shrink-0" showPlaceholder />
            <ComponentNoteButton
              nodeId={node.id}
              noteKey="node-card"
              label={`${node.title} node card`}
              className="shrink-0"
            />
            <span
              role="button"
              tabIndex={0}
              aria-label="Drag node"
              className="shrink-0 cursor-grab text-muted-foreground/50"
            >
              <GripVertical className="size-3.5" />
            </span>
          </div>
          <div
            data-node-content
            className="nodrag space-y-3 px-3 pb-3 pt-4"
          >
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
              <div className="my-3 space-y-2">
                <label className="block rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-3">
                  <span className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                    <span>
                      Project ID <span className="text-destructive">*</span>
                    </span>
                    <span
                      className={cn(
                        "font-mono font-semibold tracking-normal text-xs",
                        projectIdValid
                          ? "text-emerald-600 dark:text-emerald-400"
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
                    <span className="w-7 text-center font-mono text-sm font-bold leading-6 text-muted-foreground">
                      {(projectId.match(/^[LP]-/) || ["L-"])[0]}
                    </span>
                    <input
                      aria-label="Project ID year"
                      value={parsedYear}
                      inputMode="numeric"
                      maxLength={2}
                      onFocus={(event) => {
                        event.stopPropagation();
                        const normalizedAtFocus = normalizeProjectId(
                          String(node.customFields.projectId || ""),
                        );
                        projectIdSnapshotRef.current = {
                          ...node,
                          customFields: {
                            ...node.customFields,
                            projectId: normalizedAtFocus,
                          },
                        } as typeof node;
                      }}
                      onChange={(event) => {
                        event.stopPropagation();
                        const digits = event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 2);
                        const snapshot = projectIdSnapshotRef.current;
                        const snapshotId = snapshot
                          ? String(snapshot.customFields.projectId || "")
                          : "";
                        const fallbackId = normalizeProjectId(
                          String(node.customFields.projectId || ""),
                        );
                        const source = snapshotId || fallbackId;
                        const prefix = (source.match(/^[LP]-/) || ["L-"])[0];
                        const seqMatch = source.match(/-\d{3}$/);
                        const tail = seqMatch ? seqMatch[0].slice(1) : "001";
                        const composed = `${prefix}${digits}-${tail}`;
                        setProjectIdDraft(composed);
                        writeCustomFields({ projectId: composed });
                      }}
                      onBlur={(event) => {
                        event.stopPropagation();
                        const digits = event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 2);
                        if (!digits) {
                          const snapshot = projectIdSnapshotRef.current;
                          const snapshotId = snapshot
                            ? String(snapshot.customFields.projectId || "")
                            : "";
                          const fallbackId = normalizeProjectId(
                            String(node.customFields.projectId || ""),
                          );
                          const source = snapshotId || fallbackId;
                          const prefix = (source.match(/^[LP]-/) || ["L-"])[0];
                          const seqMatch = source.match(/-\d{3}$/);
                          const tail = seqMatch ? seqMatch[0].slice(1) : "001";
                          const restored = `${prefix}${currentYearSuffix()}-${tail}`;
                          setProjectIdDraft(restored);
                          writeCustomFields({ projectId: restored });
                        }
                        projectIdSnapshotRef.current = null;
                      }}
                      className="h-7 w-7 border-0 bg-transparent p-0 text-center font-mono text-sm font-bold leading-6 outline-none placeholder:text-muted-foreground/60"
                    />
                    <span className="font-mono text-sm font-bold leading-6 text-muted-foreground">
                      -
                    </span>
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
                        projectIdSnapshotRef.current = {
                          ...node,
                          customFields: {
                            ...node.customFields,
                            projectId: normalizedAtFocus,
                          },
                        } as typeof node;
                      }}
                      onChange={(event) => {
                        event.stopPropagation();
                        const digits = event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 3);
                        const snapshot = projectIdSnapshotRef.current;
                        const snapshotId = snapshot
                          ? String(snapshot.customFields.projectId || "")
                          : "";
                        const fallbackId = normalizeProjectId(
                          String(node.customFields.projectId || ""),
                        );
                        const source = snapshotId || fallbackId;
                        const matchedPrefix = source.match(/^[LP]-/);
                        const prefix = matchedPrefix ? matchedPrefix[0] : "L-";
                        const yy = (source.match(/-(\d{2})-/) || [
                          null,
                          currentYearSuffix(),
                        ])[1];
                        const composed = `${prefix}${yy}-${digits}`;
                        setProjectIdDraft(composed);
                        writeCustomFields({ projectId: composed });
                      }}
                      onBlur={(event) => {
                        event.stopPropagation();
                        if (!projectIdSnapshotRef.current) return;
                        if (
                          projectIdSnapshotRef.current.customFields
                            .projectId !== node.customFields.projectId
                        ) {
                          const before = projectIdSnapshotRef.current;
                          const current = useWorkflowStore.getState().file;
                          const findCurrent = current.graph.nodes.find(
                            (item) => item.id === node.id,
                          );
                          if (
                            findCurrent?.customFields.projectId !==
                            before.customFields.projectId
                          ) {
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
                                          projectId:
                                            before.customFields.projectId,
                                          legacyJobNumber:
                                            legacyJobNumberFromProjectId(
                                              String(
                                                before.customFields.projectId ||
                                                  "",
                                              ),
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
                        projectIdSnapshotRef.current = null;
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
                className="min-h-14 w-full resize-none overflow-hidden rounded-md border border-transparent bg-muted/35 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground outline-none focus:border-primary/40 focus:bg-background"
              />
            </label>
            <section className="rounded-lg border bg-background/70 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck
                  className={cn(
                    "size-4",
                    statusReady ? "text-emerald-600" : "text-amber-600",
                  )}
                />
                <span className="text-xs font-bold uppercase tracking-wide">
                  Release conditions
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold uppercase",
                    statusReady
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                  )}
                >
                  {!reached
                    ? "Waiting"
                    : statusReady
                      ? "Ready"
                      : "Blocked"}
                </span>
              </div>
              <div className="space-y-1.5">
                {conditions.map((condition, index) => {
                  const inspectorKey = conditionInspectorKey(
                    node.id,
                    condition.id,
                    index,
                  );
                  const inspectorFocused = focusedInspectorField === inspectorKey;
                  const focusCondition = () => {
                    const store = useWorkflowStore.getState();
                    store.selectNodes([node.id]);
                    store.setFocusedInspectorField(inspectorKey);
                  };
                  const checked = conditionIsSatisfied(
                    condition,
                    node,
                    projectStartNode,
                    executionItems,
                    operations,
                  );
                  const hasL3Forms = conditionHasL3Forms(condition, node);
                  const rowShift = (() => {
                    if (
                      draggingConditionIndex === null ||
                      dragTargetConditionIndex === null
                    ) {
                      return 0;
                    }
                    if (index === draggingConditionIndex) return dragOffsetY;
                    if (
                      draggingConditionIndex < dragTargetConditionIndex &&
                      index > draggingConditionIndex &&
                      index <= dragTargetConditionIndex
                    ) {
                      return -CONDITION_ROW_STEP;
                    }
                    if (
                      dragTargetConditionIndex < draggingConditionIndex &&
                      index >= dragTargetConditionIndex &&
                      index < draggingConditionIndex
                    ) {
                      return CONDITION_ROW_STEP;
                    }
                    return 0;
                  })();
                  const rowStyle = rowShift
                    ? { transform: `translateY(${rowShift}px)` }
                    : undefined;
                  const toggleCondition = () => {
                    if (condition.id === "project-id-required") return;
                    const linkedItem = condition.linkedExecutionItemId
                      ? executionItems.find(
                          (item) => item.id === condition.linkedExecutionItemId,
                        )
                      : undefined;
                    if (linkedItem) {
                      updateExecutionItem(linkedItem.id, {
                        checklistComplete: !checked,
                      });
                      return;
                    }
                    saveConditions(
                      conditions.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, checked: !checked }
                          : item,
                      ),
                    );
                  };
                  return (
                    <div
                      key={condition.id || index}
                      role="group"
                      aria-label={`Release condition ${index + 1}`}
                      data-release-condition-index={index}
                      data-dragging={draggingConditionIndex === index || undefined}
                      data-drop-target={
                        dragTargetConditionIndex === index &&
                        draggingConditionIndex !== index
                          ? true
                          : undefined
                      }
                      onClick={stopBubble(focusCondition)}
                      onDragOver={(event) => {
                        if (draggingConditionIndex !== null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverConditionIndex(index);
                        setDragTargetConditionIndex(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        reorderConditions(index);
                        setDraggingConditionIndex(null);
                        setDragOverConditionIndex(null);
                        setDragTargetConditionIndex(null);
                        setDragStartY(null);
                        setDragRowStep(0);
                        setDragOffsetY(0);
                      }}
                      className={cn(
                        "relative flex min-h-10 items-center gap-2 rounded-md border bg-card px-2 py-2 transition-[background-color,border-color,box-shadow,opacity,transform] duration-200",
                        inspectorFocused &&
                          "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
                        !inspectorFocused && "hover:border-primary/35 hover:bg-primary/[0.025]",
                        dragTargetConditionIndex === index &&
                          draggingConditionIndex !== index &&
                          "border-primary/90 bg-primary/[0.10] shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_18%,transparent),0_8px_18px_color-mix(in_srgb,var(--primary)_12%,transparent)]",
                        draggingConditionIndex === index &&
                          "z-10 scale-[1.015] border-primary/90 bg-primary/[0.12] opacity-60 shadow-[0_10px_22px_color-mix(in_srgb,var(--primary)_20%,transparent)]",
                      )}
                      style={rowStyle}
                    >
                      <button
                        type="button"
                        aria-label={`Drag to reorder release condition ${index + 1}`}
                        title="Drag to reorder"
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const row = event.currentTarget.closest<HTMLElement>(
                            "[data-release-condition-index]",
                          );
                          const nextRow = row?.nextElementSibling as HTMLElement | null;
                          const previousRow =
                            row?.previousElementSibling as HTMLElement | null;
                          const rowRect = row?.getBoundingClientRect();
                          const rowStep =
                            rowRect && nextRow
                              ? nextRow.getBoundingClientRect().top - rowRect.top
                              : rowRect && previousRow
                                ? rowRect.top -
                                  previousRow.getBoundingClientRect().top
                                : rowRect?.height || CONDITION_ROW_STEP;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDraggingConditionIndex(index);
                        setDragStartY(
                            rowRect
                              ? rowRect.top + rowRect.height / 2
                              : event.clientY,
                          );
                          setDragRowStep(Math.max(1, rowStep));
                          setDragOffsetY(0);
                          setDragOverConditionIndex(index);
                          setDragTargetConditionIndex(index);
                        }}
                        onPointerMove={(event) => {
                          if (
                            draggingConditionIndex === null ||
                            dragStartY === null ||
                            dragRowStep <= 0
                          ) {
                            return;
                          }
                          const targetIndex = Math.min(
                            conditions.length - 1,
                            Math.max(
                              0,
                              draggingConditionIndex +
                                Math.round(
                                  (event.clientY - dragStartY) / dragRowStep,
                                ),
                            ),
                          );
                          setDragOffsetY(
                            ((event.clientY - dragStartY) / dragRowStep) *
                              CONDITION_ROW_STEP,
                          );
                          setDragTargetConditionIndex(targetIndex);
                          setDragOverConditionIndex(targetIndex);
                        }}
                        onPointerUp={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }
                          finishConditionDrag();
                        }}
                        onPointerCancel={() => {
                          setDraggingConditionIndex(null);
                          setDragOverConditionIndex(null);
                          setDragTargetConditionIndex(null);
                          setDragStartY(null);
                          setDragRowStep(0);
                          setDragOffsetY(0);
                        }}
                        onClick={stopBubble(() => undefined)}
                        className={cn(
                          "nodrag flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/70 transition-[background-color,color,transform] hover:bg-primary/10 hover:text-primary active:cursor-grabbing",
                          draggingConditionIndex === index &&
                            "cursor-grabbing bg-primary/15 text-primary",
                        )}
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${checked ? "Uncheck" : "Check"} release condition ${index + 1}`}
                        title={
                          condition.id === "project-id-required"
                            ? "Complete the project ID field first"
                            : checked
                              ? "Uncheck this release condition"
                              : "Mark this release condition complete"
                        }
                        disabled={
                          condition.id === "project-id-required" ||
                          hasL3Forms
                        }
                        onClick={stopBubble(toggleCondition)}
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-border bg-background",
                          !checked && hasL3Forms && "condition-forms-breathe condition-forms-checkbox",
                        )}
                      >
                        <Check
                          className={cn("size-3.5", !checked && "opacity-0")}
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={`Open L3 details for release condition ${index + 1}`}
                        title="Click to view and edit L3 details for this condition"
                        onClick={stopBubble(() => {
                          window.dispatchEvent(
                            new CustomEvent("workflow:open-execution", {
                              detail: {
                                nodeId: node.id,
                                conditionId: condition.id || `condition-${index}`,
                              },
                            }),
                          );
                        })}
                        className="min-w-0 flex-1 truncate bg-transparent py-0.5 text-left text-xs font-medium outline-none transition-colors hover:text-primary hover:underline cursor-pointer focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {condition.label || condition.description || `Release condition ${index + 1}`}
                        {condition.required !== false ? (
                          <span className="ml-1 text-xs font-bold text-destructive">
                            *
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit release condition ${index + 1} in Inspector`}
                        title="Edit this release condition in Inspector"
                        onClick={stopBubble(focusCondition)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <Settings2 className="size-3.5" />
                      </button>
                      {!condition.locked ? (
                        <button
                          type="button"
                          aria-label={`Delete release condition ${index + 1}`}
                          onClick={stopBubble(() =>
                            deleteNodeCondition(node.id, condition.id, index),
                          )}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={stopBubble(() =>
                  saveConditions([
                    ...conditions,
                    {
                      id: `condition-${crypto.randomUUID().slice(0, 8)}`,
                      label: "New release condition",
                      required: true,
                      checked: false,
                    },
                  ]),
                )}
                className="mt-2 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
              >
                <Plus className="size-3.5" /> Add condition
              </button>
            </section>
          </div>
        </div>
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
        {node.type !== "projectStart" ? (
          <Handle
            type="target"
            position={Position.Top}
            id="rework-in"
            aria-label="Denied return entry"
            className="!top-[-7px] !z-50 !size-3.5 !border-2 !border-background !bg-rose-600 !opacity-0"
          />
        ) : null}
      </div>
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
    </Fragment>
  );
}
