import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * SDXL-OPTIMIZED PROMPT BUILDER
 *
 * Key rules:
 * 1. CHARACTER LOCK first (SDXL attends to first ~77 tokens)
 * 2. Explicit "Non-human animal only" for animal characters
 * 3. Structured: Scene → Subject → Action → Must-include → Composition → Style
 * 4. Strong negative prompt blocking humans for animal stories
 */

// Normalize species name (fix common misspellings)
function normalizeSpecies(species: string): string {
  const lower = species.toLowerCase();
  const misspellingMap: Record<string, string> = {
    'rhinecerous': 'rhinoceros',
    'rhinocerous': 'rhinoceros',
    'rhineceros': 'rhinoceros',
    'elefant': 'elephant',
    'girrafe': 'giraffe',
    'girraffe': 'giraffe',
    'hipopotamus': 'hippopotamus',
    'cheetuh': 'cheetah',
    'cheeta': 'cheetah',
    'monky': 'monkey',
    'buterfly': 'butterfly',
    'butterfy': 'butterfly',
    'dolpin': 'dolphin',
    'pengiun': 'penguin',
    'koalla': 'koala',
    'kangeroo': 'kangaroo',
    'squirel': 'squirrel',
    'rabit': 'rabbit',
    'rabitt': 'rabbit',
    'tortise': 'tortoise',
  };
  return misspellingMap[lower] || lower;
}

// Animal-specific traits for visual consistency
const ANIMAL_TRAITS: Record<string, string[]> = {
  'rhinoceros': ['gray rough skin', 'large horn on nose', 'thick sturdy body', 'small round ears', 'big gentle eyes'],
  'rhino': ['gray rough skin', 'large horn on nose', 'thick sturdy body', 'small round ears', 'big gentle eyes'],
  'elephant': ['gray wrinkled skin', 'long trunk', 'big floppy ears', 'small tusks', 'gentle eyes'],
  'giraffe': ['long neck', 'spotted yellow and brown pattern', 'small horns', 'long legs', 'kind eyes'],
  'zebra': ['black and white stripes', 'horse-like body', 'short mane', 'big dark eyes'],
  'lion': ['golden fur', 'fluffy mane', 'powerful body', 'long tail', 'majestic eyes'],
  'hippo': ['gray pink skin', 'wide mouth', 'barrel body', 'small ears', 'round eyes'],
  'dog': ['fluffy fur', 'wagging tail', 'floppy ears', 'wet nose', 'friendly eyes'],
  'puppy': ['soft fluffy fur', 'small body', 'big eyes', 'floppy ears', 'cute face'],
  'cat': ['soft fur', 'pointed ears', 'whiskers', 'long tail', 'bright eyes'],
  'kitten': ['fluffy soft fur', 'small body', 'big round eyes', 'tiny paws', 'whiskers'],
  'rabbit': ['fluffy fur', 'long floppy ears', 'cotton tail', 'pink nose', 'big eyes'],
  'bunny': ['fluffy fur', 'long floppy ears', 'cotton tail', 'pink nose', 'big eyes'],
  'fox': ['orange red fur', 'fluffy tail', 'pointed ears', 'white chest', 'clever eyes'],
  'bear': ['thick fluffy fur', 'round ears', 'big paws', 'strong body', 'friendly face'],
  'owl': ['feathered body', 'big round eyes', 'small beak', 'wings', 'fluffy face'],
  'penguin': ['black and white feathers', 'orange beak', 'flippers', 'round body', 'cute waddle'],
  'monkey': ['brown fur', 'long tail', 'expressive face', 'big ears', 'nimble hands'],
  'tiger': ['orange fur with black stripes', 'powerful body', 'long tail', 'fierce but friendly eyes'],
  'panda': ['black and white fur', 'round body', 'black eye patches', 'fluffy ears', 'gentle expression'],
  'koala': ['gray fluffy fur', 'big round ears', 'black nose', 'sleepy eyes', 'round body'],
  'kangaroo': ['brown fur', 'long tail', 'big back legs', 'pouch', 'upright posture'],
  'dolphin': ['smooth gray skin', 'curved dorsal fin', 'smiling mouth', 'flippers', 'playful eyes'],
  'turtle': ['shell on back', 'scaly skin', 'small head', 'gentle eyes', 'slow moving'],
  'frog': ['green smooth skin', 'big bulging eyes', 'long legs', 'webbed feet', 'wide mouth'],
  'butterfly': ['colorful patterned wings', 'thin antennae', 'small body', 'graceful', 'delicate'],
  'dragon': ['scales', 'wings', 'long tail', 'small horns', 'friendly fierce eyes'],
  'unicorn': ['white coat', 'rainbow mane', 'magical horn', 'sparkles', 'graceful body'],
};

