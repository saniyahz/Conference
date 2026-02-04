import Replicate from 'replicate';
import { UniversalCharacterBible } from './generateCharacterBible';

/**
 * Character Anchor system for guaranteed character consistency
 *
 * 1. Generate a Character Anchor image (plain background, full body, neutral pose)
 * 2. Use it as reference for all page images via img2img
 * 3. Same seed + same reference = consistent character
 */

export interface CharacterAnchor {
  imageUrl: string;
  seed: number;
  prompt: string;
  species: string;
  name: string;
}

/**
 * Generate a Character Anchor image
 * Plain background, full body, neutral pose - the "canonical" look
 */
export async function generateCharacterAnchor(
  replicate: Replicate,
  bible: UniversalCharacterBible,
  seed: number
): Promise<CharacterAnchor> {
  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;

  // Build anchor prompt - plain background, full body, neutral pose
  let prompt: string;

  if (isAnimal) {
    // Animal anchor prompt - repeat species heavily, plain background
    const fingerprint = bible.visual_fingerprint.slice(0, 6).join(', ');
    prompt = `${species} ${species} ${species}, full body character sheet, ${fingerprint}, ${name} the ${species}, standing pose, facing camera, plain white background, studio lighting, character reference sheet, Pixar Disney 3D animation style, soft lighting, vibrant colors, children's book illustration, centered composition, full body visible, no background elements`;
  } else {
    // Human anchor prompt
    const fingerprint = bible.visual_fingerprint.slice(0, 6).join(', ');
    prompt = `cute cartoon child, full body character sheet, ${fingerprint}, ${name}, standing pose, facing camera, plain white background, studio lighting, character reference sheet, Pixar Disney 3D animation style, soft lighting, vibrant colors, children's book illustration, centered composition, full body visible`;
  }

  // Negative prompt for anchor - plain background, no scene elements
  const negativePrompt = buildAnchorNegativePrompt(isAnimal, species);

  console.log('\n========== GENERATING CHARACTER ANCHOR ==========');
  console.log(`Species: ${species}`);
  console.log(`Name: ${name}`);
  console.log(`Seed: ${seed}`);
  console.log(`Prompt: ${prompt.substring(0, 200)}...`);
  console.log(`Negative: ${negativePrompt.substring(0, 100)}...`);

  try {
    const output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          prompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 1024,
          num_outputs: 1,
          scheduler: "K_EULER",
          num_inference_steps: 30,  // Higher quality for anchor
          guidance_scale: 9,        // Strong prompt following
          seed,
        }
      }
    );

    // Extract URL from output
    let imageUrl = '';
    if (Array.isArray(output) && output.length > 0) {
      const firstOutput = output[0];
      if (typeof firstOutput === 'string') {
        imageUrl = firstOutput;
      }
    } else if (typeof output === 'string') {
      imageUrl = output;
    }

    if (!imageUrl || !imageUrl.startsWith('http')) {
      throw new Error('Failed to generate character anchor image');
    }

    console.log(`Character Anchor generated: ${imageUrl}`);
    console.log('==================================================\n');

    return {
      imageUrl,
      seed,
      prompt,
      species,
      name
    };
  } catch (error) {
    console.error('Error generating character anchor:', error);
    throw error;
  }
}

/**
 * Generate page image using Character Anchor as reference (img2img)
 * This locks the character identity across pages
 */
export async function generatePageWithAnchor(
  replicate: Replicate,
  anchor: CharacterAnchor,
  pagePrompt: string,
  negativePrompt: string,
  pageIndex: number,
  strength: number = 0.35  // Low strength = more identity lock (0.25-0.45 recommended)
): Promise<string> {
  console.log(`\n--- Generating Page ${pageIndex} with Anchor Reference ---`);
  console.log(`Strength: ${strength} (lower = more identity lock)`);
  console.log(`Prompt: ${pagePrompt.substring(0, 150)}...`);

  try {
    // Use SDXL img2img with anchor as init_image
    const output = await replicate.run(
      "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
      {
        input: {
          prompt: pagePrompt,
          negative_prompt: negativePrompt,
          image: anchor.imageUrl,  // Reference image
          prompt_strength: strength,  // How much to change from reference (lower = more identity lock)
          width: 1024,
          height: 1024,
          num_outputs: 1,
          scheduler: "K_EULER",
          num_inference_steps: 25,
          guidance_scale: 8,
          seed: anchor.seed,  // Same seed as anchor
        }
      }
    );

    // Extract URL from output
    let imageUrl = '';
    if (Array.isArray(output) && output.length > 0) {
      const firstOutput = output[0];
      if (typeof firstOutput === 'string') {
        imageUrl = firstOutput;
      }
    } else if (typeof output === 'string') {
      imageUrl = output;
    }

    if (!imageUrl || !imageUrl.startsWith('http')) {
      console.log('img2img failed, falling back to txt2img');
      return '';
    }

    console.log(`Page ${pageIndex} generated with anchor reference: ${imageUrl.substring(0, 50)}...`);
    return imageUrl;
  } catch (error) {
    console.error(`Error generating page ${pageIndex} with anchor:`, error);
    return '';
  }
}

