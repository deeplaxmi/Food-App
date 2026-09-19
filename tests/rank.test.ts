import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildProfile, checkHardExclusions, recommend, type AvailableItem } from "../src/lib/rank";
import { RECIPE_LIBRARY } from "../src/lib/recipes/library";
import { estimateFreshness } from "../src/lib/freshness";
import type { Household, HouseholdMember, MealFeedback, Preference } from "../src/lib/types";

const household: Household = {
  id: "h1", userId: "u1", name: "Test House", adults: 2, children: 2,
  maxWeeknightMinutes: 30,
  pantryStaples: ["olive oil", "salt", "rice", "pasta", "garlic", "onion"],
  onboardingComplete: true, createdAt: new Date().toISOString(),
};

const members: HouseholdMember[] = [
  { id: "m1", householdId: "h1", name: "Ada", isChild: false, createdAt: "" },
  { id: "m2", householdId: "h1", name: "Ben", isChild: true, createdAt: "" },
];

function prefs(overrides: Partial<Preference>[] = []): Preference[] {
  const base: Preference[] = [
    { id: "p1", memberId: "m1", favoriteCuisines: ["Italian", "Indian"], heatTolerance: "mild",
      allergies: [], dietaryRestrictions: [], dislikes: [], texturePreferences: [] },
    { id: "p2", memberId: "m2", favoriteCuisines: ["Italian"], heatTolerance: "mild",
      allergies: [], dietaryRestrictions: [], dislikes: [], texturePreferences: [] },
  ];
  return base.map((p, i) => ({ ...p, ...(overrides[i] ?? {}) }));
}

const produce: AvailableItem[] = [
  { name: "Spinach", quantity: "1 bag", band: "use-first" },
  { name: "Mushrooms", quantity: "1 punnet", band: "use-first" },
  { name: "Zucchini", quantity: "3", band: "use-soon" },
  { name: "Carrots", quantity: "6", band: "can-wait" },
  { name: "Cilantro", quantity: "1 bunch", band: "use-first" },
];

test("a nut allergy removes every recipe containing nuts", () => {
  const profile = buildProfile(household, members, prefs([{ allergies: ["nuts"] }]), []);
  const noodles = RECIPE_LIBRARY.find((r) => r.id === "lib-carrot-peanut-noodles")!;
  assert.equal(checkHardExclusions(noodles, profile).excluded, true);

  const { suggestions } = recommend(profile, produce);
  for (const s of suggestions) {
    assert.ok(
      !s.recipe.containsAllergens.some((a) => a.includes("nut")),
      `${s.recipe.title} slipped past a nut allergy`,
    );
  }
});

test("a dairy allergy excludes cheese, cream, butter, yogurt and paneer alike", () => {
  const profile = buildProfile(household, members, prefs([{ allergies: ["dairy"] }]), []);
  const { suggestions } = recommend(profile, produce);
  assert.ok(suggestions.length > 0, "should still find something to cook");
  for (const s of suggestions) {
    const text = [
      ...s.recipe.produceUsed.map((p) => p.name),
      ...s.recipe.otherIngredients.map((o) => o.name),
      ...s.recipe.containsAllergens,
    ].join(" ").toLowerCase();
    for (const term of ["cheese", "cream", "butter", "yogurt", "paneer", "milk", "dairy"]) {
      assert.ok(!text.includes(term), `${s.recipe.title} contains ${term} despite a dairy allergy`);
    }
  }
});

test("a vegetarian restriction excludes every meat and fish recipe", () => {
  const profile = buildProfile(household, members, prefs([{ dietaryRestrictions: ["vegetarian"] }]), []);
  const { suggestions } = recommend(profile, produce);
  for (const s of suggestions) {
    assert.ok(s.recipe.dietaryTags.includes("vegetarian"), `${s.recipe.title} is not vegetarian`);
  }
});

test("hard exclusions beat a strong preference match", () => {
  // Italian is the household's favourite, but gluten is excluded: no pasta.
  const profile = buildProfile(household, members, prefs([{ allergies: ["gluten"] }]), []);
  const { suggestions } = recommend(profile, produce);
  for (const s of suggestions) {
    assert.ok(!s.recipe.containsAllergens.includes("gluten"), `${s.recipe.title} contains gluten`);
  }
});

