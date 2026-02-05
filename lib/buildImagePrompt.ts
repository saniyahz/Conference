import { UniversalCharacterBible } from './generateCharacterBible';
import { UniversalSceneCard } from './generateSceneCard';

/**
 * Build image prompt from Universal Character Bible and SceneCard
 * COMPACT FORMAT — must fit CLIP's ~77 token window
 * Template: Character ID. Full body. Scene: {SETTING}. Action: {ACTION}. Include: {3-5}. Style tag.
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

  // MUST-INCLUDE — limit to 3-4 items to save tokens
  const musts = card.must_include.slice(0, 4).join(', ');

  // SUPPORTING CHARACTERS — very short
  const supporting = card.supporting_characters.length > 0
    ? ` With ${card.supporting_characters.map(c => `${c.count} ${c.type}`).join(', ')}.`
    : '';

  // BUILD COMPACT PROMPT — every word counts
  const prompt = `${charId}. Full body.\nScene: ${card.setting}.\nAction: ${card.action}.${supporting}\nInclude: ${musts}.\n2D cartoon, bold outlines, flat cel shading, vibrant pastels. No text.`;

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
  // Core style negatives (always apply)
  const neg: string[] = [
    'photorealistic', '3D render', 'CGI', 'Pixar', 'DSLR', 'film still',
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
 * Generate all image prompts for a story
 */
export function generateAllImagePrompts(
  bible: UniversalCharacterBible,
  cards: UniversalSceneCard[]
): { prompts: string[]; negativePrompts: string[] } {
  const prompts: string[] = [];
  const negativePrompts: string[] = [];

  for (const card of cards) {
    const prompt = buildImagePrompt(bible, card);
    const negativePrompt = buildNegativePrompt(bible, card);

    prompts.push(prompt);
    negativePrompts.push(negativePrompt);
  }

  return { prompts, negativePrompts };
}
