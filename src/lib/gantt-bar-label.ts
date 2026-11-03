import { conditionDurationDays, DAYS_PER_WEEK } from "@/lib/condition-duration";
import { isSalesDepartmentName } from "@/lib/department-label";
import type { Condition } from "@/types/workflow";

/** Keep schedule values internally in days while showing the planning unit in weeks. */
export function ganttDurationText(condition: Condition, compact = false) {
  const days = conditionDurationDays(condition);
  if (days === undefined) return "";
  const weeks = Number((days / DAYS_PER_WEEK).toFixed(days < DAYS_PER_WEEK ? 2 : 1));
  return compact ? `${weeks}w` : `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

/** Compact, consistent labels for both interactive and exported Gantt bars. */
export function ganttBarLabel(department: string, condition: Condition) {
  const name = department.replace(/^department\s+/i, "").toUpperCase();
  const aliases: [RegExp, string][] = [
    [/^SALE/, "SALE"], [/^TECH/, "TECH"], [/^(PURC|PROCUREMENT)/, "PURC"],
    [/^PROD/, "PROD"], [/^(SITE|AFTER\s*SERVICE)/, "SITE"],
  ];
  const code = aliases.find(([pattern]) => pattern.test(name))?.[1] || name.replace(/[^A-Z]/g, "").slice(0, 4) || "DEPT";
  return isSalesDepartmentName(department) ? code : `${code} ${ganttDurationText(condition, true)}`;
}

/** Give even the shortest scheduled task enough space for its entire label. */
export function ganttAxisMinimumWidth(tasks: readonly { department: string; condition: Condition; days?: number; start?: number }[], total: number) {
  return Math.min(6000, Math.max(660, ...tasks.filter((task) => task.start !== undefined && task.days && task.days > 0)
    .map((task) => (ganttBarLabel(task.department, task.condition).length * 6 + 8) * total / task.days!)));
}
