import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * UNIVERSAL PROMPT RENDERER
 *
 * Architecture:
 * 1. CharacterBible (once per story) → visual_fingerprint
 * 2. PageSceneCard (per page) → must_include list
 * 3. Template A → structured prompt that SDXL follows reliably
 *
 * SDXL Attention Rules:
 * - Tokens 1-20: HIGHEST attention (character + critical object)
 * - Tokens 20-40: HIGH attention (style + setting)
 * - Tokens 40-77: MEDIUM attention (action + details)
 * - Tokens 77+: LOW/IGNORED
 */

// ============================================================================
// SCENE CARD EXTRACTION - Convert raw page text into structured SceneCard
// ============================================================================

/**
 * Extract a structured SceneCard from page text
 * This is the KEY function that makes prompts reliable
 */
export function extractSceneCard(
  pageNumber: number,
  pageText: string,
  bible: CharacterBible
): PageSceneCard {
  const text = pageText.toLowerCase();
  const charName = bible.name;

  console.log(`\n====== EXTRACTING SCENE CARD FOR PAGE ${pageNumber} ======`);

  // Extract setting
  const setting = extractSetting(text);
  console.log(`[SETTING]: ${setting}`);

  // Extract action
  const action = extractAction(text, charName);
  console.log(`[ACTION]: ${action}`);

  // Extract must_include items (CRITICAL)
  const must_include = extractMustInclude(text, charName, bible.species || 'animal');
  console.log(`[MUST_INCLUDE]: ${must_include.join(', ')}`);

  // Extract supporting characters
  const supporting_characters = extractSupportingCharacters(text, charName);
  console.log(`[SUPPORTING]: ${supporting_characters.join(', ')}`);

  // Extract key objects
  const key_objects = extractKeyObjects(text);
  console.log(`[OBJECTS]: ${key_objects.join(', ')}`);

  // Determine camera shot
  const camera = determineCameraShot(text, must_include.length);

  // Build must_not_include (dynamic negatives)
  const must_not_include = buildMustNotInclude(bible.character_type === 'animal', bible.species);

  // Determine mood
  const mood = extractMood(text);

  console.log(`====== END SCENE CARD EXTRACTION ======\n`);

  return {
    page_number: pageNumber,
    scene_id: `page_${pageNumber}`,
    setting,
    time_weather: '',
    action,
    must_include,
    must_not_include,
    supporting_characters,
    key_objects,
    mood,
    camera
  };
}

/**
 * Extract setting from text - checks ground-based settings FIRST
 */
function extractSetting(text: string): string {
  // GROUND-BASED (check first to avoid title contamination)
  if (text.includes('savannah') || text.includes('savanna') || text.includes('grassland')) {
    if (text.includes('rocket') || text.includes('spaceship')) {
      return 'African savannah with golden grass, rocket ship visible';
    }
    return 'African savannah with golden grass and acacia trees';
  }
  if (text.includes('jungle') || text.includes('rainforest')) {
    return 'lush green jungle with vines';
  }
  if (text.includes('forest') || text.includes('woods')) {
    return 'magical forest with tall trees';
  }
  if (text.includes('beach') || text.includes('shore')) {
    return 'sunny beach with sand and waves';
  }
  if (text.includes('ocean') || text.includes('underwater') || text.includes('sea')) {
    return 'underwater ocean with coral and fish';
  }

  // SPACE/MOON (check after ground)
  if (text.includes('crater') || text.includes('moon surface') || text.includes('lunar surface')) {
    return 'grey moon surface with craters, Earth in starry sky';
  }
  if (text.includes('moon rabbit') || text.includes('lunar guardian')) {
    return 'moon surface with craters, magical atmosphere';
  }
  if (text.includes('lunar') || (text.includes('moon') && !text.includes('moonlight'))) {
    return 'moon surface with craters and stars';
  }
  if (text.includes('inside') && (text.includes('rocket') || text.includes('spaceship'))) {
    return 'inside rocket ship cockpit with windows showing space';
  }
  if (text.includes('space') || text.includes('stars') || text.includes('galaxy')) {
    return 'outer space with stars and planets';
  }
  if (text.includes('rocket') || text.includes('spaceship')) {
    return 'rocket ship in colorful space';
  }

  // INDOOR
  if (text.includes('home') || text.includes('house') || text.includes('bedroom')) {
    return 'cozy home interior';
  }
  if (text.includes('castle') || text.includes('palace')) {
    return 'magical castle interior';
  }

  return 'colorful storybook scene';
}

/**
 * Extract action from text
 */
