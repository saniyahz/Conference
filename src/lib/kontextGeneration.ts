/**
 * FLUX KONTEXT PRO — Character-consistent image generation via Replicate.
 *
 * REPLACES the old SDXL pipeline (plate → inpaint → score → accept/reject).
 *
 * WHY: SDXL cannot maintain character consistency across scenes. The old pipeline
 * used 100+ API calls per book (CLIP, DINO, BLIP, 3 rounds of 4 candidates, masks)
 * and STILL produced wrong animals, tiny characters, and style drift.
 *
 * FLUX KONTEXT PRO solves this fundamentally:
 *   - ONE API call per page
 *   - Pass a reference image (input_image) + text prompt
 *   - Kontext preserves character identity while placing them in new scenes
 *   - $0.04/image, ~5 seconds per image
 *   - 10 pages = 10 calls = ~$0.40/book in ~50 seconds
 *
 * vs OLD: 100+ calls = ~$0.80/book in ~12 minutes (with 60%+ rejection rate)
 */

import Replicate from "replicate";

// ─── CONFIG ──────────────────────────────────────────────────────────────

/** Flux Kontext Pro model identifier on Replicate */
export const KONTEXT_MODEL = "black-forest-labs/flux-kontext-pro" as const;

/** Default output format */
const OUTPUT_FORMAT = "png" as const;

/** Default aspect ratio for story book pages (landscape for cinematic look) */
const DEFAULT_ASPECT_RATIO = "3:4" as const;

/**
 * Safety tolerance (1-6). Higher = more permissive.
 * For kids' book content, we use 2 (conservative but allows cartoon characters).
 */
const SAFETY_TOLERANCE = 2;

/**
 * HARD CAPS on safety tolerance — NEVER allow callers to exceed these.
 * Page images (scenes with characters): max 4 (moderate — allows children's book scenes).
 * Reference images (character on white bg): max 5 (slightly more permissive for generation).
 *
 * NOTE: Values 1-2 are TOO restrictive for Flux Kontext Pro with children's characters.
 * Flux's safety filter at 1-2 often blocks innocuous child illustrations (cartoon girl
 * in a park, character waving, etc.) with E005 "flagged as sensitive" errors.
 * Level 3-4 is the sweet spot: blocks genuinely unsafe content while allowing
 * wholesome children's book illustrations. Our content safety is enforced at the
 * PROMPT level (contentSafety.ts blocklists, GPT system prompt restrictions),
 * not by making Flux's safety filter so strict it blocks everything.
 */
export const MAX_PAGE_SAFETY_TOLERANCE = 4;
export const MAX_REF_SAFETY_TOLERANCE = 5;

/** Retry config — 6 retries with longer backoff to survive rate limiting.
 * With <$5 credit, Replicate enforces 6 req/min burst=1. Sequential generation
 * (PAGE_CONCURRENCY=1) avoids concurrent 429s, but we still need retries for
 * transient failures. 6 attempts × ~15s avg backoff = ~90s max wait. */
const MAX_RETRIES = 6;
const RETRY_DELAY_BASE_MS = 3000; // 3s, 6s, 12s, 24s, 48s, 96s exponential backoff

// ─── HELPERS ─────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function is429Error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("Too Many Requests");
}

/**
 * Extract the retry_after value (in seconds) from a 429 error message.
 * Replicate errors include JSON like `"retry_after":8` or text like `retry_after: 9`.
 * Falls back to 0 if not found.
 */
