import { PageSceneCard, CharacterBible } from "./visual-types";

/**
 * Generate a Page Scene Card from page text
 * This creates a structured card with all the information needed for image generation
 */
export function generatePageSceneCard(
  pageText: string,
  pageNumber: number,
  bible: CharacterBible,
  previousSceneCards: PageSceneCard[] = []
): PageSceneCard {
  const lowerText = pageText.toLowerCase();

  // Generate unique scene_id
  const sceneId = generateSceneId(pageText, pageNumber);

  // Detect setting/environment
  const setting = detectSetting(lowerText);

  // Detect time and weather
  const timeWeather = detectTimeWeather(lowerText);

  // Extract main action
  const mainAction = extractMainAction(pageText, bible.name);

  // Extract supporting characters
  const supportingCharacters = extractSupportingCharacters(lowerText);

  // Extract key objects that MUST appear
  const keyObjects = extractKeyObjects(lowerText);

  // Build required elements (objects + characters that must be visible)
  const requiredElements = buildRequiredElements(keyObjects, supportingCharacters);

  // Build forbidden elements (from previous scenes + environment mismatch)
  const forbiddenElements = buildForbiddenElements(setting, previousSceneCards);

  // Determine camera shot type
  const camera = determineCameraShot(supportingCharacters.length, keyObjects.length);

  return {
    page_number: pageNumber,
    scene_id: sceneId,
    setting,
    time_weather: timeWeather,
    main_action: mainAction,
    supporting_characters: supportingCharacters,
    key_objects: keyObjects,
    required_elements: requiredElements,
    forbidden_elements: forbiddenElements,
    camera,
  };
}

/**
 * Generate unique scene_id from page content
 */
function generateSceneId(pageText: string, pageNumber: number): string {
  const lowerText = pageText.toLowerCase();

  // Priority-based scene detection
  if (lowerText.includes('underwater') || lowerText.includes('ocean') || lowerText.includes('sea')) {
    return `ocean_scene_${pageNumber}`;
  }
  if (lowerText.includes('space') || lowerText.includes('moon') || lowerText.includes('star') || lowerText.includes('rocket')) {
    return `space_scene_${pageNumber}`;
  }
  if (lowerText.includes('desert') || lowerText.includes('sand') || lowerText.includes('camel')) {
    return `desert_scene_${pageNumber}`;
  }
  if (lowerText.includes('forest') || lowerText.includes('woods') || lowerText.includes('tree')) {
    return `forest_scene_${pageNumber}`;
  }
  if (lowerText.includes('village') || lowerText.includes('town') || lowerText.includes('house')) {
    return `village_scene_${pageNumber}`;
  }
  if (lowerText.includes('mountain') || lowerText.includes('hill') || lowerText.includes('cave')) {
    return `mountain_scene_${pageNumber}`;
  }
  if (lowerText.includes('sky') || lowerText.includes('cloud') || lowerText.includes('flying')) {
    return `sky_scene_${pageNumber}`;
  }

  return `scene_${pageNumber}`;
}

/**
 * Detect the setting/environment from text
 */
