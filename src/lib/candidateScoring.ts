import Replicate from "replicate";
import { scoreClipSimilarity, scoreClipWithCachedAnchor, ClipResult } from "./clipScoring";
import { detectRhinoceros, DetectionResult, DetectorModel } from "./objectDetection";

/**
 * Candidate scoring — kids-book strict, deterministic accept/reject.
 *
 * Accept gate: 5 hard rules, ALL must pass.
 *
 *   Rule 1:  No humans (boy/girl/man/woman/person only)
 *   Rule 1b: No busy/crowded scenes (crowd/many/parade)
 *   Rule 2:  No wrong animal (elephant/hippo/cow/pig etc.) — ALWAYS reject,
 *            even if rhino is also confirmed (two animals = wrong image)
 *   Rule 3:  Rhinoceros confirmed by at least one signal
 *   Rule 4:  Character not tiny/background (bbox >= 15% or composition cue)
 *   Rule 5C: Key objects — soft penalty (BLIP unreliable for object detection)
 *   Rule 5:  Must-include enforcement (at least N items visible)
 *
 * Selection: run ALL candidates per round, pick BEST accepted (not first).
 * Rejected candidates are hard-clamped to -100 so they never beat accepts.
 */

export interface CandidateResult {
  url: string;
  score: number;
  accepted: boolean;
  rejectReason: string;
  caption: string;
  reasons: string[];
  clipSimilarity?: number;
  detectionConfidence?: number;
  detectionBboxArea?: number;
}

export interface ScoreOptions {
  mustInclude?: string[];
  requireMustIncludeCount?: number;

  /** Setting keywords group — e.g. ["ocean","sea","water","wave","underwater"] */
  settingKeywords?: string[];

  /** Key scene objects (cleaned) — e.g. ["dolphins","rocket ship"] */
  keyObjects?: string[];

  /** Animals that are expected secondary actors on this page (exempt from Rule 2) */
  allowedAnimals?: string[];

  /** Riri anchor image URL for CLIP similarity comparison */
  anchorImageUrl?: string;

  /** Pre-cached CLIP anchor embedding (avoids redundant Replicate calls) */
  cachedAnchorEmbedding?: number[];

  /** Enable GroundingDINO/OWL-ViT rhinoceros detection. Default: false */
  enableDetection?: boolean;

  /** Preferred detector model. Default: "grounding-dino" */
  detectorModel?: DetectorModel;
}

type AcceptOpts = {
  mustInclude?: string[];
  requireMustIncludeCount?: number;
  settingKeywords?: string[];
  keyObjects?: string[];
  /** Animals that are expected secondary actors on this page (exempt from Rule 2) */
  allowedAnimals?: string[];
};

const BLIP_VERSION =
  "2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746" as const;

const WRONG_ANIMALS = [
  // ALL wrong animals — including elephant/hippo which BLIP sometimes uses
  // to misidentify rhinos. If BLIP can't tell it's a rhino, the image isn't
  // good enough. If BLIP says "elephant AND rhino", there are two animals
  // in the image which is wrong. Either way: reject.
  "elephant", "hippo", "hippopotamus",
  "cat", "dog", "bear", "lion", "tiger", "monkey",
  "rabbit", "horse", "cow", "giraffe", "zebra",
  "camel", "sheep", "goat", "fox", "deer",
  "wolf", "pig", "dolphin", "whale", "bird", "parrot",
  "penguin", "frog", "turtle", "snake", "fish",
  // BLIP also misidentifies cartoon rhinos as these — must reject
  "kangaroo", "donkey", "hamster", "squirrel", "mouse", "rat",
  "moose", "buffalo", "otter", "beaver", "panda",
  // SDXL commonly substitutes these for rhino (stocky body shape confusion)
  "bull", "calf", "ox", "bison", "dinosaur", "dragon",
];

// Only reject ACTUAL human terms. Do NOT include space-themed terms
// (astronaut, pilot, helmet, cockpit) — those are valid for space stories.
// "child" excluded because it conflicts with "children's" in BLIP captions.
const HUMAN_TERMS = [
  "human", "boy", "girl", "man", "woman", "person", "people",
  "kid",
  // NOTE: "baby" intentionally EXCLUDED — BLIP says "baby hippo", "baby rhino"
  // for small/young cartoon animals. Very common false positive.
];

const BUSY_SCENE_TERMS = [
  "crowd", "crowded", "many", "lots", "dozens",
  "parade", "procession",
  // NOTE: "party" intentionally EXCLUDED — BLIP frequently says "party hat"
  // for cartoon characters with round/colorful features. Not a busy scene.
  // NOTE: "group", "several", "pack", "herd" intentionally EXCLUDED.
  // BLIP uses "a group of animals" for even 2-3 animals — which is
  // expected for multi-character pages (Riri + lions/dolphins).
];

/**
 * Must-include keyword expansions for fuzzy matching.
 * BLIP captions are very terse — "a rhino on a beach" — so we need
 * aggressive synonym expansion to match scene objects reliably.
 *
 * Keys are normalized (lowercase, stripped adjectives).
 * Values are synonyms that BLIP might use instead.
 */