function extractAction(text: string, charName: string): string {
  const name = charName.toLowerCase();

  // Check for specific actions
  if (text.includes('wave') || text.includes('waving')) return `${charName} waves happily`;
  if (text.includes('welcome') || text.includes('greeted')) return `${charName} being welcomed by friends`;
  if (text.includes('explore') || text.includes('exploring')) return `${charName} explores curiously`;
  if (text.includes('discover') || text.includes('found') || text.includes('stumbled')) return `${charName} discovers something amazing`;
  if (text.includes('flying') || text.includes('soar')) return `${charName} flying through the scene`;
  if (text.includes('float') || text.includes('weightless')) return `${charName} floating weightlessly`;
  if (text.includes('land') || text.includes('arrived')) return `${charName} has just landed`;
  if (text.includes('play') || text.includes('playing')) return `${charName} plays joyfully`;
  if (text.includes('run') || text.includes('running')) return `${charName} runs with joy`;
  if (text.includes('swim') || text.includes('swimming')) return `${charName} swims happily`;
  if (text.includes('climb') || text.includes('climbing')) return `${charName} climbs eagerly`;
  if (text.includes('look') || text.includes('gaze') || text.includes('marvel')) return `${charName} gazes in wonder`;

  return `${charName} in the scene with happy expression`;
}

/**
 * Extract MUST_INCLUDE items - these are NON-NEGOTIABLE
 */
function extractMustInclude(text: string, charName: string, species: string): string[] {
  const items: string[] = [];

  // ALWAYS include main character
  items.push(`${charName} the ${species} full body`);

  // VEHICLES
  if (text.includes('rocket') || text.includes('spaceship')) {
    if (text.includes('inside') || text.includes('cockpit') || text.includes('seat')) {
      items.push('rocket ship cockpit interior');
    } else {
      items.push('colorful rocket ship');
    }
  }

  // CHARACTERS/CREATURES
  if (text.includes('moon rabbit')) {
    // Count if mentioned
    if (text.includes('group') || text.includes('friends')) {
      items.push('group of moon rabbits');
    } else if (text.includes('two')) {
      items.push('two moon rabbits');
    } else {
      items.push('moon rabbits');
    }
  }
  if (text.includes('dolphin')) {
    items.push('playful dolphins');
  }
  if (text.includes('whale')) {
    items.push('friendly whale');
  }
  if (text.includes('butterfly') || text.includes('butterflies')) {
    items.push('colorful butterflies');
  }

  // OBJECTS
  if (text.includes('flag') && (text.includes('plant') || text.includes('moon') || text.includes('crater'))) {
    items.push('small flag');
  }
  if (text.includes('crater')) {
    items.push('moon craters');
  }
  if (text.includes('treasure') || text.includes('chest')) {
    items.push('treasure chest');
  }
  if (text.includes('crown')) {
    items.push('golden crown');
  }
  if (text.includes('balloon')) {
    items.push('colorful balloons');
  }
  if (text.includes('rainbow')) {
    items.push('rainbow in sky');
  }

  return items;
}

/**
 * Extract supporting characters
 */
function extractSupportingCharacters(text: string, mainChar: string): string[] {
  const chars: string[] = [];
  const main = mainChar.toLowerCase();

  const patterns = [
    { pattern: /moon\s*rabbits?/i, char: 'moon rabbits' },
    { pattern: /lunar\s*guardians?/i, char: 'lunar guardians' },
    { pattern: /\bdolphins?\b/i, char: 'dolphins' },
    { pattern: /\bwhales?\b/i, char: 'whale' },
    { pattern: /\bbutterfl(?:y|ies)\b/i, char: 'butterflies' },
    { pattern: /\bbirds?\b/i, char: 'birds' },
    { pattern: /\bfish\b/i, char: 'fish' },
    { pattern: /\bfriends?\b/i, char: 'friends' },
  ];

  for (const { pattern, char } of patterns) {
    if (pattern.test(text) && !main.includes(char)) {
      chars.push(char);
    }
  }

  return chars.slice(0, 3); // Max 3 supporting characters
}

/**
 * Extract key objects from text
 */
function extractKeyObjects(text: string): string[] {
  const objects: string[] = [];

  const patterns = [
    { pattern: /rocket|spaceship/i, obj: 'rocket ship' },
    { pattern: /flag/i, obj: 'flag' },
    { pattern: /crater/i, obj: 'craters' },
    { pattern: /treasure|chest/i, obj: 'treasure chest' },
    { pattern: /crown/i, obj: 'crown' },
    { pattern: /balloon/i, obj: 'balloons' },
    { pattern: /rainbow/i, obj: 'rainbow' },
    { pattern: /telescope/i, obj: 'telescope' },
    { pattern: /map/i, obj: 'map' },
  ];

  for (const { pattern, obj } of patterns) {
    if (pattern.test(text)) {
      objects.push(obj);
    }
  }

  return objects.slice(0, 4);
}

