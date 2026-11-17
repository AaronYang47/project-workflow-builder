"use client";

import { useRef } from "react";
import { type InspectorField } from "@/lib/inspector-schema";
import {
  legacyJobNumberFromProjectId,
  promoteToPaidService,
  syncProjectNameIdentity,
  shouldAutoPromoteToPaid,
  syncPaidConditions,
} from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { readPath, writePath } from "@/lib/object-path";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { chapterLabel } from "@/lib/chapter-label";

/** Marks a node as Paid Service and adds the paid-service conditions. */
const applyPromoteToPaid = (node: DomainNode): DomainNode => {
  const promoted = promoteToPaidService(node);
  return { ...promoted, conditions: syncPaidConditions(promoted, true) };
};

export function Field({
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
  const setFocusedInspectorField = useWorkflowStore.getState().setFocusedInspectorField;
  const onContainerFocus = () => setFocusedInspectorField(field.key);
  const onContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setFocusedInspectorField(undefined);
  };
  const set = (value: unknown, transient = false) => {
    const store = useWorkflowStore.getState();
    let next = writePath(node, field.key, value);
    if (field.key === "customFields.projectId") {
      next = {
        ...next,
        customFields: {
          ...next.customFields,
          legacyJobNumber: legacyJobNumberFromProjectId(String(value || "")),
        },
      };
    }
    if (transient) {
      if (!initial.current) initial.current = structuredClone(node);
      store.commitTransient((file) => ({
        ...file,
        graph: {
          ...file.graph,
          metadata:
            field.key === "customFields.projectId" || field.key === "customFields.customerCode"
              ? {
                  ...file.graph.metadata,
                  name: syncProjectNameIdentity(
                    file.graph.metadata.name,
                    field.key === "customFields.projectId"
                      ? legacyJobNumberFromProjectId(String(value || ""))
                      : undefined,
                    field.key === "customFields.customerCode" ? String(value || "") : undefined,
                  ),
                }
              : file.graph.metadata,
          nodes: file.graph.nodes.map((item) => (item.id === node.id ? next : item)),
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
          .file.graph.nodes.map((item) => (item.id === node.id ? initial.current! : item)),
      },
    });
    initial.current = null;
  };
  const textProps = { onBlur: finish };
  const textValue =
    field.type === "tags" && Array.isArray(raw)
      ? raw.join(", ")
      : field.key === "customFields.projectId"
        ? legacyJobNumberFromProjectId(String(raw || "")) ||
          String(raw || "")
            .replace(/\D/g, "")
            .slice(0, 5)
        : field.key === "config.stage"
          ? chapterLabel(String(raw || ""))
          : field.type === "text" && field.mask === "digits"
            ? String(raw || "").replace(/\D/g, "")
            : String(raw || "");
  return (
    <div className="space-y-1.5" onFocus={onContainerFocus} onBlur={onContainerBlur}>
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
              const currentProjectId = String(readPath(node, "customFields.projectId") || "");
              const desiredPrefix = e.target.value === "Paid Service" ? "P" : "L";
              const next = writePath(
                node,
                "customFields.projectId",
                currentProjectId.replace(/^[LP]-/, `${desiredPrefix}-`),
              );
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
          maxLength={field.key === "customFields.projectId" ? 5 : field.maxLength}
          inputMode={
            field.mask === "digits" || field.key === "customFields.projectId"
              ? "numeric"
              : undefined
          }
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
                      ? (() => {
                          const digits = raw.replace(/\D/g, "").slice(0, 5);
                          const prefix =
                            String(node.config?.serviceType || "") === "Paid Service" ? "P" : "L";
                          return digits.length === 5
                            ? `${prefix}-${digits.slice(0, 2)}-${digits.slice(2)}`
                            : digits;
                        })()
                      : field.key === "customFields.customerCode"
                        ? raw
                            .toUpperCase()
                            .replace(/[^A-Z]/g, "")
                            .slice(0, 4)
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
      {field.helpText ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{field.helpText}</p>
      ) : null}
    </div>
  );
}
