/**
 * Independent allergen derivation.
 *
 * The rule here is that we never trust a recipe's own `containsAllergens`
 * field -- not the hand-written library, not anything an AI wrote, not anything
 * a third-party recipe API returns. Allergens are derived from the ingredient
 * list against this curated map, and that derivation is what the gate uses.
 *
 * Two failure modes matter, and they are not symmetric:
 *   - A recognised allergen in an ingredient BLOCKS the recipe outright.
 *   - An ingredient we do not recognise is reported as UNVERIFIED, so the
 *     household is told plainly that we could not check it.
 *
 * Nothing is ever silently assumed safe.
 */

export type Allergen =
  | "dairy"
  | "egg"
  | "gluten"
  | "peanut"
  | "tree-nut"
  | "soy"
  | "fish"
  | "shellfish"
  | "sesame";

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  dairy: "dairy",
  egg: "egg",
  gluten: "gluten",
  peanut: "peanuts",
  "tree-nut": "tree nuts",
  soy: "soy",
  fish: "fish",
  shellfish: "shellfish",
  sesame: "sesame",
};

/** How people actually write an allergy, mapped to what we check for. */
const USER_ALLERGY_ALIASES: Record<string, Allergen[]> = {
  dairy: ["dairy"], milk: ["dairy"], lactose: ["dairy"], cheese: ["dairy"],
  "milk protein": ["dairy"], casein: ["dairy"],
  egg: ["egg"], eggs: ["egg"],
  gluten: ["gluten"], wheat: ["gluten"], celiac: ["gluten"], coeliac: ["gluten"],
  peanut: ["peanut"], peanuts: ["peanut"],
  "tree nut": ["tree-nut"], "tree nuts": ["tree-nut"],
  nut: ["tree-nut", "peanut"], nuts: ["tree-nut", "peanut"],
  almond: ["tree-nut"], almonds: ["tree-nut"], cashew: ["tree-nut"],
  cashews: ["tree-nut"], walnut: ["tree-nut"], walnuts: ["tree-nut"],
  pecan: ["tree-nut"], pistachio: ["tree-nut"], hazelnut: ["tree-nut"],
  soy: ["soy"], soya: ["soy"], soybean: ["soy"],
  fish: ["fish"], seafood: ["fish", "shellfish"],
  shellfish: ["shellfish"], shrimp: ["shellfish"], prawn: ["shellfish"],
  prawns: ["shellfish"], crab: ["shellfish"], lobster: ["shellfish"],
  sesame: ["sesame"], tahini: ["sesame"],
};

/**
 * Ingredient -> allergens. Longer phrases are matched first and consumed, so
 * "coconut milk" never falls through to the "milk" rule.
 *
 * An entry mapping to [] means "recognised, and carries none of the allergens
 * we track" -- that is what keeps it out of the unverified list.
 */
