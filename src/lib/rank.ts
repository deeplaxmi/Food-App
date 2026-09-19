import {
  ALLERGEN_LABELS,
  analyseIngredients,
  parseUserAllergies,
  type Allergen,
} from "./allergens";
import { canonicalName } from "./freshness";
import { RECIPE_LIBRARY } from "./recipes/library";
import type {
  HeatTolerance,
  Household,
  HouseholdMember,
  MealFeedback,
  Preference,
  Recipe,
  RecommendationSlot,
  TexturePreference,
  UrgencyBand,
} from "./types";
import { HEAT_LABELS, HEAT_LEVELS, TEXTURE_OPTIONS } from "./types";

export const LEARNING_MESSAGE =
  "We're still learning what your family likes. Your feedback will improve the next recommendations.";

/** Produce the household has on hand, already banded by urgency. */
export interface AvailableItem {
  name: string;
  quantity: string;
  band: UrgencyBand;
}

/** Everything the ranker needs, flattened from the stored entities. */
export interface HouseholdProfile {
  householdName: string;
  adults: number;
  children: number;
  maxMinutes: number;
  pantry: Set<string>;
  /** Canonical allergens to exclude on. Derived from ingredients, never from a recipe's own claims. */
  allergens: Set<Allergen>;
  /** Dietary tags a recipe must carry, e.g. "vegetarian". */
  requiredDietaryTags: Set<string>;
  /** name -> who dislikes it. Ranking signal only. */
  dislikes: Map<string, string[]>;
  /** cuisine (lowercase) -> how many members named it. */
  cuisineFans: Map<string, string[]>;
  /** The most heat-sensitive person sets the ceiling. */
  heatCeiling: HeatTolerance;
  texturePreferences: Map<TexturePreference, string[]>;
  /** Recipes the household has already turned down or cooked. */
  rejectedRecipeIds: Set<string>;
  lovedRecipeIds: Set<string>;
  cuisineBoost: Map<string, number>;
  formBoost: Map<string, number>;
  /** How much preference signal we actually have, 0-1. */
  signalStrength: number;
  /** Names of anyone under one. Honey is a hard exclusion for them. */
  babies: string[];
  /** Names of anyone under four, for choking-hazard guidance. */
  littleOnes: string[];
}

const heatIndex = (h: HeatTolerance) => HEAT_LEVELS.indexOf(h);

/** Restrictions that translate into a required dietary tag rather than an allergen. */
const RESTRICTION_TAGS: Record<string, string> = {
  vegetarian: "vegetarian",
  veggie: "vegetarian",
  vegan: "vegan",
  "gluten-free": "gluten-free",
  "gluten free": "gluten-free",
  celiac: "gluten-free",
  "dairy-free": "dairy-free",
  "dairy free": "dairy-free",
  "lactose intolerant": "dairy-free",
};