/**
 * Build negative prompt for Character Anchor
 * No scene elements, plain background
 */
function buildAnchorNegativePrompt(isAnimal: boolean, species: string): string {
  const negatives = [
    'text', 'watermark', 'logo', 'signature',
    'photorealistic', 'realistic', 'photograph',
    'ugly', 'deformed', 'bad anatomy', 'bad proportions',
    'background elements', 'scenery', 'landscape',
    'outdoor', 'indoor', 'room', 'forest', 'sky',
    'multiple characters', 'crowd', 'group'
  ];

  // Block humans for animal characters
  if (isAnimal) {
    negatives.push('human', 'person', 'boy', 'girl', 'child', 'man', 'woman');

    // Species-specific negatives
    const speciesNegatives = getSpeciesNegatives(species);
    negatives.push(...speciesNegatives);
  }

  return negatives.join(', ');
}

/**
 * Species-specific negatives to prevent drift
 */
function getSpeciesNegatives(species: string): string[] {
  const lowerSpecies = species.toLowerCase();

  const speciesMap: Record<string, string[]> = {
    'rhinoceros': ['cow', 'bull', 'ox', 'hippo', 'hippopotamus', 'elephant', 'unicorn', 'horse', 'pig', 'boar'],
    'rhino': ['cow', 'bull', 'ox', 'hippo', 'hippopotamus', 'elephant', 'unicorn', 'horse', 'pig', 'boar'],
    'elephant': ['hippo', 'rhino', 'mammoth', 'cow'],
    'lion': ['tiger', 'cat', 'dog', 'wolf', 'bear'],
    'tiger': ['lion', 'cat', 'dog', 'leopard', 'cheetah'],
    'bear': ['dog', 'wolf', 'lion', 'gorilla'],
    'rabbit': ['cat', 'dog', 'mouse', 'hamster'],
    'cat': ['dog', 'rabbit', 'fox', 'wolf'],
    'dog': ['cat', 'wolf', 'fox', 'bear'],
  };

  return speciesMap[lowerSpecies] || [];
}

/**
 * Build page prompt that references the anchor character
 * Includes "same character as reference" phrasing
 */
export function buildPagePromptWithAnchor(
  anchor: CharacterAnchor,
  bible: UniversalCharacterBible,
  setting: string,
  action: string,
  mustInclude: string[],
  supportingCharacters: { type: string; count: number }[]
): string {
  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;

  let characterDesc: string;
  if (isAnimal) {
    // Reference the anchor character explicitly
    const fingerprint = bible.visual_fingerprint.slice(0, 4).join(', ');
    characterDesc = `${species} ${species}, same ${species} as reference, ${fingerprint}, ${name} the ${species}`;
  } else {
    const fingerprint = bible.visual_fingerprint.slice(0, 4).join(', ');
    characterDesc = `same child as reference, ${fingerprint}, ${name}`;
  }

  // Build supporting characters string
  const supportingDesc = supportingCharacters.length > 0
    ? `with ${supportingCharacters.map(c => `${c.count} ${c.type}`).join(' and ')}`
    : '';

  // Build must-include string
  const mustIncludeDesc = mustInclude.length > 0
    ? `showing ${mustInclude.slice(0, 4).join(', ')}`
    : '';

  const prompt = [
    characterDesc,
    action,
    setting,
    mustIncludeDesc,
    supportingDesc,
    'Pixar Disney 3D animation style, soft lighting, vibrant colors, children\'s book illustration'
  ].filter(Boolean).join(', ');

  return prompt;
}
