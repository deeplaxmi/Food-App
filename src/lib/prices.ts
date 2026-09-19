import { canonicalName } from "./freshness";

/**
 * Impact estimates.
 *
 * Two deliberate rules here, because a confident-looking number that isn't
 * earned is the same failure as a plausible recipe nobody has cooked:
 *
 *  1. Every price is a CONSERVATIVE floor -- the low end of ordinary retail.
 *     We would rather tell a family they saved less than they did.
 *  2. We use the quantity they actually told us, not a fixed guess per item.
 *
 * PROVENANCE: the per-kilo figures below are approximate low-end US retail,
 * not a sourced dataset. They are structured for a drop-in replacement from
 * USDA ERS "Fruit and Vegetable Prices" (average retail price per pound,
 * ~150 items, published free). Swap PRICE_PER_KG for that table and set
 * `sourced` to true; nothing else needs to change.
 */
export const PRICES_ARE_SOURCED = false;

/** Conservative US retail, USD per kilogram. Deliberately at the low end. */
const PRICE_PER_KG: Record<string, number> = {
  // Roots, alliums, hardy things -- cheap per kilo.
  potatoes: 2.2, "sweet potato": 2.5, carrots: 1.8, onion: 2.0, shallot: 5.0,
  cabbage: 1.8, beets: 2.5, turnip: 2.2, parsnip: 3.0, radish: 3.5,
  "butternut squash": 2.2, pumpkin: 2.0,
  // Everyday vegetables.
  zucchini: 3.5, cucumber: 3.0, tomatoes: 4.0, "cherry tomatoes": 6.0,
  "bell pepper": 5.0, eggplant: 4.0, broccoli: 4.0, cauliflower: 3.5,
  celery: 3.0, "green beans": 6.0, "snap peas": 7.0, corn: 3.0,
  "brussels sprouts": 5.0, leek: 4.0, "green onion": 5.0, mushrooms: 7.0,
  asparagus: 9.0, "bok choy": 4.0, chard: 6.0,
  // Leaves and herbs -- light, so per kilo looks high but per bunch is small.
  spinach: 8.0, kale: 6.0, lettuce: 4.0, romaine: 4.0, arugula: 12.0,
  cilantro: 6.0, parsley: 6.0, basil: 20.0, mint: 20.0, dill: 12.0,
  watercress: 12.0,
  // Fruit.
  bananas: 1.5, oranges: 2.5, apples: 3.0, pineapple: 2.0, melon: 2.0,
  peaches: 4.0, nectarines: 4.0, plums: 4.0, grapes: 6.0, mango: 4.0,
  papaya: 3.0, avocado: 6.0, lemons: 3.5, limes: 3.5, pears: 3.0,
  strawberries: 8.0, blueberries: 14.0, raspberries: 20.0,
  blackberries: 18.0, cherries: 10.0, figs: 14.0,
  // Aromatics sold in small amounts.
  garlic: 8.0, ginger: 8.0, "chili pepper": 8.0,
};

/** Conservative fallback when we don't recognise the item. */
const DEFAULT_PRICE_PER_KG = 3.0;

/** Typical weight in grams of one piece of something. */
const PIECE_GRAMS: Record<string, number> = {
  avocado: 170, peaches: 150, nectarines: 150, plums: 60, oranges: 130,
  apples: 180, pears: 175, bananas: 120, lemons: 85, limes: 65, mango: 200,
  papaya: 500, carrots: 70, potatoes: 170, "sweet potato": 130, onion: 110,
  shallot: 30, tomatoes: 120, "bell pepper": 120, zucchini: 200,
  cucumber: 300, eggplant: 450, corn: 90, leek: 90, beets: 110,
  turnip: 120, parsnip: 110, radish: 15, "chili pepper": 15,
  "butternut squash": 1100, pumpkin: 1500, melon: 1200, pineapple: 900,
};

