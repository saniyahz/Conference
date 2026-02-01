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

  console.log(`[PROMPT] ${prompt.substring(0, 200)}`);
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

  // Add environment-specific exclusions
  switch (scene.environment.setting) {
    case "outer space":
    case "moon surface":
      return `${base}, forest, trees, grass, water, ocean, animals, houses`;
    case "underwater ocean":
      return `${base}, forest, trees, grass, sky, land, houses`;
    case "sky":
      return `${base}, ground, underwater, space, indoor`;
    case "indoor":
      return `${base}, forest, wilderness, ocean, space`;
    case "forest meadow":
      return `${base}, space, underwater, ocean, buildings`;
    default:
      return base;
  }
}
