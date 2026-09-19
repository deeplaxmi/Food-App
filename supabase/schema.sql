-- UseFirst schema.
--
-- Run this in the Supabase SQL editor, then put the project URL and anon key in
-- .env.local. Every table is row-level-secured to the owning user: the anon key
-- is public by design, and RLS is what actually protects the data.
--
-- Enable anonymous sign-ins under Authentication -> Providers so a household can
-- be created before anyone picks a password.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- households
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My household',
  adults smallint not null default 2 check (adults >= 0),
  children smallint not null default 0 check (children >= 0),
  max_weeknight_minutes smallint not null default 30 check (max_weeknight_minutes > 0),
  pantry_staples text[] not null default '{}',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  is_child boolean not null default false,
  created_at timestamptz not null default now()
);

-- One preference row per member. Allergies and dietary restrictions are hard
-- exclusions; everything else is a ranking signal.
create table if not exists public.preferences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.household_members (id) on delete cascade,
  favorite_cuisines text[] not null default '{}',
  heat_tolerance text check (heat_tolerance in ('none', 'mild', 'medium', 'hot')),
  allergies text[] not null default '{}',
  dietary_restrictions text[] not null default '{}',
  dislikes text[] not null default '{}',
  texture_preferences text[] not null default '{}',
  unique (member_id)
);

-- --------------------------------------------------------------------- scans
create table if not exists public.produce_scans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  source text not null default 'camera' check (source in ('camera', 'upload', 'sample')),
  photo_count smallint not null default 1,
  purchased_on date,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.detected_ingredients (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.produce_scans (id) on delete cascade,
  name text not null,
  quantity text not null default '1',
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  added_by_user boolean not null default false,
  removed boolean not null default false
);

-- ------------------------------------------------------------------- recipes
-- Curated recipes ship with the app; this table holds AI-generated ones so a
-- household keeps the recipe it cooked from.
create table if not exists public.recipes (
  id text primary key,
  household_id uuid references public.households (id) on delete cascade,
  title text not null,
  cuisine text not null,
  total_minutes smallint not null,
  difficulty text not null default 'easy',
  heat_level text not null default 'mild',
  form text not null,
  serves_adults smallint not null default 4,
  produce_used jsonb not null default '[]',
  other_ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  texture_preferences text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  contains_allergens text[] not null default '{}',
  source text not null default 'library' check (source in ('library', 'ai-generated')),
  source_note text not null default '',
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.produce_scans (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id text not null,
  slot text not null check (slot in ('best-match', 'fastest', 'saves-most')),
  why text not null default '',
  preferences_considered text[] not null default '{}',
  produce_used_names text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ feedback
create table if not exists public.meal_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id text not null,
  recommendation_id uuid references public.recommendations (id) on delete set null,
  kind text not null check (kind in ('rejected', 'cooked')),
  rejection_reason text,
  rejection_note text,
  ate_it text[] not null default '{}',
  rating smallint check (rating between 1 and 5),
  spice_level_right text check (spice_level_right in ('too-mild', 'just-right', 'too-spicy')),
  would_make_again boolean,
  had_leftovers boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.remaining_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  feedback_id uuid not null references public.meal_feedback (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.estimated_food_saved (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  feedback_id uuid not null references public.meal_feedback (id) on delete cascade,
  ingredient_names text[] not null default '{}',
  estimated_grams numeric not null default 0,
  estimated_value_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- analytics
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------ document store (MVP sync)
-- The app currently syncs one JSON document per user. The normalised tables
-- above are the target shape; this keeps the client simple until the app needs
-- server-side querying.
create table if not exists public.household_documents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  document jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------- row level security
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.preferences enable row level security;
alter table public.produce_scans enable row level security;
alter table public.detected_ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recommendations enable row level security;
alter table public.meal_feedback enable row level security;
alter table public.remaining_ingredients enable row level security;
alter table public.estimated_food_saved enable row level security;
alter table public.analytics_events enable row level security;
alter table public.household_documents enable row level security;

-- Households and the document store key directly off auth.uid().
create policy "own household" on public.households
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own document" on public.household_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own analytics" on public.analytics_events
  for insert with check (auth.uid() = user_id or user_id is null);

-- Everything hanging off a household is reachable only through one you own.
create policy "own members" on public.household_members
  for all using (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

create policy "own preferences" on public.preferences
  for all using (
    exists (select 1 from public.household_members m
            join public.households h on h.id = m.household_id
            where m.id = member_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.household_members m
            join public.households h on h.id = m.household_id
            where m.id = member_id and h.user_id = auth.uid())
  );

create policy "own scans" on public.produce_scans
  for all using (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

create policy "own detected" on public.detected_ingredients
  for all using (
    exists (select 1 from public.produce_scans s
            join public.households h on h.id = s.household_id
            where s.id = scan_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.produce_scans s
            join public.households h on h.id = s.household_id
            where s.id = scan_id and h.user_id = auth.uid())
  );

create policy "own recipes" on public.recipes
  for all using (
    household_id is null
    or exists (select 1 from public.households h
               where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

create policy "own recommendations" on public.recommendations
  for all using (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

create policy "own feedback" on public.meal_feedback
  for all using (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

create policy "own remaining" on public.remaining_ingredients
  for all using (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

create policy "own saved" on public.estimated_food_saved
  for all using (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.households h
            where h.id = household_id and h.user_id = auth.uid())
  );

-- ------------------------------------------------------------------ indexes
create index if not exists idx_members_household on public.household_members (household_id);
create index if not exists idx_preferences_member on public.preferences (member_id);
create index if not exists idx_scans_household on public.produce_scans (household_id, created_at desc);
create index if not exists idx_detected_scan on public.detected_ingredients (scan_id);
create index if not exists idx_recommendations_scan on public.recommendations (scan_id);
create index if not exists idx_feedback_household on public.meal_feedback (household_id, created_at desc);