export function buildProfile(
  household: Household,
  members: HouseholdMember[],
  preferences: Preference[],
  feedback: MealFeedback[],
): HouseholdProfile {
  const prefOf = new Map(preferences.map((p) => [p.memberId, p]));

  const allergyEntries: string[] = [];
  const requiredDietaryTags = new Set<string>();
  const dislikes = new Map<string, string[]>();
  const cuisineFans = new Map<string, string[]>();
  const texturePreferences = new Map<TexturePreference, string[]>();
  let heatCeiling: HeatTolerance = "hot";
  let answered = 0;

  for (const member of members) {
    const p = prefOf.get(member.id);
    if (!p) continue;
    let memberAnswered = 0;

    for (const a of p.allergies) {
      allergyEntries.push(a);
      memberAnswered = 1;
    }
    for (const r of p.dietaryRestrictions) {
      const key = r.trim().toLowerCase();
      const tag = RESTRICTION_TAGS[key];
      if (tag) requiredDietaryTags.add(tag);
      else allergyEntries.push(key);
      memberAnswered = 1;
    }
    for (const d of p.dislikes) {
      const key = canonicalName(d);
      if (!key) continue;
      dislikes.set(key, [...(dislikes.get(key) ?? []), member.name]);
      memberAnswered = 1;
    }
    for (const c of p.favoriteCuisines) {
      const key = c.trim().toLowerCase();
      cuisineFans.set(key, [...(cuisineFans.get(key) ?? []), member.name]);
      memberAnswered = 1;
    }
    for (const t of p.texturePreferences) {
      texturePreferences.set(t, [...(texturePreferences.get(t) ?? []), member.name]);
      memberAnswered = 1;
    }
    if (p.heatTolerance) {
      if (heatIndex(p.heatTolerance) < heatIndex(heatCeiling)) heatCeiling = p.heatTolerance;
      memberAnswered = 1;
    }
    answered += memberAnswered;
  }

  // Learn from what actually happened at the table.
  const rejectedRecipeIds = new Set<string>();
  const lovedRecipeIds = new Set<string>();
  const cuisineBoost = new Map<string, number>();
  const formBoost = new Map<string, number>();
  let maxMinutes = household.maxWeeknightMinutes;

  const byId = new Map(RECIPE_LIBRARY.map((r) => [r.id, r]));
  for (const f of feedback) {
    const recipe = byId.get(f.recipeId);
    if (f.kind === "rejected") {
      rejectedRecipeIds.add(f.recipeId);
      if (!recipe) continue;
      const cuisine = recipe.cuisine.toLowerCase();
      switch (f.rejectionReason) {
        case "too-spicy":
          if (heatIndex(heatCeiling) > 0) heatCeiling = HEAT_LEVELS[heatIndex(heatCeiling) - 1];
          break;
        case "wrong-cuisine":
          cuisineBoost.set(cuisine, (cuisineBoost.get(cuisine) ?? 0) - 12);
          break;
        case "too-much-work":
          maxMinutes = Math.max(15, Math.min(maxMinutes, recipe.totalMinutes - 5));
          formBoost.set(recipe.form, (formBoost.get(recipe.form) ?? 0) - 6);
          break;
        case "texture-problem":
        case "kids-wont-eat":
          formBoost.set(recipe.form, (formBoost.get(recipe.form) ?? 0) - 8);
          break;
        default:
          break;
      }
    } else if (f.kind === "cooked") {
      if (!recipe) continue;
      const cuisine = recipe.cuisine.toLowerCase();
      const rating = f.rating ?? 3;
      const delta = (rating - 3) * 5;
      cuisineBoost.set(cuisine, (cuisineBoost.get(cuisine) ?? 0) + delta);
      formBoost.set(recipe.form, (formBoost.get(recipe.form) ?? 0) + delta);
      if (f.wouldMakeAgain) lovedRecipeIds.add(f.recipeId);
      if (f.wouldMakeAgain === false) rejectedRecipeIds.add(f.recipeId);
      if (f.spiceLevelRight === "too-spicy" && heatIndex(heatCeiling) > 0) {
        heatCeiling = HEAT_LEVELS[heatIndex(heatCeiling) - 1];
      }
      if (f.spiceLevelRight === "too-mild" && heatIndex(heatCeiling) < 3) {
        heatCeiling = HEAT_LEVELS[heatIndex(heatCeiling) + 1];
      }
    }
  }

  const babies = members.filter((m) => m.ageStage === "baby").map((m) => m.name);
  const littleOnes = members
    .filter((m) => m.ageStage === "baby" || m.ageStage === "toddler")
    .map((m) => m.name);

  const coverage = members.length ? answered / members.length : 0;
  const signalStrength = Math.min(1, coverage * 0.7 + Math.min(feedback.length, 3) * 0.1);

  return {
    householdName: household.name,
    adults: household.adults,
    children: household.children,
    maxMinutes,
    pantry: new Set(household.pantryStaples.map((s) => canonicalName(s))),
    allergens: parseUserAllergies(allergyEntries),
    requiredDietaryTags,
    dislikes,
    cuisineFans,
    heatCeiling,
    texturePreferences,
    rejectedRecipeIds,
    lovedRecipeIds,
    cuisineBoost,
    formBoost,
    signalStrength,
    babies,
    littleOnes,
  };
}

/**
 * Infant botulism is a real risk from honey under twelve months, and it is
 * advice every health service gives without qualification. So this is a hard
 * exclusion like an allergy, not a ranking signal.
 */
const UNSAFE_UNDER_ONE = ["honey"];

/**
 * What a small child could eat from this meal.
 *
 * This is cooking logistics, not nutrition or safety advice: most families
 * already pull a plain portion aside before the sauce or spice goes on, and
 * the recipe author is the one who knows where that moment is. We deliberately
 * say nothing about what a child should eat, how much, or when.
 */
export function toddlerOption(
  recipe: Recipe,
  profile: HouseholdProfile,
): { who: string[]; note: string } | null {
  if (profile.littleOnes.length === 0) return null;
  if (!recipe.toddlerOption) return null;
  return { who: profile.littleOnes, note: recipe.toddlerOption };
}