function extractRetryAfter(e: unknown): number {
  const msg = e instanceof Error ? e.message : String(e);
  // Match multiple formats:
  //   "retry_after":8        (JSON format from Replicate API)
  //   "retry_after": 8       (JSON with space)
  //   retry_after: 9         (plain text)
  //   retry-after: 9         (HTTP header style)
  const match = msg.match(/retry[_-]after["']?\s*[:=]\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check if an error is a 402 Payment Required / Insufficient credit error.
 * These should NOT be retried — they mean the account has no balance.
 */
function is402Error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("402") || msg.includes("Payment Required") || msg.includes("nsufficient credit") || msg.includes("nsufficient balance");
}

/**
 * Extract image URL from prediction output.
 * Uses the predictions API (same as SDXL) which returns { output: "url" } or { output: ["url"] }.
 */
function extractImageUrl(output: unknown): string {
  // Kontext returns a single URL string (not an array like SDXL)
  if (typeof output === "string") return output;
  // Some models return an array
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
    return output[0];
  }
  // Handle FileOutput-like objects with href or url property
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.href === "string") return obj.href;
    if (typeof obj.url === "function") return (obj.url as () => string)();
  }
  return "";
}

/**
 * Poll a Replicate prediction until it completes.
 * Same proven approach as the SDXL module.
 */
async function pollPrediction(
  replicate: Replicate,
  prediction: { id: string; status: string; output?: unknown; error?: unknown }
): Promise<{ output?: unknown; status: string; error?: unknown }> {
  let result = prediction;
  const pollInterval = 1500; // Poll every 1.5s instead of 2s for faster detection
  const maxPollTime = 180000; // 3 minutes max
  const startTime = Date.now();

  while (
    result.status !== "succeeded" &&
    result.status !== "failed" &&
    result.status !== "canceled"
  ) {
    if (Date.now() - startTime > maxPollTime) {
      throw new Error(`Prediction timed out after ${maxPollTime}ms`);
    }
    await delay(pollInterval);
    result = await replicate.predictions.get(result.id);
  }

  if (result.status === "failed") {
    const msg = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
    throw new Error(`Prediction failed: ${msg}`);
  }
  if (result.status === "canceled") {
    throw new Error("Prediction was canceled");
  }

  return result;
}

// ─── CORE GENERATION ─────────────────────────────────────────────────────

export interface KontextGenerateOptions {
  /** Text prompt describing the scene */
  prompt: string;
  /** Reference image URL (character reference for consistency) */
  inputImageUrl?: string;
  /** Aspect ratio (default: 1:1 for square storybook pages) */
  aspectRatio?: string;
  /** Seed for reproducibility */
  seed?: number;
  /** Output format (default: png) */
  outputFormat?: string;
  /** Safety tolerance 1-6 (default: 2 for kids content) */
  safetyTolerance?: number;
  /** Page index for logging */
  pageIndex?: number;
}

/**
 * Generate a single image using Flux Kontext Pro.
 *
 * This is the ONLY image generation function needed per page.
 * No masks, no inpainting, no scoring, no multi-round candidates.
 *
 * @returns Image URL string, or "" on failure
 */
