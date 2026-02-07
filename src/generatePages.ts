/**
 * MAIN ENTRY POINT — Drop-in replacement for your page generation loop.
 *
 * This is the script your app should call instead of the old loop that
 * uses generateImageWithAnchor(). Every character insertion goes through
 * generateInpaintCharacter() with a mask. No img2img path exists here.
 *
 * Multi-signal validation:
 *   1. BLIP captioning — hard rejection gates
 *   2. CLIP similarity — compare to Riri anchor image (optional)
 *   3. GroundingDINO   — detect "rhinoceros" in image (optional)
 *
 * LoRA support:
 *   Pass a LoraConfig to use a fine-tuned model with consistent Riri identity.
 *
 * Usage:
 *   import { generateAllPages } from "./generatePages";
 *   const results = await generateAllPages(storyPages, {
 *     anchorImageUrl: "https://...",  // Riri reference for CLIP
 *     enableDetection: true,          // GroundingDINO validation
 *   });
 *
 * Or run directly:
 *   REPLICATE_API_TOKEN=... npx ts-node src/generatePages.ts
 */

import Replicate from "replicate";
import { makeRiriZoneMaskDataUrl, makeRiriZoneLargeMaskDataUrl } from "./lib/maskGenerator";
import { generatePlate, generateInpaintCharacter } from "./lib/imageGeneration";
import { resolveSceneSetting, enforceMustInclude } from "./lib/sceneSettings";
import { scoreCandidate, CandidateResult, ScoreOptions } from "./lib/candidateScoring";
import { cacheAnchorEmbedding } from "./lib/clipScoring";
import { LoraConfig, prependTriggerWord } from "./lib/loraTraining";

// ─── TYPES ──────────────────────────────────────────────────────────────

export interface StoryPage {
  pageText: string;
  action: string;         // what Riri is doing: "exploring the forest"
  sceneCardFallback?: string;
}

export interface PageResult {
  pageIndex: number;
  plateUrl: string;
  finalUrl: string;
  score: number;
  accepted: boolean;
  rejectReason: string;
  caption: string;
  mode: string;           // always "INPAINT" — logged proof
  reasons: string[];
  clipSimilarity?: number;
  detectionConfidence?: number;
  detectionBboxArea?: number;
}

export interface GenerationOptions {
  /** Riri reference image URL for CLIP similarity scoring */
  anchorImageUrl?: string;

  /** Enable GroundingDINO rhinoceros detection as validation signal */
  enableDetection?: boolean;

  /** LoRA config for consistent Riri character identity */
  lora?: LoraConfig;

  /** Master seed for reproducibility. Default: 42 */
  masterSeed?: number;
}

// ─── CONFIG ─────────────────────────────────────────────────────────────

const RIRI_MUST_INCLUDE = ["rhinoceros", "Riri"];
const CANDIDATES_PER_ROUND = 3;
const SEED_STRIDE = 29;  // prime, wide spread

// ─── PROMPT BUILDERS ────────────────────────────────────────────────────

function buildCharacterPrompt(action: string, setting: string, lora?: LoraConfig): string {
  // ~35 words. Character tokens first. No meta-labels.
  let prompt = [
    "Riri, cute gray rhinoceros, one small rounded horn, big friendly eyes, thick gray skin, full body visible",
    "centered foreground, occupies 45% of frame",
    action,
    `matching ${setting} lighting and perspective`,
    "2D children's picture book, bold clean outlines, flat cel shading, vibrant pastel colors",
    "only one rhinoceros, no humans, no text",
  ].join(", ");

  // Prepend LoRA trigger word if active
  if (lora) {
    prompt = prependTriggerWord(prompt, lora.triggerWord);
  }

  return prompt;
}

function buildScenePlatePrompt(setting: string, styleHints: string): string {
  return [
    setting,
    styleHints,
    "2D children's picture book, bold clean outlines, flat cel shading, vibrant pastel colors",
    "empty scene, no characters, no animals, no people",
    "wide establishing shot",
    "no text, no watermark",
  ].join(", ");
}

// ─── SINGLE PAGE GENERATION ─────────────────────────────────────────────

