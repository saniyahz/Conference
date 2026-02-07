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

// Candidate scoring — gated rejection (wrong animal = instant fail)
export {
  scoreCaption,
  captionImage,
  scoreCandidate,
  generateAndSelectBest,
  SCORE_THRESHOLD,
} from "./candidateScoring";
export type { CandidateResult } from "./candidateScoring";

// Pipeline — plate → inpaint → validate → escalate
export {
  generateStoryPageImage,
  generateScenePlateOnly,
  buildCharacterFirstPrompt,
  buildPlatePrompt,
} from "./pipeline";