function recipeIngredientNames(recipe: Recipe): string[] {
  return [
    ...recipe.produceUsed.map((p) => p.name),
    ...recipe.otherIngredients.map((o) => o.name),
  ].map((n) => n.toLowerCase());
}

export interface ExclusionResult {
  excluded: boolean;
  reason?: string;
  /** Ingredients we could not check against the allergen map. */
  unverified: string[];
}

/**
 * The hard gate.
 *
 * Allergens are derived from the ingredient list, NOT read from the recipe's
 * own `containsAllergens` field -- that field has been wrong in hand-written
 * recipes, and anything generated or fetched is less trustworthy still.
 *
 * A derived allergen the household reacts to removes the recipe outright.
 * An ingredient no rule recognises does not: it is returned as `unverified`
 * so the household can be told exactly what we could not check, and decide.
 */
export function checkHardExclusions(
  recipe: Recipe,
  profile: HouseholdProfile,
): ExclusionResult {
  const ingredients = [
    ...recipe.produceUsed.map((p) => p.name),
    ...recipe.otherIngredients.map((o) => o.name),
  ];
  const { hits, unverified } = analyseIngredients(ingredients, profile.allergens);

  if (hits.length > 0) {
    const { ingredient, allergen } = hits[0];
    return {
      excluded: true,
      reason: `${ingredient} contains ${ALLERGEN_LABELS[allergen]}`,
      unverified,
    };
  }

  if (profile.babies.length > 0) {
    const haystack = ingredients.join(" | ").toLowerCase();
    const unsafe = UNSAFE_UNDER_ONE.find((item) => haystack.includes(item));
    if (unsafe) {
      return {
        excluded: true,
        reason: `contains ${unsafe}, which isn't safe under one`,
        unverified,
      };
    }
  }

  for (const tag of profile.requiredDietaryTags) {
    if (!recipe.dietaryTags.includes(tag)) {
      return { excluded: true, reason: `not ${tag}`, unverified };
    }
  }

  // Only worth surfacing when the household actually has something to avoid.
  return { excluded: false, unverified: profile.allergens.size > 0 ? unverified : [] };
}

const BAND_WEIGHT: Record<UrgencyBand, number> = {
  "use-first": 26,
  "use-soon": 12,
  "can-wait": 4,
};

/** Forms that get recommended to everyone by default, so they need to earn it. */
const GENERIC_FORMS = new Set(["stir-fry", "soup", "salad"]);

export interface ScoredRecipe {
  recipe: Recipe;
  score: number;
  matchedProduce: { name: string; band: UrgencyBand; amount: string }[];
  useFirstCount: number;
  missingPurchases: string[];
  preferencesConsidered: string[];
  warnings: string[];
  /** Ingredients we could not verify against the allergen map, for an allergy household. */
  unverified: string[];
}

