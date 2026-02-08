/**
 * Image generation API route — plate → inpaint → accept gate pipeline.
 *
 * OLD: plain txt2img → whatever SDXL invents gets shipped (person, mouse, cat)
 * NEW: plate (background) → inpaint (character only) → BLIP score → accept gate
 *      → rejected images return "" → caller shows placeholder
 *
 * API contract:
 *   POST { imagePrompts, negativePrompts?, seed?, seeds?, characterBible?, sceneCards? }
 *   →    { imageUrls, seed, seeds }
 *
 * The imagePrompts are used for scene classification only.
 * The actual prompts are built by the pipeline (plate = setting, inpaint = character).
 *
 * If characterBible is provided (from generate-story), character identity is
 * extracted from it. Otherwise falls back to generic animal detection from prompt text.
 *
 * If sceneCards are provided, per-page must_include items are used for:
 *   1. Plate prompt — scene objects (rockets, dolphins, etc.) baked into background
 *   2. Scoring — BLIP caption checked for scene objects, not just character
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { CharacterBible, PageSceneCard } from "@/lib/visual-types";
// ── Pipeline imports ──
import { generatePlate, generateInpaintCharacter } from "@/src/lib/imageGeneration";
import { makeRiriZoneMaskDataUrl, makeRiriZoneLargeMaskDataUrl, makeRiriZoneExtraLargeMaskDataUrl } from "@/src/lib/maskGenerator";
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
 *
 * Species extraction priority:
 *   1. bible.species          ("rhinoceros")
 *   2. bible.character_type   ("Rhinoceros" — often set instead of species)
 *   3. bible.visual_fingerprint text scan (look for animal words)
 *   4. bible.name scan        ("Riri the Rhinoceros")
 *   5. Fallback: "animal"
 */
function extractCharacterIdentity(bible?: CharacterBible): CharacterIdentity {
  if (!bible) {
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

  const name = bible.name || "Character";

  // Extract species from multiple fields (character_type is often "Rhinoceros" while species is undefined)
  let species = bible.species || "";
  if (!species && bible.character_type) {
    // character_type can be the union literal ("animal") or the actual type name ("Rhinoceros")
    const ct = String(bible.character_type);
    if (!["human", "animal", "object", "creature", "other"].includes(ct.toLowerCase())) {
      species = ct.toLowerCase(); // "Rhinoceros" → "rhinoceros"
    }
  }
  if (!species) {
    // Scan visual fingerprint for species hints
    const fpText = (bible.visual_fingerprint || []).join(" ").toLowerCase();
    const animalMatch = fpText.match(/\b(rhinoceros|rhino|elephant|giraffe|lion|tiger|bear|rabbit|penguin|fox|deer|owl|dolphin|whale|turtle|frog|monkey|panda|zebra|hippo|koala)\b/);
    if (animalMatch) species = animalMatch[1];
  }
  if (!species) {
    // Scan name: "Riri the Rhinoceros"
    const nameMatch = name.toLowerCase().match(/\b(rhinoceros|rhino|elephant|giraffe|lion|tiger|bear|rabbit|penguin|fox|deer|owl|dolphin|whale|turtle|frog|monkey|panda|zebra|hippo|koala)\b/);
    if (nameMatch) species = nameMatch[1];
  }
  if (!species) species = "animal";

  console.log(`[Identity] Extracted species: "${species}" from bible (name="${name}", character_type="${bible.character_type}", species_field="${bible.species}")`);

  // Build a strong inpaint prompt — species repeated for emphasis
  const speciesCapitalized = species.charAt(0).toUpperCase() + species.slice(1);
  const inpaintPrompt = [
    `${name} the cute cartoon ${species}, a ${species}, full body, standing`,
    `${speciesCapitalized} character, centered foreground, large and prominent`,
    "simple children's illustration, flat colors, bold outline",
    `match background lighting, only one ${species}, no other animals, no text`,
  ].join(", ");

  return {
    name,
    species,
    mustInclude: [species, name],
    inpaintPrompt,
  };
}

// ─── SCENE OBJECT EXTRACTION ────────────────────────────────────────────

/**
 * Extract scene objects from a PageSceneCard's must_include / key_objects,
 * filtering out character-identity items (species, name).
 *
 * These objects (rocket, dolphins, rainbow, etc.) go into:
 *   1. Plate prompt — so the background contains them
 *   2. Scoring — so BLIP caption is checked for them
 */
function extractSceneObjects(
  card: PageSceneCard | undefined,
  identity: CharacterIdentity
): string[] {
  if (!card) return [];

  const identityLower = new Set(
    identity.mustInclude.map((s) => s.toLowerCase())
  );
  // Also filter out items that are just character descriptions
  const isCharacterItem = (item: string): boolean => {
    const lower = item.toLowerCase();
    if (identityLower.has(lower)) return true;
    // Filter "Riri the rhinoceros full body" type items
    if (lower.includes(identity.name.toLowerCase())) return true;
    if (lower.includes(identity.species.toLowerCase()) && lower.includes("full body")) return true;
    return false;
  };

  const objects: string[] = [];

  // From must_include (e.g., "colorful rocket ship", "playful dolphins")
  // Fall back to required_elements (legacy field) if must_include is empty
  const mustItems = (card.must_include && card.must_include.length > 0)
    ? card.must_include
    : ((card as any).required_elements || []);
  for (const item of mustItems) {
    if (!isCharacterItem(item)) {
      objects.push(item);
    }
  }

  // From key_objects (e.g., "rocket ship", "rainbow")
  if (card.key_objects) {
    for (const obj of card.key_objects) {
      // Avoid duplicates
      const lower = obj.toLowerCase();
      if (!objects.some((o) => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase()))) {
        objects.push(obj);
      }
    }
  }

  console.log(`[SceneObjects] Extracted from card: [${objects.join(", ")}]`);
  return objects;
}

