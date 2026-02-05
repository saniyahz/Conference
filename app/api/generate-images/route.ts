import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { buildSceneOnlyPrompt } from '@/lib/buildImagePrompt'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Helper function to sleep/delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Rate limit configuration
// Replicate free tier: 6 requests per minute = 10 seconds between requests minimum
const BASE_DELAY_BETWEEN_IMAGES = 15000 // 15 seconds between Replicate calls (2 calls per page now)
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

/**
 * Build MINIMAL negative for final pass (2-pass pipeline).
 * Scene is already baked into the plate — negatives must NEVER contain env words.
 * STATIC quality-only list. No species, no replacement animals, no env words.
 * Scene is controlled by the plate + must_include, not by negatives.
 */
function buildFinalPassNegative(): string {
  const neg = 'text, watermark, logo, signature, photorealistic, realistic, 3D render, CGI, blurry, low quality, jpeg artifacts, bad anatomy, bad proportions, deformed, extra limbs, extra arms, extra legs, extra heads, extra faces, monster, horror, gore, weapon'
  console.log(`[FINAL-PASS NEGATIVES] ${neg}`)
  return neg
}

/**
 * Anti-sabotage sanitizer: remove any negative term that appears in the prompt or setting.
 * Last line of defense — catches edge cases where a negative accidentally matches
 * a word the image actually needs.
 */
function sanitizeNegatives(negativePrompt: string, prompt: string, setting: string): string {
  const contextLower = `${prompt} ${setting}`.toLowerCase()
  const terms = negativePrompt.split(',').map(t => t.trim()).filter(t => t.length > 0)

  const removed: string[] = []
  const filtered = terms.filter(term => {
    const termLower = term.toLowerCase()
    // Check if the exact negative term appears in the prompt/setting context
    // Only remove single-word or short terms that match — don't strip quality terms
    // Quality terms (photorealistic, blurry, watermark, etc.) will never appear in story prompts
    if (contextLower.includes(termLower)) {
      removed.push(term)
      return false
    }
    return true
  })

  if (removed.length > 0) {
    console.log(`[SANITIZER] Removed from negatives (found in prompt/setting): ${removed.join(', ')}`)
  }

  return filtered.join(', ')
}

/**
 * Generate a scene plate (txt2img, background only, no characters).
 * This is STEP 1 of the 2-pass pipeline.
 * The plate provides the environment that img2img preserves in step 2.
 */
async function generateScenePlate(
  replicate: Replicate,
  scenePrompt: string,
  seed: number,
  pageIndex: number
): Promise<string> {
  // Scene plate negatives: block ALL characters/animals so the plate is pure background
  const sceneNegative = 'rhinoceros, rhino, animal, character, person, human, face, creature, text, watermark, photorealistic, 3D render, CGI, Pixar, DSLR, blurry, low quality'

  console.log(`\n========== SCENE PLATE ${pageIndex + 1} ==========`)
  console.log(`PLATE PROMPT: ${scenePrompt}`)
  console.log(`PLATE PROMPT LENGTH: ${scenePrompt.split(/\s+/).length} words / ${scenePrompt.length} chars`)
  console.log(`PLATE NEGATIVE: ${sceneNegative}`)
  console.log(`PLATE SEED: ${seed}`)

  const prediction = await replicate.predictions.create({
    version: SDXL_VERSION,
    input: {
      prompt: scenePrompt,
      negative_prompt: sceneNegative,
      width: 1024,
      height: 1024,
      num_outputs: 1,
      scheduler: "K_EULER",
      num_inference_steps: 30,
      guidance_scale: 8,
      seed,
    }
  })

  console.log(`[PLATE ${pageIndex + 1}] Prediction created: ${prediction.id}`)

  // Poll for completion
  let completedPrediction = prediction
  let pollCount = 0
  const maxPolls = 60

  while (completedPrediction.status !== 'succeeded' && completedPrediction.status !== 'failed' && completedPrediction.status !== 'canceled') {
    pollCount++
    if (pollCount > maxPolls) throw new Error('Scene plate timed out')
    if (pollCount % 5 === 0) {
      console.log(`[PLATE ${pageIndex + 1}] Polling... (${pollCount}/${maxPolls}) status: ${completedPrediction.status}`)
    }
    await sleep(2000)
    completedPrediction = await replicate.predictions.get(prediction.id)
  }

  if (completedPrediction.status === 'failed') {
    throw new Error(`Scene plate failed: ${completedPrediction.error || 'Unknown error'}`)
  }
  if (completedPrediction.status === 'canceled') {
    throw new Error('Scene plate was canceled')
  }

  // Extract URL
  const output = completedPrediction.output
  let plateUrl = ''
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0]
    if (typeof first === 'string' && first.startsWith('http')) {
      plateUrl = first
    } else {
      try { const s = String(first); if (s.startsWith('http')) plateUrl = s; } catch {}
    }
  } else if (typeof output === 'string' && output.startsWith('http')) {
    plateUrl = output
  }

  if (!plateUrl) {
    throw new Error(`Failed to extract scene plate URL for page ${pageIndex + 1}`)
  }

  console.log(`[PLATE ${pageIndex + 1}] URL: ${plateUrl.substring(0, 60)}...`)
  return plateUrl
}

