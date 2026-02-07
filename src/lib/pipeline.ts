import Replicate from "replicate";
import { makeRiriZoneMaskDataUrl, makeRiriZoneLargeMaskDataUrl } from "./maskGenerator";
import { generatePlate, generateInpaintCharacter } from "./imageGeneration";
import { resolveSceneSetting, enforceMustInclude } from "./sceneSettings";
import { generateAndSelectBest, CandidateResult, ScoreOptions } from "./candidateScoring";
import { cacheAnchorEmbedding } from "./clipScoring";
import { LoraConfig } from "./loraTraining";

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
 * Generate a story page image with multi-signal validation:
 *
 *   Pass A — Background plate (no characters)
 *   Pass B — Inpaint Riri into foreground mask zone
 *   Pass C — Score with BLIP + CLIP + GroundingDINO; retry with seed variation
 *   Pass D — If no candidate passes, escalate to a larger mask and retry
 *
 * Validation signals:
 *   1. BLIP captioning — hard rejection gates (human, wrong animal, no rhino)
 *   2. CLIP similarity — compare candidate to anchor image (if anchorImageUrl provided)
 *   3. GroundingDINO  — detect "rhinoceros" in image (if enableDetection=true)
 *
 * CLIP and detection can RESCUE candidates that BLIP misidentified
 * (common with cartoon/illustrated content).
 *
 * LoRA support:
 *   If a LoraConfig is provided, the trained model version is used
 *   instead of base SDXL, and the trigger word is prepended to prompts.
 *   This gives consistent Riri appearance across all pages.
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
  anchorImageUrl?: string;
  enableDetection?: boolean;
  lora?: LoraConfig;
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
    anchorImageUrl,
    enableDetection = false,
    lora,
  } = opts;

  // ── 1. Resolve scene from page text (verbatim, never canonicalized) ──
  const scene = resolveSceneSetting(pageText, RIRI_BASE_MUST_INCLUDE, sceneCardFallback);
  const mustInclude = enforceMustInclude(scene.mustInclude, RIRI_BASE_MUST_INCLUDE);

  console.log(`[Page ${pageIndex}] Setting: "${scene.setting}"`);
  console.log(`[Page ${pageIndex}] Category: ${scene.category}`);
  console.log(`[Page ${pageIndex}] Must include: ${mustInclude.join(", ")}`);
  if (lora) console.log(`[Page ${pageIndex}] LoRA: ${lora.version.substring(0, 12)}... trigger="${lora.triggerWord}"`);
  if (anchorImageUrl) console.log(`[Page ${pageIndex}] CLIP anchor: ${anchorImageUrl.substring(0, 50)}...`);
  if (enableDetection) console.log(`[Page ${pageIndex}] GroundingDINO detection: ENABLED`);

  // ── 2. Cache CLIP anchor embedding (once per page, reused for all candidates) ──
  let cachedAnchorEmbedding: number[] | undefined;
  if (anchorImageUrl) {
    cachedAnchorEmbedding = await cacheAnchorEmbedding(replicate, anchorImageUrl);
  }

  // ── 3. Generate background plate (Pass A) ──
  const platePrompt = buildPlatePrompt(scene.setting, scene.styleHints);
  console.log(`[Page ${pageIndex}] Plate prompt (${platePrompt.split(" ").length} words)`);

  const plateUrl = await generatePlate(
    replicate,
    platePrompt,
    pageSeed,
    pageIndex,
    baseImageUrl,
    0.80,
    lora
  );

  if (!plateUrl) {
    console.error(`[Page ${pageIndex}] Plate generation failed`);
    return { url: "", score: -999, caption: "", reasons: ["plate failed"] };
  }

  // ── 4. Build masks: initial + escalated (larger) ──
  const [initialMask, escalatedMask] = await Promise.all([
    makeRiriZoneMaskDataUrl(1024),
    makeRiriZoneLargeMaskDataUrl(1024),
  ]);

  // ── 5. Build compact character-first prompt ──
  const characterPrompt = buildCharacterFirstPrompt(action, scene.setting);
  console.log(`[Page ${pageIndex}] Character prompt (${characterPrompt.split(" ").length} words)`);

  // ── 6. Generate + score candidates with multi-signal validation ──
  const scoreOpts: ScoreOptions = {
    mustInclude,
    requireMustIncludeCount: Math.min(2, mustInclude.length),
    anchorImageUrl,
    cachedAnchorEmbedding,
    enableDetection,
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
        mustInclude,
        lora
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
    `[Page ${pageIndex}] Final: score=${result.score}, caption="${result.caption}"` +
    (result.clipSimilarity !== undefined ? `, clip=${result.clipSimilarity.toFixed(3)}` : "") +
    (result.detectionConfidence !== undefined ? `, det=${result.detectionConfidence.toFixed(2)}` : "")
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
  lora?: LoraConfig;
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
    0.80,
    opts.lora
  );
}