/**
 * Generate one page. This is the function you call per page.
 *
 * Flow:
 *   1. Resolve scene from page text (verbatim, never canonicalized)
 *   2. Generate background plate (txt2img or img2img, no characters)
 *   3. Build foreground mask (Riri zone)
 *   4. INPAINT Riri into the mask zone (image + mask + prompt_strength 0.65)
 *   5. Score with BLIP + CLIP + GroundingDINO (multi-signal)
 *   6. If rejected: retry with different seed (up to 3x)
 *   7. If still rejected: escalate to larger mask, retry 3x more
 *   8. Return best candidate
 *
 * There is NO img2img character path. Every character call uses
 * generateInpaintCharacter() which requires a mask and throws if
 * the mask is missing.
 */
export async function generateOnePage(
  replicate: Replicate,
  page: StoryPage,
  pageIndex: number,
  baseSeed: number,
  genOpts: GenerationOptions & { cachedAnchorEmbedding?: number[] } = {}
): Promise<PageResult> {
  const { anchorImageUrl, enableDetection, lora, cachedAnchorEmbedding } = genOpts;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`========== INPAINT PAGE ${pageIndex + 1} ==========`);
  console.log(`${"=".repeat(60)}`);

  // ── 1. Scene resolution ──
  const scene = resolveSceneSetting(
    page.pageText,
    RIRI_MUST_INCLUDE,
    page.sceneCardFallback
  );
  const mustInclude = enforceMustInclude(scene.mustInclude, RIRI_MUST_INCLUDE);

  console.log(`[Page ${pageIndex + 1}] Setting (verbatim): "${scene.setting}"`);
  console.log(`[Page ${pageIndex + 1}] Category tag: ${scene.category}`);
  console.log(`[Page ${pageIndex + 1}] Must include: [${mustInclude.join(", ")}]`);
  if (lora) console.log(`[Page ${pageIndex + 1}] LoRA: trigger="${lora.triggerWord}"`);
  if (anchorImageUrl) console.log(`[Page ${pageIndex + 1}] CLIP anchor: active`);
  if (enableDetection) console.log(`[Page ${pageIndex + 1}] GroundingDINO: active`);

  // ── 2. Generate plate (background only) ──
  const platePrompt = buildScenePlatePrompt(scene.setting, scene.styleHints);
  console.log(`[Page ${pageIndex + 1}] Plate prompt: "${platePrompt}"`);

  const plateUrl = await generatePlate(
    replicate,
    platePrompt,
    baseSeed,
    pageIndex,
    undefined, // no base image for plate
    0.80,
    lora
  );

  if (!plateUrl) {
    console.error(`[Page ${pageIndex + 1}] PLATE FAILED — cannot continue`);
    return {
      pageIndex,
      plateUrl: "",
      finalUrl: "",
      score: -999,
      accepted: false,
      rejectReason: "plate generation failed",
      caption: "",
      mode: "PLATE_FAILED",
      reasons: ["plate generation failed"],
    };
  }

  console.log(`[Page ${pageIndex + 1}] Plate OK: ${plateUrl}`);

  // ── 3. Build masks ──
  const [initialMask, escalatedMask] = await Promise.all([
    makeRiriZoneMaskDataUrl(1024),
    makeRiriZoneLargeMaskDataUrl(1024),
  ]);

  // ── 4. Build character prompt ──
  const charPrompt = buildCharacterPrompt(page.action, scene.setting, lora);
  console.log(`[Page ${pageIndex + 1}] Character prompt: "${charPrompt}"`);

  // ── 5. Candidate loop: inpaint + multi-signal score ──
  const allCandidates: CandidateResult[] = [];

  // Build score options with must-include enforcement + CLIP + detection
  const scoreOpts: ScoreOptions = {
    mustInclude,
    requireMustIncludeCount: Math.min(2, mustInclude.length),
    anchorImageUrl,
    cachedAnchorEmbedding,
    enableDetection,
  };

  // Round 1: initial mask
  console.log(`\n[Page ${pageIndex + 1}] --- Round 1: initial mask ---`);
  const round1Result = await runCandidateRound(
    replicate, charPrompt, plateUrl, initialMask,
    baseSeed, CANDIDATES_PER_ROUND, pageIndex, mustInclude, scene.setting, scoreOpts, lora
  );
  allCandidates.push(...round1Result.candidates);
  if (round1Result.accepted) {
    return buildPageResult(pageIndex, plateUrl, round1Result.accepted);
  }

  // Round 2: escalated (larger) mask
  console.log(`\n[Page ${pageIndex + 1}] --- Round 2: ESCALATED mask ---`);
  const round2Seed = baseSeed + CANDIDATES_PER_ROUND * SEED_STRIDE;
  const round2Result = await runCandidateRound(
    replicate, charPrompt, plateUrl, escalatedMask,
    round2Seed, CANDIDATES_PER_ROUND, pageIndex, mustInclude, scene.setting, scoreOpts, lora
  );
  allCandidates.push(...round2Result.candidates);
  if (round2Result.accepted) {
    return buildPageResult(pageIndex, plateUrl, round2Result.accepted);
  }

  // No candidate passed — return best of all
  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates[0] || {
    url: "", score: -999, accepted: false,
    rejectReason: "no candidates", caption: "", reasons: ["no candidates"],
  };

  console.warn(
    `[Page ${pageIndex + 1}] WARNING: No candidate accepted. ` +
    `Best score: ${best.score}. Reject: ${best.rejectReason}. ` +
    `Returning best of ${allCandidates.length}.`
  );

  return buildPageResult(pageIndex, plateUrl, best);
}

