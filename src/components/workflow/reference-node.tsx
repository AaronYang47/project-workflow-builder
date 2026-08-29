"use client";

import { memo } from "react";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { getNodeDefinition } from "@/lib/node-catalog";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type {
  DomainNode,
  ReferenceConfig,
  ReferenceSection,
} from "@/types/workflow";
import { ComponentNoteButton } from "./component-note-button";
import { isSectionBasedReference } from "./node-utils";

export type ReferenceFlowNode = Node<{ domain: DomainNode }, "reference">;

const lines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
const rowsFor = (value: string | undefined, characters = 38, minimum = 1) =>
  Math.max(
    minimum,
    (value || "")
      .split("\n")
      .reduce(
        (total, line) =>
          total + Math.max(1, Math.ceil(line.length / characters)),
        0,
      ),
  );

function ReferenceNodeComponent({
  data,
  selected,
}: NodeProps<ReferenceFlowNode>) {
  const node = data.domain;
  const definition = getNodeDefinition(node.type);
  const Icon = definition.icon;
  const reference = node.config.reference || {};
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const updateLayout = useWorkflowStore((state) => state.updateLayout);
  const save = (patch: Partial<ReferenceConfig>) =>
    updateNode(node.id, {
      config: { ...node.config, reference: { ...reference, ...patch } },
    });
  const saveTitle = (value: string) => {
    const title = value.trim();
    if (title && title !== node.title) updateNode(node.id, { title });
  };
  const saveDescription = (value: string) => {
    const description = value.trim();
    if (description !== node.description) updateNode(node.id, { description });
  };
  const sections = reference.sections || [];

  const updateSection = (index: number, patch: Partial<ReferenceSection>) =>
    save({
      sections: sections.map((section, itemIndex) =>
        itemIndex === index ? { ...section, ...patch } : section,
      ),
    });

  return (
    <div className="relative h-full w-full overflow-visible">
      <div
        data-canvas-node
        className={cn(
          "min-w-0 h-full w-full overflow-hidden rounded-2xl border bg-card shadow-[0_8px_28px_rgba(15,23,42,.12)] transition duration-200",
          node.type === "terminal" && "border-2",
          selected &&
            "ring-2 ring-primary/80 ring-offset-2 ring-offset-background shadow-lg",
        )}
        style={{ borderColor: `${node.color || definition.color}66` }}
      >
        <NodeResizer
          minWidth={280}
          minHeight={140}
          isVisible={selected}
          lineClassName="!border-primary"
          handleClassName="!size-2.5 !rounded-sm !border-primary !bg-background"
          onResizeEnd={(_, params) =>
            updateLayout(
              node.id,
              { width: params.width, height: params.height },
              true,
            )
          }
        />
        <div
          className="flex min-h-14 items-center border-b px-4 py-2"
          style={{ backgroundColor: `${node.color || definition.color}12` }}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: node.color || definition.color }}
          >
            <Icon className="size-3.5" />
          </span>
          <textarea
            aria-label={`${definition.label} title`}
            defaultValue={node.title}
            rows={rowsFor(node.title, 72)}
            onBlur={(event) => saveTitle(event.target.value)}
            className="nodrag ml-2 min-h-6 min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-xs font-black uppercase leading-5 tracking-[0.08em] outline-none"
          />
          <ComponentNoteButton
            nodeId={node.id}
            noteKey="reference-card"
            label={`${node.title} card`}
            className="mr-2"
          />
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
        </div>
        <div
          className={cn(
            "nodrag scroll-thin h-[calc(100%_-_3.5rem)] overflow-auto p-3",
            node.type === "terminal" && "relative overflow-hidden",
          )}
        >
          {node.type === "approvalMatrix" ? (
            <div className="min-w-max">
              <div
                className="mb-2 grid gap-1"
                style={{
                  gridTemplateColumns: `minmax(150px,1.5fr) repeat(${reference.columns?.length || 1},minmax(80px,1fr)) 24px 24px`,
                }}
              >
                <span className="px-2 py-1 text-[8px] font-black uppercase text-muted-foreground">
                  Document / Action
                </span>
                {(reference.columns || []).map((column, index) => (
                  <input
                    key={`${column}-${index}`}
                    defaultValue={column}
                    onBlur={(event) =>
                      save({
                        columns: (reference.columns || []).map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? event.target.value.trim()
                              : item,
                        ),
                      })
                    }
                    className="rounded border bg-background px-1 text-center text-[8px] font-bold"
                  />
                ))}
                <span />
                <span />
              </div>
              {(reference.rows || []).map((row, rowIndex) => (
                <div
                  key={row.id}
                  className="mb-1 grid items-center gap-1"
                  style={{
                    gridTemplateColumns: `minmax(150px,1.5fr) repeat(${reference.columns?.length || 1},minmax(80px,1fr)) 24px 24px`,
                  }}
                >
                  <input
                    defaultValue={row.label}
                    onBlur={(event) =>
                      save({
                        rows: (reference.rows || []).map((item, index) =>
                          index === rowIndex
                            ? { ...item, label: event.target.value.trim() }
                            : item,
                        ),
                      })
                    }
                    className="h-8 rounded border bg-background px-2 text-[9px] font-semibold"
                  />
                  {(reference.columns || []).map((_, approvalIndex) => (
                    <button
                      key={approvalIndex}
                      aria-label={`${row.label} approval ${approvalIndex + 1}`}
                      aria-pressed={row.approvals[approvalIndex]}
                      onClick={() =>
                        save({
                          rows: (reference.rows || []).map((item, index) =>
                            index === rowIndex
                              ? {
                                  ...item,
                                  approvals: (reference.columns || []).map(
                                    (__, columnIndex) =>
                                      columnIndex === approvalIndex
                                        ? !item.approvals[columnIndex]
                                        : Boolean(item.approvals[columnIndex]),
                                  ),
                                }
                              : item,
                          ),
                        })
                      }
                      className={cn(
                        "flex h-8 items-center justify-center rounded border",
                        row.approvals[approvalIndex]
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                          : "bg-background text-muted-foreground",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3.5",
                          !row.approvals[approvalIndex] && "opacity-0",
                        )}
                      />
                    </button>
                  ))}
                  <ComponentNoteButton
                    nodeId={node.id}
                    noteKey={`matrix-row:${row.id}`}
                    label={row.label}
                  />
                  <button
                    aria-label={`Delete ${row.label}`}
                    onClick={() =>
                      save({
                        rows: (reference.rows || []).filter(
                          (_, index) => index !== rowIndex,
                        ),
                      })
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  save({
                    rows: [
                      ...(reference.rows || []),
                      {
                        id: `matrix-${crypto.randomUUID().slice(0, 6)}`,
                        label: "New document / action",
                        approvals: (reference.columns || []).map(() => false),
                      },
                    ],
                  })
                }
                className="mt-2 flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-bold text-primary"
              >
                <Plus className="size-3" />
                Add row
              </button>
            </div>
          ) : null}

          {isSectionBasedReference(node.type) ? (
            <div>
              <div className="mb-2 flex justify-end">
                <button
                  onClick={() =>
                    save({
                      sections: [
                        ...sections,
                        {
                          id: `section-${crypto.randomUUID().slice(0, 6)}`,
                          title: "New section",
                          items: ["New item"],
                        },
                      ],
                    })
                  }
                  className="flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-bold text-primary"
                >
                  <Plus className="size-3" />
                  Add section
                </button>
              </div>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, sections.length))},minmax(220px,1fr))`,
                }}
              >
                {sections.map((section, index) => (
                  <div
                    key={section.id}
                    className="rounded-xl border bg-muted/15 p-2"
                  >
                    <div className="flex items-start gap-1">
                      <textarea
                        defaultValue={section.title}
                        rows={rowsFor(section.title, 28)}
                        onBlur={(event) =>
                          updateSection(index, {
                            title: event.target.value.trim(),
                          })
                        }
                        className="min-h-6 min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[9px] font-black uppercase leading-4 outline-none"
                      />
                      <ComponentNoteButton
                        nodeId={node.id}
                        noteKey={`section:${section.id}`}
                        label={section.title}
                      />
                      <button
                        onClick={() =>
                          save({
                            sections: sections.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-3 text-muted-foreground" />
                      </button>
                    </div>
                    <textarea
                      defaultValue={section.items.join("\n")}
                      rows={rowsFor(section.items.join("\n"), 34, 3)}
                      onBlur={(event) =>
                        updateSection(index, {
                          items: lines(event.target.value),
                        })
                      }
                      className="mt-2 min-h-20 w-full resize-none overflow-hidden rounded-md border bg-background/80 p-2 text-[9px] leading-[17px] outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {node.type === "serviceLegend" ? (
            <div className="grid grid-cols-2 gap-2">
              {(reference.items || []).map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <input
                    type="color"
                    value={item.color}
                    onChange={(event) =>
                      save({
                        items: (reference.items || []).map(
                          (entry, itemIndex) =>
                            itemIndex === index
                              ? { ...entry, color: event.target.value }
                              : entry,
                        ),
                      })
                    }
                    className="size-7 rounded border"
                  />
                  <input
                    defaultValue={item.label}
                    onBlur={(event) =>
                      save({
                        items: (reference.items || []).map(
                          (entry, itemIndex) =>
                            itemIndex === index
                              ? { ...entry, label: event.target.value.trim() }
                              : entry,
                        ),
                      })
                    }
                    className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold outline-none"
                  />
                  <input
                    defaultValue={item.description || ""}
                    placeholder="Hover explanation"
                    aria-label={`${item.label} explanation`}
                    onBlur={(event) =>
                      save({
                        items: (reference.items || []).map(
                          (entry, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...entry,
                                  description: event.target.value.trim(),
                                }
                              : entry,
                        ),
                      })
                    }
                    className="min-w-0 flex-[1.5] bg-transparent text-[9px] text-muted-foreground outline-none"
                  />
                  <ComponentNoteButton
                    nodeId={node.id}
                    noteKey={`legend-item:${item.id}`}
                    label={item.label}
                  />
                  <button
                    onClick={() =>
                      save({
                        items: (reference.items || []).filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  save({
                    items: [
                      ...(reference.items || []),
                      {
                        id: `legend-${crypto.randomUUID().slice(0, 6)}`,
                        label: "New classification",
                        color: "#64748b",
                        description: "Explain when this service type applies.",
                      },
                    ],
                  })
                }
                className="flex items-center justify-center gap-1 rounded-lg border p-2 text-[9px] font-bold text-primary"
              >
                <Plus className="size-3" />
                Add classification
              </button>
            </div>
          ) : null}

          {node.type === "jobNumbering" ? (
            <div className="grid grid-cols-[1fr_42px_1fr] items-stretch gap-3">
              <label className="rounded-xl border bg-blue-50/40 p-3">
                <span className="flex items-center text-[9px] font-black uppercase">
                  Current
                  <ComponentNoteButton
                    nodeId={node.id}
                    noteKey="job-numbering:current"
                    label="Current job numbering"
                    className="ml-auto"
                  />
                </span>
                <textarea
                  defaultValue={(reference.current || []).join("\n")}
                  rows={rowsFor((reference.current || []).join("\n"), 50, 4)}
                  onBlur={(event) =>
                    save({ current: lines(event.target.value) })
                  }
                  className="mt-2 min-h-24 w-full resize-none overflow-hidden rounded border bg-background p-2 text-[9px] leading-[17px]"
                />
              </label>
              <span className="flex items-center justify-center text-xl text-primary">
                →
              </span>
              <label className="rounded-xl border bg-emerald-50/40 p-3">
                <span className="flex items-center text-[9px] font-black uppercase">
                  Proposed
                  <ComponentNoteButton
                    nodeId={node.id}
                    noteKey="job-numbering:proposed"
                    label="Proposed job numbering"
                    className="ml-auto"
                  />
                </span>
                <textarea
                  defaultValue={(reference.proposed || []).join("\n")}
                  rows={rowsFor((reference.proposed || []).join("\n"), 50, 4)}
                  onBlur={(event) =>
                    save({ proposed: lines(event.target.value) })
                  }
                  className="mt-2 min-h-24 w-full resize-none overflow-hidden rounded border bg-background p-2 text-[9px] leading-[17px]"
                />
              </label>
            </div>
          ) : null}

          {node.type === "businessRules" ? (
            <div className="relative">
              <ComponentNoteButton
                nodeId={node.id}
                noteKey="business-rules"
                label="Business rules"
                className="absolute right-2 top-2 z-10"
              />
              <textarea
                defaultValue={(reference.rules || []).join("\n")}
                rows={rowsFor((reference.rules || []).join("\n"), 70, 8)}
                onBlur={(event) => save({ rules: lines(event.target.value) })}
                className="min-h-52 w-full resize-none overflow-hidden rounded-xl border bg-muted/15 p-3 text-[10px] leading-6 outline-none focus:border-primary"
              />
            </div>
          ) : null}

          {node.type === "terminal" ? (
            <div className="absolute inset-x-3 bottom-6 top-3 flex min-h-0 flex-col items-center justify-center rounded-2xl bg-emerald-50/70 px-6 text-center dark:bg-emerald-950/30">
              <ComponentNoteButton
                nodeId={node.id}
                noteKey="completion"
                label="Project complete"
                className="absolute right-3 top-3"
              />
              <textarea
                aria-label="Completion title"
                defaultValue={node.title}
                rows={rowsFor(node.title, 34)}
                onBlur={(event) => saveTitle(event.target.value)}
                className="w-full resize-none overflow-hidden bg-transparent text-center text-lg font-black uppercase leading-6 text-emerald-800 outline-none dark:text-emerald-300"
              />
              <textarea
                aria-label="Completion content"
                defaultValue={node.description}
                rows={rowsFor(node.description, 54, 2)}
                onBlur={(event) => saveDescription(event.target.value)}
                className="mt-2 min-h-12 w-full resize-none overflow-hidden bg-transparent text-center text-[10px] leading-4 text-emerald-700 outline-none dark:text-emerald-400"
              />
            </div>
          ) : null}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-slate-500"
      />
      {node.type !== "terminal" ? (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!size-3 !border-2 !border-background"
          style={{ backgroundColor: node.color || definition.color }}
        />
      ) : null}
      <Handle
        type="target"
        position={Position.Top}
        id="rework-in"
        aria-label="Denied return entry"
        className="!top-[-7px] !z-50 !size-3.5 !border-2 !border-background !bg-rose-600"
      />
    </div>
  );
}

export const ReferenceNode = memo(ReferenceNodeComponent);
