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
 * Create fallback SceneCard when LLM fails
 */
function createFallbackSceneCard(
  pageIndex: number,
  pageText: string,
  characterName: string
): UniversalSceneCard {
  const lowerText = pageText.toLowerCase();

  // Extract setting from common keywords
  let setting = 'A colorful storybook scene';
  let mood = 'magical, warm';

  if (lowerText.includes('meadow') || lowerText.includes('field')) {
    setting = 'A sunny meadow with colorful wildflowers';
    mood = 'peaceful, sunny';
  } else if (lowerText.includes('forest') || lowerText.includes('trees')) {
    setting = 'A magical forest with tall trees';
    mood = 'mysterious, enchanting';
  } else if (lowerText.includes('moon') || lowerText.includes('lunar')) {
    setting = 'The gray moon surface with craters and Earth visible in sky';
    mood = 'wondrous, adventurous';
  } else if (lowerText.includes('rocket') || lowerText.includes('spaceship')) {
    setting = 'Inside a colorful rocket ship cockpit with glowing controls';
    mood = 'exciting, adventurous';
  } else if (lowerText.includes('space') || lowerText.includes('stars')) {
    setting = 'Outer space with colorful stars and planets';
    mood = 'wondrous, vast';
  } else if (lowerText.includes('ocean') || lowerText.includes('underwater') || lowerText.includes('sea')) {
    setting = 'Underwater ocean scene with colorful coral and fish';
    mood = 'magical, serene';
  } else if (lowerText.includes('beach') || lowerText.includes('shore')) {
    setting = 'A sunny beach with sand and gentle waves';
    mood = 'cheerful, relaxing';
  }

  // Extract action from text
  let action = `${characterName} explores with curiosity`;
  if (lowerText.includes('flew') || lowerText.includes('soar') || lowerText.includes('flying')) {
    action = `${characterName} flies through the air`;
  } else if (lowerText.includes('run') || lowerText.includes('ran')) {
    action = `${characterName} runs with excitement`;
  } else if (lowerText.includes('smile') || lowerText.includes('laugh')) {
    action = `${characterName} smiles happily`;
  } else if (lowerText.includes('look') || lowerText.includes('saw')) {
    action = `${characterName} looks around with wonder`;
  }

  // Build must_include
  const mustInclude = [`${characterName} full body`];

  // Add setting elements
  if (lowerText.includes('rocket')) mustInclude.push('rocket ship');
  if (lowerText.includes('moon')) mustInclude.push('moon surface', 'craters');
  if (lowerText.includes('stars')) mustInclude.push('twinkling stars');
  if (lowerText.includes('flower')) mustInclude.push('colorful flowers');
  if (lowerText.includes('tree')) mustInclude.push('trees');

  // Ensure at least 4 items
  while (mustInclude.length < 4) {
    mustInclude.push(setting.split(' ').slice(0, 3).join(' '));
  }

  // Extract supporting characters
  const supportingCharacters: { type: string; count: number; notes: string }[] = [];
  if (lowerText.includes('alien')) {
    supportingCharacters.push({ type: 'friendly alien', count: 2, notes: 'small jellybean-shaped' });
  }
  if (lowerText.includes('dolphin')) {
    supportingCharacters.push({ type: 'dolphin', count: 1, notes: 'friendly cartoon dolphin' });
  }
  if (lowerText.includes('lion')) {
    supportingCharacters.push({ type: 'lion', count: 2, notes: 'friendly cartoon lions' });
  }

  return {
    page_index: pageIndex,
    setting,
    action,
    must_include: mustInclude.slice(0, 6),
    supporting_characters: supportingCharacters,
    camera: supportingCharacters.length > 0 ? 'wide' : 'medium',
    mood
  };
}
