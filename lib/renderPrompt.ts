import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * Scene requirements extracted from page text
 * Used for validation to ensure prompt contains required elements
 */
interface SceneRequirements {
  setting: string;
  requiredObjects: string[];
  requiredCharacters: string[];
  action: string;
}

/**
 * Extract hard requirements from page text
 * These MUST appear in the final prompt
 */
function extractSceneRequirements(text: string): SceneRequirements {
  const lowerText = text.toLowerCase();
  const requirements: SceneRequirements = {
    setting: '',
    requiredObjects: [],
    requiredCharacters: [],
    action: ''
  };

  // REQUIRED OBJECTS - if mentioned in text, MUST be in prompt
  const objectPatterns = [
    { pattern: /rocket\s*ship|spaceship/i, obj: 'rocket ship' },
    { pattern: /\bocean\b|\bsea\b/i, obj: 'ocean' },
    { pattern: /\bdolphins?\b/i, obj: 'dolphins' },
    { pattern: /\bflag\b/i, obj: 'flag' },
    { pattern: /\bcraters?\b/i, obj: 'moon craters' },
    { pattern: /\brainbow\b/i, obj: 'rainbow' },
    { pattern: /\bwaterfall\b/i, obj: 'waterfall' },
    { pattern: /\btreasure\b|\bchest\b/i, obj: 'treasure chest' },
    { pattern: /\bcrown\b/i, obj: 'crown' },
    { pattern: /\bballoons?\b/i, obj: 'balloons' },
  ];

  for (const { pattern, obj } of objectPatterns) {
    if (pattern.test(lowerText)) {
      requirements.requiredObjects.push(obj);
    }
  }

  // REQUIRED CHARACTERS - supporting characters that must appear
  const characterPatterns = [
    { pattern: /moon\s*rabbits?/i, char: 'moon rabbits' },
    { pattern: /\bdolphins?\b/i, char: 'dolphins' },
    { pattern: /lunar\s*guardians?/i, char: 'lunar guardians' },
    { pattern: /\bwhales?\b/i, char: 'whale' },
    { pattern: /\bbutterfl(?:y|ies)\b/i, char: 'butterflies' },
  ];

  for (const { pattern, char } of characterPatterns) {
    if (pattern.test(lowerText)) {
      requirements.requiredCharacters.push(char);
    }
  }

  // SETTING detection
  if (lowerText.includes('ocean') || lowerText.includes('sea') || lowerText.includes('underwater')) {
    requirements.setting = 'ocean';
  } else if (lowerText.includes('moon') || lowerText.includes('lunar') || lowerText.includes('crater')) {
    requirements.setting = 'moon';
  } else if (lowerText.includes('forest') || lowerText.includes('woods') || lowerText.includes('trees')) {
    requirements.setting = 'forest';
  } else if (lowerText.includes('beach') || lowerText.includes('sand')) {
    requirements.setting = 'beach';
  } else if (lowerText.includes('space') || lowerText.includes('stars') || lowerText.includes('galaxy')) {
    requirements.setting = 'space';
  }

  return requirements;
}

/**
 * Validate that a prompt contains all required elements
 * Returns list of missing requirements
 */
function validatePromptRequirements(prompt: string, requirements: SceneRequirements): string[] {
  const lowerPrompt = prompt.toLowerCase();
  const missing: string[] = [];

  // Check required objects
  for (const obj of requirements.requiredObjects) {
    if (!lowerPrompt.includes(obj.toLowerCase())) {
      missing.push(`object: ${obj}`);
    }
  }

  // Check required characters
  for (const char of requirements.requiredCharacters) {
    if (!lowerPrompt.includes(char.toLowerCase())) {
      missing.push(`character: ${char}`);
    }
  }

  // Check setting
  if (requirements.setting && !lowerPrompt.includes(requirements.setting)) {
    missing.push(`setting: ${requirements.setting}`);
  }

  return missing;
}

// Comprehensive animal list for detection - PRIORITY ORDER (check big/distinctive first)
const PRIORITY_ANIMALS = [
  'rhinoceros', 'rhino',  // CHECK RHINO FIRST!
  'elephant', 'giraffe', 'hippopotamus', 'hippo', 'zebra',
  'lion', 'tiger', 'leopard', 'jaguar', 'cheetah', 'bear', 'polar bear',
  'gorilla', 'chimpanzee', 'orangutan', 'monkey', 'ape',
  'wolf', 'fox', 'deer', 'moose', 'elk', 'horse', 'pony', 'donkey',
  'kangaroo', 'koala', 'panda', 'dolphin', 'whale', 'shark', 'octopus',
  'crocodile', 'alligator', 'turtle', 'tortoise', 'snake', 'lizard',
  'dragon', 'unicorn', 'dinosaur',
  'dog', 'puppy', 'cat', 'kitten', 'rabbit', 'bunny', 'hamster', 'mouse', 'rat',
  'cow', 'pig', 'sheep', 'goat', 'chicken', 'duck', 'goose', 'turkey',
  'owl', 'eagle', 'hawk', 'penguin', 'seal', 'walrus',
  'frog', 'toad', 'butterfly', 'bee', 'ant', 'spider',
  'raccoon', 'skunk', 'squirrel', 'chipmunk', 'beaver', 'otter', 'fish',
];

