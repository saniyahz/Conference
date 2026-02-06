import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { buildSceneOnlyPrompt } from '@/lib/buildImagePrompt'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Helper function to sleep/delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Wait until a Replicate CDN URL is fetchable (HTTP 200).
 * Replicate delivery URLs can 404 briefly after prediction completes
 * because CDN propagation lags behind the API response.
 * Retries HEAD requests with delays until ready or max attempts reached.
 */
async function waitForUrlReady(url: string, maxAttempts = 5, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        if (attempt > 1) {
          console.log(`[URL READY] ${url.substring(0, 60)}... ready after ${attempt} attempt(s)`)
        }
        return true
      }
      console.log(`[URL PROBE] Attempt ${attempt}/${maxAttempts}: HTTP ${response.status} — waiting ${delayMs / 1000}s...`)
    } catch (error: any) {
      console.log(`[URL PROBE] Attempt ${attempt}/${maxAttempts}: ${error.message} — waiting ${delayMs / 1000}s...`)
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs)
    }
  }
  console.warn(`[URL PROBE] WARN: ${url.substring(0, 60)}... not ready after ${maxAttempts} attempts`)
  return false
}

/**
 * Download an image URL immediately and return as base64 data URL.
 * This permanently prevents PDF 404s — the image bytes are stored in memory
 * and passed through the frontend to generate-pdf without any remote fetches.
 * Falls back to the raw URL if download fails (PDF can retry later).
 */
async function downloadImageAsBase64(url: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      const base64 = buffer.toString('base64')
      const sizeKB = Math.round(buffer.length / 1024)
      console.log(`[DOWNLOAD] Image downloaded: ${sizeKB}KB base64`)
      return `data:image/png;base64,${base64}`
    } catch (error: any) {
      console.log(`[DOWNLOAD] Attempt ${attempt}/${maxRetries}: ${error.message}`)
      if (attempt < maxRetries) {
        await sleep(2000 * attempt)
      }
    }
  }
  // Fallback: return raw URL (PDF will attempt to fetch it later)
  console.warn(`[DOWNLOAD] Failed — returning raw URL as fallback`)
  return url
}

// Rate limit configuration
// Replicate free tier: 6 requests per minute = 10 seconds between requests minimum
const BASE_DELAY_BETWEEN_IMAGES = 5000 // 5 seconds between Replicate calls
const RATE_LIMIT_INITIAL_WAIT = 15000 // 15 seconds on first rate limit
const RATE_LIMIT_MAX_WAIT = 60000 // 60 seconds max wait

// SDXL model version - use consistent version throughout
const SDXL_VERSION = "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"

/**
 * Build QUALITY-ONLY negative prompt. Used for ALL image generation paths.
 * NEVER contains environment words (ocean, forest, moon, rocket, etc.).
 * Scene is controlled by the plate + prompt + must_include, not by negatives.
 */
function buildQualityOnlyNegative(): string {
  return [
    // Quality issues
    'text, watermark, logo, signature, photorealistic, realistic, 3D render, CGI, blurry, low quality, jpeg artifacts',
    // Anatomy issues
    'bad anatomy, bad proportions, deformed, extra limbs, extra arms, extra legs, extra heads, extra faces',
    // DUPLICATE CHARACTER PREVENTION — critical for main character consistency
    'duplicate character, twin, clone, multiple main characters, two rhinos, two rhinoceros, multiple rhinos, extra animal, extra creature',
    // Reference sheet / layout issues
    'character sheet, reference sheet, turnaround, collage, grid, lineup, model sheet',
    // COMPOSITION — prevent giant heads / extreme close-ups
    'close-up, extreme close-up, cropped head, giant face, portrait, headshot, face only',
    // HUMAN BLOCKING — prevent realistic humans/astronauts in anthropomorphic animal stories
    // "astronaut" often triggers photorealistic humans; we want cartoon animals in spacesuits
    'human, realistic human, human astronaut, person in spacesuit, astronaut in suit, real person, realistic person',
    // Content issues
    'monster, horror, gore, weapon'
  ].join(', ')
}

