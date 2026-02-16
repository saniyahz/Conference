import Replicate from "replicate";
import {
  buildPlateNegative,
  buildInpaintCharacterNegative,
  buildHardBanNegative,
  sanitizeNegatives,
} from "./negativePrompts";
import { LoraConfig, prependTriggerWord } from "./loraTraining";

/**
 * SDXL model version on Replicate.
 * stability-ai/sdxl 1.0 — supports image, mask, prompt_strength.
 */
export const SDXL_VERSION =
  "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b" as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is a 429 rate limit error.
 * Replicate returns 429 when account is low on credit or hitting rate limits.
 */
function is429Error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("Too Many Requests");
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
  promptStrength: number = 0.80,
  lora?: LoraConfig,
  negativeOverride?: string
): Promise<string> {
  const maxRetries = 4;
  const negativePrompt = negativeOverride || buildPlateNegative();

  const modelVersion = lora?.version ?? SDXL_VERSION;

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

      if (lora?.loraScale !== undefined) {
        input.lora_scale = lora.loraScale;
      }

      if (baseImageUrl) {
        input.image = baseImageUrl;
        input.prompt_strength = promptStrength;
      }

      console.log(
        `[Plate ${pageIndex}] Attempt ${attempt}/${maxRetries} ` +
        `(mode: ${baseImageUrl ? "img2img" : "txt2img"}, seed: ${seed}` +
        `${lora ? `, LoRA: ${lora.version.substring(0, 12)}...` : ""})`
      );

      const prediction = await replicate.predictions.create({
        version: modelVersion,
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
        // 429 rate limit: wait longer (15s, 30s, 45s). Regular errors: 2s, 4s, 8s.
        const waitMs = is429Error(e)
          ? attempt * 15000
          : Math.pow(2, attempt) * 1000;
        console.log(`[Plate ${pageIndex}] Waiting ${waitMs / 1000}s before retry...`);
        await delay(waitMs);
      }
    }
  }

  console.error(`[Plate ${pageIndex}] All ${maxRetries} attempts failed`);
  return "";
}

// ─── MODE B: TXT2IMG SCENE (multi-character pages) ──────────────────────

/**
 * Generate a full scene via txt2img — character + setting + secondary actors.
 * Used for pages that need multiple characters (dolphins, rabbits, lions, fairies)
 * where plate→inpaint can only paint ONE character.
 */
