import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/** The seven events that show whether the core loop actually works. */
const KNOWN_EVENTS = new Set([
  "onboarding_completed",
  "first_scan",
  "ingredients_confirmed",
  "recipe_selected",
  "recipe_cooked",
  "feedback_submitted",
  "weekly_return",
]);

/**
 * Collection point for product analytics. Writes to Supabase when it's
 * configured, and falls back to the log otherwise so local development and
 * unconfigured deploys keep working.
 *
 * Deliberately stores no IP, user agent or free text -- just the event, a few
 * structured properties, and an anonymous household id the client generates.
 */
export async function POST(request: Request) {
  let body: { event?: unknown; properties?: Record<string, unknown>; householdId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : null;
  if (!event || !KNOWN_EVENTS.has(event)) {
    return NextResponse.json({ ok: false, error: "unknown event" }, { status: 400 });
  }

  const properties = {
    ...(body.properties && typeof body.properties === "object" ? body.properties : {}),
    householdId: typeof body.householdId === "string" ? body.householdId : null,
  };

  const sb = getAdminClient();
  if (!sb) {
    console.log("[analytics]", event, JSON.stringify(properties));
    return NextResponse.json({ ok: true, stored: false });
  }

  const { error } = await sb.from("analytics_events").insert({ event, properties });
  if (error) {
    // Analytics must never break the app, but we do want to know it's failing.
    console.error("[analytics] insert failed", error.message);
    return NextResponse.json({ ok: true, stored: false });
  }

  return NextResponse.json({ ok: true, stored: true });
}