export function scoreRecipe(
  recipe: Recipe,
  profile: HouseholdProfile,
  available: AvailableItem[],
): ScoredRecipe | null {
  const gate = checkHardExclusions(recipe, profile);
  if (gate.excluded) return null;
  if (profile.rejectedRecipeIds.has(recipe.id)) return null;

  const availableByName = new Map(available.map((a) => [canonicalName(a.name), a]));
  const preferencesConsidered: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // 1. Produce actually used, weighted by how soon it needs cooking.
  const matchedProduce: ScoredRecipe["matchedProduce"] = [];
  for (const p of recipe.produceUsed) {
    const hit = availableByName.get(canonicalName(p.name));
    if (!hit) continue;
    matchedProduce.push({ name: hit.name, band: hit.band, amount: p.amount });
    score += BAND_WEIGHT[hit.band];
  }
  if (matchedProduce.length === 0) return null;
  const useFirstCount = matchedProduce.filter((m) => m.band === "use-first").length;

  // Using several items at once clears the counter faster than three single-item meals.
  score += Math.max(0, matchedProduce.length - 1) * 6;

  // 2. Shopping burden: every non-pantry ingredient we do not already have costs.
  const missingPurchases = recipe.otherIngredients
    .filter((o) => !o.pantry && !profile.pantry.has(canonicalName(o.name)))
    .map((o) => o.name);
  score -= missingPurchases.length * 3;

  // 3. Cuisine.
  const cuisineKey = recipe.cuisine.toLowerCase();
  const fans = profile.cuisineFans.get(cuisineKey) ?? [];
  if (fans.length > 0) {
    score += 10 + fans.length * 4;
    preferencesConsidered.push(`${recipe.cuisine} is a favourite of ${formatNames(fans)}`);
  }
  score += profile.cuisineBoost.get(cuisineKey) ?? 0;
  score += profile.formBoost.get(recipe.form) ?? 0;

  // 4. Heat. A ranking signal, not an exclusion -- but a strong one.
  const over = heatIndex(recipe.heatLevel) - heatIndex(profile.heatCeiling);
  if (over > 0) {
    score -= over * 18;
    warnings.push(`Spicier than your ${HEAT_LABELS[profile.heatCeiling].toLowerCase()} setting -- hold back the chilli.`);
  } else {
    score += 6;
    preferencesConsidered.push(`Kept to ${HEAT_LABELS[profile.heatCeiling].toLowerCase()} heat`);
  }

  // 5. Dislikes. Worse when the disliked thing is a headline ingredient.
  for (const [disliked, who] of profile.dislikes) {
    const inProduce = recipe.produceUsed.some((p) => canonicalName(p.name) === disliked);
    const inOthers = recipe.otherIngredients.some(
      (o) => !o.pantry && canonicalName(o.name) === disliked,
    );
    if (inProduce) {
      score -= 30;
      warnings.push(`${formatNames(who)} doesn't like ${disliked}, and it's a main ingredient here.`);
    } else if (inOthers) {
      score -= 14;
      warnings.push(`Contains ${disliked}, which ${formatNames(who)} isn't keen on.`);
    }
  }
  if (profile.dislikes.size > 0 && warnings.length === 0) {
    preferencesConsidered.push(`Avoids ${formatList([...profile.dislikes.keys()])}`);
  }

  // 6. Time.
  if (recipe.totalMinutes <= profile.maxMinutes) {
    score += 12 + Math.max(0, profile.maxMinutes - recipe.totalMinutes) * 0.3;
    preferencesConsidered.push(`${recipe.totalMinutes} min, inside your ${profile.maxMinutes} min weeknight limit`);
  } else {
    score -= (recipe.totalMinutes - profile.maxMinutes) * 1.5;
    warnings.push(`Runs about ${recipe.totalMinutes - profile.maxMinutes} min over your weeknight limit.`);
  }

  // 7. Texture and preparation preferences.
  for (const [pref, who] of profile.texturePreferences) {
    const label = TEXTURE_OPTIONS.find((t) => t.id === pref)?.label ?? pref;
    if (recipe.texturePreferences.includes(pref)) {
      score += 9;
      preferencesConsidered.push(`${label} — matters to ${formatNames(who)}`);
    } else {
      score -= 4;
    }
  }

  // 8. Don't fall back on the same three shapes for every household.
  if (GENERIC_FORMS.has(recipe.form) && fans.length === 0) score -= 10;

  if (profile.littleOnes.length > 0 && recipe.toddlerOption) {
    score += 8;
    preferencesConsidered.push(
      `There's an easy plain portion for ${formatNames(profile.littleOnes)}`,
    );
  }

  if (profile.lovedRecipeIds.has(recipe.id)) {
    score += 14;
    preferencesConsidered.push("You said you'd make this again");
  }

  if (recipe.servesAdults < profile.adults + profile.children * 0.5) score -= 4;

  return {
    recipe,
    score,
    matchedProduce,
    useFirstCount,
    missingPurchases,
    preferencesConsidered,
    warnings,
    unverified: gate.unverified,
  };
}

export interface Suggestion extends ScoredRecipe {
  slot: RecommendationSlot;
  slotLabel: string;
  why: string;
}

const SLOT_LABELS: Record<RecommendationSlot, string> = {
  "best-match": "Best match for everyone",
  fastest: "Fastest tonight",
  "saves-most": "Saves the most produce",
};

/**
 * Picks three meaningfully different meals: the best overall, the quickest, and
 * the one that clears the most produce. Ties are broken toward different dish
 * shapes so the household isn't offered three pastas.
 */
