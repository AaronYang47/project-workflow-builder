import type { PersistStorage, StorageValue } from "zustand/middleware";

export const HISTORY_LIMIT = 12;
const LOCAL_SAVE_DELAY = 600;
let localSaveTimer: ReturnType<typeof setTimeout> | undefined;
let pageHideListenerAdded = false;
const pendingLocalWrites = new Map<string, StorageValue<unknown>>();

const flushLocalWrites = () => {
  if (typeof window === "undefined") return;
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = undefined;
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
      pendingLocalWrites.set(key, value as StorageValue<unknown>);
      if (localSaveTimer) clearTimeout(localSaveTimer);
      localSaveTimer = setTimeout(flushLocalWrites, LOCAL_SAVE_DELAY);
    },
    removeItem: (key) => {
      pendingLocalWrites.delete(key);
      if (typeof window === "undefined") return;
      localStorage.removeItem(key);
    },
  };
};
