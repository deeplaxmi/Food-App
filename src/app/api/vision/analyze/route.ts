import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  MAX_IMAGES,
  MODEL,
  firstText,
  getAnthropic,
  isAiConfigured,
  parseDataUrl,
} from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You identify fresh produce in photographs of someone's kitchen counter, fridge or shopping bag.

Rules:
- List only fresh fruit, vegetables and fresh herbs. Ignore packaged goods, dairy, meat, bottles, utensils and packaging.
- Use the plain everyday name a shopper would use: "zucchini", "cilantro", "bell pepper", "spinach".
- Merge duplicates across photos into one entry with a combined quantity.
- Estimate quantity the way a person would say it: "3 medium", "1 bunch", "about 8 oz".
- Set confidence honestly. Use "low" when the item is blurred, partly hidden or easily confused with something else.
- If you see no fresh produce at all, return an empty list.

You are identifying what the produce IS. You are not judging whether it is fresh, safe or fit to eat -- never comment on spoilage or safety.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Everyday produce name, lowercase" },
          quantity: { type: "string", description: "Human-style estimate, e.g. '3 medium'" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["name", "quantity", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

interface DetectedItem {
  name: string;
  quantity: string;
  confidence: "high" | "medium" | "low";
}

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "Photo scanning isn't set up yet. Add an ANTHROPIC_API_KEY, or add your produce by hand.",
        code: "not_configured",
      },
      { status: 503 },
    );
  }

  let payload: { images?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that request." }, { status: 400 });
  }

  const raw = Array.isArray(payload.images) ? payload.images : [];
  if (raw.length === 0) {
    return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
  }
  if (raw.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Up to ${MAX_IMAGES} photos at a time.` },
      { status: 400 },
    );
  }

  const images = [];
  for (const candidate of raw) {
    const parsed = parseDataUrl(candidate);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    images.push(parsed);
  }

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: SCHEMA },
        effort: "medium",
      },
      messages: [
        {
          role: "user",
          content: [
            ...images.map((image) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: image.mediaType,
                data: image.data,
              },
            })),
            {
              type: "text" as const,
              text:
                images.length === 1
                  ? "What fresh produce is in this photo?"
                  : `These ${images.length} photos show the same batch of produce from different angles. What fresh produce is there in total?`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Couldn't analyse that photo. Try another, or add items by hand." },
        { status: 422 },
      );
    }

    const text = firstText(response.content);
    if (!text) {
      return NextResponse.json(
        { error: "No produce found in that photo. Try another angle, or add items by hand." },
        { status: 200 },
      );
    }

    let parsed: { items?: DetectedItem[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Couldn't read the results. Try again, or add items by hand." },
        { status: 502 },
      );
    }

    const items = (parsed.items ?? [])
      .filter((i) => typeof i?.name === "string" && i.name.trim().length > 0)
      .map((i) => ({
        name: i.name.trim(),
        quantity: typeof i.quantity === "string" && i.quantity ? i.quantity : "1",
        confidence: (["high", "medium", "low"] as const).includes(i.confidence)
          ? i.confidence
          : "low",
      }));

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "Photo scanning isn't configured correctly.", code: "auth" },
        { status: 503 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Busy right now -- try again in a moment." },
        { status: 429 },
      );
    }
    console.error("[vision] analyze failed", error);
    return NextResponse.json(
      { error: "Something went wrong reading that photo. You can add items by hand." },
      { status: 500 },
    );
  }
}
