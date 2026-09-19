import { EMPTY_DATA, type AppData } from "./types";

const now = new Date();
const iso = (d: Date) => d.toISOString();
/** Local calendar date, so "bought 2 days ago" lines up with the user's day. */
const dateOnly = (daysAgo: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The first-run demo: a family of four who like Indian, Thai, Italian and
 * Mexican food, eat mild only, and have 30 weeknight minutes. One child dislikes
 * mushrooms and one won't eat visible onions.
 */
export function buildDemoData(): AppData {
  const householdId = "demo-household";
  const scanId = "demo-scan";

  const members = [
    { id: "m-priya", name: "Priya", isChild: false },
    { id: "m-sam", name: "Sam", isChild: false },
    { id: "m-arjun", name: "Arjun", isChild: true },
    { id: "m-mira", name: "Mira", isChild: true },
  ];

  const cuisines = ["Indian", "Thai", "Italian", "Mexican"];

  return {
    ...EMPTY_DATA,
    user: { id: "demo-user", email: null, createdAt: iso(now) },
    household: {
      id: householdId,
      userId: "demo-user",
      name: "The Sharma-Reids",
      adults: 2,
      children: 2,
      maxWeeknightMinutes: 30,
      pantryStaples: [
        "olive oil", "neutral oil", "salt", "pepper", "rice", "pasta", "garlic",
        "onion", "ginger", "ground cumin", "ground coriander", "ground turmeric",
        "garam masala", "smoked paprika", "dried oregano", "dried thyme",
        "soy sauce", "coconut milk", "canned chopped tomatoes", "chickpeas",
        "black beans", "vegetable stock", "sugar", "brown sugar",
      ],
      onboardingComplete: true,
      createdAt: iso(now),
    },
    members: members.map((m) => ({
      id: m.id,
      householdId,
      name: m.name,
      isChild: m.isChild,
      createdAt: iso(now),
    })),
    preferences: [
      {
        id: "p-priya", memberId: "m-priya", favoriteCuisines: cuisines,
        heatTolerance: "mild", allergies: [], dietaryRestrictions: [],
        dislikes: [], texturePreferences: [],
      },
      {
        id: "p-sam", memberId: "m-sam", favoriteCuisines: cuisines,
        heatTolerance: "mild", allergies: [], dietaryRestrictions: [],
        dislikes: [], texturePreferences: ["roasted-not-steamed"],
      },
      {
        id: "p-arjun", memberId: "m-arjun", favoriteCuisines: ["Italian", "Mexican"],
        heatTolerance: "mild", allergies: [], dietaryRestrictions: [],
        dislikes: ["mushrooms"], texturePreferences: [],
      },
      {
        id: "p-mira", memberId: "m-mira", favoriteCuisines: ["Indian", "Italian"],
        heatTolerance: "mild", allergies: [], dietaryRestrictions: [],
        dislikes: [], texturePreferences: ["no-visible-onions"],
      },
    ],
    scans: [
      {
        id: scanId,
        householdId,
        source: "sample",
        photoCount: 1,
        purchasedOn: dateOnly(3),
        confirmedAt: iso(now),
        createdAt: iso(now),
      },
    ],
    detected: [
      { id: "d-spinach", scanId, name: "Spinach", quantity: "1 large bag (about 10 oz)", confidence: "high", addedByUser: false, removed: false },
      { id: "d-mushrooms", scanId, name: "Mushrooms", quantity: "1 punnet (about 8 oz)", confidence: "high", addedByUser: false, removed: false },
      { id: "d-zucchini", scanId, name: "Zucchini", quantity: "3 medium", confidence: "high", addedByUser: false, removed: false },
      { id: "d-carrots", scanId, name: "Carrots", quantity: "6 medium", confidence: "medium", addedByUser: false, removed: false },
      { id: "d-cilantro", scanId, name: "Cilantro", quantity: "1 bunch", confidence: "medium", addedByUser: false, removed: false },
    ],
  };
}

export const DEMO_SCAN_ID = "demo-scan";
