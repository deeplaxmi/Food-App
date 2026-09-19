import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildProfile, recommend, type AvailableItem } from "../src/lib/rank";
import { analyseIngredients } from "../src/lib/allergens";
import type { Household, HouseholdMember, Preference } from "../src/lib/types";

const household: Household = {
  id: "h", userId: "u", name: "Test", adults: 2, children: 2,
  maxWeeknightMinutes: 30, pantryStaples: ["olive oil", "salt", "rice", "garlic"],
  onboardingComplete: true, createdAt: "",
};
const members: HouseholdMember[] = [
  { id: "m1", householdId: "h", name: "A", isChild: false, ageStage: "adult", createdAt: "" },
];
const prefs = (o: Partial<Preference> = {}): Preference[] => [{
  id: "p", memberId: "m1", favoriteCuisines: [], heatTolerance: "mild",
  allergies: [], dietaryRestrictions: [], dislikes: [], texturePreferences: [], ...o,
}];

// The scan that came back with nothing but invented recipes.
const fruitBowl: AvailableItem[] = [
  { name: "Avocados", quantity: "3", band: "use-first" },
  { name: "Peaches", quantity: "4", band: "use-soon" },
  { name: "Oranges", quantity: "5", band: "can-wait" },
];

test("a fruit-bowl scan now returns real, tested recipes", () => {
  const profile = buildProfile(household, members, prefs(), []);
  const { suggestions } = recommend(profile, fruitBowl);

  assert.equal(suggestions.length, 3, "should fill all three slots from the library");
  for (const s of suggestions) {
    assert.equal(s.recipe.source, "library", `${s.recipe.title} is not a tested recipe`);
    assert.ok(s.matchedProduce.length > 0, `${s.recipe.title} uses none of the fruit`);
  }
  console.log("  fruit bowl ->", suggestions.map((s) => `${s.slotLabel}: ${s.recipe.title}`));
});

test("the fruit uses a real quantity, not a garnish", () => {
  const profile = buildProfile(household, members, prefs(), []);
  const { suggestions } = recommend(profile, fruitBowl);
  for (const s of suggestions) {
    for (const m of s.matchedProduce) {
      assert.ok(
        !/garnish|to serve|sprinkle|a few/i.test(m.amount),
        `${s.recipe.title} uses ${m.name} only as a garnish`,
      );
    }
  }
});

test("fruit recipes don't trigger spurious unverified warnings", () => {
  // An allergy household should only be warned about genuinely unknown things.
  const profile = buildProfile(household, members, prefs({ allergies: ["peanut"] }), []);
  const { suggestions } = recommend(profile, fruitBowl);
  for (const s of suggestions) {
    assert.deepEqual(
      s.unverified, [],
      `${s.recipe.title} flagged ${s.unverified.join(", ")} as unrecognised`,
    );
  }
});

test("a dairy allergy still leaves something to cook from fruit", () => {
  const profile = buildProfile(household, members, prefs({ allergies: ["dairy"] }), []);
  const { suggestions } = recommend(profile, fruitBowl);
  assert.ok(suggestions.length > 0, "dairy-free households shouldn't be left with nothing");
  for (const s of suggestions) {
    const names = [...s.recipe.produceUsed, ...s.recipe.otherIngredients].map((i) => i.name);
    assert.ok(!analyseIngredients(names, new Set()).derived.has("dairy"));
  }
  console.log("  dairy-free ->", suggestions.map((s) => s.recipe.title));
});
