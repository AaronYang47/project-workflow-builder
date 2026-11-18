"use client";

import { useEffect } from "react";

const GUARD_KEY = "falcon:stale-build-reload";

/** True for the errors a page from an older deploy hits when its code files are gone. */
export function isStaleBuildError(value: unknown) {
  const text =
    value instanceof Error
      ? `${value.name} ${value.message}`
      : typeof value === "string"
        ? value
        : "";
  return /ChunkLoadError|Loading chunk|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    text,
  );
}

/**
 * After a new deploy, a page that was already open still asks for the old
 * build's code files, which no longer exist, and fails with "This page
 * couldn't load". Reload once to pick up the new build. A 30-second guard
 * stops a reload loop when the files are missing for another reason.
 */
export function StaleBuildReload() {
  useEffect(() => {
    const reload = () => {
      try {
        const last = Number(window.sessionStorage.getItem(GUARD_KEY) || 0);
        if (Date.now() - last < 30_000) return;
        window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
      } catch {
        // Without storage, still reload once for this error.
      }
      window.location.reload();
    };
    const onError = (event: ErrorEvent | Event) => {
      const target = event.target as HTMLElement | null;
      const failedScript =
        target instanceof HTMLScriptElement && target.src.includes("/_next/static/");
      if (failedScript || ("error" in event && isStaleBuildError(event.error ?? event.message)))
        reload();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleBuildError(event.reason)) reload();
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
