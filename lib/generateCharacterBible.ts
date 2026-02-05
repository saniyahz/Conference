import Replicate from 'replicate';

/**
 * Universal Character Bible schema
 * Properly distinguishes between animals and humans
 */
export interface UniversalCharacterBible {
  character_id: string;
  name: string;
  species_or_type: string;
  is_human: boolean;
  age: string;
  visual_fingerprint: string[];
  signature_outfit_or_props: string[];
  personality_tags: string[];
  art_style: {
    medium: string;
    genre: string;
    mood: string;
    line_detail: string;
    color_palette: string;
  };
  consistency_rules: string[];
}

// Human attributes that should NEVER appear in animal character bibles
const FORBIDDEN_HUMAN_ATTRIBUTES = [
  'skin_tone', 'skin tone', 'skintone',
  'hair', 'hairstyle', 'hair_style', 'hair color', 'hair_color',
  'ethnicity', 'race',
  't-shirt', 'tshirt', 'jeans', 'pants', 'shorts', 'dress', 'skirt',
  'sneakers', 'shoes', 'socks', 'shirt', 'blouse',
  'human', 'person', 'child', 'boy', 'girl', 'man', 'woman'
];

/**
 * Sanitize animal bible by removing any human attributes
 * This is a safety net in case the LLM doesn't follow instructions
 */
function sanitizeAnimalBible(bible: UniversalCharacterBible): UniversalCharacterBible {
  console.log('Sanitizing animal bible - removing any human attributes...');

  // Filter visual_fingerprint to remove human attributes
  const sanitizedFingerprint = bible.visual_fingerprint.filter(trait => {
    const lowerTrait = trait.toLowerCase();
    const hasForbidden = FORBIDDEN_HUMAN_ATTRIBUTES.some(attr => lowerTrait.includes(attr));
    if (hasForbidden) {
      console.log(`  REMOVED human attribute from fingerprint: "${trait}"`);
    }
    return !hasForbidden;
  });

  // Filter outfit/props to remove human clothing
  const sanitizedOutfit = bible.signature_outfit_or_props.filter(item => {
    const lowerItem = item.toLowerCase();
    const hasForbidden = FORBIDDEN_HUMAN_ATTRIBUTES.some(attr => lowerItem.includes(attr));
    if (hasForbidden) {
      console.log(`  REMOVED human attribute from outfit: "${item}"`);
    }
    return !hasForbidden;
  });

  // Filter consistency_rules
  const sanitizedRules = bible.consistency_rules.filter(rule => {
    const lowerRule = rule.toLowerCase();
    // Only remove rules that specifically mention forbidden human attributes
    const hasForbidden = ['skin_tone', 'hair', 'ethnicity'].some(attr => lowerRule.includes(attr));
    if (hasForbidden) {
      console.log(`  REMOVED human-specific rule: "${rule}"`);
    }
    return !hasForbidden;
  });

  return {
    ...bible,
    visual_fingerprint: sanitizedFingerprint,
    signature_outfit_or_props: sanitizedOutfit,
    consistency_rules: sanitizedRules
  };
}

const CHARACTER_BIBLE_PROMPT = `You are generating a CHARACTER BIBLE for a children's illustrated storybook app.

Goal: produce a stable "visual fingerprint" that an image model can follow across 10 pages.

CRITICAL RULES
1) First determine if the main character is HUMAN or ANIMAL (or FANTASY_CREATURE).
2) If ANIMAL or FANTASY_CREATURE:
   - DO NOT use human attributes such as: skin_tone, hair_style, hairstyle, ethnicity, human clothing terms like "t-shirt/jeans" unless the story explicitly makes the animal wear clothes.
   - Use animal/fantasy attributes instead: body_color, skin_texture/fur/feathers, horn/beak/ears/tail, markings, eye_color, body_shape, size.
3) If HUMAN:
   - You may use hair, clothing, and face features, but keep it kid-safe and simple.
4) Keep the fingerprint SHORT and repeatable (6–10 traits max).
5) Outfit/props must be STABLE across pages unless story explicitly changes them.
6) Avoid contradictions (e.g., "rhinoceros with hair").
7) Output MUST be valid JSON and conform exactly to the schema below. No extra keys. No commentary.

SCHEMA (output exactly this shape)
{
  "character_id": "string",
  "name": "string",
  "species_or_type": "string",
  "is_human": true|false,
  "age": "string",
  "visual_fingerprint": [
    "short repeatable visual traits (6-10 items)"
  ],
  "signature_outfit_or_props": [
    "stable outfit/prop items (0-3 items)"
  ],
  "personality_tags": ["string","string","string"],
  "art_style": {
    "medium": "string",
    "genre": "string",
    "mood": "string",
    "line_detail": "string",
    "color_palette": "string"
  },
  "consistency_rules": [
    "string",
    "string",
    "string"
  ]
}

GUIDANCE FOR visual_fingerprint
- For ANIMAL: include body color, texture, horn/beak/ears/tail detail, eye color, body proportions, one cute identifying mark.
- For HUMAN: include hair color/style, eye color, outfit color, and one distinctive accessory (e.g., headband).
- Keep each fingerprint line short, like: "light gray rhino with one small rounded horn".

Now generate the Character Bible for the main character in this story:
STORY SUMMARY / DETAILS:`;

