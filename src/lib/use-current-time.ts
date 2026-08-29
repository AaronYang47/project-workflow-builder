"use client";

import { useEffect, useState } from "react";

/** Keeps time-based presence indicators fresh without reading Date.now during render. */
export function useCurrentTime(intervalMs = 10000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
