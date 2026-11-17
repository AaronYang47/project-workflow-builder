"use client";

import { useEffect, useRef, useState, type DependencyList, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Horizontal scrolling for the Gantt board: tracks how far it can scroll,
 * scrolls to a position, and lets the user drag empty timeline space to pan.
 * `remeasureOn` lists values that change the board's width.
 */
export function useGanttScroll(enabled: boolean, remeasureOn: DependencyList) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [maxScroll, setMaxScroll] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      setMaxScroll(Math.max(0, board.scrollWidth - board.clientWidth));
      setScrollLeft(board.scrollLeft);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the values that resize the board
  }, [enabled, ...remeasureOn]);

  const scrollTo = (left: number) => {
    const board = boardRef.current;
    if (board) board.scrollLeft = left;
  };

  /** One page left or right: at least 120px, otherwise 65% of the visible width. */
  const pageWidth = () => Math.max(120, (boardRef.current?.clientWidth || 0) * 0.65);

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;
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

  return { boardRef, maxScroll, scrollLeft, setScrollLeft, scrollTo, pageWidth, beginPan };
}
