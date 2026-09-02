import { calculateClassD, requiredApprovalRole } from "@/lib/project-operations";
import type {
  ProfabFormDefinition,
  ProfabFormFieldCondition,
  ProfabFormFieldDefinition,
} from "@/lib/profab-forms";
import type { ProjectOperations } from "@/types/project-operations";
import type { ExecutionFormValue } from "@/types/workflow";

type FormValues = Record<string, ExecutionFormValue>;

export function getOperationsValue(
  operations: ProjectOperations | undefined,
  path: string,
): unknown {
  if (!operations || !path) return undefined;
  return path.split(".").reduce<unknown>((current, token) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[token];
  }, operations);
}

function setPathValue(current: unknown, tokens: string[], value: unknown): unknown {
  if (!tokens.length) return value;
  const [token, ...rest] = tokens;
  if (/^\d+$/.test(token) && !Array.isArray(current)) {
    const next: unknown[] = [];
    next[Number(token)] = setPathValue(undefined, rest, value);
    return next;
  }
  if (Array.isArray(current)) {
    const next = [...current];
    const index = Number(token);
    if (!Number.isInteger(index) || index < 0) return current;
    next[index] = setPathValue(next[index], rest, value);
    return next;
  }
  const record = current && typeof current === "object"
    ? current as Record<string, unknown>
    : {};
  return {
    ...record,
    [token]: setPathValue(record[token], rest, value),
  };
}

