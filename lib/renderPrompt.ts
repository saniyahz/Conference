import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * UNIVERSAL PROMPT RENDERER
 * Takes character_bible + page_scene_card and produces final_prompt
 * This is the SAME template for every page - only the scene card changes
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard): string {
  // Format personality as comma-separated string
  const personality = bible.personality.join(", ");

  // Format supporting characters
  const supportingCharacters = card.supporting_characters.length > 0
    ? card.supporting_characters.join(", ")
    : "none";

  // Format key objects
  const keyObjects = card.key_objects.length > 0
    ? card.key_objects.join(", ")
    : "none";

  // Format required elements as bullet points
  const requiredList = card.required_elements.length > 0
    ? card.required_elements.map(e => `• ${e}`).join("\n")
    : "• Main character clearly visible";

  // Format forbidden elements
  const forbiddenList = card.forbidden_elements.length > 0
    ? card.forbidden_elements.join(", ")
    : "none";

  // Build the universal prompt template
  const prompt = `CHILDREN'S BOOK ILLUSTRATION (one image for Page ${card.page_number})

MAIN CHARACTER — LOCKED (must stay identical across all pages):
Name: ${bible.name}, Age: ${bible.age}
Appearance: ${bible.appearance.skin_tone}, ${bible.appearance.eyes}, ${bible.appearance.hair}, ${bible.appearance.face_features}
Signature outfit: ${bible.signature_outfit}
Personality: ${personality}
Art style: ${bible.art_style.medium}, ${bible.art_style.genre}, mood ${bible.art_style.mood}

SCENE (must match the story text exactly):
Setting: ${card.setting}
Time/Weather: ${card.time_weather}
Main action: ${card.main_action}
Supporting characters: ${supportingCharacters}
Key objects: ${keyObjects}

CAMERA / COMPOSITION:
Shot type: ${card.camera.shot_type}
Notes: ${card.camera.composition_notes}
Make the main character clearly visible and centered in the scene.
All required elements must be clearly visible.

REQUIRED ELEMENTS (must appear):
${requiredList}

HARD RULES:
- Create a NEW illustration for this page. Do NOT reuse prior compositions.
- Background MUST match the setting.
- Supporting characters and key objects MUST appear if listed.
- Do NOT include any forbidden elements.

FORBIDDEN / NEGATIVE ELEMENTS:
${forbiddenList}`;

  return prompt;
}

/**
 * Render negative prompt from scene card
 */
export function renderNegativePrompt(card: PageSceneCard): string {
  const base = "photorealistic, realistic, 3d render, anime, text, logo, watermark, signature, ugly, deformed, blurry, extra characters";

  if (card.forbidden_elements.length > 0) {
    return `${base}, ${card.forbidden_elements.join(", ")}`;
  }

  return base;
}

/**
 * Generate unique seed for a page based on scene_id
 * Rule B: Unique seed per page
 */
export function generatePageSeed(sceneId: string, baseSeed: number): number {
  // Simple hash of scene_id
  let hash = 0;
  for (let i = 0; i < sceneId.length; i++) {
    const char = sceneId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Combine with base seed
  return Math.abs(baseSeed + hash) % 1000000;
}

/**
 * Alternative seed strategy: page-based
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
