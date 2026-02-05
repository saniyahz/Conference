import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Helper function to sleep/delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Rate limit configuration
// Replicate free tier: 6 requests per minute = 10 seconds between requests minimum
const BASE_DELAY_BETWEEN_IMAGES = 10000 // 10 seconds to stay under rate limit
const RATE_LIMIT_INITIAL_WAIT = 15000 // 15 seconds on first rate limit
const RATE_LIMIT_MAX_WAIT = 60000 // 60 seconds max wait

// Helper function to generate a single image with retry logic
async function generateImageWithRetry(
  replicate: Replicate,
  prompt: string,
  customNegativePrompt: string | undefined,
  imageIndex: number,
  imagePromptsLength: number,
  seed: number,
  maxRetries = 4 // Increased retries for rate limiting
): Promise<string> {
  let rateLimitWait = RATE_LIMIT_INITIAL_WAIT

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
          // Use the prompt as-is - it's already structured properly
          const cleanPrompt = prompt

          // Use passed negative prompt OR fallback to default
          // MUST include environment-blocking terms to prevent forest/castle defaults
          const negativePrompt = customNegativePrompt ||
            `forest, trees, grass, castle, human child, people, land animals, houses, realistic, 3D render, anime, text in image, text, words, letters, writing, caption, label, watermark, signature, logo, typography, font, numbers, scary, creepy, horror, dark, evil, ugly, deformed, bad anatomy, bad proportions, photorealistic`

          console.log(`\n========== IMAGE ${imageIndex + 1} DEBUG ==========`)
          console.log(`Attempt ${attempt}/${maxRetries}`)
          console.log(`\n--- FULL PROMPT ---`)
          console.log(cleanPrompt)
          console.log(`\n--- NEGATIVE PROMPT ---`)
          console.log(negativePrompt)
          console.log(`\n--- REPLICATE INPUT ---`)
          console.log(JSON.stringify({
            prompt: cleanPrompt.substring(0, 500) + '...',
            negative_prompt: negativePrompt.substring(0, 200) + '...',
            guidance_scale: 2,
            num_inference_steps: 4
          }, null, 2))
          console.log(`===================================\n`)

          // Use standard SDXL - balanced settings for speed + quality
          const output = await replicate.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
              input: {
                prompt: cleanPrompt,
                negative_prompt: negativePrompt,
                width: 1024,
                height: 1024,
                num_outputs: 1,
                scheduler: "K_EULER",
                num_inference_steps: 20,   // Faster, still good
                guidance_scale: 8,         // Balanced prompt following
                seed: seed,
              }
            }
          )

          // Handle output - SDXL returns array of URLs
          let imageUrl = ''

          if (Array.isArray(output) && output.length > 0) {
            // If it's an array, take the first element
            const firstOutput = output[0]

            // Check if it's already a string URL
            if (typeof firstOutput === 'string') {
              imageUrl = firstOutput
            } else if (firstOutput && typeof firstOutput === 'object') {
              // If it's a stream or object, try to read it
              // The stream might contain the URL as data
              try {
                // Try converting to string (might be a URL object)
                imageUrl = String(firstOutput)
                // If it looks like a stream object, we need to iterate
                if (imageUrl.includes('ReadableStream') || imageUrl.includes('[object')) {
                  // Use async iteration to read the stream
                  const chunks: string[] = []
                  for await (const chunk of output as any) {
                    if (typeof chunk === 'string') {
                      chunks.push(chunk)
                    }
                  }
                  imageUrl = chunks.join('')
                }
              } catch (e) {
                // Error reading stream
              }
            }
          } else if (typeof output === 'string') {
            imageUrl = output
          }

          if (imageUrl && imageUrl.startsWith('http')) {
          return imageUrl
        } else {
          return ''
        }
      } catch (error: any) {
        const errorMessage = error.message || String(error)
        const is429 = errorMessage.includes('429') || errorMessage.includes('Too Many Requests')
        const isRateLimit = errorMessage.includes('rate limit') || is429

        console.log(`Image ${imageIndex + 1} attempt ${attempt} failed: ${errorMessage.substring(0, 100)}`)

        if (isRateLimit && attempt < maxRetries) {
          // Exponential backoff for rate limits
          console.log(`Rate limited, waiting ${rateLimitWait}ms before retry...`)
          await sleep(rateLimitWait)
          // Increase wait time for next potential rate limit (exponential backoff)
          rateLimitWait = Math.min(rateLimitWait * 1.5, RATE_LIMIT_MAX_WAIT)
          continue
        } else if (attempt < maxRetries) {
          // For other errors, quick retry with small backoff
          const waitTime = 3000 * attempt
          console.log(`Error on attempt ${attempt}, retrying in ${waitTime}ms...`)
          await sleep(waitTime)
          continue
        } else {
          // Max retries reached
          console.log(`Max retries (${maxRetries}) reached for image ${imageIndex + 1}`)
          return ''
        }
      }
    }
    return ''
}

