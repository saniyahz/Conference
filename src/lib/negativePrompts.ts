/**
 * Quality negatives — avoid common SDXL artifacts.
 */
export function buildQualityOnlyNegative(): string {
  return [
    "low quality",
    "blurry",
    "distorted",
    "deformed",
    "disfigured",
    "bad anatomy",
    "extra limbs",
    "mutated",
    "ugly",
    "worst quality",
    "jpeg artifacts",
    "duplicate",
    // Color enforcement — kids' book must be vibrant, never monochrome
    "black and white",
    "grayscale",
    "monochrome",
    "pencil sketch",
    "pencil drawing",
    "charcoal",
    "desaturated",
    "faded",
    "washed out",
  ].join(", ");
}

/**
 * Framing negatives — prevent zoom/crop that hides the character's body.
 * These force SDXL to keep the full body visible with margins.
 */
export function buildFramingNegative(): string {
  return [
    "cropped",
    "cut off",
    "out of frame",
    "partial body",
    "missing legs",
    "missing feet",
    "zoomed in",
    "close-up",
    "headshot",
    "portrait",
    "bust",
    "face only",
  ].join(", ");
}

/**
 * Character-safety negatives — prevent unwanted humans, wrong animals,
 * and duplicate rhinos. These go on the CHARACTER INPAINT pass.
 *
 * NOTE: Species-specific anti-drift animals (cow, bull, buffalo, etc.)
 * and near-species confusions (elephant, hippo) are now in
 * buildHardBanNegative(species) which is PREPENDED. This list contains
 * only the REMAINING wrong animals to avoid wasting SDXL's ~77-token budget
 * on duplicates. The hard ban terms get tokens 1-30 (highest attention);
 * these terms get tokens 31-60 (still within the window).
 */
export function buildCharacterSafetyNegative(): string {
  return [
    // Block humans — basic terms only.
    // Do NOT include "child" (conflicts with "children's picture book" in prompt).
    "human", "boy", "girl", "person", "man", "woman",
    "people", "realistic human",
    // Block wrong animals NOT already in hard ban.
    // elephant, hippo, cow, bull, buffalo, bison, zebra, dinosaur etc.
    // are covered by species-specific anti-drift in buildHardBanNegative().
    "cat", "dog", "bear", "lion", "tiger", "rabbit",
    "monkey", "horse", "giraffe", "camel", "deer", "wolf", "fox", "pig",
    "dolphin", "whale", "bird", "penguin", "frog", "turtle",
    // Block duplicate rhinos
    "two rhinoceroses", "extra rhinoceros",
    // NOTE: Accessories (hat, unicorn horn, cape, etc.) are in buildHardBanNegative()
  ].join(", ");
}

/**
 * Text/watermark negatives — always include these.
 */
export function buildNoTextNegative(): string {
  return [
    "text",
    "watermark",
    "signature",
    "caption",
    "words",
    "letters",
    "logo",
    "writing",
    "subtitle",
  ].join(", ");
}

/**
 * Full negative for inpaint character pass.
 *
 * ORDER MATTERS — SDXL only processes ~77 tokens. Hard bans (hat, crop, text)
 * are prepended separately in imageGeneration.ts, so this list starts with
 * character safety (wrong animals + humans) then quality. Framing and text
 * are handled by buildHardBanNegative() and don't need to be here.
 */
export function buildInpaintCharacterNegative(): string {
  return [
    buildCharacterSafetyNegative(),   // Wrong animals + humans (MOST IMPORTANT after hard bans)
    buildQualityOnlyNegative(),       // Quality terms (can overflow past 77 tokens — least critical)
    // NOTE: Framing (crop blockers) and text/watermark are in buildHardBanNegative()
    // which is PREPENDED in imageGeneration.ts — no need to duplicate here.
  ].join(", ");
}

/**
 * HARD-BAN negatives — PREPENDED before the sanitized list so they are:
 *   1. Never stripped by sanitizeNegatives()
 *   2. Within SDXL's ~77 token window (tokens past ~77 are ignored)
 *
 * The sanitizer incorrectly removes "hat", "unicorn horn", "text" because
 * the positive prompt contains "no hat" / "not unicorn horn" / "no text"
 * and combined.includes("hat") matches the substring inside "no hat".
 *
 * Species-aware: when species is provided, species-specific anti-drift
 * animals are placed FIRST (tokens 1-10) for maximum SDXL attention.
 * Without this, SDXL frequently substitutes cow/bull/buffalo for rhinoceros.
 */