const EXPANSIONS: Record<string, string[]> = {
  // Character — strict rhino matching only (hippo/elephant no longer accepted as synonyms)
  "rhinoceros": ["rhino", "rhinos"],
  "rhino": ["rhinoceros", "rhinos"],

  // Vehicles — BLIP often says "space station" for rocket interiors
  "rocket ship": ["rocket", "spaceship", "spacecraft", "space station", "shuttle", "plane", "airplane"],
  "rocket ship cockpit interior": ["rocket", "spaceship", "spacecraft", "space station", "plane", "airplane"],
  "rocket": ["spaceship", "spacecraft", "space station", "shuttle", "plane", "airplane"],
  "boat": ["boat", "ship", "sailboat", "vessel"],

  // Ocean / water
  "ocean": ["sea", "beach", "water", "wave", "shore", "coast"],
  "dolphins": ["dolphin"],
  "whale": ["whale"],
  "water splash": ["splash", "spray", "water"],

  // Sky / space
  "rainbow in sky": ["rainbow"],
  "rainbow": ["rainbow"],
  "stars": ["star", "planet", "space", "galaxy", "sky"],
  "moon": ["moon", "lunar", "crater"],
  "moon craters": ["moon", "crater", "lunar"],

  // Nature
  "trees": ["tree", "forest", "wood", "clearing"],
  "forest": ["tree", "wood", "clearing"],
  "flowers": ["flower", "garden", "bloom", "meadow"],
  "butterflies": ["butterfly"],

  // Objects — BLIP says "trunk" for treasure chest
  "flag": ["flag"],
  "treasure chest": ["treasure", "chest", "trunk", "box"],
  "treasure": ["chest", "trunk", "box"],
  "crown": ["crown"],
  "balloons": ["balloon"],

  // Creatures / animals (plurals + common BLIP variants)
  "lions": ["lion"],
  "lion": ["lions"],
  // "dolphins" already defined above in Ocean section
  "moon rabbits": ["rabbit", "bunny"],
  "group of moon rabbits": ["rabbit", "bunny"],
  "rabbits": ["rabbit", "bunny"],
  "rabbit": ["rabbits", "bunny"],
};

// ─── SETTING KEYWORD GROUPS ─────────────────────────────────────────────
// Used by the SETTING GATE to verify the generated image matches the scene.
// Each group is a set of BLIP-friendly synonyms for that setting type.

const SETTING_KEYWORD_MAP: Record<string, string[]> = {
  ocean: ["ocean", "sea", "beach", "water", "underwater", "wave", "coral", "shore", "coast", "aqua", "swim"],
  forest: ["forest", "tree", "trees", "wood", "woods", "clearing", "jungle", "leaf", "leaves", "vine"],
  moon: ["moon", "crater", "lunar", "space", "planet", "star", "desert"],
  space: ["space", "star", "planet", "galaxy", "nebula", "orbit", "alien", "cosmos", "moon"],
  sky: ["cloud", "sky", "flying", "soar", "air"],
  mountain: ["mountain", "hill", "peak", "cliff", "summit", "rock"],
  desert: ["desert", "sand", "dune", "arid", "cactus"],
  snow: ["snow", "ice", "frozen", "winter", "arctic", "cold"],
  garden: ["garden", "flower", "bloom", "meadow", "wildflower", "petal"],
  cave: ["cave", "cavern", "grotto", "underground", "stalactite"],
  village: ["village", "town", "house", "home", "building", "hut", "cottage"],
  lake: ["lake", "pond", "reflection", "still water"],
  rain: ["rain", "storm", "thunder", "puddle", "umbrella"],
  savannah: ["savannah", "grassland", "plain", "prairie", "grass"],
  night: ["night", "star", "starlit", "starry", "dark", "moon"],
  indoor: ["room", "indoor", "interior", "cozy", "home", "house"],
  rocket: ["rocket", "spaceship", "spacecraft", "launch", "liftoff", "space station", "shuttle", "space", "plane", "airplane"],
};

/**
 * Resolve setting keywords for a scene category.
 * Returns the keyword group matching the category, or empty array.
 */
export function getSettingKeywords(category: string): string[] {
  // Direct match
  if (SETTING_KEYWORD_MAP[category]) return SETTING_KEYWORD_MAP[category];

  // Compound category — try base parts
  // "ocean_cave" → try "ocean", "cave"
  // "forest_waterfall" → try "forest"
  // "mountain_meadow" → try "mountain"
  for (const part of category.split("_")) {
    if (SETTING_KEYWORD_MAP[part]) return SETTING_KEYWORD_MAP[part];
  }

  // Special mappings
  if (category.includes("moon")) return SETTING_KEYWORD_MAP["moon"];
  if (category.includes("night")) return SETTING_KEYWORD_MAP["night"];
  if (category.includes("rocket") || category.includes("launch")) return SETTING_KEYWORD_MAP["rocket"];

  return [];
}

/**
 * Derive setting keywords from the actual scene setting TEXT.
 * This is more reliable than using the classifier category because
 * when card.setting disagrees with classifier, we want keywords
 * that match what we actually prompted SDXL with.
 *
 * Scans the setting text for keywords from each group,
 * returns the BEST matching group (most keyword hits).
 */