function toNumber(value: ExecutionFormValue) {
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function warrantyExpiry(dayZero: string, durationMonths: number) {
  if (!dayZero) return "";
  const date = new Date(`${dayZero}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCMonth(date.getUTCMonth() + Math.max(0, durationMonths));
  return date.toISOString().slice(0, 10);
}

export function applyProfabFieldBinding(
  operations: ProjectOperations,
  definition: ProfabFormFieldDefinition,
  value: ExecutionFormValue,
): ProjectOperations {
  if (!definition.bindingPath || definition.readOnly || definition.computed) {
    return operations;
  }
  const isNumber = definition.bindingValueType === "number" || definition.type === "number";
  const isBlank = typeof value === "string" && value.trim() === "";
  const coerced = isNumber
    ? isBlank ? "" : toNumber(value)
    : definition.bindingValueType === "boolean" || definition.type === "checkbox"
      ? value === true
      : String(value);
  let next = setPathValue(
    operations,
    definition.bindingPath.split("."),
    coerced,
  ) as ProjectOperations;

  if (definition.bindingPath.startsWith("estimating.inputs.")) {
    next = {
      ...next,
      estimating: {
        ...next.estimating,
        calculatedClassDAmount: calculateClassD(next),
      },
    };
  }
  if (
    definition.bindingPath === "warranty.dayZeroDate" ||
    definition.bindingPath === "warranty.durationMonths"
  ) {
    next = {
      ...next,
      warranty: {
        ...next.warranty,
        expiryDate: warrantyExpiry(
          next.warranty.dayZeroDate,
          Number(next.warranty.durationMonths) || 0,
        ),
      },
    };
  }
  return next;
}

function computedValue(
  definition: ProfabFormFieldDefinition,
  values: FormValues,
  operations: ProjectOperations | undefined,
): unknown {
  if (!definition.computed || !operations) return undefined;
  switch (definition.computed) {
    case "canonical-file-number":
      return operations.identity.projectNumber || operations.identity.clientId || operations.identity.leadId;
    case "class-d-total":
      return calculateClassD(operations);
    case "warranty-expiry":
      return operations.warranty.expiryDate || warrantyExpiry(
        operations.warranty.dayZeroDate,
        Number(operations.warranty.durationMonths) || 0,
      );
    case "change-approval-role": {
      const kind = values.coKind === "Credit" ? "Credit" : "Change";
      return requiredApprovalRole(operations, {
        kind,
        amount: toNumber(values.coAmount || "0"),
        contractPercent: toNumber(values.coContractPercent || "0"),
        cumulativeCreditAmount: toNumber(values.coCumulativeCredit || "0"),
      });
    }
    case "capacity-utilization": {
      const capacity = Number(operations.production.factoryWeeklyCapacityHours) || 0;
      const committed = Number(operations.production.committedWeeklyCapacityHours) || 0;
      return capacity > 0 ? `${Math.round(committed / capacity * 1000) / 10}%` : "Capacity not entered";
    }
    case "project-lifecycle-state":
      return operations.identity.lifecycleState;
  }
}

function executionValue(value: unknown): ExecutionFormValue {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return "";
}

export function resolveProfabFieldValue(
  definition: ProfabFormFieldDefinition,
  values: FormValues,
  operations?: ProjectOperations,
): ExecutionFormValue {
  if (definition.computed) {
    const computed = computedValue(definition, values, operations);
    // Legacy/imported items can carry a computed value while the operational
    // binding is not available to the caller yet.
    return computed === undefined
      ? executionValue(values[definition.id])
      : executionValue(computed);
  }
  if (definition.bindingPath) {
    const bound = getOperationsValue(operations, definition.bindingPath);
    if (bound !== undefined && bound !== null) {
      // Normalized numeric operation fields use zero as their storage default,
      // but a required form input must remain visibly blank until the user has
      // actually supplied a value. Once the user enters zero explicitly the
      // local form value is retained and remains a deliberate value.
      if (
        (definition.bindingValueType === "number" || definition.type === "number") &&
        bound === 0 &&
        !Object.prototype.hasOwnProperty.call(values, definition.id)
      ) {
        return "";
      }
      return executionValue(bound);
    }
  }
  return values[definition.id] ?? (definition.type === "checkbox" ? false : "");
}

function conditionMatches(
  test: ProfabFormFieldCondition,
  values: FormValues,
  operations?: ProjectOperations,
) {
  const actual = test.source === "operations"
    ? getOperationsValue(operations, test.key)
    : values[test.key];
  switch (test.operator) {
    case "equals":
      return actual === test.value;
    case "not-equals":
      return actual !== test.value;
    case "one-of":
      return Array.isArray(test.value) && test.value.includes(actual as never);
    case "truthy":
      return Boolean(actual);
    case "falsy":
      return !actual;
    case "greater-than":
      return Number(actual) > Number(test.value);
  }
}

function conditionsMatch(
  tests: ProfabFormFieldCondition | ProfabFormFieldCondition[] | undefined,
  values: FormValues,
  operations?: ProjectOperations,
) {
  if (!tests) return true;
  return (Array.isArray(tests) ? tests : [tests]).every((test) =>
    conditionMatches(test, values, operations),
  );
}

export function profabFieldIsVisible(
  definition: ProfabFormFieldDefinition,
  values: FormValues,
  operations?: ProjectOperations,
) {
  return conditionsMatch(definition.visibleWhen, values, operations);
}

export function profabFieldIsRequired(
  definition: ProfabFormFieldDefinition,
  values: FormValues,
  operations?: ProjectOperations,
) {
  if (!profabFieldIsVisible(definition, values, operations)) return false;
  return definition.requiredWhen
    ? conditionsMatch(definition.requiredWhen, values, operations)
    : definition.required;
}

export function profabValueIsComplete(value: ExecutionFormValue) {
  return typeof value === "boolean" ? value : Boolean(value.trim());
}

export function profabFormMissingFields(
  form: ProfabFormDefinition,
  values: FormValues,
  operations?: ProjectOperations,
) {
  // Conditions must see the same effective values that the user sees. This is
  // important when a decision is stored in the shared operations record but a
  // later field uses it as a form-level visibility or requiredness condition.
  const effectiveValues = materializeProfabFormValues(form, values, operations);
  return form.fields
    .filter((definition) =>
      profabFieldIsRequired(definition, effectiveValues, operations) &&
      !profabValueIsComplete(resolveProfabFieldValue(definition, effectiveValues, operations)),
    )
    .map((definition) => definition.label);
}

export function materializeProfabFormValues(
  form: ProfabFormDefinition,
  values: FormValues,
  operations?: ProjectOperations,
): FormValues {
  return Object.fromEntries(
    form.fields.map((definition) => [
      definition.id,
      resolveProfabFieldValue(definition, values, operations),
    ]),
  );
}

export function changedProfabSnapshotFields(
  snapshot: FormValues | undefined,
  current: FormValues,
) {
  if (!snapshot) return Object.keys(current);
  return Object.keys(current).filter((key) => snapshot[key] !== current[key]);
}
