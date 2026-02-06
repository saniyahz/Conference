import { UniversalCharacterBible } from './generateCharacterBible';
import { UniversalSceneCard } from './generateSceneCard';

/**
 * Environment-specific words that are PHYSICALLY IMPOSSIBLE in other environments.
 * Only ban biome/location words — NEVER ban movable objects (rocket, spaceship).
 */
const ENV_CONFLICT_MAP: Record<string, string[]> = {
  ocean:      ['forest', 'trees', 'woods', 'jungle', 'crater', 'desert', 'sand', 'mountain', 'cave', 'savann', 'grass', 'meadow'],
  underwater: ['forest', 'trees', 'woods', 'jungle', 'crater', 'desert', 'sand', 'mountain', 'cave', 'clouds', 'savann', 'meadow'],
  moon:       ['forest', 'trees', 'woods', 'jungle', 'ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'desert', 'sand', 'clouds', 'river', 'meadow', 'flower', 'grass'],
  space:      ['forest', 'trees', 'woods', 'jungle', 'ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'desert', 'sand', 'river', 'meadow', 'flower', 'grass'],
  rocket:     ['dolphin', 'fish', 'coral', 'desert', 'cave', 'meadow'],
  forest:     ['ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'crater', 'desert', 'sand'],
  savann:     ['ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'crater', 'desert', 'sand'],
};

/**
 * Clean must_include list: remove items that contradict the page setting.
 */
export function cleanMustInclude(setting: string, mustInclude: string[]): string[] {
  const lowerSetting = setting.toLowerCase();
  const bannedWords: string[] = [];

  for (const [env, conflicts] of Object.entries(ENV_CONFLICT_MAP)) {
    if (lowerSetting.includes(env)) {
      bannedWords.push(...conflicts);
    }
  }

  const uniqueBanned = Array.from(new Set(bannedWords));
  if (uniqueBanned.length === 0) return mustInclude;

  return mustInclude.filter(item => {
    const lowerItem = item.toLowerCase();
    return !uniqueBanned.some(banned => lowerItem.includes(banned));
  });
}

/**
 * Build scene-only prompt for the scene plate (first pass).
 * No characters — just the background environment with key objects.
 *
 * Key objects (rocket, waterfall, etc.) go FIRST for CLIP attention.
 */
export function buildSceneOnlyPrompt(setting: string, keyObjects: string[] = []): string {
  // Filter out character-related items from key objects
  const sceneObjects = keyObjects
    .filter(obj => {
      const lower = obj.toLowerCase();
      return !lower.includes('full body') &&
             !lower.includes('riri') &&
             !lower.includes('exactly') &&  // "exactly 3 dolphins" is for final pass
             !lower.includes('lunar friend');  // characters for final pass
    })
    .slice(0, 4);

  const objectsClause = sceneObjects.length > 0 ? `${sceneObjects.join(', ')}, ` : '';

  // Detect interior vs exterior for composition
  const lower = setting.toLowerCase();
  let compositionHint = 'wide establishing shot, detailed background';
  if (lower.includes('cockpit') || lower.includes('inside') || lower.includes('interior')) {
    compositionHint = 'interior view, detailed controls, confined space';
  } else if (lower.includes('moon') || lower.includes('crater')) {
    compositionHint = 'lunar landscape, Earth visible in sky';
  } else if (lower.includes('ocean') || lower.includes('splash') || lower.includes('dolphin')) {
    compositionHint = 'ocean scene, waves and bright sky';
  } else if (lower.includes('forest') || lower.includes('waterfall')) {
    compositionHint = 'forest scene, dappled sunlight';
  }

  return `${objectsClause}${setting}. ${compositionHint}. 2D cartoon, bold outlines, vibrant pastels. No characters. No animals. No text.`;
}

/**
 * NEW PROMPT TEMPLATE (recommended structure):
 *
 * 1. ACTION (what's happening - the image is ABOUT this)
 * 2. SETTING (where it's happening)
 * 3. MUST INCLUDE (3-5 concrete visual items)
 * 4. CHARACTER LOCK (visual description + "SAME LOOK every page")
 * 5. STYLE (2D children's book)
 * 6. COMPOSITION (full body, centered, no text)
 *
 * This structure puts the STORY BEAT first (highest CLIP attention),
 * then locks the character appearance, then style/composition last.
 */
export function buildImagePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const name = bible.name;
  const species = bible.species_or_type;
  const isAnimal = !bible.is_human;

  // ========== 1. ACTION (what the image is ABOUT) ==========
  const action = card.action;

  // ========== 2. SETTING ==========
  const setting = card.setting;

  // ========== 3. MUST INCLUDE (3-5 concrete items) ==========
  // Filter out vague/style items, keep only concrete visual objects
  const concreteItems = card.must_include
    .filter(item => {
      const lower = item.toLowerCase();
      return !lower.includes('vibrant') &&
             !lower.includes('lighting') &&
             !lower.includes('background') &&
             !lower.includes('colors') &&
             !lower.includes('full body');  // handled in composition
    })
    .slice(0, 5);

  const mustIncludeClause = concreteItems.length > 0
    ? `Must include: ${concreteItems.join(', ')}.`
    : '';

  // ========== 4. CHARACTER LOCK ==========
  // Build visual description from fingerprint
  const visualTraits = bible.visual_fingerprint.slice(0, 5).join(', ');
  let characterLock: string;

  if (isAnimal) {
    characterLock = `Main character: ${name}, a cute ${visualTraits}. Anthropomorphic cartoon ${species}. SAME LOOK every page.`;
  } else {
    characterLock = `Main character: ${name}, ${visualTraits}. SAME LOOK every page.`;
  }

  // ========== 5. STYLE ==========
  const style = '2D children\'s picture book illustration, bold clean outlines, flat cel shading, vibrant pastel colors.';

  // ========== 6. COMPOSITION ==========
  let composition = `Composition: ${name} full body visible, centered in foreground, clear storytelling, no text.`;

  // Add singularity for animals
  if (isAnimal) {
    composition += ` Only one ${species}, no duplicate animals.`;
  }

  // ========== BUILD FINAL PROMPT ==========
  const prompt = [
    `${action}.`,
    `${setting}.`,
    mustIncludeClause,
    characterLock,
    style,
    composition
  ].filter(line => line.length > 0).join('\n');

  console.log(`[IMAGE PROMPT] Page ${card.page_index}:`);
  console.log(prompt);
  console.log(`[WORD COUNT] ${prompt.split(/\s+/).length} words`);

  return prompt;
}

/**
 * Build negative prompt — simple and stable.
 * Don't add negatives that conflict with must_include.
 */
export function buildNegativePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const neg: string[] = [
    // Quality issues
    'text', 'watermark', 'logo', 'signature', 'photorealistic', '3D', 'CGI', 'blurry', 'low quality',
    // Composition issues
    `extra ${bible.species_or_type}`, 'multiple main characters', 'duplicate animal',
    'cropped', 'close-up', 'headshot', 'portrait',
    // Reference sheet prevention
    'character sheet', 'reference sheet', 'turnaround', 'multiple poses', 'collage', 'grid'
  ];

  // Block humans for animal characters
  if (!bible.is_human) {
    neg.push('human', 'person', 'realistic human', 'human astronaut');
    // Top confusable species
    const confused = getSpeciesNegatives(bible.species_or_type);
    neg.push(...confused.slice(0, 3));
  }

  return neg.join(', ');
}

/**
 * Species-specific negatives — top confusable animals only
 */
function getSpeciesNegatives(species: string): string[] {
  const s = species.toLowerCase();
  const map: Record<string, string[]> = {
    'rhinoceros': ['cow', 'hippo', 'elephant'],
    'rhino': ['cow', 'hippo', 'elephant'],
    'elephant': ['hippo', 'rhino', 'cow'],
    'lion': ['tiger', 'cat', 'dog'],
    'tiger': ['lion', 'cat', 'leopard'],
    'bear': ['dog', 'wolf', 'gorilla'],
    'rabbit': ['cat', 'mouse', 'hamster'],
    'cat': ['dog', 'rabbit', 'fox'],
    'dog': ['cat', 'wolf', 'fox'],
    'fox': ['dog', 'wolf', 'cat'],
    'dolphin': ['fish', 'shark'],
  };
  return map[s] || [];
}

/**
 * Generate all image prompts for a story.
 * Returns prompts, negatives, settings, and mustIncludes for the 2-pass pipeline.
 */
export function generateAllImagePrompts(
  bible: UniversalCharacterBible,
  cards: UniversalSceneCard[]
): { prompts: string[]; negativePrompts: string[]; settings: string[]; mustIncludes: string[][] } {
  const prompts: string[] = [];
  const negativePrompts: string[] = [];
  const settings: string[] = [];
  const mustIncludes: string[][] = [];

  console.log('\n========== BUILDING IMAGE PROMPTS ==========');

  for (const card of cards) {
    const prompt = buildImagePrompt(bible, card);
    const negativePrompt = buildNegativePrompt(bible, card);

    // For scene plates: only include scene objects, not characters
    const plateObjects = card.must_include
      .filter(item => {
        const lower = item.toLowerCase();
        return !lower.includes(bible.name.toLowerCase()) &&
               !lower.includes('full body') &&
               !lower.includes('exactly') &&
               !lower.includes('lunar friend') &&
               !lower.includes('dolphin') &&  // dolphins in final pass only
               !lower.includes('lion');  // characters in final pass only
      })
      .slice(0, 4);

    prompts.push(prompt);
    negativePrompts.push(negativePrompt);
    settings.push(card.setting);
    mustIncludes.push(plateObjects);
  }

  console.log('==============================================\n');

  return { prompts, negativePrompts, settings, mustIncludes };
}