// ─── PLATE PROMPT BUILDER ───────────────────────────────────────────────

/**
 * Build plate prompt with scene objects baked in.
 * Scene objects (rockets, dolphins, rainbows) must appear in the plate
 * so SDXL draws them into the background BEFORE character inpainting.
 */
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
  customNegative?: string,
  pageSceneCard?: PageSceneCard
): Promise<{ url: string; accepted: boolean; caption: string; score: number }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`========== PAGE ${pageIndex + 1}: PLATE → INPAINT → SCORE ==========`);
  console.log(`[Page ${pageIndex + 1}] Character: ${identity.name} (${identity.species})`);

  // ── 1. Classify scene from the incoming prompt text ──
  const scene = resolveSceneSetting(pagePrompt, identity.mustInclude);
  const allMustInclude = enforceMustInclude(scene.mustInclude, identity.mustInclude);
  const identityLower = new Set(identity.mustInclude.map((s) => s.toLowerCase()));

  // ── 1b. Extract scene objects from BOTH taxonomy AND scene card ──
  // Taxonomy provides generic objects (stars, trees, moon)
  // Scene card provides story-specific objects (dolphins, rainbow, rocket)
  const taxonomyObjects = allMustInclude.filter((item) => !identityLower.has(item.toLowerCase()));
  const cardObjects = extractSceneObjects(pageSceneCard, identity);

  // Merge and dedup — scene card objects take priority
  const allSceneObjects: string[] = [];
  const seenLower = new Set<string>();
  for (const obj of [...cardObjects, ...taxonomyObjects]) {
    const lower = obj.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      allSceneObjects.push(obj);
    }
  }

  console.log(`[Page ${pageIndex + 1}] Scene: "${scene.setting}" (${scene.category})`);
  console.log(`[Page ${pageIndex + 1}] Plate objects (taxonomy): [${taxonomyObjects.join(", ")}]`);
  console.log(`[Page ${pageIndex + 1}] Scene objects (card): [${cardObjects.join(", ")}]`);
  console.log(`[Page ${pageIndex + 1}] Combined plate objects: [${allSceneObjects.join(", ")}]`);

  // ── 2. Generate plate (background only — no character) ──
  // CRITICAL: scene objects go into plate so SDXL draws them into background
  const platePrompt = buildPlatePrompt(scene.setting, scene.styleHints, allSceneObjects);
  console.log(`[Page ${pageIndex + 1}] Plate prompt: "${platePrompt}"`);

  const plateUrl = await generatePlate(replicate, platePrompt, seed, pageIndex, undefined, 0.80);
  if (!plateUrl) {
    console.error(`[Page ${pageIndex + 1}] PLATE FAILED`);
    return { url: "", accepted: false, caption: "", score: -999 };
  }
  console.log(`[Page ${pageIndex + 1}] Plate OK: ${plateUrl.substring(0, 60)}...`);

  // ── 3. Build masks ──
  const [initialMask, escalatedMask, extraLargeMask] = await Promise.all([
    makeRiriZoneMaskDataUrl(1024),
    makeRiriZoneLargeMaskDataUrl(1024),
    makeRiriZoneExtraLargeMaskDataUrl(1024),
  ]);

  // ── 4. Score options — character + scene objects ──
  // requireMustIncludeCount: character(1) + scene objects if any(1)
  // This ensures BLIP caption confirms BOTH the rhino AND at least one scene element
  const scoreMustInclude = [...identity.mustInclude, ...cardObjects];
  const requireCount = 1 + (cardObjects.length > 0 ? 1 : 0);
  const scoreOpts: ScoreOptions = {
    mustInclude: scoreMustInclude,
    requireMustIncludeCount: requireCount,
  };
  console.log(`[Page ${pageIndex + 1}] Score mustInclude: [${scoreMustInclude.join(", ")}] require=${requireCount}`);

  // ── 5. Round 1: 3 candidates in parallel ──
  console.log(`[Page ${pageIndex + 1}] Round 1: ${CANDIDATES_PER_ROUND} candidates in parallel...`);
  const round1 = await runCandidateRound(
    plateUrl, initialMask, seed, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, allMustInclude, scene.setting, identity, scene.category
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
    scoreOpts, allMustInclude, scene.setting, identity, scene.category
  );
  const accepted2 = round2.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted2.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 2: score=${accepted2[0].score}`);
    return accepted2[0];
  }

  // ── 7. Round 3: extra-large mask with high strength (last resort) ──
  console.log(`[Page ${pageIndex + 1}] Round 3: EXTRA-LARGE mask + high strength...`);
  const round3Seed = seed + CANDIDATES_PER_ROUND * SEED_STRIDE * 2;
  const round3 = await runCandidateRound(
    plateUrl, extraLargeMask, round3Seed, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, allMustInclude, scene.setting, identity, scene.category, true
  );
  const accepted3 = round3.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted3.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 3: score=${accepted3[0].score}`);
    return accepted3[0];
  }

  // ── 8. No candidate accepted → return EMPTY ──
  const allCandidates = [...round1, ...round2, ...round3];
  console.warn(
    `[Page ${pageIndex + 1}] WARNING: No candidate accepted after ${allCandidates.length} tries. ` +
    `Returning EMPTY — caller must show placeholder.`
  );
  return { url: "", accepted: false, caption: "", score: -999 };
}

