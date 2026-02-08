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

  /** Max pages generating concurrently. Default: 2 */
  pageConcurrency?: number;
}

// ─── CONFIG ─────────────────────────────────────────────────────────────

const RIRI_MUST_INCLUDE = ["rhinoceros", "Riri"];
const CANDIDATES_PER_ROUND = 3;
const SEED_STRIDE = 29;  // prime, wide spread

// ─── PROMPT BUILDERS ────────────────────────────────────────────────────

/**
 * INPAINT prompt = CHARACTER ONLY.
 *
 * No rocket. No waterfall. No dolphins. No action. No setting.
 * Scene objects belong in the plate — the inpaint pass only paints
 * the character into the mask zone.
 */
function buildCharacterPrompt(lora?: LoraConfig): string {
  let prompt = [
    "Riri, cute gray rhinoceros, full body, standing",
    "centered foreground",
    "simple children's illustration, flat colors, bold outline",
    "match background lighting, only one rhino, no text",
  ].join(", ");

  if (lora) {
    prompt = prependTriggerWord(prompt, lora.triggerWord);
  }

  return prompt;
}

/**
 * PLATE prompt = OBJECTS + SETTING only.
 *
 * Scene objects (rocket ship, waterfall, dolphins) go here.
 * No characters — the plate is a clean background.
 */