function detectSetting(lowerText: string): string {
  // PRIORITY ORDER: Check specific environments first

  // 1. Underwater/Ocean
  if (lowerText.includes('underwater') || lowerText.includes('ocean floor') ||
      lowerText.includes('coral reef') || lowerText.includes('beneath the waves')) {
    return 'Deep underwater ocean with coral reefs, blue-green water, light rays from above';
  }
  if (lowerText.includes('ocean') || lowerText.includes('sea') ||
      (lowerText.includes('shark') && !lowerText.includes('land'))) {
    return 'Underwater ocean scene with sea creatures and coral';
  }

  // 2. Space scenes - BUT check if it's actually IN space or just mentioning space objects
  const inSpaceKeywords = ['floated through space', 'into space', 'outer space', 'through the cosmos',
                          'among the stars', 'in space', 'floating in space', 'flew through space'];
  const isInSpace = inSpaceKeywords.some(k => lowerText.includes(k));

  if (isInSpace) {
    return 'Outer space with stars, planets, and cosmic wonders';
  }

  // 3. Moon surface (different from floating in space)
  if (lowerText.includes('moon') && (lowerText.includes('landed') || lowerText.includes('surface') || lowerText.includes('walked'))) {
    return 'Moon surface with gray craters, Earth visible in the black starry sky';
  }

  // 4. Desert
  if (lowerText.includes('desert') || lowerText.includes('sand dune') || lowerText.includes('oasis')) {
    return 'Golden desert with rolling sand dunes under a warm sky';
  }
  if (lowerText.includes('camel')) {
    return 'Desert landscape with sand dunes and warm sunlight';
  }

  // 5. Forest/Woods - Check BEFORE space since rocket in forest should show forest
  if (lowerText.includes('forest') || lowerText.includes('woods') || lowerText.includes('trees')) {
    return 'Lush green forest with tall trees, soft sunlight filtering through leaves';
  }

  // 6. Meadow/Garden
  if (lowerText.includes('meadow') || lowerText.includes('garden') || lowerText.includes('flower field')) {
    return 'Beautiful meadow with colorful flowers and soft grass';
  }

  // 7. Village/Home
  if (lowerText.includes('village') || lowerText.includes('town')) {
    return 'Cozy village with cottages and friendly atmosphere';
  }
  if (lowerText.includes('home') || lowerText.includes('house') || lowerText.includes('room')) {
    return 'Warm cozy home interior with comfortable furnishings';
  }

  // 8. Mountain/Cave
  if (lowerText.includes('mountain') || lowerText.includes('peak')) {
    return 'Majestic mountain landscape with scenic views';
  }
  if (lowerText.includes('cave')) {
    return 'Mysterious cave with soft glowing light';
  }

  // 9. Sky/Clouds
  if (lowerText.includes('sky') || lowerText.includes('cloud') || lowerText.includes('flying')) {
    return 'High in the sky among fluffy white clouds';
  }

  // 10. Rocket/Spaceship ON GROUND (not in space)
  if (lowerText.includes('rocket') || lowerText.includes('spaceship')) {
    // Check if launching or on ground
    if (lowerText.includes('launch') || lowerText.includes('blast') || lowerText.includes('lift off')) {
      return 'Launch site with rocket lifting off, sky background';
    }
    // Rocket found/discovered - usually on ground
    if (lowerText.includes('found') || lowerText.includes('discover') || lowerText.includes('clearing')) {
      return 'Open clearing or field with rocket ship visible';
    }
  }

  // Default
  return 'Magical storybook world with warm, friendly atmosphere';
}

/**
 * Detect time of day and weather
 */
function detectTimeWeather(lowerText: string): string {
  let time = 'daytime';
  let weather = 'clear and pleasant';

  // Time detection
  if (lowerText.includes('morning') || lowerText.includes('dawn') || lowerText.includes('sunrise')) {
    time = 'early morning';
  } else if (lowerText.includes('noon') || lowerText.includes('midday')) {
    time = 'midday';
  } else if (lowerText.includes('afternoon')) {
    time = 'afternoon';
  } else if (lowerText.includes('evening') || lowerText.includes('sunset') || lowerText.includes('dusk')) {
    time = 'golden sunset';
  } else if (lowerText.includes('night') || lowerText.includes('dark') || lowerText.includes('moon')) {
    time = 'nighttime';
  }

  // Weather detection
  if (lowerText.includes('rain') || lowerText.includes('storm')) {
    weather = 'rainy';
  } else if (lowerText.includes('snow') || lowerText.includes('winter') || lowerText.includes('cold')) {
    weather = 'snowy';
  } else if (lowerText.includes('sunny') || lowerText.includes('bright')) {
    weather = 'sunny and warm';
  } else if (lowerText.includes('cloudy') || lowerText.includes('overcast')) {
    weather = 'partly cloudy';
  }

  return `${time}, ${weather}`;
}

