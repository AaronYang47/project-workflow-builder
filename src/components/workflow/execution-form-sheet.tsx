"use client";

import { useEffect, useMemo } from "react";
import {
  CheckCircle2,
  CircleAlert,
  FileLock2,
  Link2,
  LockKeyhole,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  executionItemApplicability,
  executionItemApplicabilityDetermination,
  executionItemFormMissingFields,
} from "@/lib/execution";
import {
  applyProfabFieldBinding,
  changedProfabSnapshotFields,
  materializeProfabFormValues,
  profabFieldIsRequired,
  profabFieldIsVisible,
  profabValueIsComplete,
  resolveProfabFieldValue,
} from "@/lib/profab-form-runtime";
import {
  getProfabForm,
  PROFAB_FORM_BY_ID,
  type ProfabFormFieldDefinition,
} from "@/lib/profab-forms";
import { useWorkflowStore } from "@/store/workflow-store";
import type {
  ExecutionApplicabilityDetermination,
  ExecutionFormSnapshot,
  ExecutionFormValue,
  ExecutionItem,
  EditableFormField,
  ExecutionFormOverrides,
} from "@/types/workflow";
import { cn } from "@/lib/utils";

const inputClass =
  "h-9 w-full rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:bg-muted/45 disabled:text-muted-foreground";

function authorizationState(
  item: ExecutionItem,
  executionStateRecorded = false,
): ExecutionFormSnapshot["authorizationState"] {
  const executed = item.signatureStatus === "Signed" || executionStateRecorded;
  const approved = item.approvalStatus === "Approved";
  return executed && approved
    ? "Executed & Approved"
    : executed
      ? "Executed"
      : "Approved";
}

function fieldDisplayValue(value: ExecutionFormValue) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value || "—";
}

function editableFieldFromDefinition(
  definition: ProfabFormFieldDefinition,
): EditableFormField {
  return {
    id: definition.id,
    label: definition.label,
    type: definition.type,
    required: definition.required,
    section: definition.section,
    ...(definition.placeholder ? { placeholder: definition.placeholder } : {}),
    ...(definition.help ? { help: definition.help } : {}),
    ...(definition.options?.length ? { options: [...definition.options] } : {}),
  };
}

