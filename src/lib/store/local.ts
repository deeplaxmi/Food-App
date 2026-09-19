import { type AppData } from "../types";

const KEY = "usefirst:data:v1";

export function loadLocal(): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppData) : null;
  } catch {
    // Private mode or corrupted payload: start clean rather than crash the app.
    return null;
  }
}

export function saveLocal(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked -- the session still works, it just won't persist.
  }
}

export function clearLocal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