/**
 * Extract what the main character is doing
 */
function extractMainAction(pageText: string, characterName: string): string {
  const lowerText = pageText.toLowerCase();

  // Action verbs with their descriptions
  const actions: { [key: string]: string } = {
    'swimming': `${characterName} swimming happily`,
    'flying': `${characterName} soaring through the air`,
    'running': `${characterName} running with excitement`,
    'walking': `${characterName} walking along`,
    'climbing': `${characterName} climbing adventurously`,
    'jumping': `${characterName} jumping with joy`,
    'dancing': `${characterName} dancing gracefully`,
    'playing': `${characterName} playing cheerfully`,
    'exploring': `${characterName} exploring curiously`,
    'discovering': `${characterName} discovering something wonderful`,
    'hugging': `${characterName} hugging warmly`,
    'waving': `${characterName} waving happily`,
    'looking': `${characterName} looking with curiosity`,
    'sleeping': `${characterName} sleeping peacefully`,
    'eating': `${characterName} enjoying a meal`,
    'laughing': `${characterName} laughing joyfully`,
    'crying': `${characterName} showing emotion`,
    'smiling': `${characterName} smiling brightly`,
    'talking': `${characterName} having a conversation`,
    'reading': `${characterName} reading a book`,
    'painting': `${characterName} creating art`,
    'building': `${characterName} building something`,
    'helping': `${characterName} helping others`,
    'celebrating': `${characterName} celebrating happily`,
    'said goodbye': `${characterName} waving goodbye`,
    'climbed': `${characterName} climbing into`,
  };

  for (const [keyword, action] of Object.entries(actions)) {
    if (lowerText.includes(keyword)) {
      return action;
    }
  }

  return `${characterName} in the scene`;
}

/**
 * Extract supporting characters from text
 */
function extractSupportingCharacters(lowerText: string): string[] {
  const characters: string[] = [];

  const characterMap: { [key: string]: string } = {
    'shark': 'friendly sharks',
    'dolphin': 'playful dolphins',
    'whale': 'gentle whale',
    'fish': 'colorful fish',
    'octopus': 'cute octopus',
    'turtle': 'wise turtle',
    'crab': 'cheerful crab',
    'jellyfish': 'glowing jellyfish',
    'mermaid': 'beautiful mermaid',
    'seahorse': 'tiny seahorse',
    'owl': 'wise owl',
    'bird': 'friendly birds',
    'butterfly': 'colorful butterflies',
    'bee': 'busy bees',
    'rabbit': 'fluffy rabbit',
    'bunny': 'cute bunny',
    'fox': 'clever fox',
    'deer': 'gentle deer',
    'bear': 'friendly bear',
    'squirrel': 'playful squirrel',
    'mouse': 'tiny mouse',
    'dragon': 'friendly dragon',
    'unicorn': 'magical unicorn',
    'fairy': 'sparkly fairy',
    'alien': 'friendly aliens',
    'robot': 'helpful robot',
    'camel': 'friendly camels',
    'friend': 'new friends',
  };

  for (const [keyword, character] of Object.entries(characterMap)) {
    if (lowerText.includes(keyword)) {
      characters.push(character);
    }
  }

  return characters.slice(0, 4); // Max 4 supporting characters
}

/**
 * Extract key objects that MUST appear in the image
 */
