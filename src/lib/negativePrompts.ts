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
  ].join(", ");
}

/**
 * Character-safety negatives — prevent unwanted humans and duplicates.
 * These go on the CHARACTER INPAINT pass (not the plate pass).
 */
export function buildCharacterSafetyNegative(): string {
  return [
    "human",
    "boy",
    "girl",
    "person",
    "child",
    "man",
    "woman",
    "people",
    "realistic human",
    "photo of person",
    "two rhinoceroses",
    "multiple rhinos",
    "extra rhinoceros",
    "duplicate rhino",
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
 * Full negative for plate/background pass.
 * No character safety needed — plate has no characters.
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

  const filtered = negTerms.filter((term) => {
    const lower = term.toLowerCase();
    if (combined.includes(lower)) return false;
    if (lower === "animal" && combined.includes("rhinoceros")) return false;
    if (lower === "creature" && combined.includes("rhinoceros")) return false;
    if (lower === "nature" && /forest|tree|jungle|garden/.test(combined)) return false;
    if (lower === "water" && /stream|waterfall|river|ocean|lake/.test(combined)) return false;
    return true;
  });

  return filtered.join(", ");
}
