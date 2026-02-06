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
 *
 * CRITICAL: Key objects (rocket ship, Earth, etc.) go FIRST for CLIP attention.
 * The scene plate must include these objects so they appear in the final image.
 *
 * Template: KEY OBJECTS → scene → style → exclusions.
 * Target: < 40 words for CLIP token efficiency.
 */
export function buildSceneOnlyPrompt(setting: string, keyObjects: string[] = []): string {
  // KEY OBJECTS FIRST — highest CLIP attention
  const objects = keyObjects.slice(0, 4);
  const objectsClause = objects.length > 0 ? `${objects.join(', ')}, ` : '';

  // Extract scene type for composition hint
  const lower = setting.toLowerCase();
  let compositionHint = 'wide establishing shot';
  if (lower.includes('cockpit') || lower.includes('inside')) {
    compositionHint = 'interior view, detailed controls';
  } else if (lower.includes('moon') || lower.includes('space')) {
    compositionHint = 'vast space scene, Earth visible';
  } else if (lower.includes('ocean') || lower.includes('splash')) {
    compositionHint = 'ocean scene, waves and sky';
  }

  return `${objectsClause}${setting}. ${compositionHint}. 2D cartoon, bold outlines, vibrant pastels, detailed background. No characters. No animals. No text.`;
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
 *
 * CRITICAL PROMPT STRUCTURE (CLIP token weighting):
 * =====================================================
 * 1. MAIN CHARACTER FIRST (mandatory, with visual traits) — highest attention
 * 2. ACTION (specific verb: touching, wearing, pressing)
 * 3. KEY PROPS (golden helmet, red button, rocket)
 * 4. SUPPORTING CHARACTERS (with exact counts)
 * 5. SCENE (brief reinforcement)
 * 6. STYLE (last = lowest priority)
 *
 * The main character MUST be the first thing in the prompt.
 * Objects like "rocket" come AFTER the character, not before.
 *
 * Target: < 50 words for CLIP token efficiency.
 */
export function buildImagePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;
  const charNameLower = name.toLowerCase();

  // 1. MAIN CHARACTER — FIRST AND MANDATORY (highest CLIP attention)
  // Include 2-3 visual traits for character lock
  const traits = bible.visual_fingerprint.slice(0, 2).join(', ');
  let charId: string;
  if (isAnimal) {
    charId = traits
      ? `${name} the ${species}, ${traits}, anthropomorphic cartoon ${species}`
      : `${name} the ${species}, anthropomorphic cartoon ${species}`;
  } else {
    charId = traits ? `${name}, ${traits}` : name;
  }

  // 2. KEY PROPS from must_include (rocket, helmet, button, etc.)
  // These go AFTER character but before scene
  const keyProps = card.must_include
    .filter(item => {
      const lower = item.toLowerCase();
      return !lower.includes(charNameLower)
        && !lower.includes('full body')
        && !lower.includes('vibrant')
        && !lower.includes('lighting')
        && !lower.includes('background')
        && !lower.includes('colors')
        && !lower.includes('friends');  // friends handled separately
    })
    .slice(0, 3);

  const propsClause = keyProps.length > 0
    ? `, ${keyProps.join(', ')}`
    : '';

  // 3. SUPPORTING CHARACTERS — with EXACT counts
  const hasSupporting = card.supporting_characters.length > 0;
  let supportingClause = '';
  if (hasSupporting) {
    const supporters = card.supporting_characters.slice(0, 2);
    supportingClause = `, with exactly ${supporters.map(c => {
      // Use notes for richer description
      if (c.notes && c.notes.length > 5) {
        return `${c.count} ${c.notes}`;
      }
      return `${c.count} ${c.type}`;
    }).join(' and ')}`;
  }

  // 4. SCENE — brief reinforcement (plate has full scene)
  const sceneShort = extractSceneKeywords(card.setting);

  // 5. SINGULARITY — prevent duplicate main character
  const singularity = isAnimal ? ` Only one ${species}, no duplicate animals.` : '';

  // 6. BUILD PROMPT — CHARACTER FIRST, then action, props, supporters, scene
  // This is the critical fix: Riri must be the first thing CLIP sees
  const prompt = `${charId}, ${card.action}${propsClause}${supportingClause}. ${sceneShort}. Full body visible, centered in frame.${singularity} 2D cartoon, bold outlines, vibrant colors. No text.`;

  console.log(`[IMAGE PROMPT] Page ${card.page_index}: ${prompt}`);
  console.log(`[IMAGE PROMPT] Word count: ${prompt.split(/\s+/).length}`);
  return prompt;
}

/**
 * Extract key scene words from setting string.
 * Returns a concise scene description (3-5 words) for prompt reinforcement.
 */
function extractSceneKeywords(setting: string): string {
  const lower = setting.toLowerCase();

  // Interior scenes
  if (lower.includes('cockpit') || lower.includes('inside rocket')) {
    return 'Inside rocket cockpit, glowing controls';
  }
  if (lower.includes('porthole')) {
    return 'Inside rocket, stars through window';
  }

  // Moon scenes
  if (lower.includes('moon surface') || lower.includes('crater')) {
    return 'Moon surface with craters, Earth in sky';
  }
  if (lower.includes('moon')) {
    return 'Lunar landscape, starry sky';
  }

  // Ocean scenes
  if (lower.includes('underwater') || lower.includes('coral')) {
    return 'Underwater, coral reef, sunbeams';
  }
  if (lower.includes('ocean') && lower.includes('dolphin')) {
    return 'Open ocean, dolphins leaping';
  }
  if (lower.includes('splash') || lower.includes('ocean')) {
    return 'Ocean waves, bright sky';
  }

  // Nature scenes
  if (lower.includes('savann') || lower.includes('acacia')) {
    return 'Golden savannah, acacia trees';
  }
  if (lower.includes('forest') || lower.includes('trees')) {
    return 'Lush green forest, dappled sunlight';
  }

  // Space scenes
  if (lower.includes('space') || lower.includes('nebula')) {
    return 'Deep space, colorful nebula';
  }
  if (lower.includes('rocket launching') || lower.includes('blast')) {
    return 'Rocket launching, blue sky, clouds';
  }

  // Home scenes
  if (lower.includes('home') || lower.includes('cottage')) {
    return 'Cozy home interior, warm light';
  }

  // Generic fallback — use first few words of setting
  return setting.split(',')[0].slice(0, 40);
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

  // Block humans for animal characters — CRITICAL for preventing human astronauts
  if (!bible.is_human) {
    neg.push('human', 'person', 'child', 'man', 'woman', 'astronaut in suit', 'human astronaut', 'realistic human');
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
