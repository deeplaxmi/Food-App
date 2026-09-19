import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppData } from "../types";

/**
 * Only the anon key is ever used here. It is designed to be public and is
 * protected by row-level security (see supabase/schema.sql) -- the service role
 * key must never reach the browser.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

function getClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createClient(url!, anonKey!);
  return client;
}

/** Signs in anonymously so a household exists before the user picks a password. */
async function ensureSession(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await sb.auth.signInAnonymously();
  if (error) return null;
  return anon.user?.id ?? null;
}

export async function loadRemote(): Promise<AppData | null> {
  const sb = getClient();
  if (!sb) return null;
  const userId = await ensureSession(sb);
  if (!userId) return null;

  const { data, error } = await sb
    .from("household_documents")
    .select("document")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data.document as AppData;
}

export async function saveRemote(payload: AppData): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  const userId = await ensureSession(sb);
  if (!userId) return;

  await sb
    .from("household_documents")
    .upsert(
      { user_id: userId, document: payload, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

export async function signOutRemote(): Promise<void> {
  const sb = getClient();
  if (sb) await sb.auth.signOut();
}
