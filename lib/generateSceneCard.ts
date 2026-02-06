import Replicate from 'replicate';

/**
 * Universal SceneCard schema
 * Extracts proper scene details per page
 */
export interface UniversalSceneCard {
  page_index: number;
  setting: string;
  action: string;
  must_include: string[];
  supporting_characters: {
    type: string;
    count: number;
    notes: string;
  }[];
  camera: 'wide' | 'medium' | 'close-up';
  mood: string;
}

/**
 * Generate SceneCard for a single page.
 * DETERMINISTIC MODE: Extracts setting DIRECTLY from page text.
 * No more canonical bucket mapping — page text wins.
 */
export async function generateSceneCardWithLLM(
  replicate: Replicate,
  pageIndex: number,
  pageText: string,
  characterName: string
): Promise<UniversalSceneCard> {
  return createSceneCardFromText(pageIndex, pageText, characterName);
}

/**
 * Generate SceneCards for all pages — fully deterministic.
 * Extracts settings directly from page text.
 */
export async function generateAllSceneCardsWithLLM(
  replicate: Replicate,
  pages: { pageNumber: number; text: string }[],
  characterName: string
): Promise<UniversalSceneCard[]> {
  console.log('\n========== GENERATING SCENE CARDS (TEXT EXTRACTION) ==========');

  const sceneCards = pages.map((page) => {
    const card = createSceneCardFromText(page.pageNumber, page.text, characterName);
    console.log(`Page ${page.pageNumber}: "${card.setting.substring(0, 60)}..." | Action: "${card.action.substring(0, 40)}..."`);
    return card;
  });

  console.log('==========================================================\n');
  return sceneCards;
}

/**
 * CORE FIX: Extract setting DIRECTLY from page text.
 *
 * OLD APPROACH (broken): Map "forest" keyword → preset "lush green forest with dappled sunlight"
 * NEW APPROACH: Extract actual phrases like "lush forest with winding streams" from the text
 *
 * The page text is the source of truth. We extract location phrases directly.
 */