// ─── CANDIDATE ROUND ────────────────────────────────────────────────────

async function runCandidateRound(
  replicate: Replicate,
  charPrompt: string,
  plateUrl: string,
  maskDataUrl: string,
  baseSeed: number,
  count: number,
  pageIndex: number,
  mustInclude: string[],
  settingContext: string,
  scoreOpts: ScoreOptions,
  lora?: LoraConfig
): Promise<{ candidates: CandidateResult[]; accepted: CandidateResult | null }> {
  const candidates: CandidateResult[] = [];

  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i * SEED_STRIDE;

    // This is the ONLY character generation call. It uses inpaint.
    // generateInpaintCharacter throws if mask is missing.
    console.log(`\n[Page ${pageIndex + 1}] Candidate ${i + 1}/${count} seed=${seed}`);
    console.log(`[MODE] INPAINT page=${pageIndex + 1} seed=${seed} strength=0.65 mask=present`);

    const url = await generateInpaintCharacter(
      replicate,
      charPrompt,
      plateUrl,
      maskDataUrl,
      seed,
      pageIndex,
      settingContext,
      mustInclude,
      lora
    );

    if (!url) {
      console.warn(`[Page ${pageIndex + 1}] Candidate ${i + 1} generation failed`);
      continue;
    }

    const result = await scoreCandidate(replicate, url, scoreOpts);
    candidates.push(result);

    if (result.accepted) {
      console.log(
        `[Page ${pageIndex + 1}] ACCEPTED candidate ${i + 1} ` +
        `(score ${result.score})`
      );
      return { candidates, accepted: result };
    }

    console.log(
      `[Page ${pageIndex + 1}] REJECTED candidate ${i + 1}: ${result.rejectReason}`
    );
  }

  return { candidates, accepted: null };
}

// ─── HELPERS ────────────────────────────────────────────────────────────

function buildPageResult(
  pageIndex: number,
  plateUrl: string,
  candidate: CandidateResult
): PageResult {
  return {
    pageIndex,
    plateUrl,
    finalUrl: candidate.url,
    score: candidate.score,
    accepted: candidate.accepted,
    rejectReason: candidate.rejectReason,
    caption: candidate.caption,
    mode: "INPAINT",
    reasons: candidate.reasons,
    clipSimilarity: candidate.clipSimilarity,
    detectionConfidence: candidate.detectionConfidence,
    detectionBboxArea: candidate.detectionBboxArea,
  };
}

// ─── FULL BOOK GENERATION ───────────────────────────────────────────────

/**
 * Generate all pages of a story book with multi-signal validation.
 *
 * Call this from your app instead of your existing page loop.
 * Every page goes through: plate → inpaint → score → retry.
 * There is no img2img character path.
 *
 * Options:
 *   anchorImageUrl  — Riri reference for CLIP similarity (recommended)
 *   enableDetection — Run GroundingDINO for rhinoceros detection
 *   lora            — Use fine-tuned model for consistent character
 *   masterSeed      — Base seed for reproducibility (default: 42)
 */