/** Weight in grams of a typical bunch, bag, head, punnet or similar. */
const CONTAINER_GRAMS: Record<string, Record<string, number>> = {
  bunch: {
    cilantro: 60, parsley: 60, basil: 25, mint: 25, dill: 30, kale: 200,
    chard: 250, spinach: 150, "green onion": 100, asparagus: 450,
    carrots: 450, beets: 400, radish: 150, celery: 500,
  },
  bag: { spinach: 280, lettuce: 140, arugula: 140, kale: 200, potatoes: 2300, carrots: 900 },
  head: { broccoli: 350, cauliflower: 600, cabbage: 900, lettuce: 300, romaine: 400, garlic: 50 },
  punnet: { mushrooms: 230, strawberries: 450, blueberries: 170, raspberries: 170, blackberries: 170, "cherry tomatoes": 250 },
};

const DEFAULT_PIECE_GRAMS = 150;
const DEFAULT_CONTAINER_GRAMS = 250;

const OZ_TO_G = 28.3495;
const LB_TO_G = 453.592;

/**
 * Works out a weight from what the user typed. Handles the three shapes people
 * actually write: an explicit weight, a count of pieces, or a container.
 * Deliberately returns the SMALLER reading when a string could mean either.
 */
export function gramsFor(name: string, quantity: string): number {
  const key = canonicalName(name);
  const text = quantity.toLowerCase().trim();

  // "10 oz", "280 g", "1.5 lb", "1 large bag (about 10 oz)"
  const weight = /(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|oz|ounces?|lbs?|pounds?)\b/.exec(text);
  if (weight) {
    const value = parseFloat(weight[1]);
    const unit = weight[2];
    if (unit.startsWith("kg") || unit.startsWith("kilo")) return value * 1000;
    if (unit.startsWith("g")) return value;
    if (unit.startsWith("oz") || unit.startsWith("ounce")) return value * OZ_TO_G;
    return value * LB_TO_G;
  }

  const countMatch = /(\d+(?:\.\d+)?)/.exec(text);
  const count = countMatch ? parseFloat(countMatch[1]) : 1;

  // A container word only means "count containers" when the number is counting
  // them: "2 bags", "1 punnet". People also write "3 in a net bag", where the
  // number counts what is INSIDE. Reading that as three bags roughly triples
  // the estimate, so check which shape it is before trusting the count.
  const countsPieces = /\d[^.]*\bin\s+(a|an|one|the)?\s*\w*\s*(bag|bunch|head|punnet|box|carton|pack|tub|clamshell|container)/.test(
    text,
  );

  if (!countsPieces) {
    for (const [container, table] of Object.entries(CONTAINER_GRAMS)) {
      if (text.includes(container)) {
        return count * (table[key] ?? DEFAULT_CONTAINER_GRAMS);
      }
    }
    // Container words we have no table for.
    if (/\b(box|carton|pack|tub|clamshell|container)\b/.test(text)) {
      return count * DEFAULT_CONTAINER_GRAMS;
    }
  }

  return count * (PIECE_GRAMS[key] ?? DEFAULT_PIECE_GRAMS);
}

export interface ItemValue {
  grams: number;
  usd: number;
  /** False when we fell back to a default rather than a known figure. */
  recognised: boolean;
}

export function valueOf(name: string, quantity: string): ItemValue {
  const key = canonicalName(name);
  const perKg = PRICE_PER_KG[key];
  const grams = gramsFor(name, quantity);
  // Floor to the cent, so rounding never inflates the claim.
  const usd = Math.floor((grams / 1000) * (perKg ?? DEFAULT_PRICE_PER_KG) * 100) / 100;
  return { grams: Math.round(grams), usd, recognised: perKg !== undefined };
}

export function totalValue(items: { name: string; quantity: string }[]): {
  grams: number;
  usd: number;
  allRecognised: boolean;
} {
  return items.reduce<{ grams: number; usd: number; allRecognised: boolean }>(
    (acc, item) => {
      const v = valueOf(item.name, item.quantity);
      return {
        grams: acc.grams + v.grams,
        usd: Math.round((acc.usd + v.usd) * 100) / 100,
        allRecognised: acc.allRecognised && v.recognised,
      };
    },
    { grams: 0, usd: 0, allRecognised: true },
  );
}
