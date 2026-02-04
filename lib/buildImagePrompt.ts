import { UniversalCharacterBible } from './generateCharacterBible';
import { UniversalSceneCard } from './generateSceneCard';

/**
 * Build image prompt from Universal Character Bible and SceneCard
 * Combines visual fingerprint with scene details
 */
export function buildImagePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;

  // 1. CHARACTER FIRST - repeat species for SDXL to lock onto it
  let characterDesc: string;
  if (isAnimal) {
    // For animals: repeat species multiple times
    const fingerprint = bible.visual_fingerprint.slice(0, 5).join(', ');
    characterDesc = `${species} ${species} ${species}, ${fingerprint}, ${name} the ${species}`;
  } else {
    // For humans: use visual fingerprint
    const fingerprint = bible.visual_fingerprint.slice(0, 5).join(', ');
    characterDesc = `${fingerprint}, ${name}`;
  }

  // 2. OUTFIT/PROPS if any
  const outfitDesc = bible.signature_outfit_or_props.length > 0
    ? `, wearing ${bible.signature_outfit_or_props.join(' and ')}`
    : '';

  // 3. ACTION from scene card
  const actionDesc = card.action;

  // 4. SETTING from scene card
  const settingDesc = card.setting;

  // 5. MUST-INCLUDE items (for wide shot)
  const mustIncludeDesc = card.must_include.length > 0
    ? `showing ${card.must_include.join(', ')}`
    : '';

  // 6. SUPPORTING CHARACTERS
  const supportingDesc = card.supporting_characters.length > 0
    ? `with ${card.supporting_characters.map(c => `${c.count} ${c.type}`).join(' and ')}`
    : '';

  // 7. CAMERA & MOOD
  const cameraDesc = card.camera === 'wide'
    ? 'wide shot showing full scene'
    : card.camera === 'close-up'
    ? 'close-up shot'
    : 'medium shot';

  // 8. ART STYLE
  const artStyle = `${bible.art_style.medium}, ${bible.art_style.genre}, ${bible.art_style.mood}, ${bible.art_style.color_palette} colors`;

  // BUILD FINAL PROMPT
  // Structure: CHARACTER (repeated) + outfit + action + setting + must-include + supporting + camera + style
  const prompt = [
    characterDesc,
    outfitDesc,
    actionDesc,
    settingDesc,
    mustIncludeDesc,
    supportingDesc,
    cameraDesc,
    artStyle,
    'Pixar Disney 3D animation style, soft lighting, vibrant colors, children\'s book illustration'
  ].filter(Boolean).join(', ');

  console.log(`[IMAGE PROMPT] Page ${card.page_index}: ${prompt.substring(0, 200)}...`);
  return prompt;
}

/**
 * Build negative prompt based on character type and scene
 */
export function buildNegativePrompt(
  bible: UniversalCharacterBible,
  card: UniversalSceneCard
): string {
  const negatives: string[] = [
    'text', 'watermark', 'logo', 'signature',
    'photorealistic', 'realistic', 'photograph', 'photo',
    'ugly', 'deformed', 'bad anatomy', 'bad proportions',
    'blurry', 'low quality', 'jpeg artifacts'
  ];

  // If animal character, block humans
  if (!bible.is_human) {
    negatives.push('human', 'person', 'boy', 'girl', 'child', 'man', 'woman', 'people', 'hands', 'fingers');

    // Add species-specific negatives
    const speciesNegatives = getSpeciesNegatives(bible.species_or_type);
    negatives.push(...speciesNegatives);
  }

  // Add scene-based negatives
  const sceneNegatives = getSceneNegatives(card.setting);
  negatives.push(...sceneNegatives);

  return negatives.join(', ');
}

/**
 * Species-specific negatives to prevent SDXL from drifting to similar animals
 */
function getSpeciesNegatives(species: string): string[] {
  const lowerSpecies = species.toLowerCase();

  const speciesMap: Record<string, string[]> = {
    'rhinoceros': ['cow', 'bull', 'ox', 'hippo', 'hippopotamus', 'elephant', 'unicorn', 'horse', 'pig', 'boar'],
    'rhino': ['cow', 'bull', 'ox', 'hippo', 'hippopotamus', 'elephant', 'unicorn', 'horse', 'pig', 'boar'],
    'elephant': ['hippo', 'rhino', 'mammoth', 'cow'],
    'lion': ['tiger', 'cat', 'dog', 'wolf', 'bear'],
    'tiger': ['lion', 'cat', 'dog', 'leopard', 'cheetah'],
    'bear': ['dog', 'wolf', 'lion', 'gorilla'],
    'rabbit': ['cat', 'dog', 'mouse', 'hamster'],
    'cat': ['dog', 'rabbit', 'fox', 'wolf'],
    'dog': ['cat', 'wolf', 'fox', 'bear'],
    'fox': ['dog', 'wolf', 'cat', 'coyote'],
    'wolf': ['dog', 'fox', 'coyote', 'husky'],
    'giraffe': ['horse', 'deer', 'llama', 'camel'],
    'zebra': ['horse', 'donkey', 'cow'],
    'monkey': ['human', 'ape', 'gorilla', 'chimpanzee'],
    'penguin': ['duck', 'bird', 'chicken'],
    'dolphin': ['fish', 'shark', 'whale'],
    'owl': ['eagle', 'hawk', 'parrot', 'chicken'],
  };

  return speciesMap[lowerSpecies] || [];
}

/**
 * Scene-based negatives to prevent wrong settings
 */
function getSceneNegatives(setting: string): string[] {
  const lowerSetting = setting.toLowerCase();

  // SPACE/MOON scenes - block underwater
  if (lowerSetting.includes('space') || lowerSetting.includes('moon') ||
      lowerSetting.includes('rocket') || lowerSetting.includes('planet') ||
      lowerSetting.includes('stars') || lowerSetting.includes('crater')) {
    return ['underwater', 'ocean', 'sea', 'fish', 'coral', 'seaweed', 'water', 'swimming', 'beach'];
  }

  // UNDERWATER/OCEAN scenes - block space
  if (lowerSetting.includes('underwater') || lowerSetting.includes('ocean') ||
      lowerSetting.includes('coral') || lowerSetting.includes('fish')) {
    return ['space', 'moon', 'stars', 'planet', 'rocket', 'crater'];
  }

  // FOREST/MEADOW scenes - block underwater and space
  if (lowerSetting.includes('forest') || lowerSetting.includes('meadow') ||
      lowerSetting.includes('garden') || lowerSetting.includes('field') ||
      lowerSetting.includes('jungle') || lowerSetting.includes('savanna')) {
    return ['underwater', 'ocean', 'sea', 'fish', 'coral', 'space', 'moon', 'rocket'];
  }

  // BEACH scenes - block underwater
  if (lowerSetting.includes('beach') || lowerSetting.includes('shore')) {
    return ['underwater', 'deep sea', 'coral reef', 'space', 'moon'];
  }

  return [];
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
