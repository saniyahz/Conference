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

const SCENE_CARD_PROMPT = `You are extracting a SCENE CARD for a children's picture book illustration.

CRITICAL RULES
1) Use ONLY details explicitly in the page text. Do not invent scenes.
2) Never output vague placeholders like "storybook scene", "indoor room", "colorful scene" unless the page text literally says that.
3) Convert the page into:
   - setting (1 short sentence)
   - action (1 short sentence)
   - must_include (4–7 concrete visual items, including counts when possible)
   - supporting_characters (0–3 with species/type + count)
   - camera (wide / medium / close-up) with a reason
   - mood (1–3 words)
4) If the text includes conflicting elements (e.g., savannah + cockpit interior), resolve it by choosing the PRIMARY location and reframe the other as a visible detail (e.g., "open hatch shows cockpit").
5) If the text requires readable text (flag that says something), replace with "blank flag" or "flag with doodle marks" because we avoid legible text in images.
6) Output MUST be valid JSON and match the schema exactly. No extra keys. No commentary.

SCHEMA
{
  "page_index": 1,
  "setting": "string",
  "action": "string",
  "must_include": ["string","string","string","string"],
  "supporting_characters": [
    { "type": "string", "count": 1, "notes": "string" }
  ],
  "camera": "wide|medium|close-up",
  "mood": "string"
}

Now extract the scene card from this PAGE TEXT:`;

/**
 * Try calling a Llama model for scene card extraction.
 * Returns parsed UniversalSceneCard or throws on failure.
 */
