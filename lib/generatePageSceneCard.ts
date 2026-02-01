import { PageSceneCard, CharacterBible } from "./visual-types";

/**
 * Generate a Page Scene Card from page text
 * GENERIC - extracts info directly from text, no hardcoded scenarios
 */
export function generatePageSceneCard(
  pageText: string,
  pageNumber: number,
  bible: CharacterBible,
  previousSceneCards: PageSceneCard[] = []
): PageSceneCard {
  const lowerText = pageText.toLowerCase();

  // Extract setting from the text
  const setting = extractSetting(lowerText);

  // Extract key objects mentioned in the text
  const keyObjects = extractKeyObjects(lowerText);

  // Extract supporting characters
  const supportingCharacters = extractSupportingCharacters(lowerText, bible.name);

  // Build forbidden elements based on what's NOT in this scene
  const forbiddenElements = buildForbiddenElements(lowerText);

  return {
    page_number: pageNumber,
    scene_id: `page_${pageNumber}`,
    setting,
    time_weather: extractTimeWeather(lowerText),
    main_action: extractAction(lowerText, bible.name),
    supporting_characters: supportingCharacters,
    key_objects: keyObjects,
    required_elements: [...keyObjects, ...supportingCharacters],
    forbidden_elements: forbiddenElements,
    camera: {
      shot_type: keyObjects.length > 2 ? 'wide' : 'medium',
      composition_notes: 'Main character clearly visible'
    }
  };
}

/**
 * Extract setting from page text - GENERIC approach
 * Looks for location/environment phrases
 */
function extractSetting(text: string): string {
  // Location patterns to look for
  const locationPatterns = [
    // Space
    { keywords: ['outer space', 'through space', 'in space', 'cosmos', 'among the stars'], setting: 'Outer space with stars and planets' },
    { keywords: ['rocket ship', 'spaceship', 'cockpit'], setting: 'Inside a rocket ship' },
    { keywords: ['moon surface', 'on the moon', 'lunar'], setting: 'Moon surface with craters' },
    { keywords: ['mars', 'red planet'], setting: 'Mars surface, red terrain' },

    // Water
    { keywords: ['underwater', 'beneath the waves', 'ocean floor'], setting: 'Underwater ocean scene' },
    { keywords: ['ocean', 'sea', 'beach'], setting: 'Ocean or beach scene' },

    // Nature
    { keywords: ['forest', 'woods', 'trees'], setting: 'Forest with trees' },
    { keywords: ['meadow', 'field', 'grassland'], setting: 'Open meadow with grass and flowers' },
    { keywords: ['garden', 'flowers'], setting: 'Beautiful garden' },
    { keywords: ['desert', 'sand dunes', 'sandy'], setting: 'Desert with sand dunes' },
    { keywords: ['mountain', 'cliff', 'peak'], setting: 'Mountain landscape' },
    { keywords: ['jungle', 'rainforest'], setting: 'Jungle setting' },

    // Indoor/Urban
    { keywords: ['home', 'house', 'room', 'bedroom', 'kitchen'], setting: 'Cozy indoor room' },
    { keywords: ['castle', 'palace', 'throne'], setting: 'Castle interior' },
    { keywords: ['village', 'town', 'street'], setting: 'Village or town' },
    { keywords: ['school', 'classroom'], setting: 'School classroom' },

    // Sky
    { keywords: ['sky', 'clouds', 'flying', 'soaring'], setting: 'High in the sky with clouds' },
  ];

  // Find the first matching pattern
  for (const pattern of locationPatterns) {
    if (pattern.keywords.some(kw => text.includes(kw))) {
      return pattern.setting;
    }
  }

  // Default
  return 'Storybook scene';
}

/**
 * Extract key objects from text - GENERIC
 */
function extractKeyObjects(text: string): string[] {
  const objects: string[] = [];

  const objectPatterns = [
    // Vehicles
    { keywords: ['rocket', 'spaceship'], name: 'rocket ship' },
    { keywords: ['boat', 'ship', 'sailboat'], name: 'boat' },
    { keywords: ['car', 'truck', 'bus'], name: 'vehicle' },
    { keywords: ['airplane', 'plane'], name: 'airplane' },
    { keywords: ['balloon'], name: 'balloon' },

    // Nature
    { keywords: ['rainbow'], name: 'rainbow' },
    { keywords: ['waterfall'], name: 'waterfall' },
    { keywords: ['river', 'stream'], name: 'river' },

    // Items
    { keywords: ['treasure', 'chest'], name: 'treasure chest' },
    { keywords: ['crown'], name: 'crown' },
    { keywords: ['wand', 'magic wand'], name: 'magic wand' },
    { keywords: ['book'], name: 'book' },
    { keywords: ['map'], name: 'map' },
    { keywords: ['telescope'], name: 'telescope' },
    { keywords: ['helmet'], name: 'helmet' },

    // Celestial
    { keywords: ['moon'], name: 'moon' },
    { keywords: ['star', 'stars'], name: 'stars' },
    { keywords: ['planet', 'planets'], name: 'planets' },
    { keywords: ['sun'], name: 'sun' },
  ];

  for (const pattern of objectPatterns) {
    if (pattern.keywords.some(kw => text.includes(kw))) {
      objects.push(pattern.name);
    }
  }

  return objects.slice(0, 4); // Max 4 objects
}