export async function generateTxt2imgScene(
  replicate: Replicate,
  scenePrompt: string,
  negativePrompt: string,
  seed: number,
  pageIndex: number,
  lora?: LoraConfig
): Promise<string> {
  const maxRetries = 3;
  const modelVersion = lora?.version ?? SDXL_VERSION;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const input: Record<string, unknown> = {
        prompt: scenePrompt,
        negative_prompt: negativePrompt,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 40,
        guidance_scale: 8,
        seed,
      };

      if (lora?.loraScale !== undefined) {
        input.lora_scale = lora.loraScale;
      }

      console.log(
        `[Txt2img ${pageIndex}] Attempt ${attempt}/${maxRetries} ` +
        `(mode: txt2img, seed: ${seed})`
      );

      const prediction = await replicate.predictions.create({
        version: modelVersion,
        input,
      });

      const completed = await pollPrediction(replicate, prediction);
      const url = extractImageUrl(completed.output);
      if (!url) throw new Error("No image URL in prediction output");

      console.log(`[Txt2img ${pageIndex}] Success: ${url}`);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Txt2img ${pageIndex}] Attempt ${attempt} failed: ${msg}`);
      if (attempt < maxRetries) {
        await delay(Math.pow(2, attempt) * 1000);
      }
    }
  }

  console.error(`[Txt2img ${pageIndex}] All ${maxRetries} attempts failed`);
  return "";
}

// ─── PASS B: INPAINT CHARACTER (the key change) ────────────────────────

/**
 * Inpaint Riri into a plate image using a foreground mask.
 *
 * This is MASKED INPAINTING, not img2img. The input MUST contain:
 *   image: the plate URL
 *   mask: data URL of the mask PNG (white = paint here, black = keep)
 *
 * prompt_strength for SDXL inpainting controls how much the ENTIRE
 * image deviates from the original — not just the mask region.
 *   - 0.92 = regenerates nearly everything (background destroyed)
 *   - 0.65 = background stays locked, mask region fills from prompt
 *   - 0.55 = very conservative, slight edits only
 *
 * We use 0.85: character renders prominently in mask region, plate mostly preserved.
 * 0.80 was too low — characters rendered too small (bbox 1-7%), causing
 * massive TINY CHARACTER rejections. 0.85 produces characters large enough
 * to pass the bbox > 8% check consistently.
 * 0.65 was too low — produced no character at all (just plate background).
 */
export async function generateInpaintCharacter(
  replicate: Replicate,
  characterPrompt: string,
  plateUrl: string,
  maskDataUrl: string,
  seed: number,
  pageIndex: number,
  settingContext: string = "",
  mustInclude: string[] = [],
  lora?: LoraConfig,
  promptStrength: number = 0.85,
  species?: string,
  allowedAnimals?: string[]
): Promise<string> {
  // Hard validation: mask MUST be a real data URL, otherwise we're
  // silently falling back to img2img and SDXL will ignore the character.
  if (!maskDataUrl || !maskDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(
      `[Inpaint ${pageIndex}] FATAL: maskDataUrl is missing or malformed. ` +
      `Without a valid mask, this is plain img2img and the character will be skipped. ` +
      `Got: ${maskDataUrl ? maskDataUrl.substring(0, 40) + "..." : "undefined"}`
    );
  }

  const maxRetries = 4;
  const modelVersion = lora?.version ?? SDXL_VERSION;

  // If LoRA is active, prepend trigger word to the prompt
  const effectivePrompt = lora
    ? prependTriggerWord(characterPrompt, lora.triggerWord)
    : characterPrompt;

  let negativePrompt = buildInpaintCharacterNegative();
  negativePrompt = sanitizeNegatives(negativePrompt, effectivePrompt, settingContext, mustInclude);
  // PREPEND hard bans so they're within SDXL's ~77 token window.
  // SDXL ignores tokens past ~77, so critical terms (species anti-drift, crop blockers)
  // MUST be at the FRONT. Species-specific anti-drift (cow, bull, buffalo for rhino)
  // are placed at tokens 1-10 for maximum negative effect.
  negativePrompt = buildHardBanNegative(species, allowedAnimals) + ", " + negativePrompt;

  // Log actual inpaint prompts — hard bans should be visible at the start
  console.log(`[Inpaint ${pageIndex}] POSITIVE: "${effectivePrompt.substring(0, 120)}..."`);
  console.log(`[Inpaint ${pageIndex}] NEGATIVE (hard bans first): "${negativePrompt.substring(0, 200)}..."`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const input: Record<string, unknown> = {
        prompt: effectivePrompt,
        negative_prompt: negativePrompt,
        image: plateUrl,
        mask: maskDataUrl,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 50,  // Increased from 40 for sharper, less blurry character details
        guidance_scale: 14,  // Very high guidance = strong prompt adherence for hard species (rhinoceros). Raised from 11 after production showed frequent drift to rabbit/dog/elephant
        prompt_strength: promptStrength,
        seed,
      };

      if (lora?.loraScale !== undefined) {
        input.lora_scale = lora.loraScale;
      }

      // Explicit confirmation that this is inpaint, not img2img
      console.log(
        `[Inpaint ${pageIndex}] Attempt ${attempt}/${maxRetries} ` +
        `(MODE: INPAINT, mask: ${maskDataUrl.length} bytes, ` +
        `strength: ${promptStrength}, steps: ${input.num_inference_steps}, guidance: ${input.guidance_scale}, seed: ${seed}` +
        `${lora ? `, LoRA: ${lora.version.substring(0, 12)}..., trigger: ${lora.triggerWord}` : ""})`
      );
      console.log(
        `[Inpaint ${pageIndex}] Input keys: ${Object.keys(input).join(", ")} ` +
        `— "mask" present: ${!!input.mask}`
      );

      const prediction = await replicate.predictions.create({
        version: modelVersion,
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
        // 429 rate limit: wait longer (15s, 30s, 45s). Regular errors: 2s, 4s, 8s.
        const waitMs = is429Error(e)
          ? attempt * 15000
          : Math.pow(2, attempt) * 1000;
        console.log(`[Inpaint ${pageIndex}] Waiting ${waitMs / 1000}s before retry...`);
        await delay(waitMs);
      }
    }
  }

  console.error(`[Inpaint ${pageIndex}] All ${maxRetries} attempts failed`);
  return "";
}
