import { NormalizedScene, CharacterCanon } from "./visual-types";

/**
 * Assemble the final image prompt from normalized scene + character canon.
 * CRITICAL: Keep it SHORT. SDXL only pays attention to first ~77 tokens.
 * Put ENVIRONMENT FIRST, then character, then style.
 */
export function assembleImagePrompt(
  scene: NormalizedScene,
  canon: CharacterCanon
): string {
  // DEBUG: Log the full scene for debugging
  console.log(`[assembleImagePrompt] Scene type: ${scene.sceneType}`);
  console.log(`[assembleImagePrompt] Environment: ${scene.environment.setting}`);
  console.log(`[assembleImagePrompt] Exclusions: ${scene.exclusions?.join(', ')}`);

  // ENVIRONMENT FIRST - this is what SDXL will pay most attention to
  const envDesc = getShortEnvironment(scene.environment.setting);

  // SHORT character description
  const charDesc = getShortCharacter(canon);

  // Key elements (max 2)
  const elementsStr = scene.supportingElements.length > 0
    ? scene.supportingElements.slice(0, 2).map(e => e.type).join(', ')
    : '';

  // Build SIMPLE, SHORT prompt - under 75 words
  // Format: Environment + Character + Elements + Style
  const prompt = elementsStr
    ? `${envDesc} ${charDesc} With ${elementsStr}. Children's book illustration, watercolor style.`
    : `${envDesc} ${charDesc} Children's book illustration, watercolor style.`;

  console.log(`[FINAL PROMPT] ${prompt}`);
  return prompt;
}

function getShortEnvironment(setting: string): string {
  switch (setting) {
    case 'outer space':
      return 'Outer space scene with dark starry sky and planets.';
    case 'moon surface':
      return 'Moon surface scene with gray craters and Earth visible.';
    case 'underwater ocean':
      return 'Underwater ocean scene with blue water and coral.';
    case 'sky':
      return 'Sky scene with fluffy white clouds.';
    case 'indoor':
      return 'Cozy indoor room scene.';
    case 'cave':
      return 'Mysterious cave scene with glowing light.';
    case 'forest meadow':
      return 'Forest meadow with green trees and flowers.';
    default:
      return 'Magical storybook scene.';
  }
}

function getShortCharacter(canon: CharacterCanon): string {
  // Extract just the key visual features - under 20 words
  const lines = canon.description.split('\n').filter(l => l.trim());
  const skinLine = lines.find(l => l.toLowerCase().includes('skin'));
  const hairLine = lines.find(l => l.toLowerCase().includes('hair'));
  const clothingLine = lines.find(l => l.toLowerCase().includes('clothing'));

  const skin = skinLine ? skinLine.split(':')[1]?.trim() || 'warm brown skin' : 'warm brown skin';
  const hair = hairLine ? hairLine.split(':')[1]?.trim() || 'curly hair' : 'curly hair';
  const clothing = clothingLine ? clothingLine.split(':')[1]?.trim() || 'colorful clothes' : 'colorful clothes';

  return `Young child with ${skin}, ${hair}, wearing ${clothing}.`;
}

/**
 * Build the negative prompt based on scene exclusions and environment
 */
export function assembleNegativePrompt(scene: NormalizedScene): string {
  const base = "portrait, close-up, photorealistic, 3d, anime, text, logo, watermark";

  // Use scene-specific exclusions if available
  if (scene.exclusions && scene.exclusions.length > 0) {
    // Convert exclusions like "no water" to "water"
    const exclusionTerms = scene.exclusions
      .map(e => e.replace(/^no\s+/i, '').trim())
      .filter(e => e.length > 0)
      .join(', ');
    const negPrompt = `${base}, ${exclusionTerms}`;
    console.log(`[NEGATIVE PROMPT] ${negPrompt}`);
    return negPrompt;
  }

  // Fallback to environment-specific exclusions
  let envExclusions = '';
  switch (scene.environment.setting) {
    case "outer space":
    case "moon surface":
      envExclusions = "forest, trees, grass, water, ocean, fish, coral, underwater, animals, houses";
      break;
    case "underwater ocean":
      envExclusions = "forest, trees, grass, sky, land, houses, space, stars";
      break;
    case "sky":
      envExclusions = "ground, underwater, space, indoor, ocean";
      break;
    case "indoor":
      envExclusions = "forest, wilderness, ocean, space, underwater";
      break;
    case "forest meadow":
      envExclusions = "space, underwater, ocean, fish, coral, buildings, stars, planets";
      break;
    default:
      envExclusions = "underwater, fish, coral";
  }

  const negPrompt = `${base}, ${envExclusions}`;
  console.log(`[NEGATIVE PROMPT] ${negPrompt}`);
  return negPrompt;
}