// SDXL model version - use consistent version throughout
const SDXL_VERSION = "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"

/**
 * Build dynamic negative prompt — compact, scene-aware.
 * Only bans environments the page doesn't need.
 * AGGRESSIVE SUBTRACTION: any negative term found in the prompt is removed.
 */
function buildDynamicNegativePrompt(pagePrompt: string, providedNegative: string | undefined): string {
  const lp = pagePrompt.toLowerCase()

  // Core block: anti-sheet + anti-3D (always apply, NEVER subtracted)
  const safeNeg = [
    'character sheet', 'reference sheet', 'turnaround', 'multiple poses', 'collage', 'grid', 'lineup',
    'photorealistic', '3D render', 'CGI', 'Pixar', 'DSLR',
    'text', 'watermark', 'logo', 'blurry', 'low quality',
  ]

  // Subtractable negatives — will be removed if they appear in the prompt
  const subNeg: string[] = []

  // Replacement-animal blocking — prevents SDXL from substituting random animals
  subNeg.push('shark', 'whale', 'snake', 'spider', 'predator', 'monster')

  // Environment negatives — only add if the page doesn't need them
  // Trigger lists are BROAD: prefer not-banning over wrongly-banning
  const envRules: [string, string[]][] = [
    ['underwater', ['underwater', 'ocean floor', 'coral', 'beneath the water', 'under the sea', 'deep sea', 'seabed']],
    ['ocean', ['ocean', 'sea', 'water', 'splash', 'swim', 'wave', 'shore', 'beach', 'dolphin', 'fish', 'sail', 'boat']],
    ['space', ['space', 'star', 'stars', 'starry', 'galaxy', 'cosmos', 'nebula', 'planet', 'orbit', 'moon', 'lunar', 'asteroid', 'rocket', 'spaceship', 'launch', 'blast off', 'liftoff']],
    ['moon', ['moon', 'lunar', 'crater', 'rocket', 'spaceship', 'launch', 'space', 'star', 'stars', 'starry']],
    ['rocket', ['rocket', 'spaceship', 'launch', 'blast off', 'cockpit', 'liftoff', 'countdown']],
    ['forest', ['forest', 'tree', 'trees', 'woods', 'jungle', 'woodland', 'leaf', 'leaves']],
    ['desert', ['desert', 'sand', 'dune', 'oasis', 'cactus', 'arid']],
  ]

  for (const [word, triggers] of envRules) {
    if (!triggers.some(t => lp.includes(t))) {
      subNeg.push(word)
    }
  }

  // Species-confusion negatives
  if (lp.includes('rhinoceros') || lp.includes('rhino')) {
    subNeg.push('cow', 'hippo', 'elephant', 'horse')
  }

  // Block humans for animal characters
  const animalKeywords = ['rhinoceros', 'rhino', 'elephant', 'lion', 'bear', 'rabbit', 'cat', 'dog', 'fox', 'tiger', 'giraffe', 'penguin', 'dolphin', 'owl']
  if (animalKeywords.some(a => lp.includes(a))) {
    subNeg.push('human', 'person', 'child')
  }

  // AGGRESSIVE SUBTRACTION: remove any subtractable negative found in the prompt
  // Uses substring match — "dolphins" in prompt removes "dolphin" from negatives
  const filteredSubNeg = subNeg.filter(n => !lp.includes(n.toLowerCase()))

  // CRITICAL TOKEN SAFETY NET: explicit list of tokens that must NEVER be
  // in negatives if they appear anywhere in the prompt (catches edge cases)
  const criticalTokens = [
    'moon', 'space', 'star', 'stars', 'ocean', 'underwater', 'water',
    'forest', 'trees', 'tree', 'rocket', 'dolphin', 'dolphins', 'lion',
    'lions', 'earth', 'sea', 'waves', 'coral', 'fish', 'sand', 'desert',
    'cave', 'mountain', 'river', 'meadow', 'beach', 'whale', 'shark',
  ]
  const safetyFiltered = filteredSubNeg.filter(term => {
    const t = term.toLowerCase()
    // If this term is a critical token AND appears in prompt, remove it
    if (criticalTokens.includes(t) && lp.includes(t)) return false
    return true
  })

  const removed = subNeg.filter(n => !safetyFiltered.includes(n))
  if (removed.length > 0) {
    console.log(`[NEGATIVES] Removed (found in prompt): ${removed.join(', ')}`)
  }

  const finalNeg = [...safeNeg, ...safetyFiltered]
  console.log(`[NEGATIVES] ${finalNeg.join(', ')}`)
  return finalNeg.join(', ')
}

