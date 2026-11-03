"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChartGantt, Download, GripVertical, Plus, Trash2, Undo2, Redo2, X } from "lucide-react";
import { WorkflowLayerNavigation } from "./workflow-layer-navigation";
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
import { ganttBarLabel, ganttDurationText, ganttAxisMinimumWidth } from "@/lib/gantt-bar-label";
import { wholeDayCondition } from "@/lib/condition-duration";
import { isSalesDepartmentName } from "@/lib/department-label";

export function ProcessOverview() {
  const file = useWorkflowStore((state) => state.file);
  const hydrated = useWorkflowStore((state) => state.hydrated);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const ensureConditionIds = useWorkflowStore((state) => state.ensureReleaseConditionIds);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const setInbox = useWorkflowStore((state) => state.setReleaseConditionInbox);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const canUndo = useWorkflowStore((state) => state.past.length > 0);
  const canRedo = useWorkflowStore((state) => state.future.length > 0);
  const collaboration = useCollaborationStore();
  const canEdit = canEditCollaborativeWorkflow(collaboration);
  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [timingDurationWeeks, setTimingDurationWeeks] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
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
    setInbox([...(useWorkflowStore.getState().file.releaseConditionInbox ?? []), wholeDayCondition(condition)]);
    setDraft("");
    setDraftDuration("");
  };
  useEffect(() => {
    if (hydrated && canEdit) ensureConditionIds();
  }, [hydrated, canEdit, ensureConditionIds]);
  const schedule = useMemo(() => buildProcessSchedule(file), [file]);
  const handoff = useMemo(() => salesHandoffTime(schedule), [schedule]);
  const query = collaboration.roomId !== "local-only"
    ? `?room=${encodeURIComponent(collaboration.roomId)}${collaboration.editorPeerId ? `&editor=${encodeURIComponent(collaboration.editorPeerId)}` : ""}` : "";
  const updateTask = (task: ScheduleTask, patch: Partial<Condition>) => {
    if (!canEdit) return;
    const node = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === task.nodeId);
    if (!node) return;
    updateNode(node.id, { conditions: node.conditions.map((condition, index) => index === task.conditionIndex ? wholeDayCondition({ ...condition, ...patch }) : condition) });
  };
  const resizeTask = (taskKey: string, days: number) => {
    const currentTask = buildProcessSchedule(useWorkflowStore.getState().file).tasks.find((item) => item.key === taskKey);
    if (!currentTask) return;
    const preserveWeeks = currentTask.condition.durationUnit === "weeks" && days % DAYS_PER_WEEK === 0;
    updateTask(currentTask, { duration: preserveWeeks ? days / DAYS_PER_WEEK : days,
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
  const axisUnit = schedule.totalDays >= 12 * DAYS_PER_WEEK ? "months" : "weeks";
  const step = axisUnit === "months" ? 4 * DAYS_PER_WEEK : DAYS_PER_WEEK;
  // Keep long schedules readable, with at most 40 labeled divisions.
  const tickSize = step * Math.max(1, Math.ceil(schedule.totalDays / step / 40));
  const total = Math.max(tickSize * 4, Math.ceil((schedule.totalDays + tickSize) / tickSize) * tickSize,
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
    const elapsed = value - handoff.originDay;
    if (elapsed === 0) return `${axisUnit === "months" ? "M1" : "W1"} · handoff`;
    return axisUnit === "months"
      ? `M${Number((elapsed / (4 * DAYS_PER_WEEK) + 1).toFixed(1))}`
      : `W${Number((elapsed / DAYS_PER_WEEK + 1).toFixed(1))}`;
  };
  const dragDayLabel = (day: number) => handoff.originDay === null ? `Project week ${Number((day / DAYS_PER_WEEK + 1).toFixed(1))}`
    : day < handoff.originDay ? `Sales lead week ${Number((day / DAYS_PER_WEEK + 1).toFixed(1))}` : `Week ${Number(((day - handoff.originDay) / DAYS_PER_WEEK + 1).toFixed(1))} after handoff`;
  const taskTimeLabel = (task: ScheduleTask) => {
    if (task.start === undefined || task.end === undefined || handoff.originDay === null) return "Sales handoff pending";
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
  }, [hydrated, minimumTimelineWidth, createOpen]);
  const scrollGanttTo = (left: number) => {
    const board = ganttBoardRef.current;
    if (board) board.scrollLeft = left;
  };

  return <AuthGate>
    <main className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-panel px-4 py-3">
        <Link href={`/${query}`} aria-label="Back to workflow" className="rounded-lg border p-2"><ArrowLeft className="size-4" /></Link>
        <ChartGantt className="size-5 text-primary" />
        <div className="min-w-0 flex-1"><h1 className="text-base font-bold">L4 · Process & Gantt</h1><p className="truncate text-xs text-muted-foreground">{file.graph.metadata.name || "Current project"} · Flowchart & Gantt chart</p></div>
        <button type="button" disabled={exporting} onClick={exportPdf} title="One-page 11 × 17 PDF" className="flex items-center gap-1 rounded-md border border-primary bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"><Download className="size-4" />{exporting ? "Exporting…" : "Export Gantt PDF"}</button>
        <button type="button" aria-label="Open Create Release Condition" aria-expanded={createOpen} onClick={() => setCreateOpen((open) => !open)} className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"><Plus className="size-4" /> Create RC{inbox.length > 0 ? ` · ${inbox.length} unassigned` : ""}</button>
        <CloudProjectControls saveOnly readOnly={!canEdit} />
        <button type="button" aria-label="Undo process change" disabled={!canEdit || !canUndo} onClick={undo} className="rounded-md border p-2 disabled:opacity-40"><Undo2 className="size-4" /></button>
        <button type="button" aria-label="Redo process change" disabled={!canEdit || !canRedo} onClick={redo} className="rounded-md border p-2 disabled:opacity-40"><Redo2 className="size-4" /></button>
        <EditorTransferControl />
        <CollaboratorPresence />
        <div className="w-full"><WorkflowLayerNavigation currentLayer="L4" /></div>
      </header>
      {hydrated && ganttMaxScroll > 1 && <div data-gantt-horizontal-control className="flex shrink-0 items-center gap-3 border-b bg-panel px-4 py-2">
        <span className="shrink-0 text-xs font-semibold">Move Gantt timeline</span>
        <button type="button" aria-label="Scroll Gantt left" disabled={ganttScrollLeft <= 0} onClick={() => scrollGanttTo(ganttScrollLeft - Math.max(120, (ganttBoardRef.current?.clientWidth || 0) * 0.65))} className="rounded border px-2 py-1 text-xs disabled:opacity-40">←</button>
        <input type="range" aria-label="Gantt horizontal position" min={0} max={ganttMaxScroll} step={1} value={Math.min(ganttScrollLeft, ganttMaxScroll)} onChange={(event) => scrollGanttTo(Number(event.target.value))} className="min-w-0 flex-1 accent-primary" />
        <button type="button" aria-label="Scroll Gantt right" disabled={ganttScrollLeft >= ganttMaxScroll - 1} onClick={() => scrollGanttTo(ganttScrollLeft + Math.max(120, (ganttBoardRef.current?.clientWidth || 0) * 0.65))} className="rounded border px-2 py-1 text-xs disabled:opacity-40">→</button>
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
              <div className="min-w-0 flex-1"><p className="break-words text-xs font-medium">{condition.label || condition.description || "Release condition"}</p><p className="text-[10px] text-muted-foreground">{ganttDurationText(condition) || "Duration not set"}</p></div>
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
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border bg-panel px-3 py-2">{schedule.phases.length} phases</span>
            <span className="rounded-lg border bg-panel px-3 py-2">{schedule.tasks.length} release conditions</span>
            <span className="rounded-lg border bg-primary/10 px-3 py-2 font-semibold">{handoff.elapsedDays === null ? "Time after Sales handoff not estimated" : `${Number((handoff.elapsedDays / DAYS_PER_WEEK).toFixed(1))} ${handoff.elapsedDays === DAYS_PER_WEEK ? "week" : "weeks"} estimated${handoff.hasSalesDepartment ? " from Sales handoff" : ""}${schedule.unscheduled ? " · partial" : ""}`}</span>
          </div>
        </div>

        <section aria-label="Complete process flowchart" className="rounded-lg border bg-panel p-3">
          <h2 className="mb-2 text-xs font-bold">Process phases</h2>
          {phaseSummary.length ? <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}>
            {phaseSummary.map((phase, index) => <article key={phase.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-l-4 bg-background px-3 py-2" style={{ borderLeftColor: phase.color }}>
              <div className="min-w-0"><h3 className="text-sm font-bold" style={{ color: phase.color }}>{phase.title}</h3>{phase.description && <p className="truncate text-[11px] text-muted-foreground" title={phase.description}>{phase.description}</p>}</div>
              {index < phaseSummary.length - 1 && <ArrowRight className="size-4 shrink-0" style={{ color: phase.color }} />}
            </article>)}
          </div> : <p className="text-xs text-muted-foreground">Create L1 phases to display your process.</p>}
        </section>

        <section aria-label="Department Gantt chart" className="overflow-hidden rounded-xl border bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="text-sm font-bold">Release conditions · Gantt chart</h2><p className="mt-1 text-xs text-muted-foreground">{handoff.hasSalesDepartment ? "Sales lead qualification ends at the formal Technical handoff. " : "Relative time. "}Durations are entered in weeks. The axis switches to months for long schedules (1 month = 4 weeks). Each phase waits for preceding phases.</p></div>
            <span aria-label="Gantt time scale" className="rounded-md border bg-background px-3 py-2 text-xs font-semibold">Time scale: {axisUnit === "months" ? "Months" : "Weeks"} · automatic</span>
          </div>
          {schedule.unscheduled > 0 && <p role="status" className="border-b bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">{schedule.unscheduled} condition(s) are not scheduled. Set their duration, link their department to L1, or resolve the dependency shown below. The estimated span excludes these conditions and may increase.</p>}
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">Drag a colored bar to move or resize it, or use Edit to enter its duration in weeks. Saving a condition places it after the previous condition in its chapter. Turn on Auto follow previous to keep the chapter in sequence as durations change.</p>
          <div ref={ganttBoardRef} data-release-condition-board onScroll={(event) => setGanttScrollLeft(event.currentTarget.scrollLeft)} className="overflow-x-auto">
            <div className="relative" style={{ minWidth: 280 + minimumTimelineWidth }}>
              <div className="grid grid-cols-[280px_minmax(660px,1fr)] border-b bg-muted/30 text-[10px] font-semibold">
                <div className="sticky left-0 z-20 border-r bg-muted p-3">Department / release condition</div>
                <div className="relative h-10" style={gridBackground}>{handoff.hasSalesDepartment && handoff.originDay !== null && handoff.originDay > 0 ? <span className="absolute top-1 overflow-hidden px-1 text-center text-[9px] font-semibold leading-3 text-blue-800" style={{ left: 0, width: `${handoff.originDay / total * 100}%` }}>Sales lead · customer qualification</span> : null}{ticks.map((tick) => <span key={tick} className="absolute top-3 pl-1" style={{ left: `${tick / total * 100}%` }}>{timeLabel(tick)}</span>)}</div>
              </div>
              <div className="grid grid-cols-[280px_minmax(660px,1fr)] border-b"><div className="sticky left-0 z-20 border-r bg-panel p-3 text-[10px] font-semibold text-muted-foreground">PHASE COVERAGE</div><div className="relative h-10" style={gridBackground}>{schedule.phases.map((phase, index) => {
                const range = schedule.phaseRanges[index];
                return range.end > range.start ? <div key={phase.id} title={phase.title} className="absolute top-2 h-6 overflow-hidden rounded px-1 text-[9px] font-semibold leading-6 text-white" style={{ left: `${range.start / total * 100}%`, width: `${(range.end - range.start) / total * 100}%`, background: phase.color }}>{phase.title}</div> : null;
              })}</div></div>
              {schedule.departments.map((department) => <div key={department.name} data-gantt-department={department.name}>
                <h3 className="border-b border-t bg-muted text-xs font-bold"><span className="sticky left-0 z-20 block w-[280px] border-r bg-muted px-3 py-1">{department.name}</span></h3>
                {department.chapters.map((chapter) => <div key={chapter.nodeId} data-release-condition-chapter data-release-condition-drop-node-id={chapter.nodeId} data-release-condition-count={chapter.tasks.length} className="data-[drop-chapter=true]:bg-primary/10">
                  <div data-phase-department-label className="grid grid-cols-[280px_minmax(660px,1fr)] border-b bg-background text-[11px]"><div className="sticky left-0 z-20 flex min-w-0 items-center gap-2 border-r border-l-4 bg-background px-2 py-0.5" style={{ borderLeftColor: schedule.phases[chapter.phaseIndex]?.color || "#64748b" }}><span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: schedule.phases[chapter.phaseIndex]?.color || "#64748b" }}>{schedule.phases[chapter.phaseIndex]?.title || "Unlinked"}</span><strong className="truncate">{department.name}</strong><span className="shrink-0 text-muted-foreground">{chapter.title}</span></div><div className="flex items-center px-2">{canEdit && chapter.tasks.length > 1 ? <button type="button" aria-pressed={file.graph.nodes.find((node) => node.id === chapter.nodeId)?.config.ganttAutoSequence === true} onClick={() => { const node = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === chapter.nodeId); if (node) updateNode(node.id, { config: { ...node.config, ganttAutoSequence: node.config.ganttAutoSequence !== true } }); }} className="rounded border px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10">Auto follow previous: {file.graph.nodes.find((node) => node.id === chapter.nodeId)?.config.ganttAutoSequence === true ? "On" : "Off"}</button> : null}</div></div>
                  {!chapter.tasks.length && <p className="m-1 rounded border border-dashed px-3 py-2 text-[11px] text-muted-foreground">Drop a release condition here</p>}
                {chapter.tasks.map((task) => {
                  const startDay = task.start ?? schedule.phaseRanges[task.phaseIndex]?.start;
                  const days = task.days ?? 1;
                  const canPlace = startDay !== undefined && task.phaseIndex >= 0;
                  const selected = selectedTaskKey === task.key;
                  return <div key={task.key} data-gantt-task={task.title} data-gantt-selected={selected ? "true" : "false"} data-release-condition-index={task.conditionIndex} data-release-condition-node-id={task.nodeId} onClick={() => setSelectedTaskKey(task.key)} className={`grid grid-cols-[280px_minmax(660px,1fr)] border-b last:border-b-0 ${selected ? "bg-primary/10 ring-2 ring-inset ring-primary/60" : ""}`}>
                    <div data-gantt-label className={`sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r px-3 py-0.5 ${selected ? "bg-primary/15" : "bg-panel"}`} title={`${task.title} · ${task.chapter} · ${schedule.phases[task.phaseIndex]?.title || "Unlinked"}`}>
                      <span className="min-w-0 flex-1 line-clamp-2 break-words text-[11px] font-medium leading-[14px]">{task.title}</span>
                      {!isSalesDepartmentName(task.department) ? <span className="shrink-0 text-[10px] text-muted-foreground">{task.days ? ganttDurationText(task.condition) : "Set duration →"}</span> : null}
                      {canEdit ? <button type="button" aria-label={`Edit timing for ${task.title}`} onClick={() => { setEditingTaskKey(editingTaskKey === task.key ? null : task.key); setTimingDurationWeeks(task.days ? String(Number((task.days / DAYS_PER_WEEK).toFixed(2))) : ""); }} className="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold text-primary">Edit</button> : null}
                    </div>
                    <div data-gantt-track data-gantt-total={total} className={`relative flex h-8 items-center ${selected ? "bg-primary/10" : ""}`} style={gridBackground}>
                      {canPlace ? <div role={task.start !== undefined ? "slider" : undefined} tabIndex={canEdit && task.start !== undefined ? 0 : -1} aria-label={task.start !== undefined ? `Start day for ${task.title}` : undefined} aria-valuemin={task.start !== undefined ? schedule.phaseRanges[task.phaseIndex]?.start ?? 0 : undefined} aria-valuemax={task.start !== undefined ? total - days : undefined} aria-valuenow={task.start} aria-valuetext={task.start !== undefined ? taskTimeLabel(task) : undefined} data-gantt-task-key={task.key} data-gantt-start={task.start} data-gantt-end={task.end} title={task.start !== undefined ? `${task.title}: ${isSalesDepartmentName(task.department) ? "Sales lead qualification" : ganttDurationText(task.condition)} · ${taskTimeLabel(task)} · Drag to move; drag right edge to resize` : `${task.title}: drag the right edge to set a duration`} onPointerDown={(event) => {
                        if (canEdit) beginGanttBarDrag(event.nativeEvent, event.currentTarget, { task, schedule, totalDays: total,
                          formatStartDay: dragDayLabel,
                          onDrop: (placement) => placeTaskAt(task.key, placement.startDay),
                          onMoveChapter: (nodeId, index) => moveCondition(task.nodeId, task.conditionIndex, nodeId, index) });
                      }} onKeyDown={(event) => {
                        if (!canEdit || task.start === undefined || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                        event.preventDefault();
                        placeTaskAt(task.key, task.start + (event.key === "ArrowRight" ? 1 : -1));
                      }} className={`absolute flex h-5 min-w-1 items-center justify-center rounded pl-1 pr-3 text-[10px] font-semibold text-white shadow-sm data-[gantt-snap-target=true]:ring-2 data-[gantt-snap-target=true]:ring-cyan-500 ${task.start === undefined ? "opacity-60" : ""} ${canEdit ? "touch-none cursor-grab active:cursor-grabbing" : "cursor-default"}`} style={{ left: `${startDay / total * 100}%`, width: `${days / total * 100}%`, background: task.color }}>
                        <span className="pointer-events-none overflow-hidden whitespace-nowrap">{task.start !== undefined ? ganttBarLabel(task.department, task.condition) : "+"}</span>
                        {canEdit && <span role="slider" tabIndex={0} aria-label={`Duration in days for ${task.title}`} aria-valuemin={1} aria-valuemax={total - startDay} aria-valuenow={days} title="Drag right edge to change duration" onPointerDown={(event) => {
                          event.stopPropagation();
                          beginGanttBarResize(event.nativeEvent, event.currentTarget, { startDay, initialDays: days, totalDays: total, onDrop: (value) => resizeTask(task.key, value) });
                        }} onKeyDown={(event) => {
                          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                          event.preventDefault();
                          event.stopPropagation();
                          resizeTask(task.key, Math.max(1, days + (event.key === "ArrowRight" ? 1 : -1)));
                        }} className="absolute inset-y-0 right-0 w-3 touch-none cursor-ew-resize rounded-r border-l border-white/70 bg-white/25 hover:bg-white/50" />}
                      </div> : <p className="px-3 text-xs text-amber-700 dark:text-amber-300">{task.issue}</p>}
                    </div>
                    {editingTaskKey === task.key ? <form className="col-span-2 flex flex-wrap items-end gap-2 border-t bg-primary/5 px-3 py-2 text-[10px]" onSubmit={(event) => { event.preventDefault(); saveTaskTiming(task.key); }}>
                      <span className="self-center font-semibold">Start · {task.conditionIndex > 0 ? `after ${chapter.tasks[task.conditionIndex - 1]?.title || "previous condition"} finishes` : "from existing phase timing"}</span>
                      <label className="font-semibold">Duration · weeks<input type="number" min="0.1" step="0.01" aria-label={`Duration weeks for ${task.title}`} value={timingDurationWeeks} onChange={(event) => setTimingDurationWeeks(event.target.value)} className="ml-1 w-20 rounded border bg-background px-2 py-1" required /></label>
                      <button type="submit" className="rounded bg-primary px-2 py-1 font-semibold text-primary-foreground">Save timing</button><button type="button" onClick={() => setEditingTaskKey(null)} className="rounded border px-2 py-1">Cancel</button>
                      <span className="text-muted-foreground">The next condition can follow this finish automatically.</span>
                    </form> : null}
                  </div>;
                })}
                </div>)}
              </div>)}
              {!schedule.tasks.length && <p className="p-6 text-sm text-muted-foreground">Add release conditions to your departments to build a schedule.</p>}
            </div>
          </div>
        </section>
      </div>}
    </main>
  </AuthGate>;
}