/**
 * Determine camera shot based on scene complexity
 */
function determineCameraShot(text: string, mustIncludeCount: number): { shot_type: "wide" | "medium" | "close-up"; composition_notes: string } {
  // More items = wider shot needed
  if (mustIncludeCount >= 4) {
    return { shot_type: 'wide', composition_notes: 'Show all required elements clearly' };
  }
  if (text.includes('face') || text.includes('expression') || text.includes('eyes')) {
    return { shot_type: 'close-up', composition_notes: 'Focus on character expression' };
  }
  return { shot_type: 'medium', composition_notes: 'Balance character and scene' };
}

/**
 * Build must_not_include list (dynamic negatives)
 */
function buildMustNotInclude(isAnimal: boolean, species?: string): string[] {
  const base = ['text', 'watermark', 'logo', 'signature', 'realistic photo', 'scary', 'horror'];

  if (isAnimal) {
    base.push('human', 'person', 'boy', 'girl', 'child', 'face closeup');

    // Add common SDXL substitutions to avoid
    const wrongAnimals = ['chicken', 'hen', 'rooster', 'penguin', 'duck'];
    const filtered = wrongAnimals.filter(a => a !== species && !species?.includes(a));
    base.push(...filtered);
  }

  return base;
}

/**
 * Extract mood from text
 */
function extractMood(text: string): string {
  if (text.includes('excit') || text.includes('thrill')) return 'excited, adventurous';
  if (text.includes('wonder') || text.includes('amaz') || text.includes('marvel')) return 'wonder, awe';
  if (text.includes('happy') || text.includes('joy') || text.includes('laugh')) return 'happy, playful';
  if (text.includes('curious') || text.includes('discover')) return 'curious, exploratory';
  if (text.includes('brave') || text.includes('courage')) return 'brave, determined';
  if (text.includes('friend') || text.includes('welcome')) return 'friendly, warm';
  return 'joyful, adventurous';
}

// ============================================================================
// VISUAL FINGERPRINT - Build consistent character description
// ============================================================================

/**
 * Build visual fingerprint from CharacterBible
 * Returns comma-separated string of visual descriptors
 */
export function buildVisualFingerprint(bible: CharacterBible): string {
  // If bible has visual_fingerprint, use it
  if (bible.visual_fingerprint && bible.visual_fingerprint.length > 0) {
    return bible.visual_fingerprint.join(', ');
  }

  // Otherwise, build from appearance
  const parts: string[] = [];

  if (bible.species) {
    parts.push(`cute cartoon ${bible.species}`);
  }
  if (bible.appearance?.skin_tone) {
    parts.push(bible.appearance.skin_tone);
  }
  if (bible.appearance?.eyes) {
    parts.push(bible.appearance.eyes);
  }
  if (bible.appearance?.face_features) {
    parts.push(bible.appearance.face_features);
  }

  return parts.join(', ') || `cute cartoon ${bible.species || 'animal'}`;
}

// ============================================================================
// TEMPLATE A - UNIVERSAL PAGE ILLUSTRATION PROMPT
// ============================================================================