/**
 * UNIVERSAL PROMPT TEMPLATE
 * CRITICAL: Species MUST be the FIRST word and REPEATED multiple times
 * SDXL only pays attention to first ~77 tokens
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  const text = pageText || '';
  const lowerText = text.toLowerCase();
  const charName = bible.name;

  console.log(`\n====== RENDER PROMPT DEBUG ======`);
  console.log(`Page: ${card.page_number}`);
  console.log(`Character name: ${charName}`);
  console.log(`Bible species: ${bible.species}`);
  console.log(`Bible character_type: ${bible.character_type}`);
  console.log(`Page text (first 100 chars): ${text.substring(0, 100)}`);

  // 1. SPECIES DETECTION - BIBLE FIRST, then page text as fallback
  // CRITICAL: The main character's species from bible takes PRIORITY
  // Do NOT override with random animals mentioned in page text!
  let species: string = 'animal';

  // Method 1: Use bible character_type or species (HIGHEST PRIORITY)
  // This is the MAIN CHARACTER's species - always use this first!
  if (bible.character_type && bible.character_type !== 'human' && bible.character_type !== 'animal') {
    species = bible.character_type;
    console.log(`[DETECTION] Using bible character_type: ${species}`);
  } else if (bible.species && bible.species !== 'animal') {
    species = bible.species;
    console.log(`[DETECTION] Using bible species: ${species}`);
  }

  // Method 2: ONLY if bible has no species, try pattern "Name the Animal"
  if (species === 'animal') {
    const namePattern = text.match(new RegExp(`${charName}\\s+the\\s+(\\w+)`, 'i'));
    if (namePattern) {
      const possibleSpecies = namePattern[1].toLowerCase();
      console.log(`[DETECTION] Name pattern found: "${namePattern[0]}" -> species: "${possibleSpecies}"`);
      if (PRIORITY_ANIMALS.includes(possibleSpecies)) {
        species = possibleSpecies;
        console.log(`[DETECTION] Using pattern-matched species: ${species}`);
      }
    }
  }

  // Method 3: ONLY if still no species, scan page text for ANY animal
  // NOTE: This is last resort - don't let random animals in story override main character!
  if (species === 'animal') {
    for (const animal of PRIORITY_ANIMALS) {
      // Use word boundary to avoid matching "hen" in "then"
      const regex = new RegExp(`\\b${animal}\\b`, 'i');
      if (regex.test(lowerText)) {
        species = animal;
        console.log(`[DETECTION] Found "${animal}" in page text (fallback)`);
        break;
      }
    }
  }

  console.log(`[FINAL SPECIES]: "${species}"`);

  // 2. Get character appearance details
  const furColor = bible.appearance?.skin_tone || 'gray';
  const eyeDesc = bible.appearance?.eyes || 'big friendly eyes';

  // 3. SCENE - Extract from page text
  const scene = extractSceneFromText(lowerText, card.setting);

  // 4. ACTION - What is the character doing?
  const action = extractActionFromText(lowerText, charName);

  // 5. MUST-INCLUDE OBJECTS - Extract key objects from story that MUST appear
  const mustInclude = extractMustIncludeObjects(lowerText);
  if (mustInclude) {
    console.log(`[MUST INCLUDE]: ${mustInclude}`);
  }

  // 6. SUPPORTING CHARACTERS - Extract other characters mentioned in page text
  const supportingChars = extractSupportingCharacters(lowerText, charName);
  if (supportingChars) {
    console.log(`[SUPPORTING]: ${supportingChars}`);
  }

  // 7. BUILD PROMPT - STYLE + SPECIES + MUST-INCLUDE first (CRITICAL FOR SDXL)
  // SDXL only pays attention to ~77 tokens, so important elements must be first
  let prompt: string;

  // CARTOON STYLE keywords - put at START of prompt for maximum effect
  const STYLE = "cute cartoon 2D illustration, children's picture book, colorful vibrant";

  if (species && species !== 'animal') {
    // ANIMAL CHARACTER - STYLE + SPECIES + MUST-INCLUDE at START for maximum SDXL attention
    const SPECIES = species.toUpperCase();
    prompt = `${STYLE}, cute cartoon ${species}. ` +
      `${SPECIES}. ${SPECIES}. ` +
      (mustInclude ? `MUST INCLUDE: ${mustInclude}. ` : '') +
      (supportingChars ? `WITH: ${supportingChars}. ` : '') +
      `Scene: ${scene}. ` +
      `${charName} the cartoon ${species} is ${action}. ` +
      `Bright colors, expressive eyes, friendly face.`;
  } else {
    // Couldn't detect specific species - use generic cartoon animal
    prompt = `${STYLE}, cute cartoon animal. ` +
      (mustInclude ? `MUST INCLUDE: ${mustInclude}. ` : '') +
      (supportingChars ? `WITH: ${supportingChars}. ` : '') +
      `${charName} the friendly cartoon animal, ${action}. ` +
      `Scene: ${scene}. ` +
      `Bright colors, expressive eyes.`;
  }

  // 8. VALIDATE and FIX prompt if missing required elements
  const requirements = extractSceneRequirements(text);
  console.log(`[REQUIREMENTS]: objects=${requirements.requiredObjects.join(',')} chars=${requirements.requiredCharacters.join(',')} setting=${requirements.setting}`);

  const missing = validatePromptRequirements(prompt, requirements);
  if (missing.length > 0) {
    console.log(`[VALIDATION FAILED] Missing: ${missing.join(', ')}`);

    // Build fix string with missing elements
    const fixes: string[] = [];
    for (const m of missing) {
      if (m.startsWith('object:')) {
        const obj = m.replace('object: ', '');
        fixes.push(`cartoon ${obj}`);
      } else if (m.startsWith('character:')) {
        const char = m.replace('character: ', '');
        fixes.push(`cute cartoon ${char}`);
      } else if (m.startsWith('setting:')) {
        const setting = m.replace('setting: ', '');
        fixes.push(`${setting} background`);
      }
    }

    // Insert fixes right after species in prompt
    if (fixes.length > 0) {
      const fixStr = `MUST SHOW: ${fixes.join(', ')}. `;
      // Find position after species repetition and insert fix
      const speciesMatch = prompt.match(/([A-Z]+\.\s*[A-Z]+\.\s*)/);
      if (speciesMatch) {
        const insertPos = prompt.indexOf(speciesMatch[0]) + speciesMatch[0].length;
        prompt = prompt.slice(0, insertPos) + fixStr + prompt.slice(insertPos);
      } else {
        // Fallback: add after style
        prompt = prompt.replace('cute cartoon', `cute cartoon ${fixStr}`);
      }
      console.log(`[VALIDATION FIX] Added: ${fixStr}`);
    }
  } else {
    console.log(`[VALIDATION OK] All requirements present`);
  }

  console.log(`[FINAL PROMPT]: ${prompt.substring(0, 400)}...`);
  console.log(`====== END RENDER PROMPT DEBUG ======\n`);

  return prompt;
}

/**
 * Extract MUST-INCLUDE objects from story text
 * These are key objects that MUST appear in the image (rocket ship, flag, ocean, etc.)
 */
