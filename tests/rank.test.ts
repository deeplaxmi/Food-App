import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildProfile,
  checkHardExclusions,
  recommend,
  scoreRecipe,
  toddlerOption,
  type AvailableItem,
} from "../src/lib/rank";
import { RECIPE_LIBRARY } from "../src/lib/recipes/library";
import { analyseIngredients } from "../src/lib/allergens";
import { estimateFreshness } from "../src/lib/freshness";
import type { Household, HouseholdMember, MealFeedback, Preference } from "../src/lib/types";

const household: Household = {
  id: "h1", userId: "u1", name: "Test House", adults: 2, children: 2,
  maxWeeknightMinutes: 30,
  pantryStaples: ["olive oil", "salt", "rice", "pasta", "garlic", "onion"],
  onboardingComplete: true, createdAt: new Date().toISOString(),
};

const members: HouseholdMember[] = [
  { id: "m1", householdId: "h1", name: "Ada", isChild: false, ageStage: "adult", createdAt: "" },
  { id: "m2", householdId: "h1", name: "Ben", isChild: true, ageStage: "adult", createdAt: "" },
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

test("a dairy allergy excludes every real dairy ingredient, and nothing else", () => {
  const profile = buildProfile(household, members, prefs([{ allergies: ["dairy"] }]), []);
  const { suggestions } = recommend(profile, produce);
  assert.ok(suggestions.length > 0, "should still find something to cook");

  for (const s of suggestions) {
    const names = [
      ...s.recipe.produceUsed.map((p) => p.name),
      ...s.recipe.otherIngredients.map((o) => o.name),
    ];
    const { derived } = analyseIngredients(names, new Set());
    assert.ok(
      !derived.has("dairy"),
      `${s.recipe.title} carries dairy despite a dairy allergy`,
    );
  }
});

test("coconut milk is not dairy, and eggplant is not egg", () => {
  // Both were false positives under the old substring gate.
  const dairyFree = buildProfile(household, members, prefs([{ allergies: ["dairy"] }]), []);
  const eggFree = buildProfile(household, members, prefs([{ allergies: ["egg"] }]), []);

  const coconutSoup = RECIPE_LIBRARY.find((r) => r.id === "lib-thai-carrot-soup")!;
  assert.equal(checkHardExclusions(coconutSoup, dairyFree).excluded, false);

  const withEggplant = {
    ...coconutSoup,
    id: "tmp-eggplant",
    produceUsed: [{ name: "eggplant", amount: "2" }],
    otherIngredients: [{ name: "olive oil", amount: "2 tbsp", pantry: true }],
  };
  assert.equal(checkHardExclusions(withEggplant, eggFree).excluded, false);
});

test("allergens hidden inside an ingredient name still block", () => {
  // The recipe lists its ingredients honestly; the name just doesn't say "fish".
  const fishFree = buildProfile(household, members, prefs([{ allergies: ["fish"] }]), []);
  const shellfishFree = buildProfile(household, members, prefs([{ allergies: ["shellfish"] }]), []);
  const base = RECIPE_LIBRARY[0];

  const cases: [string, typeof fishFree][] = [
    ["worcestershire sauce", fishFree],
    ["oyster sauce", shellfishFree],
    ["red curry paste", shellfishFree],
    ["kimchi", fishFree],
  ];

  for (const [ingredient, profile] of cases) {
    const recipe = {
      ...base,
      id: `tmp-${ingredient}`,
      containsAllergens: [], // deliberately lying about its own contents
      produceUsed: [{ name: "spinach", amount: "1 bag" }],
      otherIngredients: [{ name: ingredient, amount: "1 tbsp", pantry: false }],
    };
    const result = checkHardExclusions(recipe, profile);
    assert.equal(result.excluded, true, `${ingredient} was not blocked`);
  }
});

test("an unrecognised ingredient is flagged, not silently allowed or hidden", () => {
  const profile = buildProfile(household, members, prefs([{ allergies: ["fish"] }]), []);
  const base = RECIPE_LIBRARY[0];
  const recipe = {
    ...base,
    id: "tmp-mystery",
    produceUsed: [{ name: "spinach", amount: "1 bag" }],
    otherIngredients: [{ name: "grandma's special sauce", amount: "2 tbsp", pantry: false }],
  };
  const result = checkHardExclusions(recipe, profile);
  assert.equal(result.excluded, false, "we flag rather than block");
  assert.ok(
    result.unverified.includes("grandma's special sauce"),
    "the ingredient we could not check must be reported",
  );
});

test("households with no allergies aren't shown unverified warnings", () => {
  const profile = buildProfile(household, members, prefs(), []);
  const base = RECIPE_LIBRARY[0];
  const recipe = {
    ...base,
    id: "tmp-mystery-2",
    produceUsed: [{ name: "spinach", amount: "1 bag" }],
    otherIngredients: [{ name: "grandma's special sauce", amount: "2 tbsp", pantry: false }],
  };
  assert.deepEqual(checkHardExclusions(recipe, profile).unverified, []);
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

test("honey is never suggested to a household with a baby", () => {
  // Infant botulism. This is a hard exclusion, like an allergy, not a preference.
  const withBaby: HouseholdMember[] = [
    { id: "m1", householdId: "h1", name: "Ada", isChild: false, ageStage: "adult", createdAt: "" },
    { id: "m2", householdId: "h1", name: "Bo", isChild: true, ageStage: "baby", createdAt: "" },
  ];
  const profile = buildProfile(household, withBaby, prefs(), []);
  assert.deepEqual(profile.babies, ["Bo"]);

  const base = RECIPE_LIBRARY[0];
  const withHoney = {
    ...base,
    id: "tmp-honey",
    produceUsed: [{ name: "spinach", amount: "1 bag" }],
    otherIngredients: [{ name: "honey", amount: "1 tbsp", pantry: true }],
  };
  const result = checkHardExclusions(withHoney, profile);
  assert.equal(result.excluded, true, "honey reached a household with a baby");
  assert.match(result.reason ?? "", /under one/);

  // And no library recipe slips through either.
  for (const s of recommend(profile, produce).suggestions) {
    const names = [...s.recipe.produceUsed, ...s.recipe.otherIngredients]
      .map((i) => i.name.toLowerCase())
      .join(" ");
    assert.ok(!names.includes("honey"), `${s.recipe.title} contains honey`);
  }
});

test("honey is fine once the youngest is a toddler", () => {
  const withToddler: HouseholdMember[] = [
    { id: "m1", householdId: "h1", name: "Ada", isChild: false, ageStage: "adult", createdAt: "" },
    { id: "m2", householdId: "h1", name: "Bo", isChild: true, ageStage: "toddler", createdAt: "" },
  ];
  const profile = buildProfile(household, withToddler, prefs(), []);
  assert.deepEqual(profile.babies, []);
  const base = RECIPE_LIBRARY[0];
  const withHoney = {
    ...base,
    id: "tmp-honey-2",
    produceUsed: [{ name: "spinach", amount: "1 bag" }],
    otherIngredients: [{ name: "honey", amount: "1 tbsp", pantry: true }],
  };
  assert.equal(checkHardExclusions(withHoney, profile).excluded, false);
});

test("a plain portion is offered when there's a little one, and not otherwise", () => {
  const withToddler: HouseholdMember[] = [
    { id: "m1", householdId: "h1", name: "Ada", isChild: false, ageStage: "adult", createdAt: "" },
    { id: "m2", householdId: "h1", name: "Bo", isChild: true, ageStage: "toddler", createdAt: "" },
  ];
  const profile = buildProfile(household, withToddler, prefs(), []);
  const pasta = RECIPE_LIBRARY.find((r) => r.id === "lib-spinach-ricotta-bake")!;

  const option = toddlerOption(pasta, profile);
  assert.ok(option, "expected a plain-portion note for a household with a toddler");
  assert.deepEqual(option!.who, ["Bo"]);

  // Households without small children are shown none of this.
  const adultsOnly = buildProfile(household, members, prefs(), []);
  assert.equal(toddlerOption(pasta, adultsOnly), null);
});

test("learns who actually eats what, rather than guessing from age", () => {
  // Two children, same age bracket, opposite tastes. Age tells us nothing here;
  // who cleared their plate tells us everything.
  const kids: HouseholdMember[] = [
    { id: "m1", householdId: "h1", name: "Ada", isChild: false, ageStage: "adult", createdAt: "" },
    { id: "m2", householdId: "h1", name: "Sol", isChild: true, ageStage: "child", createdAt: "" },
    { id: "m3", householdId: "h1", name: "Wren", isChild: true, ageStage: "child", createdAt: "" },
  ];

  const ateCurry = (recipeId: string, who: string[]): MealFeedback => ({
    id: `f-${recipeId}-${who.join("")}`, householdId: "h1", recipeId, recommendationId: null,
    kind: "cooked", rejectionReason: null, rejectionNote: null,
    ateIt: who, rating: 4, spiceLevelRight: "just-right",
    wouldMakeAgain: true, hadLeftovers: false, createdAt: new Date().toISOString(),
  });

  // Sol eats curries, Wren never does. Three sittings.
  const history = [
    ateCurry("lib-chana-saag", ["Ada", "Sol"]),
    ateCurry("lib-spinach-dal", ["Ada", "Sol"]),
    ateCurry("lib-palak-paneer", ["Ada", "Sol"]),
  ];

  const profile = buildProfile(household, kids, prefs(), history);
  const sol = profile.plateHistory.get("Sol")?.get("curry");
  const wren = profile.plateHistory.get("Wren")?.get("curry");
  assert.deepEqual(sol, { ate: 3, skipped: 0 });
  assert.deepEqual(wren, { ate: 0, skipped: 3 });

  // A curry we haven't cooked yet should now carry a warning naming Wren.
  const newCurry = RECIPE_LIBRARY.find((r) => r.id === "lib-thai-green-curry")!;
  const scored = scoreRecipe(newCurry, profile, produce);
  assert.ok(scored, "recipe should still be offered, just demoted");
  assert.ok(
    scored!.warnings.some((w) => w.includes("Wren")),
    `expected a warning about Wren, got: ${scored!.warnings.join(" | ")}`,
  );
  assert.ok(
    scored!.preferencesConsidered.some((p) => p.includes("Sol")),
    "expected Sol's history to count in its favour",
  );
});

test("one sitting isn't enough to conclude anything about someone", () => {
  const kids: HouseholdMember[] = [
    { id: "m1", householdId: "h1", name: "Ada", isChild: false, ageStage: "adult", createdAt: "" },
    { id: "m2", householdId: "h1", name: "Sol", isChild: true, ageStage: "child", createdAt: "" },
  ];
  const once: MealFeedback[] = [{
    id: "f1", householdId: "h1", recipeId: "lib-chana-saag", recommendationId: null,
    kind: "cooked", rejectionReason: null, rejectionNote: null,
    ateIt: ["Ada"], rating: 4, spiceLevelRight: "just-right",
    wouldMakeAgain: true, hadLeftovers: false, createdAt: new Date().toISOString(),
  }];
  const profile = buildProfile(household, kids, prefs(), once);
  const curry = RECIPE_LIBRARY.find((r) => r.id === "lib-thai-green-curry")!;
  const scored = scoreRecipe(curry, profile, produce);
  assert.ok(
    !scored!.warnings.some((w) => w.includes("Sol")),
    "a single skipped meal shouldn't label a child a fussy eater",
  );
});