function buildScenePlatePrompt(
  setting: string,
  styleHints: string,
  sceneObjects: string[] = []
): string {
  const parts = [setting];
  if (sceneObjects.length > 0) {
    parts.push(sceneObjects.join(", "));
  }
  parts.push(styleHints);
  parts.push("simple children's illustration, flat colors, bold outline, minimal detail");
  parts.push("no characters, no animals, no people, no text");
  return parts.join(", ");
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
  const allMustInclude = enforceMustInclude(scene.mustInclude, RIRI_MUST_INCLUDE);

  // Split mustInclude: scene objects → plate prompt, character → scoring
  // Scene objects (trees, waterfall, rocket) go in the plate only.
  // Scoring only checks that Riri is present — not scene objects.
  const ririLower = new Set(RIRI_MUST_INCLUDE.map((s) => s.toLowerCase()));
  const sceneObjects = allMustInclude.filter(
    (item) => !ririLower.has(item.toLowerCase())
  );

  console.log(`[Page ${pageIndex + 1}] Setting: "${scene.setting}"`);
  console.log(`[Page ${pageIndex + 1}] Category: ${scene.category}`);
  console.log(`[Page ${pageIndex + 1}] Scene objects (plate): [${sceneObjects.join(", ")}]`);
  console.log(`[Page ${pageIndex + 1}] Character check (scoring): [${RIRI_MUST_INCLUDE.join(", ")}]`);
  if (lora) console.log(`[Page ${pageIndex + 1}] LoRA: trigger="${lora.triggerWord}"`);
  if (anchorImageUrl) console.log(`[Page ${pageIndex + 1}] CLIP anchor: active`);
  if (enableDetection) console.log(`[Page ${pageIndex + 1}] GroundingDINO: active`);

  // ── 2. Generate plate (background + scene objects, no character) ──
  const platePrompt = buildScenePlatePrompt(scene.setting, scene.styleHints, sceneObjects);
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

  // ── 4. Build character prompt (CHARACTER ONLY — no scene objects) ──
  const charPrompt = buildCharacterPrompt(lora);
  console.log(`[Page ${pageIndex + 1}] Character prompt: "${charPrompt}"`);

  // ── 5. Candidate loop: inpaint + multi-signal score ──
  const allCandidates: CandidateResult[] = [];

  // Scoring only checks for character presence, not scene objects.
  // Scene objects are in the plate — they shouldn't fight the accept gate.
  const scoreOpts: ScoreOptions = {
    mustInclude: RIRI_MUST_INCLUDE,
    requireMustIncludeCount: 1, // just need "rhinoceros" or "Riri" confirmed
    anchorImageUrl,
    cachedAnchorEmbedding,
    enableDetection,
  };

  // Round 1: initial mask — run ALL candidates, pick BEST accepted
  console.log(`\n[Page ${pageIndex + 1}] --- Round 1: initial mask ---`);
  const round1Candidates = await runCandidateRound(
    replicate, charPrompt, plateUrl, initialMask,
    baseSeed, CANDIDATES_PER_ROUND, pageIndex, allMustInclude, scene.setting, scoreOpts, lora
  );
  allCandidates.push(...round1Candidates);

  const accepted1 = round1Candidates.filter((x) => x.accepted);
  if (accepted1.length > 0) {
    accepted1.sort((a, b) => b.score - a.score);
    console.log(`[Page ${pageIndex + 1}] Best accepted from round 1: score=${accepted1[0].score} (${accepted1.length} accepted)`);
    return buildPageResult(pageIndex, plateUrl, accepted1[0]);
  }

  // Round 2: escalated (larger) mask — run ALL, pick BEST accepted
  console.log(`\n[Page ${pageIndex + 1}] --- Round 2: ESCALATED mask ---`);
  const round2Seed = baseSeed + CANDIDATES_PER_ROUND * SEED_STRIDE;
  const round2Candidates = await runCandidateRound(
    replicate, charPrompt, plateUrl, escalatedMask,
    round2Seed, CANDIDATES_PER_ROUND, pageIndex, allMustInclude, scene.setting, scoreOpts, lora
  );
  allCandidates.push(...round2Candidates);

  const accepted2 = allCandidates.filter((x) => x.accepted);
  if (accepted2.length > 0) {
    accepted2.sort((a, b) => b.score - a.score);
    console.log(`[Page ${pageIndex + 1}] Best accepted from round 2: score=${accepted2[0].score} (${accepted2.length} accepted)`);
    return buildPageResult(pageIndex, plateUrl, accepted2[0]);
  }

  // No candidate passed — return EMPTY URL so caller cannot use rejected image.
  // The caller must check result.accepted or result.finalUrl before displaying.
  const bestReject = allCandidates.length > 0 ? allCandidates.sort((a, b) => b.score - a.score)[0] : null;

  console.warn(
    `[Page ${pageIndex + 1}] WARNING: No candidate accepted after ${allCandidates.length} tries. ` +
    `Best reject: score=${bestReject?.score ?? "N/A"}, reason="${bestReject?.rejectReason ?? "none"}". ` +
    `Returning EMPTY — caller must handle this as a failed page.`
  );

  return {
    pageIndex,
    plateUrl,
    finalUrl: "",  // EMPTY — never ship a rejected image
    score: -999,
    accepted: false,
    rejectReason: bestReject?.rejectReason ?? "no candidates generated",
    caption: bestReject?.caption ?? "",
    mode: "INPAINT",
    reasons: bestReject?.reasons ?? ["all candidates rejected"],
  };
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
): Promise<CandidateResult[]> {
  // Run ALL candidates in parallel — biggest speed win.
  // Each candidate: generate (~20s) + score (~15s) = ~35s serial.
  // 3 candidates sequential = ~105s. Parallel = ~35s.
  console.log(`[Page ${pageIndex + 1}] Generating ${count} candidates in parallel...`);

  const tasks = Array.from({ length: count }, async (_, i) => {
    const seed = baseSeed + i * SEED_STRIDE;

    console.log(`[Page ${pageIndex + 1}] Candidate ${i + 1}/${count} seed=${seed} [MODE] INPAINT strength=0.65`);

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
      return null;
    }

    const result = await scoreCandidate(replicate, url, scoreOpts);

    console.log(
      `[Page ${pageIndex + 1}] Candidate ${i + 1}: ` +
      `${result.accepted ? "ACCEPTED" : "REJECTED"} score=${result.score}` +
      (result.rejectReason ? ` reason="${result.rejectReason}"` : "")
    );

    return result;
  });

  const results = await Promise.all(tasks);
  return results.filter((r): r is CandidateResult => r !== null);
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
 * Pages run with bounded concurrency (default 2) to stay within
 * Replicate rate limits while cutting total time roughly in half.
 *
 * Options:
 *   anchorImageUrl  — Riri reference for CLIP similarity (recommended)
 *   enableDetection — Run GroundingDINO for rhinoceros detection
 *   lora            — Use fine-tuned model for consistent character
 *   masterSeed      — Base seed for reproducibility (default: 42)
 *   pageConcurrency — Max pages generating at once (default: 2)
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
    pageConcurrency = 2,
  } = opts;

  const replicate = new Replicate();

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

  console.log(`[Book] Generating ${storyPages.length} pages (concurrency=${pageConcurrency})`);

  // Run pages with bounded concurrency
  const results: PageResult[] = new Array(storyPages.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < storyPages.length) {
      const i = nextIndex++;
      const pageSeed = masterSeed + i * 1000;
      const result = await generateOnePage(
        replicate,
        storyPages[i],
        i,
        pageSeed,
        { anchorImageUrl, enableDetection, lora, cachedAnchorEmbedding }
      );
      results[i] = result;

      console.log(
        `\n[SUMMARY Page ${i + 1}] mode=${result.mode} score=${result.score} ` +
        `url=${result.finalUrl ? "OK" : "FAILED"}` +
        (result.clipSimilarity !== undefined ? ` clip=${result.clipSimilarity.toFixed(3)}` : "") +
        (result.detectionConfidence !== undefined ? ` det=${result.detectionConfidence.toFixed(2)}` : "")
      );
    }
  }

  // Launch N workers that pull from the shared index
  const workers = Array.from(
    { length: Math.min(pageConcurrency, storyPages.length) },
    () => worker()
  );
  await Promise.all(workers);

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
