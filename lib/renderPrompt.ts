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
  // ── Helper: is "moon" only in compound/reference form? ──
  // "moon creatures", "moon friends", "about the moon", "stories about the moon" etc.
  // are references TO the moon, not scenes ON the moon.
  const moonCompoundPattern = /moon\s+(?:creature|creatures|friend|friends|rabbit|rabbits|bunny|bunnies)|moonlight|moon'?s?\s+light|(?:about|of|from)\s+(?:the\s+)?moon/i;
  const hasMoonCompound = moonCompoundPattern.test(text);
  const textWithoutMoonCompounds = text
    .replace(/moon\s+(?:creature|creatures|friend|friends|rabbit|rabbits|bunny|bunnies)/gi, '')
    .replace(/moonlight/gi, '')
    .replace(/moon'?s?\s+light/gi, '')
    .replace(/(?:about|of|from|stories\s+about|tales\s+of)\s+(?:the\s+)?moon/gi, '')
    .replace(/(?:under|beneath)\s+(?:the\s+)?moon/gi, '');
  const hasBareMoon = /\bmoon\b/i.test(textWithoutMoonCompounds);
  // Only treat "moon" as a location when it's NOT just in compound form
  const moonIsLocation = hasBareMoon || !hasMoonCompound;

  // SCENE-DEFINING ACTIVITIES (check first — picnic, sunset, celebration override location)
  if (/sun\s+began\s+to\s+set/i.test(text) || text.includes('sunset')) {
    return 'Beautiful outdoor sunset scene with orange and pink sky';
  }
  if (text.includes('picnic')) {
    return 'Outdoor picnic scene on green grass with food and blanket';
  }
  if (text.includes('celebrated') || text.includes('celebrating') || text.includes('celebration') || text.includes('sang songs')) {
    return 'Outdoor celebration scene with warm golden light';
  }

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
  if (text.includes('meadow') || text.includes('field')) {
    if (text.includes('rocket') || text.includes('spaceship')) {
      return 'bright green meadow with flowers, rocket ship visible in the sky';
    }
    return 'bright green meadow with colorful flowers';
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
  // "moon rabbit", "moon bunny" → only moon surface if character is ON the moon
  if ((text.includes('moon rabbit') || text.includes('moon bunn') || text.includes('lunar guardian')) && moonIsLocation) {
    return 'moon surface with craters, magical atmosphere';
  }
  if (text.includes('lunar') || (moonIsLocation && text.includes('moon') && !text.includes('moonlight'))) {
    return 'moon surface with craters and stars';
  }
  if (text.includes('inside') && (text.includes('rocket') || text.includes('spaceship'))) {
    return 'colorful rocket ship on bright green meadow under blue sky';
  }
  if (text.includes('space') || text.includes('stars') || text.includes('galaxy')) {
    return 'colorful alien planet surface with stars and planets in the sky';
  }
  if (text.includes('rocket') || text.includes('spaceship')) {
    return 'colorful rocket ship on bright green meadow under blue sky';
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
 * Extract action from text — returns POSE-ORIENTED descriptions.
 *
 * These feed into the Template A prompt's scene section AND are used
 * by actionToPose() in the image pipeline to inject body positions
 * into the inpaint prompt. Descriptive actions = distinct poses per page.
 *
 * Uses regex patterns to match ALL verb tenses (past, present, participle)
 * because story text is typically past tense ("danced", "swam").
 */
function extractAction(text: string, charName: string): string {
  // Priority 1: Multi-word compound actions (most specific, unambiguous)
  // Physical actions BEFORE emotional states.
  // NOTE: "spotted", "noticed", "worried", "nervous" are NOT here — they're too ambiguous
  if (text.includes('froze') || text.includes('frozen') || text.includes('freezing')) return `${charName} standing frozen stiff with wide scared eyes`;
  if (text.includes('pressed a') || text.includes('pressing a') || text.includes('pressed the') || text.includes('pressing the')) return `${charName} pressing a button with one hand excitedly`;
  // Physical exit actions — BEFORE squeezing
  if (text.includes('tumbled out') || text.includes('tumbling out')) return `${charName} tumbling out happily with legs splayed`;
  if (text.includes('hopped out') || text.includes('hopping out')) return `${charName} hopping out energetically with a big smile`;
  // Scene-defining activities — BEFORE splash (picnic/stories/celebration are the KEY scene, not incidental water)
  if (text.includes('picnic')) return `${charName} sitting on the ground eating happily at a picnic`;
  if (text.includes('shared stories') || text.includes('sharing stories') || text.includes('told stories')) return `${charName} sitting and talking happily with animated gestures`;
  if (text.includes('sang songs') || text.includes('singing songs')) return `${charName} singing happily with mouth open wide`;
  if (text.includes('celebrated') || text.includes('celebrating')) return `${charName} celebrating with both arms raised high`;
  // Water actions
  if (text.includes('splash')) return `${charName} splashing in water with legs kicking`;
  if (text.includes('squeezed') || text.includes('squeezing')) return `${charName} squeezing through eagerly with a determined face`;
  if (text.includes('stepped outside') || text.includes('stepped onto')) return `${charName} stepping forward with one foot out looking around in awe`;
  if (text.includes('stepped out')) return `${charName} stepping forward with one foot out looking around in awe`;
  if (text.includes('stepped forward') || text.includes('stepping forward')) return `${charName} stepping forward bravely with one arm raised`;
  if (text.includes('waddled') || text.includes('waddling')) return `${charName} waddling forward with a big happy grin`;
  // Original compounds
  if (text.includes('blasted off') || text.includes('blast off')) return `${charName} blasting off excitedly with arms raised`;
  if (text.includes('soared over') || text.includes('soaring over')) return `${charName} soaring high with arms spread wide`;
  if (text.includes('flew over') || text.includes('flying over')) return `${charName} flying forward with arms outstretched`;
  if (text.includes('landed safely') || text.includes('safe landing')) return `${charName} landing with feet touching down`;
  if (text.includes('climbed inside') || text.includes('climbing inside') || text.includes('climbed into')) return `${charName} climbing forward eagerly`;
  if (text.includes('taking off') || text.includes('took off')) return `${charName} leaping upward excitedly`;
  if (text.includes('dived in') || text.includes('dove in') || text.includes('jumped in')) return `${charName} diving forward arms first`;

  // Priority 2: Single verbs with pose detail — regex for all tenses
  // Physical movement verbs FIRST, perception verbs LAST
  if (/\b(?:fl(?:y|ying|ew|ies))\b/.test(text) || /\b(?:soar(?:ed|ing|s)?)\b/.test(text)) return `${charName} soaring with arms spread wide`;
  if (/\b(?:sw[ai]mm?(?:ing|s)?|swam)\b/.test(text)) return `${charName} swimming forward with legs kicking`;
  if (/\b(?:hopp?(?:ed|ing|s)?)\b/.test(text)) return `${charName} hopping up and down excitedly`;
  if (/\b(?:float(?:ed|ing|s)?|weightless)\b/.test(text)) return `${charName} floating weightlessly with limbs spread`;
  if (/\b(?:r[au]n(?:ning|s)?)\b/.test(text)) return `${charName} running forward with legs in stride`;
  if (/\b(?:walk(?:ed|ing|s)?)\b/.test(text)) return `${charName} walking forward with one foot ahead`;
  if (/\b(?:jump(?:ed|ing|s)?|leap(?:ed|ing|s|t)?)\b/.test(text)) return `${charName} jumping up with legs off the ground`;
  if (/\b(?:climb(?:ed|ing|s)?)\b/.test(text)) return `${charName} climbing upward with arms reaching high`;
  if (/\b(?:danc(?:e[ds]?|ing))\b/.test(text)) return `${charName} dancing joyfully with arms raised`;
  if (/\b(?:div(?:e[ds]?|ing)|dove)\b/.test(text)) return `${charName} diving downward arms first`;
  if (/\b(?:sl(?:id[es]?|ide|iding))\b/.test(text)) return `${charName} sliding forward playfully`;
  if (/\b(?:sp[iu]n(?:ning|s)?)\b/.test(text)) return `${charName} spinning around with arms out`;
  if (/\b(?:skip(?:ped|ping|s)?)\b/.test(text)) return `${charName} skipping forward happily`;
  if (/\b(?:march(?:ed|ing|es)?)\b/.test(text)) return `${charName} marching forward with big confident steps`;
  if (/\b(?:sneak(?:ed|ing|s)?|snuck)\b/.test(text)) return `${charName} crouching and sneaking forward quietly`;
  if (/\b(?:lumber(?:ed|ing|s)?)\b/.test(text)) return `${charName} lumbering forward with heavy steps`;
  if (/\b(?:approach(?:ed|ing|es)?)\b/.test(text)) return `${charName} walking forward carefully with arms at sides`;
  if (/\b(?:ventur(?:e[ds]?|ing))\b/.test(text)) return `${charName} walking forward looking around curiously`;
  // Social/interactive verbs
  if (/\b(?:play(?:ed|ing|s)?)\b/.test(text)) return `${charName} bouncing playfully mid-motion`;
  if (/\b(?:explor(?:e[ds]?|ing))\b/.test(text)) return `${charName} walking forward looking around curiously`;
  if (/\b(?:discover(?:ed|ing|s)?|found|stumbled)\b/.test(text)) return `${charName} leaning forward curiously reaching out`;
  if (/\b(?:wav(?:e[ds]?|ing))\b/.test(text)) return `${charName} waving one arm up high`;
  if (/\bwelcom(?:e[ds]?|ing)\b/.test(text) || text.includes('greeted')) return `${charName} waving happily with one arm raised`;
  if (/\b(?:laugh(?:ed|ing|s|ter)?)\b/.test(text)) return `${charName} laughing with head tilted back happily`;
  if (/\b(?:hugg?(?:ed|ing|s)?)\b/.test(text)) return `${charName} hugging with arms wrapped warmly`;
  if (/\b(?:cheer(?:ed|ing|s)?)\b/.test(text)) return `${charName} cheering with both arms raised high`;
  if (/\b(?:lead(?:ing|s)?|led)\b/.test(text)) return `${charName} walking forward confidently arm raised`;
  if (/\b(?:guid(?:e[ds]?|ing))\b/.test(text)) return `${charName} steering forward with arms out confidently`;
  if (/\b(?:sl(?:eep|ept)(?:ing|s)?)\b/.test(text)) return `${charName} curled up sleeping peacefully`;
  if (/\b(?:s[au]ng|sing(?:ing|s)?)\b/.test(text)) return `${charName} singing happily with mouth open wide`;
  if (/\b(?:bounc(?:e[ds]?|ing))\b/.test(text)) return `${charName} bouncing up mid-jump`;
  // Perception/state verbs — LAST (weakest visual cues)
  if (/\b(?:look(?:ed|ing|s)?|gaz(?:e[ds]?|ing)|marvel)\b/.test(text)) return `${charName} looking upward with wide eyes in awe`;
  if (/\b(?:spot(?:ted|ting|s)?)\b/.test(text)) return `${charName} looking up with wide surprised eyes pointing forward`;
  if (/\b(?:notic(?:e[ds]?|ing))\b/.test(text)) return `${charName} looking up with wide surprised eyes pointing forward`;
  if (/\b(?:land(?:ed|ing|s)?|arriv(?:ed|ing|es?))\b/.test(text)) return `${charName} landing with feet touching down`;
  if (/\b(?:point(?:ed|ing|s)?)\b/.test(text)) return `${charName} pointing forward excitedly`;
  if (/\b(?:eat(?:ing|s|en)?|ate)\b/.test(text)) return `${charName} sitting down eating happily`;
  if (/\b(?:read(?:ing|s)?)\b/.test(text)) return `${charName} sitting and holding a book`;

  // Priority 3: Emotion-based pose
  if (/\bexcit(?:ed|edly|ement|ing)\b/.test(text) || text.includes('thrill')) return `${charName} jumping excitedly with arms raised`;
  if (/\bwonder(?:ing|s)?\b/.test(text) && !text.includes('wonderful')) return `${charName} gazing upward in wonder`;
  if (/\bamazed?\b/.test(text)) return `${charName} gazing upward in wonder`;
  if (text.includes('curious')) return `${charName} leaning forward curiously`;
  if (/\bhapp(?:y|ily|iness)\b/.test(text) || /\bjoy(?:ful|fully|ous|ously)?\b/.test(text)) return `${charName} bouncing joyfully mid-jump`;
  if (text.includes('brave') || text.includes('courage')) return `${charName} standing tall with a determined pose`;
  if (/\bworried\b/.test(text) || /\bnervous\b/.test(text) || /\bscar(?:ed|y)\b/.test(text) || /\bafraid\b/.test(text)) return `${charName} standing nervously with a worried expression`;

  return `${charName} standing with one arm waving happily`;
}

/**
 * Extract MUST_INCLUDE items - these are NON-NEGOTIABLE
 */
function extractMustInclude(text: string, charName: string, species: string): string[] {
  const items: string[] = [];

  // ALWAYS include main character
  items.push(`${charName} the ${species} full body`);

  // VEHICLES - always show rocket from outside (interior scenes generate humans)
  if (text.includes('rocket') || text.includes('spaceship')) {
    items.push('colorful rocket ship');
  }

  // CHARACTERS/CREATURES
  if (text.includes('moon rabbit') || text.includes('moon bunn') || text.includes('moon rabbits') || text.includes('moon bunnies')) {
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
    { pattern: /moon\s*(?:rabbits?|bunn(?:y|ies))/i, char: 'moon rabbits' },
    { pattern: /lunar\s*guardians?/i, char: 'lunar guardians' },
    { pattern: /\bdolphins?\b/i, char: 'dolphins' },
    { pattern: /\bwhales?\b/i, char: 'whale' },
    { pattern: /\blions?\b/i, char: 'lions' },
    { pattern: /\bbutterfl(?:y|ies)\b/i, char: 'butterflies' },
    { pattern: /\bbirds?\b/i, char: 'birds' },
    { pattern: /\bfish\b/i, char: 'fish' },
    { pattern: /\bbears?\b/i, char: 'bears' },
    { pattern: /\brabbits?\b|\bbunnies\b|\bbunny\b/i, char: 'rabbits' },
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
 *
 * CRITICAL: This fingerprint must be SPECIFIC and LOCKED
 * - Include exact colors (not "gray" but "light gray")
 * - Include exact features (not "horn" but "small rounded horn")
 * - Include eye color explicitly
 */
export function buildVisualFingerprint(bible: CharacterBible): string {
  // If bible has visual_fingerprint, use it (with enhancements)
  if (bible.visual_fingerprint && bible.visual_fingerprint.length > 0) {
    const fingerprint = bible.visual_fingerprint.join(', ');
    // Add species-specific locked features if not already present
    const species = bible.species?.toLowerCase() || '';
    if (species.includes('rhino') && !fingerprint.includes('horn')) {
      return `${fingerprint}, prominent rounded horn on nose, thick legs`;
    }
    return fingerprint;
  }

  // Otherwise, build from appearance with SPECIFIC details
  const parts: string[] = [];

  // Species with body type
  if (bible.species) {
    const species = bible.species.toLowerCase();
    if (species.includes('rhino')) {
      parts.push('cartoon rhinoceros');
      parts.push('prominent rounded horn on nose');
      parts.push('thick barrel-shaped body');
    } else {
      parts.push(`cute cartoon ${bible.species}`);
    }
  }

  // Skin/fur color - make it specific
  if (bible.appearance?.skin_tone) {
    const tone = bible.appearance.skin_tone;
    // Make generic colors more specific
    if (tone === 'gray' || tone === 'grey') {
      parts.push('light gray skin');
    } else if (tone === 'brown') {
      parts.push('warm brown skin');
    } else {
      parts.push(tone);
    }
  }

  // Eyes - always include color
  if (bible.appearance?.eyes) {
    parts.push(bible.appearance.eyes);
  } else {
    parts.push('big friendly eyes');
  }

  // Face features
  if (bible.appearance?.face_features) {
    parts.push(bible.appearance.face_features);
  } else {
    parts.push('round cheeks');
    parts.push('friendly smile');
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

  // BUILD PROMPT using Template A structure with LOCKED IDENTITY

  // 1. CHARACTER LOCK (highest attention) - with identity consistency instruction
  const characterLock = `${charName} the cartoon ${species}`;

  // 2. FINGERPRINT LOCK - CRITICAL: These details must NOT change between pages
  // Add explicit instruction to maintain consistency
  const fingerprintLock = `CHARACTER FINGERPRINT (do not change): ${fingerprint}. ` +
    `Same face shape, same eye color, same body proportions every time.`;

  // 3. MUST SHOW (high attention) - limit to top 4 items
  const mustShowItems = sceneCard.must_include.slice(0, 4).join(', ');
  const mustShow = mustShowItems ? `showing ${mustShowItems}` : '';

  // 4. SCENE (medium attention)
  const scene = `Scene: ${sceneCard.setting}. ${sceneCard.action}`;

  // 5. STYLE (end of attention window)
  const style = `${styleBase}, ${styleRender}`;

  // 6. Outfit LOCK - same outfit every page
  const outfitStr = outfit ? `Wearing ${outfit} (same outfit every page).` : '';

  // Combine with attention-optimized order - CHARACTER LOCK FIRST
  let prompt = `${characterLock}. ${fingerprintLock} ${mustShow}. ${scene}. ${outfitStr} ${style}. No text.`;

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
  // Base negatives — ONLY style/safety. NO environment words ever.
  // Environment words (forest, trees, ocean, water, buildings, space, planets, rockets)
  // are NEVER included because they sabotage scenes that need those elements.
  const base = [
    'photorealistic', 'realistic', 'photograph', 'photo', '3D render', '3D', 'CGI',
    'sketch', 'pencil drawing', 'black and white', 'grayscale',
    'text', 'watermark', 'logo', 'signature',
    'scary', 'horror', 'gore', 'weapon'
  ];

  // SKIP card.must_not_include — it often contains environment words
  // (forest, trees, ocean, water, buildings, space, planets, rockets)
  // that directly conflict with pages that need those settings.

  // Add human exclusions for animal stories
  if (isAnimal) {
    base.push('human', 'person', 'boy', 'girl', 'man', 'woman');

    // ANTI-DRIFT NEGATIVES: Block animals that SDXL commonly substitutes
    // This is CRITICAL for character consistency
    const antiDriftAnimals: Record<string, string[]> = {
      // For rhinos, SDXL often drifts to cows/bulls (similar body shape)
      'rhinoceros': ['cow', 'bull', 'calf', 'ox', 'buffalo', 'bison', 'horse', 'deer', 'goat', 'antelope', 'pig', 'hippo'],
      'rhino': ['cow', 'bull', 'calf', 'ox', 'buffalo', 'bison', 'horse', 'deer', 'goat', 'antelope', 'pig', 'hippo'],
      // For elephants
      'elephant': ['hippo', 'rhino', 'mammoth', 'pig'],
      // For dogs
      'dog': ['wolf', 'fox', 'coyote', 'bear'],
      'puppy': ['wolf', 'fox', 'coyote', 'bear', 'kitten'],
      // For cats
      'cat': ['lion', 'tiger', 'leopard', 'fox'],
      'kitten': ['lion', 'tiger', 'puppy', 'fox'],
      // For rabbits (often drift to cats/dogs)
      'rabbit': ['cat', 'dog', 'mouse', 'hamster'],
      'bunny': ['cat', 'dog', 'mouse', 'hamster'],
      // For lions
      'lion': ['dog', 'cat', 'wolf', 'bear'],
      // For bears
      'bear': ['dog', 'wolf', 'gorilla'],
    };

    // Get species-specific anti-drift negatives
    const speciesKey = species?.toLowerCase() || '';
    const speciesNegatives = antiDriftAnimals[speciesKey] || [];

    // Also add generic wrong animals
    const genericWrong = ['chicken', 'hen', 'rooster', 'chick', 'penguin', 'bird', 'duck', 'owl'];

    // Combine and filter out the actual species
    const allNegatives = [...new Set([...speciesNegatives, ...genericWrong])];
    const filtered = allNegatives.filter(a => a !== species && !species?.includes(a));

    base.push(...filtered);

    console.log(`[ANTI-DRIFT] Species: ${species}, blocking: ${filtered.join(', ')}`);
  }

  const negative = base.join(', ');
  console.log(`[LEGACY NEGATIVE — species anti-drift now handled by buildHardBanNegative(species) in image pipeline]`);
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

  const prompt = `CHARACTER SHEET: ${charName} the cartoon ${species}. Full body reference. ` +
    `${fingerprint}. Neutral pose, friendly smile. ` +
    `Three views: front view, side view, 3/4 view. ` +
    `Plain light background. ` +
    `${styleBase}, bold outlines, flat vibrant colors. No text.`;

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

  const prompt = `BOOK COVER: ${charName} the cartoon ${species}. ` +
    `${fingerprint}. ` +
    `Big friendly title space at top (leave blank area). ` +
    `Magical colorful scene with sparkles. ` +
    `${styleBase}, bold outlines, flat vibrant colors. ` +
    `Eye-catching, inviting, child-friendly. No text.`;

  console.log(`[COVER PROMPT]: ${prompt}`);
  return prompt;
}