const INGREDIENT_RULES: Record<string, Allergen[]> = {
  // --- Things that look like an allergen but are not -------------------
  "coconut milk": [], "coconut cream": [], "coconut oil": [], coconut: [],
  "peanut butter": ["peanut"],
  "almond milk": ["tree-nut"], "oat milk": ["gluten"], "soy milk": ["soy"],
  eggplant: [], aubergine: [],
  "rice noodles": [], "wide rice noodles": [], "rice noodle": [],
  "corn tortillas": [], "corn tortilla": [],
  "butter beans": [], "butternut squash": [], "buttercup squash": [],
  "butter lettuce": [], "shea butter": [],
  "cocoa butter": [], "milk thistle": [],

  // --- Dairy -----------------------------------------------------------
  butter: ["dairy"], ghee: ["dairy"], "butter or ghee": ["dairy"],
  cream: ["dairy"], "heavy cream": ["dairy"], "sour cream": ["dairy"],
  "double cream": ["dairy"], "creme fraiche": ["dairy"],
  "heavy cream or coconut cream": ["dairy"],
  "sour cream or avocado": ["dairy"],
  milk: ["dairy"], yogurt: ["dairy"], "plain yogurt": ["dairy"],
  yoghurt: ["dairy"], cheese: ["dairy"], paneer: ["dairy"],
  ricotta: ["dairy"], mozzarella: ["dairy"], parmesan: ["dairy"],
  parmigiano: ["dairy"], pecorino: ["dairy"], feta: ["dairy"],
  cheddar: ["dairy"], cotija: ["dairy"], "monterey jack": ["dairy"],
  "cheddar or cotija": ["dairy"], "sharp cheddar or monterey jack": ["dairy"],
  halloumi: ["dairy"], mascarpone: ["dairy"], "cream cheese": ["dairy"],
  "blue cheese": ["dairy"], gruyere: ["dairy"], "goat cheese": ["dairy"],

  // --- Egg -------------------------------------------------------------
  egg: ["egg"], eggs: ["egg"], mayonnaise: ["egg"], mayo: ["egg"],
  aioli: ["egg"], meringue: ["egg"],

  // --- Gluten ----------------------------------------------------------
  flour: ["gluten"], "all-purpose flour": ["gluten"], "plain flour": ["gluten"],
  breadcrumbs: ["gluten"], bread: ["gluten"], "crusty bread": ["gluten"],
  pasta: ["gluten"], "small pasta": ["gluten"], spaghetti: ["gluten"],
  penne: ["gluten"], rigatoni: ["gluten"], "rigatoni or penne": ["gluten"],
  pappardelle: ["gluten"], tagliatelle: ["gluten"],
  "pappardelle or tagliatelle": ["gluten"], orzo: ["gluten"],
  lasagne: ["gluten"], lasagna: ["gluten"], couscous: ["gluten"],
  "flour tortillas": ["gluten"], "flour tortilla": ["gluten"],
  tortillas: ["gluten"], tortilla: ["gluten"],
  naan: ["gluten"], flatbread: ["gluten"], pita: ["gluten"],
  gnocchi: ["gluten"], "potato gnocchi": ["gluten"],
  udon: ["gluten"], soba: ["gluten"], "udon or soba noodles": ["gluten"],
  "egg noodles": ["gluten", "egg"], barley: ["gluten"], farro: ["gluten"],
  seitan: ["gluten"], "puff pastry": ["gluten"], filo: ["gluten"],
  "phyllo pastry": ["gluten"], "pizza dough": ["gluten"],

  // --- Soy (and the soy sauces, which carry wheat too) -----------------
  soy: ["soy"], "soy sauce": ["soy", "gluten"],
  "light soy sauce": ["soy", "gluten"], "dark soy sauce": ["soy", "gluten"],
  tamari: ["soy"], tofu: ["soy"], "firm tofu": ["soy"],
  "firm tofu or chicken thigh": ["soy"],
  edamame: ["soy"], "shelled edamame": ["soy"],
  miso: ["soy"], "white miso paste": ["soy"], "miso paste": ["soy"],
  tempeh: ["soy"], "hoisin sauce": ["soy", "gluten"],
  "teriyaki sauce": ["soy", "gluten"],

  // --- Fish and shellfish, including the hidden ones --------------------
  fish: ["fish"], anchovy: ["fish"], anchovies: ["fish"],
  "fish sauce": ["fish"], "fish sauce or soy sauce": ["fish", "soy", "gluten"],
  "worcestershire sauce": ["fish"], worcestershire: ["fish"],
  "caesar dressing": ["fish", "egg", "dairy"],
  "oyster sauce": ["shellfish", "soy", "gluten"],
  shrimp: ["shellfish"], prawns: ["shellfish"], "shrimp paste": ["shellfish"],
  crab: ["shellfish"], lobster: ["shellfish"], scallops: ["shellfish"],
  mussels: ["shellfish"], clams: ["shellfish"], squid: ["shellfish"],
  // Thai curry pastes and kimchi conventionally contain shrimp paste or fish
  // sauce. Treating them as containing both is the safe reading.
  "red curry paste": ["shellfish", "fish"],
  "green curry paste": ["shellfish", "fish"],
  "yellow curry paste": ["shellfish", "fish"],
  "thai curry paste": ["shellfish", "fish"],
  kimchi: ["fish", "shellfish"],
  "xo sauce": ["shellfish", "fish"],

  // --- Nuts and sesame --------------------------------------------------
  peanuts: ["peanut"], "roasted peanuts": ["peanut"], peanut: ["peanut"],
  almonds: ["tree-nut"], almond: ["tree-nut"], marzipan: ["tree-nut"],
  cashews: ["tree-nut"], cashew: ["tree-nut"], walnuts: ["tree-nut"],
  pecans: ["tree-nut"], pistachios: ["tree-nut"], hazelnuts: ["tree-nut"],
  "pine nuts": ["tree-nut"], pesto: ["tree-nut", "dairy"],
  "nutritional yeast": [],
  sesame: ["sesame"], "sesame oil": ["sesame"], "sesame seeds": ["sesame"],
  tahini: ["sesame"], hummus: ["sesame"],

  // --- Recognised and free of everything we track -----------------------
  spinach: [], carrots: [], carrot: [], zucchini: [], courgette: [],
  mushrooms: [], cilantro: [], coriander: [], parsley: [], basil: [],
  broccoli: [], cauliflower: [], cabbage: [], celery: [], potatoes: [],
  potato: [], onion: [], "green onion": [], shallot: [], garlic: [],
  "garlic powder": [], ginger: [], lemon: [], lime: [], tomatoes: [],
  "cherry tomatoes": [], "canned chopped tomatoes": [],
  "canned crushed tomatoes": [], "bell pepper": [], "green beans": [],
  chickpeas: [], "black beans": [], "cannellini beans": [],
  "red lentils": [], lentils: [], rice: [], "jasmine rice": [],
  "long-grain rice": [], polenta: [], cornmeal: [], quinoa: [],
  "olive oil": [], "neutral oil": [], "vegetable oil": [], salt: [],
  pepper: [], "salt and pepper": [], sugar: [], "brown sugar": [],
  honey: [], "maple syrup": [], "honey or maple syrup": [],
  "vegetable stock": [], "chicken stock": [], "cumin seeds": [],
  "ground cumin": [], "ground coriander": [], "ground turmeric": [],
  "garam masala": [], "smoked paprika": [], paprika: [],
  "dried oregano": [], "dried thyme": [], "chili flakes": [],
  "chicken thighs": [], chicken: [], beef: [], pork: [], lamb: [],
  avocado: [], "butternut squash ": [], water: [],
};

