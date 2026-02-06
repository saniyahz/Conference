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
 * keyObjects are must_include items to embed in the plate background.
 * Template: style → composition → scene → objects → exclusions.
 * Target: < 40 words for CLIP token efficiency.
 */
export function buildSceneOnlyPrompt(setting: string, keyObjects: string[] = []): string {
  const includeClause = keyObjects.length > 0 ? ` Must include: ${keyObjects.slice(0, 5).join(', ')}.` : ''
  return `2D cartoon, bold outlines, flat cel shading, vibrant pastels. Wide establishing shot. Background detailed. Scene: ${setting}.${includeClause} No characters. No animals. No text.`;
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
 * Scene is already baked into the plate — keep scene description minimal.
 *
 * CRITICAL: Character goes FIRST in the prompt because CLIP gives strongest
 * weight to early tokens. "Same background" goes LAST (low priority — the
 * plate already handles scene preservation through prompt_strength).
 *
 * Key objects from must_include are added back so items like "rocket ship"
 * or "lions" actually appear in the final frame.
 *
 * Target: < 40 words for CLIP token efficiency.
 */
export function buildImagePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;

  // CHARACTER ID — FIRST for maximum CLIP attention
  let charId: string;
  if (isAnimal) {
    const trait = bible.visual_fingerprint[0] || species;
    charId = `${name} the ${species}, ${trait}`;
  } else {
    const trait = bible.visual_fingerprint[0] || 'cartoon child';
    charId = `${name}, ${trait}`;
  }

  // SUPPORTING CHARACTERS (dolphins, lions, etc.)
  const hasSupporting = card.supporting_characters.length > 0;
  const supportingClause = hasSupporting
    ? `, with ${card.supporting_characters.slice(0, 2).map(c => `${c.count} ${c.type}`).join(' and ')}`
    : '';

  // KEY OBJECTS from must_include that should be visible in frame
  // Filter out character name, "full body", and generic filler items
  const charNameLower = name.toLowerCase();
  const keyObjects = card.must_include
    .filter(item => {
      const lower = item.toLowerCase();
      return !lower.includes(charNameLower)
        && !lower.includes('full body')
        && !lower.includes('vibrant')
        && !lower.includes('lighting')
        && !lower.includes('background')
        && !lower.includes('colors');
    })
    .slice(0, 3);

  const objectsClause = keyObjects.length > 0
    ? `. ${keyObjects.join(', ')} visible`
    : '';

  // SINGULARITY CONSTRAINT: "only one {species}" prevents SDXL from generating duplicates.
  // This is critical for animal characters which SDXL loves to duplicate.
  const singularity = isAnimal ? ` Only one ${species}.` : '';

  // COMPOSITION CONSTRAINT: prevent giant heads / extreme close-ups.
  // "full body only" + "wide shot" + "fits fully in frame" tells SDXL to show the whole character.
  const composition = 'full body only, wide shot, character fits fully in frame';

  // PROMPT: Character FIRST (highest CLIP weight), scene anchoring LAST (lowest).
  // The plate already preserves the scene — prompt_strength controls the balance.
  const prompt = `${charId}, ${composition}, centered${supportingClause}, ${card.action}${objectsClause}.${singularity} Same background. 2D cartoon, bold outlines, vibrant pastels. No text.`;

  console.log(`[IMAGE PROMPT] Page ${card.page_index}: ${prompt}`);
  console.log(`[IMAGE PROMPT] Word count: ${prompt.split(/\s+/).length}`);
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
 * Returns settings and mustIncludes separately so generate-images can:
 * - Build scene plates from settings + mustIncludes
 * - Use mustIncludes for negative sanitization (never negate what you ask for)
 */
export function generateAllImagePrompts(
  bible: UniversalCharacterBible,
  cards: UniversalSceneCard[]
): { prompts: string[]; negativePrompts: string[]; settings: string[]; mustIncludes: string[][] } {
  const prompts: string[] = [];
  const negativePrompts: string[] = [];
  const settings: string[] = [];
  const mustIncludes: string[][] = [];
  const charName = bible.name.toLowerCase();

  for (const card of cards) {
    const prompt = buildImagePrompt(bible, card);
    const negativePrompt = buildNegativePrompt(bible, card);

    // Build PLATE must_include: strip ALL character-related items.
    // Plates are pure backgrounds ("No characters. No animals." in plate prompt).
    // The main character, "full body", "friends", and singularity constraints
    // must NEVER appear in plate must_include — they conflict with "No characters".
    // Noun gating in generateSceneCard.ts already handles env conflicts.
    const cleanedMusts = gateIndoorNouns(card.setting, card.must_include);
    const plateObjects = cleanedMusts
      .filter(item => {
        const lower = item.toLowerCase()
        if (lower.includes(charName)) return false           // main character name
        if (lower.includes('full body')) return false         // character pose
        if (lower === 'friends') return false                 // vague, not visual
        if (lower.includes('only one')) return false          // singularity constraint
        if (lower.includes('vibrant')) return false           // generic filler
        if (lower.includes('lighting')) return false          // generic filler
        if (lower.includes('background')) return false        // generic filler
        if (lower.includes('colors')) return false            // generic filler
        return true
      })
      .slice(0, 5);

    prompts.push(prompt);
    negativePrompts.push(negativePrompt);
    settings.push(card.setting);
    mustIncludes.push(plateObjects);
  }

  return { prompts, negativePrompts, settings, mustIncludes };
}
