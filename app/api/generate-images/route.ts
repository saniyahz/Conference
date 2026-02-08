/**
 * Image generation API route — plate → inpaint → accept gate pipeline.
 *
 * OLD: plain txt2img → whatever SDXL invents gets shipped (person, mouse, cat)
 * NEW: plate (background) → inpaint (character only) → BLIP score → accept gate
 *      → rejected images return "" → caller shows placeholder
 *
 * API contract:
 *   POST { imagePrompts, negativePrompts?, seed?, seeds?, characterBible? }
 *   →    { imageUrls, seed, seeds }
 *
 * The imagePrompts are used for scene classification only.
 * The actual prompts are built by the pipeline (plate = setting, inpaint = character).
 *
 * If characterBible is provided (from generate-story), character identity is
 * extracted from it. Otherwise falls back to generic animal detection from prompt text.
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { CharacterBible } from "@/lib/visual-types";
// ── Pipeline imports ──
import { generatePlate, generateInpaintCharacter } from "@/src/lib/imageGeneration";
import { makeRiriZoneMaskDataUrl, makeRiriZoneLargeMaskDataUrl } from "@/src/lib/maskGenerator";
import { resolveSceneSetting, enforceMustInclude } from "@/src/lib/sceneSettings";
import { scoreCandidate, CandidateResult, ScoreOptions } from "@/src/lib/candidateScoring";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ─── CONFIG ──────────────────────────────────────────────────────────────

const CANDIDATES_PER_ROUND = 3;
const SEED_STRIDE = 29;
const PAGE_CONCURRENCY = 2;

// ─── CHARACTER IDENTITY ─────────────────────────────────────────────────

interface CharacterIdentity {
  name: string;
  species: string;
  mustInclude: string[];
  inpaintPrompt: string;
}

/**
 * Extract character identity from CharacterBible (if provided) or fall back to defaults.
 * This makes the pipeline work for ANY animal character, not just Riri.
 */
function extractCharacterIdentity(bible?: CharacterBible): CharacterIdentity {
  if (bible && bible.species) {
    const name = bible.name || "Character";
    const species = bible.species;
    const fingerprint = bible.visual_fingerprint?.join(", ") || `cute cartoon ${species}`;

    return {
      name,
      species,
      mustInclude: [species, name],
      inpaintPrompt: [
        `${name}, ${fingerprint}, full body, standing`,
        "centered foreground",
        "simple children's illustration, flat colors, bold outline",
        "match background lighting, no text",
      ].join(", "),
    };
  }

  // Fallback: generic — caller didn't provide characterBible
  return {
    name: "Character",
    species: "animal",
    mustInclude: ["animal"],
    inpaintPrompt: [
      "cute cartoon animal character, full body, standing",
      "centered foreground",
      "simple children's illustration, flat colors, bold outline",
      "match background lighting, no text",
    ].join(", "),
  };
}

// ─── PLATE PROMPT BUILDER ───────────────────────────────────────────────

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
  identity: CharacterIdentity,
  customNegative?: string
): Promise<{ url: string; accepted: boolean; caption: string; score: number }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`========== PAGE ${pageIndex + 1}: PLATE → INPAINT → SCORE ==========`);
  console.log(`[Page ${pageIndex + 1}] Character: ${identity.name} (${identity.species})`);

  // ── 1. Classify scene from the incoming prompt text ──
  const scene = resolveSceneSetting(pagePrompt, identity.mustInclude);
  const allMustInclude = enforceMustInclude(scene.mustInclude, identity.mustInclude);
  const identityLower = new Set(identity.mustInclude.map((s) => s.toLowerCase()));
  const sceneObjects = allMustInclude.filter((item) => !identityLower.has(item.toLowerCase()));

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
    mustInclude: identity.mustInclude,
    requireMustIncludeCount: 1,
  };

  // ── 5. Round 1: 3 candidates in parallel ──
  console.log(`[Page ${pageIndex + 1}] Round 1: ${CANDIDATES_PER_ROUND} candidates in parallel...`);
  const round1 = await runCandidateRound(
    plateUrl, initialMask, seed, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, allMustInclude, scene.setting, identity
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
    plateUrl, escalatedMask, round2Seed, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, allMustInclude, scene.setting, identity
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
  settingContext: string,
  identity: CharacterIdentity
): Promise<CandidateResult[]> {
  const tasks = Array.from({ length: count }, async (_, i) => {
    const seed = baseSeed + i * SEED_STRIDE;

    console.log(`[Page ${pageIndex + 1}] Candidate ${i + 1}/${count} seed=${seed} [INPAINT strength=0.65]`);

    const url = await generateInpaintCharacter(
      replicate, identity.inpaintPrompt, plateUrl, maskDataUrl,
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
    const { imagePrompts, negativePrompts, seed, seeds, characterBible } = await request.json();

    if (!imagePrompts || !Array.isArray(imagePrompts)) {
      return NextResponse.json({ error: "Invalid image prompts provided" }, { status: 400 });
    }
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "Replicate API token not configured" }, { status: 500 });
    }

    // Extract character identity from bible (species-aware)
    const identity = extractCharacterIdentity(characterBible as CharacterBible | undefined);
    console.log(`[Book] Character: ${identity.name} (${identity.species})`);
    console.log(`[Book] Inpaint prompt: "${identity.inpaintPrompt.substring(0, 80)}..."`);

    const storySeed = seed || Math.floor(Math.random() * 1000000);
    console.log(`[Book] Base seed: ${storySeed}, ${imagePrompts.length} pages`);

    const imageUrls: string[] = [];
    const usedSeeds: number[] = [];

    // Generate pages with bounded concurrency (2 at a time)
    const results: Array<{ url: string; accepted: boolean }> = new Array(imagePrompts.length);
    let nextIdx = 0;

    async function worker() {
      while (nextIdx < imagePrompts.length) {
        const i = nextIdx++;
        const pageSeed = seeds?.[i] ?? storySeed + i * 1000;
        const customNeg = negativePrompts?.[i];
        usedSeeds[i] = pageSeed;

        console.log(`\n========== GENERATING PAGE ${i + 1}/${imagePrompts.length} ==========`);
        results[i] = await generateOnePage(imagePrompts[i], i, pageSeed, identity, customNeg);
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
