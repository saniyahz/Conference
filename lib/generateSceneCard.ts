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
 * Generate SceneCards for all pages (batched to reduce API calls)
 */
export async function generateAllSceneCardsWithLLM(
  replicate: Replicate,
  pages: { pageNumber: number; text: string }[],
  characterName: string
): Promise<UniversalSceneCard[]> {
  console.log('\n========== GENERATING SCENE CARDS WITH LLM ==========');

  const sceneCards: UniversalSceneCard[] = [];

  // Process pages in parallel batches of 3 to speed up
  const batchSize = 3;
  for (let i = 0; i < pages.length; i += batchSize) {
    const batch = pages.slice(i, i + batchSize);

    const batchPromises = batch.map(async (page) => {
      console.log(`Generating SceneCard for page ${page.pageNumber}...`);
      const card = await generateSceneCardWithLLM(
        replicate,
        page.pageNumber,
        page.text,
        characterName
      );
      console.log(`Page ${page.pageNumber} setting: ${card.setting.substring(0, 60)}...`);
      return card;
    });

    const batchResults = await Promise.all(batchPromises);
    sceneCards.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < pages.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Sort by page index
  sceneCards.sort((a, b) => a.page_index - b.page_index);

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
    { pattern: /alien/i, noun: 'friendly aliens' },
    { pattern: /cockpit|control\s*panel/i, noun: 'glowing control panel' },
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

  // Extract location nouns from the actual page text (ordered by specificity)
  // Returns SHORT nouns, not full descriptive sentences
  const locationPatterns: { pattern: RegExp; noun: string; mood: string }[] = [
    { pattern: /cockpit|control\s*panel|pilot\s*seat|dashboard/, noun: 'inside rocket cockpit', mood: 'exciting' },
    { pattern: /(rocket|spaceship).*(inside|sat in|buckled)|(inside|sat in|buckled).*(rocket|spaceship)/, noun: 'inside rocket ship', mood: 'exciting' },
    { pattern: /moon.*(surface|landed|crater)|(surface|landed|crater).*moon/, noun: 'moon surface with craters', mood: 'wondrous' },
    { pattern: /moon/, noun: 'moon', mood: 'wondrous' },
    { pattern: /rocket|spaceship|blast\s*off|launch/, noun: 'rocket launching into sky', mood: 'exciting' },
    { pattern: /space|galaxy|nebula/, noun: 'outer space', mood: 'wondrous' },
    { pattern: /underwater|beneath\s*the\s*water|ocean\s*floor/, noun: 'underwater', mood: 'magical' },
    { pattern: /dolphin/, noun: 'ocean surface with dolphins', mood: 'playful' },
    { pattern: /ocean|sea\b/, noun: 'ocean', mood: 'adventurous' },
    { pattern: /forest|woods|jungle/, noun: 'forest', mood: 'enchanting' },
    { pattern: /savann|grassland/, noun: 'savannah', mood: 'warm' },
    { pattern: /beach|shore/, noun: 'beach', mood: 'cheerful' },
    { pattern: /mountain|hill/, noun: 'mountains', mood: 'majestic' },
    { pattern: /river|stream/, noun: 'river', mood: 'peaceful' },
    { pattern: /cave/, noun: 'cave', mood: 'mysterious' },
    { pattern: /desert/, noun: 'desert', mood: 'vast' },
    { pattern: /meadow|field/, noun: 'meadow', mood: 'peaceful' },
    { pattern: /home|house|bed/, noun: 'cozy home', mood: 'warm' },
  ]

  const foundNouns: string[] = []
  let mood = 'magical'
  for (const { pattern, noun, mood: m } of locationPatterns) {
    if (pattern.test(lowerText) && foundNouns.length < 2) {
      foundNouns.push(noun)
      if (foundNouns.length === 1) mood = m  // Use mood of primary location
    }
  }

  // Build setting from extracted nouns — short and direct, no verbose templates
  let setting: string
  if (foundNouns.length >= 2) {
    setting = `${foundNouns[0]} near ${foundNouns[1]}`
  } else if (foundNouns.length === 1) {
    setting = foundNouns[0]
  } else {
    // No location nouns found — generic fallback
    setting = 'colorful outdoor landscape'
  }

  console.log(`[FALLBACK SCENE] Page ${pageIndex} extracted setting: "${setting}" from nouns: [${foundNouns.join(', ')}]`)

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

  // Extract concrete nouns from text
  const extractedNouns = extractNounsFromText(pageText)
  const mustInclude = [`${characterName} full body`, ...extractedNouns]

  // Ensure at least 4 items by adding setting-derived elements
  if (mustInclude.length < 4) {
    const settingWords = setting.split(' ').filter(w => w.length > 3).slice(0, 3).join(' ')
    mustInclude.push(settingWords)
  }
  while (mustInclude.length < 4) {
    mustInclude.push('vibrant colors')
  }

  // Extract supporting characters more thoroughly
  const supportingCharacters: { type: string; count: number; notes: string }[] = [];
  const charPatterns: { pattern: RegExp; type: string; count: number; notes: string }[] = [
    { pattern: /alien/i, type: 'friendly alien', count: 2, notes: 'small colorful aliens' },
    { pattern: /dolphins?/i, type: 'dolphin', count: 3, notes: 'playful cartoon dolphins' },
    { pattern: /lions?/i, type: 'lion', count: 2, notes: 'friendly cartoon lions' },
    { pattern: /friends?\b/i, type: 'small creatures', count: 3, notes: 'friendly small creatures' },
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

  console.log(`[FALLBACK SCENE] Page ${pageIndex} → setting: "${setting}", nouns: [${extractedNouns.join(', ')}]`)

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
