import { PageSceneCard, CharacterBible } from "./visual-types";

/**
 * Generate a Page Scene Card from page text
 * GENERIC - extracts info directly from text, no hardcoded scenarios
 */
export function generatePageSceneCard(
  pageText: string,
  pageNumber: number,
  bible: CharacterBible,
  previousSceneCards: PageSceneCard[] = [],
  namedCharMap: Map<string, string> = new Map()
): PageSceneCard {
  const lowerText = pageText.toLowerCase();

  // Extract setting from the text — combine generic setting type with specific location context
  const baseSetting = extractSetting(lowerText);
  const locationContext = extractLocationContext(pageText); // uses original case for proper nouns
  const setting = locationContext ? enrichSettingWithLocation(baseSetting, locationContext) : baseSetting;

  // Extract key objects mentioned in the text
  const keyObjects = extractKeyObjects(lowerText);

  // Learn named characters from THIS page's text (e.g., "bunny named Luma", "owl called Orion")
  learnNamedCharacters(lowerText, namedCharMap);

  // Extract supporting characters (uses namedCharMap to recognize named chars on later pages)
  // Pass mainSpecies so the main character's species is excluded from supporting chars
  const supportingCharacters = extractSupportingCharacters(lowerText, bible.name, namedCharMap, bible.species || bible.character_type);

  // Build forbidden elements based on what's NOT in this scene
  const forbiddenElements = buildForbiddenElements(lowerText);

  // Build must_include: character + key objects + supporting characters
  // Deduplicate: remove key objects that also appear as supporting characters
  // (e.g., "camel" should only appear once, as a supporting character)
  const supportingLowerSet = new Set(supportingCharacters.map(sc => sc.toLowerCase()));
  const dedupedKeyObjects = keyObjects.filter(obj => !supportingLowerSet.has(obj.toLowerCase()));
  const characterItem = `${bible.name} the ${bible.species || bible.character_type || 'character'} full body`;
  const must_include = [characterItem, ...dedupedKeyObjects, ...supportingCharacters];

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
  // ── Helper: is "moon" used ONLY in compound/reference form? ──
  // "moon creatures", "moon friends", "moonlight", "stories about the moon", etc.
  // are references TO the moon, not scenes ON the moon.
  // Only treat as moon-surface if text says "on the moon", "landed on the moon",
  // "moon surface", "moon's surface", etc.
  const moonSurfacePatternExplicit = /(?:reached|arrived\s+at|got\s+to|flew\s+to|traveled\s+to|journeyed\s+to|landed\s+on)\s+(?:the\s+)?moon|(?:on|across|over)\s+(?:the\s+)?moon(?:'?s)?\s+(?:surface|ground|dust|rock|landscape)|moon\s+(?:surface|dust|rock|landscape|crater)/i;
  // "on the surface" implies being ON a surface (moon/planet). When moon-related terms exist
  // nearby, this means they're physically present on the moon surface.
  const hasOnTheSurface = /\bon\s+the\s+surface\b/i.test(text) && /\bmoon\b/i.test(text);
  const isOnMoonSurface = moonSurfacePatternExplicit.test(text) || hasOnTheSurface;

  // "moon creatures", "moon friends", "moon rabbits", "moonlight", "under the moonlight",
  // "about the moon", "of the moon", "stories about the moon" — these are compound
  // references. They mention the moon but the scene is NOT on the moon.
  const moonCompoundPattern = /moon\s+(?:creature|creatures|friend|friends|rabbit|rabbits|bunny|bunnies)|moonlight|moon'?s?\s+light|(?:about|of|from)\s+(?:the\s+)?moon/i;
  const hasMoonCompound = moonCompoundPattern.test(text);

  // Check if "moon" appears ONLY inside compound/reference phrases, NOT as a standalone location.
  // Strip all moon-compound occurrences from text — if no bare "moon" remains, it's compound-only.
  const textWithoutMoonCompounds = text
    .replace(/moon\s+(?:creature|creatures|friend|friends|rabbit|rabbits|bunny|bunnies)/gi, '')
    .replace(/moonlight/gi, '')
    .replace(/moon'?s?\s+light/gi, '')
    .replace(/(?:about|of|from|stories\s+about|tales\s+of)\s+(?:the\s+)?moon/gi, '')
    .replace(/(?:under|beneath)\s+(?:the\s+)?moon/gi, '');
  const hasBareMoonAfterStripping = /\bmoon\b/i.test(textWithoutMoonCompounds);

  // "moon" keyword should be skipped when:
  // 1. "moon" appears only in compound/reference form (after stripping compounds, no bare "moon" remains), AND
  // 2. There's no explicit "on the moon" / "landed on the moon" phrasing
  // NOTE: We no longer require earth-bound location keywords. If moon is only in compound form,
  // the scene is NOT on the moon regardless of where it actually takes place.
  const hasMoonCompoundOnly = hasMoonCompound && !hasBareMoonAfterStripping && !isOnMoonSurface;

  // PRIORITY 1: Look for explicit location phrases "in the X", "through the X", "at the X"
  const locationPhrases = [
    // Sunset celebration — "sun began to set", "painted the sky in shades of orange"
    // Check BEFORE campfire and space patterns so sunset wins when mentioned
    { pattern: /sun\s+began\s+to\s+set/i, setting: 'Beautiful outdoor sunset scene with orange and pink sky' },
    { pattern: /painting\s+the\s+sky\s+in\s+shades\s+of/i, setting: 'Beautiful outdoor sunset scene with orange and pink sky' },
    { pattern: /sunset\s+(?:sky|glow|light|scene)/i, setting: 'Beautiful outdoor sunset scene with orange and pink sky' },
    // Picnic — "picnic", "picnic blanket" — outdoor eating scene
    { pattern: /\bpicnic\b/i, setting: 'Outdoor picnic scene on green grass with food and blanket' },
    // Campfire/Night gathering — check BEFORE space patterns because
    // "under the stars" should be campfire when campfire is mentioned
    { pattern: /(?:campfire|bonfire|camp\s*fire)/i, setting: 'Nighttime campfire scene under starry sky with warm glow' },
    { pattern: /(?:gathered|sitting)\s+(?:around|by)\s+(?:the\s+)?fire/i, setting: 'Nighttime campfire scene under starry sky with warm glow' },

    // Space/Moon - Priority (check these first for space adventures)
    // BROAD matching — catch "reached the moon", "flew to the moon", "on the moon", "moon surface", etc.
    { pattern: /(?:soared|flew|fly|flying)\s+(?:over|across)\s+(?:the\s+)?crater/i, setting: 'Rocket ship flying over moon crater in space' },
    { pattern: /(?:landed|landing)\s+(?:on|near|by)\s+(?:the\s+)?(?:other\s+side|crater)/i, setting: 'Moon surface near crater with rocket ship' },
    { pattern: /(?:blasted\s+off|blast\s+off|took\s+off|launched)/i, setting: 'Rocket ship blasting off into space' },
    { pattern: /crater/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /(?:zoomed|flew|zooming|flying|traveled|travelling|descend)\s+through\s+space/i, setting: 'Outer space with stars and planets' },
    { pattern: /(?:in|through|into)\s+(?:outer\s+)?space/i, setting: 'Outer space with stars and planets' },
    // Moon surface — only when character is physically ON the moon
    // DO NOT match "moon creatures", "moonlight", "under the moon" — those are references
    { pattern: /(?:reached|arrived\s+at|got\s+to|flew\s+to|traveled\s+to|journeyed\s+to|landed\s+on)\s+(?:the\s+)?moon(?!\s*(?:creature|friend|rabbit|bunny|light))/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /moon\s+(?:surface|rock|dust|crater|landscape)/i, setting: 'Moon surface with craters and starry sky' },
    { pattern: /(?:on|landed\s+on)\s+(?:the\s+)?(?:mars|planet)/i, setting: 'Alien planet surface' },

    // Rocket interior — check "led friends back into the rocket" BEFORE indoor patterns
    // This must be ABOVE indoor patterns so "back into the rocket" doesn't become "indoor room"
    { pattern: /(?:back\s+)?(?:into|inside|aboard)\s+(?:the\s+)?(?:rocket|spaceship)/i, setting: 'Inside a rocket ship cockpit in space' },
    { pattern: /climbed\s+(?:inside|into|aboard)/i, setting: 'Inside a rocket ship cockpit' },

    // Airport terminal — character is INSIDE the airport building (not on the plane)
    // Must be ABOVE airplane interior so "airport worker" doesn't become airplane cabin
    { pattern: /\b(?:airport)\s+(?:terminal|entrance|exit|building|hall|lobby)/i, setting: 'Bright airport terminal with colorful signs and wide hallways' },
    { pattern: /\b(?:through|inside|in|around)\s+(?:the\s+)?(?:busy\s+)?airport\b/i, setting: 'Bright airport terminal with colorful signs and wide hallways' },
    { pattern: /\bairport\s+worker\b/i, setting: 'Bright airport terminal with colorful signs and wide hallways' },
    { pattern: /\blost\s+and\s+found\b/i, setting: 'Bright airport terminal with colorful signs and wide hallways' },
    { pattern: /\b(?:terminal|gate|baggage|luggage|customs|immigration)\b/i, setting: 'Bright airport terminal with colorful signs and wide hallways' },
    { pattern: /\b(?:walked?|ran?|running)\s+(?:through|out\s+of|into)\s+(?:the\s+)?airport\b/i, setting: 'Bright airport terminal with colorful signs and wide hallways' },

    // Airplane interior — character is INSIDE the plane (seat, window, cabin, passengers)
    // Must be ABOVE generic sky patterns so "looked out the window" doesn't become "Sky scene"
    { pattern: /\b(?:airplane|plane)\s+(?:seat|cabin|interior|aisle)/i, setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },
    { pattern: /\b(?:in|on)\s+(?:her|his|the|their)\s+seat\b/i, setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },
    { pattern: /\bflight\s+attendant\b/i, setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },
    { pattern: /\bpassenger(?:s)?\b/i, setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },
    { pattern: /\b(?:looked?|lean(?:ed|ing)?|point(?:ed|ing)?|gaz(?:ed|ing)?|peer(?:ed|ing)?)\s+(?:out\s+)?(?:the\s+|her\s+|his\s+)?(?:airplane\s+|plane\s+)?window\b/i, setting: 'Inside a colorful airplane cabin with character looking out the window' },
    { pattern: /\b(?:buckled|seatbelt|tray\s+table|overhead\s+bin|boarding)\b/i, setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },
    { pattern: /\b(?:sat|sitting|seated)\s+(?:in|on)\s+(?:the\s+|her\s+|his\s+)?(?:airplane|plane)\b/i, setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },

    // Market/Souk/Mall — check BEFORE city/town so specific locations win
    { pattern: /(?:in|through|around|at)\s+(?:the\s+)?(?:market|souk|bazaar)/i, setting: 'Colorful bustling market with stalls and hanging lanterns' },
    { pattern: /(?:explored|walked|strolled)\s+(?:through\s+)?(?:the\s+)?(?:market|souk|bazaar)/i, setting: 'Colorful bustling market with stalls and hanging lanterns' },
    { pattern: /(?:in|at)\s+(?:the\s+)?(?:mall|shopping)/i, setting: 'Shopping mall interior with bright lights' },
    { pattern: /(?:in|at)\s+(?:the\s+)?(?:mosque|temple)/i, setting: 'Beautiful mosque or temple with ornate architecture' },
    { pattern: /(?:by|at|near)\s+(?:the\s+)?fountain/i, setting: 'Fountain plaza with sparkling water' },

    // Home/Indoor — check BEFORE city to catch "at home", "in her room"
    { pattern: /(?:at|in)\s+(?:her|his|the|their)\s+home/i, setting: 'Cozy home interior with warm lighting' },
    { pattern: /(?:in|inside)\s+(?:her|his|the)\s+(?:room|bedroom)/i, setting: 'Cozy bedroom interior' },

    // City/Town
    { pattern: /(?:in|through|around)\s+(?:the\s+)?(?:city|town|village|streets?)/i, setting: 'City streets with buildings' },
    { pattern: /(?:explored|walked|strolled)\s+(?:the\s+)?(?:city|town|streets?)/i, setting: 'City streets with buildings' },

    // Indoor — exclude "remembered his home" / "thought of home" (nostalgic, not physical setting)
    { pattern: /(?:in|inside)\s+(?:the\s+)?(?:house|room|bedroom|kitchen)/i, setting: 'Cozy indoor room' },
    { pattern: /(?:walked|went|stepped)\s+(?:into|inside)\s+(?:the\s+)?(?:house|home)/i, setting: 'Cozy indoor room' },
    { pattern: /(?:in|inside)\s+(?:the\s+)?(?:castle|palace|throne)/i, setting: 'Castle interior' },
    { pattern: /(?:in|inside)\s+(?:the\s+)?(?:school|classroom)/i, setting: 'School classroom' },

    // Nature — broader matching for meadow/field to catch "exploring his favorite meadow"
    // Include "entered" for forest to catch "entered the lush green forest"
    { pattern: /(?:in|through|into|entered)\s+(?:the\s+)?(?:lush\s+)?(?:green\s+)?(?:forest|woods)/i, setting: 'Lush green forest with tall trees and dappled sunlight' },
    // Forest clearing — "in the clearing", "sun-dappled clearing"
    { pattern: /(?:in|into)\s+(?:the\s+)?(?:sun[- ]?dappled\s+)?clearing/i, setting: 'Sunlit forest clearing with tall trees' },
    { pattern: /(?:in|at|by|his|her|the|a)\s+(?:\w+\s+)?(?:meadow|field|garden)/i, setting: 'Beautiful meadow with flowers' },
    { pattern: /\bmeadow\b/i, setting: 'Beautiful meadow with flowers' },
    { pattern: /(?:in|at)\s+(?:the\s+)?(?:desert|dunes)/i, setting: 'Desert with sand dunes' },
    { pattern: /(?:on|at)\s+(?:the\s+)?(?:mountain|hill|cliff)/i, setting: 'Mountain landscape' },
    { pattern: /(?:at|on)\s+(?:the\s+)?(?:beach|shore)/i, setting: 'Beach with sand and waves' },
    { pattern: /(?:swam|swim|climbed)\s+(?:toward|to)\s+(?:the\s+)?(?:shore|beach)/i, setting: 'Beach with sand and waves' },

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
    // Sunset — BEFORE campfire/moon so "sun began to set" wins
    { keywords: ['sunset', 'sun began to set', 'sun was setting'], setting: 'Beautiful outdoor sunset scene with orange and pink sky' },
    // Picnic — BEFORE generic nature keywords
    { keywords: ['picnic'], setting: 'Outdoor picnic scene on green grass with food and blanket' },
    // Celebration / dancing — BEFORE moon keyword
    { keywords: ['celebrated', 'celebrating', 'celebration', 'sang songs'], setting: 'Outdoor celebration scene with warm golden light' },
    // Campfire/Night — BEFORE space/moon to avoid "starry sky" matching moon
    { keywords: ['campfire', 'bonfire', 'camp fire'], setting: 'Nighttime campfire scene under starry sky' },
    // Celebration / gathering under stars/moonlight — BEFORE moon keyword
    // so "under the moonlight" and "celebration" match this instead of plain "moon"
    { keywords: ['under the moonlight', 'under the stars', 'under the moon'], setting: 'Outdoor nighttime celebration under starry sky' },
    // Space/Moon — BEFORE generic nature keywords (moon > forest/water)
    // "moon" keyword is skipped when hasMoonCompoundOnly is true
    { keywords: ['moon'], setting: 'Moon surface with craters and starry sky' },
    { keywords: ['outer space', 'cosmos', 'galaxy', 'stars and planets'], setting: 'Outer space with stars' },
    { keywords: ['rocket', 'spaceship'], setting: 'Rocket ship scene with bright sky' },
    // Water — specific before generic
    { keywords: ['underwater', 'ocean floor', 'coral reef'], setting: 'Underwater ocean scene' },
    { keywords: ['ocean', 'sea', 'waves'], setting: 'Ocean with waves' },
    { keywords: ['dolphin', 'dolphins'], setting: 'Ocean with waves and dolphins' },
    { keywords: ['beach', 'shore'], setting: 'Beach with sand and waves' },
    { keywords: ['lake', 'pond', 'river', 'stream'], setting: 'By the water' },
    // Land — SPECIFIC locations BEFORE generic "desert" to avoid desert matching everything
    { keywords: ['market', 'souk', 'bazaar'], setting: 'Colorful bustling market scene' },
    { keywords: ['mall', 'shopping'], setting: 'Shopping mall interior' },
    { keywords: ['mosque', 'temple', 'church'], setting: 'Beautiful mosque or temple scene' },
    { keywords: ['fountain'], setting: 'Fountain plaza scene' },
    { keywords: ['airport', 'terminal', 'baggage claim', 'lost and found'], setting: 'Bright airport terminal with colorful signs and wide hallways' },
    { keywords: ['airplane', 'plane', 'flight attendant'], setting: 'Inside a colorful airplane cabin with rows of seats and oval windows' },
    { keywords: ['city', 'street', 'town', 'village'], setting: 'City or town scene' },
    { keywords: ['forest', 'woods', 'trees'], setting: 'Forest scene' },
    { keywords: ['clearing'], setting: 'Sunlit forest clearing' },
    { keywords: ['park', 'playground'], setting: 'Park with playground and green trees' },
    { keywords: ['meadow', 'garden', 'flowers'], setting: 'Garden or meadow' },
    { keywords: ['mountain', 'cliff'], setting: 'Mountain scene' },
    // Indoor — only trigger when "home" is a physical location, not memory/nostalgia
    { keywords: ['house', 'room', 'bedroom', 'kitchen'], setting: 'Indoor room' },
    { keywords: ['home'], setting: 'Cozy home interior' },
    { keywords: ['castle', 'palace'], setting: 'Castle scene' },
    { keywords: ['school', 'classroom'], setting: 'School classroom' },
    { keywords: ['restaurant', 'cafe'], setting: 'Restaurant or cafe scene' },
    // Desert — AFTER more specific keywords! "sand" alone is too broad for Dubai stories.
    // Only match "desert" explicitly, NOT bare "sand" (which appears in "sand dunes", "sandcastle" etc.)
    { keywords: ['desert'], setting: 'Desert scene' },
    // Sky
    { keywords: ['sky', 'clouds', 'flying'], setting: 'Sky scene' },
    // Night — generic night scene (after campfire, moon etc. already checked)
    { keywords: ['night grew', 'nighttime', 'night fell', 'after dark'], setting: 'Nighttime scene under starry sky' },
  ];

  // Ground location keywords — if any of these are present, "rocket/spaceship"
  // keyword should NOT override the setting. The rocket becomes a scene OBJECT
  // instead. Example: "spotted a rocket in the meadow" → meadow, not rocket scene.
  const groundKeywords = ['meadow', 'field', 'garden', 'forest', 'woods', 'beach', 'shore', 'village', 'clearing'];
  const hasGroundLocation = groundKeywords.some(kw => text.includes(kw));

  // "home" appearing in nostalgic context ("remembered his home", "thought of home")
  // should NOT trigger indoor setting. Only match if home is the physical location.
  const homeIsNostalgic = /(?:remembered|missed|thought\s+of|wished\s+for|dreamed\s+of)\s+(?:\w+\s+)*home/i.test(text);

  for (const { keywords, setting } of keywordPatterns) {
    // Skip rocket/spaceship keyword match when a ground location is present
    if (hasGroundLocation && keywords.some(kw => kw === 'rocket' || kw === 'spaceship')) {
      continue;
    }
    // Skip "home" keyword when it's used in nostalgic context, not as physical location
    if (homeIsNostalgic && keywords.includes('home')) {
      continue;
    }
    // Skip "moon" keyword when it's only used in compound form ("moon creatures", "moonlight")
    // and the character is NOT physically on the moon surface
    if (hasMoonCompoundOnly && keywords.includes('moon')) {
      continue;
    }
    if (keywords.some(kw => text.includes(kw))) {
      return setting;
    }
  }

  // Default
  return 'Storybook scene';
}

/**
 * Extract specific location context from page text.
 * Captures real-world cities, landmarks, and named places that the keyword-based
 * extractSetting() would miss.
 *
 * IMPORTANT: Only includes locations where the character IS on this page —
 * NOT locations merely mentioned in passing (e.g., "dreamed of Dubai" should NOT
 * set the scene in Dubai). We check for "present-tense" location indicators:
 * being at/in/near the place, arriving, visiting, exploring, etc.
 *
 * Uses the ORIGINAL case text to detect proper nouns (capitalized words).
 */
function extractLocationContext(originalText: string): string | null {
  const lower = originalText.toLowerCase();
  const parts: string[] = [];

  // ── Helper: Check if a place name is used as the CURRENT scene location ──
  // Returns true if the text suggests the character is physically AT this place,
  // not just mentioning it in passing ("dreamed of X", "would go to X", "told about X").
  function isCurrentLocation(placeName: string): boolean {
    const plLower = placeName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // POSITIVE patterns: character is AT the location on THIS page
    const presentPatterns = [
      // "in Dubai", "at the Burj Khalifa", "through the souk"
      new RegExp(`\\b(?:in|at|through|around|across|near|beside|inside|within)\\s+(?:the\\s+)?${plLower}`, 'i'),
      // "arrived at Dubai", "reached the Burj Khalifa", "visited Dubai"
      new RegExp(`\\b(?:arrived?\\s+(?:at|in)|reached|entered|visited|explored|saw|stood\\s+(?:at|before|near)|walked\\s+(?:through|into|around)|stepped\\s+into)\\s+(?:the\\s+)?${plLower}`, 'i'),
      // "Dubai was beautiful", "the Burj Khalifa towered" — the place is the subject
      new RegExp(`${plLower}\\s+(?:was|were|towered|gleamed|sparkled|shone|stood|stretched|rose|loomed)`, 'i'),
      // "the streets of Dubai", "the markets of Dubai"
      new RegExp(`\\b(?:streets?|markets?|buildings?|towers?|dunes?|beaches?|waters?)\\s+of\\s+(?:the\\s+)?${plLower}`, 'i'),
      // "across Dubai" / "over Dubai" — flying/traveling over the place
      new RegExp(`\\b(?:across|over|above)\\s+(?:the\\s+)?${plLower}`, 'i'),
      // Place at start of clause after comma or period (the scene is set there)
      new RegExp(`[.,]\\s+${plLower}`, 'i'),
    ];

    // NEGATIVE patterns: the place is mentioned but NOT the current scene
    const futureOrAbstractPatterns = [
      // "dreamed of Dubai", "about Dubai", "told stories about Dubai"
      new RegExp(`\\b(?:dreamed?\\s+(?:of|about)|thought\\s+(?:of|about)|heard\\s+(?:of|about)|told\\s+(?:\\w+\\s+)*about|stories?\\s+(?:of|about)|learn(?:ed)?\\s+about|read\\s+about|wished\\s+(?:for|to\\s+visit))\\s+(?:the\\s+)?${plLower}`, 'i'),
      // "going to Dubai" / "would go to" / "will visit" — future/planned
      new RegExp(`\\b(?:going\\s+to|will\\s+(?:go|visit|travel)|would\\s+(?:go|visit|travel)|wanted?\\s+to\\s+(?:go|visit|see|travel))\\s+(?:to\\s+)?(?:the\\s+)?${plLower}`, 'i'),
      // "adventure to Dubai" / "trip to Dubai" / "journey to Dubai" at end — destination not yet reached
      new RegExp(`\\b(?:adventure|trip|journey|travels?)\\s+to\\s+(?:the\\s+)?${plLower}`, 'i'),
    ];

    const hasPresent = presentPatterns.some(p => p.test(originalText));
    const hasFuture = futureOrAbstractPatterns.some(p => p.test(originalText));

    // If there's a "present" signal, the character is there (even if the page also mentions future)
    if (hasPresent) return true;
    // If there's ONLY a "future" or abstract mention, it's NOT the current scene
    if (hasFuture) return false;

    // Bare mention without any preposition context — be conservative, don't include
    // This prevents "Dubai" appearing in "She loved Dubai" from setting the scene
    return false;
  }

  // ── 1. Known landmarks and famous places (case-insensitive) ──
  const landmarkPatterns: { pattern: RegExp; label: string; checkName: string }[] = [
    // UAE / Middle East
    { pattern: /\bburj\s+khalifa\b/i, label: 'Burj Khalifa tower', checkName: 'Burj Khalifa' },
    { pattern: /\bburj\s+al\s+arab\b/i, label: 'Burj Al Arab', checkName: 'Burj Al Arab' },
    { pattern: /\bdubai\s+mall\b/i, label: 'Dubai Mall', checkName: 'Dubai Mall' },
    { pattern: /\bdubai\s+marina\b/i, label: 'Dubai Marina', checkName: 'Dubai Marina' },
    { pattern: /\bdubai\s+creek\b/i, label: 'Dubai Creek', checkName: 'Dubai Creek' },
    { pattern: /\bpalm\s+jumeirah\b/i, label: 'Palm Jumeirah island', checkName: 'Palm Jumeirah' },
    { pattern: /\bdubai\s+fountain\b/i, label: 'Dubai Fountain', checkName: 'Dubai Fountain' },
    { pattern: /\bsouk\b|\bsouks\b/i, label: 'traditional souk market', checkName: 'souk' },

    // Europe
    { pattern: /\beiffel\s+tower\b/i, label: 'Eiffel Tower', checkName: 'Eiffel Tower' },
    { pattern: /\bbig\s+ben\b/i, label: 'Big Ben clock tower', checkName: 'Big Ben' },
    { pattern: /\btower\s+bridge\b/i, label: 'Tower Bridge', checkName: 'Tower Bridge' },
    { pattern: /\bcolosseum\b/i, label: 'Colosseum', checkName: 'Colosseum' },
    { pattern: /\bleaning\s+tower\b/i, label: 'Leaning Tower of Pisa', checkName: 'Leaning Tower' },
    { pattern: /\bsagrada\s+familia\b/i, label: 'Sagrada Familia', checkName: 'Sagrada Familia' },

    // Americas
    { pattern: /\bstatue\s+of\s+liberty\b/i, label: 'Statue of Liberty', checkName: 'Statue of Liberty' },
    { pattern: /\bgolden\s+gate\s+bridge\b/i, label: 'Golden Gate Bridge', checkName: 'Golden Gate Bridge' },
    { pattern: /\btimes\s+square\b/i, label: 'Times Square', checkName: 'Times Square' },
    { pattern: /\bgrand\s+canyon\b/i, label: 'Grand Canyon', checkName: 'Grand Canyon' },
    { pattern: /\bniagara\s+falls\b/i, label: 'Niagara Falls', checkName: 'Niagara Falls' },

    // Asia/Pacific
    { pattern: /\bgreat\s+wall\b/i, label: 'Great Wall of China', checkName: 'Great Wall' },
    { pattern: /\btaj\s+mahal\b/i, label: 'Taj Mahal', checkName: 'Taj Mahal' },
    { pattern: /\bsydney\s+opera\b/i, label: 'Sydney Opera House', checkName: 'Sydney Opera' },
    { pattern: /\bmount\s+fuji\b/i, label: 'Mount Fuji', checkName: 'Mount Fuji' },

    // Africa
    { pattern: /\bpyramid(?:s)?\b/i, label: 'pyramids', checkName: 'pyramid' },
    { pattern: /\bsphinx\b/i, label: 'Sphinx', checkName: 'Sphinx' },
    { pattern: /\bsafari\b/i, label: 'safari landscape', checkName: 'safari' },
    { pattern: /\bserengeti\b/i, label: 'Serengeti', checkName: 'Serengeti' },
  ];

  for (const { pattern, label, checkName } of landmarkPatterns) {
    if (pattern.test(originalText) && isCurrentLocation(checkName)) {
      parts.push(label);
    }
  }

  // ── 2. Known city/country names (case-insensitive) ──
  const cityPatterns: { pattern: RegExp; label: string }[] = [
    { pattern: /\bdubai\b/i, label: 'Dubai' },
    { pattern: /\babu\s+dhabi\b/i, label: 'Abu Dhabi' },
    { pattern: /\bparis\b/i, label: 'Paris' },
    { pattern: /\blondon\b/i, label: 'London' },
    { pattern: /\bnew\s+york\b/i, label: 'New York City' },
    { pattern: /\btokyo\b/i, label: 'Tokyo' },
    { pattern: /\brome\b/i, label: 'Rome' },
    { pattern: /\bcairo\b/i, label: 'Cairo' },
    { pattern: /\bsydney\b/i, label: 'Sydney' },
    { pattern: /\bbeijing\b/i, label: 'Beijing' },
    { pattern: /\bmumbai\b/i, label: 'Mumbai' },
    { pattern: /\bistanbul\b/i, label: 'Istanbul' },
    { pattern: /\bbarcelona\b/i, label: 'Barcelona' },
    { pattern: /\bamsterdam\b/i, label: 'Amsterdam' },
    { pattern: /\bsingapore\b/i, label: 'Singapore' },
    { pattern: /\bhong\s+kong\b/i, label: 'Hong Kong' },
    { pattern: /\brio\s+de\s+janeiro\b/i, label: 'Rio de Janeiro' },
    { pattern: /\bseoul\b/i, label: 'Seoul' },
    { pattern: /\bkuala\s+lumpur\b/i, label: 'Kuala Lumpur' },
    { pattern: /\bbangkok\b/i, label: 'Bangkok' },
    { pattern: /\bnairobi\b/i, label: 'Nairobi' },
    { pattern: /\bmarrakech\b/i, label: 'Marrakech' },
    { pattern: /\bjeddah\b/i, label: 'Jeddah' },
    { pattern: /\briyadh\b/i, label: 'Riyadh' },
    { pattern: /\bdoha\b/i, label: 'Doha' },
    { pattern: /\bmuscat\b/i, label: 'Muscat' },
    // Americas (expanded)
    { pattern: /\btoronto\b/i, label: 'Toronto' },
    { pattern: /\bvancouver\b/i, label: 'Vancouver' },
    { pattern: /\bmontreal\b/i, label: 'Montreal' },
    { pattern: /\bottawa\b/i, label: 'Ottawa' },
    { pattern: /\bcanada\b/i, label: 'Canada' },
    { pattern: /\bmexico\s+city\b/i, label: 'Mexico City' },
    { pattern: /\bwashington\b/i, label: 'Washington D.C.' },
    { pattern: /\bboston\b/i, label: 'Boston' },
    { pattern: /\bmiami\b/i, label: 'Miami' },
    { pattern: /\bseattle\b/i, label: 'Seattle' },
    { pattern: /\bhawaii\b/i, label: 'Hawaii' },
    { pattern: /\bbrazil\b/i, label: 'Brazil' },
    // Europe (expanded)
    { pattern: /\bberlin\b/i, label: 'Berlin' },
    { pattern: /\bvienna\b/i, label: 'Vienna' },
    { pattern: /\bprague\b/i, label: 'Prague' },
    { pattern: /\bmadrid\b/i, label: 'Madrid' },
    { pattern: /\blisbon\b/i, label: 'Lisbon' },
    { pattern: /\bzurich\b/i, label: 'Zurich' },
    { pattern: /\bdublin\b/i, label: 'Dublin' },
    { pattern: /\bedinburgh\b/i, label: 'Edinburgh' },
    { pattern: /\bvenice\b/i, label: 'Venice' },
    { pattern: /\bflorence\b/i, label: 'Florence' },
    { pattern: /\bathens\b/i, label: 'Athens' },
    // Asia-Pacific (expanded)
    { pattern: /\bdelhi\b/i, label: 'Delhi' },
    { pattern: /\bkyoto\b/i, label: 'Kyoto' },
    { pattern: /\bshanghai\b/i, label: 'Shanghai' },
    { pattern: /\bjakarta\b/i, label: 'Jakarta' },
    { pattern: /\bhanoi\b/i, label: 'Hanoi' },
    { pattern: /\bmelbourne\b/i, label: 'Melbourne' },
    { pattern: /\bauckland\b/i, label: 'Auckland' },
    // Africa (expanded)
    { pattern: /\bcape\s+town\b/i, label: 'Cape Town' },
    { pattern: /\baccra\b/i, label: 'Accra' },
    { pattern: /\blagos\b/i, label: 'Lagos' },
    // Countries as destinations
    { pattern: /\bjapan\b/i, label: 'Japan' },
    { pattern: /\bindia\b/i, label: 'India' },
    { pattern: /\baustralia\b/i, label: 'Australia' },
    { pattern: /\begypt\b/i, label: 'Egypt' },
    { pattern: /\bfrance\b/i, label: 'France' },
    { pattern: /\bkenya\b/i, label: 'Kenya' },
    { pattern: /\bchina\b/i, label: 'China' },
    { pattern: /\bturkey\b/i, label: 'Turkey' },
    { pattern: /\bgreece\b/i, label: 'Greece' },
    { pattern: /\bspain\b/i, label: 'Spain' },
    { pattern: /\bitaly\b/i, label: 'Italy' },
    { pattern: /\bmexico\b/i, label: 'Mexico' },
    { pattern: /\bthailand\b/i, label: 'Thailand' },
    { pattern: /\bpakistan\b/i, label: 'Pakistan' },
    { pattern: /\bkarachi\b/i, label: 'Karachi' },
    { pattern: /\bislamabad\b/i, label: 'Islamabad' },
    { pattern: /\blahore\b/i, label: 'Lahore' },
  ];

  for (const { pattern, label } of cityPatterns) {
    if (pattern.test(originalText) && isCurrentLocation(label)) {
      // Only add city if not already covered by a landmark mentioning it
      if (!parts.some(p => p.toLowerCase().includes(label.toLowerCase()))) {
        parts.push(label);
      }
    }
  }

  // ── 3. Generic location descriptors from text ──
  // "bustling market", "grand tower", "ancient ruins", etc.
  // These are ALWAYS current-scene descriptors (they describe what the character sees NOW)
  const descriptorPatterns: { pattern: RegExp; label: string }[] = [
    { pattern: /\b(?:bustling|colorful|vibrant)\s+(?:market|bazaar)\b/i, label: 'bustling market' },
    { pattern: /\b(?:grand|tall|towering)\s+(?:tower|building|skyscraper)\b/i, label: 'tall tower' },
    { pattern: /\b(?:ancient|old)\s+(?:ruins|temple|mosque|church)\b/i, label: 'ancient ruins' },
    { pattern: /\b(?:golden|sandy)\s+(?:desert|dunes)\b/i, label: 'golden desert dunes' },
    { pattern: /\b(?:magical|enchanted)\s+(?:garden|forest|cave)\b/i, label: 'magical garden' },
    { pattern: /\bskyscraper(?:s)?\b/i, label: 'skyscrapers' },
    { pattern: /\bfountain(?:s)?\b/i, label: 'fountains' },
    { pattern: /\bmosque\b/i, label: 'mosque' },
  ];

  for (const { pattern, label } of descriptorPatterns) {
    if (pattern.test(originalText)) {
      if (!parts.some(p => p.toLowerCase() === label.toLowerCase())) {
        parts.push(label);
      }
    }
  }

  if (parts.length === 0) return null;

  // Deduplicate: e.g., don't return "Dubai, Burj Khalifa tower, Dubai"
  const unique = [...new Set(parts)];
  return unique.slice(0, 4).join(', ');
}

/**
 * Enrich a generic setting with specific location context.
 * "City or town scene" + "Dubai, Burj Khalifa tower" → "Dubai city scene with Burj Khalifa tower"
 */
function enrichSettingWithLocation(baseSetting: string, locationContext: string): string {
  // If the base setting is a generic/default, replace it entirely with the specific location
  const genericSettings = [
    'Storybook scene',
    'City or town scene',
    'City streets with buildings',
    'Sky scene',
    'Mountain scene',
    'Desert scene',
    'Indoor room',
  ];

  if (genericSettings.includes(baseSetting)) {
    // Build a rich setting from the location context
    // Keep the base type hint but make it specific
    if (baseSetting === 'Storybook scene') {
      return `${locationContext} scene with colorful buildings and landmarks`;
    }
    if (baseSetting === 'City or town scene' || baseSetting === 'City streets with buildings') {
      return `${locationContext} city scene with buildings and landmarks`;
    }
    if (baseSetting === 'Sky scene') {
      return `Sky view over ${locationContext} skyline`;
    }
    if (baseSetting === 'Desert scene') {
      return `Desert scene near ${locationContext} with golden sand dunes`;
    }
    return `${locationContext} scene`;
  }

  // For specific settings (sunset, ocean, etc.), append the location
  return `${baseSetting}, in ${locationContext}`;
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

    // Landmarks — specific visual elements that should appear in the image
    { pattern: /\bburj\s+khalifa\b/, name: 'tall tower Burj Khalifa' },
    { pattern: /\beiffel\s+tower\b/, name: 'Eiffel Tower' },
    { pattern: /\bstatue\s+of\s+liberty\b/, name: 'Statue of Liberty' },
    { pattern: /\bgolden\s+gate\b/, name: 'Golden Gate Bridge' },
    { pattern: /\btaj\s+mahal\b/, name: 'Taj Mahal' },
    { pattern: /\bpyramid(?:s)?\b/, name: 'pyramid' },
    { pattern: /\bskyscraper(?:s)?\b/, name: 'skyscrapers' },
    { pattern: /\bfountain(?:s)?\b/, name: 'fountain' },
    { pattern: /\bmosque\b/, name: 'mosque' },
    { pattern: /\bsouk(?:s)?\b/, name: 'market stalls' },
    { pattern: /\bcamel(?:s)?\b/, name: 'camel' },
  ];

  for (const { pattern, name } of objectPatterns) {
    if (pattern.test(text)) {
      objects.push(name);
    }
  }

  return objects.slice(0, 4); // Max 4 objects
}

/**
 * Learn named characters from text patterns like:
 *   "bunny named Luma", "owl called Orion", "a rabbit named Flopsy"
 * Populates the namedCharMap: name → display species (e.g., "luma" → "moon rabbits")
 */
function learnNamedCharacters(text: string, map: Map<string, string>): void {
  // Pattern: "(species) named/called (Name)"
  const introPatterns = [
    // Moon-specific creatures
    { regex: /\bmoon\s+(?:bunny|rabbit|bunnies|rabbits)\s+(?:named|called)\s+(\w+)/gi, display: 'moon rabbits' },
    // Generic animals
    { regex: /\b(?:bunny|rabbit|bunnies|rabbits)\s+(?:named|called)\s+(\w+)/gi, display: 'rabbit' },
    { regex: /\bowl\s+(?:named|called)\s+(\w+)/gi, display: 'owl' },
    { regex: /\b(?:dog|puppy)\s+(?:named|called)\s+(\w+)/gi, display: 'dog' },
    { regex: /\b(?:cat|kitten)\s+(?:named|called)\s+(\w+)/gi, display: 'cat' },
    { regex: /\b(?:bear|cub)\s+(?:named|called)\s+(\w+)/gi, display: 'bear' },
    { regex: /\bfox\s+(?:named|called)\s+(\w+)/gi, display: 'fox' },
    { regex: /\b(?:lion|lioness)\s+(?:named|called)\s+(\w+)/gi, display: 'lions' },
    { regex: /\bdolphin\s+(?:named|called)\s+(\w+)/gi, display: 'dolphins' },
    { regex: /\b(?:dragon)\s+(?:named|called)\s+(\w+)/gi, display: 'dragon' },
    { regex: /\b(?:unicorn)\s+(?:named|called)\s+(\w+)/gi, display: 'unicorn' },
    { regex: /\b(?:fairy)\s+(?:named|called)\s+(\w+)/gi, display: 'fairies' },
    { regex: /\b(?:alien)\s+(?:named|called)\s+(\w+)/gi, display: 'aliens' },
    { regex: /\b(?:robot)\s+(?:named|called)\s+(\w+)/gi, display: 'robot' },
    { regex: /\b(?:turtle)\s+(?:named|called)\s+(\w+)/gi, display: 'turtle' },
    { regex: /\b(?:bird)\s+(?:named|called)\s+(\w+)/gi, display: 'birds' },
  ];

  for (const { regex, display } of introPatterns) {
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const name = match[1].toLowerCase();
      if (name.length >= 2 && name !== 'the' && name !== 'and') {
        // Don't overwrite — more specific pattern (e.g., "moon rabbits") was set first
        if (!map.has(name)) {
          map.set(name, display);
        }
      }
    }
  }
}

