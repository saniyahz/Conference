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
 * Generate SceneCard for a single page using LLM
 */
export async function generateSceneCardWithLLM(
  replicate: Replicate,
  pageIndex: number,
  pageText: string,
  characterName: string
): Promise<UniversalSceneCard> {
  const fullPrompt = `${SCENE_CARD_PROMPT}
Page ${pageIndex}: "${pageText}"

Main character name: ${characterName}

Output ONLY the JSON, no explanation:`;

  try {
    const output = await replicate.run(
      "meta/meta-llama-3.1-70b-instruct",
      {
        input: {
          prompt: fullPrompt,
          temperature: 0.2, // Very low for consistent extraction
          max_tokens: 800,
          top_p: 0.9,
        }
      }
    ) as string[];

    const responseText = output.join('');

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`No JSON found in SceneCard response for page ${pageIndex}`);
      throw new Error('Failed to parse SceneCard JSON');
    }

    const card = JSON.parse(jsonMatch[0]) as UniversalSceneCard;
    card.page_index = pageIndex; // Ensure correct page index

    return card;
  } catch (error) {
    console.error(`Error generating SceneCard for page ${pageIndex}:`, error);
    // Return a fallback scene card
    return createFallbackSceneCard(pageIndex, pageText, characterName);
  }
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
    { pattern: /window/i, noun: 'window' },
    { pattern: /door/i, noun: 'doorway' },
  ]

  for (const { pattern, noun } of nounPatterns) {
    if (pattern.test(lowerText) && !nouns.includes(noun)) {
      nouns.push(noun)
    }
  }

  return nouns
}

/**
 * Create fallback SceneCard when LLM fails
 * Extracts real nouns and settings from the page text
 */
function createFallbackSceneCard(
  pageIndex: number,
  pageText: string,
  characterName: string
): UniversalSceneCard {
  const lowerText = pageText.toLowerCase();
  console.log(`[FALLBACK SCENE] Page ${pageIndex}: extracting from "${pageText.substring(0, 80)}..."`)

  // Extract setting — keyword classifier on actual page text
  // PRIORITY ORDER: most distinctive scenes first, generic last
  // Space/rocket/moon BEFORE ocean/water (a rocket scene mentioning water isn't ocean)
  const settingRules: { test: (t: string) => boolean; setting: string; mood: string }[] = [
    // --- SPACE / ROCKET / MOON (highest priority) ---
    { test: t => t.includes('cockpit') || t.includes('control panel') || t.includes('pilot seat') || t.includes('dashboard'), setting: 'Inside a rocket ship cockpit with glowing controls', mood: 'exciting, adventurous' },
    { test: t => (t.includes('rocket') || t.includes('spaceship')) && (t.includes('inside') || t.includes('sat in') || t.includes('buckled')), setting: 'Inside a rocket ship with glowing controls and a window showing sky', mood: 'exciting, adventurous' },
    { test: t => t.includes('moon') && (t.includes('surface') || t.includes('landed') || t.includes('crater')), setting: 'Gray moon surface with craters and Earth in the starry sky', mood: 'wondrous, adventurous' },
    { test: t => t.includes('moon'), setting: 'The moon with craters and starry space background', mood: 'wondrous, magical' },
    { test: t => t.includes('rocket') || t.includes('spaceship') || t.includes('blast off') || t.includes('blasted off') || t.includes('launch'), setting: 'Rocket ship launching into sky with clouds and flames below', mood: 'exciting, adventurous' },
    { test: t => t.includes('space') || (t.includes('stars') && t.includes('galaxy')), setting: 'Outer space with colorful nebulae, stars and planets', mood: 'wondrous, vast' },
    // --- UNDERWATER / OCEAN ---
    { test: t => t.includes('underwater') || t.includes('beneath the water') || t.includes('ocean floor'), setting: 'Underwater scene with colorful coral and tropical fish', mood: 'magical, serene' },
    { test: t => t.includes('dolphin'), setting: 'Ocean surface with dolphins jumping in waves', mood: 'playful, joyful' },
    { test: t => t.includes('ocean') || (t.includes('sea') && t.includes('water')), setting: 'Open ocean with waves and blue sky', mood: 'vast, adventurous' },
    { test: t => t.includes('splash') && (t.includes('water') || t.includes('wave')), setting: 'Ocean surface with splashing water and blue sky', mood: 'exciting, adventurous' },
    { test: t => t.includes('swim') && (t.includes('ocean') || t.includes('sea') || t.includes('water')), setting: 'Open ocean with waves under blue sky', mood: 'adventurous, free' },
    // --- LAND / NATURE ---
    { test: t => t.includes('lion') && (t.includes('savann') || t.includes('forest')), setting: 'Lush forest clearing with golden sunlight through trees', mood: 'adventurous, warm' },
    { test: t => t.includes('forest') || t.includes('woods') || t.includes('jungle'), setting: 'Magical forest with tall green trees and dappled sunlight', mood: 'enchanting, mysterious' },
    { test: t => t.includes('savann') || t.includes('grassland'), setting: 'Golden savannah with tall grass and acacia trees', mood: 'warm, vast' },
    { test: t => t.includes('beach') || t.includes('shore') || t.includes('sand'), setting: 'Sunny tropical beach with golden sand and gentle waves', mood: 'cheerful, relaxing' },
    { test: t => t.includes('meadow') || t.includes('field') || t.includes('grass'), setting: 'Sunny meadow with colorful wildflowers and blue sky', mood: 'peaceful, sunny' },
    { test: t => t.includes('mountain') || t.includes('hill'), setting: 'Rolling green mountains under a bright sky', mood: 'majestic, adventurous' },
    { test: t => t.includes('river') || t.includes('stream'), setting: 'Gentle river flowing through a green landscape', mood: 'peaceful, serene' },
    { test: t => t.includes('cave'), setting: 'Mysterious cave with glowing crystals', mood: 'mysterious, exciting' },
    { test: t => t.includes('home') || t.includes('house') || t.includes('bed'), setting: 'Cozy cottage surrounded by flowers and a garden', mood: 'warm, safe' },
  ]

  let setting = 'A colorful storybook landscape with blue sky';
  let mood = 'warm, magical';

  for (const rule of settingRules) {
    if (rule.test(lowerText)) {
      setting = rule.setting;
      mood = rule.mood;
      console.log(`[FALLBACK SCENE] Page ${pageIndex} matched setting: "${setting}"`)
      break;
    }
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
