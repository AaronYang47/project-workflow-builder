"use client";

import { useRef, useState, type PointerEvent } from "react";
import { cornerAnchor, DOCK_DRAG_THRESHOLD, DOCK_SNAP_PX, nearestDockCorner, readDockCorner, writeDockCorner, type DockCorner } from "@/lib/process-locator/pyramid-layout";

/**
 * The Process Locator button can be dragged and snaps to the nearest screen
 * corner, which is remembered per browser. A press without dragging calls
 * `onTap` (opens the locator).
 */
export function useDockCorner(onTap: () => void) {
  const [dock, setDock] = useState<DockCorner>(readDockCorner);
  const [dockPos, setDockPos] = useState<{ x: number; y: number } | null>(null);
  const [dockDragging, setDockDragging] = useState(false);
  const [dockMagnet, setDockMagnet] = useState(false);
  const dockButtonRef = useRef<HTMLButtonElement>(null);
  const dockDragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);

  const finishDockDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dockDragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (!drag.moved) {
      setDockDragging(false);
      setDockMagnet(false);
      setDockPos(null);
      onTap();
      return;
    }
    const button = dockButtonRef.current;
    const width = button?.offsetWidth ?? 242;
    const height = button?.offsetHeight ?? 44;
    const { corner } = nearestDockCorner(drag.x, drag.y, width, height);
    setDock(corner);
    writeDockCorner(corner);
    setDockDragging(false);
    setDockMagnet(false);
    setDockPos(null);
  };

  const onDockPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dockDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      x: rect.left,
      y: rect.top,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic / non-capturable pointers still complete on the button */
    }
  };

  const onDockPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DOCK_DRAG_THRESHOLD) return;
    drag.moved = true;
    setDockDragging(true);
    const button = dockButtonRef.current;
    const width = button?.offsetWidth ?? 242;
    const height = button?.offsetHeight ?? 44;
    const x = Math.min(
      window.innerWidth - width - 4,
      Math.max(4, event.clientX - drag.offsetX),
    );
    const y = Math.min(
      window.innerHeight - height - 4,
      Math.max(4, event.clientY - drag.offsetY),
    );
    const nearest = nearestDockCorner(x, y, width, height);
    if (nearest.distance < DOCK_SNAP_PX) {
      const anchor = cornerAnchor(nearest.corner, width, height);
      drag.x = anchor.x;
      drag.y = anchor.y;
      setDock(nearest.corner);
      setDockMagnet(true);
      setDockPos(anchor);
      return;
    }
    drag.x = x;
    drag.y = y;
    setDockMagnet(false);
    setDockPos({ x, y });
  };

  return { dock, dockPos, dockDragging, dockMagnet, dockButtonRef, finishDockDrag, onDockPointerDown, onDockPointerMove };
}
