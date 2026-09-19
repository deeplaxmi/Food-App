/**
 * Core data entities. These mirror the tables in supabase/schema.sql one-for-one
 * so the on-device adapter and the Supabase adapter stay interchangeable.
 */

export type HeatTolerance = "none" | "mild" | "medium" | "hot";

export const HEAT_LEVELS: HeatTolerance[] = ["none", "mild", "medium", "hot"];

export const HEAT_LABELS: Record<HeatTolerance, string> = {
  none: "No heat",
  mild: "Mild",
  medium: "Medium",
  hot: "Hot",
};

/** Texture / preparation preferences, kept as a fixed vocabulary so we can rank on them. */
export type TexturePreference =
  | "no-visible-onions"
  | "veg-blended-into-sauces"
  | "roasted-not-steamed"
  | "sauce-on-the-side"
  | "no-mixed-textures"
  | "finger-food";

export const TEXTURE_OPTIONS: { id: TexturePreference; label: string }[] = [
  { id: "no-visible-onions", label: "No visible onions" },
  { id: "veg-blended-into-sauces", label: "Vegetables blended into sauces" },
  { id: "roasted-not-steamed", label: "Roasted rather than steamed" },
  { id: "sauce-on-the-side", label: "Sauce served separately" },
  { id: "no-mixed-textures", label: "Keeps components separate" },
  { id: "finger-food", label: "Easy to eat with hands" },
];

export interface User {
  id: string;
  email: string | null;
  createdAt: string;
}

export interface Household {
  id: string;
  userId: string;
  name: string;
  /** Explicitly confirmed that nobody here has a food allergy. */
  allergiesConfirmedNone?: boolean;
  adults: number;
  children: number;
  /** Minutes available to cook on a weeknight. */
  maxWeeknightMinutes: number;
  pantryStaples: string[];
  onboardingComplete: boolean;
  createdAt: string;
}

/**
 * Age matters for more than portion size. Under-ones must not have honey,
 * and small children need choking hazards handled differently, so this drives
 * safety rules rather than just wording.
 */
export type AgeStage = "baby" | "toddler" | "child" | "teen" | "adult";

export const AGE_STAGES: { id: AgeStage; label: string; hint: string }[] = [
  { id: "baby", label: "Baby", hint: "Under 1" },
  { id: "toddler", label: "Toddler", hint: "1 to 3" },
  { id: "child", label: "Child", hint: "4 to 12" },
  { id: "teen", label: "Teen", hint: "13 to 17" },
  { id: "adult", label: "Adult", hint: "18+" },
];

export const AGE_STAGE_LABELS: Record<AgeStage, string> = {
  baby: "Baby",
  toddler: "Toddler",
  child: "Child",
  teen: "Teen",
  adult: "Adult",
};

export interface HouseholdMember {
  id: string;
  householdId: string;
  name: string;
  isChild: boolean;
  /** Null when they haven't told us; falls back to isChild for sizing. */
  ageStage: AgeStage | null;
  createdAt: string;
}

/**
 * One preference row per member. Split out from the member so it can be edited
 * independently and so a member can be added without answering anything yet.
 */
export interface Preference {
  id: string;
  memberId: string;
  favoriteCuisines: string[];
  heatTolerance: HeatTolerance | null;
  /** Hard exclusions: allergies and medical dietary restrictions. */
  allergies: string[];
  dietaryRestrictions: string[];
  /** Soft signals: ranked against, never excluded on. */
  dislikes: string[];
  texturePreferences: TexturePreference[];
}

export type ScanSource = "camera" | "upload" | "sample";

