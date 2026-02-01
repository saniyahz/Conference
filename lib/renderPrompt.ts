import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * RENDER PROMPT - SCENE FIRST, KEEP SHORT
 * SDXL only pays attention to first ~77 tokens
 * Format: [SCENE] [CHARACTER] [STYLE]
 * Target: Under 75 words total
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard): string {
  // 1. SCENE FIRST - This is what SDXL will pay most attention to
  const scene = buildShortScene(card);

  // 2. CHARACTER - Brief description only
  const character = buildShortCharacter(bible, card.main_action);

  // 3. KEY OBJECTS - Only if present
  const objects = card.key_objects.length > 0
    ? `With ${card.key_objects.slice(0, 2).join(' and ')}.`
    : '';

  // 4. STYLE - Always the same
  const style = "Children's book illustration, soft watercolor, gentle colors.";

  // Combine: SCENE + CHARACTER + OBJECTS + STYLE
  const prompt = `${scene} ${character} ${objects} ${style}`.trim();

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt}`);
  return prompt;
}

/**
 * Build SHORT scene description - ENVIRONMENT IS KEY
 * This goes FIRST in the prompt
 */
function buildShortScene(card: PageSceneCard): string {
  const setting = card.setting.toLowerCase();

  // SPACE scenes
  if (setting.includes('outer space') || setting.includes('cosmos') || setting.includes('stars')) {
    return 'Outer space scene, dark starry sky, colorful planets and twinkling stars visible.';
  }
  if (setting.includes('rocket') || setting.includes('spaceship')) {
    if (setting.includes('inside') || card.main_action.includes('floating') || card.main_action.includes('seat')) {
      return 'Inside a rocket ship cockpit in space, stars visible through window.';
    }
    return 'Rocket ship flying through outer space, stars and planets in background.';
  }
  if (setting.includes('moon')) {
    return 'Moon surface with gray craters, Earth visible in dark starry sky.';
  }
  if (setting.includes('mars') || setting.includes('red planet')) {
    return 'Mars surface, red rocky terrain, pink sky, distant mountains.';
  }

  // UNDERWATER scenes
  if (setting.includes('underwater') || setting.includes('ocean') || setting.includes('coral')) {
    return 'Underwater ocean scene, blue water, colorful coral reef, fish swimming, light rays from above.';
  }

  // NATURE scenes
  if (setting.includes('forest') || setting.includes('trees')) {
    return 'Lush green forest scene, tall trees, soft sunlight filtering through leaves, flowers.';
  }
  if (setting.includes('meadow') || setting.includes('garden') || setting.includes('flower')) {
    return 'Beautiful meadow with colorful wildflowers, green grass, sunny day.';
  }
  if (setting.includes('desert') || setting.includes('sand')) {
    return 'Golden desert scene, rolling sand dunes, warm orange sky.';
  }

  // INDOOR scenes
  if (setting.includes('home') || setting.includes('room') || setting.includes('house') || setting.includes('indoor')) {
    return 'Cozy indoor room scene, warm lighting, comfortable furniture.';
  }

  // SKY scenes
  if (setting.includes('sky') || setting.includes('cloud') || setting.includes('flying')) {
    return 'High in the sky among fluffy white clouds, blue sky, aerial view.';
  }

  // VILLAGE/TOWN
  if (setting.includes('village') || setting.includes('town')) {
    return 'Peaceful village scene, cozy cottages, friendly atmosphere.';
  }

  // Default
  return 'Magical storybook scene, warm friendly atmosphere.';
}

/**
 * Build SHORT character description
 * Just the essentials - skin, hair, action
 */
function buildShortCharacter(bible: CharacterBible, action: string): string {
  const skin = bible.appearance.skin_tone;
  const hair = bible.appearance.hair;

  // Extract just the action verb
  const actionShort = action
    .replace(bible.name, '')
    .replace(/^\s*(is\s+)?/, '')
    .trim() || 'looking happy';

  return `Young child with ${skin}, ${hair}, ${actionShort}.`;
}

/**
 * Render negative prompt - include environment exclusions
 */
export function renderNegativePrompt(card: PageSceneCard): string {
  const base = "photorealistic, 3d render, anime, text, logo, watermark, ugly, deformed";

  // Add forbidden elements
  if (card.forbidden_elements.length > 0) {
    const forbidden = card.forbidden_elements.slice(0, 5).join(", ");
    return `${base}, ${forbidden}`;
  }

  return base;
}

/**
 * Generate unique seed for a page
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
