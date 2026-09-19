import { BAND_ORDER, estimateFreshness } from "./freshness";
import { totalValue } from "./prices";
import { buildProfile, recommend, type AvailableItem, type Suggestion } from "./rank";
import { RECIPE_LIBRARY } from "./recipes/library";
import type { AppData, DetectedIngredient, ProduceScan, Recipe, UrgencyBand } from "./types";

/** The scan we are currently working through, newest first. */
export function latestScan(data: AppData): ProduceScan | null {
  return [...data.scans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function scanById(data: AppData, id: string | null): ProduceScan | null {
  if (!id) return latestScan(data);
  return data.scans.find((s) => s.id === id) ?? null;
}

export function ingredientsFor(data: AppData, scanId: string): DetectedIngredient[] {
  return data.detected.filter((d) => d.scanId === scanId && !d.removed);
}

export interface BandedItem extends AvailableItem {
  id: string;
  daysLeft: number;
}

/** Produce from a scan, classified by how soon it should be cooked. */
export function bandedItems(data: AppData, scan: ProduceScan | null, now = new Date()): BandedItem[] {
  if (!scan) return [];
  return ingredientsFor(data, scan.id)
    .map((item) => {
      const { band, daysLeft } = estimateFreshness(item.name, scan.purchasedOn, now);
      return { id: item.id, name: item.name, quantity: item.quantity, band, daysLeft };
    })
    .sort(
      (a, b) =>
        BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band) ||
        a.daysLeft - b.daysLeft ||
        a.name.localeCompare(b.name),
    );
}

export function groupByBand(items: BandedItem[]): { band: UrgencyBand; items: BandedItem[] }[] {
  return BAND_ORDER.map((band) => ({ band, items: items.filter((i) => i.band === band) })).filter(
    (g) => g.items.length > 0,
  );
}

/** All recipes we can rank: the curated library plus anything AI-generated this session. */
export function recipePool(data: AppData): Recipe[] {
  const extras = data.recipes.filter((r) => !RECIPE_LIBRARY.some((l) => l.id === r.id));
  return [...RECIPE_LIBRARY, ...extras];
}

export function getRecipeFrom(data: AppData, id: string): Recipe | null {
  return recipePool(data).find((r) => r.id === id) ?? null;
}

export interface MealPlan {
  suggestions: Suggestion[];
  learning: boolean;
}

export function mealPlan(data: AppData, scan: ProduceScan | null, now = new Date()): MealPlan | null {
  if (!data.household || !scan) return null;
  const profile = buildProfile(data.household, data.members, data.preferences, data.feedback);
  const items = bandedItems(data, scan, now);
  if (items.length === 0) return null;
  return recommend(profile, items, recipePool(data));
}

export function householdProfile(data: AppData) {
  if (!data.household) return null;
  return buildProfile(data.household, data.members, data.preferences, data.feedback);
}

export interface ImpactStats {
  mealsCooked: number;
  ingredientsUsed: number;
  gramsRescued: number;
  dollarsSaved: number;
}

/**
 * Impact is built only from what the household told us they actually used, so
 * the numbers stay honest. They are still estimates and are labelled as such.
 */
export function impactStats(data: AppData): ImpactStats {
  const cooked = data.feedback.filter((f) => f.kind === "cooked");
  let grams = 0;
  let dollars = 0;
  let ingredients = 0;

  for (const entry of data.saved) {
    grams += entry.estimatedGrams;
    dollars += entry.estimatedValueUsd;
    ingredients += entry.ingredientNames.length;
  }

  return {
    mealsCooked: cooked.length,
    ingredientsUsed: ingredients,
    gramsRescued: Math.round(grams),
    dollarsSaved: Math.round(dollars * 100) / 100,
  };
}

/**
 * Uses the quantity the household actually entered, priced conservatively.
 * See prices.ts for why every figure errs low.
 */
export function estimateSaved(
  items: { name: string; quantity: string }[],
): { grams: number; usd: number } {
  const { grams, usd } = totalValue(items);
  return { grams, usd };
}

/** Meals rated before we can honestly claim to know a household's taste. */
export const MEALS_FOR_STRONG_SIGNAL = 5;

export interface LearningProgress {
  mealsCooked: number;
  mealsRated: number;
  mealsTurnedDown: number;
  membersWithPreferences: number;
  totalMembers: number;
  /** 0-1, how much we actually have to go on. */
  strength: number;
  stage: "starting-out" | "getting-there" | "knows-you";
  headline: string;
  /** The single most useful thing they could do next, or null if nothing. */
  nextStep: string | null;
}

/**
 * What we know about a household, and what would sharpen it.
 *
 * Deliberately built from things the family did, not from a hidden score:
 * meals rated, meals turned down, and whose preferences are filled in. The
 * point is to be honest about when suggestions are still guesswork.
 */
export function learningProgress(data: AppData): LearningProgress {
  const cooked = data.feedback.filter((f) => f.kind === "cooked");
  const rated = cooked.filter((f) => f.rating !== null);
  const turnedDown = data.feedback.filter(
    (f) => f.kind === "rejected" && f.rejectionReason !== null,
  );

  const totalMembers = data.members.length;
  const membersWithPreferences = data.members.filter((m) => {
    const p = data.preferences.find((pref) => pref.memberId === m.id);
    if (!p) return false;
    return Boolean(
      p.favoriteCuisines.length ||
        p.heatTolerance ||
        p.allergies.length ||
        p.dislikes.length ||
        p.texturePreferences.length,
    );
  }).length;

  // Feedback is worth more than a filled-in form: it's what people actually did.
  const fromPreferences = totalMembers ? (membersWithPreferences / totalMembers) * 0.4 : 0;
  const fromRatings = Math.min(rated.length / MEALS_FOR_STRONG_SIGNAL, 1) * 0.45;
  const fromRejections = Math.min(turnedDown.length / 3, 1) * 0.15;
  const strength = Math.min(1, fromPreferences + fromRatings + fromRejections);

  const stage = strength >= 0.75 ? "knows-you" : strength >= 0.35 ? "getting-there" : "starting-out";

  const remaining = Math.max(0, MEALS_FOR_STRONG_SIGNAL - rated.length);
  const headline =
    stage === "knows-you"
      ? "We've got a good feel for your family"
      : rated.length === 0
        ? "We're still guessing"
        : `${remaining} more meal${remaining === 1 ? "" : "s"} and we'll really know your taste`;

  // Point at whatever is actually missing, biggest gap first.
  let nextStep: string | null = null;
  if (totalMembers === 0) nextStep = "Add the people you cook for";
  else if (membersWithPreferences < totalMembers) {
    const missing = totalMembers - membersWithPreferences;
    nextStep = `Fill in what ${missing === 1 ? "one more person" : `${missing} more people`} likes`;
  } else if (rated.length < MEALS_FOR_STRONG_SIGNAL) {
    nextStep = "Cook something and tell us how it went";
  } else if (turnedDown.length === 0) {
    nextStep = "Tap \u201cNot for us\u201d when a meal misses \u2014 it teaches us fastest";
  }

  return {
    mealsCooked: cooked.length,
    mealsRated: rated.length,
    mealsTurnedDown: turnedDown.length,
    membersWithPreferences,
    totalMembers,
    strength,
    stage,
    headline,
    nextStep,
  };
}

/** True once the household has answered enough to get tailored results. */
export function onboardingComplete(data: AppData): boolean {
  return Boolean(data.household?.onboardingComplete);
}
