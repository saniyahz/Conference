import Replicate from 'replicate';
import { UniversalCharacterBible } from './generateCharacterBible';
import { cleanMustInclude } from './buildImagePrompt';

/**
 * Character Anchor system for guaranteed character consistency
 *
 * 1. Generate a Character Anchor image (plain background, full body, neutral pose)
 * 2. Use it as reference for all page images via img2img
 * 3. Same seed + same reference = consistent character
 *
 * CACHING: Anchors are cached in-memory by character identity + seed.
 * On cache hit, the 30-step SDXL txt2img call is skipped entirely.
 * Images are stored as base64 data URIs so they survive Replicate CDN
 * URL expiration. Replicate's img2img accepts data URIs as input.
 */

// Module-level anchor cache — persists across requests in the same Next.js process.
// Key: "name:species:fingerprint_hash:seed" → Value: CharacterAnchor (with base64 imageUrl)
const anchorCache = new Map<string, CharacterAnchor>()

function anchorCacheKey(bible: UniversalCharacterBible, seed: number): string {
  const fingerprint = bible.visual_fingerprint.slice(0, 4).sort().join('|')
  return `${bible.name}:${bible.species_or_type}:${fingerprint}:${seed}`
}

async function downloadAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    const sizeKB = Math.round(buffer.length / 1024)
    console.log(`[ANCHOR CACHE] Downloaded anchor: ${sizeKB}KB`)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch (err: any) {
    console.warn(`[ANCHOR CACHE] Download failed: ${err.message} — using raw URL`)
    return url
  }
}

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
 * Returns cached anchor if same character+seed was generated before.
 */
export async function generateCharacterAnchor(
  replicate: Replicate,
  bible: UniversalCharacterBible,
  seed: number
): Promise<CharacterAnchor> {
  // CACHE CHECK: skip 30-step generation if we already have this anchor
  const cacheKey = anchorCacheKey(bible, seed)
  const cached = anchorCache.get(cacheKey)
  if (cached) {
    console.log(`\n========== ANCHOR CACHE HIT ==========`)
    console.log(`Key: ${cacheKey}`)
    console.log(`Image: ${cached.imageUrl.substring(0, 60)}...`)
    console.log(`Skipping 30-step SDXL generation — reusing cached anchor`)
    console.log(`========================================\n`)
    return cached
  }
  console.log(`[ANCHOR CACHE] Miss for key: ${cacheKey} — generating fresh anchor`)

  const species = bible.species_or_type;
  const name = bible.name;
  const isAnimal = !bible.is_human;

  // Build anchor prompt — single character portrait, NOT a reference sheet
  // 3/4 view, plain background, one drawing only
  let prompt: string;

  if (isAnimal) {
    const traits = bible.visual_fingerprint.slice(0, 4).join(', ');
    prompt = `Single character only: ${name} the ${species}, full body, facing 3/4 view, ${traits}. Cute 2D cartoon, bold outlines, flat cel shading, vibrant pastel colors. Plain light background. NO pose sheet. NO multiple drawings. NO character turnaround. NO text.`;
  } else {
    const traits = bible.visual_fingerprint.slice(0, 4).join(', ');
    prompt = `Single character only: ${name}, cute cartoon child, full body, facing 3/4 view, ${traits}. Cute 2D cartoon, bold outlines, flat cel shading, vibrant pastel colors. Plain light background. NO pose sheet. NO multiple drawings. NO character turnaround. NO text.`;
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

      // Download as base64 for cache — survives Replicate CDN URL expiration
      const base64Url = await downloadAsBase64(imageUrl);
      const anchor: CharacterAnchor = {
        imageUrl: base64Url,
        seed,
        prompt,
        species,
        name
      };

      // Cache for future requests with same character + seed
      anchorCache.set(cacheKey, anchor);
      console.log(`[ANCHOR CACHE] Stored anchor (key: ${cacheKey})`);
      console.log('==================================================\n');

      return anchor;
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
 * Build negative prompt for Character Anchor
 * Blocks reference sheet layout + 3D + scenery
 */
function buildAnchorNegativePrompt(isAnimal: boolean, species: string): string {
  const neg = [
    // Block reference sheet / multi-pose layout
    'character sheet', 'reference sheet', 'turnaround', 'multiple poses',
    'collage', 'grid', 'lineup', 'diagram', 'model sheet',
    // Block 3D / photorealistic
    'photorealistic', '3D render', 'CGI', 'Pixar', 'DSLR',
    // Block scenery and extras
    'text', 'watermark', 'scenery', 'landscape', 'multiple characters',
  ];

  if (isAnimal) {
    neg.push('human', 'person', 'child');
    const confused = getSpeciesNegatives(species);
    neg.push(...confused);
  }

  return neg.join(', ');
}

/**
 * Species-specific negatives — top confusable animals
 */
function getSpeciesNegatives(species: string): string[] {
  const s = species.toLowerCase();
  const map: Record<string, string[]> = {
    'rhinoceros': ['cow', 'hippo', 'elephant', 'horse'],
    'rhino': ['cow', 'hippo', 'elephant', 'horse'],
    'elephant': ['hippo', 'rhino', 'cow'],
    'lion': ['tiger', 'cat', 'dog'],
    'tiger': ['lion', 'cat', 'leopard'],
    'bear': ['dog', 'wolf', 'gorilla'],
    'rabbit': ['cat', 'mouse', 'hamster'],
    'cat': ['dog', 'rabbit', 'fox'],
    'dog': ['cat', 'wolf', 'fox'],
  };
  return map[s] || [];
}

/**
 * Build page prompt that references the anchor character
 * COMPACT — must fit CLIP ~77 token window
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

  // Character ID — compact, front-loaded
  const traits = bible.visual_fingerprint.slice(0, 3).join(', ');
  const charId = isAnimal
    ? `${name} the ${species}, same ${species} as reference, ${traits}`
    : `${name}, same child as reference, ${traits}`;

  // Supporting characters
  const hasSupporting = supportingCharacters.length > 0;
  const supportingList = hasSupporting
    ? supportingCharacters.map(c => `${c.count} ${c.type}`).join(', ')
    : '';

  // Must-include — clean contradictions, then limit to 3-4
  const cleanedMusts = cleanMustInclude(setting, mustInclude);
  const musts = cleanedMusts.slice(0, 4).join(', ');

  // Style + scene FIRST. "main character, centered" locks focus on named character.
  // Wide shot when supporting characters present.
  if (hasSupporting) {
    return `2D cartoon, bold outlines, flat cel shading, vibrant pastels. Wide shot: ${setting}. ${charId} as main character, centered, with ${supportingList}, ${action}. ${musts}. No text.`;
  }
  return `2D cartoon, bold outlines, flat cel shading, vibrant pastels. ${setting}. ${charId} as main character, centered, full body, ${action}. ${musts}. No text.`;
}