/**
 * Generate Character Bible using LLM
 * Uses a dedicated prompt that properly distinguishes animals from humans
 */
export async function generateCharacterBibleWithLLM(
  replicate: Replicate,
  storyTitle: string,
  storyPages: { pageNumber: number; text: string }[],
  originalPrompt: string
): Promise<UniversalCharacterBible> {
  // Build story summary from first few pages
  const storySummary = [
    `Title: ${storyTitle}`,
    `Original prompt: ${originalPrompt}`,
    `First 3 pages:`,
    ...storyPages.slice(0, 3).map(p => `Page ${p.pageNumber}: ${p.text.substring(0, 300)}`)
  ].join('\n');

  const fullPrompt = `${CHARACTER_BIBLE_PROMPT}\n${storySummary}\n\nOutput ONLY the JSON, no explanation:`;

  console.log('\n========== GENERATING CHARACTER BIBLE WITH LLM ==========');
  console.log('Story summary:', storySummary.substring(0, 500));

  try {
    const output = await replicate.run(
      "meta/meta-llama-3.1-70b-instruct",
      {
        input: {
          prompt: fullPrompt,
          temperature: 0.3, // Low temperature for consistent output
          max_tokens: 1500,
          top_p: 0.9,
        }
      }
    ) as string[];

    const responseText = output.join('');
    console.log('LLM Response:', responseText.substring(0, 1000));

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in LLM response');
      throw new Error('Failed to parse Character Bible JSON');
    }

    let bible = JSON.parse(jsonMatch[0]) as UniversalCharacterBible;

    // POST-PROCESSING: Strip human attributes if character is NOT human
    // This is a safety net in case the LLM doesn't follow instructions
    if (!bible.is_human) {
      bible = sanitizeAnimalBible(bible);
    }

    console.log('Parsed Character Bible (sanitized):', JSON.stringify(bible, null, 2));
    console.log('==========================================================\n');

    return bible;
  } catch (error) {
    console.error('Error generating Character Bible with LLM:', error);
    // Return a fallback bible
    return createFallbackBible(storyTitle, storyPages, originalPrompt);
  }
}

/**
 * Extract character name from text - prioritize "called X" or "named X" patterns
 */
function extractCharacterName(originalPrompt: string, firstPageText: string, storyTitle: string): string {
  // Common words to skip (not names)
  const skipWords = new Set([
    'in', 'the', 'a', 'an', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'once', 'upon', 'time', 'there', 'was', 'were', 'one', 'day', 'he', 'she',
    'his', 'her', 'they', 'their', 'it', 'its', 'this', 'that', 'and', 'but',
    'so', 'or', 'if', 'then', 'when', 'where', 'who', 'what', 'how', 'why'
  ]);

  // 1. Try "called X" or "named X" pattern in prompt (highest priority)
  const calledMatch = originalPrompt.match(/(?:called|named)\s+([A-Z][a-z]+)/i);
  if (calledMatch && calledMatch[1].length >= 3) {
    console.log(`[NAME] Found name from "called/named" pattern: ${calledMatch[1]}`);
    return calledMatch[1].charAt(0).toUpperCase() + calledMatch[1].slice(1).toLowerCase();
  }

  // 2. Try extracting from story title (e.g., "Riri's Magical Adventure")
  const titleMatch = storyTitle.match(/^([A-Z][a-z]+)(?:'s|'s)/);
  if (titleMatch && titleMatch[1].length >= 3 && !skipWords.has(titleMatch[1].toLowerCase())) {
    console.log(`[NAME] Found name from title: ${titleMatch[1]}`);
    return titleMatch[1];
  }

  // 3. Try finding a proper noun in the prompt
  const promptWords = originalPrompt.match(/\b([A-Z][a-z]{2,})\b/g) || [];
  for (const word of promptWords) {
    if (!skipWords.has(word.toLowerCase()) && word.length >= 3) {
      console.log(`[NAME] Found name from prompt: ${word}`);
      return word;
    }
  }

  // 4. Try finding a proper noun in first page text (skip common words)
  const pageWords = firstPageText.match(/\b([A-Z][a-z]{2,})\b/g) || [];
  for (const word of pageWords) {
    if (!skipWords.has(word.toLowerCase()) && word.length >= 3) {
      console.log(`[NAME] Found name from page text: ${word}`);
      return word;
    }
  }

  // 5. Default fallback
  console.log('[NAME] Using default name: Hero');
  return 'Hero';
}

