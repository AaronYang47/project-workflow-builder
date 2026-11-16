import type { Condition } from "@/types/workflow";

export const DAYS_PER_WEEK = 7;

/** Preserve whole weeks; convert legacy fractional estimates to whole days. */
export function wholeDayCondition(condition: Condition, daysPerWeek = DAYS_PER_WEEK): Condition {
  const duration = condition.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || Number.isInteger(duration)) return condition;
  const days = duration * (condition.durationUnit === "weeks" ? daysPerWeek : 1);
  return { ...condition, duration: Math.max(1, Math.ceil(Number(days.toFixed(6)))), durationUnit: "days" };
}

export function conditionDurationDays(condition: Condition, daysPerWeek = DAYS_PER_WEEK) {
  const normalized = wholeDayCondition(condition, daysPerWeek);
  const duration = normalized.duration;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0
    ? duration * (normalized.durationUnit === "weeks" ? daysPerWeek : 1) : undefined;
}

export function conditionDurationLabel(condition: Condition) {
  const normalized = wholeDayCondition(condition);
  const duration = normalized.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return "";
  const unit = normalized.durationUnit === "weeks" ? "week" : "day";
  return `${duration} ${unit}${duration === 1 ? "" : "s"}`;
}


/** Relative calendar display: seven days per week, four weeks per planning month. */
export function calendarDurationParts(days: number, daysPerWeek = DAYS_PER_WEEK) {
  const months = Math.floor(days / (daysPerWeek * 4));
  const weeks = Number(((days % (daysPerWeek * 4)) / daysPerWeek).toFixed(1));
  return [
    ...(months ? [{ value: months, unit: months === 1 ? "MONTH" : "MONTHS" }] : []),
    ...(weeks || !months ? [{ value: weeks, unit: weeks === 1 ? "WEEK" : "WEEKS" }] : []),
  ];
}
