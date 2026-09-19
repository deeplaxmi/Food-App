-- Household sync without Supabase Auth.
--
-- Run this in the Supabase SQL editor. It is additive and safe to run twice.
--
-- The browser never touches this table. It holds a random household token and
-- sends it to our own /api/household route, which reads and writes here with
-- the service role key. Row-level security is on and there are deliberately NO
-- policies, so the anon key cannot read a single row -- only the service role,
-- which never leaves the server.

create table if not exists public.household_sync (
  token uuid primary key,
  document jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.household_sync enable row level security;

create index if not exists idx_household_sync_updated
  on public.household_sync (updated_at desc);
