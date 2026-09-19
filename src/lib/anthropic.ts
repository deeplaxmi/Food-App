import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only. The key is read from the environment and never leaves the
 * server -- nothing in this file may be imported from a client component.
 */
let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!client) client = new Anthropic();
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** 5 MB per photo after base64 decoding, 4 photos per scan. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 4;

export interface ParsedImage {
  mediaType: SupportedImageType;
  data: string;
}

/** Validates a `data:` URL from the browser and strips it to what the API wants. */
export function parseDataUrl(dataUrl: unknown): ParsedImage | { error: string } {
  if (typeof dataUrl !== "string") return { error: "Photo was not readable." };
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return { error: "Photo format wasn't recognised." };

  const [, mediaType, data] = match;
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType as SupportedImageType)) {
    return { error: "Please use a JPEG, PNG, WebP or GIF photo." };
  }
  // 4 base64 chars encode 3 bytes; close enough to reject oversized uploads early.
  const approxBytes = Math.floor((data.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return { error: "That photo is over 5 MB. Try a smaller one." };
  }
  return { mediaType: mediaType as SupportedImageType, data };
}

/** Pulls the first text block out of a response. */
export function firstText(content: Anthropic.ContentBlock[]): string | null {
  for (const block of content) {
    if (block.type === "text") return block.text;
  }
  return null;
}