function extractKeyObjects(lowerText: string): string[] {
  const objects: string[] = [];

  const objectMap: { [key: string]: string } = {
    'rocket': 'shiny rocket ship',
    'spaceship': 'silver spaceship',
    'treasure': 'golden treasure chest',
    'crown': 'sparkling crown',
    'wand': 'magic wand',
    'castle': 'beautiful castle',
    'balloon': 'colorful balloons',
    'rainbow': 'bright rainbow',
    'star': 'twinkling stars',
    'moon': 'glowing moon',
    'planet': 'colorful planets',
    'boat': 'small boat',
    'ship': 'sailing ship',
    'telescope': 'brass telescope',
    'map': 'treasure map',
    'book': 'magical book',
    'crystal': 'glowing crystal',
    'flower': 'beautiful flowers',
    'tree': 'tall trees',
    'mountain': 'distant mountains',
    'waterfall': 'cascading waterfall',
    'bridge': 'wooden bridge',
    'tent': 'camping tent',
    'campfire': 'warm campfire',
  };

  for (const [keyword, object] of Object.entries(objectMap)) {
    if (lowerText.includes(keyword)) {
      objects.push(object);
    }
  }

  return objects.slice(0, 5); // Max 5 key objects
}

/**
 * Build required elements list
 */
function buildRequiredElements(keyObjects: string[], supportingCharacters: string[]): string[] {
  const required: string[] = [];

  // Add supporting characters
  for (const char of supportingCharacters) {
    required.push(char);
  }

  // Add key objects
  for (const obj of keyObjects) {
    required.push(obj);
  }

  return required;
}

/**
 * Build forbidden elements based on current setting and previous scenes
 * Rule C: Previous scene items should be forbidden in new scenes
 */
function buildForbiddenElements(setting: string, previousSceneCards: PageSceneCard[]): string[] {
  const forbidden: string[] = [];
  const lowerSetting = setting.toLowerCase();

  // Environment-based exclusions
  if (lowerSetting.includes('underwater') || lowerSetting.includes('ocean')) {
    forbidden.push('forest', 'trees', 'grass', 'land', 'sky', 'buildings', 'desert', 'mountains');
  } else if (lowerSetting.includes('space') || lowerSetting.includes('star') || lowerSetting.includes('cosmic')) {
    forbidden.push('forest', 'trees', 'grass', 'water', 'ocean', 'fish', 'buildings', 'land');
  } else if (lowerSetting.includes('desert') || lowerSetting.includes('sand')) {
    forbidden.push('ocean', 'water', 'fish', 'forest', 'snow', 'space', 'stars', 'underwater');
  } else if (lowerSetting.includes('forest') || lowerSetting.includes('meadow')) {
    forbidden.push('space', 'planets', 'stars', 'underwater', 'ocean', 'fish', 'coral', 'desert');
  } else if (lowerSetting.includes('moon')) {
    forbidden.push('forest', 'trees', 'ocean', 'water', 'fish', 'animals', 'buildings');
  }

  // Add previous scene environments to prevent repetition
  if (previousSceneCards.length > 0) {
    const lastScene = previousSceneCards[previousSceneCards.length - 1];
    // If last scene was different environment, exclude its distinctive features
    if (lastScene.setting.toLowerCase().includes('ocean') && !lowerSetting.includes('ocean')) {
      forbidden.push('coral', 'seaweed', 'bubbles');
    }
    if (lastScene.setting.toLowerCase().includes('forest') && !lowerSetting.includes('forest')) {
      forbidden.push('thick trees', 'forest path');
    }
  }

  // Always forbidden
  forbidden.push('text', 'logos', 'watermarks', 'signature', 'extra unrelated characters');

  return [...new Set(forbidden)]; // Remove duplicates
}

/**
 * Determine camera shot type based on scene complexity
 */
function determineCameraShot(numCharacters: number, numObjects: number): { shot_type: "wide" | "medium" | "close-up"; composition_notes: string } {
  const totalElements = numCharacters + numObjects;

  if (totalElements >= 4) {
    return {
      shot_type: 'wide',
      composition_notes: 'Show full environment with all characters and objects visible'
    };
  } else if (totalElements >= 2) {
    return {
      shot_type: 'medium',
      composition_notes: 'Main character centered with supporting elements visible around them'
    };
  } else {
    return {
      shot_type: 'medium',
      composition_notes: 'Focus on main character with environment as backdrop'
    };
  }
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
      sceneCards // Pass previous cards for forbidden elements
    );
    sceneCards.push(card);
  }

  return sceneCards;
}
