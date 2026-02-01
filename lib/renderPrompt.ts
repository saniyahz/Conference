import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * UNIVERSAL PROMPT TEMPLATE
 * Disney/Pixar animated style
 * Extracts scene and characters DIRECTLY from page text
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  const text = pageText || '';
  const lowerText = text.toLowerCase();

  // 1. SCENE - Extract directly from page text
  const scene = extractSceneFromText(lowerText, card.setting);

  // 2. MAIN CHARACTER - from bible
  const mainChar = buildMainCharacter(bible);

  // 3. SUPPORTING CHARACTERS - extract from page text
  const supporting = extractSupportingFromText(lowerText, bible.name);

  // 4. KEY OBJECTS - extract from page text
  const objects = extractObjectsFromText(lowerText);

  // 5. STYLE - Disney/Pixar animated style (short!)
  const style = "Disney Pixar 3D animated, cute, vibrant colors.";

  // Build prompt - SDXL only uses first ~77 tokens, keep it SHORT
  let prompt = `${scene}. ${mainChar}`;
  if (supporting) prompt += ` ${supporting}`;
  if (objects) prompt += ` ${objects}`;
  prompt += ` ${style}`;

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt}`);
  return prompt;
}

/**
 * Extract scene/setting directly from page text
 * Looks for location keywords and builds appropriate scene description
 */
function extractSceneFromText(text: string, fallbackSetting: string): string {
  // SPACE / CELESTIAL
  if (text.includes('moon surface') || text.includes('on the moon') || text.includes('lunar surface')) {
    return 'Moon surface with craters, Earth visible in black starry sky';
  }
  if (text.includes('exploring the moon') || text.includes('walked on the moon') || text.includes('stepped on the moon')) {
    return 'Moon surface with craters and rocks, starry space background';
  }
  if (text.includes('landed on the moon') || text.includes('arriving at the moon')) {
    return 'Rocket ship landed on moon surface with craters';
  }
  if (text.includes('mars') || text.includes('red planet')) {
    return 'Mars surface with red rocks and dusty terrain';
  }
  if (text.includes('through space') || text.includes('through the stars') || text.includes('flying through')) {
    return 'Rocket ship flying through colorful outer space with stars and planets';
  }
  if (text.includes('outer space') || text.includes('in space') || text.includes('into space')) {
    return 'Outer space with colorful nebulas, stars, and planets';
  }

  // NATURE
  if (text.includes('forest') || text.includes('woods') || text.includes('trees')) {
    return 'Magical forest with tall trees and dappled sunlight';
  }
  if (text.includes('meadow') || text.includes('field of flowers') || text.includes('garden')) {
    return 'Beautiful meadow with colorful flowers';
  }
  if (text.includes('ocean') || text.includes('sea') || text.includes('underwater')) {
    return 'Underwater ocean scene with coral and fish';
  }
  if (text.includes('beach') || text.includes('shore') || text.includes('sand')) {
    return 'Sunny beach with sand and gentle waves';
  }
  if (text.includes('mountain') || text.includes('hill') || text.includes('cliff')) {
    return 'Mountain landscape with scenic views';
  }

  // INDOOR
  if (text.includes('home') || text.includes('house') || text.includes('bedroom') || text.includes('cozy')) {
    return 'Cozy home interior with warm lighting';
  }
  if (text.includes('castle') || text.includes('palace') || text.includes('throne')) {
    return 'Magical castle interior';
  }

  // VEHICLES
  if (text.includes('rocket') || text.includes('spaceship')) {
    if (text.includes('inside') || text.includes('cockpit')) {
      return 'Inside a rocket ship cockpit with controls and windows showing space';
    }
    return 'Rocket ship in colorful outer space';
  }

  // WEATHER/TIME
  if (text.includes('sunset') || text.includes('evening')) {
    return fallbackSetting + ' at golden sunset';
  }
  if (text.includes('night') || text.includes('starry')) {
    return fallbackSetting + ' under starry night sky';
  }

  return fallbackSetting;
}

/**
 * Build main character description from bible
 */
function buildMainCharacter(bible: CharacterBible): string {
  const name = bible.name;

  if (bible.character_type === 'animal' && bible.species) {
    const fur = bible.appearance.skin_tone || 'soft fur';
    return `${name} the cute cartoon ${bible.species} with ${fur}, big expressive eyes`;
  }

  // Human character
  return `${name}, cute cartoon child with friendly face, big expressive eyes`;
}

/**
 * Extract supporting characters from page text
 */
function extractSupportingFromText(text: string, mainCharName: string): string {
  const found: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Animal characters
  const animalMap: Record<string, string> = {
    'rabbit': 'cute rabbits',
    'rabbits': 'cute rabbits',
    'bunny': 'cute bunnies',
    'bunnies': 'cute bunnies',
    'squirrel': 'friendly squirrels',
    'squirrels': 'friendly squirrels',
    'owl': 'wise owl',
    'owls': 'wise owls',
    'bird': 'colorful birds',
    'birds': 'colorful birds',
    'butterfly': 'beautiful butterflies',
    'butterflies': 'beautiful butterflies',
    'deer': 'gentle deer',
    'fox': 'friendly fox',
    'bear': 'friendly bear',
    'mouse': 'tiny mouse',
    'mice': 'tiny mice',
    'fish': 'colorful fish',
    'dolphin': 'playful dolphins',
    'dolphins': 'playful dolphins',
    'turtle': 'gentle turtle',
    'frog': 'happy frog',
    'alien': 'friendly aliens',
    'aliens': 'friendly aliens',
    'robot': 'friendly robot',
    'dragon': 'friendly dragon',
    'unicorn': 'magical unicorn',
    'fairy': 'tiny fairies',
    'fairies': 'tiny fairies',
  };

  for (const [keyword, description] of Object.entries(animalMap)) {
    // Don't include if it's the main character
    if (mainLower.includes(keyword)) continue;
    if (text.includes(keyword)) {
      found.push(description);
    }
  }

  // People
  if (text.includes('friend') && !found.includes('friends')) found.push('friends');
  if (text.includes('family') || text.includes('parent') || text.includes('mother') || text.includes('father')) {
    found.push('family members');
  }

  if (found.length === 0) return '';
  return `Also showing: ${[...new Set(found)].slice(0, 3).join(', ')}.`;
}

/**
 * Extract key objects from page text
 */
function extractObjectsFromText(text: string): string {
  const found: string[] = [];

  const objectMap: Record<string, string> = {
    'rocket': 'rocket ship',
    'spaceship': 'spaceship',
    'telescope': 'telescope',
    'star': 'twinkling stars',
    'planet': 'colorful planets',
    'moon': 'glowing moon',
    'treasure': 'treasure chest',
    'crown': 'golden crown',
    'wand': 'magic wand',
    'rainbow': 'rainbow',
    'balloon': 'colorful balloons',
    'cake': 'birthday cake',
    'present': 'wrapped presents',
    'book': 'magical book',
    'map': 'treasure map',
  };

  for (const [keyword, description] of Object.entries(objectMap)) {
    if (text.includes(keyword)) {
      found.push(description);
    }
  }

  if (found.length === 0) return '';
  return `With ${[...new Set(found)].slice(0, 2).join(' and ')}.`;
}


/**
 * Negative prompt - excludes humans for animal stories, realistic style always
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean): string {
  let base = "text, watermark, logo, photorealistic, realistic, photograph";

  // Always exclude humans for animal-only stories
  if (isAnimal) {
    base += ", human, person, boy, girl, child, man, woman";
  }

  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    return `${base}, ${card.forbidden_elements.slice(0, 5).join(', ')}`;
  }

  return base;
}

export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
