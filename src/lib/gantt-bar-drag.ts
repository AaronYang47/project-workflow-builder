import { planGanttPlacement, type GanttPlacement } from "@/lib/gantt-placement";
import type { ScheduleTask } from "@/lib/process-schedule";

type DragOptions = {
  task: ScheduleTask;
  schedule: { tasks: ScheduleTask[]; phaseRanges: { start: number; end: number }[] };
  totalDays: number;
  formatStartDay: (day: number) => string;
  onDrop: (placement: GanttPlacement) => void;
  onMoveChapter?: (nodeId: string, index: number) => void;
};

/** Drag the existing Gantt bar horizontally; the planner preserves phase and dependency rules. */
export function beginGanttBarDrag(event: PointerEvent, bar: HTMLElement, options: DragOptions) {
  if (event.button !== 0 || (options.task.start === undefined && !options.onMoveChapter)) return;
  const track = bar.closest<HTMLElement>("[data-gantt-track]");
  const board = bar.closest<HTMLElement>("[data-release-condition-board]");
  if (!track || !board) return;
  event.preventDefault();
  event.stopPropagation();
  const pointerId = event.pointerId;
  const originX = event.clientX;
  const initialScroll = board.scrollLeft;
  const originalStyle = bar.style.cssText;
  const pixelsPerDay = track.getBoundingClientRect().width / options.totalDays;
  let dragging = false;
  let current: GanttPlacement | null = null;
  let latestX = originX;
  let scrollFrame = 0;
  let guide: HTMLElement | null = null;
  let label: HTMLElement | null = null;
  let snapTarget: HTMLElement | null = null;
  let chapterTarget: HTMLElement | null = null;
  let chapterIndex = 0;
  let vertical = false;
  let ghost: HTMLElement | null = null;
  const clearSnapTarget = () => {
    snapTarget?.removeAttribute("data-gantt-snap-target");
    snapTarget = null;
  };
  const cleanup = () => {
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", finish);
    bar.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cleanup);
    document.removeEventListener("keydown", onKeyDown);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    clearSnapTarget();
    chapterTarget?.removeAttribute("data-drop-chapter");
    ghost?.remove();
    guide?.remove();
    label?.remove();
    bar.style.cssText = originalStyle;
    bar.removeAttribute("data-gantt-dragging");
    if (bar.hasPointerCapture(pointerId)) bar.releasePointerCapture(pointerId);
  };
  const preview = () => {
    const shiftedX = latestX - originX + board.scrollLeft - initialScroll;
    current = planGanttPlacement(options.schedule, options.task,
      Math.min(options.totalDays - (options.task.days ?? 0), options.task.start! + shiftedX / pixelsPerDay),
      Math.min(0.45, 10 / pixelsPerDay));
    if (!current) return;
    const left = current.startDay / options.totalDays * track.getBoundingClientRect().width;
    bar.style.transform = `translateX(${(current.startDay - options.task.start!) * pixelsPerDay}px)`;
    if (guide) guide.style.left = `${left}px`;
    if (label) {
      label.textContent = `${options.formatStartDay(current.startDay)} · ${current.label}`;
      label.style.left = `${Math.min(latestX + 12, window.innerWidth - label.offsetWidth - 8)}px`;
      label.style.top = `${Math.min(track.getBoundingClientRect().bottom + 6, window.innerHeight - label.offsetHeight - 8)}px`;
    }
    clearSnapTarget();
    if (current.snappedToTask) {
      snapTarget = Array.from(board.querySelectorAll<HTMLElement>("[data-gantt-task-key]"))
        .find((item) => item.dataset.ganttTaskKey === current!.snappedToTask) || null;
      snapTarget?.setAttribute("data-gantt-snap-target", "true");
    }
  };
  const autoScroll = () => {
    if (!dragging) return;
    const rect = board.getBoundingClientRect();
    if (latestX >= rect.left && latestX <= rect.right) {
      const edge = 48;
      const speed = latestX < rect.left + edge ? -Math.max(2, Math.round((rect.left + edge - latestX) / edge * 12))
        : latestX > rect.right - edge ? Math.max(2, Math.round((latestX - rect.right + edge) / edge * 12)) : 0;
      if (speed) {
        const before = board.scrollLeft;
        board.scrollLeft += speed;
        if (board.scrollLeft !== before && !vertical) preview();
      }
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  };
  const activateVertical = () => {
    if (vertical && ghost) return;
    vertical = true;
    guide?.remove();
    guide = null;
    clearSnapTarget();
    const rect = bar.getBoundingClientRect();
    ghost = bar.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("role");
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:99999;pointer-events:none;opacity:.85;box-shadow:0 8px 24px #0005`;
    document.body.appendChild(ghost);
    bar.style.opacity = ".35";
    bar.style.transform = "none";
    label!.textContent = "Drop on a chapter to move this condition";
  };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    const deltaX = pointer.clientX - originX;
    const deltaY = pointer.clientY - event.clientY;
    if (!dragging && Math.hypot(deltaX, deltaY) < (event.pointerType === "touch" ? 8 : 4)) return;
    if (!dragging) {
      dragging = true;
      vertical = Boolean(options.onMoveChapter && (options.task.start === undefined || Math.abs(deltaY) > Math.abs(deltaX) * 1.2));
      bar.setAttribute("data-gantt-dragging", "true");
      bar.style.zIndex = "20";
      bar.style.outline = "2px solid #0f172a";
      bar.style.outlineOffset = "2px";
      if (!vertical) {
        guide = document.createElement("div");
        guide.style.cssText = "position:absolute;top:0;bottom:0;border-left:2px dashed #0f766e;pointer-events:none;z-index:10";
        track.appendChild(guide);
      }
      label = document.createElement("div");
      label.style.cssText = "position:fixed;z-index:99999;pointer-events:none;max-width:240px;padding:6px 8px;border-radius:6px;background:#0f172a;color:white;font:11px/1.3 Arial,sans-serif;box-shadow:0 6px 18px #0004";
      document.body.appendChild(label);
      scrollFrame = requestAnimationFrame(autoScroll);
      if (vertical) activateVertical();
    }
    pointer.preventDefault();
    latestX = pointer.clientX;
    const trackRect = track.getBoundingClientRect();
    if (!vertical && options.onMoveChapter && (pointer.clientY < trackRect.top - 8 || pointer.clientY > trackRect.bottom + 8)) activateVertical();
    if (vertical) {
      if (ghost) ghost.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      const target = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-release-condition-drop-node-id]") || null;
      if (target !== chapterTarget) {
        chapterTarget?.removeAttribute("data-drop-chapter");
        chapterTarget = target;
        chapterTarget?.setAttribute("data-drop-chapter", "true");
      }
      if (target) {
        const sourceRow = bar.closest<HTMLElement>("[data-release-condition-index]");
        const rows = Array.from(target.querySelectorAll<HTMLElement>("[data-release-condition-index]"))
          .filter((row) => row !== sourceRow);
        const after = rows.find((row) => pointer.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
        const raw = after ? Number(after.dataset.releaseConditionIndex) : Number(target.dataset.releaseConditionCount || 0);
        const sourceIndex = Number(sourceRow?.dataset.releaseConditionIndex);
        chapterIndex = target === sourceRow?.closest("[data-release-condition-drop-node-id]") && raw > sourceIndex ? raw - 1 : raw;
      }
      if (label) {
        label.style.left = `${Math.min(pointer.clientX + 12, window.innerWidth - label.offsetWidth - 8)}px`;
        label.style.top = `${Math.min(pointer.clientY + 12, window.innerHeight - label.offsetHeight - 8)}px`;
      }
    } else preview();
  };
  const finish = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    const placement = dragging && current?.startDay !== options.task.start ? current : null;
    const destination = vertical && chapterTarget ? { nodeId: chapterTarget.dataset.releaseConditionDropNodeId!, index: chapterIndex } : null;
    cleanup();
    if (destination) { options.onMoveChapter?.(destination.nodeId, destination.index); return; }
    if (placement) options.onDrop(placement);
  };
  const cancel = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) cleanup(); };
  const onKeyDown = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") cleanup(); };
  bar.setPointerCapture(pointerId);
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", finish);
  bar.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cleanup);
  document.addEventListener("keydown", onKeyDown);
}