export function deriveSettingKeywordsFromText(settingText: string): string[] {
  const lower = settingText.toLowerCase();

  let bestGroup: string[] = [];
  let bestHits = 0;

  // Check each setting group for keyword matches in the text
  const checkGroups: [string, string[]][] = [
    ["ocean", ["ocean", "sea", "beach", "underwater", "water", "wave", "shore", "coral"]],
    ["forest", ["forest", "tree", "trees", "wood", "woods", "jungle", "clearing"]],
    ["moon", ["moon", "crater", "lunar"]],
    ["space", ["space", "star", "planet", "galaxy", "alien", "cosmos"]],
    ["sky", ["cloud", "sky", "flying"]],
    ["mountain", ["mountain", "hill", "peak", "cliff"]],
    ["desert", ["desert", "sand", "dune"]],
    ["snow", ["snow", "ice", "frozen", "winter", "arctic"]],
    ["garden", ["garden", "flower", "meadow", "bloom"]],
    ["cave", ["cave", "cavern", "grotto", "underground"]],
    ["village", ["village", "town", "house", "home", "building"]],
    ["lake", ["lake", "pond"]],
    ["rain", ["rain", "storm", "thunder"]],
    ["savannah", ["savannah", "grassland", "plain", "prairie"]],
    ["night", ["night", "starlit", "starry"]],
    ["indoor", ["room", "indoor", "interior", "cozy", "home", "house"]],
    ["rocket", ["rocket", "spaceship", "spacecraft", "cockpit", "launch"]],
  ];

  for (const [groupKey, testWords] of checkGroups) {
    const hits = testWords.filter((w) => lower.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestGroup = SETTING_KEYWORD_MAP[groupKey] || testWords;
    }
  }

  return bestGroup;
}

/** Minimum bbox area (fraction of frame) to count as foreground character */
const MIN_BBOX_AREA = 0.08;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(c: string, terms: string[]): boolean {
  return terms.some((t) => c.includes(t));
}

/**
 * Normalize a must-include term for searching in captions.
 * Strips "exactly N", common adjectives, and character name patterns.
 * "playful dolphins" → "dolphins"
 * "colorful rocket ship" → "rocket ship"
 * "Riri the rhinoceros full body" → "rhinoceros full body"
 */
function normMust(term: string): string {
  return norm(term)
    .replace(/^exactly\s+\d+\s+/, "")
    .replace(/\b(playful|friendly|cartoon|cute|colorful|small|big|large|golden|magical|little)\b/g, "")
    .replace(/\b\w+\s+the\s+/, "") // Strip "Name the ..."
    .replace(/\s+full\s+body\b/, "") // Strip "full body" suffix
    .trim();
}

/**
 * Count how many must-include items appear in the caption.
 * Uses synonym expansion + plural tolerance for fuzzy matching.
 *
 * "playful dolphins" → norm to "dolphins" → expand to ["dolphin"] → check caption
 * "colorful rocket ship" → norm to "rocket ship" → expand to ["rocket", "spaceship"] → check
 */
function countMustHits(
  captionNorm: string,
  mustInclude: string[]
): { hits: number; hitTerms: string[]; missedTerms: string[] } {
  let hits = 0;
  const hitTerms: string[] = [];
  const missedTerms: string[] = [];

  for (const raw of mustInclude) {
    const t = normMust(raw);
    if (!t) continue;

    // Build all variants to check:
    // 1. The normalized term itself
    // 2. Expansions of the normalized term
    // 3. Expansions of the raw term (lowercase)
    // 4. Plural-stripped variant
    // 5. Individual words from multi-word terms
    const rawLower = norm(raw);
    const variants = [t, ...(EXPANSIONS[t] ?? []), ...(EXPANSIONS[rawLower] ?? [])];

    // Add plural-stripped variant
    if (t.endsWith("s")) variants.push(t.slice(0, -1));

    // For multi-word terms, also check individual significant words
    // "rocket ship" → also check "rocket"
    const words = t.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      variants.push(word);
      if (word.endsWith("s")) variants.push(word.slice(0, -1));
    }

    const uniqueVariants = Array.from(new Set(variants.filter(Boolean)));

    if (uniqueVariants.some((v) => captionNorm.includes(v))) {
      hits++;
      hitTerms.push(t);
    } else {
      missedTerms.push(t);
    }
  }

  return { hits, hitTerms, missedTerms };
}

// ─── DETERMINISTIC ACCEPT GATE ──────────────────────────────────────────

/**
 * Deterministic accept/reject. Five rules, all must pass.
 *
 * Rule 1:  No humans (boy/girl/man/woman/person)
 * Rule 1b: No busy/crowded scenes (kids-book = simple)
 * Rule 2:  No wrong animal — ALWAYS reject, even if rhino also confirmed
 *          (two animals visible = wrong image)
 * Rule 3:  Rhinoceros confirmed by at least one signal
 * Rule 4:  Character not tiny/background
 * Rule 5C: Key objects — soft penalty (BLIP unreliable for secondary objects)
 * Rule 5:  Must-include enforcement (at least N items)
 */
