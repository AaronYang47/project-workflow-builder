"use client";

import { useEffect } from "react";

export function PwaServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {
      // The website remains usable when service workers are unavailable.
    });
  }, []);

  return null;
}
