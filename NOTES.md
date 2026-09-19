# Working notes

Context that isn't obvious from the code. Read this before changing the
recommendation or safety logic.

## Where things stand

The MVP is complete and tested: all ten screens, 30 passing tests, clean build.
It has been used against a real produce photo once (avocados, peaches, oranges)
and the vision path worked.

**Live site:** built from `theraya2026/foodapp`, deployed at
`foodapp-mauve-alpha.vercel.app`.
**This repo:** `deeplaxmi/Food-App`. The two are separate — a Vercel "clone"
created the first from the second. Changes pushed here do **not** reach the live
site until someone pulls them across.

## Decisions, and why

**Allergens are derived, never trusted.** `src/lib/allergens.ts` works out what a
recipe contains from its ingredients against a curated map. It ignores each
recipe's own `containsAllergens` field, including in the hand-written library.
This isn't paranoia — pointing the derivation at my own 22 recipes immediately
found two under-declarations (Thai curry pastes contain shrimp paste and fish
sauce; one was tagged vegan). If a human writing carefully gets it wrong twice
in twenty-two, no generated or third-party recipe should be believed either.

**Unknown ingredients are flagged, not blocked.** A recognised allergen removes
the recipe. An ingredient no rule recognises is surfaced to the family — named,
with "read the label" — rather than silently hidden or assumed safe. Chosen
deliberately over fail-closed: hiding recipes teaches a family nothing, and
they're better judges of their own risk than we are. Only shown to households
that declared an allergy.

**Matching is whole-word and longest-phrase-first.** This is load-bearing. It's
why an egg allergy no longer excludes eggplant, and why coconut milk isn't
dairy. Don't replace it with substring matching.

**Slot labels are assigned after the trio is picked.** `recommend()` chooses
three recipes, then scores all six ways of labelling them, preferring truthful
superlatives and keeping "Best match" on the strongest. Without this, the card
marked "Fastest" could be slower than the one beside it. A test enforces it.

**AI writes nothing unless asked.** Generation used to fire automatically to pad
the list to three. Real use showed the failure: a fruit scan matched none of the
vegetable-only library, so every suggestion was invented — including chickpea
tacos with a little avocado scattered on. Now the app says it has no tested
recipe and *offers* to invent one, stating plainly that nobody has cooked it.
The route also drops its own output if the produce is only a garnish.

**Impact numbers claim only what's defensible.** "Rescued" and "saved" imply the
food would otherwise have been binned, which we can't know. The dashboard
separates counts of what happened (dinners cooked, ingredients used) from
estimates (produce used in time, what it was worth). Prices are per-kilo,
conservative, rounded down — a test fails the build if any estimate rounds up.

**Freshness never judges safety.** Bands come from produce type plus the
purchase date the user gives. Nothing is inferred from the photo, and the model
is instructed never to comment on spoilage.

## Known gaps

- **The library is 22 vegetable dinners.** Zero fruit. A fruit scan matches
  nothing. This is the biggest coverage hole and the reason the AI-chef offer
  exists.
- **Shelf-life figures are unsourced** — written from general knowledge.
  Intended replacement: USDA FoodKeeper.
- **Prices are unsourced too**, deliberately conservative. `PRICES_ARE_SOURCED`
  marks this. Intended replacement: USDA ERS Fruit and Vegetable Prices.
- **Without a purchase date, bands stop meaning urgency** and become "typical
  shelf life, descending" while still being labelled "Use first".
- **Quantities from photos are guesses.** Agreed to drop them; not yet done.
- **No recipe photography.** `Recipe.imageUrl` is ready for a source.

## Pending, in priority order

1. **Fruit coverage** — either fruit-forward mains, or a non-dinner "use it up"
   lane. Fruit is what actually rots, and the app currently goes silent on it.
2. **Detection honesty** — names only, no guessed quantities; bail to manual
   entry when the photo isn't clear.
3. **Freshness honesty** — no day counts without a purchase date; relabel bands;
   source the table.
4. **Recipe breadth** — a licensed API (Spoonacular, Edamam) for real, rated
   recipes. The allergen gate is now solid enough to sit in front of untrusted
   data, but treat their allergen tags as unreliable and re-derive. Check the
   licence: some permit the ingredient list and a link back, not the
   instructions, which changes the "Make this" flow.

## Setup

`README.md` has the full detail. Briefly: the app runs with no keys at all
(on-device storage, manual produce entry). `ANTHROPIC_API_KEY` turns on photo
scanning. Supabase turns on cross-device sync and records the seven product
analytics events — without it, a user test produces no data.
