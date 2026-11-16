"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ChartGantt, Download, GripVertical, Plus, Trash2, Undo2, Redo2, X } from "lucide-react";
import { TopToolbar } from "./top-toolbar";
import { AuthGate } from "./auth-gate";
import { CloudProjectControls } from "./cloud-project-controls";
import { CollaboratorPresence } from "./collaborator-presence";
import { CollaborationControlOverlay } from "./collaboration-control-overlay";
import { EditorTransferControl } from "./editor-transfer-control";
import { useWorkflowStore } from "@/store/workflow-store";
import { useCollaborationStore, canEditCollaborativeWorkflow } from "@/lib/collaboration/collaboration-store";
import { buildProcessSchedule, salesHandoffTime, DAYS_PER_WEEK, type ScheduleTask } from "@/lib/process-schedule";
import type { Condition } from "@/types/workflow";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import { beginGanttBarDrag } from "@/lib/gantt-bar-drag";
import { beginGanttBarResize } from "@/lib/gantt-bar-resize";
import { planGanttPlacement } from "@/lib/gantt-placement";
import { RELEASE_CONDITION_INBOX_ID } from "@/lib/release-condition-inbox";
import { ganttCalendarBarLabel, ganttBarLabel, calendarWorkSummary, calendarPauseDetails, ganttDurationText, ganttAxisMinimumWidth } from "@/lib/gantt-bar-label";
import { wholeDayCondition } from "@/lib/condition-duration";
import { isSalesDepartmentName } from "@/lib/department-label";
import { buildProcessTimeline, calendarTickDays, pauseSegmentBackground, taskSegmentBackground } from "@/lib/schedule-calendar";
import { GanttTaskCalendar, type TaskCalendarValue } from "./gantt-task-calendar";
import { CalendarTags } from "./calendar-tags";
import { dayOffWarning, taskCalendarBadges } from "@/lib/calendar-badges";
import { ProcessCalendarButton } from "./process-calendar-settings";