function extractMustIncludeObjects(text: string): string {
  const objects: string[] = [];

  // VEHICLES
  if (text.includes('rocket') || text.includes('spaceship') || text.includes('ship')) {
    objects.push('colorful cartoon rocket ship');
  }

  // WATER/OCEAN elements
  if (text.includes('ocean') || text.includes('sea') || text.includes('underwater')) {
    objects.push('blue ocean water with waves');
  }
  if (text.includes('splash') || text.includes('wave')) {
    objects.push('water splashing');
  }

  // SPACE elements
  if (text.includes('crater')) {
    objects.push('moon craters');
  }
  if (text.includes('flag') || text.includes('planted')) {
    objects.push('colorful flag');
  }
  if (text.includes('earth') && (text.includes('moon') || text.includes('space'))) {
    objects.push('Earth visible in sky');
  }

  // NATURE elements
  if (text.includes('waterfall')) {
    objects.push('sparkling waterfall');
  }
  if (text.includes('rainbow')) {
    objects.push('colorful rainbow');
  }
  if (text.includes('treasure') || text.includes('chest')) {
    objects.push('treasure chest');
  }

  // SPECIAL objects
  if (text.includes('crown')) {
    objects.push('golden crown');
  }
  if (text.includes('wand') || text.includes('magic')) {
    objects.push('magic wand with sparkles');
  }
  if (text.includes('balloon')) {
    objects.push('colorful balloons');
  }
  if (text.includes('cake') || text.includes('birthday')) {
    objects.push('birthday cake');
  }
  if (text.includes('present') || text.includes('gift')) {
    objects.push('wrapped presents');
  }
  if (text.includes('telescope')) {
    objects.push('telescope');
  }
  if (text.includes('map')) {
    objects.push('treasure map');
  }

  // Limit to top 2 objects to keep prompt focused
  return objects.slice(0, 2).join(', ');
}

/**
 * Extract supporting characters mentioned in page text
 * Returns a phrase like "with friendly dolphins" or "with the Lunar Guardians"
 */
function extractSupportingCharacters(text: string, mainCharName: string): string {
  const found: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Named groups/characters (e.g., "Lunar Guardians", "Moon Friends", "Star Creatures")
  const namedGroups = [
    { pattern: /moon rabbits?/i, desc: 'cute cartoon moon rabbits' },
    { pattern: /lunar guardians?/i, desc: 'cute cartoon Lunar Guardian creatures' },
    { pattern: /lunar friends?/i, desc: 'cute cartoon alien friends' },
    { pattern: /moon friends?/i, desc: 'cute cartoon moon creatures' },
    { pattern: /star creatures?/i, desc: 'friendly cartoon star beings' },
    { pattern: /space friends?/i, desc: 'cute cartoon alien friends' },
    { pattern: /his friends?|her friends?|their friends?/i, desc: 'cute cartoon animal friends' },
  ];

  for (const { pattern, desc } of namedGroups) {
    if (pattern.test(text)) {
      found.push(desc);
      break; // Only add one group
    }
  }

  // Common animals mentioned as supporting characters
  const supportingAnimals = [
    { pattern: /\bdolphins?\b/i, desc: 'playful cartoon dolphins' },
    { pattern: /\bwhales?\b/i, desc: 'friendly cartoon whale' },
    { pattern: /\bfish\b/i, desc: 'colorful cartoon fish' },
    { pattern: /\bbutterfl(?:y|ies)\b/i, desc: 'colorful cartoon butterflies' },
    { pattern: /\bbirds?\b/i, desc: 'cute cartoon birds' },
    { pattern: /\brabbits?\b|\bbunnies?\b/i, desc: 'cute cartoon rabbits' },
    { pattern: /\bsquirrels?\b/i, desc: 'friendly cartoon squirrel' },
    { pattern: /\bdeer\b/i, desc: 'gentle cartoon deer' },
    { pattern: /\blions?\b/i, desc: 'friendly cartoon lion' },
    { pattern: /\belephants?\b/i, desc: 'cute cartoon elephant' },
    { pattern: /\bmonkeys?\b/i, desc: 'playful cartoon monkeys' },
    { pattern: /\bturtles?\b/i, desc: 'friendly cartoon turtle' },
    { pattern: /\bfrogs?\b/i, desc: 'cute cartoon frog' },
    { pattern: /\bowls?\b/i, desc: 'wise cartoon owl' },
    { pattern: /\bbears?\b/i, desc: 'friendly cartoon bear' },
    { pattern: /\bfoxes?\b|\bfox\b/i, desc: 'clever cartoon fox' },
  ];

  // Only add supporting animals if they're not the main character
  for (const { pattern, desc } of supportingAnimals) {
    if (pattern.test(text) && !pattern.test(mainLower)) {
      found.push(desc);
      if (found.length >= 2) break; // Limit to 2 supporting characters
    }
  }

  if (found.length === 0) return '';
  return `Together with ${found.join(' and ')}.`;
}

