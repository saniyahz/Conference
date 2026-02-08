/**
 * Image generation API route — REWRITTEN to use plate → inpaint → accept gate.
 *
 * OLD: plain txt2img → whatever SDXL invents gets shipped (person, mouse, cat)
 * NEW: plate (background) → inpaint (Riri only) → BLIP score → accept gate
 *      → rejected images return "" → caller shows placeholder
 *
 * Same API contract:
 *   POST { imagePrompts, negativePrompts?, seed?, seeds? }
 *   →    { imageUrls, seed, seeds }
 *
 * The imagePrompts are used for scene classification only.
 * The actual prompts are built by the pipeline (plate = setting, inpaint = character).
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
// ── Library imports (adjust path to match your project structure) ──
import { generatePlate, generateInpaintCharacter } from "../../../src/lib/imageGeneration";
import { makeRiriZoneMaskDataUrl, makeRiriZoneLargeMaskDataUrl } from "../../../src/lib/maskGenerator";
import { resolveSceneSetting, enforceMustInclude } from "../../../src/lib/sceneSettings";
import { scoreCandidate, CandidateResult, ScoreOptions } from "../../../src/lib/candidateScoring";
import { buildPlateNegative, buildInpaintCharacterNegative, sanitizeNegatives } from "../../../src/lib/negativePrompts";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── CONFIG ──────────────────────────────────────────────────────────────

const RIRI_MUST_INCLUDE = ["rhinoceros", "Riri"];
const CANDIDATES_PER_ROUND = 3;
const SEED_STRIDE = 29;

/** Character-only inpaint prompt. NO scene objects, NO action. */
const CHARACTER_PROMPT = [
  "Riri, cute gray rhinoceros, full body, standing",
  "centered foreground",
  "simple children's illustration, flat colors, bold outline",
  "match background lighting, only one rhino, no text",
].join(", ");

/** Build a plate prompt from scene classification. */
function buildPlatePrompt(
  setting: string,
  styleHints: string,
  sceneObjects: string[]
): string {
  const parts = [setting];
  if (sceneObjects.length > 0) parts.push(sceneObjects.join(", "));
  parts.push(styleHints);
  parts.push("simple children's illustration, flat colors, bold outline, minimal detail");
  parts.push("no characters, no animals, no people, no text");
  return parts.join(", ");
}

// ─── SINGLE PAGE: PLATE → INPAINT → SCORE → ACCEPT ─────────────────────

async function generateOnePage(
  pagePrompt: string,
  pageIndex: number,
  seed: number,
  customNegative?: string
): Promise<{ url: string; accepted: boolean; caption: string; score: number }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`========== PAGE ${pageIndex + 1}: PLATE → INPAINT → SCORE ==========`);

  // ── 1. Classify scene from the incoming prompt text ──
  const scene = resolveSceneSetting(pagePrompt, RIRI_MUST_INCLUDE);
  const allMustInclude = enforceMustInclude(scene.mustInclude, RIRI_MUST_INCLUDE);
  const ririLower = new Set(RIRI_MUST_INCLUDE.map((s) => s.toLowerCase()));
  const sceneObjects = allMustInclude.filter((item) => !ririLower.has(item.toLowerCase()));

  console.log(`[Page ${pageIndex + 1}] Scene: "${scene.setting}" (${scene.category})`);
  console.log(`[Page ${pageIndex + 1}] Plate objects: [${sceneObjects.join(", ")}]`);

  // ── 2. Generate plate (background only — no character) ──
  const platePrompt = buildPlatePrompt(scene.setting, scene.styleHints, sceneObjects);
  console.log(`[Page ${pageIndex + 1}] Plate prompt: "${platePrompt}"`);

  const plateUrl = await generatePlate(replicate, platePrompt, seed, pageIndex, undefined, 0.80);
  if (!plateUrl) {
    console.error(`[Page ${pageIndex + 1}] PLATE FAILED`);
    return { url: "", accepted: false, caption: "", score: -999 };
  }
  console.log(`[Page ${pageIndex + 1}] Plate OK: ${plateUrl.substring(0, 60)}...`);

  // ── 3. Build masks ──
  const [initialMask, escalatedMask] = await Promise.all([
    makeRiriZoneMaskDataUrl(1024),
    makeRiriZoneLargeMaskDataUrl(1024),
  ]);

  // ── 4. Score options (character-only check) ──
  const scoreOpts: ScoreOptions = {
    mustInclude: RIRI_MUST_INCLUDE,
    requireMustIncludeCount: 1,
  };

  // ── 5. Round 1: 3 candidates in parallel ──
  console.log(`[Page ${pageIndex + 1}] Round 1: ${CANDIDATES_PER_ROUND} candidates in parallel...`);
  const round1 = await runCandidateRound(
    plateUrl, initialMask, seed, CANDIDATES_PER_ROUND, pageIndex, scoreOpts, allMustInclude, scene.setting
  );
  const accepted1 = round1.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted1.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 1: score=${accepted1[0].score}`);
    return accepted1[0];
  }

  // ── 6. Round 2: escalated mask ──
  console.log(`[Page ${pageIndex + 1}] Round 2: ESCALATED mask...`);
  const round2Seed = seed + CANDIDATES_PER_ROUND * SEED_STRIDE;
  const round2 = await runCandidateRound(
    plateUrl, escalatedMask, round2Seed, CANDIDATES_PER_ROUND, pageIndex, scoreOpts, allMustInclude, scene.setting
  );
  const accepted2 = round2.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted2.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 2: score=${accepted2[0].score}`);
    return accepted2[0];
  }

  // ── 7. No candidate accepted → return EMPTY ──
  const allCandidates = [...round1, ...round2];
  console.warn(
    `[Page ${pageIndex + 1}] WARNING: No candidate accepted after ${allCandidates.length} tries. ` +
    `Returning EMPTY — caller must show placeholder.`
  );
  return { url: "", accepted: false, caption: "", score: -999 };
}

