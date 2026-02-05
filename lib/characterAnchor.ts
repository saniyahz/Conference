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
 * Handles multiple output formats including FileOutput objects from newer SDK versions
 */
function extractImageUrl(output: unknown): string | null {
  console.log('[extractImageUrl] typeof output:', typeof output);
  console.log('[extractImageUrl] Array.isArray:', Array.isArray(output));

  // Case 1: Array (most common - SDXL returns array)
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    console.log('[extractImageUrl] first element type:', typeof first);

    // Case 1a: Array of strings
    if (typeof first === 'string' && first.startsWith('http')) {
      return first;
    }

    // Case 1b: Array of FileOutput objects (newer Replicate SDK)
    // FileOutput objects have toString() that returns the URL
    if (first && typeof first === 'object') {
      // Try String() conversion - this works for FileOutput objects
      try {
        const urlFromString = String(first);
        console.log('[extractImageUrl] String(first):', urlFromString.substring(0, 100));
        if (urlFromString.startsWith('http')) {
          return urlFromString;
        }
      } catch (e) {
        console.log('[extractImageUrl] String() conversion failed');
      }

      // Try .url() method if it exists
      if ('url' in first && typeof (first as any).url === 'function') {
        try {
          const urlFromMethod = (first as any).url();
          console.log('[extractImageUrl] .url() method:', urlFromMethod);
          if (typeof urlFromMethod === 'string' && urlFromMethod.startsWith('http')) {
            return urlFromMethod;
          }
        } catch (e) {
          console.log('[extractImageUrl] .url() method failed');
        }
      }

      // Try .url property
      if ('url' in first) {
        const url = (first as { url: string }).url;
        if (typeof url === 'string' && url.startsWith('http')) {
          return url;
        }
      }

      // Try .href property (some URL-like objects)
      if ('href' in first) {
        const href = (first as { href: string }).href;
        if (typeof href === 'string' && href.startsWith('http')) {
          return href;
        }
      }
    }
  }

  // Case 2: Direct string URL
  if (typeof output === 'string' && output.startsWith('http')) {
    return output;
  }

  // Case 3: Single FileOutput object (not in array)
  if (output && typeof output === 'object') {
    // Try String() conversion
    try {
      const urlFromString = String(output);
      if (urlFromString.startsWith('http')) {
        return urlFromString;
      }
    } catch (e) {
      // Ignore
    }

    // Try .url property
    if ('url' in output) {
      const url = (output as { url: string }).url;
      if (typeof url === 'string' && url.startsWith('http')) {
        return url;
      }
    }
  }

  // Case 4: Try to find any URL in stringified output (last resort)
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

  console.log('[extractImageUrl] FAILED to extract URL from output');
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
    // Animal anchor prompt - 2D cartoon style, plain background
    const fingerprint = bible.visual_fingerprint.slice(0, 6).join(', ');
    prompt = `Full body character reference sheet of ${name} the ${species}. ${species} ${species} ${species}, ${fingerprint}. Cute 2D cartoon style, bold outlines, simple shapes, big friendly eyes, flat cel shading, vibrant pastel colors. Plain light background, centered, full body visible, no scenery, no text`;
  } else {
    // Human anchor prompt - 2D cartoon style
    const fingerprint = bible.visual_fingerprint.slice(0, 6).join(', ');
    prompt = `Full body character reference sheet of ${name}. cute cartoon child, ${fingerprint}. Cute 2D cartoon style, bold outlines, simple shapes, big friendly eyes, flat cel shading, vibrant pastel colors. Plain light background, centered, full body visible, no scenery, no text`;
  }

  // Negative prompt for anchor - plain background, no scene elements
  const negativePrompt = buildAnchorNegativePrompt(isAnimal, species);

  console.log('\n========== GENERATING CHARACTER ANCHOR ==========');
  console.log(`Species: ${species}`);
  console.log(`Name: ${name}`);
  console.log(`Seed: ${seed}`);
  console.log(`Prompt: ${prompt.substring(0, 200)}...`);
  console.log(`Negative: ${negativePrompt.substring(0, 100)}...`);

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ANCHOR] Creating prediction... (attempt ${attempt}/${maxRetries})`);

      // Use predictions API directly for better visibility
      const prediction = await replicate.predictions.create({
        version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: {
          prompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 1024,
          num_outputs: 1,
          scheduler: "K_EULER",
          num_inference_steps: 30,
          guidance_scale: 9,
          seed,
        }
      });

      console.log('[ANCHOR] Prediction created:', prediction.id);
      console.log('[ANCHOR] Initial status:', prediction.status);

      // Poll for completion
      let completedPrediction = prediction;
      let pollCount = 0;
      const maxPolls = 60; // 60 * 2s = 2 minutes max

      while (completedPrediction.status !== 'succeeded' && completedPrediction.status !== 'failed' && completedPrediction.status !== 'canceled') {
        pollCount++;
        if (pollCount > maxPolls) {
          throw new Error('Prediction timed out after 2 minutes');
        }
        console.log(`[ANCHOR] Polling... (${pollCount}/${maxPolls}) status: ${completedPrediction.status}`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second poll interval
        completedPrediction = await replicate.predictions.get(prediction.id);
      }

      console.log('[ANCHOR] Final status:', completedPrediction.status);
      console.log('[ANCHOR] Prediction error:', completedPrediction.error);
      console.log('[ANCHOR] Prediction logs:', completedPrediction.logs?.substring(0, 500));

      if (completedPrediction.status === 'failed') {
        throw new Error(`Prediction failed: ${completedPrediction.error || 'Unknown error'}`);
      }

      if (completedPrediction.status === 'canceled') {
        throw new Error('Prediction was canceled');
      }

      const output = completedPrediction.output;

      // DIAGNOSTIC: Log raw output with full detail
      console.log('[ANCHOR] raw output type:', typeof output);
      console.log('[ANCHOR] raw output isArray:', Array.isArray(output));
      console.log('[ANCHOR] raw output:', JSON.stringify(output).substring(0, 1000));

      // Log more details about the output
      if (Array.isArray(output) && output.length > 0) {
        const first = output[0];
        console.log('[ANCHOR] first element type:', typeof first);
        console.log('[ANCHOR] first element value:', String(first).substring(0, 200));
      }

      // Use robust URL extraction
      const imageUrl = extractImageUrl(output);

      if (!imageUrl) {
        console.error(`[ANCHOR] Failed to extract URL from output (attempt ${attempt})`);
        if (attempt < maxRetries) {
          console.log(`[ANCHOR] Retrying in ${attempt * 3} seconds...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 3000));
          continue;
        }
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
      console.error(`[ANCHOR] Error on attempt ${attempt}:`, error);
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.log(`[ANCHOR] Retrying in ${attempt * 3} seconds...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 3000));
      }
    }
  }

  // All retries exhausted
  console.error('[ANCHOR] All retries exhausted for character anchor generation');
  throw lastError || new Error('Failed to generate character anchor image after all retries');
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
  // Block 3D/photorealistic + scene elements for clean 2D anchor
  const negatives = [
    'photorealistic', 'realistic', 'lifelike', 'hyperreal',
    '3D render', 'CGI', 'Pixar', 'Disney 3D', 'cinematic lighting',
    'ultra-detailed texture', 'DSLR', 'film still',
    'text', 'watermark', 'logo',
    'background elements', 'scenery', 'landscape',
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
    'cute 2D cartoon children\'s illustration, bold clean outlines, simplified shapes, big expressive eyes, flat cel shading, vibrant pastel colors, no text'
  ].filter(Boolean).join(', ');

  return prompt;
}