export function ExecutionFormSheet({
  item,
  onChange,
}: {
  item: ExecutionItem;
  onChange: (patch: Partial<ExecutionItem>) => void;
}) {
  const form = getProfabForm(item);
  const operations = useWorkflowStore((state) => state.file.operations);
  const updateOperations = useWorkflowStore((state) => state.updateOperations);
  const values = useMemo(() => item.formValues || {}, [item.formValues]);
  const applicability = executionItemApplicability(item);
  const determination = executionItemApplicabilityDetermination(item);

  const materializedValues = useMemo(
    () => form ? materializeProfabFormValues(form, values, operations) : {},
    [form, operations, values],
  );
  const materializedFingerprint = JSON.stringify(materializedValues);
  const changedSnapshotFields = useMemo(() => {
    if (!item.formSnapshot) return [];
    const changed = changedProfabSnapshotFields(
      item.formSnapshot.values,
      materializedValues,
    );
    if (item.formSnapshot.documentRevision !== (item.documentRevision || "")) {
      changed.push("__documentRevision");
    }
    return changed;
  }, [item.documentRevision, item.formSnapshot, materializedValues]);
  const executed = item.signatureStatus === "Signed" ||
    materializedValues.executionState === "Executed";
  const approved = item.approvalStatus === "Approved";
  const locked = executed || approved;

  useEffect(() => {
    if (!form || !locked) return;
    const snapshot: ExecutionFormSnapshot = {
      capturedAt: new Date().toISOString(),
      authorizationState: authorizationState(item, executed),
      documentRevision: item.documentRevision || "",
      values: materializedValues,
    };
    if (!item.formSnapshot) {
      onChange({ formSnapshot: snapshot, formStale: false, formStaleFieldIds: [] });
      return;
    }
    // Re-approval/re-execution explicitly adopts the current bound facts as a
    // new immutable snapshot after a prior stale state.
    if (item.formStale && approved) {
      onChange({ formSnapshot: snapshot, formStale: false, formStaleFieldIds: [] });
      return;
    }
    if (changedSnapshotFields.length && !item.formStale) {
      onChange({
        formStale: true,
        formStaleFieldIds: changedSnapshotFields,
        approvalStatus: approved ? "Pending" : item.approvalStatus,
        status: item.status === "Complete" || item.status === "Passed"
          ? "In Progress"
          : item.status,
      });
    }
  }, [
    approved,
    changedSnapshotFields,
    executed,
    form,
    item,
    locked,
    materializedFingerprint,
    materializedValues,
    onChange,
  ]);

  if (!form) return null;

  const missing = executionItemFormMissingFields(item, operations);
  const disabled = determination === "Not Applicable";
  const visibleFields = form.fields.filter((definition) =>
    profabFieldIsVisible(definition, materializedValues, operations),
  );
  const completedFields = visibleFields.filter((definition) =>
    profabValueIsComplete(
      resolveProfabFieldValue(definition, values, operations),
    ),
  ).length;
  const sections = Array.from(
    visibleFields.reduce((grouped, definition) => {
      const entries = grouped.get(definition.section) || [];
      entries.push(definition);
      grouped.set(definition.section, entries);
      return grouped;
    }, new Map<string, ProfabFormFieldDefinition[]>()),
  );
  const formOverrides = item.formOverrides || {};
  const catalogForm = item.catalogId
    ? PROFAB_FORM_BY_ID.get(item.catalogId)
    : undefined;
  const saveFormOverrides = (patch: Partial<ExecutionFormOverrides>) =>
    onChange({
      formOverrides: {
        ...formOverrides,
        ...patch,
      },
      ...(item.formSnapshot
        ? {
            formStale: true,
            formStaleFieldIds: Array.from(
              new Set([...(item.formStaleFieldIds || []), "__formDefinition"]),
            ),
          }
        : {}),
    });
  const updateFormField = (
    definition: ProfabFormFieldDefinition,
    patch: Partial<EditableFormField>,
  ) => {
    const existing = formOverrides.fields?.find((field) => field.id === definition.id);
    const nextField = {
      ...(existing || editableFieldFromDefinition(definition)),
      ...patch,
      id: definition.id,
    };
    saveFormOverrides({
      fields: [
        ...(formOverrides.fields || []).filter((field) => field.id !== definition.id),
        nextField,
      ],
    });
  };
  const addFormField = () => {
    saveFormOverrides({
      fields: [
        ...(formOverrides.fields || []),
        {
          id: `custom-field-${crypto.randomUUID().slice(0, 8)}`,
          label: "New L3 field",
          type: "text",
          required: false,
          section: "Custom fields",
        },
      ],
    });
  };
  const removeFormField = (definition: ProfabFormFieldDefinition) => {
    const isCatalogField = Boolean(
      catalogForm?.fields.some((field) => field.id === definition.id),
    );
    const nextValues = { ...values };
    delete nextValues[definition.id];
    const nextStaleFields = (item.formStaleFieldIds || []).filter(
      (fieldId) => fieldId !== definition.id,
    );
    onChange({
      formOverrides: {
        ...formOverrides,
        fields: (formOverrides.fields || []).filter(
          (field) => field.id !== definition.id,
        ),
        removedFieldIds: isCatalogField
          ? Array.from(new Set([...(formOverrides.removedFieldIds || []), definition.id]))
          : formOverrides.removedFieldIds,
      },
      formValues: nextValues,
      formStale: item.formSnapshot ? true : item.formStale,
      formStaleFieldIds: item.formSnapshot
        ? Array.from(new Set([...nextStaleFields, "__formDefinition"]))
        : nextStaleFields,
    });
  };

  const updateValue = (
    definition: ProfabFormFieldDefinition,
    value: ExecutionFormValue,
  ) => {
    if (locked || definition.readOnly || definition.computed) return;
    if (definition.bindingPath && operations) {
      updateOperations((current) =>
        applyProfabFieldBinding(current, definition, value),
      );
    }
    const staleFields = item.formSnapshot
      ? Array.from(new Set([...(item.formStaleFieldIds || []), definition.id]))
      : [];
    onChange({
      formValues: { ...values, [definition.id]: value },
      formStale: item.formSnapshot ? true : item.formStale,
      formStaleFieldIds: staleFields,
      approvalStatus:
        item.formSnapshot && item.approvalStatus === "Approved"
          ? "Pending"
          : item.approvalStatus,
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-primary/20 bg-primary/[0.025] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-primary/15 pb-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileLock2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
              {item.catalogId ? "Controlled" : "Editable"} L3 form · {form.index}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {form.code} · {form.title}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              {form.stage} · {form.sourceAvailability}
              {form.sourcePages ? ` · source pages ${form.sourcePages}` : ""}
              {form.sourceVersion ? ` · ${form.sourceVersion}` : ""}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] font-bold",
            item.formStale
              ? "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200"
              : missing.length
                ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
          )}
        >
          {item.formStale
            ? "Snapshot stale · re-approval required"
            : disabled
              ? missing.length
                ? "N/A reason missing"
                : "N/A justified"
              : `${completedFields}/${visibleFields.length} visible fields · ${missing.length ? `${missing.length} required missing` : "valid"}`}
        </div>
      </div>

      {locked ? (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2.5 text-[11px]">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300" />
          <div>
            <p className="font-bold text-foreground">Controlled form locked</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              {authorizationState(item, executed)} records are read-only. Return the signature/approval to Pending before revising; any canonical operational change marks this snapshot stale.
            </p>
          </div>
        </div>
      ) : null}

      {item.formSnapshot ? (
        <details
          className={cn(
            "rounded-lg border px-3 py-2.5 text-[11px]",
            item.formStale
              ? "border-rose-500/30 bg-rose-500/5"
              : "border-slate-300/70 bg-muted/20",
          )}
        >
          <summary className="cursor-pointer font-bold text-foreground">
            {item.formSnapshot.authorizationState} snapshot · {item.formSnapshot.capturedAt || "time unavailable"}
          </summary>
          {item.formStale ? (
            <p className="mt-2 text-rose-700 dark:text-rose-300">
              Changed after authorization: {(item.formStaleFieldIds || []).map((fieldId) =>
                fieldId === "__documentRevision"
                  ? "Controlled revision"
                  : fieldId === "__formDefinition"
                    ? "L3 form definition"
                    : form.fields.find((definition) => definition.id === fieldId)?.label || fieldId,
              ).join(" · ") || "Bound operational data"}
            </p>
          ) : null}
          <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {form.fields.map((definition) => (
              <div key={definition.id} className="flex min-w-0 justify-between gap-2 border-b border-border/50 py-1">
                <span className="truncate text-muted-foreground">{definition.label}</span>
                <span className="max-w-[55%] truncate text-right font-medium text-foreground">
                  {fieldDisplayValue(item.formSnapshot!.values[definition.id] ?? "")}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <details
        data-testid="l3-form-customizer"
        className="rounded-lg border border-primary/25 bg-primary/[0.025] px-3 py-2.5 text-[11px]"
      >
        <summary className="details-marker-hidden flex cursor-pointer list-none items-center gap-2 font-bold text-foreground">
          <Settings2 className="size-3.5 text-primary" />
          Customize L3 form
          <span className="ml-auto text-[9px] font-medium text-muted-foreground">
            {form.fields.length} field{form.fields.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="mt-3 space-y-3 border-t border-primary/15 pt-3">
          <p className="leading-relaxed text-muted-foreground">
            Changes apply only to this L3 item. Controlled data bindings and computed controls remain protected.
          </p>
          {locked ? (
            <p className="rounded-md border border-sky-500/25 bg-sky-500/5 px-2 py-1.5 text-[10px] text-muted-foreground">
              The form is locked after signature or approval. Return it to Pending before editing.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Form title
              </span>
              <Input
                aria-label="L3 form title"
                defaultValue={form.title}
                disabled={locked}
                onBlur={(event) =>
                  saveFormOverrides({
                    title: event.currentTarget.value.trim() || undefined,
                  })
                }
                className="h-8 text-[11px]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                Form description
              </span>
              <Input
                aria-label="L3 form description"
                defaultValue={form.description}
                disabled={locked}
                onBlur={(event) =>
                  saveFormOverrides({
                    description: event.currentTarget.value.trim() || undefined,
                  })
                }
                className="h-8 text-[11px]"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold text-foreground">Fields</p>
            <button
              type="button"
              aria-label="Add L3 form field"
              disabled={locked}
              onClick={addFormField}
              className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3" />
              Add field
            </button>
          </div>
          {form.fields.length ? (
            <div className="space-y-2">
              {form.fields.map((definition, fieldIndex) => (
                <div
                  key={definition.id}
                  className="rounded-md border bg-background/70 p-2"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_92px_24px] items-center gap-1.5">
                    <Input
                      aria-label={`L3 form field ${fieldIndex + 1} label`}
                      defaultValue={definition.label}
                      disabled={locked}
                      onBlur={(event) =>
                        updateFormField(definition, {
                          label: event.currentTarget.value.trim() || `Field ${fieldIndex + 1}`,
                        })
                      }
                      className="h-7 min-w-0 text-[10px]"
                    />
                    <select
                      aria-label={`L3 form field ${fieldIndex + 1} type`}
                      value={definition.type}
                      disabled={locked || Boolean(definition.computed || definition.readOnly)}
                      onChange={(event) =>
                        updateFormField(definition, {
                          type: event.currentTarget.value as EditableFormField["type"],
                          options:
                            event.currentTarget.value === "select"
                              ? definition.options || []
                              : undefined,
                        })
                      }
                      className="h-7 min-w-0 rounded border bg-background px-1 text-[9px]"
                    >
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                      <option value="date">date</option>
                      <option value="number">number</option>
                      <option value="select">select</option>
                      <option value="checkbox">checkbox</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Delete L3 form field ${fieldIndex + 1}`}
                      disabled={locked}
                      onClick={() => removeFormField(definition)}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <Input
                      aria-label={`L3 form field ${fieldIndex + 1} section`}
                      defaultValue={definition.section}
                      disabled={locked}
                      onBlur={(event) =>
                        updateFormField(definition, {
                          section: event.currentTarget.value.trim() || "Custom fields",
                        })
                      }
                      placeholder="Section"
                      className="h-7 text-[10px]"
                    />
                    <label className="flex h-7 items-center gap-1.5 rounded border bg-background px-1.5 text-[10px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={definition.required}
                        disabled={locked || Boolean(definition.computed || definition.readOnly)}
                        onChange={(event) =>
                          updateFormField(definition, {
                            required: event.currentTarget.checked,
                          })
                        }
                      />
                      Required
                    </label>
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <Input
                      aria-label={`L3 form field ${fieldIndex + 1} placeholder`}
                      defaultValue={definition.placeholder || ""}
                      disabled={locked}
                      onBlur={(event) =>
                        updateFormField(definition, {
                          placeholder: event.currentTarget.value.trim() || undefined,
                        })
                      }
                      placeholder="Placeholder"
                      className="h-7 text-[10px]"
                    />
                    <Input
                      aria-label={`L3 form field ${fieldIndex + 1} help text`}
                      defaultValue={definition.help || ""}
                      disabled={locked}
                      onBlur={(event) =>
                        updateFormField(definition, {
                          help: event.currentTarget.value.trim() || undefined,
                        })
                      }
                      placeholder="Help text"
                      className="h-7 text-[10px]"
                    />
                  </div>
                  {definition.type === "select" ? (
                    <Input
                      aria-label={`L3 form field ${fieldIndex + 1} options`}
                      defaultValue={(definition.options || []).join(", ")}
                      disabled={locked}
                      onBlur={(event) =>
                        updateFormField(definition, {
                          options: event.currentTarget.value
                            .split(",")
                            .map((option) => option.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Options, comma separated"
                      className="mt-1.5 h-7 text-[10px]"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-2 py-1.5 text-[10px] text-muted-foreground">
              No L3 fields yet. Add the fields this item must collect.
            </p>
          )}
        </div>
      </details>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Applicability class</Label>
          <div className="flex h-9 items-center rounded-md border bg-muted/35 px-2 text-xs font-semibold">
            {applicability}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`applicability-${item.id}`}>Applicability decision</Label>
          <select
            id={`applicability-${item.id}`}
            aria-label="Applicability decision"
            value={determination}
            disabled={locked || applicability === "Required"}
            onChange={(event) => {
              const next = event.target.value as ExecutionApplicabilityDetermination;
              onChange({
                applicabilityDetermination: next,
                status: next === "Not Applicable" ? "Not Started" : item.status,
              });
            }}
            className={inputClass}
          >
            {(applicability === "Conditional" || applicability === "Triggered") && (
              <option>Pending</option>
            )}
            <option>Applicable</option>
            <option>Not Applicable</option>
          </select>
        </div>
      </div>

      {determination === "Not Applicable" ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <Label htmlFor={`applicability-reason-${item.id}`}>
            Objective not-applicable reason <span className="text-rose-500">*</span>
          </Label>
          <Textarea
            id={`applicability-reason-${item.id}`}
            value={item.applicabilityReason || ""}
            disabled={locked}
            onChange={(event) => onChange({ applicabilityReason: event.target.value })}
            rows={2}
            placeholder="State the project fact, scope boundary, or trigger test that makes this form inapplicable."
          />
          <p className="text-[10px] text-muted-foreground">
            A blank N/A reason is not accepted and remains incomplete.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`revision-${item.id}`}>Controlled revision</Label>
          <Input
            id={`revision-${item.id}`}
            value={item.documentRevision || ""}
            disabled={locked}
            onChange={(event) => onChange({ documentRevision: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`language-${item.id}`}>Document language</Label>
          <select
            id={`language-${item.id}`}
            value={item.documentLanguage || "Bilingual"}
            disabled={locked}
            onChange={(event) =>
              onChange({
                documentLanguage: event.target.value as ExecutionItem["documentLanguage"],
              })
            }
            className={inputClass}
          >
            <option>English</option>
            <option>French</option>
            <option>Bilingual</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border bg-background/70 px-3 py-2.5 text-[10px] text-muted-foreground">
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Lifecycle connections</p>
            <p className="mt-0.5 leading-relaxed">
              {form.lifecycleTouchpoints.join(" → ")}
            </p>
            <p className="mt-1 leading-relaxed">{item.sourceReference}</p>
            {form.sourceNote ? (
              <p className="mt-1 font-medium text-amber-700 dark:text-amber-300">
                Source control note: {form.sourceNote}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {!disabled ? sections.map(([section, definitions]) => (
        <fieldset key={section} className="space-y-3 rounded-lg border bg-background/45 p-3">
          <legend className="px-1 text-[10px] font-black uppercase tracking-[0.11em] text-muted-foreground">
            {section}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {definitions.map((definition) => {
              const id = `${item.id}-${definition.id}`;
              const value = resolveProfabFieldValue(definition, values, operations);
              const fullWidth = definition.type === "textarea";
              const required = profabFieldIsRequired(definition, materializedValues, operations);
              const fieldLocked = locked || Boolean(definition.readOnly || definition.computed);
              return (
                <div
                  key={definition.id}
                  className={cn("space-y-1.5", fullWidth && "sm:col-span-2")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <Label htmlFor={id}>
                      {definition.label}
                      {required ? <span className="ml-1 text-rose-500">*</span> : null}
                    </Label>
                    {definition.bindingPath || definition.computed ? (
                      <span className="rounded-full border bg-muted/40 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                        {definition.computed ? "Computed" : "Shared data"}
                      </span>
                    ) : null}
                  </div>
                  {definition.type === "textarea" ? (
                    <Textarea
                      id={id}
                      value={typeof value === "string" ? value : ""}
                      disabled={fieldLocked}
                      onChange={(event) => updateValue(definition, event.target.value)}
                      rows={3}
                      placeholder={definition.placeholder}
                    />
                  ) : definition.type === "select" ? (
                    <select
                      id={id}
                      value={typeof value === "string" ? value : ""}
                      disabled={fieldLocked}
                      onChange={(event) => updateValue(definition, event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select…</option>
                      {Array.from(new Set([
                        ...(definition.options || []),
                        ...(typeof value === "string" && value && !definition.options?.includes(value)
                          ? [value]
                          : []),
                      ])).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : definition.type === "checkbox" ? (
                    <label className={cn(
                      "flex min-h-9 items-center gap-2 rounded-md border bg-background px-2 text-xs",
                      fieldLocked && "cursor-not-allowed bg-muted/45 text-muted-foreground",
                    )}>
                      <input
                        id={id}
                        type="checkbox"
                        disabled={fieldLocked}
                        checked={value === true}
                        onChange={(event) => updateValue(definition, event.target.checked)}
                      />
                      Confirmed
                    </label>
                  ) : (
                    <Input
                      id={id}
                      type={definition.type}
                      value={typeof value === "string" ? value : ""}
                      disabled={fieldLocked}
                      onChange={(event) => updateValue(definition, event.target.value)}
                      placeholder={definition.placeholder}
                    />
                  )}
                  {definition.help ? (
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {definition.help}
                    </p>
                  ) : null}
                  {definition.bindingPath ? (
                    <p className="text-[9px] leading-relaxed text-muted-foreground/80">
                      Canonical binding: operations.{definition.bindingPath}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      )) : null}

      {item.formStale || missing.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[11px]">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div>
            <p className="font-bold text-foreground">Completion is blocked</p>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">
              {item.formStale
                ? "The authorized snapshot no longer matches current data. Review and approve/execute a new revision."
                : missing.join(" · ")}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-[11px]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <p className="leading-relaxed text-muted-foreground">
            Required form data is valid. Signature, approval, task, and overall status controls still apply.
          </p>
        </div>
      )}
    </section>
  );
}
