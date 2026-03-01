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

// Scene / setting resolution (taxonomy-clamped, no free-form mashups)
export {
  resolveSceneSetting,
  enforceMustInclude,
  classifyScene,
} from "./sceneSettings";
export type { SceneSetting } from "./sceneSettings";

// Candidate scoring — deterministic accept gate + multi-signal ranking
export {
  acceptCandidate,
  scoreCaption,
  captionImage,
  scoreCandidate,
  generateAndSelectBest,
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

// Pipeline — plate → inpaint → validate → escalate (LEGACY — kept for backward compat)
export {
  generateStoryPageImage,
  generateScenePlateOnly,
  buildCharacterFirstPrompt,
  buildPlatePrompt,
} from "./pipeline";

// Flux Kontext Pro — NEW character-consistent image generation
export {
  generateKontextImage,
  generateKontextReference,
  getCharacterRefUrl,
  KONTEXT_MODEL,
} from "./kontextGeneration";
export type { KontextGenerateOptions } from "./kontextGeneration";
