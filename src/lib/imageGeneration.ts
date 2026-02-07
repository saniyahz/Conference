import Replicate from "replicate";
import {
  buildPlateNegative,
  buildInpaintCharacterNegative,
  sanitizeNegatives,
} from "./negativePrompts";

/**
 * SDXL model version on Replicate.
 * stability-ai/sdxl 1.0 — supports image, mask, prompt_strength.
 */
export const SDXL_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b" as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractImageUrl(output: unknown): string {
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
    return output[0];
  }
  if (typeof output === "string") {
    return output;
  }
  return "";
}

async function pollPrediction(
  replicate: Replicate,
  prediction: { id: string; status: string; output?: unknown; error?: unknown }
): Promise<{ output?: unknown; status: string; error?: unknown }> {
  let result = prediction;
  const pollInterval = 2000;
  const maxPollTime = 180000;
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

// ─── PASS A: BACKGROUND PLATE (no characters) ──────────────────────────

/**
 * Generate a background plate via txt2img or img2img.
 *
 * Settings tuned for clean background generation:
 *   steps: 30–40
 *   guidance: 7–9
 *   prompt_strength: 0.80 (img2img, if base image provided)
 */
export async function generatePlate(
  replicate: Replicate,
  scenePrompt: string,
  seed: number,
  pageIndex: number,
  baseImageUrl?: string,
  promptStrength: number = 0.80
): Promise<string> {
  const maxRetries = 3;
  const negativePrompt = buildPlateNegative();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const input: Record<string, unknown> = {
        prompt: scenePrompt,
        negative_prompt: negativePrompt,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 35,
        guidance_scale: 8,
        seed,
      };

      if (baseImageUrl) {
        input.image = baseImageUrl;
        input.prompt_strength = promptStrength;
      }

      console.log(
        `[Plate ${pageIndex}] Attempt ${attempt}/${maxRetries} ` +
        `(mode: ${baseImageUrl ? "img2img" : "txt2img"}, seed: ${seed})`
      );

      const prediction = await replicate.predictions.create({
        version: SDXL_VERSION,
        input,
      });

      const completed = await pollPrediction(replicate, prediction);
      const url = extractImageUrl(completed.output);
      if (!url) throw new Error("No image URL in prediction output");

      console.log(`[Plate ${pageIndex}] Success: ${url}`);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Plate ${pageIndex}] Attempt ${attempt} failed: ${msg}`);
      if (attempt < maxRetries) {
        await delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  console.error(`[Plate ${pageIndex}] All ${maxRetries} attempts failed`);
  return "";
}

// ─── PASS B: INPAINT CHARACTER (the key change) ────────────────────────

/**
 * Inpaint Riri into a plate image using a foreground mask.
 *
 * This is NOT img2img. This is masked inpainting:
 *   - image: the plate (background)
 *   - mask: white = where to paint Riri, black = keep background
 *   - prompt: character-first (Riri description + composition)
 *   - strength: 0.90–0.95 (strongly overwrite inside mask)
 *
 * Settings tuned for character insertion:
 *   steps: 40 (higher than plate — character detail matters)
 *   guidance: 10 (strong prompt adherence for the character)
 *   prompt_strength: 0.92 (aggressively fill the mask region)
 *
 * The old pipeline used 0.65 — far too weak. At 0.65, SDXL treats
 * the mask region as "suggest, don't enforce", so it often keeps
 * the plate composition and skips the character entirely.
 */
export async function generateInpaintCharacter(
  replicate: Replicate,
  characterPrompt: string,
  plateUrl: string,
  maskDataUrl: string,
  seed: number,
  pageIndex: number,
  settingContext: string = "",
  mustInclude: string[] = []
): Promise<string> {
  const maxRetries = 3;

  let negativePrompt = buildInpaintCharacterNegative();
  negativePrompt = sanitizeNegatives(negativePrompt, characterPrompt, settingContext, mustInclude);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const input: Record<string, unknown> = {
        prompt: characterPrompt,
        negative_prompt: negativePrompt,
        image: plateUrl,
        mask: maskDataUrl,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 40,
        guidance_scale: 10,
        prompt_strength: 0.92,
        seed,
      };

      console.log(
        `[Inpaint ${pageIndex}] Attempt ${attempt}/${maxRetries} ` +
        `(strength: 0.92, steps: 40, guidance: 10, seed: ${seed})`
      );

      const prediction = await replicate.predictions.create({
        version: SDXL_VERSION,
        input,
      });

      const completed = await pollPrediction(replicate, prediction);
      const url = extractImageUrl(completed.output);
      if (!url) throw new Error("No image URL in prediction output");

      console.log(`[Inpaint ${pageIndex}] Success: ${url}`);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Inpaint ${pageIndex}] Attempt ${attempt} failed: ${msg}`);
      if (attempt < maxRetries) {
        await delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  console.error(`[Inpaint ${pageIndex}] All ${maxRetries} attempts failed`);
  return "";
}
