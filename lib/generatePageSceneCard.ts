import { PageSceneCard, CharacterBible } from "./visual-types";

/**
 * ENHANCED Page Scene Card Generator
 *
 * Improvements:
 * 1. Better action extraction with emotional context
 * 2. More detailed setting detection
 * 3. Improved supporting character extraction
 * 4. Better forbidden element logic
 */
export function generatePageSceneCard(
  pageText: string,
  pageNumber: number,
  bible: CharacterBible,
  previousSceneCards: PageSceneCard[] = []
): PageSceneCard {
  const lowerText = pageText.toLowerCase();

  // Extract setting from the text
  const setting = extractSetting(lowerText, pageText);

  // Extract key objects mentioned in the text
  const keyObjects = extractKeyObjects(lowerText);

  // Extract supporting characters (with named character detection)
  const supportingCharacters = extractSupportingCharacters(pageText, bible.name);

  // Build forbidden elements based on the scene type
  const forbiddenElements = buildForbiddenElements(lowerText, setting);

  // Determine shot type based on scene complexity
  const shotType = determineShotType(lowerText, keyObjects.length);

  return {
    page_number: pageNumber,
    scene_id: `page_${pageNumber}`,
    setting,
    time_weather: extractTimeWeather(lowerText),
    main_action: extractAction(lowerText, bible.name),
    supporting_characters: supportingCharacters,
    key_objects: keyObjects,
    required_elements: [...keyObjects.slice(0, 3), ...supportingCharacters.slice(0, 2)],
    forbidden_elements: forbiddenElements,
    camera: {
      shot_type: shotType,
      composition_notes: generateCompositionNotes(lowerText, shotType)
    }
  };
}

/**
 * Extract setting from page text - Enhanced with better location detection
 */
