// Mask generation — Riri zone (center-bottom foreground)
export {
  makeRiriZoneMaskDataUrl,
  makeRiriZoneLargeMaskDataUrl,
  makeRiriZoneRectMaskDataUrl,
} from "./maskGenerator";

// Image generation — separate plate + inpaint functions
export {
  generatePlate,
  generateInpaintCharacter,
  SDXL_VERSION,
} from "./imageGeneration";

// Negative prompt utilities
export {
  buildQualityOnlyNegative,
  buildCharacterSafetyNegative,
  buildNoTextNegative,
  buildInpaintCharacterNegative,
  buildPlateNegative,
  sanitizeNegatives,
} from "./negativePrompts";

// Scene / setting resolution (preserves original text, never canonicalizes)
export {
  resolveSceneSetting,
  enforceMustInclude,
} from "./sceneSettings";
export type { SceneSetting } from "./sceneSettings";

// Candidate scoring / auto-validation
export {
  scoreCaption,
  captionImage,
  scoreCandidate,
  generateAndSelectBest,
  SCORE_THRESHOLD,
} from "./candidateScoring";
export type { CandidateResult } from "./candidateScoring";

// High-level pipeline — plate → inpaint hero → validate → retry
export {
  generateStoryPageImage,
  generateScenePlateOnly,
  buildCharacterFirstPrompt,
  buildPlatePrompt,
} from "./pipeline";
