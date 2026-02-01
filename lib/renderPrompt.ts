import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * UNIVERSAL PROMPT TEMPLATE
 * Disney/Pixar animated style
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  // 1. SCENE
  const scene = card.setting;

  // 2. MUST SHOW
  const mustShow = buildMustShow(card);

  // 3. CHARACTER - detect from page text if bible doesn't have animal type
  const character = buildCharacterDescription(bible, pageText);

  // 4. STYLE - Disney/Pixar animated style
  const style = "Disney Pixar style, 3D animated, cute expressive characters, vibrant colors, warm lighting.";

  const prompt = `${scene}.${mustShow} ${character} ${style}`;

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt}`);
  return prompt;
}

/**
 * Build character description - also checks page text for animal mentions
 */
function buildCharacterDescription(bible: CharacterBible, pageText?: string): string {
  const name = bible.name;

  // First check if bible says it's an animal
  if (bible.character_type === 'animal' && bible.species) {
    const fur = bible.appearance.skin_tone || 'soft fur';
    const outfit = bible.signature_outfit ? `, wearing ${bible.signature_outfit}` : '';
    return `${name}, a cute cartoon ${bible.species} with ${fur}${outfit}.`;
  }

  // If bible doesn't say animal, check page text for animal words
  if (pageText) {
    const lowerText = pageText.toLowerCase();
    const animals = ['dog', 'puppy', 'cat', 'kitten', 'rabbit', 'bunny', 'bear', 'fox', 'owl', 'bird', 'elephant', 'lion', 'mouse'];

    for (const animal of animals) {
      // Look for patterns like "Name was a dog" or "Name the dog"
      const wasPattern = new RegExp(`${name.toLowerCase()}\\s+(?:was|is)\\s+(?:a|an)\\s+(?:\\w+\\s+)?${animal}`, 'i');
      const thePattern = new RegExp(`${name.toLowerCase()}\\s+the\\s+${animal}`, 'i');

      if (wasPattern.test(lowerText) || thePattern.test(lowerText) || lowerText.includes(`${name.toLowerCase()}, the ${animal}`)) {
        return `${name}, a cute cartoon ${animal} with expressive eyes, friendly face.`;
      }
    }

    // Also check if name is mentioned alongside animal word in same sentence
    for (const animal of animals) {
      if (lowerText.includes(name.toLowerCase()) && lowerText.includes(animal)) {
        // Check if they're in the same sentence
        const sentences = lowerText.split(/[.!?]/);
        for (const sentence of sentences) {
          if (sentence.includes(name.toLowerCase()) && sentence.includes(animal)) {
            return `${name}, a cute cartoon ${animal} with expressive eyes, friendly face.`;
          }
        }
      }
    }
  }

  // Default to human - Disney style (no extreme skin tones)
  return `${name}, a cute cartoon child with warm friendly features, big expressive eyes.`;
}

/**
 * Build "Must show:" clause
 */
function buildMustShow(card: PageSceneCard): string {
  const items = card.key_objects.slice(0, 3);
  if (items.length === 0) return '';
  return ` Must show: ${items.join(', ')}.`;
}

/**
 * Negative prompt - no realistic, add human if animal story
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean): string {
  const base = "text, watermark, logo, photorealistic, realistic, photograph, human, person";

  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    return `${base}, ${card.forbidden_elements.slice(0, 5).join(', ')}`;
  }

  return base;
}

export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