export async function generateKontextImage(
  replicate: Replicate,
  options: KontextGenerateOptions
): Promise<string> {
  const {
    prompt,
    inputImageUrl,
    aspectRatio = DEFAULT_ASPECT_RATIO,
    seed,
    outputFormat = OUTPUT_FORMAT,
    safetyTolerance: requestedTolerance = SAFETY_TOLERANCE,
    pageIndex = 0,
  } = options;

  // Enforce safety tolerance caps — NEVER allow callers to exceed these limits.
  // Reference images (pageIndex 99) get slightly more permissive cap.
  // Page images are capped at the strictest level.
  const maxTolerance = pageIndex === 99 ? MAX_REF_SAFETY_TOLERANCE : MAX_PAGE_SAFETY_TOLERANCE;
  const safetyTolerance = Math.min(requestedTolerance, maxTolerance);
  if (requestedTolerance > maxTolerance) {
    console.warn(`[Kontext ${pageIndex}] Safety tolerance ${requestedTolerance} exceeds max ${maxTolerance} — capped to ${maxTolerance}`);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        output_format: outputFormat,
        safety_tolerance: safetyTolerance,
      };

      if (inputImageUrl) {
        input.input_image = inputImageUrl;
      }
      if (seed !== undefined) {
        input.seed = seed;
      }

      console.log(
        `[Kontext ${pageIndex}] Attempt ${attempt}/${MAX_RETRIES} ` +
        `(${inputImageUrl ? "img2img" : "txt2img"}, seed: ${seed ?? "random"})`
      );
      console.log(`[Kontext ${pageIndex}] Prompt: "${prompt.substring(0, 150)}..."`);

      // Use predictions.create + polling (proven approach from SDXL module)
      // replicate.run() returns FileOutput objects that don't serialize cleanly.
      const prediction = await replicate.predictions.create({
        model: KONTEXT_MODEL,
        input,
      });

      const completed = await pollPrediction(replicate, prediction);
      console.log(`[Kontext ${pageIndex}] Raw output type: ${typeof completed.output}, value: ${JSON.stringify(completed.output).substring(0, 200)}`);

      const url = extractImageUrl(completed.output);
      if (!url) throw new Error("No image URL in Kontext output");

      console.log(`[Kontext ${pageIndex}] Success: ${url.substring(0, 80)}...`);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Kontext ${pageIndex}] Attempt ${attempt} failed: ${msg}`);

      // 402 = out of credit — fail immediately, retrying won't help
      if (is402Error(e)) {
        console.error(`[Kontext ${pageIndex}] 402 INSUFFICIENT CREDIT — skipping retries (add funds at replicate.com/account/billing)`);
        break;
      }

      if (attempt < MAX_RETRIES) {
        let waitMs: number;
        if (is429Error(e)) {
          // Use server-provided retry_after if available, otherwise escalating waits.
          // Key fix: use MINIMUM 12s wait for 429s (rate limit is 6 req/min = 10s between requests).
          // Previous 3s buffer was too short and caused cascading 429 failures.
          const retryAfterSec = extractRetryAfter(e);
          const serverWait = retryAfterSec > 0 ? (retryAfterSec + 5) * 1000 : 0;
          const fallbackWait = Math.max(12000, attempt * 12000); // 12s, 24s, 36s, 48s, 60s
          waitMs = Math.max(serverWait, fallbackWait);
          console.log(`[Kontext ${pageIndex}] 429 rate limited (retry_after=${retryAfterSec}s). Waiting ${waitMs / 1000}s...`);
        } else {
          waitMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1); // Regular: 3s, 6s, 12s, 24s, 48s, 96s
        }
        console.log(`[Kontext ${pageIndex}] Waiting ${waitMs / 1000}s before retry...`);
        await delay(waitMs);
      }
    }
  }

  console.error(`[Kontext ${pageIndex}] All ${MAX_RETRIES} attempts failed`);
  return "";
}

/**
 * Generate a character reference image using Kontext (txt2img mode).
 * Used when no cached reference image exists for a species.
 *
 * Returns the reference image URL.
 */
export async function generateKontextReference(
  replicate: Replicate,
  characterDescription: string,
  seed: number
): Promise<string> {
  const prompt = `${characterDescription}, standing in a bright colorful meadow with green grass and wildflowers, the character is small in the frame about one-third of the image height, full body visible head to toe, children's picture book illustration, soft painterly style, warm vibrant colors, detailed background`;

  console.log(`[Kontext Ref] Generating character reference image...`);
  return generateKontextImage(replicate, {
    prompt,
    seed,
    pageIndex: 99,
    safetyTolerance: 4, // Permissive for character reference generation (capped by MAX_REF_SAFETY_TOLERANCE)
  });
}

/**
 * Convert a reference image buffer to a publicly accessible URL.
 *
 * Flux Kontext needs a URL for input_image, not a buffer.
 * For cached library images, we serve them from the public directory.
 * For generated references, we get the URL from the Replicate response.
 */
export function getCharacterRefUrl(
  refBuffer: Buffer | null,
  species: string
): string | null {
  if (!refBuffer) return null;

  // For library characters, the reference images are in public/characters/<species>/
  // These are served by Next.js at /characters/<species>/ref-white.png
  // But Kontext needs an absolute URL, so we'll use a data URL for reliability
  return `data:image/png;base64,${refBuffer.toString("base64")}`;
}
