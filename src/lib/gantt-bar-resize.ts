/** Resize a Gantt bar with precise internal offsets while displaying weeks. */
export function beginGanttBarResize(
  event: PointerEvent,
  handle: HTMLElement,
  options: { startDay: number; initialDays: number; totalDays: number; onDrop: (days: number) => void },
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
  let nextDays = options.initialDays;
  let moved = false;
  const tooltip = document.createElement("div");
  tooltip.style.cssText = "position:fixed;z-index:99999;pointer-events:none;padding:5px 7px;border-radius:5px;background:#0f172a;color:white;font:11px Arial,sans-serif;box-shadow:0 6px 18px #0004";
  const cleanup = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", cancel);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("blur", cleanup);
    tooltip.remove();
    bar.style.width = originalWidth;
    bar.removeAttribute("data-gantt-resizing");
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    const shift = pointer.clientX - originX + board.scrollLeft - initialScroll;
    if (Math.abs(shift) < (event.pointerType === "touch" ? 8 : 3) && !moved) return;
    moved = true;
    nextDays = Math.max(1, Math.min(options.totalDays - options.startDay, Math.round(options.initialDays + shift / pixelsPerDay)));
    bar.style.width = `${nextDays / options.totalDays * 100}%`;
    bar.setAttribute("data-gantt-resizing", "true");
    const weeks = Number((nextDays / 7).toFixed(nextDays < 7 ? 2 : 1));
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
  const cancel = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) cleanup(); };
  const onKeyDown = (key: KeyboardEvent) => { if (key.key === "Escape") cleanup(); };
  handle.setPointerCapture(pointerId);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", cancel);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", cleanup);
}
