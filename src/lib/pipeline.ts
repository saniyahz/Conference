import Replicate from "replicate";
import { makeCenterEllipseMaskDataUrl } from "./maskGenerator";
import { generateImageWithAnchor } from "./imageGeneration";
import { resolveSceneSetting, enforceMustInclude } from "./sceneSettings";

/**
 * Base "must include" items for every Riri image.
 * These are never removed by noun-gating or negative sanitization.
 */
const RIRI_BASE_MUST_INCLUDE = ["rhinoceros", "Riri"];

/**
 * Build an inpaint-optimized prompt for Riri.
 *
 * KEY INSIGHT: When inpainting, the prompt should be CHARACTER-focused,
 * not scene-focused. The scene is already baked into the plate image.
 * Re-listing background items fights the inpaint mask.
 *
 * Good:  "Riri the cute gray rhinoceros, full body, centered..."
 * Bad:   "Riri in a forest with waterfalls and dolphins..."
 */
export function buildRiriInpaintPrompt(
  settingContext: string,
  extraCharacterDetails: string = ""
): string {
  const parts = [
    "Riri the cute gray rhinoceros",
    "full body",
    "centered in foreground",
    "standing on ground",
    "matching the scene perspective and lighting",
    "same art style as background",
    "children's storybook illustration",
    "friendly expression",
    "soft shading",
  ];

  if (extraCharacterDetails) {
    parts.push(extraCharacterDetails);
  }

  // Minimal scene reference so style stays coherent
  if (settingContext) {
    parts.push(`scene: ${settingContext}`);
  }

  return parts.join(", ");
}

/**
 * Full pipeline for generating a story page image:
 *
 *  Step 1: Generate (or receive) a scene "plate" — background only, no character.
 *  Step 2: Use masked inpaint to paint Riri into the center of the plate.
 *
 * This two-step approach guarantees:
 *  - Riri always appears (mask forces content in the center)
 *  - Background stays stable (mask protects it)
 *  - No random humans replace Riri
 *  - Scene matches the story text
 */
export async function generateStoryPageImage(opts: {
  replicate: Replicate;
  pageText: string;
  plateImageUrl: string;
  pageSeed: number;
  pageIndex: number;
  sceneCardFallback?: string;
  extraCharacterDetails?: string;
  maskSize?: number;
  maskEllipseW?: number;
  maskEllipseH?: number;
}): Promise<string> {
  const {
    replicate,
    pageText,
    plateImageUrl,
    pageSeed,
    pageIndex,
    sceneCardFallback,
    extraCharacterDetails,
    maskSize = 1024,
    maskEllipseW = 760,
    maskEllipseH = 760,
  } = opts;

  // --- 1. Resolve scene setting from the page text ---
  const scene = resolveSceneSetting(
    pageText,
    RIRI_BASE_MUST_INCLUDE,
    sceneCardFallback
  );

  // Ensure mustInclude items are never dropped
  const mustInclude = enforceMustInclude(scene.mustInclude, RIRI_BASE_MUST_INCLUDE);

  console.log(`[Page ${pageIndex}] Setting: "${scene.setting}"`);
  console.log(`[Page ${pageIndex}] Must include: ${mustInclude.join(", ")}`);

  // --- 2. Generate the inpaint mask ---
  const mask = await makeCenterEllipseMaskDataUrl(maskSize, maskEllipseW, maskEllipseH);

  // --- 3. Build character-focused inpaint prompt ---
  const prompt = buildRiriInpaintPrompt(scene.settingContext, extraCharacterDetails);

  console.log(`[Page ${pageIndex}] Inpaint prompt: "${prompt}"`);

  // --- 4. Run SDXL inpaint: plate + mask → Riri in scene ---
  const imageUrl = await generateImageWithAnchor(
    replicate,
    prompt,
    plateImageUrl,
    pageSeed,
    pageIndex,
    0.85,           // promptStrength (used only if mask is absent; mask overrides to 0.65)
    scene.settingContext,
    mustInclude,
    mask            // <-- forces character into the center zone
  );

  if (!imageUrl) {
    console.error(`[Page ${pageIndex}] Failed to generate image after all retries`);
  }

  return imageUrl;
}

/**
 * Convenience: generate a scene plate (background only, no character).
 * This is a standard img2img call WITHOUT a mask.
 */
export async function generateScenePlate(opts: {
  replicate: Replicate;
  scenePrompt: string;
  baseImageUrl: string;
  seed: number;
  pageIndex: number;
  promptStrength?: number;
}): Promise<string> {
  const {
    replicate,
    scenePrompt,
    baseImageUrl,
    seed,
    pageIndex,
    promptStrength = 0.80,
  } = opts;

  return generateImageWithAnchor(
    replicate,
    scenePrompt,
    baseImageUrl,
    seed,
    pageIndex,
    promptStrength,
    "",   // no setting context needed for plate
    [],   // no mustInclude for background plate
    // no mask — pure img2img
  );
}
