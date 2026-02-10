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
import { resolveSceneSetting, enforceMustInclude, classifyScene } from "@/src/lib/sceneSettings";
import { scoreCandidate, CandidateResult, ScoreOptions, getSettingKeywords, deriveSettingKeywordsFromText } from "@/src/lib/candidateScoring";
import { buildMultiCharPlateNegative } from "@/src/lib/negativePrompts";

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

  // Build IDENTITY-FOCUSED inpaint prompt — character appearance ONLY.
  // NO scene words (moon, forest, beach) — scene belongs in the plate only.
  // This is the key to identity lock: same prompt tokens every page → same character.
  const fpDetails = (bible.visual_fingerprint || [])
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 4)
    .join(", ");

  // Framing language — forces SDXL to show full body with margins (prevents zoom/crop)
  // Keep this EARLY in the prompt so SDXL gives it strongest attention.
  const framing = "wide shot, full body head-to-toe visible, feet visible, character fully inside frame, centered composition, no cropping";

  // Horn clarification — prevents unicorn horn / party hat drift
  const hornNote = species === "rhinoceros" || species === "rhino"
    ? "two short rhino horns (not unicorn horn), no hat"
    : "no hat";

  const inpaintPrompt = [
    `${name} the cute cartoon ${species}`,
    fpDetails || `a ${species}`,
    hornNote,
    framing,
    "children's picture book illustration, vibrant colors, soft shading",
    `only one ${species}, no text`,
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
 * HIGH-SALIENCE OBJECTS — BLIP can reliably detect these in captions.
 * These are large, prominent objects that BLIP's 1-sentence caption will mention.
 * Small props (magic wand, flag, crown) are NEVER mentioned by BLIP.
 *
 * Only objects in this set are enforced by Gate 5C.
 * Other objects still go into the plate prompt but aren't scoring gates.
 */
const HIGH_SALIENCE_OBJECTS = new Set([
  // Large animals (BLIP reliably detects these)
  "dolphins", "dolphin", "whale", "lion", "lions", "bear", "dragon",
  "unicorn", "elephant", "turtle", "shark", "octopus",
  "moon rabbits", "moon rabbit", "rabbit", "bunny",
  // Large vehicles/structures
  "rocket ship", "rocket", "spaceship", "boat", "sailboat", "airplane",
  // Large nature features
  "rainbow", "waterfall", "river",
  // Large objects
  "treasure chest",
  // NOTE: "moon" and "stars" intentionally EXCLUDED — they are settings, not objects.
  // BLIP rarely mentions them, and they pollute every page of a space story.
]);

/**
 * ANIMAL TERMS — used to split scene objects into animal vs non-animal.
 *
 * Solo pages: animals are FILTERED from the plate (plate = environment only).
 * Multi-char pages: animals are INCLUDED in the plate (they're secondary actors).
 *
 * The main character is NEVER in the plate — always added via inpaint.
 */
const PLATE_ANIMAL_FILTER = new Set([
  "rabbit", "rabbits", "bunny", "bunnies",
  "moon rabbit", "moon rabbits", "moon bunny", "moon bunnies",
  "dolphin", "dolphins", "whale", "whales",
  "butterfly", "butterflies", "bird", "birds",
  "fish", "fishes", "owl", "owls", "fox", "foxes",
  "lion", "lions", "bear", "bears", "dragon", "dragons",
  "unicorn", "unicorns", "turtle", "turtles",
  "fairies", "fairy", "aliens", "alien",
  "dog", "cat", "puppy", "kitten",
  "octopus", "shark", "sharks",
  "friends",  // "friends" is never visual
]);

/**
 * VISUAL_NOUN_WHITELIST — only these nouns survive as "key objects".
 * Anything not in this list (or a substring match) is dropped.
 * This prevents junk tokens like "the", "his", "friends" from
 * being treated as required visual objects.
 */
const VISUAL_NOUN_WHITELIST = new Set([
  // Vehicles
  "rocket ship", "rocket", "spaceship", "boat", "sailboat", "airplane", "vehicle",
  // Animals / creatures
  "dolphins", "dolphin", "whale", "butterflies", "butterfly", "fish", "birds", "bird",
  "moon rabbits", "moon rabbit", "moon bunnies", "moon bunny", "lions", "lion",
  "dragon", "unicorn", "fairies", "fairy", "aliens", "alien", "robot",
  "turtle", "octopus", "shark", "owl", "fox", "bear", "rabbit", "bunny",
  "dog", "cat", "puppy", "kitten",
  // Nature objects
  "rainbow", "waterfall", "river", "stream", "flowers", "flower",
  "trees", "tree", "forest", "cave",
  // Celestial
  "moon", "stars", "star", "planets", "planet", "sun", "craters", "crater",
  // Items
  "treasure chest", "treasure", "crown", "flag", "telescope", "map",
  "balloons", "balloon", "magic wand", "book", "helmet",
  // Settings (these help plate prompt, not scoring)
  "ocean", "sea", "beach", "mountain", "desert", "snow", "lake",
]);

/**
 * STOPWORDS — always removed from extracted items.
 */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "with", "for",
  "is", "it", "its", "his", "her", "my", "their", "our", "this", "that",
  "at", "by", "from", "was", "were", "be", "been", "being",
  "full", "body", "cute", "colorful", "playful", "friendly", "magical",
  "small", "big", "large", "little", "golden", "bright",
]);

