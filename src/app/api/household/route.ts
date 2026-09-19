import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * Household sync, without Supabase Auth.
 *
 * The browser holds a random household token in localStorage and sends it
 * here; the server reads and writes on its behalf using the service role key.
 * Three things follow from that:
 *
 *  - Testers need no email, password or sign-up. They open the link and go.
 *  - The Supabase key is never exposed to the browser at all, which is
 *    stricter than the anon-key-plus-RLS arrangement it replaces.
 *  - Scoping is enforced here, server-side, by the token. A household can only
 *    ever touch its own row because the query is built from the token we were
 *    given, and nothing else reaches the table.
 *
 * `household_sync` has row-level security on and no policies, so only the
 * service role can read it. See supabase/schema.sql.
 */

/** A token has to look like a UUID before it goes anywhere near the database. */
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badToken() {
  return NextResponse.json({ error: "invalid token" }, { status: 400 });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !TOKEN.test(token)) return badToken();

  const sb = getAdminClient();
  if (!sb) return NextResponse.json({ document: null, synced: false });

  const { data, error } = await sb
    .from("household_sync")
    .select("document")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[household] read failed", error.message);
    return NextResponse.json({ document: null, synced: false });
  }
  return NextResponse.json({ document: data?.document ?? null, synced: true });
}

export async function PUT(request: Request) {
  let body: { token?: unknown; document?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "unreadable" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : null;
  if (!token || !TOKEN.test(token)) return badToken();
  if (!body.document || typeof body.document !== "object") {
    return NextResponse.json({ error: "no document" }, { status: 400 });
  }

  const sb = getAdminClient();
  if (!sb) return NextResponse.json({ synced: false });

  const { error } = await sb.from("household_sync").upsert(
    { token, document: body.document, updated_at: new Date().toISOString() },
    { onConflict: "token" },
  );

  if (error) {
    // Syncing must never cost someone their data -- the local copy still stands.
    console.error("[household] write failed", error.message);
    return NextResponse.json({ synced: false });
  }
  return NextResponse.json({ synced: true });
}