export function buildHardBanNegative(species?: string): string {
  const terms: string[] = [];

  // SPECIES-SPECIFIC anti-drift — FIRST POSITION (highest SDXL attention).
  // These are the animals SDXL most commonly substitutes for the target species.
  // Placing them at tokens 1-10 ensures maximum negative effect.
  const antiDrift: Record<string, string[]> = {
    'rhinoceros': ['cow', 'bull', 'calf', 'ox', 'buffalo', 'bison', 'goat', 'antelope', 'dinosaur', 'zebra'],
    'rhino': ['cow', 'bull', 'calf', 'ox', 'buffalo', 'bison', 'goat', 'antelope', 'dinosaur', 'zebra'],
    'elephant': ['hippo', 'rhinoceros', 'mammoth', 'pig', 'cow'],
    'dog': ['wolf', 'fox', 'coyote', 'bear'],
    'puppy': ['wolf', 'fox', 'coyote', 'bear', 'kitten'],
    'cat': ['lion', 'tiger', 'leopard', 'fox'],
    'kitten': ['lion', 'tiger', 'puppy', 'fox'],
    'rabbit': ['cat', 'dog', 'mouse', 'hamster'],
    'bunny': ['cat', 'dog', 'mouse', 'hamster'],
    'lion': ['dog', 'cat', 'wolf', 'bear'],
    'bear': ['dog', 'wolf', 'gorilla'],
  };
  const speciesKey = species?.toLowerCase() || '';
  const driftTerms = antiDrift[speciesKey] || [];
  terms.push(...driftTerms);
  console.log(`[HardBan] Species "${species}" anti-drift (first tokens): [${driftTerms.join(", ")}]`);

  // Near-species confusions (skip if already covered by anti-drift above)
  for (const t of ["elephant", "baby elephant", "hippo", "hippopotamus"]) {
    if (!terms.includes(t)) terms.push(t);
  }
  // Accessories — condensed to save token budget
  terms.push(
    "party hat", "top hat", "birthday hat", "crown", "cape", "costume",
  );
  // Clothing — SDXL invents outfits (orange jacket, scarf, dress)
  terms.push("clothing", "jacket", "dress", "scarf");
  // Horn drift
  terms.push("unicorn horn", "extra horn", "long horn");
  // Duplicate characters — SDXL frequently generates 2-5 copies of the main animal
  terms.push(
    "multiple rhinos", "multiple rhinoceros", "two rhinos", "three rhinos",
    "group of animals", "herd", "pack", "crowd of animals",
    "multiple animals", "two animals", "duplicate", "extra animal",
  );
  // Crop — always enforced
  terms.push(
    "cropped", "cut off", "out of frame", "close-up",
    "partial body", "missing legs", "missing feet",
  );
  // Text
  terms.push("text", "watermark");

  return terms.join(", ");
}

/**
 * Full negative for plate/background pass (solo pages — no secondary actors).
 * Blocks ALL animals and characters from the plate.
 */
export function buildPlateNegative(): string {
  return [
    buildQualityOnlyNegative(),
    buildNoTextNegative(),
    "character",
    "animal",
    "rhinoceros",
    "person",
  ].join(", ");
}

/**
 * Plate negative for MULTI-CHARACTER pages (dolphins, rabbits, etc. in plate).
 * Allows secondary actors in the plate while blocking the main character.
 * "animal" is NOT blocked — secondary actors ARE animals.
 */
export function buildMultiCharPlateNegative(mainSpecies: string): string {
  // Block main character species AGGRESSIVELY from plate.
  // SDXL generates gray stocky animals that look like rhinos even when told
  // "no rhinoceros" — need multiple synonyms and visual descriptions too.
  const speciesSynonyms: Record<string, string[]> = {
    'rhinoceros': ['rhinoceros', 'rhino', 'gray animal with horn', 'horned animal', 'gray quadruped'],
    'rhino': ['rhinoceros', 'rhino', 'gray animal with horn', 'horned animal', 'gray quadruped'],
    'elephant': ['elephant', 'gray animal with trunk', 'large gray animal'],
    'lion': ['lion', 'mane animal', 'large cat'],
  };
  const synonyms = speciesSynonyms[mainSpecies.toLowerCase()] || [mainSpecies];
  return [
    buildQualityOnlyNegative(),
    buildNoTextNegative(),
    ...synonyms,           // Block main character with multiple synonyms
    "person",
    "human",
  ].join(", ");
}

/**
 * Sanitize negatives so they don't contradict the positive prompt.
 * Never remove a term the prompt explicitly needs.
 */
export function sanitizeNegatives(
  negativePrompt: string,
  positivePrompt: string,
  settingContext: string,
  mustInclude: string[]
): string {
  const combined = `${positivePrompt} ${settingContext} ${mustInclude.join(" ")}`.toLowerCase();
  const negTerms = negativePrompt.split(",").map((t) => t.trim());
  const removed: string[] = [];

  const filtered = negTerms.filter((term) => {
    const lower = term.toLowerCase();

    // Direct substring match: "dolphin" found in "dolphins"
    if (combined.includes(lower)) { removed.push(lower); return false; }

    // Plural/singular: "dolphins" in negative but "dolphin" in mustInclude
    const singular = lower.endsWith("s") ? lower.slice(0, -1) : lower;
    const plural = lower.endsWith("s") ? lower : lower + "s";
    if (combined.includes(singular) || combined.includes(plural)) { removed.push(lower); return false; }

    // Semantic overrides
    if (lower === "animal" && combined.includes("rhinoceros")) { removed.push(lower); return false; }
    if (lower === "creature" && combined.includes("rhinoceros")) { removed.push(lower); return false; }
    if (lower === "nature" && /forest|tree|jungle|garden/.test(combined)) { removed.push(lower); return false; }
    if (lower === "water" && /stream|waterfall|river|ocean|lake|underwater/.test(combined)) { removed.push(lower); return false; }
    if (lower === "fish" && /ocean|underwater|sea|coral/.test(combined)) { removed.push(lower); return false; }

    return true;
  });

  if (removed.length > 0) {
    console.log(`[SanitizeNeg] Removed ${removed.length} contradicting terms: [${removed.join(", ")}]`);
  }

  return filtered.join(", ");
}