function extractSetting(text: string, originalText: string): string {
  // PRIORITY 1: SPACE/CELESTIAL scenes
  const spacePatterns = [
    { pattern: /(?:soared|flew|flying)\s+(?:over|across)\s+(?:the\s+)?(?:crater|moon)/i, setting: 'Rocket ship interior viewing moon craters below' },
    { pattern: /(?:landed|landing)\s+(?:on|near|by|safely)/i, setting: 'Moon surface with rocket ship landed' },
    { pattern: /(?:blasted\s+off|blast\s+off|took\s+off|launched|rocketed)/i, setting: 'Rocket ship cockpit during launch' },
    { pattern: /crater|lunar/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /(?:walked|stepped|bounced)\s+(?:on\s+)?(?:the\s+)?moon/i, setting: 'Moon surface exploration' },
    { pattern: /(?:in|through|into)\s+(?:outer\s+)?space/i, setting: 'Outer space with stars and planets' },
    { pattern: /stars?\s+and\s+planets?|planets?\s+and\s+stars?/i, setting: 'Colorful outer space scene' },
    { pattern: /looking\s+(?:at|up\s+at)\s+(?:the\s+)?(?:earth|stars|planets)/i, setting: 'Space view with celestial objects' },
  ];

  for (const { pattern, setting } of spacePatterns) {
    if (pattern.test(text)) {
      return setting;
    }
  }

  // PRIORITY 2: VEHICLE INTERIOR scenes
  if (text.includes('rocket') || text.includes('spaceship')) {
    if (text.includes('inside') || text.includes('cockpit') || text.includes('climbed') || text.includes('window') || text.includes('buttons')) {
      return 'Inside colorful rocket ship cockpit';
    }
    if (text.includes('next to') || text.includes('beside') || text.includes('in front')) {
      return 'Standing by rocket ship on launch pad';
    }
  }

  // PRIORITY 3: NATURE scenes
  const naturePatterns = [
    { pattern: /magical\s+forest|enchanted\s+(?:forest|woods)/i, setting: 'Magical enchanted forest with glowing elements' },
    { pattern: /(?:deep|dark|tall)\s+(?:forest|woods)/i, setting: 'Deep forest with tall trees' },
    { pattern: /forest|woods|trees/i, setting: 'Green forest with friendly trees' },
    { pattern: /meadow|field\s+of\s+flowers/i, setting: 'Colorful flower meadow' },
    { pattern: /garden/i, setting: 'Beautiful garden with flowers' },
    { pattern: /waterfall/i, setting: 'Magical waterfall scene' },
    { pattern: /river|stream|creek|brook/i, setting: 'Peaceful stream in nature' },
    { pattern: /mountain|hilltop|cliff/i, setting: 'Mountain landscape' },
    { pattern: /jungle|rainforest/i, setting: 'Lush tropical jungle' },
  ];

  for (const { pattern, setting } of naturePatterns) {
    if (pattern.test(text)) {
      return setting;
    }
  }

  // PRIORITY 4: WATER scenes
  const waterPatterns = [
    { pattern: /underwater|beneath\s+the\s+(?:water|waves|sea)/i, setting: 'Magical underwater world with coral' },
    { pattern: /ocean\s+floor|sea\s+floor/i, setting: 'Deep ocean floor with marine life' },
    { pattern: /coral\s+reef/i, setting: 'Colorful coral reef underwater' },
    { pattern: /beach|shore|seaside/i, setting: 'Sunny beach with sand and waves' },
    { pattern: /ocean|sea(?!\s*son)/i, setting: 'Ocean seascape' },
    { pattern: /lake|pond/i, setting: 'Peaceful lake scene' },
  ];

  for (const { pattern, setting } of waterPatterns) {
    if (pattern.test(text)) {
      return setting;
    }
  }

  // PRIORITY 5: INDOOR scenes
  const indoorPatterns = [
    { pattern: /bedroom|bed/i, setting: 'Cozy bedroom interior' },
    { pattern: /kitchen/i, setting: 'Warm kitchen interior' },
    { pattern: /living\s+room/i, setting: 'Cozy living room' },
    { pattern: /(?:at\s+)?home|house/i, setting: 'Cozy home interior' },
    { pattern: /castle|palace|throne/i, setting: 'Magical castle interior' },
    { pattern: /school|classroom/i, setting: 'Colorful classroom' },
    { pattern: /library/i, setting: 'Cozy library with books' },
  ];

  for (const { pattern, setting } of indoorPatterns) {
    if (pattern.test(text)) {
      return setting;
    }
  }

  // PRIORITY 6: SKY scenes
  if (text.includes('flying') || text.includes('sky') || text.includes('clouds')) {
    if (text.includes('night')) {
      return 'Night sky with stars and moon';
    }
    return 'Bright sky with fluffy clouds';
  }

  // PRIORITY 7: SPECIAL locations
  const specialPatterns = [
    { pattern: /cave|cavern/i, setting: 'Magical cave with glowing crystals' },
    { pattern: /island/i, setting: 'Tropical island paradise' },
    { pattern: /desert|sand\s+dune/i, setting: 'Golden desert landscape' },
    { pattern: /village|town/i, setting: 'Friendly village scene' },
    { pattern: /city|street/i, setting: 'Colorful city street' },
    { pattern: /bakery|shop|store/i, setting: 'Cozy shop interior' },
  ];

  for (const { pattern, setting } of specialPatterns) {
    if (pattern.test(text)) {
      return setting;
    }
  }

  // Default based on story intro/ending
  if (text.includes('once upon') || text.includes('there was') || text.includes('lived')) {
    return 'Cozy storybook home setting';
  }
  if (text.includes('the end') || text.includes('happily ever')) {
    return 'Warm celebratory scene';
  }

  return 'Magical storybook scene';
}

/**
 * Extract key objects from text - Enhanced list
 */
function extractKeyObjects(text: string): string[] {
  const objects: string[] = [];

  const objectPatterns = [
    // Vehicles
    { keywords: ['rocket', 'spaceship'], name: 'rocket ship' },
    { keywords: ['boat', 'sailboat'], name: 'boat' },
    { keywords: ['airplane', 'plane'], name: 'airplane' },
    { keywords: ['hot air balloon'], name: 'hot air balloon' },
    { keywords: ['car', 'truck'], name: 'vehicle' },
    { keywords: ['bicycle', 'bike'], name: 'bicycle' },

    // Celestial
    { keywords: ['moon'], name: 'moon' },
    { keywords: ['stars', 'star'], name: 'stars' },
    { keywords: ['planets', 'planet'], name: 'planets' },
    { keywords: ['earth'], name: 'Earth' },
    { keywords: ['sun'], name: 'sun' },
    { keywords: ['rainbow'], name: 'rainbow' },

    // Nature
    { keywords: ['flowers', 'flower'], name: 'flowers' },
    { keywords: ['tree'], name: 'trees' },
    { keywords: ['waterfall'], name: 'waterfall' },
    { keywords: ['river', 'stream'], name: 'flowing water' },
    { keywords: ['mountain'], name: 'mountains' },

    // Items
    { keywords: ['treasure', 'chest'], name: 'treasure chest' },
    { keywords: ['crown'], name: 'golden crown' },
    { keywords: ['wand', 'magic wand'], name: 'magic wand' },
    { keywords: ['book'], name: 'book' },
    { keywords: ['map'], name: 'map' },
    { keywords: ['telescope'], name: 'telescope' },
    { keywords: ['helmet', 'space helmet'], name: 'helmet' },
    { keywords: ['key'], name: 'key' },
    { keywords: ['ball'], name: 'ball' },
    { keywords: ['balloon'], name: 'balloons' },
    { keywords: ['cake'], name: 'cake' },
    { keywords: ['present', 'gift'], name: 'presents' },
  ];

  for (const pattern of objectPatterns) {
    if (pattern.keywords.some(kw => text.includes(kw))) {
      if (!objects.includes(pattern.name)) {
        objects.push(pattern.name);
      }
    }
  }

  return objects.slice(0, 4);
}