async function runCandidateRound(
  plateUrl: string,
  maskDataUrl: string,
  baseSeed: number,
  count: number,
  pageIndex: number,
  scoreOpts: ScoreOptions,
  mustInclude: string[],
  settingContext: string
): Promise<CandidateResult[]> {
  const tasks = Array.from({ length: count }, async (_, i) => {
    const seed = baseSeed + i * SEED_STRIDE;

    console.log(`[Page ${pageIndex + 1}] Candidate ${i + 1}/${count} seed=${seed} [INPAINT strength=0.65]`);

    const url = await generateInpaintCharacter(
      replicate, CHARACTER_PROMPT, plateUrl, maskDataUrl,
      seed, pageIndex, settingContext, mustInclude
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

// ─── API ROUTE ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { imagePrompts, negativePrompts, seed, seeds } = await request.json();

    if (!imagePrompts || !Array.isArray(imagePrompts)) {
      return NextResponse.json({ error: "Invalid image prompts provided" }, { status: 400 });
    }
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "Replicate API token not configured" }, { status: 500 });
    }

    const storySeed = seed || Math.floor(Math.random() * 1000000);
    console.log(`[Book] Base seed: ${storySeed}, ${imagePrompts.length} pages`);

    const imageUrls: string[] = [];
    const usedSeeds: number[] = [];

    // Generate 2 pages at a time (bounded concurrency)
    const PAGE_CONCURRENCY = 2;
    const results: Array<{ url: string; accepted: boolean }> = new Array(imagePrompts.length);
    let nextIdx = 0;

    async function worker() {
      while (nextIdx < imagePrompts.length) {
        const i = nextIdx++;
        const pageSeed = seeds?.[i] ?? storySeed + i * 1000;
        const customNeg = negativePrompts?.[i];
        usedSeeds[i] = pageSeed;

        console.log(`\n========== GENERATING PAGE ${i + 1}/${imagePrompts.length} ==========`);
        results[i] = await generateOnePage(imagePrompts[i], i, pageSeed, customNeg);
      }
    }

    const workers = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, imagePrompts.length) },
      () => worker()
    );
    await Promise.all(workers);

    // Build response
    for (let i = 0; i < imagePrompts.length; i++) {
      imageUrls.push(results[i]?.url || "");
    }

    const successCount = imageUrls.filter((u) => u).length;
    console.log(`\n========== IMAGE GENERATION COMPLETE ==========`);
    console.log(`Accepted: ${successCount}/${imagePrompts.length} images`);
    console.log(`Failed: ${imagePrompts.length - successCount} (returned empty URL — show placeholder)`);
    console.log(`Seeds: ${usedSeeds.join(", ")}`);
    console.log(`==============================================\n`);

    return NextResponse.json({ imageUrls, seed: storySeed, seeds: usedSeeds });
  } catch (error) {
    console.error("Error in image generation:", error);
    return NextResponse.json({ error: "Failed to generate images" }, { status: 500 });
  }
}
