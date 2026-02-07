import Replicate from "replicate";
import { makeRiriZoneMaskDataUrl } from "./maskGenerator";
import { generatePlate, generateInpaintCharacter } from "./imageGeneration";
import { resolveSceneSetting, enforceMustInclude } from "./sceneSettings";
import { generateAndSelectBest, CandidateResult } from "./candidateScoring";

/**
 * Base "must include" items for every Riri image.
 * These are NEVER removed by noun-gating or negative sanitization.
 */
const RIRI_BASE_MUST_INCLUDE = ["rhinoceros", "Riri"];

// ─── PROMPT BUILDERS ────────────────────────────────────────────────────

/**
 * Build a CHARACTER-FIRST prompt for the inpaint pass.
 *
 * Critical: the first tokens must be the character + composition.
 * SDXL weights earlier tokens more heavily. If you lead with scene
 * description, SDXL "spends its budget" on background and drops the hero.
 *
 * Structure:
 *   1. Character lock (Riri physical description)
 *   2. Composition (centered, full body, frame %)
 *   3. Action (what Riri is doing)
 *   4. Minimal scene reminder (background is already in the plate)
 *   5. Style lock (consistent across all pages)
 *   6. Hard exclusions (no text, no humans, one rhino only)
 */
export function buildCharacterFirstPrompt(opts: {
  action: string;
  setting: string;
  mustInclude: string[];
}): string {
  return [
    // 1. HARD subject lock — first tokens, highest weight
    "Riri, cute gray rhinoceros, one small rounded horn, big friendly eyes, thick gray skin, full body visible",
    // 2. Composition lock
    "centered foreground, main focus, occupies 40-55% of frame",
    // 3. Action
    `doing: ${opts.action}`,
    // 4. Minimal scene reminder (plate has the background already)
    `background: ${opts.setting}`,
    // 5. Must-include objects (keep short)
    opts.mustInclude.length > 0
      ? `must include: ${opts.mustInclude.join(", ")}`
      : "",
    // 6. Style lock — same every page for consistency
    "2D children's picture book illustration, bold clean outlines, flat cel shading, vibrant pastel colors, warm gentle magical mood",
    // 7. Hard exclusions baked into prompt
    "only one rhinoceros, no duplicate rhinos, no humans, no text, no watermark, no signature",
  ]
    .filter(Boolean)
    .join(". ");
}

/**
 * Build a plate (background) prompt.
 * Scene-focused, no character content.
 */
export function buildPlatePrompt(setting: string, styleHints: string): string {
  return [
    setting,
    styleHints,
    "2D children's picture book illustration, bold clean outlines, flat cel shading, vibrant pastel colors, warm gentle magical mood",
    "empty scene, no characters, no animals, no people",
    "wide establishing shot, clear composition",
    "no text, no watermark, no signature",
  ].join(". ");
}

// ─── MAIN PIPELINE ─────────────────────────────────────────────────────

/**
 * Generate a story page image using the character-first inpaint pipeline.
 *
 * Flow:
 *   Pass A — Generate background plate (no characters)
 *   Pass B — Inpaint Riri into the foreground mask zone
 *   Pass C — Auto-validate with BLIP + keyword scoring; retry if needed
 *
 * This replaces the old plate → img2img approach which structurally
 * allowed the model to skip the character.
 *
 * @param opts.replicate - Replicate client
 * @param opts.pageText - The story text for this page (source of truth for setting)
 * @param opts.action - What Riri is doing on this page (e.g., "exploring the forest")
 * @param opts.pageSeed - Base seed for reproducibility
 * @param opts.pageIndex - Page number (for logging)
 * @param opts.baseImageUrl - Optional base image for plate img2img (style reference)
 * @param opts.sceneCardFallback - Optional fallback setting (only used if page text has no environment)
 * @param opts.numCandidates - How many inpaint candidates to generate and score (default: 5)
 */
export async function generateStoryPageImage(opts: {
  replicate: Replicate;
  pageText: string;
  action: string;
  pageSeed: number;
  pageIndex: number;
  baseImageUrl?: string;
  sceneCardFallback?: string;
  numCandidates?: number;
}): Promise<CandidateResult> {
  const {
    replicate,
    pageText,
    action,
    pageSeed,
    pageIndex,
    baseImageUrl,
    sceneCardFallback,
    numCandidates = 5,
  } = opts;

  // ── 1. Resolve scene from page text (never canonicalize) ──
  const scene = resolveSceneSetting(pageText, RIRI_BASE_MUST_INCLUDE, sceneCardFallback);
  const mustInclude = enforceMustInclude(scene.mustInclude, RIRI_BASE_MUST_INCLUDE);

  console.log(`[Page ${pageIndex}] Setting: "${scene.setting}"`);
  console.log(`[Page ${pageIndex}] Category: ${scene.category}`);
  console.log(`[Page ${pageIndex}] Must include: ${mustInclude.join(", ")}`);

  // ── 2. Generate background plate (Pass A) ──
  const platePrompt = buildPlatePrompt(scene.setting, scene.styleHints);
  console.log(`[Page ${pageIndex}] Plate prompt: "${platePrompt}"`);

  const plateUrl = await generatePlate(
    replicate,
    platePrompt,
    pageSeed,
    pageIndex,
    baseImageUrl,
    0.80
  );

  if (!plateUrl) {
    console.error(`[Page ${pageIndex}] Plate generation failed`);
    return { url: "", score: -999, caption: "", reasons: ["plate failed"] };
  }

  // ── 3. Create Riri zone mask ──
  const maskDataUrl = await makeRiriZoneMaskDataUrl(1024);

  // ── 4. Build character-first prompt ──
  const characterPrompt = buildCharacterFirstPrompt({
    action,
    setting: scene.setting,
    mustInclude: mustInclude.filter(
      (item) => !["rhinoceros", "Riri"].includes(item) // already in the character lock
    ),
  });
  console.log(`[Page ${pageIndex}] Character prompt: "${characterPrompt}"`);

  // ── 5. Generate + score candidates (Pass B + C) ──
  const result = await generateAndSelectBest(
    async (seed: number) => {
      return generateInpaintCharacter(
        replicate,
        characterPrompt,
        plateUrl,
        maskDataUrl,
        seed,
        pageIndex,
        scene.setting,
        mustInclude
      );
    },
    replicate,
    pageSeed,
    numCandidates,
    pageIndex
  );

  console.log(
    `[Page ${pageIndex}] Final result: score=${result.score}, ` +
    `caption="${result.caption}", url=${result.url}`
  );

  return result;
}

/**
 * Convenience: generate just a plate (no character pass).
 * Useful for debugging or when you need the background alone.
 */
export async function generateScenePlateOnly(opts: {
  replicate: Replicate;
  pageText: string;
  pageSeed: number;
  pageIndex: number;
  baseImageUrl?: string;
  sceneCardFallback?: string;
}): Promise<string> {
  const scene = resolveSceneSetting(
    opts.pageText,
    RIRI_BASE_MUST_INCLUDE,
    opts.sceneCardFallback
  );
  const platePrompt = buildPlatePrompt(scene.setting, scene.styleHints);

  return generatePlate(
    opts.replicate,
    platePrompt,
    opts.pageSeed,
    opts.pageIndex,
    opts.baseImageUrl,
    0.80
  );
}
