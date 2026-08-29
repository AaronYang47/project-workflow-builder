import { useEffect, type RefObject } from "react";

/**
 * Universal node scroll containment hook.
 *
 * Rules:
 * 1. When the cursor is over an element with active scrollable overflow:
 *    - Vertical mouse wheel over horizontal scroll container translates deltaY -> scrollLeft.
 *    - Horizontal swipe (Mac trackpad deltaX) scrolls the element smoothly without canvas interference.
 *    - Vertical scroll stays inside the element and stops propagation to the canvas.
 * 2. When the cursor is over any non-scrollable part of the node (headers, labels, body without overflow):
 *    - The wheel event is NOT intercepted and bubbles directly to React Flow panOnScroll to pan the canvas.
 */
export function useNodeScrollContainment(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      let target = e.target as HTMLElement | null;

      while (target && target !== root) {
        const style = window.getComputedStyle(target);
        const canScrollX =
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          target.scrollWidth - target.clientWidth > 2;
        const canScrollY =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          target.scrollHeight - target.clientHeight > 2;

        if (canScrollX) {
          // If vertical wheel on horizontal scroll container, translate deltaY into horizontal scroll
          if (Math.abs(e.deltaY) > 0 && Math.abs(e.deltaX) === 0) {
            target.scrollLeft += e.deltaY;
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          // If horizontal trackpad swipe or Shift+wheel, isolate from canvas without canceling native scroll
          if (Math.abs(e.deltaX) > 0) {
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          return;
        }

        if (canScrollY) {
          // Inside vertically scrollable container: stop propagation to canvas
          e.stopPropagation();
          return;
        }

        target = target.parentElement;
      }

      // If the target is NOT inside any scrollable container, do NOT call stopPropagation().
      // This allows React Flow panOnScroll to smoothly move/pan the canvas!
    };

    root.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [ref]);
}