/**
 * Extract supporting characters from text.
 * Only extracts SPECIFIC visual actors (animals/creatures) — not generic
 * terms like "friends" or "family" which are not drawable.
 *
 * Also recognizes named characters via namedCharMap (populated by learnNamedCharacters).
 * E.g., if page 3 says "bunny named Luma", then page 5 saying just "Luma" will
 * add "moon rabbits" to supporting characters.
 */
function extractSupportingCharacters(
  text: string,
  mainCharName: string,
  namedCharMap: Map<string, string> = new Map(),
  mainSpecies?: string
): string[] {
  const characters: string[] = [];
  const mainLower = mainCharName.toLowerCase();
  const mainSpeciesLower = mainSpecies?.toLowerCase() || '';

  // Only look for specific animal/creature keyword patterns.
  // "friends" and "family" are NOT visual actors — they don't trigger Mode B.
  const characterPatterns = [
    // Moon creatures (check BEFORE generic rabbit/bunny to get correct name)
    { keywords: ['moon creature', 'moon creatures', 'moon friend', 'moon friends'], name: 'moon creatures' },
    { keywords: ['moon rabbit', 'moon bunny', 'moon bunnies', 'moon rabbits'], name: 'moon rabbits' },
    // Animals
    { keywords: ['dog', 'puppy'], name: 'dog' },
    { keywords: ['cat', 'kitten'], name: 'cat' },
    { keywords: ['bird', 'birds'], name: 'birds' },
    { keywords: ['rabbit', 'bunny', 'rabbits', 'bunnies'], name: 'rabbit' },
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

    // Insects/small creatures commonly in children's stories
    { keywords: ['bee', 'bees', 'bumblebee', 'bumblebees'], name: 'bees' },
    { keywords: ['ladybug', 'ladybugs', 'ladybird', 'ladybirds'], name: 'ladybug' },
    { keywords: ['firefly', 'fireflies'], name: 'fireflies' },
    { keywords: ['dragonfly', 'dragonflies'], name: 'dragonfly' },
    { keywords: ['caterpillar', 'caterpillars'], name: 'caterpillar' },
    { keywords: ['frog', 'frogs'], name: 'frog' },
    { keywords: ['squirrel', 'squirrels'], name: 'squirrel' },
    { keywords: ['hedgehog', 'hedgehogs'], name: 'hedgehog' },

    // Desert/farm animals
    { keywords: ['camel', 'camels'], name: 'camel' },
    { keywords: ['horse', 'horses', 'pony', 'ponies'], name: 'horse' },
    { keywords: ['monkey', 'monkeys'], name: 'monkey' },
    { keywords: ['penguin', 'penguins'], name: 'penguin' },
    { keywords: ['parrot', 'parrots'], name: 'parrot' },
    { keywords: ['flamingo', 'flamingos'], name: 'flamingo' },
    { keywords: ['elephant', 'elephants'], name: 'elephant' },
    { keywords: ['giraffe', 'giraffes'], name: 'giraffe' },
    { keywords: ['zebra', 'zebras'], name: 'zebra' },
    { keywords: ['deer'], name: 'deer' },
    { keywords: ['panda', 'pandas'], name: 'panda' },
    { keywords: ['koala', 'koalas'], name: 'koala' },
  ];

  for (const pattern of characterPatterns) {
    // Don't add if it's the main character's species — prevents duplicate
    // e.g., if main char is a dog, don't add "dog" as supporting character
    if (mainLower.includes(pattern.keywords[0])) continue;
    if (mainSpeciesLower && pattern.keywords.some(kw => kw === mainSpeciesLower || mainSpeciesLower === pattern.name)) continue;

    // Use WORD BOUNDARY matching to avoid false positives
    // AND require the animal to be actively in the scene — not just mentioned
    // in passing (e.g., "her dog" appearing in every page as a companion reference)
    // We check for action context: the animal is DOING something or described visually
    if (pattern.keywords.some(kw => {
      // Check if the keyword appears at all (allow plural form: "dolphin" matches "dolphins")
      const kwPlural = `${kw}s?`;
      const regex = new RegExp(`\\b${kwPlural}\\b`, 'i');
      if (!regex.test(text)) return false;

      // Check if the animal is actively in the scene:
      // 1. The animal is doing an action (verb near the keyword)
      // 2. The animal is described visually ("a friendly dog", "the little cat")
      // 3. The animal appears with scene verbs ("saw a dog", "found a cat", "met a camel")
      const activePatterns = [
        // Animal doing something: "the dog barked", "camels walked"
        new RegExp(`\\b${kwPlural}\\b\\s+(?:was|were|ran|walked|barked|meowed|played|jumped|sat|flew|swam|danced|followed|sniffed|wagged|purred|roared|galloped|trotted|howled|chirped|sang|splashed|raced|chased|slept|ate|drank|nuzzled|licked|carried|pulled|looked|smiled|waved|appeared|came|arrived|stood|waited|gathered)`, 'i'),
        // Character interacted with animal: "rode the camel", "petted the dog", "hugged the cat", "swam with dolphins"
        new RegExp(`\\b(?:rode|riding|petted|petting|hugged|hugging|fed|feeding|chased|chasing|followed|following|played\\s+with|playing\\s+with|saw|spotted|found|met|encountered|befriended|swam\\s+with|swimming\\s+with|flew\\s+with|ran\\s+with|walked\\s+with|sat\\s+with|talked\\s+to|waved\\s+at)\\b.*\\b${kwPlural}\\b`, 'i'),
        // Animal described visually: "a friendly dog", "big camel", "the little cat", "playful dolphins"
        new RegExp(`\\b(?:a|the|some|two|three|many|several|big|small|little|friendly|cute|fluffy|gentle|happy|playful|tall|wise|old|young|tiny|wild|beautiful|magical|colorful|graceful)\\s+(?:\\w+\\s+)?${kwPlural}\\b`, 'i'),
        // Animal as companion doing something WITH character
        new RegExp(`\\b(?:with|beside|alongside|next\\s+to)\\s+(?:\\w+\\s+){0,2}(?:the\\s+|her\\s+|his\\s+|a\\s+)?${kwPlural}\\b`, 'i'),
        // Animal name mentioned with a named character's name (proper noun + animal)
        new RegExp(`[A-Z]\\w+\\s+the\\s+${kw}`, 'i'),
      ];

      // For fantasy/magical creatures (fairies, unicorn, dragon), be MORE lenient.
      // These are typically recurring story companions, not background mentions.
      // Any contextual mention beyond bare noun is enough.
      const isFantasyCreature = /^(?:fairies|fairy|unicorn|dragon|mermaid|pixie|elf|gnome|wizard|witch)$/i.test(kw);
      if (isFantasyCreature) {
        // Just being mentioned with ANY context (not as a bare noun in a list) is enough
        return true;
      }

      return activePatterns.some(p => p.test(text));
    })) {
      characters.push(pattern.name);
    }
  }

  // Recognize named characters from previous pages (via namedCharMap)
  // E.g., "Luma" → "moon rabbits", "Orion" → "owl"
  for (const [name, display] of namedCharMap.entries()) {
    if (text.includes(name) && !characters.includes(display)) {
      characters.push(display);
    }
  }

  // Deduplicate: more specific names subsume generic ones
  // e.g., "moon rabbits" subsumes "rabbit", "moon creatures" subsumes "moon rabbits"
  const subsumptions: [string, string][] = [
    ['moon rabbits', 'rabbit'],
    ['moon creatures', 'moon rabbits'],
  ];
  for (const [specific, generic] of subsumptions) {
    if (characters.includes(specific)) {
      const idx = characters.indexOf(generic);
      if (idx !== -1) characters.splice(idx, 1);
    }
  }

  return characters.slice(0, 3); // Max 3 supporting characters
}