/**
 * Clean a raw must-include item:
 * 1. Lowercase + strip punctuation
 * 2. Remove stopwords
 * 3. Check against visual noun whitelist
 * Returns the cleaned term if it's a real visual noun, or null.
 */
function cleanSceneItem(raw: string): string | null {
  const lower = raw.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!lower) return null;

  // Direct whitelist match (before stripping — "rocket ship", "moon rabbits")
  if (VISUAL_NOUN_WHITELIST.has(lower)) return lower;

  // Strip stopwords and adjectives
  const words = lower.split(" ").filter((w) => !STOPWORDS.has(w) && w.length > 1);
  if (words.length === 0) return null;

  const cleaned = words.join(" ");
  if (!cleaned) return null;

  // Check cleaned form against whitelist
  if (VISUAL_NOUN_WHITELIST.has(cleaned)) return cleaned;

  // Check if any individual word matches whitelist
  for (const word of words) {
    if (VISUAL_NOUN_WHITELIST.has(word)) return word;
    // Plural check: "dolphins" → "dolphin"
    if (word.endsWith("s") && VISUAL_NOUN_WHITELIST.has(word.slice(0, -1))) return word;
  }

  // "friends" is not visual — only specific animal groups pass
  if (cleaned === "friends" || cleaned === "family") return null;

  return null;
}

/**
 * Extract scene objects from a PageSceneCard's must_include / key_objects,
 * filtering out character-identity items AND junk tokens.
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
  const isCharacterItem = (item: string): boolean => {
    const lower = item.toLowerCase();
    if (identityLower.has(lower)) return true;
    if (lower.includes(identity.name.toLowerCase())) return true;
    if (lower.includes(identity.species.toLowerCase()) && (lower.includes("full body") || lower.includes("the "))) return true;
    return false;
  };

  const seen = new Set<string>();
  const objects: string[] = [];

  const addItem = (raw: string) => {
    if (isCharacterItem(raw)) return;
    const cleaned = cleanSceneItem(raw);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      objects.push(cleaned);
    }
  };

  // From must_include (e.g., "colorful rocket ship", "playful dolphins")
  const mustItems = (card.must_include && card.must_include.length > 0)
    ? card.must_include
    : ((card as any).required_elements || []);
  for (const item of mustItems) addItem(item);

  // From key_objects (e.g., "rocket ship", "rainbow")
  if (card.key_objects) {
    for (const obj of card.key_objects) addItem(obj);
  }

  console.log(`[SceneObjects] Extracted from card (cleaned): [${objects.join(", ")}]`);
  return objects;
}

// ─── STYLE HINTS DERIVATION ─────────────────────────────────────────────

/**
 * Derive style hints from the SCENE SETTING TEXT (not the classifier).
 * This prevents contamination where a "Forest scene" gets moon-style hints
 * because the classifier matched "moon_surface" from story text mentioning "moon".
 *
 * The style hints control the visual atmosphere of the plate — colors, lighting,
 * terrain textures. They MUST match the setting, not the classifier category.
 */
