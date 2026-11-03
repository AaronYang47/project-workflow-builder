import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborativePageFromPath } from "@/lib/collaboration/collaboration-route";

export interface ReleaseConditionDropTarget {
  nodeId: string;
  index: number;
}

type ConditionRow = HTMLElement & {
  dataset: DOMStringMap & {
    releaseConditionIndex?: string;
    releaseConditionSourceIndex?: string;
  };
};

type ConditionCard = {
  element: HTMLElement;
  nodeId: string;
  count: number;
  rows: { element: ConditionRow; index: number; center: number }[];
};

let activeCleanup: (() => void) | undefined;

function cardsOnCanvas(): ConditionCard[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-release-condition-drop-node-id]"))
    .map((element) => ({
      element,
      nodeId: element.dataset.releaseConditionDropNodeId!,
      count: Number(element.dataset.releaseConditionCount ?? element.querySelectorAll("[data-release-condition-index]").length),
      rows: Array.from(element.querySelectorAll<ConditionRow>("[data-release-condition-index]"))
        .map((row) => {
          const rect = row.getBoundingClientRect();
          return { element: row, index: Number(row.dataset.releaseConditionIndex), center: rect.top + rect.height / 2 };
        }),
    }));
}

/** Give release conditions the same lifted row and live gap preview as the L1 node list. */
export function beginReleaseConditionDrag(
  event: PointerEvent,
  handle: HTMLElement,
  source: { nodeId: string; index: number; label: string },
  onDrop: (target: ReleaseConditionDropTarget) => void,
) {
  if (event.button !== 0) return;
  activeCleanup?.();
  event.preventDefault();
  event.stopPropagation();

  const sourceRow = handle.closest<ConditionRow>("[data-release-condition-index], [data-release-condition-source-index]");
  if (!sourceRow) return;
  const sourceRect = sourceRow.getBoundingClientRect();
  const canvasScale = sourceRect.width / sourceRow.offsetWidth;
  const sourceStyle = sourceRow.style.cssText;
  const pointerId = event.pointerId;
  const origin = { x: event.clientX, y: event.clientY };
  let cards = cardsOnCanvas();
  const rowStep = sourceRow.offsetHeight + 6;
  const rowStyles = new Map<HTMLElement, string>();
  let dragging = false;
  let ghost: HTMLElement | undefined;
  let target: ReleaseConditionDropTarget | undefined;
  let highlighted: HTMLElement | undefined;
  let highlightedChapter: HTMLElement | undefined;
  let frame = 0;
  let scrollFrame = 0;
  let latestPointer = origin;

  const restorePreview = () => {
    for (const [row, style] of rowStyles) {
      row.style.cssText = style;
      row.removeAttribute("data-drop-target");
    }
    rowStyles.clear();
    if (highlighted && highlighted !== sourceRow) {
      highlighted.removeAttribute("data-drop-target");
      highlighted.style.outline = "";
      highlighted.style.outlineOffset = "";
    }
    highlighted = undefined;
    highlightedChapter?.removeAttribute("data-drop-chapter");
    highlightedChapter = undefined;
  };
  const sharePreview = () => {
    const currentTarget = target;
    const card = currentTarget && cards.find((item) => item.nodeId === currentTarget.nodeId);
    const rect = card?.element.getBoundingClientRect();
    const view = useCollaborationStore.getState().editorViewState;
    collaborationManager.broadcastDragPreview({
      source,
      ...(target && rect ? { target: { ...target, x: (latestPointer.x - rect.left) / Math.max(1, rect.width), y: (latestPointer.y - rect.top) / Math.max(1, rect.height) } } : {}),
      x: latestPointer.x / window.innerWidth, y: latestPointer.y / window.innerHeight,
      view: { layer: view?.layer || "L1", page: collaborativePageFromPath(window.location.pathname) || "workflow" },
    });
  };
  const cleanup = () => {
    if (dragging) collaborationManager.broadcastDragPreview(null);
    window.removeEventListener("blur", cleanup);
    document.removeEventListener("keydown", escape);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", finish, true);
    document.removeEventListener("pointercancel", cancel, true);
    if (frame) cancelAnimationFrame(frame);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    restorePreview();
    ghost?.remove();
    sourceRow.style.cssText = sourceStyle;
    sourceRow.removeAttribute("data-dragging");
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };
  const previewAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    const cardElement = element?.closest<HTMLElement>("[data-release-condition-drop-node-id]");
    let card = cards.find((item) => item.element === cardElement);
    if (!card) card = cards.find((item) => {
      const rect = item.element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
    // The L2 canvas can mount after a drag starts in the persistent sidebar.
    if (cardElement && !card) {
      cards = cardsOnCanvas();
      card = cards.find((item) => item.element === cardElement);
    }
    if (!card) {
      if (target) restorePreview();
      target = undefined;
      return;
    }

    // Count row centers captured before the preview moves anything. This keeps the
    // insertion point stable even when the rows visibly shift out of the way.
    const destinationRows = card.rows.filter((row) =>
      card.nodeId !== source.nodeId || row.index !== source.index);
    const nextRow = destinationRows.find((row) => y <= row.center);
    const rawIndex = nextRow?.index ?? (destinationRows.length
      ? destinationRows[destinationRows.length - 1].index + 1
      : card.count);
    const index = card.nodeId === source.nodeId && rawIndex > source.index
      ? rawIndex - 1 : rawIndex;
    if (target?.nodeId === card.nodeId && target.index === index) return;
    restorePreview();
    target = { nodeId: card.nodeId, index };
    if (card.element.hasAttribute("data-release-condition-chapter")) {
      highlightedChapter = card.element;
      card.element.setAttribute("data-drop-chapter", "true");
    }
    for (const row of card.rows) {
      if (row.element === sourceRow) continue;
      const shift = card.nodeId === source.nodeId
        ? source.index < index && row.index > source.index && row.index <= index
          ? -rowStep
          : source.index > index && row.index >= index && row.index < source.index
            ? rowStep : 0
        : row.index >= index ? rowStep : 0;
      if (!shift) continue;
      rowStyles.set(row.element, row.element.style.cssText);
      row.element.style.transform = `translateY(${shift}px)`;
      row.element.style.transition = "transform 150ms ease";
    }
    const indicator = destinationRows.find((row) => row.index >= rawIndex)?.element
      ?? destinationRows.at(-1)?.element ?? card.element;
    highlighted = indicator;
    if (indicator !== sourceRow) {
      indicator.setAttribute("data-drop-target", "true");
      indicator.style.outline = "2px solid #38bdf8";
      indicator.style.outlineOffset = "2px";
    }
  };
  const edgeSpeed = (position: number, start: number, end: number) => {
    const edge = 64;
    if (position < start || position > end) return 0;
    if (position < start + edge) return -Math.max(2, Math.round((start + edge - position) / edge * 15));
    if (position > end - edge) return Math.max(2, Math.round((position - (end - edge)) / edge * 15));
    return 0;
  };
  const autoScroll = () => {
    if (!dragging) return;
    if (!sourceRow.isConnected) { cleanup(); return; }
    sharePreview();
    const { x, y } = latestPointer;
    let scrolled = false;
    const board = document.querySelector<HTMLElement>("[data-release-condition-board]");
    if (board) {
      const rect = board.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
        const before = board.scrollLeft;
        board.scrollLeft += edgeSpeed(x, rect.left, rect.right);
        scrolled = board.scrollLeft !== before;
      }
    }
    const card = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-release-condition-drop-node-id]");
    const surface = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-release-condition-scroll]");
    if (surface) {
      const rect = surface.getBoundingClientRect();
      const before = surface.scrollTop;
      surface.scrollTop += edgeSpeed(y, rect.top, rect.bottom);
      scrolled ||= surface.scrollTop !== before;
    }
    const list = card?.querySelector<HTMLElement>("[data-release-condition-list]");
    if (list) {
      const rect = list.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const before = list.scrollTop;
        list.scrollTop += edgeSpeed(y, rect.top, rect.bottom);
        scrolled ||= list.scrollTop !== before;
      }
    }
    if (scrolled) {
      restorePreview();
      cards = cardsOnCanvas();
      target = undefined;
      previewAt(x, y);
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  };
  const move = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    if (!dragging && Math.hypot(pointer.clientX - origin.x, pointer.clientY - origin.y) < (event.pointerType === "touch" ? 8 : 4)) return;
    if (!dragging) {
      dragging = true;
      sourceRow.setAttribute("data-dragging", "true");
      sourceRow.style.opacity = "0.35";
      ghost = sourceRow.cloneNode(true) as HTMLElement;
      ghost.removeAttribute("data-release-condition-index");
      ghost.removeAttribute("data-release-condition-source-index");
      ghost.removeAttribute("data-release-condition-node-id");
      ghost.removeAttribute("data-dragging");
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = "";
      Object.assign(ghost.style, {
        position: "fixed", left: `${sourceRect.left}px`, top: `${sourceRect.top}px`,
        width: `${sourceRow.offsetWidth}px`, minHeight: `${sourceRow.offsetHeight}px`, margin: "0",
        zIndex: "99999", pointerEvents: "none", opacity: "0.98",
        borderColor: "#38bdf8", boxShadow: "0 14px 32px rgba(0,0,0,.35)",
        transition: "none", transformOrigin: "top left", willChange: "transform",
      });
      document.body.appendChild(ghost);
      scrollFrame = requestAnimationFrame(autoScroll);
    }
    pointer.preventDefault();
    const x = pointer.clientX;
    const y = pointer.clientY;
    latestPointer = { x, y };
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (ghost) ghost.style.transform = `translate(${x - origin.x}px, ${y - origin.y}px) scale(${canvasScale * 1.015})`;
      previewAt(x, y);
      sharePreview();
    });
  };
  const finish = (pointer: PointerEvent) => {
    if (pointer.pointerId !== pointerId) return;
    pointer.preventDefault();
    pointer.stopPropagation();
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    if (dragging) previewAt(pointer.clientX, pointer.clientY);
    const drop = dragging ? target : undefined;
    cleanup();
    if (drop && (drop.nodeId !== source.nodeId || drop.index !== source.index)) onDrop(drop);
  };
  const cancel = (pointer: PointerEvent) => {
    if (pointer.pointerId === pointerId) cleanup();
  };
  const escape = (key: KeyboardEvent) => { if (key.key === "Escape") cleanup(); };
  window.addEventListener("blur", cleanup);
  document.addEventListener("keydown", escape);
  handle.setPointerCapture(pointerId);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", cancel, true);
  activeCleanup = cleanup;
}
