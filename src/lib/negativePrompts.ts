/**
 * Build quality-only negative prompt.
 * Focused on avoiding common SDXL artifacts without conflicting
 * with the positive prompt content.
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
    "watermark",
    "text",
    "signature",
    "cropped",
    "worst quality",
    "jpeg artifacts",
    "duplicate",
    "morbid",
    "out of frame",
  ].join(", ");
}

/**
 * Character-safety negatives: prevent unwanted humans or
 * wrong characters from appearing when generating Riri.
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
  ].join(", ");
}

/**
 * Sanitize the negative prompt so it doesn't contradict what the
 * positive prompt or scene context explicitly requires.
 *
 * For example, if the prompt says "forest" we shouldn't also negate "trees".
 * If mustInclude contains "rhinoceros" we shouldn't negate "animal".
 *
 * This prevents the negative prompt from fighting the generation.
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
    // Don't negate something explicitly required
    if (combined.includes(lower)) return false;

    // Special cross-checks: don't negate broad categories that
    // conflict with required content
    if (lower === "animal" && combined.includes("rhinoceros")) return false;
    if (lower === "creature" && combined.includes("rhinoceros")) return false;
    if (lower === "nature" && /forest|tree|jungle|garden/.test(combined)) return false;
    if (lower === "water" && /stream|waterfall|river|ocean|lake/.test(combined)) return false;

    return true;
  });

  return filtered.join(", ");
}
