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

// Candidate scoring — deterministic accept gate + multi-signal ranking
export {
  acceptCandidate,
  scoreCaption,
  captionImage,
  scoreCandidate,
  generateAndSelectBest,
  SCORE_THRESHOLD,
} from "./candidateScoring";
export type { CandidateResult, ScoreOptions } from "./candidateScoring";

// CLIP similarity scoring — compare candidate to Riri anchor
export {
  getClipEmbedding,
  cosineSimilarity,
  scoreClipSimilarity,
  cacheAnchorEmbedding,
  scoreClipWithCachedAnchor,
} from "./clipScoring";
export type { ClipResult } from "./clipScoring";

// Object detection — GroundingDINO / OWL-ViT for rhinoceros
export {
  detectWithGroundingDino,
  detectWithOwlVit,
  detectRhinoceros,
} from "./objectDetection";
export type { Detection, DetectionResult, DetectorModel } from "./objectDetection";

// LoRA training — consistent Riri character across pages
export {
  trainRiriLora,
  getTrainingStatus,
  waitForTraining,
  prependTriggerWord,
} from "./loraTraining";
export type { LoraTrainingConfig, LoraTrainingResult, LoraConfig } from "./loraTraining";

// Pipeline — plate → inpaint → validate → escalate
export {
  generateStoryPageImage,
  generateScenePlateOnly,
  buildCharacterFirstPrompt,
  buildPlatePrompt,
} from "./pipeline";