function deriveStyleHintsFromSetting(settingText: string): string {
  const lower = settingText.toLowerCase();

  const hintGroups: [string[], string][] = [
    // Specific compound settings first — ORDER MATTERS (first match wins)
    [["cockpit", "inside a rocket", "inside the rocket", "interior of a rocket", "pilot seat"], "interior cockpit, control panels, glowing buttons, windows showing stars outside, warm cabin lighting, spaceship interior, bright instrument lights"],
    [["waterfall", "cascade"], "flowing water, mist, rocks, lush vegetation, dappled sunlight"],
    [["rocket", "spaceship", "blast", "launch", "liftoff"], "blue sky, white clouds, rocket trail, bright colors"],
    [["underwater"], "deep blue water, coral, bubbles, ocean light, fish"],
    // Water
    [["ocean", "sea", "beach", "shore", "wave", "coast"], "waves, blue water, sandy beach, bright sky, horizon"],
    [["lake", "pond"], "still water, reflections, reeds, soft light"],
    [["river", "stream", "creek"], "clear water, smooth stones, gentle current, green banks"],
    // Nature
    [["forest", "tree", "wood", "jungle", "clearing"], "lush greens, dappled sunlight, tall trees, vibrant nature"],
    [["garden", "flower", "meadow", "bloom"], "flowers, vibrant colors, green grass, butterflies, warm light"],
    [["mountain", "hill", "cliff", "peak"], "elevated terrain, wide sky, distant peaks, rocky outcrops"],
    [["desert", "sand", "dune"], "golden sand, warm tones, wide sky, gentle shadows"],
    [["cave", "cavern", "underground", "grotto"], "rocky walls, soft glow, stalactites, mysterious atmosphere"],
    [["savannah", "grassland", "plain", "prairie"], "golden grass, warm light, wide horizon, scattered trees"],
    // Space/celestial — MUST be bright and colorful for kids' book (no gray/dark)
    [["moon", "crater", "lunar"], "bright purple and blue moon surface, colorful craters, glowing stars, bright Earth in sky, vivid colors, well-lit"],
    [["space", "star", "planet", "galaxy", "cosmos", "orbit"], "bright colorful ground, colorful starry sky, vivid neon colors, colorful glowing planets, well-lit"],
    // Sky/weather
    [["sky", "cloud", "flying", "soar"], "blue sky, white fluffy clouds, bright sunlight"],
    [["night", "starlit", "starry", "dark"], "deep blue night sky, bright glowing stars, moonlight, soft warm glow, well-lit foreground"],
    [["rain", "storm", "thunder"], "rain, overcast, puddles, glistening surfaces"],
    [["snow", "ice", "winter", "arctic", "frozen"], "white snow, soft blue shadows, crisp sky"],
    // Indoor/village
    [["indoor", "room", "interior", "cozy", "inside"], "cozy interior, warm lighting, furniture, soft colors"],
    [["village", "town", "house", "home", "building"], "colorful buildings, paths, warm atmosphere, friendly scene"],
  ];

  for (const [keywords, hints] of hintGroups) {
    if (keywords.some(kw => lower.includes(kw))) return hints;
  }

  return "bright colors, friendly atmosphere";
}

// ─── PLATE PROMPT BUILDER ───────────────────────────────────────────────

/**
 * Build plate prompt with scene objects baked in.
 * Scene objects (rockets, dolphins, rainbows) appear in the plate
 * BEFORE character inpainting. The main character is NEVER in the plate.
 *
 * For multi-character pages: secondary actors (dolphins, rabbits) ARE in the plate.
 * For solo pages: no animals at all in the plate.
 */