/**
 * Try to extract species from page text as a last resort
 */
function extractSpeciesFromText(text: string): string | null {
  const lower = text.toLowerCase();

  // Common misspellings to check first
  const misspellingMap: Record<string, string> = {
    'rhinecerous': 'rhinoceros',
    'rhinocerous': 'rhinoceros',
    'rhineceros': 'rhinoceros',
    'elefant': 'elephant',
    'girrafe': 'giraffe',
    'girraffe': 'giraffe',
    'hipopotamus': 'hippopotamus',
  };

  for (const [misspelling, correct] of Object.entries(misspellingMap)) {
    if (lower.includes(misspelling)) {
      return correct;
    }
  }

  // Check for known animals (prioritize larger/common animals)
  const priorityAnimals = [
    'rhinoceros', 'rhino', 'elephant', 'giraffe', 'zebra', 'lion', 'tiger',
    'hippo', 'hippopotamus', 'bear', 'panda', 'koala', 'kangaroo',
    'monkey', 'gorilla', 'fox', 'wolf', 'deer', 'rabbit', 'bunny',
    'dog', 'puppy', 'cat', 'kitten', 'owl', 'penguin', 'dolphin',
    'turtle', 'frog', 'dragon', 'unicorn', 'butterfly'
  ];

  for (const animal of priorityAnimals) {
    if (lower.includes(animal)) {
      return animal;
    }
  }

  return null;
}

/**
 * Main prompt builder - SDXL optimized structure
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  const text = pageText?.toLowerCase() || '';
  const isAnimal = bible.character_type === 'animal';
  // Normalize species to handle misspellings
  const rawSpecies = bible.species || 'animal';
  let species = normalizeSpecies(rawSpecies);
  const name = bible.name;

  // CRITICAL FIX: If species is still generic 'animal', try to extract from page text
  if (isAnimal && species === 'animal' && pageText) {
    const detectedSpecies = extractSpeciesFromText(pageText);
    if (detectedSpecies) {
      species = detectedSpecies;
      console.log(`[PROMPT] Detected species "${species}" from page text for ${name}`);
    }
  }

  // Get character traits (use normalized species for lookup)
  const traits = ANIMAL_TRAITS[species.toLowerCase()] || ['cute', 'friendly', 'expressive eyes'];
  const traitsStr = traits.slice(0, 4).join(', ');

  // Extract scene elements from page text
  const setting = extractSetting(text, card.setting);
  const action = extractAction(text, name);
  const mustInclude = extractMustInclude(text, species, isAnimal);
  const camera = getCameraAngle(text);
  const mood = extractMood(text);
  const lighting = extractLighting(text);

  // Build prompt with CHARACTER LOCK FIRST
  let prompt = '';

  if (isAnimal) {
    // ANIMAL CHARACTER - Strong lock (ALWAYS render as animal when character_type is animal)
    const speciesLabel = species !== 'animal' ? species : 'cute animal';
    prompt = `CHARACTER LOCK: ${name} is a ${speciesLabel}. Non-human animal only. NO HUMANS. Same character every page. `;
    prompt += `Scene: ${setting}. `;
    prompt += `Main subject: ${name}, a ${speciesLabel}, ${traitsStr}. `;
    prompt += `Action: ${action}. `;
    prompt += `Must include: ${mustInclude}. `;
    prompt += `Composition: ${camera}. Mood/lighting: ${mood}, ${lighting}. `;
    prompt += `Style: children's picture book illustration, clean lines, vibrant colors, soft shading, high detail. NO HUMAN CHARACTERS.`;
  } else {
    // HUMAN or OTHER character
    const skinTone = bible.appearance?.skin_tone || 'warm skin';
    const hair = bible.appearance?.hair || 'soft hair';
    prompt = `Scene: ${setting}. `;
    prompt += `Main subject: ${name}, a young child, ${skinTone}, ${hair}, big expressive eyes, friendly smile. `;
    prompt += `Action: ${action}. `;
    prompt += `Must include: ${mustInclude}. `;
    prompt += `Composition: ${camera}. Mood/lighting: ${mood}, ${lighting}. `;
    prompt += `Style: children's picture book illustration, clean lines, vibrant colors, soft shading, high detail.`;
  }

  console.log(`[PROMPT DEBUG] Page ${card.page_number}:`);
  console.log(`  - character_type: ${bible.character_type}`);
  console.log(`  - species (raw): ${rawSpecies}`);
  console.log(`  - species (final): ${species}`);
  console.log(`  - isAnimal: ${isAnimal}`);
  console.log(`  - prompt: ${prompt.substring(0, 300)}...`);
  return prompt;
}

/**
 * Extract setting from page text
 */
