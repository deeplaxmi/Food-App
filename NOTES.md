# Working notes

Everything a new session needs that the code alone doesn't say. Read this
before changing the recommendation, allergen or impact logic.

---

## What this is

A mobile-first PWA: photograph your produce, find out what needs cooking
first, get three genuinely different meals that fit your household's
allergies, tastes and weeknight time budget.

Ten screens, 30 tests, clean build. Used against a real produce photo once
(avocados, peaches, oranges) — the vision path worked.

---

## Infrastructure, and the one thing that's wrong with it

**Two repos, and they have diverged.**

| | |
|---|---|
| `deeplaxmi/Food-App` | Where all development has happened. Branch `claude/produce-meal-planning-mvp-0y0j3p`. **Ahead by ~10 commits.** |
| `theraya2026/foodapp` | What Vercel actually builds. Still on its initial commit. |

Vercel's "clone" flow copied the first into the second rather than linking
them, so pushes to `Food-App` never reach the live site. **Fix this first:**
pull this branch into `theraya2026/foodapp`, then work there. Vercel is on
the `theraya2026` account and can only see repos that account owns.

**Vercel** — project `foodapp`, account `theraya2026` (Hobby tier; note
Hobby is non-commercial, so move to the Pro team before this is a product).
Live at `foodapp-mauve-alpha.vercel.app`, production tracks `main`.

Two traps that cost hours:
- **"Redeploy" reuses the previous environment snapshot.** New environment
  variables don't apply. Always trigger a *fresh* build.
- **Vercel Authentication is ON** (`ssoProtection: all_except_custom_domains`).
  Anyone you share the link with hits a login wall. Turn it off in
  Settings → Deployment Protection before testing with other people.

**Supabase** — project `supabase-foodapp`, provisioned through the Vercel
marketplace, so all 17 variables are already injected into the Vercel
project. Schema is applied (12 tables, row-level security, indexes).

**Blocked:** enabling *Allow anonymous sign-ins* in Supabase →
Authentication → Sign In / Providers failed with an auth error, possibly
because a marketplace-provisioned project is owned by a Vercel-created
organisation. Until that's on, `signInAnonymously()` fails, nothing syncs,
and the app silently stays on-device. **Check whether the toggle is now on
before debugging further.** If it can't be enabled, the fallback is to
generate a household id client-side instead of relying on Supabase auth —
but pair that with a narrower RLS policy, or households can read each
other's rows.

**Keys** — `ANTHROPIC_API_KEY` is set and photo scanning works. Every scan
is a real API call; set a spend limit before sharing widely.

---

## Decisions, and why

**Allergens are derived, never trusted.** `src/lib/allergens.ts` works out
what a recipe contains from its ingredients against a curated map, ignoring
each recipe's own `containsAllergens` field — including in the hand-written
library. Pointing it at my own 22 recipes immediately found two
under-declarations: Thai curry pastes contain shrimp paste and fish sauce,
and one was tagged vegan. If someone writing carefully gets it wrong twice
in twenty-two, no generated or third-party recipe should be believed.

This also catches allergens an ingredient's name never reveals —
Worcestershire sauce (fish), oyster sauce (shellfish), pesto (pine nuts,
parmesan), kimchi, Caesar dressing.

**Unknown ingredients are flagged, not blocked.** A recognised allergen
removes the recipe. An unrecognised ingredient is named to the family with
"read the label" rather than hidden or assumed safe. Chosen deliberately
over fail-closed: hiding recipes teaches a family nothing, and they judge
their own risk better than we can. Only shown to households with a declared
allergy.

**Matching is whole-word, longest-phrase-first.** Load-bearing. It's why an
egg allergy no longer excludes eggplant and why coconut milk isn't dairy.
Do not replace it with substring matching.

**Slot labels are assigned after the trio is chosen.** `recommend()` picks
three recipes, then scores all six labellings, preferring truthful
superlatives and keeping "Best match" on the strongest. Without it, the card
marked "Fastest" could be slower than the one beside it. A test enforces it.

**AI writes nothing unless asked.** Generation used to fire automatically to
pad the list to three. Real use exposed the failure: a fruit scan matched
none of the vegetable-only library, so every suggestion was invented —
including chickpea tacos with a little avocado scattered on. Now the app
says it has no tested recipe and *offers* to invent one, stating plainly
that nobody has cooked it. The route also drops its own output when the
produce is only a garnish.

The principle: **AI for judgment, not for content.** Matching and explaining
is where it's strong and a bad call costs one tap. Inventing a recipe has no
floor — you find out at the stove with the shopping done.

**Impact numbers claim only what's defensible.** "Rescued" and "saved" imply
the food would otherwise have been binned, which we can't know. The
dashboard separates counts of what happened (dinners cooked, ingredients
used up) from estimates (produce used in time, what it was worth). Pricing
is per-kilo, conservative, quantity-aware, rounded down — a test fails the
build if any estimate ever rounds up.

**Freshness never judges safety.** Bands come from produce type plus the
purchase date the user gives. Nothing is inferred from the photo, and the
model is instructed never to comment on spoilage.

---

## Known gaps

- **The library is 22 vegetable dinners. Zero fruit.** A fruit scan matches
  nothing. Biggest coverage hole, and the reason the AI-chef offer exists.
  Deeper issue: the app assumes *dinner*, but the produce that actually rots
  — avocados, peaches, berries — is breakfast, lunchboxes and snacks.
- **Shelf-life figures are unsourced**, written from general knowledge.
  Intended replacement: USDA FoodKeeper.
- **Prices are unsourced too**, deliberately conservative.
  `PRICES_ARE_SOURCED` marks this. Intended replacement: USDA ERS Fruit and
  Vegetable Prices.
- **Without a purchase date, bands stop meaning urgency** and become
  "typical shelf life, descending" while still labelled "Use first".
- **Quantities from photos are guesses.** Agreed to drop them; not done.
- **No recipe photography.** `Recipe.imageUrl` is ready for a source.
- **Analytics only record once this branch is deployed.** The route writes
  to Supabase now, but the live build predates that.

---

## Pending work, in priority order

1. **Sync the repos** — nothing else ships until this is done.
2. **Fruit coverage** — fruit-forward mains, or a non-dinner "use it up"
   lane. Fruit is what rots, and the app currently goes silent on it.
3. **Detection honesty** — names only, no guessed quantities; bail to manual
   entry when the photo isn't clear.
4. **Freshness honesty** — no day counts without a purchase date; relabel
   the bands; source the table.
5. **Recipe breadth** — a licensed API (Spoonacular, Edamam) for real, rated
   recipes. The allergen gate is now solid enough to sit in front of
   untrusted data, but treat their allergen tags as unreliable and re-derive.
   Check the licence: some permit the ingredient list and a link back, not
   the instructions, which changes the "Make this" flow.

---

## Setup

`README.md` has the detail. The app runs with no keys at all (on-device
storage, manual produce entry). `ANTHROPIC_API_KEY` turns on photo scanning.
Supabase turns on cross-device sync and records the seven product analytics
events — without it, a user test produces no data.

```
npm install && npm run dev     # http://localhost:3000
npm test                       # 30 tests, mostly the safety logic
```