export function acceptCandidate(
  caption: string,
  clipResult: ClipResult | null,
  detectionResult: DetectionResult | null,
  opts?: AcceptOpts
): { accepted: boolean; rejectReason: string } {
  const c = norm(caption);

  // ── Derive confirmation signals ──
  // STRICT: Only accept explicit "rhino"/"rhinoceros" in BLIP caption.
  // Hippo/elephant are NOT treated as rhino confirmation — if BLIP says
  // hippo or elephant, the inpainting likely produced the wrong animal.
  const blipHasRhino = /\brhinos?\b|\brhinoceros(es)?\b/.test(c);
  const blipHasHippo = /\bhippos?\b|\bhippopotamus(es)?\b/.test(c);
  const blipHasElephant = /\belephants?\b/.test(c);
  const dinoHasRhino = !!(detectionResult?.detected && detectionResult.confidence >= 0.45);
  const clipConfirmsRiri = !!(clipResult && clipResult.similarity >= 0.80);
  const clipAvailable = !!(clipResult && clipResult.similarity > 0);
  // Lowered from 0.72 → 0.68: production runs showed that cartoon inpainting
  // with different backgrounds consistently produces CLIP 0.65-0.72 for
  // CORRECT characters. 0.72 was rejecting good candidates (rhino confirmed
  // by DINO at 0.80+ confidence, but CLIP only 0.66-0.71 because the
  // background differs from the white-bg reference). With anchor compositing
  // strength raised to 0.72, CLIP scores should improve, but 0.68 gives
  // the pipeline room to accept visually correct characters on Round 1
  // instead of escalating to Round 3 every time.
  const clipRejectsRiri = clipAvailable && clipResult!.similarity < 0.68;
  // Even when BLIP confirms "rhino", require minimum CLIP similarity.
  // Raised from 0.50 → 0.65: a BLIP-confirmed rhino with CLIP 0.50-0.65
  // looks visually very different from the reference (different art style,
  // colors, proportions). With 4 candidates per round, we can afford to
  // reject these and find a better match.
  const clipRejectsEvenWithBlip = clipAvailable && clipResult!.similarity < 0.65;

  // Rhino confirmation: BLIP says "rhino", DINO detects it, OR CLIP strongly
  // matches the anchor image. CLIP >= 0.78 means the candidate looks very similar
  // to the reference Riri image — even if BLIP captions it as "cartoon animal" or
  // "gray creature", the visual match confirms it's the right character.
  // Elephant/hippo are in WRONG_ANIMALS — they are always rejected by Rule 2 first.
  const rhinoConfirmedByVision = blipHasRhino || dinoHasRhino;
  const rhinoConfirmed = rhinoConfirmedByVision || clipConfirmsRiri;

  // ── RULE 1: No humans ──
  // Only reject actual human terms. Cockpit/astronaut/pilot are NOT rejected —
  // they're valid for space-themed stories where Riri is inside a rocket.
  if (includesAny(c, HUMAN_TERMS)) {
    return { accepted: false, rejectReason: "RULE 1: HUMAN detected" };
  }

  // ── RULE 1b: No busy/crowded scenes (kids-book = simple) ──
  if (includesAny(c, BUSY_SCENE_TERMS)) {
    return { accepted: false, rejectReason: "RULE 1b: BUSY/CROWDED scene detected" };
  }

  // ── RULE 1c: No black-and-white / grayscale / sketch images ──
  // Kids' book images MUST be colorful. BLIP captions that say "black and white",
  // "grayscale", or "sketch" indicate a dull/monotone image unsuitable for a picture book.
  const BW_TERMS = ["black and white", "grayscale", "monochrome", "pencil sketch", "pencil drawing", "charcoal"];
  if (BW_TERMS.some(t => c.includes(t))) {
    const matched = BW_TERMS.find(t => c.includes(t));
    return { accepted: false, rejectReason: `RULE 1c: BLACK-AND-WHITE/SKETCH detected ("${matched}")` };
  }

  // ── RULE 1d: No cropped / close-up / portrait images ──
  // Kids' book needs full-body character. If BLIP describes a close-up or
  // partial body, the mask/framing failed and the image is unusable.
  const CROP_TERMS = ["close up", "close-up", "closeup", "portrait", "headshot", "face only", "cropped", "cut off", "partial"];
  const cropMatch = CROP_TERMS.find(t => c.includes(t));
  if (cropMatch) {
    return { accepted: false, rejectReason: `RULE 1d: CROPPED/CLOSE-UP detected ("${cropMatch}")` };
  }

  // ── RULE 2: Wrong animal gate — STRICT, NO OVERRIDE ──
  // If BLIP identifies a wrong animal in the caption, ALWAYS reject.
  // Previously DINO was used to override BLIP ("BLIP says cow but DINO says rhino"),
  // but this produced images that looked like cows/zebras/dinosaurs to humans.
  // DINO detects "large quadruped shape" and maps it to "rhinoceros" because
  // that's the query — a cow IS a large quadruped, so DINO gives decent
  // confidence even on cow images. BLIP's species identification, while
  // imperfect, is a much better signal: if it says "cow", the image looks
  // like a cow. The retry mechanism (9+ candidates per page) ensures we
  // eventually find images where BLIP correctly identifies rhinoceros.
  // DINO is still used for Rule 3 (character present) and Rule 4 (size).
  const allowedList = (opts?.allowedAnimals ?? []).map(a => a.toLowerCase());
  const allowedSet = new Set(allowedList);
  // Expand allowed animals to include singular/plural variants
  for (const a of allowedList) {
    if (a.endsWith("s")) allowedSet.add(a.slice(0, -1));  // "lions" → "lion"
    else allowedSet.add(a + "s");  // "lion" → "lions"
  }
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a) && !allowedSet.has(a));
  if (wrongAnimal) {
    return {
      accepted: false,
      rejectReason: `RULE 2: WRONG ANIMAL "${wrongAnimal}" detected in caption`,
    };
  }

  // ── RULE 3: Rhinoceros confirmed by at least one signal ──
  if (!rhinoConfirmed) {
    const signals = [
      `BLIP=${blipHasRhino}`,
      `DINO=${detectionResult ? `conf=${detectionResult.confidence.toFixed(2)}` : "off"}`,
      `CLIP=${clipResult ? `sim=${clipResult.similarity.toFixed(3)}` : "off"}`,
    ].join(", ");
    return {
      accepted: false,
      rejectReason: `RULE 3: MISSING CHARACTER (no rhino confirmed: ${signals})`,
    };
  }

  // ── RULE 3b: CLIP identity gate — candidate must resemble the reference ──
  // When CLIP is available, reject candidates with low similarity to the
  // anchor image. This catches cases where the image technically has "a rhinoceros"
  // (per BLIP or DINO) but it looks visually different from the reference Riri.
  // Threshold raised to 0.68 — character must look reasonably like the anchor.
  if (clipRejectsRiri && !blipHasRhino) {
    // If BLIP doesn't say rhino, CLIP similarity < 0.68 means it's a different character.
    return {
      accepted: false,
      rejectReason: `RULE 3b: CLIP IDENTITY MISMATCH (similarity=${clipResult!.similarity.toFixed(3)} < 0.68, doesn't resemble reference)`,
    };
  }

  // ── RULE 3c: CLIP consistency gate — even BLIP-confirmed rhinos must look like Riri ──
  // A cartoon rhino with wrong colors, proportions, or art style breaks page-to-page
  // consistency even if BLIP correctly identifies it as "rhinoceros".
  // Raised from 0.50 → 0.65: rejects rhinos that look too different from the reference.
  if (clipRejectsEvenWithBlip && blipHasRhino) {
    return {
      accepted: false,
      rejectReason: `RULE 3c: CLIP CONSISTENCY MISMATCH (similarity=${clipResult!.similarity.toFixed(3)} < 0.65, BLIP says rhino but looks different from reference)`,
    };
  }

  // ── RULE 4: Character not tiny/background ──
  if (detectionResult?.detected) {
    if (detectionResult.bestBboxArea < MIN_BBOX_AREA) {
      return {
        accepted: false,
        rejectReason: `RULE 4: TINY CHARACTER — bbox ${(detectionResult.bestBboxArea * 100).toFixed(1)}% < ${(MIN_BBOX_AREA * 100)}%`,
      };
    }
  } else if (!blipHasRhino) {
    // No DINO and no BLIP rhino — can't verify anything about size.
    // (If BLIP confirmed rhino, trust it — we already passed Rule 3.)
    const hasCompositionCue = /\bstanding\b|\bfull body\b|\bwhole body\b|\bcentered\b|\bforeground\b/.test(c);
    const clipIsStrong = !!(clipResult && clipResult.similarity >= 0.80);
    if (!hasCompositionCue && !clipIsStrong) {
      return {
        accepted: false,
        rejectReason: "RULE 4: SIZE UNVERIFIED (no DINO, no BLIP rhino, weak composition + CLIP)",
      };
    }
  }
  // If BLIP says "rhinoceros" and DINO is off, trust BLIP on size —
  // the character is visible enough for BLIP to caption it, not a tiny background speck.

  // ── RULE 5: TIERED GATE (character + setting + key objects) ──
  //
  // Gate A (hard): Character must be detected (already handled by Rule 3)
  //
  // Gate B (hard): Setting must match — at least 1 setting keyword in caption.
  //   e.g. ocean page → caption must contain ocean/sea/water/wave/beach
  //   This prevents "desert rhino" passing for an ocean scene.
  //
  // Gate C (hard-ish): At least 1 key scene object visible.
  //   e.g. dolphins / rocket ship / rainbow
  //   Only enforced if key objects were specified.

  // Gate B: Setting gate — SOFT BONUS, NOT HARD REJECT
  // BLIP captions are extremely terse (1 sentence). They often describe
  // "a rhino standing in a field" without mentioning "forest" or "trees".
  // The plate prompt already controls the setting type — if we prompted
  // "forest scene" and SDXL drew a forest, BLIP just might not say "forest".
  // Hard-rejecting for missing setting keywords kills too many good images.
  const settingKw = opts?.settingKeywords ?? [];
  if (settingKw.length > 0) {
    const settingHit = settingKw.some((kw) => c.includes(kw));
    if (settingHit) {
      console.log(`[Rule 5B] Setting match found — bonus applied`);
    } else {
      console.log(`[Rule 5B] No setting keywords in caption — no bonus (NOT rejecting)`);
    }
    // Bonus is applied in scoreCaption(), not here
  }

  // Gate C: Key object check — SOFT PENALTY, NOT HARD REJECT.
  // BLIP captions are extremely terse (1 sentence) and unreliable at detecting
  // secondary objects like "rocket ship" even when they're clearly visible.
  // Hard-rejecting for missing objects causes 80%+ false-reject rates.
  // Instead: apply a score penalty so images with correct character are still
  // accepted, but images that DO show objects score higher and get selected.
  const keyObjects = opts?.keyObjects ?? [];
  if (keyObjects.length > 0) {
    const { hits: objHits, hitTerms: objHitTerms, missedTerms: objMissed } = countMustHits(c, keyObjects);
    if (objHits > 0) {
      console.log(`[Rule 5C] Key objects found: ${objHitTerms.join(", ")} (${objHits}/${keyObjects.length}) — bonus applied`);
    } else {
      console.log(`[Rule 5C] No key objects in caption (wanted [${keyObjects.join(", ")}]) — penalty applied (NOT rejecting)`);
      // Penalty is applied in scoreCaption(), not here — no hard reject
    }
  }

  // Legacy must-include check (backward compat, softer)
  // When DINO strongly confirms rhinoceros, count "rhinoceros"/"riri" as found
  // even if BLIP didn't say it. BLIP misidentifies cartoon rhinos ~70% of the time.
  const mustInclude = opts?.mustInclude ?? [];
  const req = Math.max(0, opts?.requireMustIncludeCount ?? 0);
  if (req > 0 && mustInclude.length > 0) {
    let { hits, hitTerms, missedTerms } = countMustHits(c, mustInclude);
    // DINO override: if DINO found rhinoceros, credit any rhino/riri must-include items
    if (dinoHasRhino && missedTerms.length > 0) {
      const rhinoTerms = missedTerms.filter(t => /rhino|riri/i.test(t));
      if (rhinoTerms.length > 0) {
        hits += rhinoTerms.length;
        hitTerms = [...hitTerms, ...rhinoTerms.map(t => `${t} (DINO)`)];
        missedTerms = missedTerms.filter(t => !/rhino|riri/i.test(t));
        console.log(`[Rule 5] DINO override: counted ${rhinoTerms.join(", ")} as found via detection`);
      }
    }
    if (hits < req) {
      return {
        accepted: false,
        rejectReason: `RULE 5: MUST-INCLUDE FAILED — ${hits}/${req} hit (found: ${hitTerms.join(", ") || "none"}, missed: ${missedTerms.join(", ") || "none"})`,
      };
    }
  }

  return { accepted: true, rejectReason: "" };
}

