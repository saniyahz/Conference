import { UniversalCharacterBible } from './generateCharacterBible';
import { UniversalSceneCard } from './generateSceneCard';

/**
 * Environment-specific words that are PHYSICALLY IMPOSSIBLE in other environments.
 * Only ban biome/location words — NEVER ban movable objects (rocket, spaceship).
 * A rocket can be in a forest (discovery scene) or on the moon (landing scene).
 */
const ENV_CONFLICT_MAP: Record<string, string[]> = {
  // Ocean: no land biomes
  ocean:      ['forest', 'trees', 'woods', 'jungle', 'crater', 'desert', 'sand', 'dune', 'mountain', 'cave', 'savann', 'grass', 'meadow'],
  // Underwater: no sky, no land
  underwater: ['forest', 'trees', 'woods', 'jungle', 'crater', 'desert', 'sand', 'dune', 'mountain', 'cave', 'clouds', 'savann', 'meadow'],
  // Moon: no Earth biomes, no weather
  moon:       ['forest', 'trees', 'woods', 'jungle', 'ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'desert', 'sand', 'clouds', 'river', 'meadow', 'flower', 'grass'],
  // Space: no Earth biomes
  space:      ['forest', 'trees', 'woods', 'jungle', 'ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'desert', 'sand', 'river', 'meadow', 'flower', 'grass'],
  // Rocket interior: no outdoor biomes (but moon/stars visible through window = OK)
  rocket:     ['dolphin', 'fish', 'coral', 'desert', 'cave', 'meadow'],
  // Forest: no ocean/underwater biome (but rocket = OK, it can be hidden in forest)
  forest:     ['ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'crater', 'desert', 'sand', 'dune'],
  // Savanna: no ocean/underwater
  savann:     ['ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'crater', 'desert', 'sand'],
  // Desert: no ocean/forest
  desert:     ['ocean', 'waves', 'dolphin', 'fish', 'coral', 'sea', 'forest', 'woods', 'jungle', 'river', 'meadow'],
  // Beach: no contradictory biomes
  beach:      ['forest', 'woods', 'jungle', 'crater', 'desert', 'cave'],
  // Cave: no open biomes
  cave:       ['ocean', 'waves', 'dolphin', 'sea', 'desert', 'beach', 'meadow'],
};

/**
 * Clean must_include list: remove items that contradict the page setting.
 * A moon page should not include "forest trees" or "ocean waves".
 */
export function cleanMustInclude(setting: string, mustInclude: string[]): string[] {
  const lowerSetting = setting.toLowerCase();

  // Accumulate ALL matching environment conflicts (don't stop at first match)
  // A setting like "Rocket launching from savannah" matches both rocket AND savann
  const bannedWords: string[] = [];
  for (const [env, conflicts] of Object.entries(ENV_CONFLICT_MAP)) {
    if (lowerSetting.includes(env)) {
      bannedWords.push(...conflicts);
    }
  }
  // Deduplicate
  const uniqueBanned = Array.from(new Set(bannedWords));

  if (uniqueBanned.length === 0) return mustInclude;

  const cleaned = mustInclude.filter(item => {
    const lowerItem = item.toLowerCase();
    return !uniqueBanned.some(banned => lowerItem.includes(banned));
  });

  const removed = mustInclude.filter(item => {
    const lowerItem = item.toLowerCase();
    return uniqueBanned.some(banned => lowerItem.includes(banned));
  });

  if (removed.length > 0) {
    console.log(`[CLEAN] Removed from must_include (conflict with "${lowerSetting}"): ${removed.join(', ')}`);
  }

  return cleaned;
}

/**
 * Build scene-only prompt for the scene plate (first pass).
 * No characters — just the background environment.
 * Setting comes directly from SceneCard.setting (source of truth).
 */
export function buildSceneOnlyPrompt(setting: string): string {
  return `2D cartoon, bold outlines, flat cel shading, vibrant pastels. SCENE: ${setting}. Wide shot, detailed background. No characters. No animals. No text.`;
}

/**
 * Gate indoor nouns from outdoor scenes.
 * A "doorway" doesn't belong in "rocket launching into sky" — it confuses SDXL.
 * Only allow indoor nouns when the setting is explicitly indoor (cockpit, home, cottage, room).
 */
function gateIndoorNouns(setting: string, mustInclude: string[]): string[] {
  const lowerSetting = setting.toLowerCase()
  const isIndoor = /cockpit|inside|interior|home|cottage|house|room|bedroom/.test(lowerSetting)

  if (isIndoor) return mustInclude  // Indoor scene — keep all nouns

  const indoorNouns = ['doorway', 'door', 'room', 'window', 'hallway', 'stairs', 'ceiling', 'wall', 'curtain']

  const filtered = mustInclude.filter(item => {
    const lower = item.toLowerCase()
    return !indoorNouns.some(noun => lower.includes(noun))
  })

  const removed = mustInclude.filter(item => !filtered.includes(item))
  if (removed.length > 0) {
    console.log(`[GATE] Removed indoor nouns from outdoor scene "${setting}": ${removed.join(', ')}`)
  }

  return filtered
}

/**
 * Build image prompt for the FINAL PASS (img2img from scene plate).
 * Scene is already baked into the plate — prompt focuses on character + action.
 * "Keep the same background scene" tells SDXL to preserve the plate.
 * COMPACT FORMAT — must fit CLIP's ~77 token window.
 */
export function buildImagePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;

  // CHARACTER ID — short, front-loaded for CLIP priority
  let charId: string;
  if (isAnimal) {
    // Repeat species once for emphasis + top 3 fingerprint traits
    const traits = bible.visual_fingerprint.slice(0, 3).join(', ');
    charId = `${name} the ${species}, ${species}, ${traits}`;
  } else {
    const traits = bible.visual_fingerprint.slice(0, 3).join(', ');
    charId = `${name}, ${traits}`;
  }

  // MUST-INCLUDE — clean contradictions, gate indoor nouns, then limit to 3-4 items
  const envCleaned = cleanMustInclude(card.setting, card.must_include);
  const cleanedMusts = gateIndoorNouns(card.setting, envCleaned);
  const musts = cleanedMusts.slice(0, 4).join(', ');

  // SUPPORTING CHARACTERS
  const hasSupporting = card.supporting_characters.length > 0;
  const supportingList = hasSupporting
    ? card.supporting_characters.map(c => `${c.count} ${c.type}`).join(', ')
    : '';

  // FINAL PASS PROMPT — scene is already in the plate, CLIP tokens prioritize character
  // "Keep the same background scene" preserves the plate's environment
  // Character description comes immediately after for maximum CLIP weight
  // Style at end (already in plate, just reinforcing)
  let prompt: string;
  if (hasSupporting) {
    prompt = `Keep the same background scene. ${charId} as main character, centered, with ${supportingList}, ${card.action}. ${musts}. 2D cartoon, bold outlines, flat cel shading, vibrant pastels. No text.`;
  } else {
    prompt = `Keep the same background scene. ${charId} as main character, centered, full body, ${card.action}. ${musts}. 2D cartoon, bold outlines, flat cel shading, vibrant pastels. No text.`;
  }

  console.log(`[IMAGE PROMPT] Page ${card.page_index}: ${prompt}`);
  return prompt;
}

/**
 * Build negative prompt — compact, scene-aware
 * The actual negatives used at generation time come from
 * buildDynamicNegativePrompt() in generate-images/route.ts,
 * but this is used as the passed-through negative for logging/fallback.
 */
export function buildNegativePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  // Core style negatives (always apply) + anti-sheet
  const neg: string[] = [
    'character sheet', 'reference sheet', 'turnaround', 'multiple poses', 'collage', 'grid', 'lineup',
    'photorealistic', '3D render', 'CGI', 'Pixar', 'DSLR',
    'text', 'watermark', 'logo', 'blurry', 'low quality'
  ];

  // Block humans for animal characters
  if (!bible.is_human) {
    neg.push('human', 'person', 'child');
    // Top 3 species-confusion negatives
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
    'giraffe': ['horse', 'deer', 'llama'],
    'penguin': ['duck', 'chicken'],
    'dolphin': ['fish', 'shark'],
    'owl': ['eagle', 'hawk'],
  };
  return map[s] || [];
}

/**
 * Generate all image prompts for a story.
 * Returns settings separately so generate-images can build scene plates from them.
 */
export function generateAllImagePrompts(
  bible: UniversalCharacterBible,
  cards: UniversalSceneCard[]
): { prompts: string[]; negativePrompts: string[]; settings: string[] } {
  const prompts: string[] = [];
  const negativePrompts: string[] = [];
  const settings: string[] = [];

  for (const card of cards) {
    const prompt = buildImagePrompt(bible, card);
    const negativePrompt = buildNegativePrompt(bible, card);

    prompts.push(prompt);
    negativePrompts.push(negativePrompt);
    settings.push(card.setting);
  }

  return { prompts, negativePrompts, settings };
}