/**
 * Create fallback Character Bible when LLM fails
 */
function createFallbackBible(
  storyTitle: string,
  storyPages: { pageNumber: number; text: string }[],
  originalPrompt: string
): UniversalCharacterBible {
  const firstPageText = storyPages[0]?.text || '';
  const lowerText = (firstPageText + ' ' + originalPrompt).toLowerCase();

  // Extract character name properly
  const name = extractCharacterName(originalPrompt, firstPageText, storyTitle);
  console.log(`[FALLBACK BIBLE] Using character name: ${name}`);

  // Detect if it's an animal
  const animalPatterns = [
    { pattern: /rhinoceros|rhino/i, species: 'rhinoceros', traits: ['gray rhinoceros', 'one small rounded horn', 'big friendly eyes', 'sturdy body', 'small rounded ears', 'thick gray skin'] },
    { pattern: /elephant/i, species: 'elephant', traits: ['gray elephant', 'big floppy ears', 'long trunk', 'friendly eyes', 'sturdy legs', 'small tail'] },
    { pattern: /lion/i, species: 'lion', traits: ['golden lion', 'fluffy mane', 'big amber eyes', 'strong paws', 'long tail with tuft'] },
    { pattern: /bear/i, species: 'bear', traits: ['brown bear', 'round fluffy body', 'small round ears', 'big friendly eyes', 'soft fur'] },
    { pattern: /rabbit|bunny/i, species: 'rabbit', traits: ['fluffy rabbit', 'long ears', 'pink nose', 'cotton tail', 'soft white fur'] },
    { pattern: /cat|kitten/i, species: 'cat', traits: ['fluffy cat', 'pointed ears', 'whiskers', 'long tail', 'soft fur'] },
    { pattern: /dog|puppy/i, species: 'dog', traits: ['friendly dog', 'floppy ears', 'wagging tail', 'wet nose', 'soft fur'] },
  ];

  // Find matching animal
  for (const { pattern, species, traits } of animalPatterns) {
    if (pattern.test(lowerText)) {
      return {
        character_id: name.toLowerCase(),
        name,
        species_or_type: species,
        is_human: false,
        age: 'young',
        visual_fingerprint: traits,
        signature_outfit_or_props: [],
        personality_tags: ['curious', 'brave', 'friendly'],
        art_style: {
          medium: '2D cartoon, flat cel shading',
          genre: 'premium children\'s picture book',
          mood: 'warm, gentle, magical',
          line_detail: 'bold clean outlines',
          color_palette: 'vibrant, pastel'
        },
        consistency_rules: [
          `${name} must look identical across all pages.`,
          'Maintain same body color and proportions throughout.',
          'Keep the same art style and mood throughout the book.'
        ]
      };
    }
  }

  // Default to human child (name already extracted above)
  return {
    character_id: name.toLowerCase(),
    name,
    species_or_type: 'human child',
    is_human: true,
    age: '6',
    visual_fingerprint: [
      'cute cartoon child',
      'big expressive eyes',
      'friendly smile',
      'colorful outfit'
    ],
    signature_outfit_or_props: [],
    personality_tags: ['curious', 'brave', 'friendly'],
    art_style: {
      medium: '2D cartoon, flat cel shading',
      genre: 'premium children\'s picture book',
      mood: 'warm, gentle, magical',
      line_detail: 'bold clean outlines',
      color_palette: 'vibrant, pastel'
    },
    consistency_rules: [
      `${name} must look identical across all pages.`,
      'Maintain same outfit and hairstyle throughout.',
      'Keep the same art style and mood throughout the book.'
    ]
  };
}