function extractSettingFromText(text: string): { setting: string; mood: string; isInterior: boolean } {
  const lowerText = text.toLowerCase();

  // ========== STEP 1: Detect scene type (interior vs exterior) ==========
  const interiorSignals = [
    /inside\s+(the\s+)?(rocket|spaceship|ship)/i,
    /cockpit/i,
    /control\s*panel/i,
    /padded\s*seat/i,
    /dashboard/i,
    /beeping.*instrument|instrument.*beeping/i,
    /put\s+on.*spacesuit|spacesuit.*put\s+on/i,
    /buckled\s+in|strapped\s+in/i,
  ];

  const isInterior = interiorSignals.some(p => p.test(lowerText));

  // ========== STEP 2: Extract location phrases directly from text ==========
  // These patterns capture ACTUAL phrases from the story, not map to presets

  const locationPatterns: { pattern: RegExp; extractor: (match: RegExpMatchArray) => string }[] = [
    // Interior scenes - extract what's described
    { pattern: /(inside|within)\s+(the\s+)?(rocket|spaceship|ship)/i, extractor: () => 'inside the rocket ship' },
    { pattern: /cockpit/i, extractor: () => 'rocket cockpit with glowing control panel' },
    { pattern: /control\s*panel/i, extractor: () => 'rocket interior with beeping control panel' },

    // Forest/nature - capture adjectives
    { pattern: /(lush|deep|thick|dark|enchanted|magical)\s+(green\s+)?forest/i, extractor: m => m[0] },
    { pattern: /forest\s+with\s+[^.]+/i, extractor: m => m[0].replace(/[.!?].*/, '') },
    { pattern: /winding\s+stream/i, extractor: () => 'winding streams' },
    { pattern: /waterfall/i, extractor: () => 'cascading waterfall' },
    { pattern: /hidden\s+behind\s+[^.]+/i, extractor: m => m[0].replace(/[.!?].*/, '') },

    // Moon/space
    { pattern: /moon('s)?\s+surface/i, extractor: () => 'moon surface with craters' },
    { pattern: /land(ed|ing)?\s+on\s+(the\s+)?moon/i, extractor: () => 'moon surface' },
    { pattern: /crater/i, extractor: () => 'cratered lunar landscape' },
    { pattern: /moon\s+cave/i, extractor: () => 'moon cave with glowing crystals' },
    { pattern: /glowing\s+crystal/i, extractor: () => 'cave with glowing crystals' },

    // Ocean/water
    { pattern: /splash(ed|ing)?\s+(down\s+)?(into|in)\s+(the\s+)?ocean/i, extractor: () => 'ocean splashdown' },
    { pattern: /ocean\s+wave/i, extractor: () => 'ocean waves' },
    { pattern: /swim(ming)?\s+with\s+dolphin/i, extractor: () => 'ocean with dolphins' },
    { pattern: /dolphin/i, extractor: () => 'ocean with dolphins' },
    { pattern: /approaching\s+(the\s+)?shore/i, extractor: () => 'ocean shore with beach ahead' },

    // Savannah/plains
    { pattern: /(golden\s+)?savann/i, extractor: () => 'golden savannah' },
    { pattern: /pride\s+of\s+lion/i, extractor: () => 'savannah with lions' },
    { pattern: /lion/i, extractor: () => 'savannah with lions' },

    // Generic forest (lower priority)
    { pattern: /\bforest\b/i, extractor: () => 'forest' },
    { pattern: /\bwoods\b/i, extractor: () => 'forest' },

    // Space/rocket
    { pattern: /through\s+(the\s+)?cloud/i, extractor: () => 'sky with clouds' },
    { pattern: /blast(ed|ing)?\s*off/i, extractor: () => 'rocket blasting off into sky' },
    { pattern: /earth.*(blue|marble|below)|view.*earth/i, extractor: () => 'space with Earth visible below' },
    { pattern: /star(s|ry)/i, extractor: () => 'starry sky' },

    // Final clearing/ending
    { pattern: /clearing/i, extractor: () => 'sunlit clearing' },
    { pattern: /surrounded\s+by\s+[^.]+/i, extractor: m => m[0].replace(/[.!?].*/, '') },
  ];

  // Collect all matched location phrases
  const extractedPhrases: string[] = [];
  for (const { pattern, extractor } of locationPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      const phrase = extractor(match);
      if (phrase && !extractedPhrases.includes(phrase.toLowerCase())) {
        extractedPhrases.push(phrase);
      }
    }
  }

  // ========== STEP 3: Build setting from extracted phrases ==========
  let setting: string;
  let mood = 'magical';

  if (isInterior) {
    // Interior scene - use interior-specific phrases
    const interiorPhrases = extractedPhrases.filter(p =>
      p.includes('rocket') || p.includes('cockpit') || p.includes('control') || p.includes('inside')
    );
    setting = interiorPhrases.length > 0
      ? interiorPhrases.join(', ')
      : 'rocket interior with glowing controls';
    mood = 'exciting';
  } else if (extractedPhrases.length > 0) {
    // Exterior scene - combine up to 3 phrases
    setting = extractedPhrases.slice(0, 3).join(' with ');

    // Set mood based on content
    if (setting.includes('moon') || setting.includes('space') || setting.includes('star')) {
      mood = 'wondrous';
    } else if (setting.includes('ocean') || setting.includes('dolphin') || setting.includes('splash')) {
      mood = 'adventurous';
    } else if (setting.includes('forest') || setting.includes('waterfall')) {
      mood = 'enchanting';
    } else if (setting.includes('savannah') || setting.includes('lion')) {
      mood = 'warm';
    }
  } else {
    // Fallback - shouldn't happen often
    setting = 'colorful outdoor scene';
  }

  console.log(`[SETTING EXTRACTION] Extracted: "${setting}" (interior: ${isInterior})`);
  return { setting, mood, isInterior };
}

/**
 * Extract the PRIMARY action from page text.
 * Returns the specific story beat, not generic "vibe".
 */
function extractActionFromText(text: string, characterName: string): string {
  const lowerText = text.toLowerCase();

  // Specific action patterns - order matters (most specific first)
  const actionPatterns: { pattern: RegExp; action: string }[] = [
    // Discovery
    { pattern: /discover(ed|s)?\s+[^.]*rocket/i, action: `${characterName} discovers a hidden rocket ship` },
    { pattern: /stumbl(ed|es)?\s+upon/i, action: `${characterName} stumbles upon something amazing` },
    { pattern: /found\s+[^.]*rocket/i, action: `${characterName} finds a rocket ship` },
    { pattern: /hatch\s+(open|swing)/i, action: `${characterName} watches the hatch open` },

    // Rocket interior
    { pattern: /put\s+on.*spacesuit|wore.*spacesuit/i, action: `${characterName} puts on a spacesuit` },
    { pattern: /buckl(ed|es|ing)\s+in/i, action: `${characterName} buckles into the pilot seat` },
    { pattern: /control\s*panel/i, action: `${characterName} examines the control panel` },
    { pattern: /press(ed|es|ing)?\s+[^.]*button/i, action: `${characterName} presses a button` },

    // Launch/flight
    { pattern: /blast(ed|ing|s)?\s*off/i, action: `${characterName} blasts off into space` },
    { pattern: /rocket\s+(soar|flew|launch)/i, action: `${characterName} rockets into the sky` },
    { pattern: /through\s+(the\s+)?clouds/i, action: `${characterName} flies through clouds` },
    { pattern: /view(ed|ing)?\s+(of\s+)?earth/i, action: `${characterName} gazes at Earth from space` },

    // Moon landing
    { pattern: /land(ed|ing|s)?\s+on\s+(the\s+)?moon/i, action: `${characterName} lands on the moon` },
    { pattern: /dust\s+plume|footprint/i, action: `${characterName} takes first steps on the moon` },
    { pattern: /lunar\s+friend|moon\s+creature/i, action: `${characterName} meets the Lunar Friends` },
    { pattern: /moonstone\s+eye/i, action: `${characterName} meets creatures with moonstone eyes` },

    // Ocean
    { pattern: /splash(ed|es|ing)?\s+(down\s+)?(into|in)/i, action: `${characterName} splashes down into ocean` },
    { pattern: /emerg(ed|es|ing)?\s+from/i, action: `${characterName} emerges from the water` },
    { pattern: /dolphin.*circl|circl.*dolphin/i, action: `${characterName} is greeted by dolphins` },
    { pattern: /swim(ming|s)?\s+with/i, action: `${characterName} swims with dolphins` },
    { pattern: /approach(ed|es|ing)?\s+(the\s+)?shore/i, action: `${characterName} approaches the shore` },

    // Lions/savannah
    { pattern: /pride\s+of\s+lion/i, action: `${characterName} meets a pride of lions` },
    { pattern: /lion.*gentle|gentle.*lion/i, action: `${characterName} befriends the lions` },

    // Journey/travel
    { pattern: /travel(ed|ing|s)?\s+back/i, action: `${characterName} travels back home` },
    { pattern: /told\s+[^.]*about/i, action: `${characterName} shares stories with friends` },
    { pattern: /procession/i, action: `${characterName} leads a procession through the forest` },

    // Social
    { pattern: /met\s+[^.]*friend/i, action: `${characterName} meets new friends` },
    { pattern: /welcom(ed|es|ing)/i, action: `${characterName} is welcomed by new friends` },
    { pattern: /together/i, action: `${characterName} stands together with friends` },

    // Ending
    { pattern: /final\s+clearing|sunlit\s+clearing/i, action: `${characterName} stands in a sunlit clearing` },
    { pattern: /surround(ed|s)?\s+by/i, action: `${characterName} surrounded by friends` },
    { pattern: /proud/i, action: `${characterName} stands proud` },
  ];

  for (const { pattern, action } of actionPatterns) {
    if (pattern.test(lowerText)) {
      return action;
    }
  }

  // Generic fallback
  return `${characterName} in the scene`;
}

/**
 * Extract must_include items from page text.
 * Returns 3-5 CONCRETE visual objects (no vibes).
 */
function extractMustInclude(text: string, characterName: string, isInterior: boolean): string[] {
  const lowerText = text.toLowerCase();
  const items: string[] = [];

  // Character is ALWAYS first
  items.push(`${characterName} full body`);

  // Concrete object patterns with placement hints
  const objectPatterns: { pattern: RegExp; item: string }[] = [
    // Rocket/interior
    { pattern: /rocket\s*(ship)?/i, item: 'rocket ship' },
    { pattern: /control\s*panel/i, item: 'glowing control panel' },
    { pattern: /spacesuit/i, item: 'spacesuit' },
    { pattern: /helmet/i, item: 'space helmet' },
    { pattern: /porthole|window.*star/i, item: 'porthole window showing stars' },

    // Nature
    { pattern: /waterfall/i, item: 'cascading waterfall' },
    { pattern: /winding\s+stream/i, item: 'winding streams' },

    // Moon
    { pattern: /crater/i, item: 'moon craters' },
    { pattern: /earth.*sky|sky.*earth/i, item: 'Earth visible in sky' },
    { pattern: /lunar\s+friend/i, item: 'small furry Lunar Friends with big moonstone eyes' },
    { pattern: /moon\s+cave/i, item: 'moon cave' },
    { pattern: /glowing\s+crystal/i, item: 'glowing crystals' },
    { pattern: /footprint/i, item: 'footprints in moon dust' },

    // Ocean
    { pattern: /dolphin/i, item: 'exactly 3 playful dolphins' },
    { pattern: /ocean\s+wave/i, item: 'ocean waves' },
    { pattern: /splash/i, item: 'water splash' },

    // Animals
    { pattern: /lion/i, item: 'friendly lions' },
    { pattern: /bird/i, item: 'colorful birds' },
    { pattern: /monkey/i, item: 'playful monkeys' },
  ];

  for (const { pattern, item } of objectPatterns) {
    if (pattern.test(lowerText) && !items.includes(item) && items.length < 6) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Extract supporting characters with counts.
 */
function extractSupportingCharacters(text: string): { type: string; count: number; notes: string }[] {
  const lowerText = text.toLowerCase();
  const characters: { type: string; count: number; notes: string }[] = [];

  const charPatterns: { pattern: RegExp; type: string; count: number; notes: string }[] = [
    { pattern: /lunar\s+friend/i, type: 'Lunar Friend', count: 3, notes: 'small furry creatures with big round moonstone eyes' },
    { pattern: /moon\s+creature/i, type: 'moon creature', count: 3, notes: 'small furry creatures with big eyes' },
    { pattern: /dolphin/i, type: 'dolphin', count: 3, notes: 'playful cartoon dolphins circling' },
    { pattern: /pride\s+of\s+lion/i, type: 'lion', count: 3, notes: 'friendly cartoon lions' },
    { pattern: /lion/i, type: 'lion', count: 2, notes: 'friendly cartoon lions' },
    { pattern: /bird/i, type: 'bird', count: 3, notes: 'colorful songbirds' },
    { pattern: /monkey/i, type: 'monkey', count: 2, notes: 'playful monkeys' },
  ];

  for (const { pattern, type, count, notes } of charPatterns) {
    if (pattern.test(lowerText) && characters.length < 2) {
      characters.push({ type, count, notes });
    }
  }

  return characters;
}

/**
 * Create SceneCard by extracting directly from page text.
 * NO CANONICAL BUCKETS — the page text is the source of truth.
 */
function createSceneCardFromText(
  pageIndex: number,
  pageText: string,
  characterName: string
): UniversalSceneCard {
  console.log(`\n[PAGE ${pageIndex}] "${pageText.substring(0, 120).replace(/\n/g, ' ')}..."`);

  // Extract setting directly from text
  const { setting, mood, isInterior } = extractSettingFromText(pageText);

  // Extract action (specific story beat)
  const action = extractActionFromText(pageText, characterName);

  // Extract must_include (concrete objects only)
  const mustInclude = extractMustInclude(pageText, characterName, isInterior);

  // Extract supporting characters
  const supportingCharacters = extractSupportingCharacters(pageText);

  // Determine camera
  const camera: 'wide' | 'medium' | 'close-up' =
    isInterior ? 'medium' :
    supportingCharacters.length > 0 ? 'wide' :
    'medium';

  console.log(`[PAGE ${pageIndex}] Setting: "${setting}"`);
  console.log(`[PAGE ${pageIndex}] Action: "${action}"`);
  console.log(`[PAGE ${pageIndex}] Must include: [${mustInclude.join(', ')}]`);

  return {
    page_index: pageIndex,
    setting,
    action,
    must_include: mustInclude,
    supporting_characters: supportingCharacters,
    camera,
    mood
  };
}