// Helper function to generate image with anchor reference (img2img)
// This is the PRIMARY method for character consistency
// Uses predictions API instead of run() to avoid empty [{}] response issue
async function generateImageWithAnchor(
  replicate: Replicate,
  prompt: string,
  negativePrompt: string | undefined,
  anchorUrl: string,
  seed: number,
  imageIndex: number
): Promise<string> {
  const maxRetries = 3
  // prompt_strength: 0.80 lets the scene prompt override the anchor's white background
  // while still keeping character shape/identity from the anchor image
  // 0.65 was too low — kept the anchor's plain background on every page
  const PROMPT_STRENGTH = 0.80

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Build dynamic negative prompt that doesn't fight the scene
      const dynamicNegative = buildDynamicNegativePrompt(prompt, negativePrompt)

      // Build input object for img2img
      const input: any = {
        prompt,
        negative_prompt: dynamicNegative,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 30,
        guidance_scale: 8,
        seed,  // Per-page seed (offset from baseSeed)
        image: anchorUrl,  // Anchor for img2img
        prompt_strength: PROMPT_STRENGTH,  // Allow scene to change
      }

      // EXPLICIT DEBUG LOGS
      console.log(`\n========== IMG2IMG PAGE ${imageIndex + 1} (attempt ${attempt}) ==========`)
      console.log(`ANCHOR URL: ${anchorUrl}`)
      console.log(`PROMPT_STRENGTH: ${input.prompt_strength}`)
      console.log(`SEED: ${input.seed}`)
      console.log(`FINAL REPLICATE INPUT:`, JSON.stringify(input, null, 2))
      console.log(`================================================================\n`)

      // Use predictions API instead of run() to avoid empty [{}] response
      const prediction = await replicate.predictions.create({
        version: SDXL_VERSION,
        input
      })

      console.log(`[PAGE ${imageIndex + 1}] Prediction created: ${prediction.id}`)

      // Poll for completion
      let completedPrediction = prediction
      let pollCount = 0
      const maxPolls = 60 // 2 minutes max

      while (completedPrediction.status !== 'succeeded' && completedPrediction.status !== 'failed' && completedPrediction.status !== 'canceled') {
        pollCount++
        if (pollCount > maxPolls) {
          throw new Error('Prediction timed out')
        }
        if (pollCount % 5 === 0) {
          console.log(`[PAGE ${imageIndex + 1}] Polling... (${pollCount}/${maxPolls}) status: ${completedPrediction.status}`)
        }
        await sleep(2000)
        completedPrediction = await replicate.predictions.get(prediction.id)
      }

      console.log(`[PAGE ${imageIndex + 1}] Final status: ${completedPrediction.status}`)

      if (completedPrediction.status === 'failed') {
        throw new Error(`Prediction failed: ${completedPrediction.error || 'Unknown error'}`)
      }

      const output = completedPrediction.output

      // Extract URL from output
      let imageUrl = ''
      if (Array.isArray(output) && output.length > 0) {
        const firstOutput = output[0]
        if (typeof firstOutput === 'string' && firstOutput.startsWith('http')) {
          imageUrl = firstOutput
        }
      } else if (typeof output === 'string' && output.startsWith('http')) {
        imageUrl = output
      }

      if (imageUrl) {
        console.log(`SUCCESS: Page ${imageIndex + 1} generated with anchor: ${imageUrl.substring(0, 60)}...`)
        return imageUrl
      } else {
        console.log(`[PAGE ${imageIndex + 1}] No URL in output:`, JSON.stringify(output).substring(0, 200))
      }
    } catch (error: any) {
      console.log(`[PAGE ${imageIndex + 1}] attempt ${attempt} failed:`, error.message?.substring(0, 100))
      if (attempt < maxRetries) {
        await sleep(3000 * attempt)
      }
    }
  }

  return ''
}