export interface ProduceScan {
  id: string;
  householdId: string;
  source: ScanSource;
  photoCount: number;
  /** ISO date the produce was bought, if the user knew it. */
  purchasedOn: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export type Confidence = "high" | "medium" | "low";

export interface DetectedIngredient {
  id: string;
  scanId: string;
  name: string;
  /** Free-text estimate, e.g. "1 bunch", "3 medium". */
  quantity: string;
  confidence: Confidence;
  /** True when the user typed it in rather than the vision model finding it. */
  addedByUser: boolean;
  removed: boolean;
}

export type UrgencyBand = "use-first" | "use-soon" | "can-wait";

export interface Recipe {
  id: string;
  title: string;
  cuisine: string;
  /** Minutes from starting to on the table. */
  totalMinutes: number;
  difficulty: "easy" | "medium";
  heatLevel: HeatTolerance;
  /** Canonical produce names this recipe uses meaningfully. */
  produceUsed: { name: string; amount: string }[];
  /** Everything else the recipe needs. */
  otherIngredients: { name: string; amount: string; pantry: boolean }[];
  steps: string[];
  servesAdults: number;
  texturePreferences: TexturePreference[];
  /** Dietary tags this recipe satisfies, e.g. "vegetarian", "gluten-free". */
  dietaryTags: string[];
  /** Every allergen that appears, for hard exclusion. */
  containsAllergens: string[];
  /** Broad shape, used to avoid recommending three stir-fries. */
  form: "traybake" | "curry" | "pasta" | "rice-bowl" | "handheld" | "salad" | "soup" | "stir-fry" | "braise" | "bake";
  source: "library" | "ai-generated";
  sourceNote: string;
  imageUrl?: string;
}

export type RecommendationSlot = "best-match" | "fastest" | "saves-most";

export interface Recommendation {
  id: string;
  scanId: string;
  householdId: string;
  recipeId: string;
  slot: RecommendationSlot;
  /** Human-readable "Why this works for your family". */
  why: string;
  /** Which specific preferences were taken into account. */
  preferencesConsidered: string[];
  producedUsedNames: string[];
  createdAt: string;
}

export type RejectionReason =
  | "too-spicy"
  | "wrong-cuisine"
  | "too-much-work"
  | "disliked-ingredient"
  | "texture-problem"
  | "kids-wont-eat"
  | "missing-ingredients"
  | "not-in-the-mood"
  | "other";

export const REJECTION_REASONS: { id: RejectionReason; label: string }[] = [
  { id: "too-spicy", label: "Too spicy" },
  { id: "wrong-cuisine", label: "Wrong cuisine" },
  { id: "too-much-work", label: "Too much work" },
  { id: "disliked-ingredient", label: "Someone dislikes an ingredient" },
  { id: "texture-problem", label: "Texture problem" },
  { id: "kids-wont-eat", label: "The kids won't eat it" },
  { id: "missing-ingredients", label: "Missing too many ingredients" },
  { id: "not-in-the-mood", label: "Not in the mood for this" },
  { id: "other", label: "Something else" },
];

export interface MealFeedback {
  id: string;
  householdId: string;
  recipeId: string;
  recommendationId: string | null;
  kind: "rejected" | "cooked";
  /** Set when kind === "rejected". */
  rejectionReason: RejectionReason | null;
  rejectionNote: string | null;
  /** Set when kind === "cooked". */
  ateIt: string[];
  rating: number | null;
  spiceLevelRight: "too-mild" | "just-right" | "too-spicy" | null;
  wouldMakeAgain: boolean | null;
  hadLeftovers: boolean | null;
  createdAt: string;
}

export interface RemainingIngredient {
  id: string;
  householdId: string;
  feedbackId: string;
  name: string;
  createdAt: string;
}

export interface EstimatedFoodSaved {
  id: string;
  householdId: string;
  feedbackId: string;
  /** Produce names the household reported using. */
  ingredientNames: string[];
  estimatedGrams: number;
  estimatedValueUsd: number;
  createdAt: string;
}

/** The full on-device / per-household document. */
export interface AppData {
  user: User | null;
  household: Household | null;
  members: HouseholdMember[];
  preferences: Preference[];
  scans: ProduceScan[];
  detected: DetectedIngredient[];
  recipes: Recipe[];
  recommendations: Recommendation[];
  feedback: MealFeedback[];
  remaining: RemainingIngredient[];
  saved: EstimatedFoodSaved[];
}

export const EMPTY_DATA: AppData = {
  user: null,
  household: null,
  members: [],
  preferences: [],
  scans: [],
  detected: [],
  recipes: [],
  recommendations: [],
  feedback: [],
  remaining: [],
  saved: [],
};