function extractSetting(text: string, fallback: string): string {
  // Space/Moon scenes
  if (text.includes('moon') && (text.includes('surface') || text.includes('landed') || text.includes('crater'))) {
    return 'gray dusty moon surface with craters, black starry space sky, Earth visible in distance';
  }
  if (text.includes('rocket') && (text.includes('inside') || text.includes('cockpit') || text.includes('window'))) {
    return 'inside colorful rocket ship cockpit with big windows showing space, glowing control panel';
  }
  if (text.includes('blasted off') || text.includes('launched') || text.includes('soared into the sky')) {
    return 'rocket ship launching into blue sky with clouds, fire and smoke below';
  }
  if (text.includes('space') || text.includes('stars') && text.includes('planet')) {
    return 'outer space with colorful nebulas, twinkling stars, distant planets';
  }
  if (text.includes('savannah') || text.includes('africa')) {
    return 'African savannah at sunset with tall golden grass and acacia trees';
  }

  // Nature scenes
  if (text.includes('forest') || text.includes('woods')) {
    return 'magical forest with tall friendly trees, dappled sunlight, colorful mushrooms';
  }
  if (text.includes('meadow') || text.includes('field') || text.includes('flowers')) {
    return 'colorful meadow with wildflowers, butterflies, blue sky with fluffy clouds';
  }
  if (text.includes('underwater') || text.includes('ocean floor')) {
    return 'magical underwater scene with colorful coral reef, tropical fish, bubbles';
  }
  if (text.includes('beach') || text.includes('shore')) {
    return 'sunny beach with golden sand, gentle turquoise waves, clear blue sky';
  }

  // Indoor scenes
  if (text.includes('home') || text.includes('house') || text.includes('bedroom')) {
    return 'cozy home interior with warm lighting, comfortable furniture';
  }

  // Time of day
  if (text.includes('night') || text.includes('nighttime')) {
    return `${fallback} at night with starry sky and soft moonlight`;
  }
  if (text.includes('sunset') || text.includes('evening')) {
    return `${fallback} at golden sunset with warm orange and pink sky`;
  }

  return fallback || 'magical storybook setting with warm colors';
}

/**
 * Extract action from page text
 */
function extractAction(text: string, charName: string): string {
  // Space actions
  if (text.includes('stumbled upon') && text.includes('rocket')) {
    return 'discovering a shiny rocket ship with amazed excited expression';
  }
  if (text.includes('climbed aboard') || text.includes('climbed inside')) {
    return 'climbing into rocket ship with eager excited expression';
  }
  if (text.includes('blasted off') || text.includes('roar of engines')) {
    return 'pressing buttons in rocket cockpit, looking out window excitedly';
  }
  if (text.includes('traveled through') && text.includes('stars')) {
    return 'looking out rocket window in wonder at passing stars and planets';
  }
  if (text.includes('landed') && text.includes('moon')) {
    return 'stepping out onto moon surface, looking around with curiosity';
  }
  if (text.includes('aliens') || text.includes('alien')) {
    return 'meeting friendly small aliens, waving hello with surprised happy expression';
  }
  if (text.includes('explored') || text.includes('exploring')) {
    return 'exploring curiously, looking around with wonder and excitement';
  }
  if (text.includes('waved goodbye') || text.includes('said goodbye')) {
    return 'waving goodbye with happy but slightly sad expression';
  }
  if (text.includes('headed home') || text.includes('back to earth')) {
    return 'in rocket heading home, looking back through window peacefully';
  }
  if (text.includes('landed safely') || text.includes('back in')) {
    return 'standing happily next to landed rocket, satisfied expression';
  }
  if (text.includes('couldn\'t wait') || text.includes('next adventure')) {
    return 'looking up at starry sky dreamily, thinking about future adventures';
  }

  // Emotion actions
  if (text.includes('happy') || text.includes('joy') || text.includes('excited')) {
    return 'looking happy and excited with big smile';
  }
  if (text.includes('surprised') || text.includes('amazed')) {
    return 'looking surprised with wide eyes and open mouth';
  }
  if (text.includes('curious') || text.includes('wondering')) {
    return 'looking curious with tilted head and interested expression';
  }

  return 'standing in engaging pose with friendly expression';
}

/**
 * Extract must-include elements from text
 */
