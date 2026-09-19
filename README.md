# UseFirst

**Take a photo of your produce. Get meal ideas your family will actually eat — before the food goes to waste.**

A mobile-first progressive web app. Photograph what's in the fridge, correct what the
vision model saw, find out what needs cooking first, and get three genuinely different
meals that fit your household's allergies, tastes and weeknight time budget.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # optional — the app runs without any keys
npm run dev                    # http://localhost:3000
```

With no environment variables set, the app runs fully on-device: it stores everything in
the browser and photo scanning is disabled (you can still type produce in by hand). Tap
**"Look around with sample data"** on the welcome screen to load the demo household and see
the whole flow immediately.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm test` | Recommendation-engine tests (allergy exclusions, ranking, label honesty) |
| `npm run typecheck` | `tsc --noEmit` |

---

## Configuration

Everything is optional. Copy `.env.example` to `.env.local` and fill in what you need.

### Photo scanning — `ANTHROPIC_API_KEY`

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Enables the **Scan my produce** flow. The key is read only inside
`src/app/api/vision/analyze/route.ts` and `src/app/api/recipes/generate/route.ts`, both of
which are server-only route handlers — **it is never bundled into client code.** Set
`ANTHROPIC_MODEL` to override the model (defaults to `claude-opus-5`).

Without it, `/api/vision/analyze` returns a 503 and the UI offers manual entry instead.

### Sync across devices, and learn from testers — Supabase

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # server-only, see below
```

1. Create a Supabase project — **a separate one per product.** Sharing a project across two
   apps also shares `auth.users`, which couples them in a way that is painful to undo.
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable **anonymous sign-ins** under Authentication → Providers, so a household can exist
   before anyone picks a password.
4. Add all three variables to your host and redeploy.

The first two are public by design; row-level security protects the data, and every table is
locked to the owning user. The third bypasses RLS and is read only inside
`src/app/api/analytics/route.ts`. **Never give it a `NEXT_PUBLIC_` prefix** — that publishes
full database access to every visitor.

Without the service role key the app still works; analytics fall back to the server log.

#### What you can query once testers are using it

```sql
-- Where people drop out of the core loop
select event, count(*) from analytics_events group by event order by count desc;

-- Households that scanned but never cooked
select properties->>'householdId' as household
from analytics_events where event = 'first_scan'
except
select properties->>'householdId'
from analytics_events where event = 'recipe_cooked';

-- Why meals get rejected
select properties->>'reason' as reason, count(*)
from analytics_events where event = 'feedback_submitted'
group by reason order by count desc;
```

Events carry a random per-browser `householdId` so journeys can be followed without
identifying anyone. No names, emails, IPs or free text are recorded.

---

## How it works

### Deciding what to cook first

`src/lib/freshness.ts` holds typical fridge/counter life for common produce. Combined with
the purchase date the user gives, each item lands in **Use first** (≤3 days left),
**Use soon** (≤7) or **Can wait**.

This is guidance about *typical storage life only*. The app never claims to judge whether
food is safe to eat, and every screen that shows a freshness estimate carries the
disclaimer in `FRESHNESS_DISCLAIMER`.

### Choosing the meals

`src/lib/rank.ts` is the core. It runs in two stages:

**1. A hard gate.** Allergies and medical dietary restrictions remove a recipe outright —
they are never traded off against anything. Allergen terms are expanded generously
(`dairy` also catches milk, cheese, butter, cream, yogurt, paneer, ghee…) because a false
exclusion costs one recipe while a false inclusion is a medical incident. Recipes the
household has already rejected are dropped here too.

**2. A score.** Everything else is a ranking signal: produce cleared (weighted by urgency),
how many extra things you'd have to buy, cuisine matches per person, heat tolerance,
dislikes, cooking time, and texture/preparation preferences. Generic shapes — stir-fry,
soup, salad — carry a small penalty unless the cuisine genuinely matches, so nobody gets
three stir-fries.

Three cards are then chosen for variety of dish shape, and the **labels are assigned by
what is actually true of that trio** — the card marked "Fastest tonight" is never slower
than the one beside it. `tests/rank.test.ts` pins that invariant.

### Recipes

The 22 recipes in `src/lib/recipes/library.ts` are hand-written with real quantities and
real steps, and each declares every allergen it contains. A test asserts those declarations
match the ingredients, so an under-declared allergen fails the build rather than reaching a
family.

If the library can't fill all three slots for an unusual set of produce, `/api/recipes/generate`
asks the model for the remainder. Those are stored with `source: "ai-generated"`, badged
**Written by AI** on the card, and carry a warning on the detail screen.

### Learning from feedback

Rejections remove that recipe permanently and shift the signal behind the reason — *too
spicy* lowers the household's heat ceiling, *wrong cuisine* down-weights that cuisine, *too
much work* tightens the time budget. Cooking something and rating it lifts that cuisine and
dish shape. Until there's enough signal, the meals screen says so plainly rather than
pretending to be personalised.

---

## Data model

`src/lib/types.ts` and `supabase/schema.sql` mirror each other:

`User` · `Household` · `HouseholdMember` · `Preference` · `ProduceScan` · `DetectedIngredient`
· `Recipe` · `Recommendation` · `MealFeedback` · `RemainingIngredient` · `EstimatedFoodSaved`

Storage goes through `src/lib/store/`, which has two interchangeable adapters — Supabase
when credentials are present, `localStorage` otherwise — so the app is usable before any
backend exists.

## Analytics

`src/lib/analytics.ts` tracks the seven events that show whether the core loop works:
`onboarding_completed`, `first_scan`, `ingredients_confirmed`, `recipe_selected`,
`recipe_cooked`, `feedback_submitted`, `weekly_return`. They POST to `/api/analytics`,
which currently logs to the console — point it at your warehouse and nothing else changes.

## Screens

Welcome · Household setup · Scan · Confirm detected produce · Use-first list ·
Three recommendations · Recipe detail · Feedback · Kitchen dashboard · Settings and profile editing

## Installing on an iPhone

Open the site in Safari → Share → **Add to Home Screen**. It runs standalone, lays out for
the safe area, and `capture="environment"` opens the rear camera directly. Photos are
downscaled in the browser before upload, which also strips EXIF (including GPS) before
anything leaves the device.

## Not built yet

Deliberately out of scope until the core loop is tested with real families: accounts with
passwords, subscriptions, grocery ordering, social sharing, nutrition tracking, native apps,
and full pantry management.
