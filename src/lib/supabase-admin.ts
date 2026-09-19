import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 *
 * Uses the service role key, which bypasses row-level security. It must never
 * be imported from a client component and must never be given a NEXT_PUBLIC_
 * prefix -- that would publish full database access to every visitor.
 */
let admin: SupabaseClient | null = null;

/**
 * Vercel's Supabase integration injects SUPABASE_URL, while a hand-configured
 * project usually has NEXT_PUBLIC_SUPABASE_URL. Accept either, so the server
 * works without asking anyone to duplicate a variable they already set.
 */
function adminUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Prefers the service role key. Falls back to the anon key so analytics still
 * record on an integration-provisioned project -- the insert policy on
 * analytics_events allows anonymous rows.
 */
function adminKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function isAdminConfigured(): boolean {
  return Boolean(adminUrl() && adminKey());
}

export function getAdminClient(): SupabaseClient | null {
  if (!isAdminConfigured()) return null;
  if (!admin) {
    admin = createClient(adminUrl()!, adminKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
