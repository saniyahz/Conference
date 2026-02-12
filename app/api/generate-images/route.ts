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
import { cacheAnchorEmbedding } from "@/src/lib/clipScoring";
import { buildMultiCharPlateNegative } from "@/src/lib/negativePrompts";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ─── CONFIG ──────────────────────────────────────────────────────────────

const CANDIDATES_PER_ROUND = 3;
const SEED_STRIDE = 29;
// Minimum score to accept from rounds 1-2. If the best accepted candidate
// scores below this, continue to the next round for better options.
// Raised from 6 → 8: With the DINO override removed from Rule 2,
// accepted images are now BLIP-confirmed rhinos (base score 6) or
// DINO-only ambiguous images (base score 3). Setting threshold to 8
// ensures we keep trying until we find an image where BLIP actually says
// "rhino" plus some quality bonuses (cartoon +1, full body +2 = 9+).
// DINO-only images (score 3-7) won't trigger early exit.
const MIN_ROUND_ACCEPT = 8;
// Bounded page concurrency. With sequential candidates + early-accept,
// each page has ~1-2 active Replicate calls at a time. Running 2 pages
// concurrently means ~2-4 simultaneous requests — well within rate limits.
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
  //
  // CRITICAL: Front-load species-DISTINGUISHING features in tokens 1-15.
  // "cute cartoon rhinoceros" is too vague — SDXL's training data has far more
  // "cute cartoon cow" examples, so it drifts to cow/bull without explicit guidance.
  // Species-specific visual features tell SDXL HOW this animal differs from
  // similar-shaped animals (cow, bull, buffalo, hippo).
  const fpDetails = (bible.visual_fingerprint || [])
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 4)
    .join(", ");

  // Species-specific distinguishing features — placed at tokens 7-15 for
  // maximum SDXL attention. These describe a CUTE CARTOON version of each
  // animal (not realistic!). Using "cute baby", "small round", "chubby"
  // keeps SDXL in children's-book territory. Previous "armored", "stocky
  // barrel-shaped" pushed SDXL toward realistic/aggressive renderings.
  const speciesVisuals: Record<string, string> = {
    'rhinoceros': 'small cute baby rhinoceros, smooth light gray skin, small round horn on nose, round chubby body, short stubby legs, tiny round ears',
    'rhino': 'small cute baby rhinoceros, smooth light gray skin, small round horn on nose, round chubby body, short stubby legs, tiny round ears',
    'elephant': 'small cute baby elephant, large floppy ears, long trunk, smooth gray skin, round chubby body',
    'giraffe': 'small cute baby giraffe, very long neck, spotted pattern, tall thin legs, small horns',
    'lion': 'small cute baby lion, golden fluffy mane, round face, tawny fur, tufted tail',
    'tiger': 'small cute baby tiger, orange fur with black stripes, round face, white belly',
    'bear': 'small cute baby bear, round ears, fluffy fur, chubby body, round face, large paws',
    'rabbit': 'small cute baby rabbit, long upright ears, fluffy round tail, soft fur, pink nose',
    'penguin': 'small cute baby penguin, black and white body, orange beak, tiny flippers',
  };
  const speciesLock = speciesVisuals[species.toLowerCase()] || '';

  // Horn clarification — prevents unicorn horn / party hat drift
  const hornNote = species === "rhinoceros" || species === "rhino"
    ? "two short rhino horns (not unicorn horn), no hat"
    : "no hat";

  // Framing — condensed to save token budget for character identity.
  // The long version wasted ~15 tokens on "head-to-toe visible, feet visible,
  // character fully inside frame, centered composition, no cropping" that
  // pushed identity features past SDXL's 77-token window.
  const framing = "full body, centered in frame";

  const inpaintPrompt = [
    `one single ${name} the cute cartoon ${species}`,
    speciesLock,                // Species-distinguishing features (tokens 7-20)
    fpDetails || `a ${species}`,  // Visual fingerprint details (tokens 20-30)
    hornNote,
    framing,
    "2D flat color children's picture book illustration, bold outlines, simple shapes, vibrant colors, soft warm lighting",
    `alone, only one ${species}, no other animals, no text`,
  ].filter(Boolean).join(", ");

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