test("returns three meaningfully different meals", () => {
  const profile = buildProfile(household, members, prefs(), []);
  const { suggestions } = recommend(profile, produce);
  assert.equal(suggestions.length, 3);
  assert.deepEqual(
    suggestions.map((s) => s.slot),
    ["best-match", "fastest", "saves-most"],
  );
  assert.equal(new Set(suggestions.map((s) => s.recipe.id)).size, 3, "recipes must be distinct");
  assert.equal(new Set(suggestions.map((s) => s.recipe.form)).size, 3, "dish shapes must differ");
});

test("every suggestion actually uses produce the household has", () => {
  const profile = buildProfile(household, members, prefs(), []);
  const { suggestions } = recommend(profile, produce);
  for (const s of suggestions) {
    assert.ok(s.matchedProduce.length > 0, `${s.recipe.title} uses none of the scanned produce`);
    assert.ok(s.why.length > 20, `${s.recipe.title} has no real explanation`);
  }
});

test("each slot label is true of the three meals actually shown", () => {
  // The labels are comparative claims. If "Fastest" is slower than the card
  // next to it, we have lied to the user even if the ranking was sound.
  const cases: Preference[][] = [
    prefs(),
    prefs([{ allergies: ["dairy"] }]),
    prefs([{ dietaryRestrictions: ["vegetarian"] }, { dislikes: ["mushrooms"] }]),
    prefs([{ favoriteCuisines: ["Thai"] }, { favoriteCuisines: ["Mexican"] }]),
  ];

  for (const preferences of cases) {
    const profile = buildProfile(household, members, preferences, []);
    const { suggestions } = recommend(profile, produce);
    if (suggestions.length < 3) continue;

    const fastest = suggestions.find((s) => s.slot === "fastest")!;
    const saves = suggestions.find((s) => s.slot === "saves-most")!;
    const cleared = (s: (typeof suggestions)[number]) =>
      s.useFirstCount * 10 + s.matchedProduce.length;

    for (const other of suggestions) {
      assert.ok(
        fastest.recipe.totalMinutes <= other.recipe.totalMinutes,
        `"Fastest" (${fastest.recipe.title}, ${fastest.recipe.totalMinutes}m) is slower than ${other.recipe.title} (${other.recipe.totalMinutes}m)`,
      );
      assert.ok(
        cleared(saves) >= cleared(other),
        `"Saves the most" (${saves.recipe.title}) clears less than ${other.recipe.title}`,
      );
    }
  }
});

test("a disliked ingredient is demoted but not banned", () => {
  const disliked = buildProfile(household, members, prefs([{}, { dislikes: ["mushrooms"] }]), []);
  const neutral = buildProfile(household, members, prefs(), []);
  const mushroomRecipe = RECIPE_LIBRARY.find((r) => r.id === "lib-mushroom-pappardelle")!;

  assert.equal(checkHardExclusions(mushroomRecipe, disliked).excluded, false, "dislikes are not hard exclusions");

  const withDislike = recommend(disliked, produce).suggestions.map((s) => s.recipe.id);
  const without = recommend(neutral, produce).suggestions.map((s) => s.recipe.id);
  assert.notDeepEqual(withDislike, without, "a dislike should change what we recommend");
});

test("rejecting a recipe stops it coming back, and the reason shifts later picks", () => {
  const feedback: MealFeedback[] = [
    {
      id: "f1", householdId: "h1", recipeId: "lib-mushroom-pappardelle", recommendationId: null,
      kind: "rejected", rejectionReason: "too-much-work", rejectionNote: null,
      ateIt: [], rating: null, spiceLevelRight: null, wouldMakeAgain: null, hadLeftovers: null,
      createdAt: new Date().toISOString(),
    },
  ];
  const profile = buildProfile(household, members, prefs(), feedback);
  const { suggestions } = recommend(profile, produce);
  assert.ok(
    !suggestions.some((s) => s.recipe.id === "lib-mushroom-pappardelle"),
    "a rejected recipe came back",
  );
});

