import Replicate from "replicate";
import {
  buildQualityOnlyNegative,
  buildCharacterSafetyNegative,
  sanitizeNegatives,
} from "./negativePrompts";

/**
 * SDXL model version on Replicate.
 * stability-ai/sdxl 1.0 — supports image, mask, prompt_strength.
 */
export const SDXL_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b" as const;

/** Delay helper for retry backoff */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the first image URL from SDXL prediction output */
function extractImageUrl(output: unknown): string {
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
    return output[0];
  }
  if (typeof output === "string") {
    return output;
  }
  return "";
}

/**
 * Generate an image using SDXL with an anchor/base image.
 *
 * Supports two modes:
 *  1. **img2img** (no mask) — the base image influences the entire output.
 *     Good for generating scene "plates" with consistent style.
 *  2. **Masked inpaint** (mask provided) — SDXL fills ONLY the white region
 *     of the mask. The black region is preserved from the base image.
 *     This guarantees the character appears where the mask is.
 *
 * @param replicate       - Replicate client instance
 * @param prompt          - Positive prompt (character-focused for inpaint)
 * @param baseImageUrl    - URL of the base/plate image
 * @param seed            - Deterministic seed for reproducibility
 * @param imageIndex      - Page index (for logging)
 * @param promptStrength  - How much the prompt overrides the base (img2img mode)
 * @param settingContext  - Scene description for negative sanitization
 * @param mustInclude     - Terms that must NOT be negated
 * @param maskDataUrl     - Optional mask data URL; when provided, switches to inpaint
 */
export async function generateImageWithAnchor(
  replicate: Replicate,
  prompt: string,
  baseImageUrl: string,
  seed: number,
  imageIndex: number,
  promptStrength: number = 0.80,
  settingContext: string = "",
  mustInclude: string[] = [],
  maskDataUrl?: string
): Promise<string> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Build negative prompt: quality issues + character safety
      let dynamicNegative = [
        buildQualityOnlyNegative(),
        buildCharacterSafetyNegative(),
      ].join(", ");

      // Sanitize so negatives don't fight the positive prompt
      dynamicNegative = sanitizeNegatives(
        dynamicNegative,
        prompt,
        settingContext,
        mustInclude
      );

      const input: Record<string, unknown> = {
        prompt,
        negative_prompt: dynamicNegative,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 25,
        guidance_scale: 9,
        seed,
        image: baseImageUrl,
      };

      // --- MODE SWITCH ---
      if (maskDataUrl) {
        // INPAINT mode: mask tells SDXL where to paint.
        // Modest prompt_strength keeps the background stable while
        // strongly guiding the masked region toward the prompt content.
        input.mask = maskDataUrl;
        input.prompt_strength = 0.65;
      } else {
        // IMG2IMG mode: standard image-to-image generation
        input.prompt_strength = promptStrength;
      }

      console.log(
        `[Image ${imageIndex}] Attempt ${attempt}/${maxRetries} ` +
        `(mode: ${maskDataUrl ? "inpaint" : "img2img"}, ` +
        `strength: ${input.prompt_strength}, seed: ${seed})`
      );

      // Create prediction
      const prediction = await replicate.predictions.create({
        version: SDXL_VERSION,
        input,
      });

      // Poll for completion
      let completedPrediction = prediction;
      const pollInterval = 2000;
      const maxPollTime = 120000;
      const startTime = Date.now();

      while (
        completedPrediction.status !== "succeeded" &&
        completedPrediction.status !== "failed" &&
        completedPrediction.status !== "canceled"
      ) {
        if (Date.now() - startTime > maxPollTime) {
          throw new Error(`Prediction timed out after ${maxPollTime}ms`);
        }
        await delay(pollInterval);
        completedPrediction = await replicate.predictions.get(completedPrediction.id);
      }

      if (completedPrediction.status === "failed") {
        const errorMsg =
          typeof completedPrediction.error === "string"
            ? completedPrediction.error
            : JSON.stringify(completedPrediction.error);
        throw new Error(`Prediction failed: ${errorMsg}`);
      }

      if (completedPrediction.status === "canceled") {
        throw new Error("Prediction was canceled");
      }

      const resultUrl = extractImageUrl(completedPrediction.output);

      if (!resultUrl) {
        throw new Error("No image URL in prediction output");
      }

      console.log(`[Image ${imageIndex}] Success on attempt ${attempt}: ${resultUrl}`);
      return resultUrl;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[Image ${imageIndex}] Attempt ${attempt} failed: ${errMsg}`);

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[Image ${imageIndex}] Retrying in ${backoffMs}ms...`);
        await delay(backoffMs);
      }
    }
  }

  console.error(`[Image ${imageIndex}] All ${maxRetries} attempts failed`);
  return "";
}