// ─── ROCKET/SKY SCENE DETECTION ─────────────────────────────────────────

/**
 * Detect if a scene setting is a "rocket in sky/space" scene.
 * These scenes produce plates where a giant rocket fills the frame,
 * leaving no room for the character in the inpaint mask region.
 *
 * Fix: rewrite plate to show rocket SMALL in background with ground foreground.
 */
function isRocketSkyScene(setting: string): boolean {
  const lower = setting.toLowerCase();
  const hasRocket = /\brocket\b|\bspaceship\b|\bblast\w*\s+off\b|\blaunch\b|\bliftoff\b/.test(lower);
  const hasSky = /\bsky\b|\bspace\b|\bflying\b|\bcloud\b|\bsoar\b|\bair\b/.test(lower);
  return hasRocket && hasSky;
}

/**
 * Rewrite a rocket/sky plate prompt to keep rocket visible but not frame-filling.
 * The original "Rocket ship blasting off into space" fills the entire frame
 * with rocket → inpaint mask overlaps with rocket → character can't render.
 *
 * Fix: place rocket clearly visible in upper portion of frame, character space
 * in lower/center. Rocket must be large enough for BLIP to caption it.
 */
function rewriteRocketPlatePrompt(
  styleHints: string,
  sceneObjects: string[]
): string {
  // Filter out "rocket ship"/"rocket" from scene objects — it's already in the rewritten prompt
  const otherObjects = sceneObjects.filter(o => !/rocket|spaceship/i.test(o));
  const parts = [
    "wide scene, bright green grass and ground in lower half, large colorful rocket ship clearly visible in upper right sky, rocket trail with flames",
  ];
  if (otherObjects.length > 0) parts.push(otherObjects.join(", "));
  parts.push(styleHints);
  parts.push("2D flat color children's picture book illustration, bold outlines, simple shapes, high clarity, well-defined shapes, vivid saturated colors, well-lit, bright");
  parts.push("no characters, no animals, no people, no text, no black and white, no grayscale, no monochrome");
  return parts.join(", ");
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
  parts.push("2D flat color children's picture book illustration, bold outlines, simple shapes, high clarity, well-defined shapes, vivid saturated colors, well-lit, bright");
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
  pageSceneCard?: PageSceneCard,
  clipAnchorEmbedding?: number[]
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

  // Rocket/sky scenes: rocket fills the frame → no room for character.
  // Rewrite plate to show rocket small in background with ground foreground.
  const rocketSky = isRocketSkyScene(sceneSetting);
  let platePrompt: string;
  if (rocketSky && !hasSecondaryActors) {
    platePrompt = rewriteRocketPlatePrompt(styleHints, plateObjects);
    console.log(`[Page ${pageIndex + 1}] ROCKET-SKY REWRITE: rocket moved to background, ground foreground added`);
  } else {
    platePrompt = buildPlatePrompt(sceneSetting, styleHints, plateObjects, identity.species, hasSecondaryActors);
  }
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

  // Score options — derive setting keywords from the CARD setting text, NOT the
  // generic fallback. The fallback contains "blue sky" which triggers the sky keyword
  // group, causing wrong scoring for generic/storybook pages.
  const settingKeywords = isGenericSetting ? [] : deriveSettingKeywordsFromText(sceneSetting);
  console.log(`[Page ${pageIndex + 1}] Setting keywords: [${settingKeywords.slice(0, 6).join(", ")}${settingKeywords.length > 6 ? "..." : ""}]${isGenericSetting ? " (generic — skipped)" : ""}`);

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
    // Allow expected secondary actors (lions, dolphins, etc.) in Rule 2.
    // Without this, "a rhinoceros and a lion in a forest" gets rejected even
    // when lions ARE the expected scene element.
    allowedAnimals: animalObjects,
    // CLIP identity scoring: compare each candidate to the anchor image.
    // This enforces visual consistency — Riri must look similar across all pages.
    cachedAnchorEmbedding: clipAnchorEmbedding,
    // DINO detection: secondary confirmation that rhinoceros is in the image.
    // Rescues images where BLIP misidentifies the species but rhino IS there.
    enableDetection: true,
  };

  const inpaintMustInclude = [...identity.mustInclude, ...cardObjects];

  // Multi-char pages start with bigger masks — secondary actors in the plate
  // compete with Riri for visual space. Bigger mask = more room for Riri.
  const round1Mask = hasSecondaryActors ? escalatedMask : initialMask;
  const round2Mask = hasSecondaryActors ? extraLargeMask : escalatedMask;

  // Large secondary animals (lions, bears) almost always dominate the plate
  // and prevent the rhino from being recognized. Skip to solo plate faster.
  const LARGE_ANIMALS = new Set(["lions", "lion", "bear", "bears", "dragon", "dragons"]);
  const hasLargeSecondary = hasSecondaryActors && animalObjects.some(a => LARGE_ANIMALS.has(a.toLowerCase()));
  // For large secondary animals: only try 1 multi-char round, then go solo.
  // For smaller animals (dolphins, butterflies): try all 3 rounds first.
  const multiCharMaxRounds = hasLargeSecondary ? 1 : 3;
  if (hasLargeSecondary) {
    console.log(`[Page ${pageIndex + 1}] LARGE secondary animals detected — will fast-track to solo plate after 1 round`);
  }

  // Track the best accepted candidate across ALL rounds.
  // Rounds 1-2 require score >= MIN_ROUND_ACCEPT to return early.
  // If the best is below that threshold, continue to the next round.
  // After all rounds, return the overall best (even if marginal).
  let overallBest: CandidateResult | null = null;

  function pickBest(candidates: CandidateResult[], current: CandidateResult | null): CandidateResult | null {
    const accepted = candidates.filter((r) => r.accepted).sort((a, b) => b.score - a.score);
    if (accepted.length > 0 && (!current || accepted[0].score > current.score)) {
      return accepted[0];
    }
    return current;
  }

  // Round 1
  console.log(`[Page ${pageIndex + 1}] Round 1: ${CANDIDATES_PER_ROUND} candidates${hasSecondaryActors ? " (multi-char: escalated mask + high strength)" : ""}...`);
  const round1 = await runCandidateRound(
    plateUrl, round1Mask, seed, CANDIDATES_PER_ROUND, pageIndex,
    scoreOpts, inpaintMustInclude, sceneSetting, identity, sceneCategory,
    false, hasSecondaryActors, cardObjects
  );
  overallBest = pickBest(round1, overallBest);
  if (overallBest && overallBest.score >= MIN_ROUND_ACCEPT) {
    console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 1: score=${overallBest.score}`);
    return overallBest;
  }
  if (overallBest) {
    console.log(`[Page ${pageIndex + 1}] Round 1 best score=${overallBest.score} < ${MIN_ROUND_ACCEPT} — continuing for better match`);
  }

  if (multiCharMaxRounds >= 2) {
    // Round 2: escalated mask (or extra-large for multi-char)
    console.log(`[Page ${pageIndex + 1}] Round 2: ${hasSecondaryActors ? "EXTRA-LARGE" : "ESCALATED"} mask...`);
    const round2 = await runCandidateRound(
      plateUrl, round2Mask, seed + CANDIDATES_PER_ROUND * SEED_STRIDE, CANDIDATES_PER_ROUND, pageIndex,
      scoreOpts, inpaintMustInclude, sceneSetting, identity, sceneCategory,
      false, hasSecondaryActors, cardObjects
    );
    overallBest = pickBest(round2, overallBest);
    if (overallBest && overallBest.score >= MIN_ROUND_ACCEPT) {
      console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 2: score=${overallBest.score}`);
      return overallBest;
    }
    if (overallBest) {
      console.log(`[Page ${pageIndex + 1}] Round 2 best score=${overallBest.score} < ${MIN_ROUND_ACCEPT} — continuing for better match`);
    }
  }

  if (multiCharMaxRounds >= 3) {
    // Round 3: extra-large mask + high strength — accept anything
    console.log(`[Page ${pageIndex + 1}] Round 3: EXTRA-LARGE mask + high strength...`);
    const round3 = await runCandidateRound(
      plateUrl, extraLargeMask, seed + CANDIDATES_PER_ROUND * SEED_STRIDE * 2, CANDIDATES_PER_ROUND, pageIndex,
      scoreOpts, inpaintMustInclude, sceneSetting, identity, sceneCategory, true, hasSecondaryActors, cardObjects
    );
    overallBest = pickBest(round3, overallBest);
    if (overallBest) {
      console.log(`[Page ${pageIndex + 1}] ACCEPTED from round 3: score=${overallBest.score}`);
      return overallBest;
    }
  }

  // Solo plate fallback: secondary actors (dolphins, lions) in the plate
  // compete with the rhino for visual dominance.
  // Fix: regenerate a SOLO plate (no secondary actors) and try again.
  // Also try this when earlier rounds only found marginal accepts.
  if (hasSecondaryActors && (!overallBest || overallBest.score < MIN_ROUND_ACCEPT)) {
    console.log(`[Page ${pageIndex + 1}] SOLO PLATE FALLBACK (no secondary actors)...`);
    const soloPlatePrompt = buildPlatePrompt(sceneSetting, styleHints, nonAnimalObjects, identity.species, false);
    console.log(`[Page ${pageIndex + 1}] Solo plate prompt: "${soloPlatePrompt.substring(0, 100)}..."`);

    const soloPlateUrl = await generatePlate(replicate, soloPlatePrompt, seed + 5000, pageIndex);
    if (soloPlateUrl) {
      const soloRound = await runCandidateRound(
        soloPlateUrl, extraLargeMask,
        seed + CANDIDATES_PER_ROUND * SEED_STRIDE * 3, CANDIDATES_PER_ROUND, pageIndex,
        scoreOpts, [...identity.mustInclude], sceneSetting, identity, sceneCategory,
        true, false, nonAnimalObjects  // solo: only non-animal objects
      );
      overallBest = pickBest(soloRound, overallBest);
      if (overallBest && overallBest.score >= MIN_ROUND_ACCEPT) {
        console.log(`[Page ${pageIndex + 1}] ACCEPTED from solo fallback: score=${overallBest.score}`);
        return overallBest;
      }
    }
  }

  // Return best from any round if we have one (even below MIN_ROUND_ACCEPT)
  if (overallBest) {
    console.log(`[Page ${pageIndex + 1}] Returning best across all rounds: score=${overallBest.score}`);
    return overallBest;
  }

  // TXT2IMG FALLBACK: If plate→inpaint pipeline failed completely,
  // generate a full scene with txt2img (character + objects + setting in one prompt).
  // This sacrifices identity consistency but guarantees SOMETHING on the page.
  console.log(`[Page ${pageIndex + 1}] TXT2IMG FALLBACK: generating full scene...`);
  const txt2imgPrompt = [
    `one single ${identity.name} the cute cartoon ${identity.species}`,
    identity.inpaintPrompt.split(",").slice(1, 4).join(",").trim(),
    cardObjects.length > 0 ? cardObjects.join(", ") : "",
    sceneSetting,
    "2D flat color children's picture book illustration, bold outlines, simple shapes, vibrant colors, alone, no text",
  ].filter(Boolean).join(", ");
  console.log(`[Page ${pageIndex + 1}] Txt2img prompt: "${txt2imgPrompt.substring(0, 120)}..."`);

  const txt2imgUrl = await generatePlate(replicate, txt2imgPrompt, seed + 9000, pageIndex);
  if (txt2imgUrl) {
    // Score the txt2img result — it might have wrong animals or no rhino
    const txt2imgResult = await scoreCandidate(replicate, txt2imgUrl, scoreOpts);
    if (txt2imgResult.accepted) {
      console.log(`[Page ${pageIndex + 1}] TXT2IMG FALLBACK ACCEPTED: score=${txt2imgResult.score}`);
      return txt2imgResult;
    }
    console.log(`[Page ${pageIndex + 1}] Txt2img fallback rejected: ${txt2imgResult.rejectReason}`);
    // Last resort: return the txt2img image anyway (better than empty)
    console.warn(`[Page ${pageIndex + 1}] Using txt2img image as last resort (may not match character)`);
    return { ...txt2imgResult, url: txt2imgUrl, accepted: false };
  }

  // Truly nothing worked
  const totalTries = hasSecondaryActors
    ? (multiCharMaxRounds * CANDIDATES_PER_ROUND + CANDIDATES_PER_ROUND + 1)
    : (3 * CANDIDATES_PER_ROUND + 1);
  console.warn(`[Page ${pageIndex + 1}] WARNING: No candidate accepted after ${totalTries} tries. Returning EMPTY.`);
  return { url: "", accepted: false, caption: "", score: -999 };
}