function extractMustInclude(text: string, species: string, isAnimal: boolean): string {
  const elements: string[] = [];

  // Always include the character species for animals
  if (isAnimal && species !== 'animal') {
    elements.push(species);
  }

  // Aliens
  if (text.includes('aliens') || text.includes('alien')) {
    elements.push('small friendly aliens with big round eyes');
  }

  // Rocket/Space
  if (text.includes('rocket ship') || text.includes('rocket')) {
    if (text.includes('shiny') || text.includes('silver')) {
      elements.push('shiny silver rocket ship');
    } else {
      elements.push('colorful rocket ship');
    }
  }
  if (text.includes('big red button') || text.includes('blast off')) {
    elements.push('big red button');
  }
  if (text.includes('space helmet') || text.includes('spacesuit')) {
    elements.push('bubble space helmet');
  }

  // Moon elements
  if (text.includes('crater')) {
    elements.push('moon craters');
  }
  if (text.includes('moon') && text.includes('surface')) {
    elements.push('gray dusty moon ground');
  }

  // Earth/stars
  if (text.includes('earth') && (text.includes('smaller') || text.includes('view') || text.includes('distance'))) {
    elements.push('Earth visible in distance');
  }
  if (text.includes('stars')) {
    elements.push('twinkling stars');
  }

  // Savannah
  if (text.includes('savannah')) {
    elements.push('savannah grass');
    elements.push('acacia trees');
  }

  // Limit to 6 elements for prompt length
  return elements.slice(0, 6).join(', ') || `${species}, magical background`;
}

/**
 * Get camera angle based on scene
 */
function getCameraAngle(text: string): string {
  if (text.includes('flew over') || text.includes('soared over') || text.includes('landscape')) {
    return 'wide shot, full scene visible';
  }
  if (text.includes('hugged') || text.includes('smiled') || text.includes('face')) {
    return 'medium close-up, character prominent';
  }
  return 'medium shot, full body, centered';
}

/**
 * Extract mood from text
 */
function extractMood(text: string): string {
  if (text.includes('excited') || text.includes('excitement') || text.includes('sparkled')) {
    return 'excited, adventurous';
  }
  if (text.includes('wonder') || text.includes('amazed') || text.includes('magical')) {
    return 'wonder, magical';
  }
  if (text.includes('happy') || text.includes('joy')) {
    return 'happy, joyful';
  }
  if (text.includes('surprised')) {
    return 'surprised, delighted';
  }
  if (text.includes('peaceful') || text.includes('calm')) {
    return 'peaceful, serene';
  }
  if (text.includes('curious')) {
    return 'curious, intrigued';
  }
  return 'wholesome, magical';
}

/**
 * Extract lighting from text
 */
function extractLighting(text: string): string {
  if (text.includes('sunset') || text.includes('evening')) {
    return 'warm sunset glow';
  }
  if (text.includes('night') || text.includes('stars') || text.includes('space')) {
    return 'soft starlight with colorful nebula glow';
  }
  if (text.includes('morning') || text.includes('sunrise')) {
    return 'soft morning light';
  }
  if (text.includes('moon') && text.includes('surface')) {
    return 'harsh space lighting with Earth glow';
  }
  if (text.includes('underwater')) {
    return 'soft blue underwater light';
  }
  return 'soft warm light';
}

/**
 * NEGATIVE PROMPT - Critical for blocking humans in animal stories
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean): string {
  // CRITICAL: Block humans FIRST for animal stories (most important negatives at start)
  const humanNegatives = isAnimal ? [
    'human', 'child', 'boy', 'girl', 'person', 'baby', 'face', 'portrait',
    'skin', 'hands', 'human body', 'human character', 'human face',
    'adult', 'teenager', 'kid', 'man', 'woman', 'people'
  ] : [];

  // Base negatives that always apply
  const baseNegatives = [
    'realistic photo', 'photograph', 'photorealistic',
    'text', 'watermark', 'logo', 'signature',
    'ugly', 'deformed', 'disfigured', 'bad anatomy',
    'blurry', 'low quality', 'amateur'
  ];

  // Environment-specific exclusions
  const envNegatives: string[] = [];
  const setting = card.setting.toLowerCase();

  if (setting.includes('space') || setting.includes('moon') || setting.includes('rocket')) {
    envNegatives.push('forest', 'trees', 'grass', 'water', 'ocean');
  }
  if (setting.includes('underwater') || setting.includes('ocean')) {
    envNegatives.push('forest', 'space', 'stars', 'land');
  }
  if (setting.includes('savannah')) {
    envNegatives.push('snow', 'ice', 'underwater');
  }

  // Add forbidden elements from card
  const cardForbidden = card.forbidden_elements?.slice(0, 3) || [];

  // Combine all negatives - human negatives FIRST for animal stories
  const allNegatives = [...humanNegatives, ...baseNegatives, ...envNegatives, ...cardForbidden];

  const result = Array.from(new Set(allNegatives)).join(', ');
  console.log(`[NEGATIVE PROMPT] isAnimal=${isAnimal}: ${result.substring(0, 100)}...`);
  return result;
}

/**
 * Generate consistent seed per page
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
