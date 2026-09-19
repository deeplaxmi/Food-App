"use client";

/**
 * The seven events that tell us whether the core loop works. Deliberately a
 * thin wrapper: point `/api/analytics` at whichever product analytics tool you
 * use and nothing else in the app has to change.
 */
export type AnalyticsEvent =
  | "onboarding_completed"
  | "first_scan"
  | "ingredients_confirmed"
  | "recipe_selected"
  | "recipe_cooked"
  | "feedback_submitted"
  | "weekly_return";

const SEEN_KEY = "usefirst:analytics:seen";
const LAST_VISIT_KEY = "usefirst:analytics:last-visit";

function seenEvents(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  const payload = { event, properties, at: new Date().toISOString() };

  try {
    const seen = seenEvents();
    seen.add(event);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* non-fatal */
  }

  // keepalive so the event survives the navigation it usually accompanies.
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* analytics must never break the app */
  });
}

/** Fires `first_scan` only the first time a household ever scans. */
export function trackFirstScan(properties: Record<string, unknown> = {}): void {
  if (seenEvents().has("first_scan")) return;
  track("first_scan", properties);
}

/** Call once on app load: reports a return visit in a later calendar week. */
export function trackReturnVisit(): void {
  if (typeof window === "undefined") return;
  try {
    const last = window.localStorage.getItem(LAST_VISIT_KEY);
    const now = new Date();
    if (last) {
      const gapDays = (now.getTime() - new Date(last).getTime()) / 86_400_000;
      if (gapDays >= 5) track("weekly_return", { daysSinceLastVisit: Math.round(gapDays) });
    }
    window.localStorage.setItem(LAST_VISIT_KEY, now.toISOString());
  } catch {
    /* non-fatal */
  }
}
