import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * RENDER PROMPT - ULTRA SHORT FORMAT
 * SDXL pays most attention to early tokens
 *
 * Format:
 * {{scene}}. Must show: {{required1}}, {{required2}}.
 * {{character_short}}. soft watercolor children's book illustration.
 *
 * Target: 25-40 words total
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard): string {
  // 1. SCENE - What environment
  const scene = buildShortScene(card);

  // 2. MUST SHOW - Required objects/elements (max 3)
  const mustShow = buildMustShow(card);

  // 3. CHARACTER - Name, age, appearance, action
  const character = buildShortCharacter(bible, card.main_action);

  // 4. STYLE - Always the same
  const style = "Soft watercolor children's book illustration.";

  // Combine into ultra-short prompt
  const prompt = `${scene}${mustShow} ${character} ${style}`.trim();

  console.log(`[PROMPT] Page ${card.page_number} (${prompt.split(' ').length} words): ${prompt}`);
  return prompt;
}

/**
 * Build SHORT scene description
 */
function buildShortScene(card: PageSceneCard): string {
  const setting = card.setting.toLowerCase();

  // SPACE - inside ship
  if (setting.includes('inside rocket') || setting.includes('cockpit')) {
    return 'Inside a rocket cockpit in outer space, stars visible through window.';
  }

  // SPACE - flying
  if (setting.includes('outer space') || setting.includes('cosmos') || setting.includes('stars')) {
    return 'Outer space scene, dark starry sky, colorful planets visible.';
  }

  // MARS
  if (setting.includes('mars')) {
    return 'Mars surface, red rocky terrain, pink-orange sky.';
  }

  // MOON
  if (setting.includes('moon')) {
    return 'Moon surface, gray craters, Earth visible in black sky.';
  }

  // UNDERWATER
  if (setting.includes('underwater') || setting.includes('ocean') || setting.includes('coral')) {
    return 'Underwater ocean scene, blue water, coral reef, fish swimming.';
  }

  // FOREST
  if (setting.includes('forest') || setting.includes('trees')) {
    return 'Lush green forest, tall trees, soft sunlight filtering through.';
  }

  // MEADOW
  if (setting.includes('meadow') || setting.includes('garden') || setting.includes('flower')) {
    return 'Beautiful meadow with colorful wildflowers, sunny day.';
  }

  // DESERT
  if (setting.includes('desert') || setting.includes('sand')) {
    return 'Golden desert, rolling sand dunes, warm orange sky.';
  }

  // HOME/INDOOR
  if (setting.includes('home') || setting.includes('room') || setting.includes('house')) {
    return 'Cozy indoor room, warm lighting.';
  }

  // SKY
  if (setting.includes('sky') || setting.includes('cloud')) {
    return 'High in the sky, fluffy white clouds, blue sky.';
  }

  // VILLAGE
  if (setting.includes('village') || setting.includes('town')) {
    return 'Peaceful village, cozy cottages.';
  }

  // Default
  return 'Magical storybook scene.';
}

/**
 * Build "Must show:" clause from key objects and supporting characters
 * Max 3 items to keep it short
 */
function buildMustShow(card: PageSceneCard): string {
  const items: string[] = [];

  // Add key objects (most important)
  for (const obj of card.key_objects.slice(0, 2)) {
    items.push(obj);
  }

  // Add supporting characters if room
  if (items.length < 3 && card.supporting_characters.length > 0) {
    items.push(card.supporting_characters[0]);
  }

  if (items.length === 0) {
    return '';
  }

  return ` Must show: ${items.join(', ')}.`;
}

/**
 * Build SHORT character description
 * Handles both humans and animals
 */
function buildShortCharacter(bible: CharacterBible, action: string): string {
  const name = bible.name;
  const isAnimal = bible.character_type === 'animal';
  const isCreature = bible.character_type === 'creature';

  // Extract just the action
  let actionShort = action
    .replace(new RegExp(bible.name, 'gi'), '')
    .replace(/^\s*(is\s+)?/, '')
    .trim();

  if (!actionShort || actionShort.length < 3) {
    actionShort = 'looking happy';
  }

  // ANIMAL: "Smiley, a friendly dog with golden fur, wearing astronaut helmet"
  if (isAnimal) {
    const species = bible.species || 'animal';
    const fur = bible.appearance.skin_tone; // For animals, this is fur color
    const outfit = bible.signature_outfit ? `, wearing ${bible.signature_outfit}` : '';
    return `${name}, a cute friendly ${species} with ${fur}${outfit}, ${actionShort}.`;
  }

  // CREATURE: "Sparkle, a magical unicorn with rainbow mane"
  if (isCreature) {
    const appearance = bible.appearance.hair || bible.appearance.skin_tone;
    return `${name}, a magical creature with ${appearance}, ${actionShort}.`;
  }

  // HUMAN: "Ava, 6 years old, brown skin, curly hair"
  const skin = bible.appearance.skin_tone;
  const hair = bible.appearance.hair;
  return `${name}, 6 years old, ${skin}, ${hair}, ${actionShort}.`;
}

/**
 * Render negative prompt
 */
export function renderNegativePrompt(card: PageSceneCard): string {
  const base = "text, watermark, logo, frame, photorealistic, 3d render, anime, ugly, deformed";

  // Add scene-specific forbidden elements
  const setting = card.setting.toLowerCase();

  if (setting.includes('space') || setting.includes('rocket') || setting.includes('mars') || setting.includes('moon')) {
    return `${base}, forest, trees, grass, porch, house, door, land animals`;
  }

  if (setting.includes('underwater') || setting.includes('ocean')) {
    return `${base}, forest, trees, grass, sky, land, buildings, porch, house`;
  }

  if (setting.includes('forest') || setting.includes('meadow')) {
    return `${base}, space, planets, stars, underwater, ocean, fish`;
  }

  if (setting.includes('desert')) {
    return `${base}, water, ocean, fish, forest, snow, space, planets`;
  }

  return base;
}

/**
 * Generate unique seed for a page
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
