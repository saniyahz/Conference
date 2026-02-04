import Replicate from 'replicate';
import { UniversalCharacterBible } from './generateCharacterBible';

/**
 * Character Anchor system for guaranteed character consistency
 *
 * 1. Generate a Character Anchor image (plain background, full body, neutral pose)
 * 2. Use it as reference for all page images via img2img
 * 3. Same seed + same reference = consistent character
 */

/**
 * Robust URL extraction from Replicate output
 * Handles multiple output formats: string[], string, {url}, ReadableStream, etc.
 */
function extractImageUrl(output: unknown): string | null {
  console.log('[extractImageUrl] typeof output:', typeof output);
  console.log('[extractImageUrl] Array.isArray:', Array.isArray(output));

  // Case 1: Array of strings (most common)
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    console.log('[extractImageUrl] first element type:', typeof first);

    if (typeof first === 'string' && first.startsWith('http')) {
      return first;
    }

    // Case 2: Array of objects with url property
    if (first && typeof first === 'object' && 'url' in first) {
      const url = (first as { url: string }).url;
      if (typeof url === 'string' && url.startsWith('http')) {
        return url;
      }
    }
  }

  // Case 3: Direct string URL
  if (typeof output === 'string' && output.startsWith('http')) {
    return output;
  }

  // Case 4: Object with url property
  if (output && typeof output === 'object' && 'url' in output) {
    const url = (output as { url: string }).url;
    if (typeof url === 'string' && url.startsWith('http')) {
      return url;
    }
  }

  // Case 5: Try to find any URL in stringified output
  try {
    const str = JSON.stringify(output);
    console.log('[extractImageUrl] stringified (first 500 chars):', str.substring(0, 500));
    const urlMatch = str.match(/https?:\/\/[^\s"'\\]+/);
    if (urlMatch) {
      return urlMatch[0];
    }
  } catch (e) {
    console.log('[extractImageUrl] could not stringify output');
  }

  return null;
}

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
    console.log('[ANCHOR] Calling replicate.run...');
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

    // DIAGNOSTIC: Log raw output
    console.log('[ANCHOR] raw output type:', typeof output);
    console.log('[ANCHOR] raw output isArray:', Array.isArray(output));
    try {
      console.log('[ANCHOR] raw output:', JSON.stringify(output).substring(0, 1000));
    } catch (e) {
      console.log('[ANCHOR] raw output (not serializable):', output);
    }

    // Use robust URL extraction
    const imageUrl = extractImageUrl(output);

    if (!imageUrl) {
      console.error('[ANCHOR] Failed to extract URL from output');
      throw new Error('Failed to generate character anchor image - no URL in output');
    }

    console.log(`[ANCHOR] Character Anchor generated: ${imageUrl}`);
    console.log('==================================================\n');

    return {
      imageUrl,
      seed,
      prompt,
      species,
      name
    };
  } catch (error) {
    console.error('[ANCHOR] Error generating character anchor:', error);
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

    // Use robust URL extraction
    const imageUrl = extractImageUrl(output);

    if (!imageUrl) {
      console.log(`[PAGE ${pageIndex}] img2img failed - no URL extracted`);
      return '';
    }

    console.log(`[PAGE ${pageIndex}] generated with anchor reference: ${imageUrl.substring(0, 80)}...`);
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
  // Keep negative prompt simple - overly long negatives can confuse SDXL
  const negatives = [
    'text', 'watermark', 'logo', 'signature',
    'photorealistic', 'photograph',
    'background elements', 'scenery', 'landscape',
    'forest', 'sky', 'grass', 'trees',
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