export function recommend(
  profile: HouseholdProfile,
  available: AvailableItem[],
  pool: Recipe[] = RECIPE_LIBRARY,
): { suggestions: Suggestion[]; learning: boolean } {
  const scored = pool
    .map((r) => scoreRecipe(r, profile, available))
    .filter((s): s is ScoredRecipe => s !== null);

  // Step 1: gather three candidates worth showing -- the strongest overall, the
  // quickest, and the one that clears the most produce -- preferring different
  // dish shapes so the household isn't offered three pastas.
  const chosen: ScoredRecipe[] = [];
  const takenIds = new Set<string>();
  const takenForms = new Set<string>();

  const pick = (compare: (a: ScoredRecipe, b: ScoredRecipe) => number) => {
    const remaining = scored.filter((s) => !takenIds.has(s.recipe.id));
    if (remaining.length === 0) return;
    const fresh = remaining.filter((s) => !takenForms.has(s.recipe.form));
    const best = [...(fresh.length ? fresh : remaining)].sort(compare)[0];
    takenIds.add(best.recipe.id);
    takenForms.add(best.recipe.form);
    chosen.push(best);
  };

  const produceCleared = (s: ScoredRecipe) => s.useFirstCount * 10 + s.matchedProduce.length;

  pick((a, b) => b.score - a.score);
  pick((a, b) => a.recipe.totalMinutes - b.recipe.totalMinutes || b.score - a.score);
  pick((a, b) => produceCleared(b) - produceCleared(a) || b.score - a.score);

  // Step 2: choose which card gets which label. Assigning slots in pick order
  // can put "Fastest" on a meal that is slower than the card beside it, which
  // reads as a lie even when the ranking was right. There are only ever six
  // ways to label three cards, so score them all: truthful superlatives first,
  // then keep "Best match" on the strongest meal.
  const SLOTS: RecommendationSlot[] = ["best-match", "fastest", "saves-most"];
  const permutations = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];

  let bestAssignment: ScoredRecipe[] = chosen;
  let bestQuality = -Infinity;

  for (const order of permutations) {
    if (order.some((i) => i >= chosen.length)) continue;
    const arranged = order.map((i) => chosen[i]);
    const [best, fastest, saves] = arranged;

    let truths = 0;
    if (fastest && arranged.every((o) => fastest.recipe.totalMinutes <= o.recipe.totalMinutes)) {
      truths += 1;
    }
    if (saves && arranged.every((o) => produceCleared(saves) >= produceCleared(o))) {
      truths += 1;
    }
    // Truthful labels dominate; the tie-break keeps the headline card strong.
    const quality = truths * 1000 + (best?.score ?? 0);
    if (quality > bestQuality) {
      bestQuality = quality;
      bestAssignment = arranged;
    }
  }

  const suggestions: Suggestion[] = bestAssignment.map((entry, i) => ({
    ...entry,
    slot: SLOTS[i],
    slotLabel: SLOT_LABELS[SLOTS[i]],
    why: explain(entry, SLOTS[i], profile),
  }));

  return { suggestions, learning: profile.signalStrength < 0.4 };
}

export function explain(
  s: ScoredRecipe,
  slot: RecommendationSlot,
  profile: HouseholdProfile,
): string {
  const lower = (names: string[]) => names.map((n) => n.toLowerCase());
  const useFirst = lower(s.matchedProduce.filter((m) => m.band === "use-first").map((m) => m.name));
  const others = lower(s.matchedProduce.filter((m) => m.band !== "use-first").map((m) => m.name));

  const sentences: string[] = [];

  // 1. What it clears off the counter -- the reason the household opened the app.
  if (useFirst.length && others.length) {
    sentences.push(
      `Uses the ${formatList(useFirst)} you need to cook first, and clears the ${formatList(others)} at the same time.`,
    );
  } else if (useFirst.length) {
    sentences.push(`Uses the ${formatList(useFirst)} you need to cook first.`);
  } else if (others.length) {
    sentences.push(`Uses the ${formatList(others)} you have in.`);
  }

  // 2. Why it suits these particular people.
  const fit: string[] = [];
  const fans = profile.cuisineFans.get(s.recipe.cuisine.toLowerCase()) ?? [];
  if (fans.length) fit.push(`${s.recipe.cuisine} is on ${formatNames(fans)}'s list`);
  if (slot === "fastest") fit.push(`it's on the table in ${s.recipe.totalMinutes} minutes`);
  else if (s.recipe.totalMinutes <= profile.maxMinutes) {
    fit.push(`it fits your ${profile.maxMinutes}-minute weeknight limit`);
  }
  if (slot === "saves-most") fit.push("it's the option that clears the most produce");
  if (fit.length) sentences.push(`${capitalise(formatList(fit))}.`);

  // 3. What it costs them at the shop.
  if (s.missingPurchases.length === 0) sentences.push("Nothing extra to buy.");
  else if (s.missingPurchases.length <= 3) {
    sentences.push(`You'll just need ${formatList(lower(s.missingPurchases))}.`);
  }

  return sentences.join(" ");
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatNames(names: string[]): string {
  return formatList([...new Set(names)]);
}

export function formatList(items: string[]): string {
  const list = items.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
