import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client.
 *
 * Uses the service role key, which bypasses row-level security. It must never
 * be imported from a client component and must never be given a NEXT_PUBLIC_
 * prefix -- that would publish full database access to every visitor.
 */
let admin: SupabaseClient | null = null;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getAdminClient(): SupabaseClient | null {
  if (!isAdminConfigured()) return null;
  if (!admin) {
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return admin;
}
