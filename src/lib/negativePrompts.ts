/**
 * Quality negatives — avoid common SDXL artifacts.
 * KEEP SHORT — this lands at tokens ~50-65 of the negative prompt.
 * Only the most impactful terms survive the token budget.
 */
export function buildQualityOnlyNegative(): string {
  return [
    // Anti-realistic — force kid-friendly cartoon style, prevent SDXL from
    // rendering realistic/photographic animals on some pages.
    "realistic", "photorealistic", "3D render", "photograph", "lifelike",
    "detailed skin texture", "wrinkles", "rough skin",
    "blurry", "deformed", "bad anatomy",
    // Color enforcement — kids' book must be vibrant flat colors
    "black and white", "grayscale", "monochrome", "sketch",
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
 * Character-safety negatives — prevent unwanted humans and wrong animals.
 * These go on the CHARACTER INPAINT pass AFTER the hard ban terms.
 *
 * IMPORTANT: Keep this SHORT. The hard ban already uses ~30 tokens.
 * This list gets tokens ~30-50. Only include terms NOT already in hard ban.
 * Do NOT duplicate species anti-drift terms (cow, bull, elephant, etc.).
 */
export function buildCharacterSafetyNegative(): string {
  return [
    // Block humans (NOT "child" — conflicts with "children's" in prompt)
    "human", "person", "boy", "girl",
    // Block common wrong animals NOT in hard ban
    "horse", "monkey", "giraffe", "wolf", "pig", "deer",
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
 * CRITICAL: Total negative prompt (hard ban + character safety + quality)
 * MUST stay under ~70 tokens. SDXL ignores tokens past ~77.
 *
 * Token budget allocation:
 *   Tokens 1-12:  Species anti-drift (highest priority)
 *   Tokens 13-22: Accessories/clothing blockers
 *   Tokens 23-32: Duplicate character blockers
 *   Tokens 33-40: Crop/framing blockers
 *   Tokens 40-50: Human blockers
 *   Tokens 50-65: Quality terms
 *   Tokens 65-77: Text/watermark
 */
export function buildHardBanNegative(species?: string): string {
  const terms: string[] = [];

  // SPECIES-SPECIFIC anti-drift — FIRST POSITION (highest SDXL attention).
  // Only the TOP confusion species — keep this to 8-10 terms max.
  const antiDrift: Record<string, string[]> = {
    'rhinoceros': ['cow', 'bull', 'hippo', 'elephant', 'buffalo', 'dinosaur', 'cat', 'dog'],
    'rhino': ['cow', 'bull', 'hippo', 'elephant', 'buffalo', 'dinosaur', 'cat', 'dog'],
    'elephant': ['hippo', 'rhinoceros', 'cow', 'pig'],
    'dog': ['wolf', 'fox', 'bear'],
    'cat': ['lion', 'tiger', 'fox'],
    'rabbit': ['cat', 'dog', 'mouse'],
    'lion': ['dog', 'cat', 'wolf'],
    'bear': ['dog', 'wolf'],
  };
  const speciesKey = species?.toLowerCase() || '';
  const driftTerms = antiDrift[speciesKey] || [];
  terms.push(...driftTerms);
  console.log(`[HardBan] Species "${species}" anti-drift (first tokens): [${driftTerms.join(", ")}]`);

  // Accessories — top SDXL confusions only
  terms.push("hat", "crown", "cape", "costume", "clothing", "jacket");
  // Horn drift
  terms.push("unicorn horn");
  // Duplicate characters (condensed)
  terms.push("multiple animals", "two animals", "herd", "duplicate");
  // Crop — always enforced
  terms.push("cropped", "cut off", "close-up", "partial body");
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
