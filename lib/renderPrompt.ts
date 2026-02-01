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
  if (text.includes('soared through') || text.includes('through the galaxy') || text.includes('through space') || text.includes('through the stars') || text.includes('flying through')) {
    return 'Rocket ship flying through colorful outer space with stars and planets';
  }
  if (text.includes('outer space') || text.includes('in space') || text.includes('into space') || text.includes('galaxy')) {
    return 'Outer space with colorful nebulas, stars, and planets';
  }

  // NATURE
  if (text.includes('waterfall')) {
    return 'Magical waterfall in lush forest with sparkling water';
  }
  if (text.includes('stream') || text.includes('river') || text.includes('creek')) {
    return 'Peaceful stream in nature with rocks and greenery';
  }
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

  // CAVES & UNDERGROUND (check BEFORE "cozy" since "cozy cave" exists)
  if (text.includes('cave') || text.includes('cavern') || text.includes('crevice') || text.includes('chasm')) {
    if (text.includes('moon') || text.includes('lunar')) {
      return 'Dark moon cave with rocky walls and glowing crystals';
    }
    return 'Magical cave with rocky walls and soft glowing light';
  }

  // INDOOR
  if (text.includes('home') || text.includes('house') || text.includes('bedroom')) {
    return 'Cozy home interior with warm lighting';
  }
  if (text.includes('castle') || text.includes('palace') || text.includes('throne')) {
    return 'Magical castle interior';
  }
  if (text.includes('cozy') && !text.includes('cave')) {
    return 'Cozy interior with warm lighting';
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

  // Animal characters - supporting cast
  const animalMap: Record<string, string> = {
    // Common pets
    'dog': 'cute cartoon dog',
    'puppy': 'cute cartoon puppy',
    'cat': 'cute cartoon cat',
    'kitten': 'cute cartoon kitten',
    // Forest animals
    'rabbit': 'cute cartoon rabbit',
    'rabbits': 'cute cartoon rabbits',
    'bunny': 'cute cartoon bunny',
    'bunnies': 'cute cartoon bunnies',
    'squirrel': 'friendly cartoon squirrel',
    'squirrels': 'friendly cartoon squirrels',
    'owl': 'wise cartoon owl',
    'owls': 'wise cartoon owls',
    'deer': 'gentle cartoon deer',
    'fox': 'friendly cartoon fox',
    'bear': 'friendly cartoon bear',
    'wolf': 'friendly cartoon wolf',
    'mouse': 'tiny cartoon mouse',
    'mice': 'tiny cartoon mice',
    'raccoon': 'cute cartoon raccoon',
    'hedgehog': 'cute cartoon hedgehog',
    'porcupine': 'cute cartoon porcupine',
    'beaver': 'friendly cartoon beaver',
    // Birds
    'bird': 'colorful cartoon birds',
    'birds': 'colorful cartoon birds',
    'butterfly': 'beautiful cartoon butterflies',
    'butterflies': 'beautiful cartoon butterflies',
    'parrot': 'colorful cartoon parrot',
    // Sea animals
    'fish': 'colorful cartoon fish',
    'dolphin': 'playful cartoon dolphin',
    'dolphins': 'playful cartoon dolphins',
    'turtle': 'gentle cartoon turtle',
    'whale': 'friendly cartoon whale',
    'seal': 'cute cartoon seal',
    'otter': 'playful cartoon otter',
    // Pond animals
    'frog': 'happy cartoon frog',
    'duck': 'cute cartoon duck',
    // Fantasy
    'alien': 'friendly cartoon aliens',
    'aliens': 'friendly cartoon aliens',
    'robot': 'friendly cartoon robot',
    'dragon': 'friendly cartoon dragon',
    'unicorn': 'magical cartoon unicorn',
    'fairy': 'tiny cartoon fairies',
    'fairies': 'tiny cartoon fairies',
    // Farm animals
    'pig': 'cute cartoon pig',
    'horse': 'friendly cartoon horse',
    'pony': 'cute cartoon pony',
    'cow': 'friendly cartoon cow',
    'sheep': 'fluffy cartoon sheep',
    'chicken': 'cute cartoon chicken',
    // Exotic
    'monkey': 'playful cartoon monkey',
    'panda': 'cute cartoon panda',
    'koala': 'cuddly cartoon koala',
    'giraffe': 'friendly cartoon giraffe',
    'elephant': 'gentle cartoon elephant',
    'lion': 'friendly cartoon lion',
    'tiger': 'friendly cartoon tiger',
    'penguin': 'cute cartoon penguin',
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
