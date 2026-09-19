import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODEL, firstText, getAnthropic, isAiConfigured } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fallback only: used when the curated library cannot fill all three slots for
 * an unusual set of produce. Everything returned here is labelled as
 * AI-generated in the UI.
 */
const SYSTEM = `You write straightforward family dinner recipes.

Hard rules, in order of importance:
1. NEVER include an ingredient from the "must not contain" list, in any form or amount. This covers allergies and medical dietary restrictions. If you cannot write a recipe without them, return an empty list instead.
2. Give complete, real quantities for every ingredient and steps someone can actually follow.
3. Do not give food-safety, storage or reheating advice, and never suggest that questionable produce is fine to use.
4. Respect the stated heat tolerance and the cooking time limit.
5. Use a meaningful amount of the listed produce -- a garnish does not count.

Write the way a good home cook talks: plain, specific, no marketing. Avoid defaulting to a generic stir-fry, soup or smoothie unless it is genuinely the best fit.`;

const SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          cuisine: { type: "string" },
          totalMinutes: { type: "integer" },
          difficulty: { type: "string", enum: ["easy", "medium"] },
          heatLevel: { type: "string", enum: ["none", "mild", "medium", "hot"] },
          form: {
            type: "string",
            enum: ["traybake", "curry", "pasta", "rice-bowl", "handheld", "salad", "soup", "stir-fry", "braise", "bake"],
          },
          servesAdults: { type: "integer" },
          produceUsed: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, amount: { type: "string" } },
              required: ["name", "amount"],
              additionalProperties: false,
            },
          },
          otherIngredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                amount: { type: "string" },
                pantry: { type: "boolean" },
              },
              required: ["name", "amount", "pantry"],
              additionalProperties: false,
            },
          },
          steps: { type: "array", items: { type: "string" } },
          containsAllergens: { type: "array", items: { type: "string" } },
          dietaryTags: { type: "array", items: { type: "string" } },
        },
        required: [
          "title", "cuisine", "totalMinutes", "difficulty", "heatLevel", "form",
          "servesAdults", "produceUsed", "otherIngredients", "steps",
          "containsAllergens", "dietaryTags",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["recipes"],
  additionalProperties: false,
} as const;

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json({ recipes: [] });
  }

  let body: {
    produce?: { name: string; band: string }[];
    mustNotContain?: string[];
    requiredDiets?: string[];
    dislikes?: string[];
    cuisines?: string[];
    heatTolerance?: string;
    maxMinutes?: number;
    pantry?: string[];
    adults?: number;
    children?: number;
    count?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that request." }, { status: 400 });
  }

  const produce = (body.produce ?? []).slice(0, 25);
  if (produce.length === 0) return NextResponse.json({ recipes: [] });
  const count = Math.min(Math.max(body.count ?? 1, 1), 3);

  const useFirst = produce.filter((p) => p.band === "use-first").map((p) => p.name);
  const prompt = [
    `Write ${count} dinner recipe${count > 1 ? "s" : ""} for a household of ${body.adults ?? 2} adults and ${body.children ?? 0} children.`,
    ``,
    `Produce they have: ${produce.map((p) => p.name).join(", ")}.`,
    useFirst.length ? `Needs using first: ${useFirst.join(", ")}. Build the recipe around these.` : ``,
    ``,
    `MUST NOT CONTAIN (allergies and medical restrictions): ${(body.mustNotContain ?? []).join(", ") || "nothing"}.`,
    (body.requiredDiets ?? []).length ? `Must be: ${(body.requiredDiets ?? []).join(", ")}.` : ``,
    ``,
    `Preferences (aim for these, they are not absolute):`,
    `- Heat tolerance: ${body.heatTolerance ?? "mild"}`,
    `- Ready in ${body.maxMinutes ?? 40} minutes or less`,
    (body.cuisines ?? []).length ? `- Cuisines they like: ${(body.cuisines ?? []).join(", ")}` : ``,
    (body.dislikes ?? []).length ? `- Avoid if you can: ${(body.dislikes ?? []).join(", ")}` : ``,
    (body.pantry ?? []).length ? `- Already in the cupboard (mark these pantry: true): ${(body.pantry ?? []).slice(0, 40).join(", ")}` : ``,
    ``,
    `Keep the shopping list short -- prefer what they already have.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") return NextResponse.json({ recipes: [] });

    const text = firstText(response.content);
    if (!text) return NextResponse.json({ recipes: [] });

    const parsed = JSON.parse(text) as { recipes?: unknown[] };
    return NextResponse.json({ recipes: parsed.recipes ?? [] });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("[recipes] generation failed", error.status, error.message);
    } else {
      console.error("[recipes] generation failed", error);
    }
    // A failed generation is never fatal -- the library results still stand.
    return NextResponse.json({ recipes: [] });
  }
}