export function ProcessOverview() {
  const file = useWorkflowStore((state) => state.file);
  const hydrated = useWorkflowStore((state) => state.hydrated);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const ensureConditionIds = useWorkflowStore((state) => state.ensureReleaseConditionIds);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const setInbox = useWorkflowStore((state) => state.setReleaseConditionInbox);
  const commit = useWorkflowStore((state) => state.commit);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const canUndo = useWorkflowStore((state) => state.past.length > 0);
  const canRedo = useWorkflowStore((state) => state.future.length > 0);
  const collaboration = useCollaborationStore();
  const canEdit = canEditCollaborativeWorkflow(collaboration);
  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null);
  const [mobileGanttView, setMobileGanttView] = useState<"list" | "timeline">("list");
  const [mobilePhasesOpen, setMobilePhasesOpen] = useState(false);
  const [timingDurationWeeks, setTimingDurationWeeks] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [taskCalendar, setTaskCalendar] = useState<TaskCalendarValue | null>(null);
  const calendarTrigger = useRef<HTMLElement | null>(null);
  const closeTaskCalendar = () => setTaskCalendar(null);
  const [draft, setDraft] = useState("");
  const [draftDuration, setDraftDuration] = useState("");
  const exportPdf = async () => {
    setExporting(true); setExportError("");
    try {
      const { exportL1DepartmentSwimlanePdf } = await import("@/lib/l1-department-swimlane-pdf-export");
      await exportL1DepartmentSwimlanePdf(useWorkflowStore.getState().file, { gantt: true });
    } catch (error) { setExportError(error instanceof Error ? error.message : "Could not export PDF."); }
    finally { setExporting(false); }
  };
  const ganttBoardRef = useRef<HTMLDivElement>(null);
  const [ganttMaxScroll, setGanttMaxScroll] = useState(0);
  const [ganttScrollLeft, setGanttScrollLeft] = useState(0);
  const inbox = file.releaseConditionInbox ?? [];
  const createCondition = () => {
    if (!canEdit || !draft.trim()) return;
    const duration = Number(draftDuration);
    const condition: Condition = { id: `condition-${crypto.randomUUID()}`, label: draft.trim(), required: true, checked: false,
      ...(Number.isFinite(duration) && duration > 0 ? { duration, durationUnit: "weeks" as const } : {}) };
    setInbox([...(useWorkflowStore.getState().file.releaseConditionInbox ?? []), wholeDayCondition(condition, workingDaysPerWeek)]);
    setDraft("");
    setDraftDuration("");
  };
  useEffect(() => {
    if (hydrated && canEdit) ensureConditionIds();
  }, [hydrated, canEdit, ensureConditionIds]);
  const schedule = useMemo(() => buildProcessSchedule(file), [file]);
  const workingDaysPerWeek = schedule.workingDaysPerWeek;
  const timeline = useMemo(() => buildProcessTimeline(file, schedule), [file, schedule]);
  const previewTaskBar = (bar: HTMLElement, start: number, days: number) => {
    bar.style.background = taskSegmentBackground(timeline.taskSegments(start, start + days), bar.dataset.ganttColor || "#64748b");
  };
  const openTaskCalendar = (task: ScheduleTask, element: HTMLElement) => {
    if (!timeline.enabled || task.start === undefined || task.end === undefined) return;
    calendarTrigger.current = element;
    const segments = timeline.taskSegments(task.start, task.end), pauses = segments.filter((part) => part.kind === "pause");
    setTaskCalendar({ key: task.key, title: task.title, department: task.department, color: task.color,
      startDate: timeline.dateAt(task.start), endDate: timeline.dateAt(task.end - 1),
      summary: calendarWorkSummary(task.end - task.start, pauses), badges: taskCalendarBadges(task.department, task.condition, pauses, task.color),
      periods: timeline.nonWorkingPeriods.map((period) => ({ ...period })) });
  };
  const editingTask = schedule.tasks.find((task) => task.key === editingTaskKey);
  const previousCondition = editingTask && editingTask.conditionIndex > 0
    ? file.graph.nodes.find((node) => node.id === editingTask.nodeId)?.conditions[editingTask.conditionIndex - 1]
    : undefined;
  const handoff = useMemo(() => ({ ...salesHandoffTime(schedule), originDay: timeline.originDay }), [schedule, timeline.originDay]);
  const query = collaboration.roomId !== "local-only"
    ? `?room=${encodeURIComponent(collaboration.roomId)}${collaboration.editorPeerId ? `&editor=${encodeURIComponent(collaboration.editorPeerId)}` : ""}` : "";
  const updateTask = (task: ScheduleTask, patch: Partial<Condition>) => {
    if (!canEdit) return;
    const node = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === task.nodeId);
    if (!node) return;
    updateNode(node.id, { conditions: node.conditions.map((condition, index) => index === task.conditionIndex ? wholeDayCondition({ ...condition, ...patch }, workingDaysPerWeek) : condition) });
  };
  const resizeTask = (taskKey: string, days: number) => {
    const currentTask = buildProcessSchedule(useWorkflowStore.getState().file).tasks.find((item) => item.key === taskKey);
    if (!currentTask) return;
    const preserveWeeks = currentTask.condition.durationUnit === "weeks" && days % workingDaysPerWeek === 0;
    updateTask(currentTask, { duration: preserveWeeks ? days / workingDaysPerWeek : days,
      durationUnit: preserveWeeks ? "weeks" : "days" });
  };
  const placeTaskAt = (taskKey: string, startDay: number) => {
    if (!canEdit) return;
    const currentSchedule = buildProcessSchedule(useWorkflowStore.getState().file);
    const currentTask = currentSchedule.tasks.find((item) => item.key === taskKey);
    if (!currentTask) return;
    const placement = planGanttPlacement(currentSchedule, currentTask, startDay, 0);
    if (placement && placement.startDay !== currentTask.start) updateTask(currentTask, placement.patch);
  };
  const saveTaskTiming = (taskKey: string) => {
    const durationWeeks = Number(timingDurationWeeks);
    if (!Number.isFinite(durationWeeks) || durationWeeks <= 0) return;
    const task = buildProcessSchedule(useWorkflowStore.getState().file).tasks.find((item) => item.key === taskKey);
    if (!task) return;
    const node = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === task.nodeId);
    if (!node) return;
    const previous = node.conditions[task.conditionIndex - 1];
    const patch: Partial<Condition> = { duration: durationWeeks, durationUnit: "weeks" };
    if (previous) {
      patch.predecessor = { nodeId: node.id, conditionId: previous.id || `index-${task.conditionIndex - 1}`, relation: "finish", lagDays: 0 };
      patch.startOffsetDays = undefined;
    }
    updateTask(task, patch);
    setEditingTaskKey(null);
  };
  const openTimingEditor = (task: ScheduleTask) => {
    setEditingTaskKey(task.key);
    setTimingDurationWeeks(task.days ? String(Number((task.days / workingDaysPerWeek).toFixed(2))) : "");
  };
  const axisUnit = schedule.totalDays >= 12 * DAYS_PER_WEEK ? "months" : "weeks";
  const step = axisUnit === "months" ? 4 * DAYS_PER_WEEK : DAYS_PER_WEEK;
  // Keep long schedules readable, with at most 40 labeled divisions.
  const tickSize = timeline.enabled ? calendarTickDays(timeline.totalDays) : step * Math.max(1, Math.ceil(schedule.totalDays / step / 40));
  const total = Math.max(tickSize * 4, Math.ceil((timeline.totalDays + tickSize * 3) / tickSize) * tickSize,
    (handoff.originDay ?? 0) + tickSize);
  const minimumTimelineWidth = schedule.totalDays > 56
    ? Math.min(ganttAxisMinimumWidth(schedule.tasks, total), Math.max(1200, Math.min(3200, total * 18)))
    : ganttAxisMinimumWidth(schedule.tasks, total);
  const ticks = handoff.originDay === null ? [] : [
    ...(handoff.originDay > 0 ? [0] : []),
    ...Array.from({ length: Math.ceil((total - handoff.originDay) / tickSize) }, (_, index) => handoff.originDay! + index * tickSize),
  ];
  const timeLabel = (value: number) => {
    if (handoff.originDay === null) return "";
    if (value < handoff.originDay) return "";
    if (timeline.enabled) return timeline.dateLabel(value);
    const elapsed = value - handoff.originDay;
    if (elapsed === 0) return `${axisUnit === "months" ? "M1" : "W1"} · handoff`;
    return axisUnit === "months"
      ? `M${Number((elapsed / (4 * DAYS_PER_WEEK) + 1).toFixed(1))}`
      : `W${Number((elapsed / DAYS_PER_WEEK + 1).toFixed(1))}`;
  };
  const dragDayLabel = (day: number) => timeline.enabled ? timeline.dateLabel(timeline.toDisplayDay(day)) : handoff.originDay === null ? `Project week ${Number((day / DAYS_PER_WEEK + 1).toFixed(1))}`
    : day < handoff.originDay ? `Sales lead week ${Number((day / DAYS_PER_WEEK + 1).toFixed(1))}` : `Week ${Number(((day - handoff.originDay) / DAYS_PER_WEEK + 1).toFixed(1))} after handoff`;
  const taskTimeLabel = (task: ScheduleTask) => {
    if (task.start === undefined || task.end === undefined || handoff.originDay === null) return "Sales handoff pending";
    if (timeline.enabled) return `${timeline.dateLabel(timeline.toDisplayDay(task.start))} – ${timeline.dateLabel(timeline.toDisplayDay(task.end, "end") - 1)}`;
    const start = task.start < handoff.originDay ? "Before handoff" : `Week ${Number(((task.start - handoff.originDay) / DAYS_PER_WEEK + 1).toFixed(1))}`;
    const end = task.end <= handoff.originDay ? "Before handoff" : `Week ${Number(((task.end - handoff.originDay) / DAYS_PER_WEEK).toFixed(1))}`;
    return `${start} to ${end}`;
  };
  const phaseSummary = schedule.phases.filter((phase) => phase.type === "phase" || /phase\s*\d+/i.test(phase.title));
  const gridBackground = { backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)", backgroundSize: `${tickSize / total * 100}% 100%` };
  useEffect(() => {
    if (!hydrated) return;
    const board = ganttBoardRef.current;
    if (!board) return;
    const measure = () => {
      setGanttMaxScroll(Math.max(0, board.scrollWidth - board.clientWidth));
      setGanttScrollLeft(board.scrollLeft);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    return () => observer.disconnect();
  }, [hydrated, minimumTimelineWidth, createOpen, mobileGanttView]);
  const scrollGanttTo = (left: number) => {
    const board = ganttBoardRef.current;
    if (board) board.scrollLeft = left;
  };
  const beginTimelinePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const board = ganttBoardRef.current;
    if (event.pointerType === "touch" || event.button !== 0 || !board || board.scrollWidth <= board.clientWidth) return;
    const target = event.target as HTMLElement;
    if (!target.closest("[data-gantt-pan-surface]") || target.closest("[data-gantt-task-key], button, input, [role='slider']")) return;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startScroll = board.scrollLeft;
    handle.setPointerCapture(pointerId);
    board.dataset.ganttPanning = "true";
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      board.scrollLeft = startScroll - (pointer.clientX - startX);
    };
    const end = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      delete board.dataset.ganttPanning;
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return <AuthGate>
    <main data-mobile-gantt-view={mobileGanttView} className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <TopToolbar pageLayer="L4" isHighLevelView={false} onToggleHighLevelView={() => {}} openPalette={() => {}} onPageSearch={() => { const name = window.prompt("Find release condition"); if (name) Array.from(document.querySelectorAll<HTMLElement>("[data-gantt-task]")).find((row) => row.dataset.ganttTask?.toLowerCase().includes(name.toLowerCase()))?.scrollIntoView({ block: "center" }); }} />
      {hydrated && ganttMaxScroll > 1 && <div data-gantt-horizontal-control className={`${mobileGanttView === "timeline" ? "flex" : "hidden sm:flex"} shrink-0 items-center gap-2 border-b bg-panel px-3 py-2 sm:gap-3 sm:px-4`}>
        <div data-gantt-pan-surface onPointerDown={beginTimelinePan} aria-label="Drag to move Gantt timeline" className="hidden shrink-0 cursor-grab select-none rounded border bg-background px-3 py-1.5 text-xs font-semibold active:cursor-grabbing sm:block">✥ Drag timeline left / right</div>
        <button type="button" aria-label="Scroll Gantt left" disabled={ganttScrollLeft <= 0} onClick={() => scrollGanttTo(ganttScrollLeft - Math.max(120, (ganttBoardRef.current?.clientWidth || 0) * 0.65))} className="flex size-10 shrink-0 items-center justify-center rounded border text-base disabled:opacity-40 sm:size-auto sm:px-2 sm:py-1 sm:text-xs">←</button>
        <input type="range" aria-label="Gantt horizontal position" min={0} max={ganttMaxScroll} step={1} value={Math.min(ganttScrollLeft, ganttMaxScroll)} onChange={(event) => scrollGanttTo(Number(event.target.value))} className="min-w-0 flex-1 accent-primary" />
        <button type="button" aria-label="Scroll Gantt right" disabled={ganttScrollLeft >= ganttMaxScroll - 1} onClick={() => scrollGanttTo(ganttScrollLeft + Math.max(120, (ganttBoardRef.current?.clientWidth || 0) * 0.65))} className="flex size-10 shrink-0 items-center justify-center rounded border text-base disabled:opacity-40 sm:size-auto sm:px-2 sm:py-1 sm:text-xs">→</button>
      </div>}
      <CollaborationControlOverlay />
      {exportError && <p role="alert" className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">{exportError}</p>}
      {createOpen && <aside aria-label="Create and assign release conditions" className="absolute bottom-4 right-4 top-20 z-50 flex w-[320px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-xl border bg-panel shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-3"><h2 className="text-sm font-bold">Create Release Condition</h2><button type="button" aria-label="Close Create Release Condition" onClick={() => setCreateOpen(false)} className="rounded p-1 hover:bg-muted"><X className="size-4" /></button></div>
        <form className="shrink-0 space-y-3 border-b p-3" onSubmit={(event) => { event.preventDefault(); createCondition(); }}>
          <label className="block text-xs font-semibold">Condition name<input aria-label="New release condition" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canEdit} required placeholder="e.g. Approve shop drawings" className="mt-1 block h-9 w-full rounded-md border bg-background px-2 text-xs" /></label>
          <label className="block text-xs font-semibold">Duration to complete · weeks (optional)<input type="number" min="0.1" step="0.1" aria-label="New condition duration in weeks" value={draftDuration} onChange={(event) => setDraftDuration(event.target.value)} disabled={!canEdit} placeholder="e.g. 16 for 4 months" className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs" /></label>
          <button type="submit" disabled={!canEdit || !draft.trim()} className="flex w-full items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"><Plus className="size-3.5" /> Create release condition</button>
          <p className="text-[11px] leading-4 text-muted-foreground">Drag a condition below into a chapter in the Gantt chart, and it adopts that chapter’s department and phase.</p>
        </form>
        <section aria-label="Unassigned release conditions" data-release-condition-chapter data-release-condition-drop-node-id={RELEASE_CONDITION_INBOX_ID} data-release-condition-count={inbox.length} className="flex min-h-0 flex-1 flex-col data-[drop-chapter=true]:bg-primary/10">
          <h3 className="shrink-0 px-3 py-2 text-xs font-bold">Unassigned · {inbox.length}</h3>
          <div data-release-condition-list className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            {inbox.map((condition, index) => <div key={condition.id || index} data-release-condition-index={index} data-release-condition-node-id={RELEASE_CONDITION_INBOX_ID} className="flex items-center gap-2 rounded-lg border bg-background p-2">
              <button type="button" aria-label={`Drag unassigned ${condition.label || `condition ${index + 1}`}`} disabled={!canEdit || condition.locked} onPointerDown={(event) => {
                if (!canEdit) return;
                beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, { nodeId: RELEASE_CONDITION_INBOX_ID, index, label: condition.label || "Release condition" }, (target) => moveCondition(RELEASE_CONDITION_INBOX_ID, index, target.nodeId, target.index));
              }} className="shrink-0 touch-none cursor-grab py-2 text-muted-foreground disabled:opacity-40"><GripVertical className="size-4" /></button>
              <div className="min-w-0 flex-1"><p className="break-words text-xs font-medium">{condition.label || condition.description || "Release condition"}</p><p className="text-[10px] text-muted-foreground">{ganttDurationText(condition, false, workingDaysPerWeek) || "Duration not set"}</p></div>
              <button type="button" aria-label={`Delete unassigned ${condition.label || `condition ${index + 1}`}`} disabled={!canEdit || condition.locked} onClick={() => {
                if (canEdit && !condition.locked) setInbox((useWorkflowStore.getState().file.releaseConditionInbox ?? []).filter((item, itemIndex) => condition.id ? item.id !== condition.id : itemIndex !== index));
              }} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="size-3.5" /></button>
            </div>)}
            {!inbox.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Create a condition above, or drag one here to unassign it.</p>}
          </div>
        </section>
      </aside>}
      {!canEdit && <p role="status" className="shrink-0 border-b bg-cyan-500/10 px-4 py-3 text-xs text-cyan-700 dark:text-cyan-200">View only — another participant holds editing control. Use Take Control below to request access, or reclaim control when the editor is offline. Scheduling fields become editable after control is granted.</p>}
      {!hydrated ? <p className="p-8 text-sm text-muted-foreground">Loading process…</p> : <div data-release-condition-scroll className={`flex-1 space-y-3 overflow-auto p-4 ${createOpen ? "lg:pr-[360px]" : ""}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Complete process system</p><h2 className="mt-1 text-base font-bold">Process system & schedule</h2></div>
          <div className="flex flex-wrap gap-2 text-xs"><button type="button" aria-label="Open Create Release Condition" aria-expanded={createOpen} onClick={() => setCreateOpen((open) => !open)} className="rounded-lg border bg-primary/10 px-3 py-2 font-semibold text-primary"><Plus className="mr-1 inline size-3.5" />Create RC{inbox.length > 0 ? ` · ${inbox.length} unassigned` : ""}</button>
            <span className="rounded-lg border bg-panel px-3 py-2">{schedule.phases.length} phases</span>
            <span className="rounded-lg border bg-panel px-3 py-2">{schedule.tasks.length} release conditions</span>
            <ProcessCalendarButton value={file.calendar} canEdit={canEdit} workingDays={schedule.totalDays} onSave={(calendar) => {
              if (canEdit) commit((current) => ({ ...current, calendar }));
            }} />
            <span className="rounded-lg border bg-primary/10 px-3 py-2 font-semibold">{handoff.elapsedDays === null ? "Time after Sales handoff not estimated" : `${Number((handoff.elapsedDays / workingDaysPerWeek).toFixed(1))} ${handoff.elapsedDays === workingDaysPerWeek ? "week" : "weeks"} estimated${timeline.enabled ? " total elapsed time" : handoff.hasSalesDepartment ? " from Sales handoff" : ""}${schedule.unscheduled ? " · partial" : ""}`}</span>
          </div>
        </div>

        <section aria-label="Complete process flowchart" data-mobile-phases-open={mobilePhasesOpen} className="rounded-lg border bg-panel p-3">
          <h2 className="mb-2 hidden text-xs font-bold sm:block">Process phases</h2>
          <button type="button" data-mobile-phases-toggle aria-expanded={mobilePhasesOpen} onClick={() => setMobilePhasesOpen((open) => !open)} className="flex min-h-10 w-full items-center justify-between text-xs font-bold sm:hidden">Process phases <span>{mobilePhasesOpen ? "Hide ▲" : "Show ▼"}</span></button>
          <div data-mobile-phases-content className={mobilePhasesOpen ? "block" : "hidden sm:block"}>
          {phaseSummary.length ? <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
            {phaseSummary.map((phase, index) => <article key={phase.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-l-4 bg-background px-3 py-2" style={{ borderLeftColor: phase.color }}>
              <div className="min-w-0"><h3 className="text-sm font-bold" style={{ color: phase.color }}>{phase.title}</h3>{phase.description && <p className="truncate text-[11px] text-muted-foreground" title={phase.description}>{phase.description}</p>}</div>
              {index < phaseSummary.length - 1 && <ArrowRight className="size-4 shrink-0" style={{ color: phase.color }} />}
            </article>)}
          </div> : <p className="text-xs text-muted-foreground">Create L1 phases to display your process.</p>}
          </div>
        </section>

        {file.calendar && !timeline.enabled && <p role="status" className="rounded-md border bg-amber-500/10 p-3 text-xs">Calendar saved. Set all Sales durations to establish the Technical handoff and display dates.</p>}

        <section aria-label="Department Gantt chart" className="overflow-hidden rounded-xl border bg-panel">
          <div data-mobile-gantt-toggle className="flex gap-2 border-b p-2 sm:hidden" role="group" aria-label="Mobile Gantt view">
            <button type="button" aria-pressed={mobileGanttView === "list"} onClick={() => setMobileGanttView("list")} className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold ${mobileGanttView === "list" ? "bg-primary text-primary-foreground" : "border bg-background"}`}>Schedule</button>
            <button type="button" aria-pressed={mobileGanttView === "timeline"} onClick={() => setMobileGanttView("timeline")} className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold ${mobileGanttView === "timeline" ? "bg-primary text-primary-foreground" : "border bg-background"}`}>Timeline</button>
          </div>
          {schedule.unscheduled > 0 && <p role="status" className="border-b bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">{schedule.unscheduled} condition(s) are not scheduled. Set their duration, link their department to L1, or resolve the dependency shown below. The estimated span excludes these conditions and may increase.</p>}
          <div data-mobile-schedule className={`${mobileGanttView === "list" ? "block" : "hidden"} space-y-3 p-3 sm:hidden`} aria-label="Mobile schedule">

            {schedule.departments.flatMap((department) => department.chapters.flatMap((chapter) => chapter.tasks)).map((task) => <article key={task.key} className="rounded-xl border bg-background p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{task.department} · {task.chapter}</p>
              <h3 className="mt-1 text-sm font-semibold leading-5">{task.title}</h3>
              {task.start !== undefined && task.end !== undefined && timeline.taskSegments(task.start, task.end).filter((segment) => segment.kind === "pause").filter((segment) => segment.periods.some((period) => period.kind !== "weekend")).map((pause) => <p key={pause.start} data-mobile-shutdown={pause.periods.find((period) => period.kind !== "statutory")?.kind ?? "statutory"} title={calendarPauseDetails(pause, timeline.dateAt)} className="mt-2 rounded-md bg-gray-200 p-2 text-xs text-gray-800">{pause.label} · {timeline.dateLabel(pause.start)} – {timeline.dateLabel(pause.end - 1)}</p>)}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{ganttDurationText(task.condition, false, workingDaysPerWeek) || "Duration not set"}</span><span>{taskTimeLabel(task)}</span>{timeline.enabled && task.start !== undefined && task.end !== undefined && <span>{ganttCalendarBarLabel(task.department, task.condition, timeline.taskSegments(task.start, task.end).filter((part) => part.kind === "pause"))}</span>}</div>
              {canEdit && <div className="mt-3 flex gap-2"><button type="button" aria-label={`Move ${task.title} earlier one week`} disabled={task.start === undefined} onClick={() => placeTaskAt(task.key, task.start! - workingDaysPerWeek)} className="min-h-10 flex-1 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40">← 1 week</button><button type="button" aria-label={`Move ${task.title} later one week`} disabled={task.start === undefined} onClick={() => placeTaskAt(task.key, task.start! + workingDaysPerWeek)} className="min-h-10 flex-1 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40">1 week →</button><button type="button" aria-label={`Edit timing for ${task.title}`} onClick={() => openTimingEditor(task)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Edit</button></div>}
            </article>)}
            {!schedule.tasks.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Add release conditions to build a schedule.</p>}
          </div>
          <div ref={ganttBoardRef} data-release-condition-board onDragStart={(event) => event.preventDefault()} onPointerDown={beginTimelinePan} onScroll={(event) => setGanttScrollLeft(event.currentTarget.scrollLeft)} className={`${mobileGanttView === "timeline" ? "block" : "hidden sm:block"} overflow-x-auto overscroll-x-contain data-[gantt-panning=true]:cursor-grabbing`}>
            <div className="relative" style={{ minWidth: 168 + minimumTimelineWidth }}>
              <div className="grid grid-cols-[168px_minmax(660px,1fr)] border-b bg-muted/30 text-[10px] font-semibold sm:grid-cols-[280px_minmax(660px,1fr)]">
                <div className="sticky left-0 z-20 border-r bg-muted p-3">Department / release condition</div>
                <div data-gantt-pan-surface className="relative h-10 cursor-grab touch-auto" style={gridBackground}>{handoff.hasSalesDepartment && handoff.originDay !== null && handoff.originDay > 0 ? <span className="absolute top-1 overflow-hidden px-1 text-center text-[9px] font-semibold leading-3 text-blue-800" style={{ left: 0, width: `${handoff.originDay / total * 100}%` }}>Sales lead · customer qualification</span> : null}{ticks.map((tick) => <span key={tick} className="absolute top-3 whitespace-nowrap pl-1" style={{ left: `${tick / total * 100}%` }}>{timeLabel(tick)}</span>)}</div>
              </div>
              <div className="grid grid-cols-[168px_minmax(660px,1fr)] border-b sm:grid-cols-[280px_minmax(660px,1fr)]"><div className="sticky left-0 z-20 border-r bg-panel p-3 text-[10px] font-semibold text-muted-foreground">PHASE COVERAGE</div><div data-gantt-pan-surface className="relative h-10 cursor-grab touch-auto" style={gridBackground}>{schedule.phases.map((phase, index) => {
                const range = schedule.phaseRanges[index];
                return range.end > range.start ? <div key={phase.id} title={phase.title} className="absolute top-2 h-6 overflow-hidden rounded px-1 text-[9px] font-semibold leading-6 text-white" style={{ left: `${timeline.toDisplayDay(range.start, "end") / total * 100}%`, width: `${(timeline.toDisplayDay(range.end, "end") - timeline.toDisplayDay(range.start, "end")) / total * 100}%`, background: phase.color }}>{phase.title}</div> : null;
              })}</div></div>
              {schedule.departments.map((department) => <div key={department.name} data-gantt-department={department.name}>
                <h3 className="border-b border-t bg-muted text-xs font-bold"><span className="sticky left-0 z-20 block w-[168px] border-r bg-muted px-3 py-1 sm:w-[280px]">{department.name}</span></h3>
                {department.chapters.map((chapter) => <div key={chapter.nodeId} data-release-condition-chapter data-release-condition-drop-node-id={chapter.nodeId} data-release-condition-count={chapter.tasks.length} className="data-[drop-chapter=true]:bg-primary/10">
                  <div data-phase-department-label className="grid grid-cols-[168px_minmax(660px,1fr)] border-b bg-background text-[11px] sm:grid-cols-[280px_minmax(660px,1fr)]"><div className="sticky left-0 z-20 flex min-w-0 items-center gap-2 border-r border-l-4 bg-background px-2 py-0.5" style={{ borderLeftColor: schedule.phases[chapter.phaseIndex]?.color || "#64748b" }}><span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: schedule.phases[chapter.phaseIndex]?.color || "#64748b" }}>{schedule.phases[chapter.phaseIndex]?.title || "Unlinked"}</span><strong className="truncate">{department.name}</strong><span className="hidden shrink-0 text-muted-foreground sm:inline">{chapter.title}</span></div><div className="flex items-center px-2">{canEdit && chapter.tasks.length > 1 ? <button type="button" aria-pressed={file.graph.nodes.find((node) => node.id === chapter.nodeId)?.config.ganttAutoSequence === true} onClick={() => { const node = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === chapter.nodeId); if (node) updateNode(node.id, { config: { ...node.config, ganttAutoSequence: node.config.ganttAutoSequence !== true } }); }} className="rounded border px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10">Auto follow previous: {file.graph.nodes.find((node) => node.id === chapter.nodeId)?.config.ganttAutoSequence === true ? "On" : "Off"}</button> : null}</div></div>
                  {!chapter.tasks.length && <p className="m-1 rounded border border-dashed px-3 py-2 text-[11px] text-muted-foreground">Drop a release condition here</p>}
                {chapter.tasks.map((task) => {
                  const startDay = task.start ?? schedule.phaseRanges[task.phaseIndex]?.start;
                  const days = task.days ?? 1;
                  const canPlace = startDay !== undefined && task.phaseIndex >= 0;
                  const displayStart = startDay === undefined ? 0 : timeline.taskStartDay(startDay);
                  const displayEnd = startDay === undefined ? 0 : timeline.toDisplayDay(startDay + days, "end");
                  const segments = startDay === undefined ? [] : timeline.taskSegments(startDay, startDay + days);
                  const pauses = segments.filter((segment) => segment.kind === "pause");
                  const summary = calendarWorkSummary(days, pauses);
                  const offWarning = timeline.enabled && task.days !== undefined ? dayOffWarning(summary) : null;
                  const barLabel = task.days === undefined ? "+" : timeline.enabled ? ganttCalendarBarLabel(task.department, task.condition, pauses) : ganttBarLabel(task.department, task.condition).toUpperCase();
                  return <div key={task.key} data-gantt-task={task.title} data-release-condition-index={task.conditionIndex} data-release-condition-node-id={task.nodeId} className="grid grid-cols-[168px_minmax(660px,1fr)] border-b last:border-b-0 sm:grid-cols-[280px_minmax(660px,1fr)]">
                    <div data-gantt-label onPointerDown={(event) => {
                      if (!canEdit || event.pointerType === "touch" || (event.target as HTMLElement).closest("button")) return;
                      beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, { nodeId: task.nodeId, index: task.conditionIndex, label: task.title }, (target) => moveCondition(task.nodeId, task.conditionIndex, target.nodeId, target.index));
                    }} className={`sticky left-0 z-10 flex min-h-12 min-w-0 select-none items-center gap-1.5 border-r bg-panel px-2 py-1 sm:min-h-0 sm:gap-2 sm:px-3 sm:py-0.5 ${canEdit ? "sm:cursor-grab sm:active:cursor-grabbing" : ""}`} title={`${task.title} · ${task.chapter} · ${schedule.phases[task.phaseIndex]?.title || "Unlinked"}`}>
                      <div className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-[11px] font-medium leading-[14px]">{task.title}</span>
                      </div>
                      {!isSalesDepartmentName(task.department) ? <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{task.days ? ganttDurationText(task.condition, false, workingDaysPerWeek) : "Set duration →"}</span> : null}
                      {canEdit ? <button type="button" aria-label={`Edit timing for ${task.title}`} onClick={() => openTimingEditor(task)} className="flex min-h-9 min-w-10 shrink-0 items-center justify-center rounded border px-1.5 text-[11px] font-semibold text-primary sm:min-h-0 sm:min-w-0 sm:py-0.5 sm:text-[9px]">Edit</button> : null}
                    </div>
                    <div data-gantt-track data-gantt-pan-surface data-gantt-total={total} className="relative flex min-h-12 cursor-grab touch-auto items-center sm:min-h-8" style={gridBackground}>
                      {canPlace ? <div role={task.start !== undefined ? "slider" : undefined} tabIndex={canEdit && task.start !== undefined ? 0 : -1} aria-label={task.start !== undefined ? `Start day for ${task.title}` : undefined} aria-valuemin={task.start !== undefined ? schedule.phaseRanges[task.phaseIndex]?.start ?? 0 : undefined} aria-valuemax={task.start !== undefined ? timeline.toScheduleDay(total) - days : undefined} aria-valuenow={task.start} aria-valuetext={task.start !== undefined ? taskTimeLabel(task) : undefined} data-gantt-task-key={task.key} data-gantt-start={task.start} data-gantt-end={task.end} data-gantt-color={task.color} data-actual-work-days={timeline.enabled ? summary.workDays : undefined} data-calendar-start={startDay === undefined ? undefined : timeline.dateAt(timeline.toDisplayDay(startDay)) || undefined} data-calendar-end={timeline.dateAt(displayEnd - 1) || undefined} onPointerDown={(event) => {
                        setTaskCalendar(null);
                        const clickedBar = event.currentTarget;
                        if (canEdit && event.pointerType !== "touch") beginGanttBarDrag(event.nativeEvent, event.currentTarget, { task, schedule, totalDays: total,
                          formatStartDay: dragDayLabel, toDisplayDay: timeline.taskStartDay, toScheduleDay: timeline.toScheduleDay, onPreview: previewTaskBar,
                          onClick: () => openTaskCalendar(task, clickedBar),
                          onDrop: (placement) => placeTaskAt(task.key, placement.startDay),
                          onMoveChapter: (nodeId, index) => moveCondition(task.nodeId, task.conditionIndex, nodeId, index) });
                      }} onClick={(event) => { if (!canEdit || (event.nativeEvent as PointerEvent).pointerType === "touch" || event.detail === 0) openTaskCalendar(task, event.currentTarget); }} onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTaskCalendar(task, event.currentTarget); return; }
                        if (!canEdit || task.start === undefined || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                        event.preventDefault();
                        setTaskCalendar(null);
                        placeTaskAt(task.key, task.start + (event.key === "ArrowRight" ? 1 : -1));
                      }} className={`group absolute flex select-none h-7 min-w-1 items-center justify-center rounded text-[10px] font-semibold text-white touch-auto data-[gantt-snap-target=true]:ring-2 data-[gantt-snap-target=true]:ring-cyan-500 sm:h-5 ${task.start === undefined ? "opacity-60" : ""} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`} style={{ left: `${displayStart / total * 100}%`, width: `${(displayEnd - displayStart) / total * 100}%`, background: taskSegmentBackground(segments, task.color) }}>
                        {segments.map((segment, segmentIndex) => <span key={`${segment.kind}-${segment.start}`} data-gantt-work-segment={segment.kind === "work" ? "" : undefined} data-gantt-pause-segment={segment.kind === "pause" ? "" : undefined} data-segment-start={segment.start} data-segment-end={segment.end} title="" data-pause-periods={segment.kind === "pause" ? segment.periods.map((period) => period.id).join(" ") : undefined} className={`pointer-events-none absolute inset-y-0 flex items-center justify-center overflow-hidden px-1 whitespace-nowrap group-data-[gantt-dragging=true]:invisible group-data-[gantt-resizing=true]:invisible ${segmentIndex === 0 ? "rounded-l" : ""} ${segmentIndex === segments.length - 1 ? "rounded-r" : ""}`} style={{ left: `${(segment.start - displayStart) / (displayEnd - displayStart) * 100}%`, width: `${(segment.end - segment.start) / (displayEnd - displayStart) * 100}%`, ...(segment.kind === "pause" ? { background: pauseSegmentBackground(segment) } : {}) }}>
                        </span>)}
                        <span data-gantt-bar-label title={timeline.enabled ? summary.formula : undefined} className="pointer-events-none absolute left-full ml-2 whitespace-nowrap text-[10px] font-bold text-foreground group-data-[gantt-dragging=true]:invisible group-data-[gantt-resizing=true]:invisible">{timeline.enabled && task.days !== undefined ? <span className="inline-flex items-center gap-2"><CalendarTags compact badges={taskCalendarBadges(task.department, task.condition, pauses, task.color)} />{offWarning && <span data-day-off-warning role="img" aria-label={offWarning.reason} title={offWarning.reason} className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-1 text-[10px] font-bold leading-3 text-red-700 dark:border-red-500/50 dark:bg-red-950/60 dark:text-red-300"><AlertTriangle className="size-3.5 shrink-0 fill-amber-300 text-red-600" aria-hidden="true" />{offWarning.short}</span>}</span> : barLabel}</span>
                        {canEdit && <span role="slider" tabIndex={0} aria-label={`Duration in days for ${task.title}`} aria-valuemin={1} aria-valuemax={timeline.toScheduleDay(total) - startDay} aria-valuenow={days} title="" onPointerDown={(event) => {
                          if (event.pointerType === "touch") return;
                          event.stopPropagation();
                          beginGanttBarResize(event.nativeEvent, event.currentTarget, { startDay, initialDays: days, totalDays: total, daysPerWeek: workingDaysPerWeek, toDisplayDay: timeline.taskStartDay, toScheduleDay: timeline.toScheduleDay, onPreview: previewTaskBar, onDrop: (value) => resizeTask(task.key, value) });
                        }} onKeyDown={(event) => {
                          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                          event.preventDefault();
                          event.stopPropagation();
                          setTaskCalendar(null);
                          resizeTask(task.key, Math.max(1, days + (event.key === "ArrowRight" ? 1 : -1)));
                        }} className="absolute inset-y-0 right-0 hidden w-3 cursor-ew-resize rounded-r border-l border-white/70 bg-white/25 hover:bg-white/50 sm:block" />}
                      </div> : <p className="px-3 text-xs text-amber-700 dark:text-amber-300">{task.issue}</p>}
                    </div>
                  </div>;
                })}
                </div>)}
              </div>)}

              {!schedule.tasks.length && <p className="p-6 text-sm text-muted-foreground">Add release conditions to your departments to build a schedule.</p>}
            </div>
          </div>
        </section>
      </div>}
      {taskCalendar && <GanttTaskCalendar key={taskCalendar.key} value={taskCalendar} onDismiss={closeTaskCalendar} onRestoreFocus={() => calendarTrigger.current?.focus()} />}
      {editingTask && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTaskKey(null); }} onKeyDown={(event) => { if (event.key === "Escape") setEditingTaskKey(null); }}>
        <form role="dialog" aria-modal="true" aria-labelledby="gantt-edit-title" className="max-h-[85dvh] w-full max-w-sm space-y-4 overflow-y-auto rounded-t-2xl border bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-xl sm:pb-5" onSubmit={(event) => { event.preventDefault(); saveTaskTiming(editingTask.key); }}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 id="gantt-edit-title" className="text-base font-bold">Edit timing</h2><p className="mt-1 break-words text-sm text-muted-foreground">{editingTask.title}</p></div><button type="button" aria-label="Close timing editor" onClick={() => setEditingTaskKey(null)} className="flex size-10 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"><X className="size-5" /></button></div>
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs">Start · {previousCondition ? `after ${previousCondition.label || "previous condition"} finishes` : "from existing phase timing"}</p>
          <label className="block text-sm font-semibold">Duration · weeks<input type="number" inputMode="decimal" min="0.1" step="0.01" aria-label={`Duration weeks for ${editingTask.title}`} value={timingDurationWeeks} onChange={(event) => setTimingDurationWeeks(event.target.value)} className="mt-2 block h-12 w-full rounded-lg border bg-background px-3 text-base" required /></label>
          <p className="text-xs text-muted-foreground">The next condition can follow this finish automatically.</p>
          <div className="flex gap-2"><button type="button" onClick={() => setEditingTaskKey(null)} className="min-h-11 flex-1 rounded-lg border px-3 text-sm">Cancel</button><button type="submit" disabled={!canEdit} className="min-h-11 flex-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">Save timing</button></div>
        </form>
      </div>}
    </main>
  </AuthGate>;
}
