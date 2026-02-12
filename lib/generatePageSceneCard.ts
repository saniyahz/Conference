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
    // BROAD matching — catch "reached the moon", "flew to the moon", "on the moon", "moon surface", etc.
    { pattern: /(?:soared|flew|fly|flying)\s+(?:over|across)\s+(?:the\s+)?crater/i, setting: 'Rocket ship flying over moon crater in space' },
    { pattern: /(?:landed|landing)\s+(?:on|near|by)\s+(?:the\s+)?(?:other\s+side|crater)/i, setting: 'Moon surface near crater with rocket ship' },
    { pattern: /(?:blasted\s+off|blast\s+off|took\s+off|launched)/i, setting: 'Rocket ship blasting off into space' },
    { pattern: /crater/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /(?:in|through|into)\s+(?:outer\s+)?space/i, setting: 'Outer space with stars and planets' },
    // Broad moon matching — "reached the moon", "flew to the moon", "arrived at the moon",
    // "on the moon", "landed on the moon", "moon surface", "moon rabbits"
    { pattern: /(?:reached|arrived\s+at|got\s+to|flew\s+to|traveled\s+to|journeyed\s+to|on|landed\s+on)\s+(?:the\s+)?moon/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /moon\s+(?:surface|rabbit|bunny|rock|dust|crater|landscape)/i, setting: 'Moon surface with craters and starry sky' },
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

    // Water — broad matching for splash, ocean, descending into water
    { pattern: /splash/i, setting: 'Ocean with big waves and water splash' },
    { pattern: /(?:toward|into|in)\s+(?:the\s+)?(?:ocean|sea|water)/i, setting: 'Ocean with big waves' },
    { pattern: /(?:under|beneath)\s+(?:the\s+)?(?:water|waves|sea|ocean)/i, setting: 'Underwater ocean scene' },
    { pattern: /(?:in|into)\s+(?:the\s+)?(?:lake|river)/i, setting: 'By the water' },

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

  // PRIORITY 2: Keyword-based fallback (broader than explicit patterns).
  // ORDER MATTERS — more specific keywords first to avoid false matches.
  const keywordPatterns = [
    // Space/Moon — BEFORE generic nature keywords (moon > night)
    { keywords: ['moon'], setting: 'Moon surface with craters and starry sky' },
    { keywords: ['outer space', 'cosmos', 'galaxy', 'stars and planets'], setting: 'Outer space with stars' },
    { keywords: ['rocket', 'spaceship'], setting: 'Rocket ship scene with bright sky' },
    // Water — specific before generic
    { keywords: ['underwater', 'ocean floor', 'coral reef'], setting: 'Underwater ocean scene' },
    { keywords: ['ocean', 'sea', 'waves'], setting: 'Ocean with waves' },
    { keywords: ['dolphin', 'dolphins'], setting: 'Ocean with waves and dolphins' },
    { keywords: ['beach', 'shore'], setting: 'Beach with sand and waves' },
    { keywords: ['lake', 'pond', 'river', 'stream'], setting: 'By the water' },
    // Land
    { keywords: ['city', 'street', 'town', 'village'], setting: 'City or town scene' },
    { keywords: ['forest', 'woods', 'trees'], setting: 'Forest scene' },
    { keywords: ['meadow', 'garden', 'flowers'], setting: 'Garden or meadow' },
    { keywords: ['desert', 'sand'], setting: 'Desert scene' },
    { keywords: ['mountain', 'cliff'], setting: 'Mountain scene' },
    // Indoor
    { keywords: ['home', 'house', 'room'], setting: 'Indoor room' },
    { keywords: ['castle', 'palace'], setting: 'Castle scene' },
    // Sky
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
 * Uses word-boundary matching to avoid false positives
 * (e.g., "spaceship" should NOT match "ship" → "boat")
 */
function extractKeyObjects(text: string): string[] {
  const objects: string[] = [];

  const objectPatterns = [
    // Vehicles — use specific patterns to avoid cross-matching
    // "spaceship" should match "rocket ship" NOT "boat"
    { pattern: /\b(?:rocket|spaceship)\b/, name: 'rocket ship' },
    { pattern: /\b(?:boat|sailboat)\b/, name: 'boat' },
    { pattern: /\b(?:car|truck|bus)\b/, name: 'vehicle' },
    { pattern: /\b(?:airplane|plane)\b/, name: 'airplane' },
    { pattern: /\bballoon\b/, name: 'balloon' },

    // Nature
    { pattern: /\brainbow\b/, name: 'rainbow' },
    { pattern: /\bwaterfall\b/, name: 'waterfall' },
    { pattern: /\b(?:river|stream)\b/, name: 'river' },

    // Items — require exact word boundaries
    { pattern: /\btreasure\b/, name: 'treasure chest' },
    { pattern: /\bcrown\b/, name: 'crown' },
    { pattern: /\bmagic wand\b|\bwand\b(?!er)/, name: 'magic wand' },
    { pattern: /\btelescope\b/, name: 'telescope' },
    { pattern: /\bhelmet\b/, name: 'helmet' },

    // NOTE: Celestial objects (moon, stars, planets, sun) are NOT extracted here.
    // They are SETTINGS, not objects. They're handled by extractSetting() and
    // go into the plate prompt via the setting text. Extracting them as key_objects
    // pollutes every page of a space story with "moon" and "stars", which BLIP
    // captions rarely mention, causing Gate 5C to reject valid images.
  ];

  for (const { pattern, name } of objectPatterns) {
    if (pattern.test(text)) {
      objects.push(name);
    }
  }

  return objects.slice(0, 4); // Max 4 objects
}

/**
 * Extract supporting characters from text.
 * Only extracts SPECIFIC visual actors (animals/creatures) — not generic
 * terms like "friends" or "family" which are not drawable.
 */
function extractSupportingCharacters(text: string, mainCharName: string): string[] {
  const characters: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Only look for specific animal/creature keyword patterns.
  // "friends" and "family" are NOT visual actors — they don't trigger Mode B.
  const characterPatterns = [
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

    // Specific character types (only when explicitly mentioned)
    { keywords: ['lion', 'lions'], name: 'lions' },
  ];

  for (const pattern of characterPatterns) {
    // Don't add if it's the main character's species
    if (mainLower.includes(pattern.keywords[0])) continue;

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