// Helper function to generate image with img2img
// Used for: adding character to scene plate (primary) or anchor-based fallback
// Uses predictions API instead of run() to avoid empty [{}] response issue
async function generateImageWithAnchor(
  replicate: Replicate,
  prompt: string,
  negativePrompt: string | undefined,
  baseImageUrl: string,
  seed: number,
  imageIndex: number,
  promptStrength: number = 0.80,
  settingContext: string = '',  // Setting text for sanitizer context
  useMinimalNegatives: boolean = false  // true = 2-pass final (quality only), false = fallback (full env rules)
): Promise<string> {
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Choose negative strategy based on pipeline mode:
      // 2-pass final pass: minimal negatives (quality/style only, NO env words — plate handles env)
      // Fallback anchor pass: full dynamic negatives (env words needed since no plate)
      let dynamicNegative: string
      if (useMinimalNegatives) {
        dynamicNegative = buildFinalPassNegative()
      } else {
        const promptForNegatives = settingContext ? `${prompt} ${settingContext}` : prompt
        dynamicNegative = buildDynamicNegativePrompt(promptForNegatives, negativePrompt)
      }
      // Anti-sabotage sanitizer: last line of defense — remove any negative that matches prompt/setting
      dynamicNegative = sanitizeNegatives(dynamicNegative, prompt, settingContext)

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
        image: baseImageUrl,  // Scene plate (primary) or anchor (fallback)
        prompt_strength: promptStrength,
      }

      // EXPLICIT DEBUG LOGS
      console.log(`\n========== IMG2IMG PAGE ${imageIndex + 1} (attempt ${attempt}) ==========`)
      console.log(`BASE IMAGE: ${baseImageUrl.substring(0, 60)}...`)
      console.log(`PROMPT_STRENGTH: ${promptStrength}`)
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
        console.log(`SUCCESS: Page ${imageIndex + 1} generated: ${imageUrl.substring(0, 60)}...`)
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
    const { imagePrompts, negativePrompts, seed, characterAnchorUrl, sceneSettings } = await request.json()

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

    const has2PassPipeline = sceneSettings && Array.isArray(sceneSettings) && sceneSettings.length > 0

    console.log(`\n========== IMAGE GENERATION CONFIG ==========`)
    console.log(`PIPELINE: ${has2PassPipeline ? '2-PASS (scene plate → character img2img)' : 'SINGLE-PASS (anchor img2img)'}`)
    console.log(`ANCHOR URL: ${characterAnchorUrl}`)
    console.log(`SCENE SETTINGS: ${has2PassPipeline ? sceneSettings.length + ' settings provided' : 'NONE'}`)
    console.log(`BASE SEED: ${baseSeed} (each page gets baseSeed + pageIndex*1000)`)
    console.log(`PLATE PROMPT_STRENGTH: 0.45 (character on plate) / FALLBACK: 0.80 (anchor)`)
    console.log(`NEGATIVES: 2-pass=quality-only (no env words) / fallback=full env rules`)
    console.log(`DELAY BETWEEN CALLS: ${BASE_DELAY_BETWEEN_IMAGES / 1000}s`)
    console.log(`TOTAL PAGES: ${imagePrompts.length}`)
    console.log(`==============================================\n`)

    // Generate images ONE AT A TIME to avoid rate limits
    // 2-pass pipeline: scene plate (txt2img) → character on plate (img2img)
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      const negativePrompt = negativePrompts && negativePrompts[i] ? negativePrompts[i] : undefined
      const setting = has2PassPipeline ? sceneSettings[i] : ''
      const pageSeed = baseSeed + i * 1000

      console.log(`\n========== PAGE ${i + 1}/${imagePrompts.length} ==========`)
      console.log(`SEED: ${pageSeed}`)
      console.log(`SETTING: ${setting ? setting.substring(0, 80) : 'N/A'}`)
      console.log(`FINAL PROMPT: ${prompt.substring(0, 120)}...`)
      console.log(`FINAL PROMPT LENGTH: ${prompt.split(/\s+/).length} words / ${prompt.length} chars`)

      let imageUrl = ''

      try {
        if (setting) {
          // ===== 2-PASS PIPELINE =====
          // STEP 1: Generate scene plate (txt2img, background only)
          const scenePrompt = buildSceneOnlyPrompt(setting)
          const plateUrl = await generateScenePlate(replicate, scenePrompt, pageSeed, i)

          // Delay between Replicate calls
          console.log(`Waiting ${BASE_DELAY_BETWEEN_IMAGES / 1000}s before final pass...`)
          await sleep(BASE_DELAY_BETWEEN_IMAGES)

          // STEP 2: Add character to plate (img2img, plate as base)
          // useMinimalNegatives=true: quality-only negatives, NO env words (plate handles env)
          imageUrl = await generateImageWithAnchor(
            replicate,
            prompt,
            negativePrompt,
            plateUrl,       // Scene plate as base image
            pageSeed,
            i,
            0.45,           // prompt_strength: character shows but scene stays
            setting,         // Setting context for sanitizer
            true             // MINIMAL negatives — no env words, plate controls scene
          )
        } else {
          // ===== FALLBACK: single-pass with anchor =====
          // useMinimalNegatives=false: full env rules (no plate to handle scene)
          imageUrl = await generateImageWithAnchor(
            replicate,
            prompt,
            negativePrompt,
            characterAnchorUrl,
            pageSeed,
            i,
            0.80,
            '',              // No setting context
            false            // FULL negatives — env rules needed since no plate
          )
        }

        if (!imageUrl) {
          throw new Error(`Image generation failed for page ${i + 1}`)
        }

        imageUrls.push(imageUrl)
        console.log(`Page ${i + 1} done: SUCCESS`)
      } catch (error: any) {
        console.error(`Page ${i + 1} error: ${error.message}`)

        // If 2-pass failed, try fallback with anchor
        if (setting && characterAnchorUrl) {
          console.log(`[PAGE ${i + 1}] 2-pass failed, falling back to anchor img2img...`)
          try {
            await sleep(BASE_DELAY_BETWEEN_IMAGES)
            // Fallback: useMinimalNegatives=false — full env rules since no plate
            imageUrl = await generateImageWithAnchor(
              replicate,
              prompt,
              negativePrompt,
              characterAnchorUrl,
              pageSeed,
              i,
              0.80,
              setting,
              false            // FULL negatives — env rules needed since no plate
            )
            if (imageUrl) {
              imageUrls.push(imageUrl)
              console.log(`Page ${i + 1} fallback: SUCCESS`)
              continue
            }
          } catch (fallbackError: any) {
            console.error(`Page ${i + 1} fallback also failed: ${fallbackError.message}`)
          }
        }

        imageUrls.push('') // Push empty string for failed images
      }

      // Delay between pages (between the last call of this page and the first of next)
      if (i < imagePrompts.length - 1) {
        console.log(`Waiting ${BASE_DELAY_BETWEEN_IMAGES / 1000}s before next page...`)
        await sleep(BASE_DELAY_BETWEEN_IMAGES)
      }
    }

    const successCount = imageUrls.filter(url => url).length
    const failedIndices = imageUrls
      .map((url, index) => (!url ? index : -1))
      .filter(index => index !== -1)

    console.log(`\n========== IMAGE GENERATION COMPLETE ==========`)
    console.log(`Success: ${successCount}/${imagePrompts.length} images`)
    console.log(`Pipeline: ${has2PassPipeline ? '2-PASS' : 'SINGLE-PASS'}`)
    console.log(`BASE SEED: ${baseSeed}`)
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