/**
 * Extract action from page text - what is the character doing?
 */
function extractActionFromText(text: string, charName: string): string {
  // Priority actions with specific descriptions
  if (text.includes('blasted off') || text.includes('blast off')) {
    return 'inside rocket ship cockpit pressing buttons';
  }
  if (text.includes('soared over') || text.includes('flew over') || text.includes('flying over')) {
    return 'looking out rocket window at the view below';
  }
  if (text.includes('landed safely') || text.includes('landing')) {
    return 'celebrating with happy expression';
  }
  if (text.includes('climbed inside') || text.includes('got inside')) {
    return 'climbing into rocket ship';
  }
  if (text.includes('exploring')) return 'exploring with curious expression';
  if (text.includes('running')) return 'running with joyful expression';
  if (text.includes('swimming')) return 'swimming happily';
  if (text.includes('flying')) return 'flying through the air';
  if (text.includes('playing')) return 'playing happily';
  if (text.includes('sleeping')) return 'sleeping peacefully';
  if (text.includes('smiling') || text.includes('smiled')) return 'smiling warmly';
  if (text.includes('laughing') || text.includes('laughed')) return 'laughing joyfully';

  return 'with happy curious expression';
}

/**
 * Extract scene/setting directly from page text
 * Looks for location keywords and builds appropriate scene description
 */