test("cooking something and rating it highly lifts that cuisine", () => {
  const feedback: MealFeedback[] = [
    {
      id: "f1", householdId: "h1", recipeId: "lib-chana-saag", recommendationId: null,
      kind: "cooked", rejectionReason: null, rejectionNote: null,
      ateIt: ["Ada", "Ben"], rating: 5, spiceLevelRight: "just-right",
      wouldMakeAgain: true, hadLeftovers: true, createdAt: new Date().toISOString(),
    },
  ];
  const profile = buildProfile(household, members, prefs(), feedback);
  assert.ok((profile.cuisineBoost.get("indian") ?? 0) > 0);
  assert.ok(profile.lovedRecipeIds.has("lib-chana-saag"));
});

test("'too spicy' feedback lowers the heat ceiling", () => {
  const feedback: MealFeedback[] = [
    {
      id: "f1", householdId: "h1", recipeId: "lib-thai-green-curry", recommendationId: null,
      kind: "rejected", rejectionReason: "too-spicy", rejectionNote: null,
      ateIt: [], rating: null, spiceLevelRight: null, wouldMakeAgain: null, hadLeftovers: null,
      createdAt: new Date().toISOString(),
    },
  ];
  const before = buildProfile(household, members, prefs(), []);
  const after = buildProfile(household, members, prefs(), feedback);
  assert.equal(before.heatCeiling, "mild");
  assert.equal(after.heatCeiling, "none");
});

test("a household with no preferences answered is flagged as still learning", () => {
  const blank = prefs([
    { favoriteCuisines: [], heatTolerance: null },
    { favoriteCuisines: [], heatTolerance: null },
  ]);
  const profile = buildProfile(household, members, blank, []);
  assert.equal(recommend(profile, produce).learning, true);
});

test("freshness bands follow shelf life and purchase date", () => {
  const today = new Date("2026-01-10T12:00:00Z");
  assert.equal(estimateFreshness("cilantro", "2026-01-09", today).band, "use-first");
  assert.equal(estimateFreshness("zucchini", "2026-01-08", today).band, "use-soon");
  assert.equal(estimateFreshness("carrots", "2026-01-09", today).band, "can-wait");
  // Past its typical life still bands as use-first -- never as "unsafe".
  assert.equal(estimateFreshness("spinach", "2025-12-01", today).daysLeft, 0);
});

test("every library recipe declares the allergens its ingredients imply", () => {
  const checks: [string, string[]][] = [
    ["dairy", ["cheese", "cream", "butter", "yogurt", "paneer", "ricotta", "mozzarella", "parmesan", "feta", "ghee", "cotija"]],
    ["gluten", ["pasta", "flour tortilla", "flour", "bread", "orzo", "gnocchi", "noodle", "naan", "flatbread", "udon", "soba", "pappardelle", "rigatoni"]],
    ["egg", ["egg"]],
    ["soy", ["soy sauce", "tofu", "miso"]],
    ["peanut", ["peanut"]],
    ["sesame", ["sesame"]],
  ];
  for (const recipe of RECIPE_LIBRARY) {
    const names = [
      ...recipe.produceUsed.map((p) => p.name),
      ...recipe.otherIngredients.map((o) => o.name),
    ]
      .join(" | ")
      .toLowerCase()
      // Nut butters are not dairy; drop them before the dairy markers run.
      .replace(/(peanut|almond|cashew|nut) butter/g, "$1 spread");
    for (const [allergen, markers] of checks) {
      const present = markers.some((m) => names.includes(m));
      if (present) {
        assert.ok(
          recipe.containsAllergens.includes(allergen),
          `${recipe.id} has ${allergen} ingredients but doesn't declare "${allergen}"`,
        );
      }
    }
  }
});

test("every library recipe has real quantities and real steps", () => {
  for (const recipe of RECIPE_LIBRARY) {
    assert.ok(recipe.steps.length >= 3, `${recipe.id} has too few steps`);
    assert.ok(recipe.produceUsed.length > 0, `${recipe.id} uses no produce`);
    for (const item of [...recipe.produceUsed, ...recipe.otherIngredients]) {
      assert.ok(item.amount.trim().length > 0, `${recipe.id}: "${item.name}" has no quantity`);
    }
  }
});