function buildPlatePrompt(
  setting: string,
  styleHints: string,
  sceneObjects: string[],
  mainSpecies: string,
  hasSecondaryActors: boolean
): string {
  const parts = [setting];
  if (sceneObjects.length > 0) parts.push(sceneObjects.join(", "));
  parts.push(styleHints);
  parts.push("simple children's illustration, flat colors, bold outline, high clarity, crisp outlines, well-defined shapes, vivid saturated colors, well-lit, bright");
  if (hasSecondaryActors) {
    // Multi-char: allow secondary actors (dolphins, etc.), block only main character + humans
    parts.push(`no ${mainSpecies}, no people, no text, no black and white, no grayscale, no monochrome`);
  } else {
    // Solo: no animals at all in the plate
    parts.push("no characters, no animals, no people, no text, no black and white, no grayscale, no monochrome");
  }
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
  console.log(`[Page ${pageIndex + 1}] Character: ${identity.name} (${identity.species})`);

  // ── 1. Determine scene setting ──
  const cardSetting = pageSceneCard?.setting;
  const cardObjects = extractSceneObjects(pageSceneCard, identity);

  // Classifier only for the category tag (dark scene detection)
  const classifierMatch = classifyScene(pagePrompt);
  const sceneCategory = classifierMatch?.key ?? "generic";

  let sceneSetting: string;
  let styleHints: string;
  const isGenericSetting = !cardSetting || cardSetting === "Storybook scene" || cardSetting === "colorful storybook scene";
  if (!isGenericSetting) {
    sceneSetting = cardSetting;
    styleHints = deriveStyleHintsFromSetting(sceneSetting);
    console.log(`[Page ${pageIndex + 1}] Using CARD setting: "${sceneSetting}" (classifier tag: ${sceneCategory})`);
    console.log(`[Page ${pageIndex + 1}] Style hints (from card): "${styleHints}"`);
  } else {
    sceneSetting = "colorful storybook landscape with bright green grass and blue sky";
    styleHints = "bright colors, cheerful atmosphere, vibrant greens, blue sky, warm sunlight";
    console.log(`[Page ${pageIndex + 1}] Generic card setting ("${cardSetting ?? "none"}") → bright storybook landscape`);
    console.log(`[Page ${pageIndex + 1}] Style hints: "${styleHints}"`);
  }

  console.log(`[Page ${pageIndex + 1}] Scene objects (card): [${cardObjects.join(", ")}]`);

  // ── 2. Prepare plate objects ──
  // EVERY page uses plate→inpaint. This is the key to identity lock:
  //   plate = scene + secondary actors (no main character)
  //   inpaint = main character only (same prompt every page)
  //
  // For multi-character pages: secondary actors (dolphins, rabbits, etc.)
  // go INTO the plate so they appear in the background/midground.
  // Riri is always inpainted on top via the consistent mask+prompt.
  const animalObjects = cardObjects.filter((obj) => PLATE_ANIMAL_FILTER.has(obj.toLowerCase()));
  const nonAnimalObjects = cardObjects.filter((obj) => !PLATE_ANIMAL_FILTER.has(obj.toLowerCase()));

  // Filter supporting characters to specific visual actors only.
  // "friends", "family", "his", "the" are NOT visual actors.
  const VISUAL_ACTORS = new Set([
    "dog", "cat", "birds", "rabbit", "bear", "fox", "owl", "butterflies",
    "fish", "dolphins", "whale", "shark", "turtle", "octopus",
    "dragon", "unicorn", "fairies", "aliens", "robot", "lions",
  ]);
  const filteredSupportingChars = (pageSceneCard?.supporting_characters ?? [])
    .filter((ch) => VISUAL_ACTORS.has(ch.toLowerCase()));

  const hasSecondaryActors = animalObjects.length > 0 || filteredSupportingChars.length > 0;

  let plateObjects: string[];
  if (hasSecondaryActors) {
    // Multi-character: include ALL objects (including secondary animals) in plate.
    // Riri is inpainted on top — secondary actors stay in background.
    plateObjects = [...cardObjects];
    // Add supporting chars not already in cardObjects
    for (const ch of filteredSupportingChars) {
      if (!plateObjects.some(o => o.toLowerCase() === ch.toLowerCase())) {
        plateObjects.push(ch);
      }
    }
    console.log(`[Page ${pageIndex + 1}] MULTI-CHAR plate: secondary actors [${[...animalObjects, ...filteredSupportingChars].join(", ")}]`);
  } else {
    // Solo page: no animals in plate (environment only)
    plateObjects = nonAnimalObjects;
  }

  // ── 3. ALL pages: PLATE → INPAINT → SCORE (identity lock) ──
  console.log(`========== PAGE ${pageIndex + 1}: PLATE → INPAINT → SCORE ==========`);

  const platePrompt = buildPlatePrompt(sceneSetting, styleHints, plateObjects, identity.species, hasSecondaryActors);
  console.log(`[Page ${pageIndex + 1}] Plate prompt: "${platePrompt}"`);

  // Multi-char plates use a special negative that allows secondary actors
  const plateNegative = hasSecondaryActors
    ? buildMultiCharPlateNegative(identity.species)
    : undefined;

  const plateUrl = await generatePlate(replicate, platePrompt, seed, pageIndex, undefined, 0.80, undefined, plateNegative);
  if (!plateUrl) {
    console.error(`[Page ${pageIndex + 1}] PLATE FAILED`);
    return { url: "", accepted: false, caption: "", score: -999 };
  }
  console.log(`[Page ${pageIndex + 1}] Plate OK: ${plateUrl.substring(0, 60)}...`);

  // Build masks (same position/size every page → identity lock)
  const [initialMask, escalatedMask, extraLargeMask] = await Promise.all([
    makeRiriZoneMaskDataUrl(1024),
    makeRiriZoneLargeMaskDataUrl(1024),
    makeRiriZoneExtraLargeMaskDataUrl(1024),
  ]);

  // Score options
  const settingKeywords = deriveSettingKeywordsFromText(sceneSetting);
  console.log(`[Page ${pageIndex + 1}] Setting keywords: [${settingKeywords.slice(0, 6).join(", ")}${settingKeywords.length > 6 ? "..." : ""}]`);

  // Only INANIMATE objects go into required scoring — living creatures (rabbit, dolphins,
  // lions) can't survive inpainting at any useful strength. BLIP also omits secondary
  // actors from its 1-sentence caption. Enforcing them causes 80%+ reject rate.
  const INANIMATE_SCORABLE = new Set([
    "rocket ship", "rocket", "spaceship", "boat", "sailboat", "airplane",
    "rainbow", "waterfall", "river", "treasure chest",
  ]);
  const requiredObjects = cardObjects.filter((obj) => INANIMATE_SCORABLE.has(obj.toLowerCase()));
  console.log(`[Page ${pageIndex + 1}] Required objects for scoring: [${requiredObjects.join(", ")}]`);

  const scoreOpts: ScoreOptions = {
    mustInclude: [...identity.mustInclude],
    requireMustIncludeCount: 1,
    settingKeywords,
    keyObjects: requiredObjects,
  };

  const inpaintMustInclude = [...identity.mustInclude, ...cardObjects];

  // Multi-char pages start with bigger masks — secondary actors in the plate
  // compete with Riri for visual space. Bigger mask = more room for Riri.
  const round1Mask = hasSecondaryActors ? escalatedMask : initialMask;
  const round2Mask = hasSecondaryActors ? extraLargeMask : escalatedMask;

  // Round 1
  console.log(`[Page ${pageIndex + 1}] Round 1: ${CANDIDATES_PER_ROUND} candidates${hasSecondaryActors ? " (multi-char: escalated mask + high strength)" : ""}...`);
  const round1 = await runCandidateRound(
    plateUrl, round1Mask, seed, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, inpaintMustInclude, sceneSetting, identity, sceneCategory,
    false, hasSecondaryActors
  );
  const accepted1 = round1.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted1.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 1: score=${accepted1[0].score}`);
    return accepted1[0];
  }

  // Round 2: escalated mask (or extra-large for multi-char)
  console.log(`[Page ${pageIndex + 1}] Round 2: ${hasSecondaryActors ? "EXTRA-LARGE" : "ESCALATED"} mask...`);
  const round2 = await runCandidateRound(
    plateUrl, round2Mask, seed + CANDIDATES_PER_ROUND * SEED_STRIDE, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, inpaintMustInclude, sceneSetting, identity, sceneCategory,
    false, hasSecondaryActors
  );
  const accepted2 = round2.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted2.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 2: score=${accepted2[0].score}`);
    return accepted2[0];
  }

  // Round 3: extra-large mask + high strength
  console.log(`[Page ${pageIndex + 1}] Round 3: EXTRA-LARGE mask + high strength...`);
  const round3 = await runCandidateRound(
    plateUrl, extraLargeMask, seed + CANDIDATES_PER_ROUND * SEED_STRIDE * 2, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, inpaintMustInclude, sceneSetting, identity, sceneCategory, true, hasSecondaryActors
  );
  const accepted3 = round3.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
  if (accepted3.length > 0) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 3: score=${accepted3[0].score}`);
    return accepted3[0];
  }

  // No candidate accepted → return EMPTY
  console.warn(`[Page ${pageIndex + 1}] WARNING: No candidate accepted after 9 tries. Returning EMPTY.`);
  return { url: "", accepted: false, caption: "", score: -999 };
}

/** Scene categories that need higher prompt_strength to overcome dark backgrounds */
const DARK_SCENE_CATEGORIES = new Set(["space", "night_sky", "mountain_night", "moon_surface"]);
const DARK_SCENE_STRENGTH = 0.90;
const DEFAULT_STRENGTH = 0.82;
const ROUND3_STRENGTH = 0.95;

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
  forceHighStrength: boolean = false,
  isMultiChar: boolean = false
): Promise<CandidateResult[]> {
  // Strength selection:
  //   Round 3 (forced): 0.95 — last resort, regenerates most of image
  //   Dark scene (space/moon): 0.90 — overcome dark backgrounds
  //   Default (including multi-char): 0.82 — preserve plate content
  //
  // Multi-char pages use DEFAULT 0.82 to preserve secondary actors in the plate.
  // With hippo/elephant counting as rhino confirmation, 0.82 is sufficient
  // for BLIP to identify the character without destroying the plate.
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

    const worker = async () => {
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
