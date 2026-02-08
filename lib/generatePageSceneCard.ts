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

  // Build must_include: character + key objects + supporting characters
  const characterItem = `${bible.name} the ${bible.species || bible.character_type || 'character'} full body`;
  const must_include = [characterItem, ...keyObjects, ...supportingCharacters];

  return {
    page_number: pageNumber,
    scene_id: `page_${pageNumber}`,
    setting,
    time_weather: extractTimeWeather(lowerText),
    action: extractAction(lowerText, bible.name),
    must_include,
    must_not_include: forbiddenElements,
    supporting_characters: supportingCharacters,
    key_objects: keyObjects,
    mood: extractMood(lowerText),
    camera: {
      shot_type: keyObjects.length > 2 ? 'wide' : 'medium',
      composition_notes: 'Main character clearly visible'
    },
    // Legacy fields for backward compatibility
    main_action: extractAction(lowerText, bible.name),
    required_elements: [...keyObjects, ...supportingCharacters],
    forbidden_elements: forbiddenElements,
  };
}

/**
 * Extract setting from page text - looks for WHERE the scene takes place
 * Priority: "in/at/through [location]" phrases > general keywords
 */
function extractSetting(text: string): string {
  // PRIORITY 1: Look for explicit location phrases "in the X", "through the X", "at the X"
  const locationPhrases = [
    // Space/Moon - Priority (check these first for space adventures)
    { pattern: /(?:soared|flew|fly|flying)\s+(?:over|across)\s+(?:the\s+)?crater/i, setting: 'Rocket ship flying over moon crater in space' },
    { pattern: /(?:landed|landing)\s+(?:on|near|by)\s+(?:the\s+)?(?:other\s+side|crater)/i, setting: 'Moon surface near crater with rocket ship' },
    { pattern: /(?:blasted\s+off|blast\s+off|took\s+off|launched)/i, setting: 'Rocket ship blasting off into space' },
    { pattern: /crater/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /(?:in|through|into)\s+(?:outer\s+)?space/i, setting: 'Outer space with stars and planets' },
    { pattern: /(?:on|landed\s+on)\s+(?:the\s+)?(?:moon)/i, setting: 'Moon surface with craters' },
    { pattern: /(?:on|landed\s+on)\s+(?:the\s+)?(?:mars|planet)/i, setting: 'Alien planet surface' },

    // City/Town
    { pattern: /(?:in|through|around)\s+(?:the\s+)?(?:city|town|village|streets?)/i, setting: 'City streets with buildings' },
    { pattern: /(?:explored|walked|strolled)\s+(?:the\s+)?(?:city|town|streets?)/i, setting: 'City streets with buildings' },

    // Indoor
    { pattern: /(?:in|inside)\s+(?:the\s+)?(?:house|home|room|bedroom|kitchen)/i, setting: 'Cozy indoor room' },
    { pattern: /(?:in|inside)\s+(?:the\s+)?(?:castle|palace|throne)/i, setting: 'Castle interior' },
    { pattern: /(?:in|inside)\s+(?:the\s+)?(?:school|classroom)/i, setting: 'School classroom' },
    { pattern: /(?:in|inside|back\s+to)\s+(?:the\s+)?(?:rocket|spaceship|ship)/i, setting: 'Inside a rocket ship cockpit' },
    { pattern: /climbed\s+inside/i, setting: 'Inside a rocket ship cockpit' },

    // Nature
    { pattern: /(?:in|through|into)\s+(?:the\s+)?(?:forest|woods)/i, setting: 'Forest with tall trees' },
    { pattern: /(?:in|at|by)\s+(?:the\s+)?(?:meadow|field|garden)/i, setting: 'Beautiful meadow with flowers' },
    { pattern: /(?:in|at)\s+(?:the\s+)?(?:desert|dunes)/i, setting: 'Desert with sand dunes' },
    { pattern: /(?:on|at)\s+(?:the\s+)?(?:mountain|hill|cliff)/i, setting: 'Mountain landscape' },
    { pattern: /(?:at|on)\s+(?:the\s+)?(?:beach|shore)/i, setting: 'Beach with sand and waves' },

    // Water
    { pattern: /(?:under|beneath)\s+(?:the\s+)?(?:water|waves|sea|ocean)/i, setting: 'Underwater ocean scene' },
    { pattern: /(?:in|into)\s+(?:the\s+)?(?:ocean|sea|lake|river)/i, setting: 'By the water' },

    // Sky
    { pattern: /(?:in|through|across)\s+(?:the\s+)?(?:sky|clouds)/i, setting: 'High in the sky with clouds' },
    { pattern: /(?:flying|soaring)\s+(?:through|in)/i, setting: 'Flying through the sky' },
  ];

  // Check explicit location phrases first
  for (const { pattern, setting } of locationPhrases) {
    if (pattern.test(text)) {
      return setting;
    }
  }

  // PRIORITY 2: Keyword-based fallback (but with lower priority)
  const keywordPatterns = [
    { keywords: ['city', 'street', 'town', 'village'], setting: 'City or town scene' },
    { keywords: ['underwater', 'ocean floor', 'coral reef'], setting: 'Underwater ocean scene' },
    { keywords: ['outer space', 'cosmos', 'galaxy'], setting: 'Outer space with stars' },
    { keywords: ['forest', 'woods', 'trees'], setting: 'Forest scene' },
    { keywords: ['meadow', 'garden', 'flowers'], setting: 'Garden or meadow' },
    { keywords: ['desert', 'sand'], setting: 'Desert scene' },
    { keywords: ['mountain', 'cliff'], setting: 'Mountain scene' },
    { keywords: ['beach', 'shore', 'ocean'], setting: 'Beach scene' },
    { keywords: ['home', 'house', 'room'], setting: 'Indoor room' },
    { keywords: ['castle', 'palace'], setting: 'Castle scene' },
    { keywords: ['sky', 'clouds', 'flying'], setting: 'Sky scene' },
  ];

  for (const { keywords, setting } of keywordPatterns) {
    if (keywords.some(kw => text.includes(kw))) {
      return setting;
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
 * Also detects "X and Y" patterns for multiple main characters
 * Detects friend names like "Susu and Piku"
 */
function extractSupportingCharacters(text: string, mainCharName: string): string[] {
  const characters: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Check for "Name and Name" pattern (multiple main characters)
  const andPattern = new RegExp(`${mainCharName}\\s+and\\s+([A-Z][a-z]+)`, 'i');
  const andMatch = text.match(andPattern);
  if (andMatch) {
    characters.push(andMatch[1]); // Add the second character
  }

  // Check for friend names pattern: "Name and Name cheered/laughed/etc"
  // This catches "Susu and Piku cheered" style names
  const friendNamesPattern = /\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\s+(?:cheered|laughed|smiled|waved|played|watched|followed|joined|helped)/gi;
  let friendMatch;
  while ((friendMatch = friendNamesPattern.exec(text)) !== null) {
    const name1 = friendMatch[1];
    const name2 = friendMatch[2];
    if (name1.toLowerCase() !== mainLower && !characters.includes(name1)) {
      characters.push(name1);
    }
    if (name2.toLowerCase() !== mainLower && !characters.includes(name2)) {
      characters.push(name2);
    }
  }

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
 * Extract action from text - expanded list for space/adventure stories
 */
function extractAction(text: string, characterName: string): string {
  // Priority actions - more specific first
  const priorityActions = [
    { keywords: ['blasted off', 'blast off'], action: 'blasting off in rocket' },
    { keywords: ['soared over', 'soaring over'], action: 'soaring over' },
    { keywords: ['flew over', 'flying over'], action: 'flying over' },
    { keywords: ['landed safely', 'safe landing'], action: 'landing safely' },
    { keywords: ['climbed inside', 'climbing inside'], action: 'climbing inside' },
    { keywords: ['taking off', 'took off'], action: 'taking off' },
  ];

  for (const { keywords, action } of priorityActions) {
    if (keywords.some(kw => text.includes(kw))) {
      return `${characterName} ${action}`;
    }
  }

  // General actions
  const actions = [
    'flying', 'swimming', 'running', 'walking', 'jumping', 'dancing',
    'playing', 'exploring', 'climbing', 'sleeping', 'eating', 'reading',
    'laughing', 'smiling', 'waving', 'hugging', 'looking', 'standing',
    'soaring', 'blasting', 'landing', 'cheering', 'exclaiming', 'leading'
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
 * Extract mood from text
 */
function extractMood(text: string): string {
  if (text.includes('excit') || text.includes('thrill')) return 'excited, adventurous';
  if (text.includes('wonder') || text.includes('amaz')) return 'wonder, awe';
  if (text.includes('happy') || text.includes('joy') || text.includes('laugh')) return 'happy, playful';
  if (text.includes('curious') || text.includes('discover')) return 'curious, exploratory';
  if (text.includes('brave') || text.includes('courage')) return 'brave, determined';
  if (text.includes('friend') || text.includes('welcome')) return 'friendly, warm';
  return 'joyful, adventurous';
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