/**
 * FIXED inpaint strength for ALL pages and rounds.
 *
 * prompt_strength controls how much SDXL overwrites the ENTIRE image:
 *   - 0.90+: nearly full regen → plate composition destroyed, identity drift
 *   - 0.85: character renders reliably, plate mostly preserved, stronger identity
 *   - 0.82: was sometimes too weak — character renders but with wrong species traits
 *   - 0.75: too low — frequently produced no character (just background)
 *   - 0.65: TOO LOW — no character at all (just flowers/butterflies)
 *
 * Increased base from 0.82 → 0.85 to produce stronger character rendering.
 * At 0.82 SDXL sometimes blends the character into the plate too much,
 * producing ambiguous animals that BLIP misidentifies. At 0.85 the character
 * identity prompt has more influence, producing more consistent rhinoceros.
 */
const INPAINT_STRENGTH = 0.85;
const ROUND3_STRENGTH = 0.90;

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
  isMultiChar: boolean = false,
  sceneObjects: string[] = []
): Promise<CandidateResult[]> {
  // FIXED strength for consistency: same character appearance every page.
  const strength = forceHighStrength ? ROUND3_STRENGTH : INPAINT_STRENGTH;

  // IDENTITY-LOCKED inpaint prompt + SHORT scene context suffix.
  //
  // The mask covers 83% of the frame (ellipse: 17%-100% height, 10%-90% width).
  // Only the top ~17% and narrow side strips preserve the plate. Inside the
  // mask, SDXL regenerates ENTIRELY from the prompt. Without scene context,
  // the character renders on a mismatched generic background, creating a
  // jarring seam with the plate — "half showing" images where the top is
  // forest/ocean/space but the bottom is a random green field.
  //
  // FIX: Character identity in tokens 1-40 (LOCKED, same every page, highest
  // SDXL attention). Short scene suffix in tokens 41-55 (varies per page, LOW
  // attention — provides color/lighting coherence but does NOT affect character
  // rendering). Total ~55 tokens, well within SDXL's 77-token window.
  let compositePrompt = identity.inpaintPrompt;

  // Scene suffix: max 2 objects + short setting (keeps tokens low)
  if (sceneObjects.length > 0) {
    const identityLower = new Set(identity.mustInclude.map(s => s.toLowerCase()));
    const objectsForPrompt = sceneObjects
      .filter(obj => !identityLower.has(obj.toLowerCase()))
      .slice(0, 2);  // Max 2 objects to save token budget
    if (objectsForPrompt.length > 0) {
      compositePrompt += `, ${objectsForPrompt.join(" and ")} in background`;
    }
  }
  // Short setting for color/lighting coherence between mask and plate
  if (settingContext && settingContext !== "colorful storybook landscape with bright green grass and blue sky") {
    const shortSetting = settingContext.split(",")[0].trim().substring(0, 25);
    compositePrompt += `, ${shortSetting}`;
  }
  console.log(`[Page ${pageIndex + 1}] Composite inpaint: "${compositePrompt.substring(0, 160)}..."`);

  // SERIALIZE candidates (one at a time) to avoid Replicate 429 rate limiting.
  // Low-credit accounts get burst=1 — parallel requests all get throttled.
  // Sequential requests with natural processing time (~15-30s each) stay under the limit.
  const results: CandidateResult[] = [];
  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i * SEED_STRIDE;

    console.log(`[Page ${pageIndex + 1}] Candidate ${i + 1}/${count} seed=${seed} [INPAINT strength=${strength}]`);

    const url = await generateInpaintCharacter(
      replicate, compositePrompt, plateUrl, maskDataUrl,
      seed, pageIndex, settingContext, mustInclude, undefined, strength,
      identity.species
    );

    if (!url) {
      console.warn(`[Page ${pageIndex + 1}] Candidate ${i + 1} generation failed`);
      continue;
    }

    const result = await scoreCandidate(replicate, url, scoreOpts);

    console.log(
      `[Page ${pageIndex + 1}] Candidate ${i + 1}: ` +
      `${result.accepted ? "ACCEPTED" : "REJECTED"} score=${result.score}` +
      (result.rejectReason ? ` reason="${result.rejectReason}"` : "")
    );

    results.push(result);

    // Early exit: if this candidate was accepted WITH strong quality, skip remaining.
    // Raised from 8 → 10: with increased CLIP weights, a score of 10+ means
    // BLIP confirmed rhino AND CLIP shows good visual similarity to reference.
    // Lower-scored accepts are marginal — worth trying more candidates.
    if (result.accepted && result.score >= 10) {
      console.log(`[Page ${pageIndex + 1}] Early accept (score=${result.score} >= 10) — skipping remaining candidates`);
      break;
    } else if (result.accepted) {
      console.log(`[Page ${pageIndex + 1}] Accepted but marginal (score=${result.score} < 10) — trying more candidates`);
    }
  }

  return results;
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

    // ── CLIP ANCHOR: Generate reference image for identity consistency ──
    // Create a clean reference of the character (no complex scene) and cache
    // its CLIP embedding. All subsequent pages compare against this anchor.
    let clipAnchorEmbedding: number[] = [];
    try {
      console.log(`\n[CLIP] Generating character reference image for anchor embedding...`);
      // Anchor prompt uses the SAME identity prompt (tokens 1-30) to ensure
      // the reference image matches what the inpaint prompt generates.
      const refPrompt = [
        `one single ${identity.name} the cute cartoon ${identity.species}, full body, standing`,
        identity.inpaintPrompt.split(",").slice(1, 4).join(",").trim(),
        "simple solid white background, centered in frame",
        "2D flat color children's picture book illustration, bold outlines, simple shapes",
        "vibrant colors, no text, no other characters, no scene, no props, alone",
      ].filter(Boolean).join(", ");
      const refUrl = await generatePlate(replicate, refPrompt, storySeed + 99999, 99);
      if (refUrl) {
        clipAnchorEmbedding = await cacheAnchorEmbedding(replicate, refUrl);
        if (clipAnchorEmbedding.length > 0) {
          console.log(`[CLIP] Anchor embedding ready (${clipAnchorEmbedding.length} dims) — identity scoring enabled`);
        } else {
          console.warn(`[CLIP] Anchor embedding failed — identity scoring disabled`);
        }
      }
    } catch (e) {
      console.warn(`[CLIP] Anchor generation failed, proceeding without identity scoring:`, e);
    }

    // Generate pages with bounded concurrency
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
        results[i] = await generateOnePage(
          imagePrompts[i], i, pageSeed, identity, customNeg, pageCard,
          clipAnchorEmbedding.length > 0 ? clipAnchorEmbedding : undefined
        );
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