/**
 * TOKEN-BASED negative sanitizer: "Never negate what you ask for."
 * Tokenizes prompt + setting + mustIncludes into individual words,
 * then removes any negative term containing a matching word.
 * This is the core fix for scene elements disappearing.
 */
function sanitizeNegatives(negativePrompt: string, prompt: string, setting: string, mustInclude: string[] = []): string {
  // Build token set from ALL positive context
  const contextText = `${prompt} ${setting} ${mustInclude.join(' ')}`
  const contextTokens = new Set(
    contextText.toLowerCase()
      .replace(/[.,!?;:'"()]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)  // skip tiny words like "a", "the", "no"
  )

  const terms = negativePrompt.split(',').map(t => t.trim()).filter(t => t.length > 0)
  const removed: string[] = []

  const filtered = terms.filter(term => {
    const termWords = term.toLowerCase().split(/\s+/)
    // If ANY word in the negative term matches a prompt/setting/mustInclude token, remove it
    if (termWords.some(w => w.length > 2 && contextTokens.has(w))) {
      removed.push(term)
      return false
    }
    return true
  })

  if (removed.length > 0) {
    console.log(`[SANITIZER] Removed from negatives (token match in prompt/setting/must_include): ${removed.join(', ')}`)
  }

  return filtered.join(', ')
}

/**
 * Plate cache key: use the EXACT setting string (lowercased + trimmed).
 * Previous approach used broad categories ("ocean", "moon") which caused
 * wildly different scenes to share the same plate. Now each unique setting
 * gets its own plate, and only truly identical settings reuse a plate.
 */
function plateCacheKey(setting: string): string {
  return setting.toLowerCase().trim()
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
      num_inference_steps: 14,  // Plates need fewer steps (background only, no fine detail)
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

  // No URL probe here — Replicate's img2img can fetch its own CDN URLs
  // without waiting for global propagation. Probing is only needed for
  // external consumers (PDF endpoint) and is done in a batch at the end.
  console.log(`[PLATE ${pageIndex + 1}] URL: ${plateUrl.substring(0, 60)}...`)
  return plateUrl
}

// Helper function to generate image with img2img
// Used for: adding character to scene plate (primary) or anchor-based fallback
// Uses predictions API instead of run() to avoid empty [{}] response issue
async function generateImageWithAnchor(
  replicate: Replicate,
  prompt: string,
  baseImageUrl: string,
  seed: number,
  imageIndex: number,
  promptStrength: number = 0.80,
  settingContext: string = '',  // Setting text for sanitizer context
  mustInclude: string[] = []  // Must-include items for negative sanitization
): Promise<string> {
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // QUALITY-ONLY negatives for ALL paths. ZERO env words.
      // Scene is controlled by plate + prompt + Include:, not by negatives.
      let dynamicNegative = buildQualityOnlyNegative()
      // Safety net: token-based sanitizer removes any negative that matches prompt/setting/must_include
      dynamicNegative = sanitizeNegatives(dynamicNegative, prompt, settingContext, mustInclude)
      console.log(`[NEGATIVES PAGE ${imageIndex + 1}] ${dynamicNegative}`)

      // Build input object for img2img
      const input: any = {
        prompt,
        negative_prompt: dynamicNegative,
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 20,  // Final pass: character detail needs more steps than plate
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
        // URL probe is done in a parallel batch after all pages complete (faster)
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
    const { imagePrompts, negativePrompts, seed, characterAnchorUrl, sceneSettings, sceneMustIncludes } = await request.json()

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
    const hasMustIncludes = sceneMustIncludes && Array.isArray(sceneMustIncludes) && sceneMustIncludes.length > 0

    console.log(`\n========== IMAGE GENERATION CONFIG ==========`)
    console.log(`PIPELINE: ${has2PassPipeline ? '2-PASS (scene plate → character img2img)' : 'SINGLE-PASS (anchor img2img)'}`)
    console.log(`ANCHOR URL: ${characterAnchorUrl}`)
    console.log(`SCENE SETTINGS: ${has2PassPipeline ? sceneSettings.length + ' settings provided' : 'NONE'}`)
    console.log(`MUST INCLUDES: ${hasMustIncludes ? 'YES (per-page key objects for plate + sanitizer)' : 'NONE'}`)
    console.log(`BASE SEED: ${baseSeed} (each page gets baseSeed + pageIndex*1000)`)
    console.log(`PLATE PROMPT_STRENGTH: 0.65 (character on plate) / FALLBACK: 0.80 (anchor)`)
    console.log(`NEGATIVES: quality-only for ALL paths (zero env words) + token sanitizer`)
    console.log(`DELAY BETWEEN CALLS: ${BASE_DELAY_BETWEEN_IMAGES / 1000}s`)
    console.log(`KEYFRAME OPTIMIZATION: reuse plates only when exact setting string matches`)
    console.log(`IMAGE DOWNLOAD: immediate base64 (no remote URL dependency for PDF)`)
    console.log(`TOTAL PAGES: ${imagePrompts.length}`)
    console.log(`==============================================\n`)

    // Generate images with KEYFRAME PLATE CACHE to minimize API calls.
    // Only generate a new plate when the scene category changes.
    // Pages with the same scene category reuse the cached plate.
    // This turns ~20 API calls → ~14 for a typical 10-page book.
    const imageUrls: string[] = []
    const plateUrls: string[] = []  // Debug: collect plate URLs to verify scenes
    const plateCache: Map<string, string> = new Map()  // exact setting → plateUrl
    const plateMustIncludes: Map<string, string[]> = new Map()  // exact setting → mustIncludes used for that plate
    let totalApiCalls = 0

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      const setting = has2PassPipeline ? sceneSettings[i] : ''
      const mustInclude: string[] = hasMustIncludes ? (sceneMustIncludes[i] || []) : []
      const pageSeed = baseSeed + i * 1000
      const cacheKey = setting ? plateCacheKey(setting) : ''

      console.log(`\n========== PAGE ${i + 1}/${imagePrompts.length} ==========`)
      console.log(`SEED: ${pageSeed}`)
      console.log(`SETTING: ${setting ? setting.substring(0, 80) : 'N/A'}`)
      console.log(`CACHE KEY: ${cacheKey || 'N/A'}`)
      console.log(`MUST INCLUDE: ${mustInclude.length > 0 ? mustInclude.join(', ') : 'NONE'}`)
      console.log(`FINAL PROMPT: ${prompt.substring(0, 120)}...`)
      console.log(`FINAL PROMPT LENGTH: ${prompt.split(/\s+/).length} words / ${prompt.length} chars`)
      console.log(`==============================`)

      let imageUrl = ''

      try {
        if (setting) {
          let plateUrl: string

          // KEYFRAME CHECK: reuse plate only if EXACT same setting AND compatible must_includes.
          // "Compatible" = this page's key objects are a subset of the cached plate's objects.
          // If this page requires "rocket ship" but the cached plate was generated without it,
          // we must regenerate (the rocket won't be in the background).
          const cachedPlate = plateCache.get(cacheKey)
          const cachedMusts = plateMustIncludes.get(cacheKey) || []
          const KEY_OBJECTS = ['rocket ship', 'dolphins', 'lions', 'moon rabbits', 'rocket', 'waterfall', 'cave entrance']
          const missingKeyObjects = mustInclude.filter(item => {
            const lower = item.toLowerCase()
            return KEY_OBJECTS.some(k => lower.includes(k)) && !cachedMusts.some(c => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()))
          })
          const plateCompatible = cachedPlate && missingKeyObjects.length === 0

          if (plateCompatible) {
            plateUrl = cachedPlate
            plateUrls.push(plateUrl)
            console.log(`[PLATE REUSE] Exact setting + compatible must_includes — skipping plate generation`)
          } else {
            if (cachedPlate && missingKeyObjects.length > 0) {
              console.log(`[PLATE REGEN] Same setting but missing key objects: [${missingKeyObjects.join(', ')}] — generating new plate`)
            }
            // ===== NEW PLATE: Generate scene plate for this setting =====
            const scenePrompt = buildSceneOnlyPrompt(setting, mustInclude)
            plateUrl = await generateScenePlate(replicate, scenePrompt, pageSeed, i)
            plateUrls.push(plateUrl)
            plateCache.set(cacheKey, plateUrl)
            plateMustIncludes.set(cacheKey, mustInclude)
            totalApiCalls++

            // Delay between Replicate calls
            console.log(`Waiting ${BASE_DELAY_BETWEEN_IMAGES / 1000}s before final pass...`)
            await sleep(BASE_DELAY_BETWEEN_IMAGES)
          }

          // STEP 2: Add character to plate (img2img, plate as base)
          imageUrl = await generateImageWithAnchor(
            replicate,
            prompt,
            plateUrl,       // Scene plate as base image (cached or fresh)
            pageSeed,
            i,
            0.65,           // prompt_strength: character overrides plate (0.60 was too weak)
            setting,         // Setting context for sanitizer
            mustInclude      // Must-include items for negative sanitization
          )
          totalApiCalls++
        } else {
          // ===== FALLBACK: single-pass with anchor =====
          plateUrls.push('')  // No plate in single-pass mode
          imageUrl = await generateImageWithAnchor(
            replicate,
            prompt,
            characterAnchorUrl,
            pageSeed,
            i,
            0.80,
            '',              // No setting context
            mustInclude      // Must-include items for negative sanitization
          )
          totalApiCalls++
        }

        if (!imageUrl) {
          throw new Error(`Image generation failed for page ${i + 1}`)
        }

        // Download image immediately as base64 — prevents PDF 404s permanently
        const imageData = await downloadImageAsBase64(imageUrl)
        imageUrls.push(imageData)
        console.log(`Page ${i + 1} done: SUCCESS (${imageData.startsWith('data:') ? 'base64' : 'url'})`)
      } catch (error: any) {
        console.error(`Page ${i + 1} error: ${error.message}`)

        // If 2-pass failed, try fallback with anchor
        if (setting && characterAnchorUrl) {
          console.log(`[PAGE ${i + 1}] 2-pass failed, falling back to anchor img2img...`)
          try {
            await sleep(BASE_DELAY_BETWEEN_IMAGES)
            imageUrl = await generateImageWithAnchor(
              replicate,
              prompt,
              characterAnchorUrl,
              pageSeed,
              i,
              0.80,
              setting,
              mustInclude
            )
            totalApiCalls++
            if (imageUrl) {
              const imageData = await downloadImageAsBase64(imageUrl)
              imageUrls.push(imageData)
              console.log(`Page ${i + 1} fallback: SUCCESS (${imageData.startsWith('data:') ? 'base64' : 'url'})`)
              continue
            }
          } catch (fallbackError: any) {
            console.error(`Page ${i + 1} fallback also failed: ${fallbackError.message}`)
          }
        }

        imageUrls.push('') // Push empty string for failed images
      }

      // Delay between pages
      if (i < imagePrompts.length - 1) {
        console.log(`Waiting ${BASE_DELAY_BETWEEN_IMAGES / 1000}s before next page...`)
        await sleep(BASE_DELAY_BETWEEN_IMAGES)
      }
    }

    console.log(`\n[KEYFRAME STATS] Plate cache: ${plateCache.size} unique plates for ${imagePrompts.length} pages`)
    console.log(`[KEYFRAME STATS] Total API calls: ${totalApiCalls} (vs ${imagePrompts.length * 2} without cache)`)

    // No batch URL probe needed — images are downloaded as base64 immediately
    // after generation, so PDF never fetches remote URLs.

    const successCount = imageUrls.filter(url => url).length
    const base64Count = imageUrls.filter(url => url && url.startsWith('data:')).length
    const failedIndices = imageUrls
      .map((url, index) => (!url ? index : -1))
      .filter(index => index !== -1)

    console.log(`\n========== IMAGE GENERATION COMPLETE ==========`)
    console.log(`Success: ${successCount}/${imagePrompts.length} images (${base64Count} as base64)`)
    console.log(`Pipeline: ${has2PassPipeline ? '2-PASS KEYFRAME' : 'SINGLE-PASS'}`)
    console.log(`BASE SEED: ${baseSeed}`)
    if (failedIndices.length > 0) {
      console.log(`Failed pages: ${failedIndices.map(i => i + 1).join(', ')}`)
    }
    console.log(`==============================================\n`)

    return NextResponse.json({
      imageUrls,
      plateUrls,  // Debug: inspect plates to verify scene backgrounds
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
