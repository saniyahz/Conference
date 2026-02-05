import { NormalizedScene, CharacterCanon } from "./visual-types";

/**
 * GLOBAL CHARACTER LOCK - prepended to EVERY image prompt
 * This ensures the character looks the SAME on every page
 */
function getCharacterLock(canon: CharacterCanon): string {
  // Extract key features from canon
  const lines = canon.description.split('\n').filter(l => l.trim());
  const skinLine = lines.find(l => l.toLowerCase().includes('skin'));
  const hairLine = lines.find(l => l.toLowerCase().includes('hair'));
  const clothingLine = lines.find(l => l.toLowerCase().includes('clothing'));

  const skin = skinLine ? skinLine.split(':')[1]?.trim() || 'warm brown skin' : 'warm brown skin';
  const hair = hairLine ? hairLine.split(':')[1]?.trim() || 'curly black hair' : 'curly black hair';
  const clothing = clothingLine ? clothingLine.split(':')[1]?.trim() || 'colorful clothes' : 'colorful clothes';

  return `MAIN CHARACTER — LOCKED DESIGN:
Name: ${canon.name}
Age: 6 years old
Appearance: ${skin}, big expressive eyes, ${hair}
Body: childlike proportions
Expression: curious, joyful, brave
Art style: cute 2D cartoon, bold clean outlines, flat cel shading, vibrant pastel colors
Lighting: warm, gentle, magical
Consistency rule: ${canon.name} must look the same on every page`;
}

/**
 * Assemble the final image prompt using GOLD-STANDARD format
 */
export function assembleImagePrompt(
  scene: NormalizedScene,
  canon: CharacterCanon
): string {
  console.log(`[assembleImagePrompt] Scene type: ${scene.sceneType}`);
  console.log(`[assembleImagePrompt] Environment: ${scene.environment.setting}`);

  // Get the character lock (SAME for every page)
  const characterLock = getCharacterLock(canon);

  // Get scene-specific prompt
  const scenePrompt = buildScenePrompt(scene, canon);

  // Get required elements
  const requiredElements = scene.supportingElements.length > 0
    ? `\nElements that MUST be visible:\n${scene.supportingElements.map(e => `- ${e.type}`).join('\n')}`
    : '';

  // Get forbidden elements
  const forbiddenElements = scene.exclusions && scene.exclusions.length > 0
    ? `\nIMPORTANT:\n${scene.exclusions.map(e => `- ${e}`).join('\n')}`
    : '';

  const fullPrompt = `Illustration for a children's storybook.

${characterLock}

${scenePrompt}
${requiredElements}

Style: cute 2D cartoon children's illustration, bold clean outlines, flat cel shading, vibrant pastel colors.
${forbiddenElements}`;

  console.log(`[FINAL PROMPT] ${fullPrompt.substring(0, 500)}...`);
  return fullPrompt;
}

/**
 * Build scene-specific prompt based on environment
 */
function buildScenePrompt(scene: NormalizedScene, canon: CharacterCanon): string {
  const setting = scene.environment.setting;
  const elements = scene.environment.elements.join(', ');

  switch (setting) {
    case 'forest meadow':
    case 'forest':
    case 'village':
      return `Scene: ${getSceneDescription(scene)}

Main character: ${canon.name} (use locked design), ${scene.mainCharacter.action}.

Details:
- ${elements}
- Outdoor natural environment
- Warm sunlight, friendly atmosphere`;

    case 'outer space':
      return `Scene: ${getSceneDescription(scene)}

Main character: ${canon.name} (use locked design), wearing a simple child-friendly space suit.

Details:
- ${elements}
- Starry sky background
- Whimsical, friendly sci-fi tone`;

    case 'desert':
      return `Scene: A golden desert with rolling sand dunes under a bright sky.

Main character: ${canon.name} (use locked design), ${scene.mainCharacter.action}.

Details:
- ${elements}
- Warm sunlight, desert atmosphere`;

    case 'underwater ocean':
      return `Scene: Underwater ocean world with coral reefs and blue water.

Main character: ${canon.name} (use locked design), safely swimming underwater.

Details:
- ${elements}
- Coral, bubbles, sunlight rays
- Joyful, non-scary ocean mood`;

    default:
      return `Scene: ${getSceneDescription(scene)}

Main character: ${canon.name} (use locked design), ${scene.mainCharacter.action}.

Details:
- ${elements}
- Magical, friendly atmosphere`;
  }
}

function getSceneDescription(scene: NormalizedScene): string {
  switch (scene.sceneType) {
    case 'forest':
      return 'A lush green forest filled with trees, flowers, and soft sunlight.';
    case 'village':
      return 'A peaceful village surrounded by rolling green hills.';
    case 'desert':
      return 'A golden desert with rolling sand dunes.';
    case 'outer space':
      return 'Outer space with stars and planets visible.';
    case 'underwater':
      return 'Underwater ocean world with coral reefs.';
    default:
      return 'A magical storybook scene.';
  }
}

/**
 * Build the negative prompt based on scene exclusions
 */
export function assembleNegativePrompt(scene: NormalizedScene): string {
  const base = "portrait, close-up, photorealistic, realistic, lifelike, hyperreal, 3D render, CGI, Pixar, Disney 3D, cinematic lighting, skin pores, ultra-detailed texture, DSLR, film still, anime, text, logo, watermark, signature";

  // Environment-specific exclusions
  let envExclusions = '';
  switch (scene.environment.setting) {
    case "outer space":
      envExclusions = "forest, trees, grass, water, ocean, fish, animals, houses, buildings";
      break;
    case "underwater ocean":
      envExclusions = "forest, trees, grass, sky, land, houses, space, stars, desert";
      break;
    case "desert":
      envExclusions = "water, ocean, fish, forest, space, stars, planets, snow";
      break;
    case "forest meadow":
    case "forest":
    case "village":
      envExclusions = "space, planets, stars, underwater, ocean, fish, coral, desert";
      break;
    default:
      envExclusions = "underwater, fish, coral";
  }

  const negPrompt = `${base}, ${envExclusions}`;
  console.log(`[NEGATIVE PROMPT] ${negPrompt}`);
  return negPrompt;
}
