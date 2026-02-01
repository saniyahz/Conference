import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * UNIVERSAL PROMPT TEMPLATE
 *
 * Format (under 50 words):
 * [SCENE]. [CHARACTER]. [STYLE].
 *
 * No hardcoded keywords - just uses what's in the Bible and Scene Card.
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard): string {
  // 1. SCENE - directly from the scene card setting
  const scene = card.setting;

  // 2. MUST SHOW - key objects/characters that must appear
  const mustShow = buildMustShow(card);

  // 3. CHARACTER - built from the Bible (works for human, animal, creature, anything)
  const character = buildCharacterDescription(bible);

  // 4. STYLE
  const style = "Soft watercolor children's book illustration.";

  // Combine
  const prompt = `${scene}.${mustShow} ${character} ${style}`;

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt}`);
  return prompt;
}

/**
 * Build character description from Bible - GENERIC for any character type
 */
function buildCharacterDescription(bible: CharacterBible): string {
  const name = bible.name;
  const type = bible.character_type;

  // For animals: "Smiley, a friendly dog with golden fur"
  if (type === 'animal' && bible.species) {
    const fur = bible.appearance.skin_tone;
    const outfit = bible.signature_outfit ? `, wearing ${bible.signature_outfit}` : '';
    return `${name}, a friendly ${bible.species} with ${fur}${outfit}.`;
  }

  // For creatures: "Sparkle, a magical unicorn"
  if (type === 'creature') {
    return `${name}, a magical ${bible.species || 'creature'}.`;
  }

  // For humans: "Ava, a 6 year old child with brown skin, curly hair"
  const skin = bible.appearance.skin_tone;
  const hair = bible.appearance.hair;
  return `${name}, a young child with ${skin}, ${hair}.`;
}

/**
 * Build "Must show:" clause from key objects
 */
function buildMustShow(card: PageSceneCard): string {
  const items = card.key_objects.slice(0, 3);

  if (items.length === 0) {
    return '';
  }

  return ` Must show: ${items.join(', ')}.`;
}

/**
 * Render negative prompt
 */
export function renderNegativePrompt(card: PageSceneCard): string {
  const base = "text, watermark, logo, frame, photorealistic, 3d render, anime, ugly, deformed";

  // Add forbidden elements from the scene card
  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    return `${base}, ${card.forbidden_elements.slice(0, 5).join(', ')}`;
  }

  return base;
}

/**
 * Generate unique seed for a page
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
