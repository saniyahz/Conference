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
 * The wrong-animal list is critical: without it, SDXL frequently
 * substitutes elephant/cat/bear/lion inside the mask region instead
 * of the prompted rhinoceros.
 */
export function buildCharacterSafetyNegative(): string {
  return [
    // Block humans — basic terms only.
    // Do NOT include "child" (conflicts with "children's picture book" in prompt).
    // Do NOT include space-themed terms (astronaut/pilot/helmet/cockpit) —
    // those are legitimate for space-themed story pages.
    "human", "boy", "girl", "person", "man", "woman",
    "people", "realistic human", "photo of person",
    // Block wrong animals (common SDXL substitutions for rhino).
    // These are removed by sanitizeNegatives() for multi-char pages
    // that need specific secondary actors (lions, dolphins, etc).
    "elephant", "cat", "dog", "bear", "lion", "tiger", "rabbit",
    "monkey", "horse", "cow", "giraffe", "zebra", "hippo",
    "hippopotamus", "camel", "deer", "wolf", "fox", "pig",
    "dolphin", "whale", "bird", "penguin", "frog", "turtle",
    // Block duplicate rhinos
    "two rhinoceroses", "multiple rhinos", "extra rhinoceros",
    "duplicate rhino",
    // NOTE: Accessories (hat, unicorn horn, cape, etc.) moved to buildHardBanNegative()
    // which is appended AFTER sanitizeNegatives(). The sanitizer was incorrectly
    // stripping "hat" because the positive prompt contains "no hat".
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
 */
export function buildInpaintCharacterNegative(): string {
  return [
    buildQualityOnlyNegative(),
    buildFramingNegative(),
    buildCharacterSafetyNegative(),
    buildNoTextNegative(),
  ].join(", ");
}

/**
 * HARD-BAN negatives — appended AFTER sanitizeNegatives() so they can
 * NEVER be stripped. The sanitizer incorrectly removes these because
 * the positive prompt contains "no hat" / "not unicorn horn" / "no text"
 * which includes the banned term as a substring.
 *
 * Without this, "hat" in the negative gets removed because
 * combined.includes("hat") matches "no hat" in the positive.
 */
export function buildHardBanNegative(): string {
  return [
    // Accessories — "hat" stripped by sanitizer because positive says "no hat"
    "hat", "party hat", "top hat", "birthday hat",
    "crown", "cape", "costume",
    // Horn drift — "unicorn horn" stripped because positive says "not unicorn horn"
    "unicorn horn", "extra horn", "long horn", "spikes",
    // Crop — always enforced
    "cropped", "cut off", "out of frame", "close-up",
    "zoomed in", "headshot", "portrait",
    "partial body", "missing legs", "missing feet",
    // Text — "text" stripped because positive says "no text"
    "text", "watermark",
  ].join(", ");
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
  return [
    buildQualityOnlyNegative(),
    buildNoTextNegative(),
    mainSpecies,           // Block main character species from plate
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