/** Scene categories that need higher prompt_strength to overcome dark backgrounds */
const DARK_SCENE_CATEGORIES = new Set(["space", "night_sky", "mountain_night"]);
const DARK_SCENE_STRENGTH = 0.88;
const DEFAULT_STRENGTH = 0.75;
const ROUND3_STRENGTH = 0.92;

async function runCandidateRound(
  plateUrl: string,
  maskDataUrl: string,
  baseSeed: number,
  count: number,
  pageIndex: number,
  scoreOpts: ScoreOptions,
  mustInclude: string[],
  settingContext: string,
  identity: CharacterIdentity,
  sceneCategory: string = "",
  forceHighStrength: boolean = false
): Promise<CandidateResult[]> {
  const strength = forceHighStrength
    ? ROUND3_STRENGTH
    : DARK_SCENE_CATEGORIES.has(sceneCategory) ? DARK_SCENE_STRENGTH : DEFAULT_STRENGTH;
  const tasks = Array.from({ length: count }, async (_, i) => {
    const seed = baseSeed + i * SEED_STRIDE;

    console.log(`[Page ${pageIndex + 1}] Candidate ${i + 1}/${count} seed=${seed} [INPAINT strength=${strength}]`);

    const url = await generateInpaintCharacter(
      replicate, identity.inpaintPrompt, plateUrl, maskDataUrl,
      seed, pageIndex, settingContext, mustInclude, undefined, strength
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
    const { imagePrompts, negativePrompts, seed, seeds, characterBible, sceneCards } = await request.json();

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

        const pageCard = sceneCards?.[i] as PageSceneCard | undefined;
        console.log(`\n========== GENERATING PAGE ${i + 1}/${imagePrompts.length} ==========`);
        results[i] = await generateOnePage(imagePrompts[i], i, pageSeed, identity, customNeg, pageCard);
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
