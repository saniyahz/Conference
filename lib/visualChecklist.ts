import { NormalizedScene } from "./visual-types";

/**
 * Validate a normalized scene before image generation.
 * If validation fails, do NOT generate the image.
 */
export function validateScene(scene: NormalizedScene): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Camera validation
  if (!scene.camera) {
    errors.push("Missing camera framing");
  }
  if (scene.camera === "medium" && (scene.supportingElements || []).length > 2) {
    errors.push("Medium shot cannot fit many supporting elements - use wide");
  }

  // Main character validation
  if (!scene.mainCharacter) {
    errors.push("Missing main character");
  }
  if (scene.mainCharacter && !scene.mainCharacter.id) {
    errors.push("Missing main character ID");
  }
  if (scene.mainCharacter && !scene.mainCharacter.position) {
    errors.push("Missing main character position");
  }
  if (scene.mainCharacter && !scene.mainCharacter.visibility) {
    errors.push("Missing main character visibility");
  }
  if (scene.mainCharacter && !scene.mainCharacter.action) {
    errors.push("Missing main character action");
  }

  // Supporting elements validation
  for (const el of (scene.supportingElements || [])) {
    if (el.count < 1) {
      errors.push(`Invalid count for ${el.type}: ${el.count}`);
    }
    if (!el.position) {
      errors.push(`Missing position for ${el.type}`);
    }
  }

  // Environment validation
  if (!scene.environment?.setting) {
    errors.push("Missing environment setting");
  }

  // Exclusions validation - must have certain safety exclusions
  if (!(scene.exclusions || []).includes("no portraits")) {
    errors.push("Portrait exclusion missing - required");
  }
  if (!(scene.exclusions || []).includes("no text")) {
    errors.push("Text exclusion missing - required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Strict validation - throws if invalid
 */
export function validateSceneStrict(scene: NormalizedScene): void {
  const result = validateScene(scene);
  if (!result.valid) {
    throw new Error(`Scene validation failed: ${result.errors.join(", ")}`);
  }
}
