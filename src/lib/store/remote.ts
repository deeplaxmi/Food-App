import type { AppData } from "../types";

/**
 * Talks to our own /api/household route rather than to Supabase directly.
 * The browser never holds a database key; it holds a household token, and the
 * server does the reading and writing scoped to it.
 */
const TOKEN_KEY = "usefirst:household-token";

/** A random token, created once per browser and kept locally. No sign-up. */
export function householdToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(TOKEN_KEY);
    if (existing) return existing;
    if (typeof crypto === "undefined" || !("randomUUID" in crypto)) return null;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    // Private mode or blocked storage: the app still works, it just won't sync.
    return null;
  }
}

/** Whether the server reported a working database on the last call. */
let lastSyncWorked: boolean | null = null;

export function syncStatus(): boolean | null {
  return lastSyncWorked;
}

export async function loadRemote(): Promise<AppData | null> {
  const token = householdToken();
  if (!token) return null;
  try {
    const response = await fetch(`/api/household?token=${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as { document: AppData | null; synced: boolean };
    lastSyncWorked = payload.synced;
    return payload.document;
  } catch {
    lastSyncWorked = false;
    return null;
  }
}

export async function saveRemote(document: AppData): Promise<void> {
  const token = householdToken();
  if (!token) return;
  try {
    const response = await fetch("/api/household", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, document }),
      keepalive: true,
    });
    const payload = (await response.json()) as { synced?: boolean };
    lastSyncWorked = Boolean(payload.synced);
  } catch {
    lastSyncWorked = false;
  }
}