export async function generateAllPages(
  storyPages: StoryPage[],
  opts: GenerationOptions = {}
): Promise<PageResult[]> {
  const {
    anchorImageUrl,
    enableDetection,
    lora,
    masterSeed = 42,
  } = opts;

  const replicate = new Replicate();
  const results: PageResult[] = [];

  // Cache CLIP anchor embedding once for the entire book
  let cachedAnchorEmbedding: number[] | undefined;
  if (anchorImageUrl) {
    console.log(`[Book] Caching CLIP anchor embedding for: ${anchorImageUrl}`);
    cachedAnchorEmbedding = await cacheAnchorEmbedding(replicate, anchorImageUrl);
    if (cachedAnchorEmbedding.length > 0) {
      console.log(`[Book] CLIP anchor cached (${cachedAnchorEmbedding.length} dims)`);
    } else {
      console.warn(`[Book] CLIP anchor caching failed — CLIP scoring disabled`);
    }
  }

  if (lora) {
    console.log(`[Book] LoRA active: version=${lora.version.substring(0, 12)}..., trigger="${lora.triggerWord}"`);
  }
  if (enableDetection) {
    console.log(`[Book] GroundingDINO rhinoceros detection: ENABLED`);
  }

  for (let i = 0; i < storyPages.length; i++) {
    const pageSeed = masterSeed + i * 1000; // large offset between pages
    const result = await generateOnePage(
      replicate,
      storyPages[i],
      i,
      pageSeed,
      { anchorImageUrl, enableDetection, lora, cachedAnchorEmbedding }
    );
    results.push(result);

    console.log(
      `\n[SUMMARY Page ${i + 1}] mode=${result.mode} score=${result.score} ` +
      `url=${result.finalUrl ? "OK" : "FAILED"}` +
      (result.clipSimilarity !== undefined ? ` clip=${result.clipSimilarity.toFixed(3)}` : "") +
      (result.detectionConfidence !== undefined ? ` det=${result.detectionConfidence.toFixed(2)}` : "")
    );
  }

  // Final summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("GENERATION COMPLETE");
  console.log(`${"=".repeat(60)}`);
  for (const r of results) {
    console.log(
      `  Page ${r.pageIndex + 1}: mode=${r.mode} score=${r.score} ` +
      `caption="${r.caption.substring(0, 60)}..."` +
      (r.clipSimilarity !== undefined ? ` clip=${r.clipSimilarity.toFixed(3)}` : "") +
      (r.detectionConfidence !== undefined ? ` det=${r.detectionConfidence.toFixed(2)}` : "")
    );
  }

  return results;
}

// ─── CLI ENTRY POINT ────────────────────────────────────────────────────

// Run directly: REPLICATE_API_TOKEN=... npx ts-node src/generatePages.ts
if (require.main === module) {
  const examplePages: StoryPage[] = [
    {
      pageText: "Riri wandered through a lush forest with winding streams and a cascading waterfall.",
      action: "walking through the forest, looking at the waterfall with wonder",
    },
    {
      pageText: "By the ocean shore, Riri found a hidden cave behind the crashing waves.",
      action: "standing on the beach, peering into a sea cave",
    },
    {
      pageText: "High in the mountains, Riri discovered a field of wildflowers under the starlit sky.",
      action: "standing in a mountain meadow at night, gazing at the stars",
    },
  ];

  // Enable all validation signals if anchor URL is provided via env
  const anchorImageUrl = process.env.RIRI_ANCHOR_URL;
  const enableDetection = process.env.ENABLE_DETECTION === "true";
  const loraVersion = process.env.RIRI_LORA_VERSION;
  const loraTrigger = process.env.RIRI_LORA_TRIGGER || "RIRI";

  const opts: GenerationOptions = {
    anchorImageUrl,
    enableDetection,
  };

  if (loraVersion) {
    opts.lora = {
      version: loraVersion,
      triggerWord: loraTrigger,
      loraScale: 0.8,
    };
  }

  generateAllPages(examplePages, opts)
    .then((results) => {
      console.log("\nDone. Results:", JSON.stringify(results, null, 2));
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
