import Replicate from "replicate";
import { makeRiriZoneMaskDataUrl, makeRiriZoneLargeMaskDataUrl } from "./maskGenerator";
import { generatePlate, generateInpaintCharacter } from "./imageGeneration";
import { resolveSceneSetting, enforceMustInclude } from "./sceneSettings";
import { generateAndSelectBest, CandidateResult, ScoreOptions } from "./candidateScoring";

const RIRI_BASE_MUST_INCLUDE = ["rhinoceros", "Riri"];

// ─── PROMPT BUILDERS ────────────────────────────────────────────────────

/**
 * Compact character-first inpaint prompt.
 *
 * ~35 words max. No labels like "doing:", "must include:", "background:".
 * Models often ignore meta-labels. Just state the facts.
 *
 * Token order matters — SDXL weights first tokens highest:
 *   [CHARACTER] [COMPOSITION] [ACTION] [STYLE]
 */
export function buildCharacterFirstPrompt(action: string, setting: string): string {
  return [
    "Riri, cute gray rhinoceros, one small rounded horn, big friendly eyes, thick gray skin, full body visible",
    "centered foreground, occupies 45% of frame",
    action,
    `matching ${setting} lighting and perspective`,
    "2D children's picture book, bold clean outlines, flat cel shading, vibrant pastel colors",
    "only one rhinoceros, no humans, no text",
  ].join(", ");
}

/**
 * Plate prompt — scene only, no characters.
 */
export function buildPlatePrompt(setting: string, styleHints: string): string {
  return [
    setting,
    styleHints,
    "2D children's picture book, bold clean outlines, flat cel shading, vibrant pastel colors",
    "empty scene, no characters, no animals, no people",
    "wide establishing shot",
    "no text, no watermark",
  ].join(", ");
}

// ─── MAIN PIPELINE ─────────────────────────────────────────────────────

/**
 * Generate a story page image:
 *
 *   Pass A — Background plate (no characters)
 *   Pass B — Inpaint Riri into foreground mask zone
 *   Pass C — Score with BLIP + hard rejection gates; retry with seed variation
 *   Pass D — If no candidate passes, escalate to a larger mask and retry
 *
 * The mask ensures SDXL MUST paint something in the Riri zone.
 * Combined with the character-first prompt, that something is Riri.
 *
 * Input to Replicate for Pass B looks like:
 *   { image: plateUrl, mask: maskDataUrl, prompt: "Riri...", prompt_strength: 0.65 }
 *
 * If `mask` is absent, you're doing img2img and the character will be skipped.
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
    numCandidates = 3,
  } = opts;

  // ── 1. Resolve scene from page text (verbatim, never canonicalized) ──
  const scene = resolveSceneSetting(pageText, RIRI_BASE_MUST_INCLUDE, sceneCardFallback);
  const mustInclude = enforceMustInclude(scene.mustInclude, RIRI_BASE_MUST_INCLUDE);

  console.log(`[Page ${pageIndex}] Setting: "${scene.setting}"`);
  console.log(`[Page ${pageIndex}] Category: ${scene.category}`);
  console.log(`[Page ${pageIndex}] Must include: ${mustInclude.join(", ")}`);

  // ── 2. Generate background plate (Pass A) ──
  const platePrompt = buildPlatePrompt(scene.setting, scene.styleHints);
  console.log(`[Page ${pageIndex}] Plate prompt (${platePrompt.split(" ").length} words)`);

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

  // ── 3. Build masks: initial + escalated (larger) ──
  const [initialMask, escalatedMask] = await Promise.all([
    makeRiriZoneMaskDataUrl(1024),
    makeRiriZoneLargeMaskDataUrl(1024),
  ]);

  // ── 4. Build compact character-first prompt ──
  const characterPrompt = buildCharacterFirstPrompt(action, scene.setting);
  console.log(`[Page ${pageIndex}] Character prompt (${characterPrompt.split(" ").length} words)`);

  // ── 5. Generate + score candidates with mask escalation ──
  const scoreOpts: ScoreOptions = {
    mustInclude,
    requireMustIncludeCount: Math.min(2, mustInclude.length),
  };

  const result = await generateAndSelectBest(
    async (seed: number, maskDataUrl: string) => {
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
    initialMask,
    escalatedMask,
    numCandidates,
    pageIndex,
    scoreOpts
  );

  console.log(
    `[Page ${pageIndex}] Final: score=${result.score}, caption="${result.caption}"`
  );

  return result;
}

/**
 * Generate just a plate (no character pass). For debugging.
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
