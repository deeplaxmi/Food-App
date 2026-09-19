import { BAND_ORDER, estimateFreshness, typicalItemValue } from "./freshness";
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

export function estimateSaved(names: string[]): { grams: number; usd: number } {
  return names.reduce(
    (acc, name) => {
      const { grams, usd } = typicalItemValue(name);
      return { grams: acc.grams + grams, usd: acc.usd + usd };
    },
    { grams: 0, usd: 0 },
  );
}

/** True once the household has answered enough to get tailored results. */
export function onboardingComplete(data: AppData): boolean {
  return Boolean(data.household?.onboardingComplete);
}