// ─── SCORE (for ranking among accepted candidates) ──────────────────────

/**
 * Compute a ranking score from BLIP caption.
 * ONLY used to rank accepted candidates against each other.
 * The accept/reject decision is made by acceptCandidate() above.
 */
export function scoreCaption(
  caption: string,
  opts?: ScoreOptions
): { score: number; reasons: string[] } {
  const c = norm(caption);
  const reasons: string[] = [];

  const hasRhino = /\brhinos?\b|\brhinoceros(es)?\b/.test(c);

  if (!hasRhino) {
    reasons.push("0 base: rhino/rhinoceros not in caption");
    return { score: 0, reasons };
  }

  // Only rhino-confirmed images reach scoring (strict accept gate)
  let score = 6;
  reasons.push("+6 base: rhino/rhinoceros confirmed in caption");

  if (/\bcartoon\b|\billustration\b|\banimated\b|\bdrawing\b/.test(c)) {
    score += 1;
    reasons.push("+1 cartoon/illustration");
  }
  if (/\bfull body\b|\bstanding\b|\bwhole body\b/.test(c)) {
    score += 2;
    reasons.push("+2 full body / standing");
  }
  if (/\bgr[ae]y\b/.test(c)) {
    score += 1;
    reasons.push("+1 gray/grey");
  }
  if (/\bhorn\b/.test(c)) {
    score += 1;
    reasons.push("+1 horn");
  }

  if (/\btwo\b.*\brhino|\bmultiple\b.*\brhino|\bsecond\b.*\brhino/.test(c)) {
    score -= 4;
    reasons.push("-4 duplicate rhino");
  }
  if (/\btext\b|\bwatermark\b|\bsignature\b|\bwriting\b|\bletters\b/.test(c)) {
    score -= 2;
    reasons.push("-2 text/watermark");
  }
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a));
  if (wrongAnimal) {
    score -= 3;
    reasons.push(`-3 wrong animal "${wrongAnimal}" also present`);
  }

  // Setting match bonus
  const settingKw = opts?.settingKeywords ?? [];
  if (settingKw.length > 0) {
    const settingHits = settingKw.filter((kw) => c.includes(kw));
    if (settingHits.length > 0) {
      score += 2;
      reasons.push(`+2 setting match (${settingHits.slice(0, 3).join(", ")})`);
    }
  }

  // Key object scoring — large bonus for found, moderate penalty for missing.
  // This replaces the old hard-reject: candidates with objects rank much higher,
  // but candidates without objects are still accepted if the character is correct.
  const keyObjects = opts?.keyObjects ?? [];
  if (keyObjects.length > 0) {
    const { hits: objHits, hitTerms: objHitTerms } = countMustHits(c, keyObjects);
    if (objHits > 0) {
      const objBonus = objHits * 3;
      score += objBonus;
      reasons.push(`+${objBonus} key objects (${objHitTerms.join(", ")})`);
    } else {
      score -= 4;
      reasons.push("-4 no key objects found (BLIP may have missed them)");
    }
  }

  // Legacy must-include bonus (backward compat)
  const must = opts?.mustInclude ?? [];
  const requireCount = opts?.requireMustIncludeCount ?? 0;
  if (must.length > 0 && requireCount > 0) {
    const { hits, hitTerms, missedTerms } = countMustHits(c, must);
    reasons.push(`mustInclude: ${hits}/${must.length} (found: ${hitTerms.join(", ") || "none"}, missed: ${missedTerms.join(", ") || "none"})`);
    if (hits >= requireCount) {
      const sceneHitBonus = Math.max(0, hits - 1) * 2;
      score += 1 + sceneHitBonus;
      reasons.push(`+${1 + sceneHitBonus} must-includes satisfied (${hits} hits)`);
    }
  }

  return { score, reasons };
}

