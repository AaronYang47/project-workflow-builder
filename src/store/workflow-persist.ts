import type { PersistStorage, StorageValue } from "zustand/middleware";

export const HISTORY_LIMIT = 12;
let pageHideListenerAdded = false;
const pendingLocalWrites = new Map<string, StorageValue<unknown>>();

const flushLocalWrites = () => {
  if (typeof window === "undefined") return;
  for (const [key, value] of pendingLocalWrites) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Cloud save remains authoritative when browser storage is unavailable
      // or full. Never let a storage quota error crash the editor tab.
    }
  }
  pendingLocalWrites.clear();
};

export const appendHistory = <T>(past: T[], snapshot: T) => [
  ...past.slice(-(HISTORY_LIMIT - 1)),
  snapshot,
];

export const debouncedJSONStorage = <T,>(): PersistStorage<T> => {
  if (typeof window !== "undefined" && !pageHideListenerAdded) {
    window.addEventListener("pagehide", flushLocalWrites);
    pageHideListenerAdded = true;
  }
  return {
    getItem: (key) => {
      const pending = pendingLocalWrites.get(key);
      if (pending) return pending as StorageValue<T>;
      if (typeof window === "undefined") return null;
      try {
        const stored = localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as StorageValue<T>) : null;
      } catch {
        localStorage.removeItem(key);
        return null;
      }
    },
    setItem: (key, value) => {
      if (typeof window === "undefined") return;
      // Persist mutations synchronously. A debounced write could leave the
      // editor one state behind when the browser navigated or refreshed
      // between rapid node/input updates, which made the canvas appear to
      // lose recent work. The document is small enough for localStorage's
      // synchronous API, and the existing pagehide flush remains a safety
      // net for any queued write.
      pendingLocalWrites.set(key, value as StorageValue<unknown>);
      flushLocalWrites();
    },
    removeItem: (key) => {
      pendingLocalWrites.delete(key);
      if (typeof window === "undefined") return;
      localStorage.removeItem(key);
    },
  };
};