/**
 * Extract time/weather from text
 */
function extractTimeWeather(text: string): string {
  // "moon" alone is NOT a reliable nighttime indicator — "moon creatures", "moon friends"
  // can appear in daytime scenes. Only use "moon" for nighttime if it's "moonlight",
  // "under the moon", "moon shone", etc.
  const moonNightPattern = /moonlight|moon\s*(?:shone|glow|lit|beam|rose)|under\s+the\s+moon|night.*moon|moon.*night/i;
  if (text.includes('night') || text.includes('dark') || moonNightPattern.test(text)) return 'nighttime';
  if (text.includes('morning') || text.includes('sunrise') || text.includes('dawn')) return 'morning';
  if (/sun\s+began\s+to\s+set/.test(text) || text.includes('sunset') || text.includes('evening') || text.includes('dusk')) return 'sunset';
  if (text.includes('rain') || text.includes('storm')) return 'rainy';
  if (text.includes('snow') || text.includes('winter')) return 'snowy';
  return 'daytime';
}

/**
 * Check if a verb match is likely the main character's action (not a supporting character's).
 * Looks for the character name or a pronoun ("he", "she", "they") within 60 chars before the verb.
 * Also allows verbs near sentence start (main character is often the implied subject).
 */
function isCharacterAction(
  text: string,
  verbPattern: RegExp,
  characterName: string
): boolean {
  const charLower = characterName.toLowerCase();
  // Build regex patterns for pronouns with word boundaries to avoid
  // false positives like "the" matching "he" or "with" matching "it"
  const charRefPatterns = [
    new RegExp(`\\b${charLower}\\b`),
    /\bhe\b/,
    /\bshe\b/,
    /\bthey\b/,
  ];

  const matches = [...text.matchAll(new RegExp(verbPattern.source, 'gi'))];
  if (matches.length === 0) return false;

  for (const match of matches) {
    const idx = match.index!;
    const before = text.substring(Math.max(0, idx - 60), idx);
    // Check if character name or pronoun (with word boundaries) is in the preceding window
    if (charRefPatterns.some(pat => pat.test(before))) return true;
  }
  return false; // Verb only appears near other characters (e.g., "bouncing bunnies")
}