/**
 * Extract supporting characters - Enhanced with named character detection
 */
function extractSupportingCharacters(text: string, mainCharName: string): string[] {
  const characters: string[] = [];
  const mainLower = mainCharName.toLowerCase();
  const lowerText = text.toLowerCase();

  // Pattern 1: "Name the Animal" format
  const namedAnimalRegex = /\b([A-Z][a-z]+)\s+the\s+(\w+)/g;
  let match;
  while ((match = namedAnimalRegex.exec(text)) !== null) {
    const name = match[1];
    const type = match[2].toLowerCase();
    if (name.toLowerCase() !== mainLower) {
      characters.push(`${name} the ${type}`);
    }
  }

  // Pattern 2: "Name and Name" format (friends)
  const friendsRegex = /\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\b/g;
  while ((match = friendsRegex.exec(text)) !== null) {
    const name1 = match[1];
    const name2 = match[2];
    const skipWords = ['The', 'And', 'But', 'His', 'Her', 'They', 'With', 'Once', 'Then', 'Soon', 'But', 'For'];

    if (!skipWords.includes(name1) && name1.toLowerCase() !== mainLower) {
      if (!characters.some(c => c.includes(name1))) {
        characters.push(name1);
      }
    }
    if (!skipWords.includes(name2) && name2.toLowerCase() !== mainLower) {
      if (!characters.some(c => c.includes(name2))) {
        characters.push(name2);
      }
    }
  }

  // Pattern 3: Generic characters
  const genericCharacters = [
    { keywords: ['friend', 'friends'], name: 'friends' },
    { keywords: ['family', 'parent', 'mother', 'father', 'mom', 'dad'], name: 'family' },
    { keywords: ['brother', 'sister'], name: 'sibling' },
  ];

  for (const pattern of genericCharacters) {
    if (pattern.keywords.some(kw => lowerText.includes(kw)) && characters.length === 0) {
      characters.push(pattern.name);
    }
  }

  return characters.slice(0, 3);
}

/**
 * Extract time/weather from text
 */
function extractTimeWeather(text: string): string {
  // Time of day
  if (text.includes('night') || text.includes('dark') || text.includes('midnight')) return 'nighttime';
  if (text.includes('morning') || text.includes('sunrise') || text.includes('dawn')) return 'morning';
  if (text.includes('sunset') || text.includes('evening') || text.includes('dusk')) return 'sunset';
  if (text.includes('afternoon')) return 'afternoon';

  // Weather
  if (text.includes('rain') || text.includes('storm') || text.includes('thunder')) return 'rainy';
  if (text.includes('snow') || text.includes('winter') || text.includes('cold')) return 'snowy';
  if (text.includes('sunny') || text.includes('bright')) return 'sunny';
  if (text.includes('cloudy') || text.includes('overcast')) return 'cloudy';

  // Space (no traditional time/weather)
  if (text.includes('space') || text.includes('moon') || text.includes('star')) return 'space';

  return 'daytime';
}

/**
 * Extract main action from text - Enhanced with emotional context
 */
