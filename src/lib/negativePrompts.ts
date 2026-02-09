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
    "out of frame",
    "cropped",
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
 * Character-safety negatives — prevent unwanted humans, wrong animals,
 * and duplicate rhinos. These go on the CHARACTER INPAINT pass.
 *
 * The wrong-animal list is critical: without it, SDXL frequently
 * substitutes elephant/cat/bear/lion inside the mask region instead
 * of the prompted rhinoceros.
 */
export function buildCharacterSafetyNegative(): string {
  return [
    // Block humans (including space-themed human appearances)
    "human", "boy", "girl", "person", "child", "man", "woman",
    "people", "realistic human", "photo of person",
    "astronaut", "spacesuit", "space suit", "helmet", "pilot",
    "cosmonaut", "crew member", "space explorer",
    // Block wrong animals (common SDXL substitutions)
    "elephant", "cat", "dog", "bear", "lion", "tiger", "rabbit",
    "monkey", "horse", "cow", "giraffe", "zebra", "hippo",
    "hippopotamus", "camel", "deer", "wolf", "fox", "pig",
    "dolphin", "whale", "bird", "penguin", "frog", "turtle",
    // Block duplicate rhinos
    "two rhinoceroses", "multiple rhinos", "extra rhinoceros",
    "duplicate rhino",
    // Identity-stabilizing: prevent accessories that drift across pages
    "hat", "helmet", "saddle", "backpack", "armor", "crown",
    "glasses", "sunglasses", "cape", "wings",
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
    buildCharacterSafetyNegative(),
    buildNoTextNegative(),
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
