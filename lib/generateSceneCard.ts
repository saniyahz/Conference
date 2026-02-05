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
    // === DISCOVERY OUTDOORS (highest priority — "found/stumbled rocket" = outdoor scene) ===
    { pattern: /(stumbled upon|found|discovered|spotted).*(rocket|spaceship)/, bucket: 'golden savannah with scattered acacia trees and warm light', mood: 'warm' },
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

  // OUTDOOR OVERRIDE GUARD: If the page text has clear outdoor environment language
  // AND no explicit interior signal (cockpit, sat in, buckled), block rocket interior
  // scenes even if the text mentions "rocket". This prevents Page 1 "discovered a
  // rocket in the savannah" from becoming an interior scene.
  const hasOutdoorEnv =
    /(forest|woods|jungle|savann|grassland|tall\s*grass|open\s*plain|meadow|field|waterfall|river|stream|beach|shore|desert|mountain|hill)/.test(lowerText)
  const hasInteriorSignal =
    /(cockpit|control\s*panel|pilot\s*seat|dashboard|inside|sat in|sat down|buckled|strapped|buttons|lever|controls)/.test(lowerText)
  const blockRocketInterior = hasOutdoorEnv && !hasInteriorSignal

  // First match wins — scenes are ordered by priority
  let setting = 'colorful outdoor landscape'
  let mood = 'magical'
  for (const { pattern, bucket, mood: m } of CANONICAL_SCENES) {
    // Skip interior scenes when outdoor environment is clearly present
    if (blockRocketInterior && (bucket.includes('inside rocket') || bucket.includes('cockpit interior'))) {
      continue
    }
    if (pattern.test(lowerText)) {
      setting = bucket
      mood = m
      break
    }
  }

  console.log(`[FALLBACK SCENE] Page ${pageIndex} canonical setting: "${setting}"`)

  // ===== STRICT SINGLE-CATEGORY NOUN GATING =====
  // Each setting maps to exactly ONE category via categoryForSetting().
  // Then ALLOWED_BY_CAT regex determines which extracted nouns survive.
  // This replaces the old multi-category union approach which accidentally
  // allowed cross-environment nouns (waterfall inside rocket, etc).

  // Nouns that can appear in ANY scene (transportable objects, celestial bodies)
  const CROSS_SCENE_NOUNS = new Set([
    'rocket ship', 'twinkling stars', 'earth in the sky', 'moon', 'colorful planet',
    'glowing control panel',
  ])

  function categoryForSetting(s: string): string {
    const sl = s.toLowerCase()
    if (sl.includes('cockpit') || sl.includes('inside rocket')) return 'rocket_interior'
    if (sl.includes('underwater') || sl.includes('coral reef')) return 'underwater'
    // savannah BEFORE forest — "acacia trees" contains "trees" but is savannah
    if (sl.includes('savann') || sl.includes('grassland') || sl.includes('acacia')) return 'savannah'
    if (sl.includes('waterfall')) return 'forest'
    if (sl.includes('forest') || sl.includes('woods') || sl.includes('jungle') || sl.includes('dappled sunlight') || sl.includes('lush green')) return 'forest'
    if (sl.includes('ocean') || sl.includes('dolphin') || sl.includes('waves')) return 'ocean'
    if (sl.includes('beach') || sl.includes('palm')) return 'ocean'
    if (sl.includes('moon') || sl.includes('crater')) return 'moon'
    if (sl.includes('space') || sl.includes('nebula')) return 'space'
    if (sl.includes('rocket launching') || sl.includes('bright blue sky')) return 'rocket_launch'
    if (sl.includes('desert')) return 'desert'
    if (sl.includes('cave')) return 'cave'
    if (sl.includes('mountain')) return 'mountain'
    if (sl.includes('starry') || sl.includes('night sky')) return 'night'
    if (sl.includes('home') || sl.includes('cottage')) return 'home'
    if (sl.includes('storm')) return 'storm'
    return 'other'
  }

  // Regex allowlists per category. Nouns must match to survive gating.
  // "rocket" and "spaceship" allowed in most categories (transportable object).
  const ALLOWED_BY_CAT: Record<string, RegExp> = {
    rocket_interior: /(rocket|spaceship|cockpit|control|panel|dashboard|seat|porthole|window|stars|moon|earth|planet)/i,
    underwater:      /(coral|fish|water|ocean|waves?|splash)/i,
    forest:          /(rocket|spaceship|forest|trees?|waterfall|river|stream|sunlight|clearing|lions?|flowers?|meadow|rainbow|bridge|bright sun)/i,
    savannah:        /(rocket|spaceship|savann|grass|acacia|trees?|lions?|sun|mountains?|meadow|clouds?|river|flowers?)/i,
    ocean:           /(rocket|spaceship|ocean|waves?|water|splash|dolphins?|beach|shore|island|sun|clouds?|fish)/i,
    moon:            /(rocket|spaceship|moon|crater|earth|stars|rabbits?|spacesuit|aliens?|planet)/i,
    space:           /(rocket|spaceship|stars|moon|earth|nebula|planet|aliens?)/i,
    rocket_launch:   /(rocket|spaceship|clouds?|stars|sun|earth|sky)/i,
    desert:          /(rocket|spaceship|desert|sand|dune|sun|mountains?|cave)/i,
    cave:            /(rocket|spaceship|cave|flowers?|mountains?|crystals?)/i,
    mountain:        /(rocket|spaceship|mountains?|clouds?|sun|rainbow|river|stream)/i,
    night:           /(rocket|spaceship|stars|moon|earth|sky)/i,
    home:            /(rocket|spaceship|flowers?|rainbow|sun|friends)/i,
    storm:           /(rocket|spaceship|storm|shelter|clouds?|stars|moon|crater)/i,
    other:           /./i,  // Allow everything if no category matched
  }

  function gateNounsBySetting(settingStr: string, nouns: string[]): string[] {
    const cat = categoryForSetting(settingStr)
    const allow = ALLOWED_BY_CAT[cat] ?? ALLOWED_BY_CAT.other

    const gated = nouns.filter(noun => {
      const lowerNoun = noun.toLowerCase()
      // Always allow cross-scene nouns (rocket ship, stars, earth, moon, planet)
      if (CROSS_SCENE_NOUNS.has(lowerNoun)) return true
      // Check against category regex
      return allow.test(lowerNoun)
    })

    const removed = nouns.filter(n => !gated.includes(n))
    if (removed.length > 0) {
      console.log(`[NOUN GATE] Setting "${settingStr}" (category: ${cat}): removed [${removed.join(', ')}], kept [${gated.join(', ')}]`)
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
  const gatedNouns = gateNounsBySetting(setting, rawNouns)

  // SPECIALIZE "friends" — but ONLY when page text has explicit companion signals.
  // Without a signal like "met/welcomed/joined/together/the rabbits/the dolphins",
  // "friends" is too vague and introduces wrong creatures. Drop it instead.
  // Uses category (from categoryForSetting) instead of scanning setting text
  // to avoid "acacia trees" in savannah matching settingLower.includes('trees').
  const category = categoryForSetting(setting)
  const hasCompanionSignal = /(friends|together|welcomed|met|joined|invited|the rabbits|the dolphins|the lions|new friends|made friends)/.test(lowerText)

  const specializedNouns = gatedNouns.map(noun => {
    if (noun.toLowerCase() !== 'friends') return noun
    if (!hasCompanionSignal) return ''  // Drop vague "friends" — no companion signal
    if (category === 'moon') return 'moon rabbits in tiny spacesuits'
    if (category === 'ocean') return 'playful dolphins'
    if (category === 'underwater') return 'playful dolphins'
    if (category === 'forest') return 'friendly forest animals'
    if (category === 'savannah') return 'friendly savannah animals'
    if (category === 'space') return 'friendly aliens'
    return 'friendly small creatures'  // fallback
  }).filter(n => n !== '')  // Remove dropped empty strings

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
  // (only if no specific creature was already detected AND companion signal present)
  // Uses category (from categoryForSetting) to avoid "trees"-in-savannah trap.
  if (hasCompanionSignal && /friends?\b/i.test(lowerText) && supportingCharacters.length === 0) {
    if (category === 'moon') {
      supportingCharacters.push({ type: 'rabbit in spacesuit', count: 3, notes: 'small moon rabbits in tiny spacesuits' })
    } else if (category === 'ocean' || category === 'underwater') {
      supportingCharacters.push({ type: 'dolphin', count: 3, notes: 'playful cartoon dolphins' })
    } else if (category === 'forest') {
      supportingCharacters.push({ type: 'forest animal', count: 2, notes: 'friendly woodland creatures' })
    } else if (category === 'savannah') {
      supportingCharacters.push({ type: 'savannah animal', count: 2, notes: 'friendly meerkats and birds' })
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
