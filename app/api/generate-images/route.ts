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
const SDXL_MODEL = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b"

// Helper function to generate image with anchor reference (img2img)
// This is the PRIMARY method for character consistency
async function generateImageWithAnchor(
  replicate: Replicate,
  prompt: string,
  negativePrompt: string | undefined,
  anchorUrl: string,
  seed: number,
  imageIndex: number
): Promise<string> {
  const maxRetries = 3
  // FIXED: Use constant prompt_strength for all pages (no variation)
  const PROMPT_STRENGTH = 0.35

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Build ONE input object
      const input: any = {
        prompt,
        negative_prompt: negativePrompt || "text, watermark, ugly, deformed, human, person, child",
        width: 1024,
        height: 1024,
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 25,
        guidance_scale: 8,
        seed,  // SAME seed for all pages
      }

      // Add anchor for img2img
      input.image = anchorUrl
      input.prompt_strength = PROMPT_STRENGTH

      // EXPLICIT DEBUG LOGS - these must be present and unambiguous
      console.log(`\n========== IMG2IMG PAGE ${imageIndex + 1} (attempt ${attempt}) ==========`)
      console.log(`ANCHOR URL: ${anchorUrl}`)
      console.log(`PROMPT_STRENGTH: ${input.prompt_strength}`)
      console.log(`SEED: ${input.seed}`)
      console.log(`FINAL REPLICATE INPUT:`, JSON.stringify(input, null, 2))
      console.log(`================================================================\n`)

      const output = await replicate.run(SDXL_MODEL, { input })

      let imageUrl = ''
      if (Array.isArray(output) && output.length > 0) {
        const firstOutput = output[0]
        if (typeof firstOutput === 'string') {
          imageUrl = firstOutput
        }
      } else if (typeof output === 'string') {
        imageUrl = output
      }

      if (imageUrl && imageUrl.startsWith('http')) {
        console.log(`SUCCESS: Page ${imageIndex + 1} generated with anchor`)
        return imageUrl
      }
    } catch (error: any) {
      console.log(`img2img attempt ${attempt} failed:`, error.message?.substring(0, 100))
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

    // Use provided seed - SAME seed for ALL pages
    const baseSeed = seed || Math.floor(Math.random() * 1000000)

    console.log(`\n========== IMAGE GENERATION CONFIG ==========`)
    console.log(`CHARACTER ANCHOR MODE: ENABLED (required)`)
    console.log(`ANCHOR URL: ${characterAnchorUrl}`)
    console.log(`BASE SEED (same for all pages): ${baseSeed}`)
    console.log(`TOTAL PAGES: ${imagePrompts.length}`)
    console.log(`==============================================\n`)

    // Generate images ONE AT A TIME to avoid rate limits
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      const negativePrompt = negativePrompts && negativePrompts[i] ? negativePrompts[i] : undefined

      console.log(`\n========== GENERATING IMAGE ${i + 1}/${imagePrompts.length} ==========`)
      console.log(`SEED: ${baseSeed} (same for all pages)`)

      try {
        // ALWAYS use anchor-based img2img - NO FALLBACK to txt2img
        const imageUrl = await generateImageWithAnchor(
          replicate,
          prompt,
          negativePrompt,
          characterAnchorUrl,
          baseSeed,  // SAME seed for all pages
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
    console.log(`SEED USED (all pages): ${baseSeed}`)
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