/**
 * Get a BLIP caption for an image URL.
 */
export async function captionImage(
  replicate: Replicate,
  imageUrl: string
): Promise<string> {
  try {
    const output = await replicate.run(
      `salesforce/blip:${BLIP_VERSION}`,
      {
        input: {
          image: imageUrl,
          task: "image_captioning",
        },
      }
    );

    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return String(output[0]);
    return String(output);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[BLIP] Caption failed: ${msg}`);
    return "";
  }
}

// ─── MAIN SCORING FUNCTION ──────────────────────────────────────────────

/**
 * Score a single candidate with deterministic accept/reject.
 *
 * Flow:
 *   1. Run BLIP, CLIP, detection in parallel
 *   2. acceptCandidate() — binary yes/no, five hard rules
 *      (passes mustInclude/requireMustIncludeCount from opts)
 *   3. scoreCaption() — ranking among accepted candidates
 *   4. Rejected → hard-clamped to -100 (never beats any accept)
 */
export async function scoreCandidate(
  replicate: Replicate,
  imageUrl: string,
  opts?: ScoreOptions
): Promise<CandidateResult> {
  const hasClip = !!(opts?.anchorImageUrl || opts?.cachedAnchorEmbedding?.length);
  const hasDetection = opts?.enableDetection ?? false;

  const [caption, clipResult, detectionResult] = await Promise.all([
    captionImage(replicate, imageUrl),
    hasClip
      ? (opts?.cachedAnchorEmbedding?.length
          ? scoreClipWithCachedAnchor(replicate, imageUrl, opts.cachedAnchorEmbedding)
          : scoreClipSimilarity(replicate, imageUrl, opts!.anchorImageUrl!))
      : Promise.resolve(null as ClipResult | null),
    hasDetection
      ? detectRhinoceros(replicate, imageUrl, opts?.detectorModel)
      : Promise.resolve(null as DetectionResult | null),
  ]);

  // 1. Deterministic accept/reject WITH tiered gates
  const { accepted, rejectReason } = acceptCandidate(
    caption,
    clipResult,
    detectionResult,
    {
      mustInclude: opts?.mustInclude,
      requireMustIncludeCount: opts?.requireMustIncludeCount,
      settingKeywords: opts?.settingKeywords,
      keyObjects: opts?.keyObjects,
      allowedAnimals: opts?.allowedAnimals,
    }
  );

  // 2. Ranking score (only among accepted)
  let { score, reasons } = scoreCaption(caption, opts);

  // DINO base bonus: when BLIP doesn't say "rhino" (score=0) but the image
  // was accepted via DINO/CLIP confirmation, add a partial base score.
  // Without this, 70% of cartoon rhino images get score=0 from scoreCaption()
  // because BLIP misidentifies them, making marginal and good images
  // indistinguishable. The +3 base raises the floor for DINO-confirmed images.
  if (accepted && score === 0 && detectionResult?.detected && detectionResult.confidence >= 0.65) {
    score += 3;
    reasons.push("+3 DINO-confirmed character (BLIP missed rhino)");
  }

  if (clipResult) {
    reasons.push(`CLIP: ${clipResult.similarity.toFixed(3)}`);
    if (accepted) score += clipResult.scoreContribution;
  }
  if (detectionResult) {
    reasons.push(`DINO: conf=${detectionResult.confidence.toFixed(2)} bbox=${(detectionResult.bestBboxArea * 100).toFixed(1)}%`);
    if (accepted) score += detectionResult.scoreContribution;
  }

  // Hard-clamp rejected so rejects never beat accepts
  if (!accepted) {
    reasons.push(`REJECTED: ${rejectReason}`);
    score = -100;
  } else {
    reasons.push("ACCEPTED");
  }

  console.log(
    `[Score] ${accepted ? "ACCEPTED" : "REJECTED"}: ` +
    `caption="${caption}" score=${score} ` +
    `BLIP-rhino=${/\brhinos?\b|\brhinoceros/.test(norm(caption))} ` +
    `CLIP=${clipResult ? clipResult.similarity.toFixed(3) : "off"} ` +
    `DINO=${detectionResult ? `conf=${detectionResult.confidence.toFixed(2)},bbox=${(detectionResult.bestBboxArea * 100).toFixed(1)}%` : "off"}` +
    (rejectReason ? ` reason="${rejectReason}"` : "")
  );

  return {
    url: imageUrl,
    score,
    accepted,
    rejectReason,
    caption,
    reasons,
    clipSimilarity: clipResult?.similarity,
    detectionConfidence: detectionResult?.confidence,
    detectionBboxArea: detectionResult?.bestBboxArea,
  };
}

// ─── SELECTION: BEST ACCEPTED, NOT FIRST ACCEPTED ───────────────────────

/**
 * Generate all candidates per round, pick BEST accepted (not first).
 *
 * Why not "first accepted"?
 *   First-accepted locks in "technically accepted but ugly/weird" pages.
 *   Running all candidates and picking the highest-scored accepted
 *   gets consistently better results for kids-book quality.
 *
 * If none accepted after both rounds, returns least-bad rejected
 * (all rejected are clamped to -100, so failure is deterministic).
 */
export async function generateAndSelectBest(
  generateFn: (seed: number, maskDataUrl: string) => Promise<string>,
  replicate: Replicate,
  baseSeed: number,
  initialMaskDataUrl: string,
  escalatedMaskDataUrl?: string,
  numCandidates: number = 3,
  pageIndex: number = 0,
  scoreOpts?: ScoreOptions
): Promise<CandidateResult> {
  const all: CandidateResult[] = [];

  async function runRound(maskDataUrl: string, seedBase: number, roundLabel: string) {
    console.log(`[Select ${pageIndex}] ${roundLabel} (${numCandidates} candidates in parallel)`);

    const tasks = Array.from({ length: numCandidates }, async (_, i) => {
      const seed = seedBase + i * 29;
      const url = await generateFn(seed, maskDataUrl);
      if (!url) {
        console.warn(`[Select ${pageIndex}] Candidate ${i + 1} generation failed`);
        return null;
      }

      const result = await scoreCandidate(replicate, url, scoreOpts);

      console.log(
        `[Select ${pageIndex}] Candidate ${i + 1}: ${result.accepted ? "ACCEPTED" : "REJECTED"} ` +
        `score=${result.score}${result.rejectReason ? ` reason="${result.rejectReason}"` : ""}`
      );

      return result;
    });

    const results = await Promise.all(tasks);
    for (const r of results) {
      if (r) all.push(r);
    }
  }

  // ── Round 1: initial mask ──
  await runRound(initialMaskDataUrl, baseSeed, "Round 1: initial mask");

  // Pick best accepted from round 1
  const accepted1 = all.filter((x) => x.accepted);
  if (accepted1.length > 0) {
    accepted1.sort((a, b) => b.score - a.score);
    console.log(
      `[Select ${pageIndex}] Best accepted from round 1: score=${accepted1[0].score} ` +
      `(${accepted1.length} accepted of ${all.length} total)`
    );
    return accepted1[0];
  }

  // ── Round 2: escalated (larger) mask ──
  if (escalatedMaskDataUrl) {
    await runRound(escalatedMaskDataUrl, baseSeed + numCandidates * 29, "Round 2: ESCALATED mask");

    const accepted2 = all.filter((x) => x.accepted);
    if (accepted2.length > 0) {
      accepted2.sort((a, b) => b.score - a.score);
      console.log(
        `[Select ${pageIndex}] Best accepted from round 2: score=${accepted2[0].score} ` +
        `(${accepted2.length} accepted of ${all.length} total)`
      );
      return accepted2[0];
    }
  }

  // ── None accepted — return least-bad rejected ──
  if (all.length === 0) {
    return {
      url: "", score: -999, accepted: false,
      rejectReason: "all candidates failed to generate",
      caption: "", reasons: ["all candidates failed"],
    };
  }

  // Return EMPTY URL so caller cannot accidentally use a rejected image.
  all.sort((a, b) => b.score - a.score);
  const best = all[0];

  console.warn(
    `[Select ${pageIndex}] WARNING: No candidate accepted. ` +
    `Best reject: score=${best.score}, reason="${best.rejectReason}". ` +
    `${all.length} total candidates tried. Returning EMPTY URL.`
  );

  return {
    url: "",  // EMPTY — never ship a rejected image
    score: -999,
    accepted: false,
    rejectReason: best.rejectReason,
    caption: best.caption,
    reasons: [...best.reasons, "ALL CANDIDATES REJECTED — url cleared"],
  };
}