/**
 * Extract supporting characters from text
 */
function extractSupportingCharacters(text: string, mainCharName: string): string[] {
  const characters: string[] = [];

  const characterPatterns = [
    { keywords: ['friend', 'friends'], name: 'friends' },
    { keywords: ['family', 'parent', 'mother', 'father', 'mom', 'dad'], name: 'family' },

    // Animals
    { keywords: ['dog', 'puppy'], name: 'dog' },
    { keywords: ['cat', 'kitten'], name: 'cat' },
    { keywords: ['bird', 'birds'], name: 'birds' },
    { keywords: ['rabbit', 'bunny'], name: 'rabbit' },
    { keywords: ['bear'], name: 'bear' },
    { keywords: ['fox'], name: 'fox' },
    { keywords: ['owl'], name: 'owl' },
    { keywords: ['butterfly', 'butterflies'], name: 'butterflies' },

    // Sea creatures
    { keywords: ['fish'], name: 'fish' },
    { keywords: ['dolphin'], name: 'dolphins' },
    { keywords: ['whale'], name: 'whale' },
    { keywords: ['shark'], name: 'shark' },
    { keywords: ['turtle'], name: 'turtle' },
    { keywords: ['octopus'], name: 'octopus' },

    // Fantasy
    { keywords: ['dragon'], name: 'dragon' },
    { keywords: ['unicorn'], name: 'unicorn' },
    { keywords: ['fairy', 'fairies'], name: 'fairies' },
    { keywords: ['alien', 'aliens'], name: 'aliens' },
    { keywords: ['robot'], name: 'robot' },
  ];

  for (const pattern of characterPatterns) {
    // Don't add if it's the main character
    if (mainCharName.toLowerCase().includes(pattern.keywords[0])) continue;

    if (pattern.keywords.some(kw => text.includes(kw))) {
      characters.push(pattern.name);
    }
  }

  return characters.slice(0, 3); // Max 3 supporting characters
}

/**
 * Extract time/weather from text
 */
function extractTimeWeather(text: string): string {
  if (text.includes('night') || text.includes('dark') || text.includes('moon')) return 'nighttime';
  if (text.includes('morning') || text.includes('sunrise') || text.includes('dawn')) return 'morning';
  if (text.includes('sunset') || text.includes('evening') || text.includes('dusk')) return 'sunset';
  if (text.includes('rain') || text.includes('storm')) return 'rainy';
  if (text.includes('snow') || text.includes('winter')) return 'snowy';
  return 'daytime';
}

/**
 * Extract action from text
 */
function extractAction(text: string, characterName: string): string {
  const actions = [
    'flying', 'swimming', 'running', 'walking', 'jumping', 'dancing',
    'playing', 'exploring', 'climbing', 'sleeping', 'eating', 'reading',
    'laughing', 'smiling', 'waving', 'hugging', 'looking', 'standing'
  ];

  for (const action of actions) {
    if (text.includes(action)) {
      return `${characterName} ${action}`;
    }
  }

  return `${characterName} in the scene`;
}

/**
 * Build forbidden elements - exclude things NOT in this scene
 */
function buildForbiddenElements(text: string): string[] {
  const forbidden: string[] = [];

  // If in space, forbid earth elements
  if (text.includes('space') || text.includes('cosmos') || text.includes('rocket')) {
    if (!text.includes('forest')) forbidden.push('forest', 'trees');
    if (!text.includes('ocean')) forbidden.push('ocean', 'water');
  }

  // If underwater, forbid land elements
  if (text.includes('underwater') || text.includes('ocean')) {
    forbidden.push('forest', 'trees', 'buildings');
  }

  // If forest/land, forbid space elements
  if (text.includes('forest') || text.includes('meadow') || text.includes('garden')) {
    forbidden.push('space', 'planets', 'rockets');
  }

  return forbidden;
}

/**
 * Generate all scene cards for a story
 */
export function generateAllSceneCards(
  pages: { text: string }[],
  bible: CharacterBible
): PageSceneCard[] {
  const sceneCards: PageSceneCard[] = [];

  for (let i = 0; i < pages.length; i++) {
    const card = generatePageSceneCard(
      pages[i].text,
      i + 1,
      bible,
      sceneCards
    );
    sceneCards.push(card);
  }

  return sceneCards;
}
