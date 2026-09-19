import type { UrgencyBand } from "./types";

/**
 * General fridge/counter life in days for common produce, used only to order
 * what to cook first. This is guidance about typical storage life -- it is not,
 * and must never be presented as, a judgement about whether food is safe to eat.
 */
const SHELF_LIFE_DAYS: Record<string, number> = {
  // Leaves and soft herbs go first.
  "basil": 3,
  "cilantro": 4,
  "parsley": 6,
  "mint": 5,
  "dill": 4,
  "arugula": 4,
  "spinach": 4,
  "lettuce": 6,
  "romaine": 7,
  "kale": 6,
  "chard": 5,
  "bok choy": 6,
  "watercress": 3,
  // Berries and soft fruit.
  "strawberries": 4,
  "raspberries": 3,
  "blueberries": 8,
  "blackberries": 3,
  "grapes": 10,
  "cherries": 6,
  "figs": 3,
  "bananas": 5,
  "avocado": 4,
  "peaches": 5,
  "nectarines": 5,
  "plums": 6,
  "mango": 6,
  "papaya": 5,
  "pineapple": 6,
  // Soft vegetables.
  "mushrooms": 5,
  "asparagus": 4,
  "green beans": 6,
  "snap peas": 6,
  "corn": 4,
  "tomatoes": 6,
  "cherry tomatoes": 8,
  "cucumber": 7,
  "zucchini": 7,
  "summer squash": 7,
  "eggplant": 6,
  "bell pepper": 10,
  "chili pepper": 12,
  "broccoli": 8,
  "cauliflower": 9,
  "celery": 12,
  "green onion": 8,
  "leek": 12,
  "brussels sprouts": 10,
  "cabbage": 21,
  "fennel": 10,
  "pears": 12,
  // Hardy roots and alliums keep longest.
  "carrots": 21,
  "beets": 18,
  "radish": 12,
  "turnip": 18,
  "parsnip": 21,
  "sweet potato": 24,
  "potatoes": 30,
  "onion": 30,
  "shallot": 30,
  "garlic": 60,
  "ginger": 21,
  "butternut squash": 40,
  "pumpkin": 40,
  "apples": 25,
  "oranges": 18,
  "lemons": 21,
  "limes": 18,
};

/** Fallback when we have never heard of the item. Deliberately cautious. */
const DEFAULT_SHELF_LIFE = 7;

export const FRESHNESS_DISCLAIMER =
  "Freshness estimates are general guidance. Examine food carefully and discard anything showing signs of spoilage.";

/** Strips quantities and descriptors so "2 bunches fresh cilantro" matches "cilantro". */
export function canonicalName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\b(fresh|organic|baby|large|small|medium|whole|chopped|bunch|bunches|head|heads|bag|bags|box|punnet|ripe)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (SHELF_LIFE_DAYS[cleaned]) return cleaned;
  // Try the singular form, then a containment match ("roma tomatoes" -> "tomatoes").
  const singular = cleaned.replace(/(ies)$/, "y").replace(/s$/, "");
  if (SHELF_LIFE_DAYS[singular]) return singular;
  const known = Object.keys(SHELF_LIFE_DAYS).find(
    (k) => cleaned.includes(k) || k.includes(cleaned),
  );
  return known ?? cleaned;
}

export function shelfLifeDays(name: string): number {
  return SHELF_LIFE_DAYS[canonicalName(name)] ?? DEFAULT_SHELF_LIFE;
}

/** Whole days elapsed between two ISO dates, floored at 0. */
export function daysSince(purchasedOn: string | null, now = new Date()): number {
  if (!purchasedOn) return 0;
  const then = new Date(`${purchasedOn}T00:00:00`);
  if (Number.isNaN(then.getTime())) return 0;
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export interface FreshnessEstimate {
  band: UrgencyBand;
  daysLeft: number;
  /** 0 = just bought, 1 = at the end of its typical life. */
  fractionElapsed: number;
}

export function estimateFreshness(
  name: string,
  purchasedOn: string | null,
  now = new Date(),
): FreshnessEstimate {
  const total = shelfLifeDays(name);
  const elapsed = daysSince(purchasedOn, now);
  const daysLeft = Math.max(0, total - elapsed);
  const fractionElapsed = total === 0 ? 1 : Math.min(1, elapsed / total);

  // Band on days remaining, which is what actually decides what to cook tonight.
  let band: UrgencyBand;
  if (daysLeft <= 3) band = "use-first";
  else if (daysLeft <= 7) band = "use-soon";
  else band = "can-wait";

  return { band, daysLeft, fractionElapsed };
}

export const BAND_LABELS: Record<UrgencyBand, string> = {
  "use-first": "Use first",
  "use-soon": "Use soon",
  "can-wait": "Can wait",
};

export const BAND_BLURB: Record<UrgencyBand, string> = {
  "use-first": "Best cooked in the next couple of days.",
  "use-soon": "Good for about a week.",
  "can-wait": "Keeps for a while yet.",
};

export const BAND_ORDER: UrgencyBand[] = ["use-first", "use-soon", "can-wait"];

/** Rough retail weight and value per unit of produce, for the impact estimates. */
const TYPICAL_ITEM: Record<string, { grams: number; usd: number }> = {
  spinach: { grams: 280, usd: 3.5 },
  cilantro: { grams: 60, usd: 1.5 },
  mushrooms: { grams: 230, usd: 3.0 },
  zucchini: { grams: 200, usd: 1.2 },
  carrots: { grams: 450, usd: 1.8 },
  broccoli: { grams: 350, usd: 2.4 },
  "bell pepper": { grams: 150, usd: 1.5 },
  tomatoes: { grams: 400, usd: 3.0 },
  potatoes: { grams: 900, usd: 2.5 },
  onion: { grams: 200, usd: 0.9 },
  kale: { grams: 200, usd: 2.8 },
  cauliflower: { grams: 600, usd: 3.5 },
  "sweet potato": { grams: 350, usd: 1.8 },
  eggplant: { grams: 450, usd: 2.2 },
  "green beans": { grams: 300, usd: 2.6 },
};

const DEFAULT_ITEM = { grams: 250, usd: 2.0 };

export function typicalItemValue(name: string): { grams: number; usd: number } {
  return TYPICAL_ITEM[canonicalName(name)] ?? DEFAULT_ITEM;
}
