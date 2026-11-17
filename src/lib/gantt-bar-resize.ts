/** Resize a Gantt bar with precise internal offsets while displaying weeks. */
export function beginGanttBarResize(
  event: PointerEvent,
  handle: HTMLElement,
  options: {
    startDay: number;
    initialDays: number;
    totalDays: number;
    daysPerWeek?: number;
    onDrop: (days: number) => void;
    toDisplayDay?: (day: number, boundary?: "start" | "end") => number;
    toScheduleDay?: (day: number) => number;
    onPreview?: (bar: HTMLElement, start: number, days: number) => void;
  },
) {
  if (event.button !== 0) return;
  const bar = handle.closest<HTMLElement>("[data-gantt-task-key]");
  const track = handle.closest<HTMLElement>("[data-gantt-track]");
  const board = handle.closest<HTMLElement>("[data-release-condition-board]");
  if (!bar || !track || !board) return;
  event.preventDefault();
  event.stopPropagation();
  const pointerId = event.pointerId;
  const originX = event.clientX;
  const initialScroll = board.scrollLeft;
  const originalWidth = bar.style.width;
  const pixelsPerDay = track.getBoundingClientRect().width / options.totalDays;
  const displayDay = options.toDisplayDay ?? ((day: number) => day);
  const scheduleDay = options.toScheduleDay ?? ((day: number) => day);
  let nextDays = options.initialDays;
  let moved = false;
  const tooltip = document.createElement("div");
  tooltip.style.cssText =
    "position:fixed;z-index:99999;pointer-events:none;padding:5px 7px;border-radius:5px;background:#0f172a;color:white;font:11px Arial,sans-serif;box-shadow:0 6px 18px #0004";
  const cleanup = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", cancel);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("blur", cleanup);
    tooltip.remove();
    bar.style.width = originalWidth;
    options.onPreview?.(bar, options.startDay, options.initialDays);
    bar.removeAttribute("data-gantt-resizing");
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    const shift = pointer.clientX - originX + board.scrollLeft - initialScroll;
    if (Math.abs(shift) < (event.pointerType === "touch" ? 8 : 3) && !moved) return;
    moved = true;
    const desiredEnd =
      displayDay(options.startDay + options.initialDays, "end") + shift / pixelsPerDay;
    nextDays = Math.max(
      1,
      Math.min(
        scheduleDay(options.totalDays) - options.startDay,
        Math.round(scheduleDay(desiredEnd) - options.startDay),
      ),
    );
    bar.style.width = `${((displayDay(options.startDay + nextDays, "end") - displayDay(options.startDay)) / options.totalDays) * 100}%`;
    options.onPreview?.(bar, options.startDay, nextDays);
    bar.setAttribute("data-gantt-resizing", "true");
    const weeks = Number((nextDays / (options.daysPerWeek ?? 7)).toFixed(nextDays < 7 ? 2 : 1));
    tooltip.textContent = `${weeks} week${weeks === 1 ? "" : "s"}`;
    tooltip.style.left = `${Math.min(pointer.clientX + 12, window.innerWidth - 90)}px`;
    tooltip.style.top = `${Math.min(track.getBoundingClientRect().bottom + 6, window.innerHeight - 26)}px`;
    if (!tooltip.isConnected) document.body.appendChild(tooltip);
  };
  const finish = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    const days = moved && nextDays !== options.initialDays ? nextDays : null;
    cleanup();
    if (days !== null) options.onDrop(days);
  };
  const cancel = (pointer: PointerEvent) => {
    if (pointer.pointerId === pointerId) cleanup();
  };
  const onKeyDown = (key: KeyboardEvent) => {
    if (key.key === "Escape") cleanup();
  };
  handle.setPointerCapture(pointerId);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", cancel);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", cleanup);
}