function extractAction(text: string, characterName: string): string {
  // Priority actions - most specific first
  const priorityActions = [
    // Space actions
    { keywords: ['blasted off', 'blast off', 'launched', 'rocketed'], action: 'launching into space' },
    { keywords: ['soared over', 'soaring over', 'flew over'], action: 'soaring over' },
    { keywords: ['landed safely', 'safe landing', 'touched down'], action: 'landing safely' },
    { keywords: ['climbed inside', 'climbing inside', 'got into'], action: 'climbing inside' },
    { keywords: ['walked on the moon', 'bouncing on'], action: 'walking on the moon' },
    { keywords: ['exploring the moon', 'explored the moon'], action: 'exploring the moon' },

    // Emotional actions
    { keywords: ['hugged', 'hugging', 'embrace'], action: 'hugging warmly' },
    { keywords: ['cheered', 'celebrated', 'hooray'], action: 'celebrating joyfully' },
    { keywords: ['laughed', 'giggled', 'laughing'], action: 'laughing happily' },
    { keywords: ['cried', 'crying', 'tears of joy'], action: 'showing emotion' },
    { keywords: ['waved goodbye', 'said goodbye'], action: 'waving goodbye' },

    // Physical actions
    { keywords: ['running', 'ran fast', 'raced'], action: 'running excitedly' },
    { keywords: ['jumping', 'leaped', 'bounced'], action: 'jumping with joy' },
    { keywords: ['swimming', 'swam', 'diving'], action: 'swimming' },
    { keywords: ['climbing', 'climbed up'], action: 'climbing' },
    { keywords: ['flying', 'flew through'], action: 'flying' },
    { keywords: ['dancing', 'danced'], action: 'dancing happily' },

    // Discovery actions
    { keywords: ['discovered', 'found something'], action: 'making a discovery' },
    { keywords: ['exploring', 'explored'], action: 'exploring curiously' },
    { keywords: ['searching', 'looking for'], action: 'searching carefully' },

    // Social actions
    { keywords: ['helping', 'helped'], action: 'helping kindly' },
    { keywords: ['sharing', 'shared'], action: 'sharing generously' },
    { keywords: ['meeting', 'met a'], action: 'meeting someone new' },
    { keywords: ['playing', 'played with'], action: 'playing happily' },
  ];

  for (const { keywords, action } of priorityActions) {
    if (keywords.some(kw => text.includes(kw))) {
      return `${characterName} ${action}`;
    }
  }

  // General actions fallback
  const generalActions = [
    'flying', 'swimming', 'running', 'walking', 'jumping', 'dancing',
    'playing', 'exploring', 'climbing', 'sleeping', 'eating', 'reading',
    'laughing', 'smiling', 'waving', 'looking', 'standing', 'sitting'
  ];

  for (const action of generalActions) {
    if (text.includes(action)) {
      return `${characterName} ${action}`;
    }
  }

  return `${characterName} in the scene`;
}

/**
 * Build forbidden elements based on scene type
 */
function buildForbiddenElements(text: string, setting: string): string[] {
  const forbidden: string[] = [];
  const settingLower = setting.toLowerCase();

  // Space scenes - no nature elements
  if (settingLower.includes('space') || settingLower.includes('moon') || settingLower.includes('rocket') ||
      settingLower.includes('star') || settingLower.includes('planet') || text.includes('crater')) {
    forbidden.push('forest', 'trees', 'grass', 'flowers', 'water', 'ocean', 'fish');
  }

  // Underwater scenes - no land/sky elements
  if (settingLower.includes('underwater') || settingLower.includes('ocean') || settingLower.includes('coral')) {
    forbidden.push('forest', 'sky', 'clouds', 'space', 'stars', 'trees', 'land');
  }

  // Forest/nature scenes - no urban/space elements
  if (settingLower.includes('forest') || settingLower.includes('meadow') || settingLower.includes('garden')) {
    forbidden.push('space', 'rockets', 'planets', 'underwater', 'buildings', 'city');
  }

  // Indoor scenes - no outdoor nature
  if (settingLower.includes('indoor') || settingLower.includes('room') || settingLower.includes('home') ||
      settingLower.includes('castle') || settingLower.includes('school')) {
    forbidden.push('outdoor wilderness', 'space', 'underwater', 'forest');
  }

  // Desert scenes
  if (settingLower.includes('desert')) {
    forbidden.push('water', 'ocean', 'forest', 'snow', 'ice');
  }

  // Winter/snow scenes
  if (text.includes('snow') || text.includes('winter') || text.includes('ice')) {
    forbidden.push('beach', 'tropical', 'desert', 'summer flowers');
  }

  return forbidden.slice(0, 6);
}

/**
 * Determine shot type based on scene complexity
 */
function determineShotType(text: string, objectCount: number): "wide" | "medium" | "close-up" {
  // Close-up for emotional moments
  if (text.includes('hugged') || text.includes('cried') || text.includes('smiled') ||
      text.includes('whispered') || text.includes('face')) {
    return 'close-up';
  }

  // Wide shot for landscapes and group scenes
  if (text.includes('soared') || text.includes('flew over') || text.includes('landscape') ||
      text.includes('friends gathered') || objectCount > 3) {
    return 'wide';
  }

  // Medium shot for most action scenes
  return 'medium';
}

/**
 * Generate composition notes based on scene
 */
function generateCompositionNotes(text: string, shotType: "wide" | "medium" | "close-up"): string {
  if (shotType === 'close-up') {
    return 'Character face clearly visible, emotional expression emphasized';
  }
  if (shotType === 'wide') {
    return 'Full scene visible, character positioned using rule of thirds';
  }
  return 'Character prominently featured, balanced composition';
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
