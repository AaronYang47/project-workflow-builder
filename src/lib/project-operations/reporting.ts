import type {
  BimObjectResponsibility,
  ProjectOperations,
  TimeEntry,
  WarrantyFollowUp,
} from "@/types/project-operations";
import {
  addDays,
  addMonths,
  clone,
  dateOnly,
  newId,
  number,
  parseDate,
  round2,
  text,
} from "./shared";

/** Warranty schedule, ICS time import, time budget, weekly report, GPF names and BIM stitch list. */
export function scheduleWarranty(
  operations: ProjectOperations,
  dayZeroDate: string,
  durationMonths: number,
  owner: string,
  triggerEvidence: string,
) {
  const start = dateOnly(dayZeroDate);
  if (!start) throw new Error("A valid warranty Day 0 date is required.");
  if (number(durationMonths) <= 0) throw new Error("Warranty duration must be greater than zero.");
  if (!text(owner)) throw new Error("A warranty owner is required.");
  if (!text(triggerEvidence)) throw new Error("Warranty Day 0 trigger evidence is required.");
  const followUps: WarrantyFollowUp[] = [30, 60, 90].map((offsetDays) => ({
    id: newId(`warranty-${offsetDays}`),
    offsetDays,
    dueDate: addDays(start, offsetDays),
    owner,
    escalationOwner: "Project Manager",
    status: "Scheduled",
  }));
  return {
    ...clone(operations),
    identity: { ...operations.identity, lifecycleState: "Warranty" },
    warranty: {
      ...operations.warranty,
      dayZeroDate: start,
      durationMonths: Math.floor(number(durationMonths)),
      owner,
      triggerEvidence,
      expiryDate: addMonths(start, durationMonths),
      followUps,
    },
  };
}

export function warrantyFollowUpStatus(
  dueDate: string,
  completedAt = "",
  now = new Date(),
): WarrantyFollowUp["status"] {
  if (text(completedAt)) return "Complete";
  const due = parseDate(dueDate);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) return "Scheduled";
  const daysUntilDue = Math.ceil((due.getTime() - current.getTime()) / 86_400_000);
  if (daysUntilDue > 7) return "Scheduled";
  if (daysUntilDue >= 0) return "Due";
  return "Overdue";
}

function parseIcsDate(value: string) {
  const normalized = text(value).replace(/^.*:/, "");
  const match = normalized.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) {
    const day = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
    return day ? `${day[1]}-${day[2]}-${day[3]}T00:00:00Z` : "";
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}

function icsDurationHours(start: string, end: string) {
  const startDate = new Date(parseIcsDate(start));
  const endDate = new Date(parseIcsDate(end));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return round2(Math.max(0, endDate.getTime() - startDate.getTime()) / 3_600_000);
}

function icsField(lines: string[], name: string) {
  const line = lines.find((item) => item.startsWith(`${name}:`) || item.startsWith(`${name};`));
  return line ? line.slice(line.indexOf(":") + 1) : "";
}

export function parseIcsTimeEntries(
  ics: string,
  user: string,
  projectNumber: string,
  sourceReference: string,
): TimeEntry[] {
  const unfolded = text(ics).replace(/\r?\n[ \t]/g, "");
  const entries: TimeEntry[] = [];
  for (const block of unfolded.split(/BEGIN:VEVENT/i).slice(1)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (!lines.some((line) => /^END:VEVENT$/i.test(line))) continue;
    const start = icsField(lines, "DTSTART");
    const end = icsField(lines, "DTEND");
    const hours = icsDurationHours(start, end);
    if (!start || !end || hours <= 0) continue;
    const date = parseIcsDate(start).slice(0, 10);
    const uid = icsField(lines, "UID") || `${date}-${entries.length + 1}`;
    entries.push({
      id: `time-ics-${uid}`,
      user,
      date,
      projectNumber,
      activity: icsField(lines, "SUMMARY") || "Calendar activity",
      hours,
      billable: true,
      source: "ICS",
      sourceReference,
      notes: icsField(lines, "DESCRIPTION"),
    });
  }
  return entries;
}

export function timeBudgetStatus(operations: ProjectOperations) {
  const usedHours = round2(
    (operations.timeBudget.entries || []).reduce((sum, entry) => sum + number(entry.hours), 0),
  );
  const budgetHours = number(operations.timeBudget.budgetHours);
  const percent = budgetHours > 0 ? round2((usedHours / budgetHours) * 100) : 0;
  const critical = number(operations.timeBudget.criticalThresholdPercent);
  const warning = number(operations.timeBudget.warningThresholdPercent);
  const level =
    budgetHours > 0 && percent >= critical
      ? "Critical"
      : budgetHours > 0 && percent >= warning
        ? "Warning"
        : "On Track";
  return { usedHours, percent, level };
}

export function buildWeeklyReport(operations: ProjectOperations, weekEnding: string) {
  const end = dateOnly(weekEnding);
  const endDate = parseDate(end);
  if (!end || Number.isNaN(endDate.getTime()))
    return "Weekly report unavailable: invalid week ending date.";
  const startDate = new Date(endDate.getTime());
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const entries = (operations.timeBudget.entries || []).filter((entry) => {
    const date = parseDate(entry.date);
    return !Number.isNaN(date.getTime()) && date >= startDate && date <= endDate;
  });
  const total = round2(entries.reduce((sum, entry) => sum + number(entry.hours), 0));
  const byUser = new Map<string, number>();
  for (const entry of entries)
    byUser.set(entry.user, round2((byUser.get(entry.user) || 0) + number(entry.hours)));
  const users = [...byUser.entries()].map(([user, hours]) => `${user}: ${hours}h`).join(", ");
  return `Weekly report ending ${end}: Recorded time: ${total}h${users ? ` (${users})` : ""}.`;
}

export function validateGpfName(operations: ProjectOperations, value: string) {
  const candidate = text(value);
  if (!candidate) return false;
  try {
    return new RegExp(operations.bim.gpfPattern || "").test(candidate);
  } catch {
    return false;
  }
}

export function buildStitchList(objects: BimObjectResponsibility[]) {
  return objects
    .slice()
    .sort(
      (left, right) =>
        text(left.masterFormatCode).localeCompare(text(right.masterFormatCode)) ||
        text(left.gpfName).localeCompare(text(right.gpfName)),
    )
    .map((object, index) => ({
      sequence: index + 1,
      gpfName: object.gpfName,
      masterFormatCode: object.masterFormatCode,
      cnmsCode: object.cnmsCode,
      modelReference: object.modelReference,
      navisworksSet: object.navisworksSet,
      owner: object.productionOwner,
      object,
    }));
}