/**
 * Extract action from text - expanded list with SPECIFIC BODY POSES.
 *
 * Returns pose-descriptive actions like "Riri running forward excitedly"
 * instead of generic "Riri running". The pose detail is critical because
 * actionToPose() in the image pipeline maps these to Kontext body positions.
 *
 * IMPORTANT: Uses regex patterns that match ALL verb tenses (past, present,
 * participle) because story text is typically in past tense ("danced", "swam")
 * not present participle ("dancing", "swimming").
 *
 * Priority:
 *   1. Multi-word compound actions (most specific)
 *   2. Single-verb actions with pose detail (regex, all tenses)
 *   3. Emotion/state-based poses
 *   4. Fallback: context-aware pose from setting
 */
function extractAction(text: string, characterName: string): string {
  // Priority 1: Multi-word compound actions (most specific, unambiguous)
  // These are checked first because they describe the most specific, scene-defining actions.
  // Order matters — physical actions BEFORE emotional states.
  // NOTE: "spotted", "noticed", "worried", "nervous" etc. are NOT in Priority 1 because
  // they often describe supporting characters or background emotions, not Riri's KEY action.
  const priorityActions = [
    // Freezing in fear/surprise — BEFORE other patterns because "froze" is a key emotional beat
    { keywords: ['froze', 'frozen', 'freezing'], action: 'standing frozen stiff with wide scared eyes' },
    // Pressing/pushing buttons — match any article ("a", "the") or no article
    { keywords: ['pressed a', 'pressing a', 'presses a', 'pressed the', 'pressing the', 'presses the'], action: 'pressing a button with one hand excitedly' },
    // Tumbled out / hopped out — exiting a vehicle or water, BEFORE generic "hopped" verb
    { keywords: ['tumbled out', 'tumbling out'], action: 'tumbling out happily with legs splayed' },
    { keywords: ['hopped out', 'hopping out'], action: 'hopping out energetically with a big smile' },
    // Picnic scene (sitting/eating) — BEFORE splash because picnic is a scene-defining activity
    // A page might mention "splash" incidentally but the picnic is the KEY scene
    { keywords: ['picnic'], action: 'sitting on the ground eating happily at a picnic' },
    // Sharing/telling stories (sitting activity) — BEFORE splash for same reason
    { keywords: ['shared stories', 'sharing stories', 'told stories', 'telling stories'], action: 'sitting and talking happily with animated gestures' },
    // Singing songs — scene-defining activity
    { keywords: ['sang songs', 'singing songs'], action: 'singing happily with mouth open wide' },
    // Celebrated/celebrating — BEFORE splash (celebration is the key scene, not water)
    { keywords: ['celebrated', 'celebrating', 'celebration'], action: 'celebrating with both arms raised high' },
    // Splash — physical water action
    { keywords: ['splash'], action: 'splashing in water with legs kicking' },
    // Squeezing into something
    { keywords: ['squeezed', 'squeezing'], action: 'squeezing through eagerly with a determined face' },
    // Stepped outside/onto (arriving at a new place) — BEFORE generic stepped
    { keywords: ['stepped outside', 'stepped onto', 'stepping outside', 'stepping onto'], action: 'stepping forward with one foot out looking around in awe' },
    // Stepped out (exiting a vehicle/building)
    { keywords: ['stepped out'], action: 'stepping forward with one foot out looking around in awe' },
    // Stepped forward bravely
    { keywords: ['stepped forward', 'stepping forward'], action: 'stepping forward bravely with one arm raised' },
    // Waddling (animal-specific locomotion)
    { keywords: ['waddled', 'waddling'], action: 'waddling forward with a big happy grin' },
    // Original compound actions
    { keywords: ['blasted off', 'blast off', 'blasts off'], action: 'blasting off excitedly with arms raised' },
    { keywords: ['soared over', 'soaring over', 'soars over'], action: 'soaring high with arms spread wide' },
    { keywords: ['flew over', 'flying over', 'flies over'], action: 'flying forward with arms outstretched' },
    { keywords: ['landed safely', 'safe landing', 'lands safely'], action: 'landing with feet touching down' },
    { keywords: ['climbed inside', 'climbing inside', 'climbs inside', 'climbed into'], action: 'climbing forward eagerly' },
    { keywords: ['taking off', 'took off', 'takes off'], action: 'leaping upward excitedly' },
    { keywords: ['dived in', 'dove in', 'dives in', 'jumped in'], action: 'diving forward arms first' },
    { keywords: ['reached the', 'arrived at', 'got to'], action: 'walking forward with arms raised in triumph' },
    { keywords: ['waved goodbye', 'waving goodbye'], action: 'waving one arm high in the air' },
    { keywords: ['tiptoed', 'tiptoeing', 'tiptoes'], action: 'tiptoeing forward carefully' },
    { keywords: ['peeked', 'peeking', 'peeks'], action: 'peeking around curiously' },
    { keywords: ['pointed', 'pointing', 'points'], action: 'pointing forward excitedly' },
  ];

  for (const { keywords, action } of priorityActions) {
    if (keywords.some(kw => text.includes(kw))) {
      return `${characterName} ${action}`;
    }
  }

  // Priority 2: Single-verb actions with specific pose descriptions
  // Uses REGEX to match all verb tenses: past ("danced"), present ("dance"),
  // participle ("dancing"), and 3rd person ("dances").
  // Also uses isCharacterAction() proximity check to avoid matching
  // supporting character verbs (e.g., "bouncing bunnies" ≠ Riri bouncing).
  //
  // ORDER MATTERS: More dynamic/physical verbs first, then perception verbs (look, gaze).
  // This ensures "Riri swam...he looked around" matches "swam" not "looked".
  const verbActions: [RegExp, string][] = [
    // === High-priority physical movement verbs ===
    [/\b(?:fl(?:y|ying|ew|ies))\b/, 'flying with arms spread wide'],
    [/\b(?:soar(?:ed|ing|s)?)\b/, 'soaring through the air arms outstretched'],
    [/\b(?:sw[ai]mm?(?:ing|s)?|swam)\b/, 'swimming forward with legs kicking'],
    [/\b(?:hopp?(?:ed|ing|s)?)\b/, 'hopping up and down excitedly'],
    [/\b(?:r[au]n(?:ning|s)?)\b/, 'running forward with legs in stride'],
    [/\b(?:walk(?:ed|ing|s)?)\b/, 'walking forward with one foot ahead'],
    [/\b(?:jump(?:ed|ing|s)?)\b/, 'jumping up with legs off the ground'],
    [/\b(?:leap(?:ed|ing|s|t)?)\b/, 'leaping through the air'],
    [/\b(?:danc(?:e[ds]?|ing))\b/, 'dancing joyfully with arms raised'],
    [/\b(?:float(?:ed|ing|s)?)\b/, 'floating weightlessly with limbs spread'],
    [/\b(?:climb(?:ed|ing|s)?)\b/, 'climbing upward with arms reaching high'],
    [/\b(?:div(?:e[ds]?|ing)|dove)\b/, 'diving downward arms first'],
    [/\b(?:sl(?:id[es]?|ide|iding))\b/, 'sliding forward playfully'],
    [/\b(?:sp[iu]n(?:ning|s)?)\b/, 'spinning around with arms out'],
    [/\b(?:skip(?:ped|ping|s)?)\b/, 'skipping forward happily'],
    [/\b(?:march(?:ed|ing|es)?)\b/, 'marching forward with big confident steps'],
    [/\b(?:sneak(?:ed|ing|s)?|snuck)\b/, 'crouching and sneaking forward quietly'],
    [/\b(?:lumber(?:ed|ing|s)?)\b/, 'lumbering forward with heavy steps'],
    [/\b(?:approach(?:ed|ing|es)?)\b/, 'walking forward carefully with arms at sides'],
    [/\b(?:ventur(?:e[ds]?|ing))\b/, 'walking forward looking around curiously'],
    [/\b(?:r(?:ide|ode|iding|ides))\b/, 'sitting and riding forward'],
    // === Interactive/social verbs ===
    [/\b(?:play(?:ed|ing|s)?)\b/, 'bouncing playfully mid-motion'],
    [/\b(?:explor(?:e[ds]?|ing))\b/, 'walking forward looking around curiously'],
    [/\b(?:laugh(?:ed|ing|s|ter)?)\b/, 'laughing with head tilted back happily'],
    [/\b(?:wav(?:e[ds]?|ing))\b/, 'waving one arm up high'],
    [/\b(?:hugg?(?:ed|ing|s)?)\b/, 'standing happily with arms open wide smiling warmly'],
    [/\b(?:cheer(?:ed|ing|s)?)\b/, 'cheering with both arms raised high'],
    [/\b(?:exclaim(?:ed|ing|s)?)\b/, 'standing with arms raised in excitement'],
    [/\b(?:lead(?:ing|s)?|led)\b/, 'walking forward confidently arm raised'],
    [/\b(?:guid(?:e[ds]?|ing))\b/, 'steering forward with arms out confidently'],
    [/\b(?:sl(?:eep|ept)(?:ing|s)?)\b/, 'curled up sleeping peacefully'],
    [/\b(?:eat(?:ing|s|en)?|ate)\b/, 'sitting down eating happily'],
    [/\b(?:read(?:ing|s)?)\b/, 'sitting and holding a book'],
    [/\b(?:s[au]ng|sing(?:ing|s)?)\b/, 'singing happily with mouth open wide'],
    [/\b(?:bounc(?:e[ds]?|ing))\b/, 'bouncing up mid-jump'],
    // === Perception/state verbs — LAST because they're weaker visual cues ===
    [/\b(?:look(?:ed|ing|s)?)\b/, 'looking upward with wide eyes in awe'],
    [/\b(?:gaz(?:e[ds]?|ing))\b/, 'gazing upward in wonder'],
    [/\b(?:spot(?:ted|ting|s)?)\b/, 'looking up with wide surprised eyes pointing forward'],
    [/\b(?:notic(?:e[ds]?|ing))\b/, 'looking up with wide surprised eyes pointing forward'],
    [/\b(?:st(?:and|ood)(?:ing|s)?)\b/, 'standing proudly with a big smile'],
    [/\b(?:smil(?:e[ds]?|ing))\b/, 'standing with a wide happy smile'],
    [/\b(?:land(?:ed|ing|s)?)\b/, 'touching down with feet on the ground'],
    [/\b(?:blast(?:ed|ing|s)?)\b/, 'bracing excitedly with arms up'],
    [/\b(?:point(?:ed|ing|s)?)\b/, 'pointing forward excitedly'],
  ];

  for (const [verbPattern, poseAction] of verbActions) {
    if (isCharacterAction(text, verbPattern, characterName)) {
      return `${characterName} ${poseAction}`;
    }
  }

  // Priority 3: Emotion/state-based pose (when no action verb found)
  // Use word boundaries to avoid false positives ("wonderful" ≠ "wonder", "excitement" ≠ "excit")
  // NOTE: "worried", "nervous", "scared" are HERE (not Priority 1) so physical actions win
  if (/\bexcit(?:ed|edly|ement|ing)\b/.test(text) || text.includes('thrill')) return `${characterName} jumping excitedly with arms raised`;
  if (/\bwonder(?:ing|s)?\b/.test(text) && !text.includes('wonderful')) return `${characterName} gazing upward in wonder`;
  if (/\bamazed?\b/.test(text) || /\bmarvel/.test(text)) return `${characterName} gazing upward in wonder`;
  if (text.includes('curious') || /\bdiscover/.test(text)) return `${characterName} leaning forward curiously reaching out`;
  if (/\bhapp(?:y|ily|iness)\b/.test(text) || /\bjoy(?:ful|fully|ous|ously)?\b/.test(text)) return `${characterName} bouncing joyfully mid-jump`;
  if (text.includes('brave') || text.includes('courage')) return `${characterName} standing tall with a determined pose`;
  if (/\bworried\b/.test(text) || /\bnervous\b/.test(text) || /\bscar(?:ed|y)\b/.test(text) || /\bafraid\b/.test(text)) return `${characterName} standing nervously with a worried expression`;
  if (/\bwelcome\b/.test(text)) return `${characterName} waving happily with one arm raised`;

  // Priority 4: Fallback using setting context for a relevant pose
  // Check for physical locations — NOT compound references like "moon creatures"
  if (text.includes('ocean') || text.includes('water') || text.includes('sea')) return `${characterName} splashing in water playfully`;
  if (text.includes('forest') || text.includes('jungle') || text.includes('clearing')) return `${characterName} walking forward looking around curiously`;
  // Space/moon fallback: explicit moon-surface phrases, bare "moon" as a setting keyword
  // (but NOT "moonlight", "moon creatures" which are descriptors, not settings)
  const moonSurfaceFallback = /(?:on|landed\s+on|reached)\s+(?:the\s+)?moon|moon\s+surface/i;
  const bareMoon = /\bmoon\b/i.test(text) && !text.includes('moonlight') && !text.includes('moon creature');
  if (text.includes('space') || moonSurfaceFallback.test(text) || bareMoon || text.includes('stars twinkl')) return `${characterName} floating weightlessly with limbs spread`;
  if (text.includes('mountain') || text.includes('hill')) return `${characterName} climbing upward with arms reaching`;

  return `${characterName} standing with one arm waving happily`;
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
 * Generate all scene cards for a story.
 * Maintains a namedCharacterMap across pages so named characters like "Luma"
 * (introduced as "bunny named Luma" on page 3) are recognized on later pages.
 */
export function generateAllSceneCards(
  pages: { text: string }[],
  bible: CharacterBible
): PageSceneCard[] {
  const sceneCards: PageSceneCard[] = [];
  const namedCharMap = new Map<string, string>();

  for (let i = 0; i < pages.length; i++) {
    const card = generatePageSceneCard(
      pages[i].text,
      i + 1,
      bible,
      sceneCards,
      namedCharMap
    );
    sceneCards.push(card);
  }

  return sceneCards;
}