/**
 * TEMPLATE A - Universal Page Illustration
 *
 * Structure optimized for SDXL attention:
 * 1. CHARACTER LOCK (tokens 1-15) - species + fingerprint
 * 2. MUST SHOW (tokens 15-35) - required items
 * 3. SCENE (tokens 35-55) - setting + action
 * 4. STYLE (tokens 55-77) - render style
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  // If we have page text but card is minimal, extract a proper card
  let sceneCard = card;
  if (pageText && (!card.must_include || card.must_include.length === 0)) {
    sceneCard = extractSceneCard(card.page_number, pageText, bible);
  }

  const charName = bible.name;
  const species = bible.species || bible.character_type || 'animal';
  const fingerprint = buildVisualFingerprint(bible);
  const outfit = bible.outfit || bible.signature_outfit || '';

  // Get style settings
  const styleBase = bible.style?.base || "children's picture book illustration";
  const styleRender = bible.style?.render?.join(', ') || "clean lines, vibrant colors, soft shading";

  console.log(`\n====== TEMPLATE A PROMPT BUILD ======`);
  console.log(`Character: ${charName} the ${species}`);
  console.log(`Fingerprint: ${fingerprint}`);
  console.log(`Setting: ${sceneCard.setting}`);
  console.log(`Action: ${sceneCard.action}`);
  console.log(`Must Include: ${sceneCard.must_include.join(', ')}`);

  // BUILD PROMPT using Template A structure

  // 1. CHARACTER LOCK (highest attention)
  const characterLock = `${charName} the cute cartoon ${species}, ${fingerprint}`;

  // 2. MUST SHOW (high attention) - limit to top 4 items
  const mustShowItems = sceneCard.must_include.slice(0, 4).join(', ');
  const mustShow = mustShowItems ? `showing ${mustShowItems}` : '';

  // 3. SCENE (medium attention)
  const scene = `Scene: ${sceneCard.setting}. ${sceneCard.action}`;

  // 4. STYLE (end of attention window)
  const style = `${styleBase}, ${styleRender}`;

  // 5. Outfit if present
  const outfitStr = outfit ? `Wearing ${outfit}.` : '';

  // Combine with attention-optimized order
  let prompt = `${characterLock}. ${mustShow}. ${scene}. ${outfitStr} ${style}. No text.`;

  // Clean up extra spaces/periods
  prompt = prompt.replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();

  console.log(`[FINAL PROMPT]: ${prompt}`);
  console.log(`[PROMPT LENGTH]: ~${prompt.split(' ').length} words`);
  console.log(`====== END TEMPLATE A ======\n`);

  return prompt;
}

// ============================================================================
// NEGATIVE PROMPT - Smart defaults + dynamic negatives
// ============================================================================

/**
 * Build negative prompt from card's must_not_include + smart defaults
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean, species?: string): string {
  // Base negatives (always include)
  const base = [
    'photorealistic', 'realistic', 'photograph', 'photo', '3D render', '3D', 'CGI',
    'sketch', 'pencil drawing', 'black and white', 'grayscale',
    'text', 'watermark', 'logo', 'signature',
    'scary', 'horror', 'gore', 'weapon'
  ];

  // Add card's must_not_include
  if (card.must_not_include) {
    for (const item of card.must_not_include) {
      if (!base.includes(item)) {
        base.push(item);
      }
    }
  }

  // Add human exclusions for animal stories
  if (isAnimal) {
    base.push('human', 'person', 'boy', 'girl', 'child', 'man', 'woman', 'portrait', 'hands');

    // Block common SDXL wrong substitutions
    const wrongAnimals = ['chicken', 'hen', 'rooster', 'chick', 'penguin', 'bird', 'duck', 'owl'];
    const filtered = wrongAnimals.filter(a => a !== species && !species?.includes(a));
    base.push(...filtered);
  }

  const negative = base.join(', ');
  console.log(`[NEGATIVE PROMPT]: ${negative}`);
  return negative;
}

// ============================================================================
// SEED STRATEGY - Consistent seeds per story
// ============================================================================

/**
 * Generate deterministic seed from story ID
 * Using same seed for whole book reduces character drift
 */
export function generateStorySeed(storyId: string): number {
  let hash = 0;
  for (let i = 0; i < storyId.length; i++) {
    const char = storyId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2147483647; // Keep in valid seed range
}

/**
 * Generate page seed (consistent but slightly varied per page)
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}

// ============================================================================
// TEMPLATE C - CHARACTER SHEET (for reference image)
// ============================================================================

/**
 * Generate character sheet prompt for reference image
 * Run this ONCE per story to establish character look
 */
export function renderCharacterSheetPrompt(bible: CharacterBible): string {
  const charName = bible.name;
  const species = bible.species || 'animal';
  const fingerprint = buildVisualFingerprint(bible);
  const styleBase = bible.style?.base || "children's picture book illustration";

  const prompt = `CHARACTER SHEET: ${charName} the cute cartoon ${species}. Full body reference. ` +
    `${fingerprint}. Neutral pose, friendly smile. ` +
    `Three views: front view, side view, 3/4 view. ` +
    `Plain light background. ` +
    `${styleBase}, clean lines, vibrant colors, soft shading. No text.`;

  console.log(`[CHARACTER SHEET PROMPT]: ${prompt}`);
  return prompt;
}

// ============================================================================
// TEMPLATE B - COVER IMAGE
// ============================================================================

/**
 * Generate book cover prompt
 */
export function renderCoverPrompt(bible: CharacterBible, storyTitle: string): string {
  const charName = bible.name;
  const species = bible.species || 'animal';
  const fingerprint = buildVisualFingerprint(bible);
  const styleBase = bible.style?.base || "children's picture book illustration";

  const prompt = `BOOK COVER: ${charName} the cute cartoon ${species}. ` +
    `${fingerprint}. ` +
    `Big friendly title space at top (leave blank area). ` +
    `Magical colorful scene with sparkles. ` +
    `${styleBase}, clean lines, vibrant colors, soft shading. ` +
    `Eye-catching, inviting, child-friendly. No text.`;

  console.log(`[COVER PROMPT]: ${prompt}`);
  return prompt;
}
