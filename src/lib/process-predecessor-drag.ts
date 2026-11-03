type PredecessorDragOptions = {
  sourceTitle: string;
  candidateKeys: ReadonlySet<string>;
  onDrop: (predecessorKey: string) => void;
};

const TASK_SELECTOR = "[data-process-dependency-task-key]";

/** Link a task to a valid predecessor without changing its chapter or order. */
export function beginProcessPredecessorDrag(event: PointerEvent, handle: HTMLElement, options: PredecessorDragOptions) {
  if (event.button !== 0 || !options.candidateKeys.size) return;
  event.preventDefault();
  event.stopPropagation();
  const pointerId = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  let dragging = false;
  let target: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let scrollFrame = 0;
  let pointerPosition = start;
  const validRows = Array.from(document.querySelectorAll<HTMLElement>(TASK_SELECTOR))
    .filter((row) => options.candidateKeys.has(row.dataset.processDependencyTaskKey || ""));
  const clearTarget = () => {
    target?.removeAttribute("data-dependency-drop-active");
    target = null;
  };
  const cleanup = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cleanup);
    document.removeEventListener("keydown", onKeyDown);
    clearTarget();
    validRows.forEach((row) => row.removeAttribute("data-dependency-drop-valid"));
    ghost?.remove();
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const at = (x: number, y: number) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>(TASK_SELECTOR);
    const next = row && options.candidateKeys.has(row.dataset.processDependencyTaskKey || "") ? row : null;
    if (next !== target) {
      clearTarget();
      target = next;
      target?.setAttribute("data-dependency-drop-active", "true");
    }
    if (ghost) {
      ghost.textContent = target
        ? `Start ${options.sourceTitle} after ${target.dataset.processDependencyTaskTitle || "this condition"}`
        : "Drop on a highlighted condition in the same phase";
      ghost.style.left = `${Math.min(x + 14, window.innerWidth - ghost.offsetWidth - 8)}px`;
      ghost.style.top = `${Math.min(y + 14, window.innerHeight - ghost.offsetHeight - 8)}px`;
    }
  };
  const autoScroll = () => {
    if (!dragging) return;
    const surface = document.querySelector<HTMLElement>("[data-release-condition-scroll]");
    if (surface) {
      const rect = surface.getBoundingClientRect();
      const { x, y } = pointerPosition;
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const edge = 64;
        const speed = y < rect.top + edge ? -Math.max(2, Math.round((rect.top + edge - y) / edge * 14))
          : y > rect.bottom - edge ? Math.max(2, Math.round((y - rect.bottom + edge) / edge * 14)) : 0;
        if (speed) {
          const before = surface.scrollTop;
          surface.scrollTop += speed;
          if (surface.scrollTop !== before) at(x, y);
        }
      }
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    if (!dragging && Math.hypot(pointer.clientX - start.x, pointer.clientY - start.y) < (event.pointerType === "touch" ? 8 : 4)) return;
    if (!dragging) {
      dragging = true;
      validRows.forEach((row) => row.setAttribute("data-dependency-drop-valid", "true"));
      ghost = document.createElement("div");
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = "position:fixed;z-index:99999;pointer-events:none;max-width:260px;padding:8px 10px;border-radius:8px;background:#0f172a;color:white;box-shadow:0 8px 24px #0005;font:12px/1.35 Arial,sans-serif";
      document.body.appendChild(ghost);
      scrollFrame = requestAnimationFrame(autoScroll);
    }
    pointer.preventDefault();
    pointerPosition = { x: pointer.clientX, y: pointer.clientY };
    at(pointer.clientX, pointer.clientY);
  };
  const finish = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    const selected = dragging ? target?.dataset.processDependencyTaskKey : undefined;
    cleanup();
    if (selected && options.candidateKeys.has(selected)) options.onDrop(selected);
  };
  const cancel = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) cleanup(); };
  const onKeyDown = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") cleanup(); };
  handle.setPointerCapture(pointerId);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cleanup);
  document.addEventListener("keydown", onKeyDown);
}