function extractSceneFromText(text: string, fallbackSetting: string): string {
  // SPACE / CELESTIAL - Check most specific patterns first

  // CRATER scenes (moon adventures) - VERY SPECIFIC for SDXL
  if (text.includes('crater') || text.includes('lunar crater')) {
    if (text.includes('soared over') || text.includes('fly across') || text.includes('flew over') || text.includes('flying over')) {
      return 'in a colorful cartoon rocket ship flying over grey moon surface with large craters, black starry space background with Earth visible, dramatic angle';
    }
    if (text.includes('landed') || text.includes('other side')) {
      return 'on grey moon surface next to a colorful cartoon rocket ship, large crater nearby, black starry sky with stars twinkling';
    }
    return 'on grey bumpy moon surface with craters all around, bright Earth visible in black starry sky';
  }

  // ROCKET LAUNCH / BLASTOFF scenes - INSIDE ROCKET
  if (text.includes('blasted off') || text.includes('blast off') || text.includes('took off') || text.includes('launched')) {
    if (text.includes('moon') || text.includes('crater') || text.includes('lunar')) {
      return 'inside colorful cartoon rocket ship cockpit with big windows showing moon surface and stars outside, control panel with glowing buttons';
    }
    return 'inside colorful cartoon rocket ship cockpit with big windows showing stars and planets outside, control panel with buttons';
  }

  // SOARING / FLYING in space - EMPHASIZE ROCKET WINDOW VIEW
  if (text.includes('soared') || text.includes('soaring')) {
    if (text.includes('moon') || text.includes('crater')) {
      return 'inside cartoon rocket ship looking out big round window at moon craters passing below, stars in black space';
    }
    return 'inside cartoon rocket ship with big window showing colorful outer space with stars and planets';
  }

  if (text.includes('moon surface') || text.includes('on the moon') || text.includes('lunar surface')) {
    return 'colorful cartoon moon surface with craters, bright Earth visible in starry black sky';
  }
  if (text.includes('exploring the moon') || text.includes('walked on the moon') || text.includes('stepped on the moon')) {
    return 'colorful cartoon moon surface with craters and rocks, starry space background';
  }
  if (text.includes('landed on the moon') || text.includes('arriving at the moon')) {
    return 'colorful cartoon rocket ship landed on moon surface with craters';
  }
  // GENERAL MOON/LUNAR references - catch "the moon", "lunar guardians", etc.
  if (text.includes('lunar') || (text.includes('moon') && !text.includes('moonlight'))) {
    return 'colorful cartoon moon surface with craters and rocks, Earth visible in starry black sky, magical glowing atmosphere';
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

  // VEHICLES - ROCKET/SPACESHIP
  if (text.includes('rocket') || text.includes('spaceship') || text.includes('ship')) {
    if (text.includes('inside') || text.includes('cockpit') || text.includes('climbed inside') || text.includes('back to')) {
      return 'inside colorful cartoon rocket ship cockpit with big windows, glowing control panel with buttons, cozy seats';
    }
    return 'in colorful cartoon rocket ship flying through space with stars and planets visible through windows';
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
 * Extract named characters from text like "Benny the dog" or "Fufu the cat"
 * Also detects "[Name] and [Name]" patterns for friends with creative names
 * Returns string like "with Benny the dog and Fufu the cat, "
 */
function extractNamedCharactersFromText(text: string, mainCharName: string): string {
  const found: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Pattern 1: "[Name] the [animal]"
  const namedAnimalPattern = /\b([A-Z][a-z]+)\s+the\s+(dog|cat|rabbit|bunny|bear|fox|owl|bird|mouse|squirrel|deer|porcupine|hedgehog|raccoon|beaver|frog|turtle|fish|penguin|lion|tiger|elephant|monkey|giraffe|zebra|hippo|koala|kangaroo|dolphin|whale|seal|otter|wolf|pig|cow|horse|sheep|goat|duck|chicken|butterfly|bee|dragon|unicorn)\b/gi;

  let match;
  while ((match = namedAnimalPattern.exec(text)) !== null) {
    const name = match[1];
    const animal = match[2].toLowerCase();
    // Skip if it's the main character
    if (name.toLowerCase() === mainLower) continue;
    found.push(`${name} the ${animal}`);
  }

  // Pattern 2: "[Name] and [Name]" or "[Name], [Name] and [Name]" (friends with creative names)
  // Common in children's stories: "Susu and Piku cheered" or "Luna, Max and Ruby played"
  const friendNamesPattern = /\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\b/g;
  while ((match = friendNamesPattern.exec(text)) !== null) {
    const name1 = match[1];
    const name2 = match[2];
    // Skip main character, skip common words
    const skipWords = ['the', 'and', 'but', 'his', 'her', 'they', 'them', 'this', 'that', 'with'];
    if (name1.toLowerCase() !== mainLower && !skipWords.includes(name1.toLowerCase())) {
      if (!found.some(f => f.includes(name1))) found.push(name1);
    }
    if (name2.toLowerCase() !== mainLower && !skipWords.includes(name2.toLowerCase())) {
      if (!found.some(f => f.includes(name2))) found.push(name2);
    }
  }

  // Pattern 3: "his friends" or "her friends" or "three friends" - generic friends
  if (text.includes('friends') && found.length === 0) {
    found.push('friends');
  }

  if (found.length === 0) return '';
  // Limit to 2 supporting characters to keep prompt short
  const chars = [...new Set(found)].slice(0, 2);
  return `with ${chars.join(' and ')}, `;
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

  // COMPREHENSIVE ANIMAL MAP - ALL ANIMALS AND INSECTS
  const animalMap: Record<string, string> = {
    // PETS & DOMESTIC
    'dog': 'cute cartoon dog', 'puppy': 'cute cartoon puppy', 'cat': 'cute cartoon cat',
    'kitten': 'cute cartoon kitten', 'hamster': 'tiny cartoon hamster', 'guinea pig': 'cute cartoon guinea pig',
    'gerbil': 'tiny cartoon gerbil', 'rabbit': 'cute cartoon rabbit', 'bunny': 'cute cartoon bunny',
    'ferret': 'playful cartoon ferret', 'parrot': 'colorful cartoon parrot', 'parakeet': 'colorful cartoon parakeet',
    'budgie': 'cute cartoon budgie', 'canary': 'tiny cartoon canary', 'cockatiel': 'cute cartoon cockatiel',
    'cockatoo': 'fancy cartoon cockatoo', 'macaw': 'colorful cartoon macaw', 'goldfish': 'shiny cartoon goldfish',
    'betta': 'colorful cartoon betta fish', 'turtle': 'gentle cartoon turtle', 'tortoise': 'wise cartoon tortoise',
    'snake': 'friendly cartoon snake', 'lizard': 'cute cartoon lizard', 'gecko': 'tiny cartoon gecko',
    'iguana': 'cool cartoon iguana', 'chameleon': 'colorful cartoon chameleon',
    // FARM ANIMALS
    'horse': 'majestic cartoon horse', 'pony': 'cute cartoon pony', 'donkey': 'friendly cartoon donkey',
    'mule': 'sturdy cartoon mule', 'cow': 'friendly cartoon cow', 'bull': 'strong cartoon bull',
    'calf': 'cute cartoon calf', 'pig': 'pink cartoon pig', 'piglet': 'tiny cartoon piglet',
    'hog': 'big cartoon hog', 'boar': 'wild cartoon boar', 'sheep': 'fluffy cartoon sheep',
    'lamb': 'baby cartoon lamb', 'goat': 'playful cartoon goat', 'chicken': 'cute cartoon chicken',
    'hen': 'mother cartoon hen', 'rooster': 'proud cartoon rooster', 'chick': 'tiny cartoon chick',
    'duck': 'cute cartoon duck', 'duckling': 'baby cartoon duckling', 'goose': 'friendly cartoon goose',
    'gosling': 'baby cartoon gosling', 'turkey': 'funny cartoon turkey', 'llama': 'fluffy cartoon llama',
    'alpaca': 'fuzzy cartoon alpaca', 'buffalo': 'big cartoon buffalo', 'bison': 'majestic cartoon bison',
    'ox': 'strong cartoon ox', 'yak': 'shaggy cartoon yak',
    // FOREST & WOODLAND
    'fox': 'clever cartoon fox', 'wolf': 'friendly cartoon wolf', 'coyote': 'wild cartoon coyote',
    'bear': 'friendly cartoon bear', 'deer': 'gentle cartoon deer', 'doe': 'gentle cartoon doe',
    'fawn': 'baby cartoon fawn', 'buck': 'majestic cartoon buck', 'stag': 'noble cartoon stag',
    'elk': 'majestic cartoon elk', 'moose': 'big cartoon moose', 'caribou': 'noble cartoon caribou',
    'reindeer': 'magical cartoon reindeer', 'hare': 'speedy cartoon hare', 'squirrel': 'busy cartoon squirrel',
    'chipmunk': 'tiny cartoon chipmunk', 'raccoon': 'mischievous cartoon raccoon', 'skunk': 'cute cartoon skunk',
    'opossum': 'shy cartoon opossum', 'possum': 'shy cartoon possum', 'badger': 'grumpy cartoon badger',
    'wolverine': 'fierce cartoon wolverine', 'weasel': 'sneaky cartoon weasel', 'mink': 'sleek cartoon mink',
    'otter': 'playful cartoon otter', 'beaver': 'busy cartoon beaver', 'porcupine': 'spiky cartoon porcupine',
    'hedgehog': 'cute cartoon hedgehog', 'mole': 'tiny cartoon mole', 'shrew': 'tiny cartoon shrew',
    'vole': 'tiny cartoon vole', 'mouse': 'tiny cartoon mouse', 'mice': 'tiny cartoon mice',
    'rat': 'clever cartoon rat', 'woodchuck': 'chubby cartoon woodchuck', 'groundhog': 'cute cartoon groundhog',
    'bobcat': 'wild cartoon bobcat', 'lynx': 'sleek cartoon lynx', 'cougar': 'majestic cartoon cougar',
    'panther': 'sleek cartoon panther', 'mountain lion': 'majestic cartoon mountain lion',
    // JUNGLE & TROPICAL
    'lion': 'majestic cartoon lion', 'tiger': 'majestic cartoon tiger', 'leopard': 'spotted cartoon leopard',
    'jaguar': 'spotted cartoon jaguar', 'cheetah': 'fast cartoon cheetah', 'monkey': 'playful cartoon monkey',
    'ape': 'strong cartoon ape', 'gorilla': 'gentle cartoon gorilla', 'chimpanzee': 'smart cartoon chimpanzee',
    'orangutan': 'wise cartoon orangutan', 'baboon': 'funny cartoon baboon', 'lemur': 'cute cartoon lemur',
    'sloth': 'sleepy cartoon sloth', 'anteater': 'long-nosed cartoon anteater', 'armadillo': 'armored cartoon armadillo',
    'tapir': 'friendly cartoon tapir', 'capybara': 'chill cartoon capybara', 'toucan': 'colorful cartoon toucan',
    'anaconda': 'big cartoon anaconda', 'python': 'long cartoon python', 'boa': 'friendly cartoon boa',
    'crocodile': 'scaly cartoon crocodile', 'alligator': 'scaly cartoon alligator', 'caiman': 'small cartoon caiman',
    // AFRICAN SAVANNA
    'elephant': 'big cartoon elephant', 'giraffe': 'tall cartoon giraffe', 'zebra': 'striped cartoon zebra',
    'hippo': 'big cartoon hippo', 'hippopotamus': 'big cartoon hippopotamus', 'rhino': 'strong cartoon rhino',
    'rhinoceros': 'strong cartoon rhinoceros', 'gazelle': 'graceful cartoon gazelle', 'antelope': 'graceful cartoon antelope',
    'impala': 'leaping cartoon impala', 'hyena': 'laughing cartoon hyena', 'jackal': 'clever cartoon jackal',
    'meerkat': 'cute cartoon meerkat', 'warthog': 'funny cartoon warthog', 'ostrich': 'tall cartoon ostrich',
    'flamingo': 'pink cartoon flamingo', 'vulture': 'soaring cartoon vulture',
    // AUSTRALIAN
    'kangaroo': 'bouncy cartoon kangaroo', 'wallaby': 'small cartoon wallaby', 'koala': 'cuddly cartoon koala',
    'wombat': 'chubby cartoon wombat', 'platypus': 'unique cartoon platypus', 'echidna': 'spiky cartoon echidna',
    'tasmanian devil': 'wild cartoon tasmanian devil', 'dingo': 'wild cartoon dingo', 'emu': 'tall cartoon emu',
    'kookaburra': 'laughing cartoon kookaburra', 'lorikeet': 'colorful cartoon lorikeet', 'sugar glider': 'cute cartoon sugar glider',
    'numbat': 'striped cartoon numbat', 'quokka': 'happy cartoon quokka',
    // ARCTIC & POLAR
    'polar bear': 'white cartoon polar bear', 'penguin': 'cute cartoon penguin', 'seal': 'sleek cartoon seal',
    'sea lion': 'playful cartoon sea lion', 'walrus': 'big cartoon walrus', 'arctic fox': 'white cartoon arctic fox',
    'snowy owl': 'white cartoon snowy owl', 'narwhal': 'magical cartoon narwhal', 'beluga': 'white cartoon beluga',
    'orca': 'majestic cartoon orca', 'whale': 'big cartoon whale', 'puffin': 'colorful cartoon puffin',
    'lemming': 'tiny cartoon lemming', 'musk ox': 'shaggy cartoon musk ox',
    // OCEAN & MARINE
    'dolphin': 'playful cartoon dolphin', 'porpoise': 'friendly cartoon porpoise', 'shark': 'cool cartoon shark',
    'ray': 'flat cartoon ray', 'stingray': 'flat cartoon stingray', 'manta ray': 'majestic cartoon manta ray',
    'eel': 'wiggly cartoon eel', 'octopus': 'smart cartoon octopus', 'squid': 'fast cartoon squid',
    'jellyfish': 'glowing cartoon jellyfish', 'starfish': 'colorful cartoon starfish', 'seahorse': 'tiny cartoon seahorse',
    'crab': 'sideways cartoon crab', 'lobster': 'red cartoon lobster', 'shrimp': 'tiny cartoon shrimp',
    'clam': 'shy cartoon clam', 'oyster': 'pearly cartoon oyster', 'snail': 'slow cartoon snail',
    'slug': 'slimy cartoon slug', 'fish': 'colorful cartoon fish', 'salmon': 'pink cartoon salmon',
    'tuna': 'fast cartoon tuna', 'clownfish': 'orange cartoon clownfish', 'angelfish': 'pretty cartoon angelfish',
    'swordfish': 'fast cartoon swordfish', 'manatee': 'gentle cartoon manatee', 'sea turtle': 'wise cartoon sea turtle',
    'sea otter': 'floating cartoon sea otter', 'hermit crab': 'shy cartoon hermit crab', 'crayfish': 'red cartoon crayfish',
    'prawn': 'small cartoon prawn', 'nautilus': 'spiral cartoon nautilus', 'dugong': 'gentle cartoon dugong',
    // BIRDS
    'bird': 'colorful cartoon bird', 'eagle': 'majestic cartoon eagle', 'hawk': 'sharp cartoon hawk',
    'falcon': 'fast cartoon falcon', 'owl': 'wise cartoon owl', 'condor': 'soaring cartoon condor',
    'crow': 'clever cartoon crow', 'raven': 'dark cartoon raven', 'magpie': 'shiny cartoon magpie',
    'jay': 'blue cartoon jay', 'bluejay': 'blue cartoon bluejay', 'cardinal': 'red cartoon cardinal',
    'robin': 'red-breasted cartoon robin', 'sparrow': 'tiny cartoon sparrow', 'finch': 'tiny cartoon finch',
    'hummingbird': 'tiny cartoon hummingbird', 'woodpecker': 'busy cartoon woodpecker', 'pelican': 'big-beaked cartoon pelican',
    'crane': 'elegant cartoon crane', 'heron': 'tall cartoon heron', 'stork': 'long-legged cartoon stork',
    'swan': 'graceful cartoon swan', 'seagull': 'coastal cartoon seagull', 'albatross': 'soaring cartoon albatross',
    'peacock': 'colorful cartoon peacock', 'pheasant': 'fancy cartoon pheasant', 'quail': 'small cartoon quail',
    'pigeon': 'city cartoon pigeon', 'dove': 'peaceful cartoon dove', 'kingfisher': 'colorful cartoon kingfisher',
    'lovebird': 'cute cartoon lovebird',
    // REPTILES & AMPHIBIANS
    'cobra': 'hooded cartoon cobra', 'viper': 'coiled cartoon viper', 'rattlesnake': 'rattling cartoon rattlesnake',
    'komodo dragon': 'big cartoon komodo dragon', 'monitor lizard': 'big cartoon monitor lizard', 'skink': 'shiny cartoon skink',
    'terrapin': 'spotted cartoon terrapin', 'gavial': 'long-nosed cartoon gavial', 'frog': 'happy cartoon frog',
    'toad': 'bumpy cartoon toad', 'salamander': 'spotted cartoon salamander', 'newt': 'tiny cartoon newt',
    'axolotl': 'smiling cartoon axolotl', 'tadpole': 'baby cartoon tadpole',
    // INSECTS & BUGS
    'butterfly': 'beautiful cartoon butterfly', 'moth': 'fuzzy cartoon moth', 'bee': 'busy cartoon bee',
    'bumblebee': 'fuzzy cartoon bumblebee', 'honeybee': 'golden cartoon honeybee', 'wasp': 'striped cartoon wasp',
    'hornet': 'big cartoon hornet', 'ant': 'tiny cartoon ant', 'termite': 'tiny cartoon termite',
    'beetle': 'shiny cartoon beetle', 'ladybug': 'spotted cartoon ladybug', 'ladybird': 'spotted cartoon ladybird',
    'firefly': 'glowing cartoon firefly', 'lightning bug': 'glowing cartoon lightning bug', 'dragonfly': 'colorful cartoon dragonfly',
    'damselfly': 'delicate cartoon damselfly', 'grasshopper': 'jumping cartoon grasshopper', 'cricket': 'chirping cartoon cricket',
    'locust': 'jumping cartoon locust', 'katydid': 'green cartoon katydid', 'mantis': 'praying cartoon mantis',
    'praying mantis': 'praying cartoon mantis', 'stick insect': 'camouflage cartoon stick insect',
    'walking stick': 'thin cartoon walking stick', 'leaf insect': 'leafy cartoon leaf insect',
    'fly': 'buzzing cartoon fly', 'mosquito': 'tiny cartoon mosquito', 'gnat': 'tiny cartoon gnat',
    'caterpillar': 'fuzzy cartoon caterpillar', 'worm': 'wiggly cartoon worm', 'earthworm': 'pink cartoon earthworm',
    'silkworm': 'white cartoon silkworm', 'glowworm': 'glowing cartoon glowworm', 'inchworm': 'tiny cartoon inchworm',
    'cockroach': 'brown cartoon cockroach', 'cicada': 'singing cartoon cicada', 'aphid': 'tiny cartoon aphid',
    'flea': 'tiny cartoon flea', 'tick': 'tiny cartoon tick', 'stinkbug': 'smelly cartoon stinkbug',
    'water strider': 'skating cartoon water strider', 'dung beetle': 'rolling cartoon dung beetle', 'scarab': 'golden cartoon scarab',
    'weevil': 'long-nosed cartoon weevil',
    // ARACHNIDS & OTHER CRAWLIES
    'spider': 'web-spinning cartoon spider', 'tarantula': 'fuzzy cartoon tarantula', 'black widow': 'dark cartoon spider',
    'scorpion': 'pinchy cartoon scorpion', 'daddy longlegs': 'leggy cartoon daddy longlegs',
    'centipede': 'many-legged cartoon centipede', 'millipede': 'curly cartoon millipede',
    'pillbug': 'rolling cartoon pillbug', 'roly poly': 'rolling cartoon roly poly', 'woodlouse': 'gray cartoon woodlouse',
    // MYTHICAL & FANTASY
    'dragon': 'friendly cartoon dragon', 'unicorn': 'magical cartoon unicorn', 'phoenix': 'fiery cartoon phoenix',
    'griffin': 'majestic cartoon griffin', 'pegasus': 'winged cartoon pegasus', 'mermaid': 'beautiful cartoon mermaid',
    'fairy': 'tiny cartoon fairy', 'fairies': 'tiny cartoon fairies', 'pixie': 'sparkly cartoon pixie',
    'gnome': 'tiny cartoon gnome', 'troll': 'friendly cartoon troll', 'goblin': 'mischievous cartoon goblin',
    'elf': 'pointy-eared cartoon elf', 'centaur': 'half-horse cartoon centaur', 'hydra': 'many-headed cartoon hydra',
    'kraken': 'giant cartoon kraken', 'yeti': 'fluffy cartoon yeti', 'bigfoot': 'fuzzy cartoon bigfoot',
    'dinosaur': 'friendly cartoon dinosaur', 't-rex': 'big cartoon t-rex', 'triceratops': 'horned cartoon triceratops',
    'stegosaurus': 'plated cartoon stegosaurus', 'pterodactyl': 'flying cartoon pterodactyl', 'velociraptor': 'fast cartoon velociraptor',
    'brontosaurus': 'long-necked cartoon brontosaurus',
    // MISCELLANEOUS
    'bat': 'flying cartoon bat', 'flying fox': 'big cartoon flying fox', 'panda': 'cute cartoon panda',
    'red panda': 'fluffy cartoon red panda', 'binturong': 'fuzzy cartoon binturong', 'civet': 'spotted cartoon civet',
    'mongoose': 'quick cartoon mongoose', 'aardvark': 'long-nosed cartoon aardvark', 'pangolin': 'scaly cartoon pangolin',
    'okapi': 'striped cartoon okapi',
    // ROBOTS & OTHER
    'robot': 'friendly cartoon robot', 'alien': 'friendly cartoon alien', 'aliens': 'friendly cartoon aliens',
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
 * CRITICAL: Block realistic styles and common SDXL substitution animals
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean, species?: string): string {
  // Base exclusions for all images - STRONGLY block realistic/photorealistic
  let base = "photorealistic, realistic, photograph, photo, real, lifelike, hyperrealistic, " +
    "3D render, 3D, CGI, rendered, unreal engine, blender, " +
    "sketch, pencil drawing, line art, black and white, grayscale, monochrome, " +
    "anime, manga, " +
    "text, watermark, logo, signature";

  // Always exclude humans for animal-only stories
  if (isAnimal) {
    base += ", human, person, boy, girl, child, man, woman, people, face, portrait";

    // CRITICAL: Block ALL common SDXL substitution animals
    // SDXL tends to draw these instead of the correct animal
    const commonWrongAnimals = [
      'chicken', 'rooster', 'hen', 'chick',
      'penguin', 'bird', 'duck', 'goose',
      'owl', 'eagle', 'crow',
      'cat', 'dog', 'rabbit', 'bunny',
      'fox', 'wolf',
      'furry', 'feathers', 'beak', 'wings'
    ];

    // Filter out the correct species from wrong animals list
    const filteredWrong = species
      ? commonWrongAnimals.filter(a => a !== species && !species.includes(a))
      : commonWrongAnimals;

    base += `, ${filteredWrong.join(', ')}`;
  }

  // Add any scene-specific forbidden elements
  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    const uniqueForbidden = card.forbidden_elements
      .filter(e => !base.includes(e))
      .slice(0, 5);
    if (uniqueForbidden.length > 0) {
      base += `, ${uniqueForbidden.join(', ')}`;
    }
  }

  console.log(`[NEGATIVE PROMPT]: ${base}`);
  return base;
}

export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