export async function POST(request: NextRequest) {
  try {
    const { imagePrompts, negativePrompts, seed, characterAnchorUrl } = await request.json()

    if (!imagePrompts || !Array.isArray(imagePrompts)) {
      return NextResponse.json(
        { error: 'Invalid image prompts provided' },
        { status: 400 }
      )
    }

    // Check if API key is configured
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'Replicate API token not configured' },
        { status: 500 }
      )
    }

    // FAIL FAST: If anchor is expected but missing, throw error immediately
    // This prevents "silent text2img" fallback that breaks character consistency
    if (!characterAnchorUrl) {
      console.error('ERROR: Missing character anchor URL — cannot run anchored img2img')
      return NextResponse.json(
        { error: 'Missing character anchor URL — cannot run anchored img2img' },
        { status: 400 }
      )
    }

    // Use provided seed as base - each page gets baseSeed + pageIndex*1000
    // Different seeds per page prevent identical compositions while staying deterministic
    const baseSeed = seed || Math.floor(Math.random() * 1000000)

    console.log(`\n========== IMAGE GENERATION CONFIG ==========`)
    console.log(`CHARACTER ANCHOR MODE: ENABLED (required)`)
    console.log(`ANCHOR URL: ${characterAnchorUrl}`)
    console.log(`BASE SEED: ${baseSeed} (each page gets baseSeed + pageIndex*1000)`)
    console.log(`PROMPT_STRENGTH: 0.80 (scene overrides anchor background)`)
    console.log(`TOTAL PAGES: ${imagePrompts.length}`)
    console.log(`==============================================\n`)

    // Generate images ONE AT A TIME to avoid rate limits
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      const negativePrompt = negativePrompts && negativePrompts[i] ? negativePrompts[i] : undefined
      // Per-page seed: deterministic but different for each page
      const pageSeed = baseSeed + i * 1000

      console.log(`\n========== GENERATING IMAGE ${i + 1}/${imagePrompts.length} ==========`)
      console.log(`SEED: ${pageSeed} (baseSeed ${baseSeed} + page ${i} * 1000)`)

      try {
        // ALWAYS use anchor-based img2img - NO FALLBACK to txt2img
        const imageUrl = await generateImageWithAnchor(
          replicate,
          prompt,
          negativePrompt,
          characterAnchorUrl,
          pageSeed,  // Per-page seed for composition variety
          i
        )

        if (!imageUrl) {
          // If img2img fails, throw error - do NOT fall back to txt2img
          throw new Error(`Anchor-based generation failed for page ${i + 1}`)
        }

        imageUrls.push(imageUrl)
        console.log(`Image ${i + 1} done: SUCCESS`)
      } catch (error) {
        console.error(`Image ${i + 1} error:`, error)
        imageUrls.push('') // Push empty string for failed images
      }

      // Delay between images to avoid rate limiting (6 requests/minute limit)
      if (i < imagePrompts.length - 1) {
        console.log(`Waiting ${BASE_DELAY_BETWEEN_IMAGES / 1000}s before next image...`)
        await sleep(BASE_DELAY_BETWEEN_IMAGES)
      }
    }

    const successCount = imageUrls.filter(url => url).length
    const failedIndices = imageUrls
      .map((url, index) => (!url ? index : -1))
      .filter(index => index !== -1)

    console.log(`\n========== IMAGE GENERATION COMPLETE ==========`)
    console.log(`Success: ${successCount}/${imagePrompts.length} images`)
    console.log(`BASE SEED: ${baseSeed} (per-page: baseSeed + page*1000)`)
    console.log(`PROMPT_STRENGTH: 0.80`)
    console.log(`ANCHOR URL: ${characterAnchorUrl}`)
    if (failedIndices.length > 0) {
      console.log(`Failed pages: ${failedIndices.map(i => i + 1).join(', ')}`)
    }
    console.log(`==============================================\n`)

    return NextResponse.json({
      imageUrls,
      seed: baseSeed,
      success: successCount === imagePrompts.length,
      failedCount: failedIndices.length,
      failedPages: failedIndices.map(i => i + 1),
    })
  } catch (error) {
    console.error('Error in image generation:', error)
    return NextResponse.json(
      { error: 'Failed to generate images' },
      { status: 500 }
    )
  }
}