/** Words that carry no meaning for matching and are stripped first. */
const NOISE = new Set([
  "fresh", "freshly", "organic", "large", "small", "medium", "whole", "ripe",
  "chopped", "sliced", "diced", "grated", "minced", "shredded", "crumbled",
  "torn", "julienned", "cubed", "drained", "rinsed", "cooked", "uncooked",
  "raw", "of", "the", "a", "an", "and", "or", "to", "serve", "for", "taste",
  "plus", "extra", "optional", "frozen", "canned", "tinned", "jarred",
  "roughly", "finely", "thinly", "coarsely", "good", "quality", "best",
]);

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Phrases checked longest-first so specific rules beat generic ones. */
const RULE_PHRASES = Object.keys(INGREDIENT_RULES).sort(
  (a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length,
);

export interface IngredientVerdict {
  ingredient: string;
  allergens: Allergen[];
  /** True when no rule matched any part of the name. */
  unverified: boolean;
}

/**
 * Derives allergens for one ingredient string. Matches whole words only, so an
 * egg allergy no longer trips on "eggplant", and consumes matched phrases so
 * "coconut milk" cannot also register as dairy.
 */
export function deriveForIngredient(raw: string): IngredientVerdict {
  let text = ` ${normalise(raw)} `;
  const stripped = text
    .split(" ")
    .filter((w) => w && !NOISE.has(w))
    .join(" ");
  text = ` ${stripped} `;

  const found = new Set<Allergen>();
  let matchedAnything = false;

  for (const phrase of RULE_PHRASES) {
    const needle = ` ${phrase} `;
    if (!text.includes(needle)) continue;
    matchedAnything = true;
    for (const a of INGREDIENT_RULES[phrase]) found.add(a);
    // Consume it so its component words can't match a broader rule.
    text = text.split(needle).join(" ");
  }

  return {
    ingredient: raw,
    allergens: [...found],
    unverified: !matchedAnything,
  };
}

/** Turns what a person typed into the set of allergens we check for. */
export function parseUserAllergies(entries: string[]): Set<Allergen> {
  const out = new Set<Allergen>();
  for (const entry of entries) {
    const key = normalise(entry);
    if (!key) continue;
    const direct = USER_ALLERGY_ALIASES[key];
    if (direct) {
      for (const a of direct) out.add(a);
      continue;
    }
    // Fall back to deriving from it as though it were an ingredient, so
    // "shrimp paste" or "parmesan" still resolve to something sensible.
    for (const a of deriveForIngredient(entry).allergens) out.add(a);
  }
  return out;
}

export interface AllergenReport {
  /** Allergens we positively identified, with the ingredient that carries them. */
  hits: { ingredient: string; allergen: Allergen }[];
  /** Ingredients no rule recognised -- we cannot vouch for these. */
  unverified: string[];
  /** All allergens derived from the ingredient list. */
  derived: Set<Allergen>;
}

export function analyseIngredients(
  ingredients: string[],
  against: Set<Allergen>,
): AllergenReport {
  const hits: { ingredient: string; allergen: Allergen }[] = [];
  const unverified: string[] = [];
  const derived = new Set<Allergen>();

  for (const ingredient of ingredients) {
    const verdict = deriveForIngredient(ingredient);
    for (const a of verdict.allergens) {
      derived.add(a);
      if (against.has(a)) hits.push({ ingredient, allergen: a });
    }
    if (verdict.unverified) unverified.push(ingredient);
  }

  return { hits, unverified, derived };
}