async function tryLLMSceneCard(
  replicate: Replicate,
  model: string,
  fullPrompt: string,
  pageIndex: number
): Promise<UniversalSceneCard> {
  const output = await replicate.run(
    model as `${string}/${string}` | `${string}/${string}:${string}`,
    {
      input: {
        prompt: fullPrompt,
        temperature: 0.2,
        max_tokens: 800,
        top_p: 0.9,
      }
    }
  ) as string[];

  const responseText = output.join('');
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON found in SceneCard response for page ${pageIndex}`);
  }

  const card = JSON.parse(jsonMatch[0]) as UniversalSceneCard;
  card.page_index = pageIndex;
  return card;
}

/**
 * Generate SceneCard for a single page.
 * DETERMINISTIC MODE: Uses rule-based mapper directly from page text.
 * LLM scene cards were unreliable (Replicate Llama 500 errors caused wrong
 * fallback settings like "Cozy cottage" for rocket scenes).
 * The rule-based mapper extracts location nouns directly from page text —
 * stable, fast, and no API dependency.
 */
export async function generateSceneCardWithLLM(
  replicate: Replicate,
  pageIndex: number,
  pageText: string,
  characterName: string
): Promise<UniversalSceneCard> {
  return createFallbackSceneCard(pageIndex, pageText, characterName);
}

/**
 * Generate SceneCards for all pages — fully deterministic, no LLM calls.
 * Uses rule-based extraction from page text (instant).
 */
export async function generateAllSceneCardsWithLLM(
  replicate: Replicate,
  pages: { pageNumber: number; text: string }[],
  characterName: string
): Promise<UniversalSceneCard[]> {
  console.log('\n========== GENERATING SCENE CARDS (DETERMINISTIC) ==========');

  const sceneCards = pages.map((page) => {
    const card = createFallbackSceneCard(page.pageNumber, page.text, characterName);
    console.log(`Page ${page.pageNumber} setting: ${card.setting.substring(0, 60)}...`);
    return card;
  });

  console.log('==========================================================\n');
  return sceneCards;
}

/**
 * Extract concrete nouns from page text for must_include
 */
function extractNounsFromText(text: string): string[] {
  const lowerText = text.toLowerCase()
  const nouns: string[] = []

  // Visual nouns that make good illustration elements
  const nounPatterns: { pattern: RegExp; noun: string }[] = [
    { pattern: /rocket\s*(ship)?/i, noun: 'rocket ship' },
    { pattern: /moon/i, noun: 'moon' },
    { pattern: /crater/i, noun: 'craters' },
    { pattern: /star/i, noun: 'twinkling stars' },
    { pattern: /earth/i, noun: 'Earth in the sky' },
    { pattern: /planet/i, noun: 'colorful planet' },
    { pattern: /dolphin/i, noun: 'dolphins' },
    { pattern: /lion/i, noun: 'lions' },
    { pattern: /ocean|sea\b/i, noun: 'ocean waves' },
    { pattern: /water/i, noun: 'water' },
    { pattern: /splash/i, noun: 'water splash' },
    { pattern: /wave/i, noun: 'waves' },
    { pattern: /forest/i, noun: 'forest trees' },
    { pattern: /tree/i, noun: 'tall trees' },
    { pattern: /flower/i, noun: 'colorful flowers' },
    { pattern: /meadow|field/i, noun: 'green meadow' },
    { pattern: /mountain/i, noun: 'mountains' },
    { pattern: /river|stream/i, noun: 'flowing river' },
    { pattern: /cloud/i, noun: 'fluffy clouds' },
    { pattern: /sun\b/i, noun: 'bright sun' },
    { pattern: /rainbow/i, noun: 'rainbow' },
    { pattern: /friend/i, noun: 'friends' },
    { pattern: /cave/i, noun: 'cave entrance' },
    { pattern: /island/i, noun: 'island' },
    { pattern: /bridge/i, noun: 'bridge' },
    { pattern: /coral/i, noun: 'colorful coral' },
    { pattern: /fish/i, noun: 'tropical fish' },
    { pattern: /rabbit|bunny|bunnies/i, noun: 'rabbits' },
    { pattern: /alien/i, noun: 'friendly aliens' },
    { pattern: /cockpit|control\s*panel/i, noun: 'glowing control panel' },
    { pattern: /waterfall/i, noun: 'waterfall' },
    { pattern: /shelter|hut\b/i, noun: 'shelter' },
    { pattern: /storm/i, noun: 'storm clouds' },
  ]

  for (const { pattern, noun } of nounPatterns) {
    if (pattern.test(lowerText) && !nouns.includes(noun)) {
      nouns.push(noun)
    }
  }

  return nouns
}

/**
 * Create fallback SceneCard when LLM fails.
 * Extracts location nouns DIRECTLY from the page text — no preset templates.
 * Setting is built from 1-2 extracted nouns, not mapped to verbose descriptions.
 */
function createFallbackSceneCard(
  pageIndex: number,
  pageText: string,
  characterName: string
): UniversalSceneCard {
  const lowerText = pageText.toLowerCase();
  console.log(`[FALLBACK SCENE] Page ${pageIndex}: extracting from "${pageText.substring(0, 80)}..."`)

  // CANONICAL SCENE BUCKETS — each page maps to exactly ONE scene.
  // No more "near" compound strings that confuse SDXL.
  //
  // RULE: Pick scene by ENVIRONMENT keywords first, rocket/space second.
  // A rocket can appear in ANY environment (savannah, ocean, forest), but
  // a savannah/ocean IS the environment. Only pick "rocket interior" if
  // text explicitly describes being inside (cockpit, controls, sat in, buckled).
  //
  // Priority: interior > underwater > savannah > forest > ocean > moon > space > rocket > others
  const CANONICAL_SCENES: { pattern: RegExp; bucket: string; mood: string }[] = [
    // === INTERIOR (only if text explicitly says "inside" the rocket) ===
    { pattern: /cockpit|control\s*panel|pilot\s*seat|dashboard/, bucket: 'rocket cockpit interior with glowing controls and stars through window', mood: 'exciting' },
    { pattern: /(rocket|spaceship).*(inside|sat in|buckled|strapped)|(inside|sat in|buckled|strapped).*(rocket|spaceship)/, bucket: 'inside rocket ship with porthole windows showing stars', mood: 'exciting' },
    // === UNDERWATER (specific, high priority) ===
    { pattern: /underwater|beneath\s*the\s*water|ocean\s*floor/, bucket: 'underwater ocean with coral reef and sunbeams', mood: 'magical' },
    // === ENVIRONMENT KEYWORDS FIRST (the scene IS the environment) ===
    { pattern: /savann|grassland|tall\s*grass|open\s*plain/, bucket: 'golden savannah with scattered acacia trees and warm light', mood: 'warm' },
    { pattern: /waterfall/, bucket: 'forest clearing with cascading waterfall and mist', mood: 'magical' },
    { pattern: /forest|woods|jungle/, bucket: 'lush green forest with tall trees and dappled sunlight', mood: 'enchanting' },
    { pattern: /dolphin/, bucket: 'sparkling open ocean with leaping dolphins', mood: 'playful' },
    { pattern: /ocean|sea\b|splash.*water|water.*splash/, bucket: 'open ocean with gentle waves under bright sky', mood: 'adventurous' },
    { pattern: /moon.*(surface|landed|crater|walked|bounce|hop)|(surface|landed|crater|walked).*moon/, bucket: 'moon surface with craters and Earth visible in sky', mood: 'wondrous' },
    { pattern: /moon/, bucket: 'moon surface with craters and starry sky', mood: 'wondrous' },
    { pattern: /lion/, bucket: 'golden savannah with scattered acacia trees and warm light', mood: 'warm' },
    { pattern: /beach|shore/, bucket: 'sandy tropical beach with palm trees and gentle waves', mood: 'cheerful' },
    { pattern: /mountain|hill/, bucket: 'rolling green mountains under bright blue sky', mood: 'majestic' },
    { pattern: /river|stream/, bucket: 'peaceful river flowing through green valley', mood: 'peaceful' },
    { pattern: /cave/, bucket: 'mysterious cave entrance with glowing light inside', mood: 'mysterious' },
    { pattern: /desert/, bucket: 'vast desert with golden sand dunes under blue sky', mood: 'vast' },
    { pattern: /meadow|field/, bucket: 'sunny meadow with colorful wildflowers', mood: 'peaceful' },
    { pattern: /storm/, bucket: 'dramatic stormy sky over rocky landscape', mood: 'dramatic' },
    { pattern: /starry|night\s*sky|under\s*the\s*stars/, bucket: 'open field under starry night sky with glowing stars', mood: 'wondrous' },
    // === ROCKET/SPACE LAST (only if no environment keyword matched) ===
    { pattern: /space|galaxy|nebula/, bucket: 'deep space with colorful nebula and distant stars', mood: 'wondrous' },
    { pattern: /rocket|spaceship|blast\s*off|launch/, bucket: 'rocket launching into bright blue sky with fluffy clouds', mood: 'exciting' },
    // === HOME (fallback for indoor scenes) ===
    { pattern: /home|house|bed/, bucket: 'cozy cottage interior with warm golden light', mood: 'warm' },
  ]

  // First match wins — scenes are ordered by priority
  let setting = 'colorful outdoor landscape'
  let mood = 'magical'
  for (const { pattern, bucket, mood: m } of CANONICAL_SCENES) {
    if (pattern.test(lowerText)) {
      setting = bucket
      mood = m
      break
    }
  }

  console.log(`[FALLBACK SCENE] Page ${pageIndex} canonical setting: "${setting}"`)

  // ===== SETTING-CATEGORY NOUN GATING =====
  // Only allow nouns that belong to the detected setting category.
  // Prevents "ocean waves" from appearing in a cockpit scene, or
  // "forest trees" from appearing on the moon.
  const CATEGORY_ALLOWED_NOUNS: Record<string, string[]> = {
    cockpit:    ['rocket ship', 'glowing control panel', 'twinkling stars', 'Earth in the sky', 'colorful planet'],
    'inside rocket': ['rocket ship', 'glowing control panel', 'twinkling stars', 'Earth in the sky'],
    moon:       ['moon', 'craters', 'twinkling stars', 'Earth in the sky', 'rocket ship', 'colorful planet', 'friendly aliens', 'rabbits', 'moon rabbits in tiny spacesuits'],
    rocket:     ['rocket ship', 'fluffy clouds', 'twinkling stars', 'bright sun', 'Earth in the sky'],
    space:      ['twinkling stars', 'colorful planet', 'rocket ship', 'Earth in the sky', 'friendly aliens'],
    underwater: ['colorful coral', 'tropical fish', 'water', 'ocean waves', 'waves'],
    ocean:      ['ocean waves', 'waves', 'water', 'dolphins', 'water splash', 'island', 'bright sun', 'fluffy clouds', 'tropical fish'],
    forest:     ['forest trees', 'tall trees', 'colorful flowers', 'green meadow', 'lions', 'rainbow', 'bridge', 'bright sun', 'fluffy clouds', 'waterfall'],
    waterfall:  ['waterfall', 'forest trees', 'tall trees', 'colorful flowers', 'flowing river', 'rainbow', 'bright sun'],
    storm:      ['storm clouds', 'shelter', 'rocket ship', 'twinkling stars', 'moon', 'craters'],
    savann:     ['lions', 'bright sun', 'mountains', 'tall trees'],
    beach:      ['ocean waves', 'water splash', 'bright sun', 'island', 'fluffy clouds'],
    mountain:   ['mountains', 'fluffy clouds', 'bright sun', 'rainbow', 'flowing river'],
    desert:     ['bright sun', 'mountains', 'cave entrance'],
    cave:       ['cave entrance', 'colorful flowers', 'mountains'],
    home:       ['colorful flowers', 'rainbow', 'bright sun', 'friends'],
  }

  // Gate nouns by setting category — MERGE ALL matching categories (not first-match).
  // A setting like "sparkling open ocean with leaping dolphins" matches both "ocean"
  // and "dolphin" categories, so allowed nouns = union of both.
  // Also preserves nouns whose core word (>3 chars) appears in the page text.
  function gateNounsBySetting(settingStr: string, nouns: string[], pageText: string): string[] {
    const sl = settingStr.toLowerCase()
    const pl = pageText.toLowerCase()

    // Merge ALL matching category allowed lists
    const allAllowed = new Set<string>()
    const matchedCategories: string[] = []
    for (const [category, allowed] of Object.entries(CATEGORY_ALLOWED_NOUNS)) {
      if (sl.includes(category)) {
        matchedCategories.push(category)
        for (const a of allowed) {
          allAllowed.add(a.toLowerCase())
        }
      }
    }

    if (matchedCategories.length === 0) return nouns  // No category match — keep all

    const gated = nouns.filter(noun => {
      const lowerNoun = noun.toLowerCase()
      // Keep if allowed by ANY matching category
      if (Array.from(allAllowed).some(a => lowerNoun.includes(a) || a.includes(lowerNoun))) return true
      // EXCEPTION: Keep noun if its core word (>3 chars) appears in the page text
      // e.g., "dolphins" stays if pageText contains "dolphin"
      const coreWords = lowerNoun.split(/\s+/).filter(w => w.length > 3)
      if (coreWords.some(w => pl.includes(w))) return true
      return false
    })

    const removed = nouns.filter(n => !gated.includes(n))
    if (removed.length > 0) {
      console.log(`[NOUN GATE] Setting "${settingStr}" (categories: ${matchedCategories.join('+')}): removed [${removed.join(', ')}], kept [${gated.join(', ')}]`)
    }
    return gated
  }

  // Extract action from text - more specific patterns
  const actionRules: { test: (t: string) => boolean; action: string }[] = [
    { test: t => t.includes('splash') || t.includes('landed in water'), action: `${characterName} splashes into the water` },
    { test: t => t.includes('swim'), action: `${characterName} swims through the water` },
    { test: t => t.includes('flew') || t.includes('flying') || t.includes('soar'), action: `${characterName} flies through the air` },
    { test: t => t.includes('pilot') || t.includes('drove') || t.includes('steer'), action: `${characterName} pilots the rocket ship` },
    { test: t => t.includes('sat in') && t.includes('rocket'), action: `${characterName} sits inside the rocket ship` },
    { test: t => t.includes('stumble') || t.includes('discover') || t.includes('found'), action: `${characterName} discovers something amazing` },
    { test: t => t.includes('walk') || t.includes('wander'), action: `${characterName} walks with curiosity` },
    { test: t => t.includes('run') || t.includes('ran') || t.includes('dash'), action: `${characterName} runs with excitement` },
    { test: t => t.includes('jump') || t.includes('leap'), action: `${characterName} jumps with joy` },
    { test: t => t.includes('hug') || t.includes('embrace'), action: `${characterName} hugs a friend warmly` },
    { test: t => t.includes('wave') && t.includes('goodbye'), action: `${characterName} waves goodbye` },
    { test: t => t.includes('smile') || t.includes('laugh') || t.includes('happy'), action: `${characterName} smiles happily` },
    { test: t => t.includes('look') || t.includes('saw') || t.includes('gaze'), action: `${characterName} looks around with wonder` },
    { test: t => t.includes('brought') || t.includes('carried'), action: `${characterName} carries friends along` },
  ]

  let action = `${characterName} explores with curiosity`;
  for (const rule of actionRules) {
    if (rule.test(lowerText)) {
      action = rule.action;
      break;
    }
  }

  // Extract concrete nouns from text, then gate by setting category
  const rawNouns = extractNounsFromText(pageText)
  const gatedNouns = gateNounsBySetting(setting, rawNouns, pageText)

  // SPECIALIZE "friends" — convert generic "friends" to setting-appropriate creatures.
  // This prevents vague "friends" from being ignored by SDXL and ensures the
  // supporting characters match the story world (e.g., "moon rabbits in spacesuits").
  const settingLower = setting.toLowerCase()
  const specializedNouns = gatedNouns.map(noun => {
    if (noun.toLowerCase() !== 'friends') return noun
    if (settingLower.includes('moon') || settingLower.includes('crater')) return 'moon rabbits in tiny spacesuits'
    if (settingLower.includes('ocean') || settingLower.includes('dolphin')) return 'playful dolphins'
    if (settingLower.includes('forest') || settingLower.includes('trees')) return 'friendly forest animals'
    if (settingLower.includes('savann') || settingLower.includes('lion')) return 'friendly lions'
    if (settingLower.includes('space') || settingLower.includes('nebula')) return 'friendly aliens'
    if (settingLower.includes('beach')) return 'friendly sea creatures'
    return 'friendly small creatures'  // fallback
  })

  const mustInclude = [`${characterName} full body`, ...specializedNouns]

  // Pad to 4 items with generic illustration elements (no setting substrings)
  const padItems = ['vibrant colors', 'soft lighting', 'detailed background']
  for (const pad of padItems) {
    if (mustInclude.length >= 4) break
    if (!mustInclude.includes(pad)) mustInclude.push(pad)
  }

  // Extract supporting characters more thoroughly
  // "friends" is specialized based on setting (same logic as noun specialization)
  const supportingCharacters: { type: string; count: number; notes: string }[] = [];
  const charPatterns: { pattern: RegExp; type: string; count: number; notes: string }[] = [
    { pattern: /alien/i, type: 'friendly alien', count: 2, notes: 'small colorful aliens' },
    { pattern: /rabbit/i, type: 'rabbit in spacesuit', count: 3, notes: 'small rabbits in tiny spacesuits' },
    { pattern: /dolphins?/i, type: 'dolphin', count: 3, notes: 'playful cartoon dolphins' },
    { pattern: /lions?/i, type: 'lion', count: 2, notes: 'friendly cartoon lions' },
    { pattern: /birds?/i, type: 'bird', count: 2, notes: 'colorful flying birds' },
    { pattern: /butterfl/i, type: 'butterfly', count: 3, notes: 'colorful butterflies' },
    { pattern: /fish/i, type: 'fish', count: 3, notes: 'colorful tropical fish' },
    { pattern: /luminari/i, type: 'glowing creature', count: 3, notes: 'small glowing moon creatures' },
  ]

  for (const { pattern, type, count, notes } of charPatterns) {
    if (pattern.test(lowerText) && supportingCharacters.length < 3) {
      supportingCharacters.push({ type, count, notes })
    }
  }

  // Specialize "friends" into setting-appropriate supporting characters
  // (only if no specific creature was already detected above)
  if (/friends?\b/i.test(lowerText) && supportingCharacters.length === 0) {
    if (settingLower.includes('moon') || settingLower.includes('crater')) {
      supportingCharacters.push({ type: 'rabbit in spacesuit', count: 3, notes: 'small moon rabbits in tiny spacesuits' })
    } else if (settingLower.includes('ocean') || settingLower.includes('dolphin')) {
      supportingCharacters.push({ type: 'dolphin', count: 3, notes: 'playful cartoon dolphins' })
    } else if (settingLower.includes('forest') || settingLower.includes('trees')) {
      supportingCharacters.push({ type: 'forest animal', count: 2, notes: 'friendly woodland creatures' })
    } else if (settingLower.includes('savann') || settingLower.includes('lion')) {
      supportingCharacters.push({ type: 'lion', count: 2, notes: 'friendly cartoon lions' })
    } else {
      supportingCharacters.push({ type: 'small creature', count: 3, notes: 'friendly small creatures' })
    }
  }

  console.log(`[FALLBACK SCENE] Page ${pageIndex} → setting: "${setting}", nouns: [${gatedNouns.join(', ')}]`)

  return {
    page_index: pageIndex,
    setting,
    action,
    must_include: mustInclude.slice(0, 7),
    supporting_characters: supportingCharacters,
    camera: supportingCharacters.length > 0 ? 'wide' : 'medium',
    mood
  };
}
