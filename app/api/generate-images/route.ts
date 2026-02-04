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

// Helper function to generate image with anchor reference (img2img)
async function generateImageWithAnchor(
  replicate: Replicate,
  prompt: string,
  negativePrompt: string | undefined,
  anchorUrl: string,
  seed: number,
  imageIndex: number,
  strength: number = 0.4  // 0.25-0.45 recommended for identity lock
): Promise<string> {
  const maxRetries = 3

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n--- img2img with anchor (attempt ${attempt}) ---`)
      console.log(`Anchor: ${anchorUrl.substring(0, 50)}...`)
      console.log(`Strength: ${strength}`)

      const output = await replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt,
            negative_prompt: negativePrompt || "text, watermark, ugly, deformed",
            image: anchorUrl,
            prompt_strength: strength,
            width: 1024,
            height: 1024,
            num_outputs: 1,
            scheduler: "K_EULER",
            num_inference_steps: 25,
            guidance_scale: 8,
            seed,
          }
        }
      )

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
    const { imagePrompts, negativePrompts, seed, seeds, characterAnchorUrl } = await request.json()

    if (!imagePrompts || !Array.isArray(imagePrompts)) {
      return NextResponse.json(
        { error: 'Invalid image prompts provided' },
        { status: 400 }
      )
    }

    const useAnchor = !!characterAnchorUrl
    console.log(`Character Anchor mode: ${useAnchor ? 'ENABLED' : 'DISABLED'}`)
    if (useAnchor) {
      console.log(`Anchor URL: ${characterAnchorUrl.substring(0, 60)}...`)
    }

    // Check if API key is configured
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'Replicate API token not configured' },
        { status: 500 }
      )
    }

    // Use provided seed or generate a random one for this story
    const storySeed = seed || Math.floor(Math.random() * 1000000)
    console.log(`Using base seed: ${storySeed}`)

    // Generate images ONE AT A TIME to avoid rate limits
    const imageUrls: string[] = []
    const usedSeeds: number[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      // Use page-specific negative prompt if available
      const negativePrompt = negativePrompts && negativePrompts[i] ? negativePrompts[i] : undefined
      console.log(`\n========== GENERATING IMAGE ${i + 1}/${imagePrompts.length} ==========`)

      try {
        // CRITICAL: Use ONE seed per story for character consistency
        const pageSeed = seeds && seeds[i] ? seeds[i] : storySeed
        usedSeeds.push(pageSeed)

        console.log(`Page ${i + 1} seed: ${pageSeed}`)

        let imageUrl: string

        if (useAnchor && characterAnchorUrl) {
          // USE CHARACTER ANCHOR (img2img) - guaranteed identity lock
          console.log(`Using Character Anchor for identity lock`)
          // Vary strength slightly per page (0.35-0.45) for natural variation while keeping identity
          const strength = 0.35 + (i * 0.01)  // Pages get slightly more variation
          imageUrl = await generateImageWithAnchor(
            replicate,
            prompt,
            negativePrompt,
            characterAnchorUrl,
            pageSeed,
            i,
            Math.min(strength, 0.45)  // Cap at 0.45
          )

          // If img2img fails, fall back to txt2img
          if (!imageUrl) {
            console.log(`Anchor-based generation failed, falling back to txt2img`)
            imageUrl = await generateImageWithRetry(replicate, prompt, negativePrompt, i, imagePrompts.length, pageSeed)
          }
        } else {
          // Standard txt2img (no anchor)
          imageUrl = await generateImageWithRetry(replicate, prompt, negativePrompt, i, imagePrompts.length, pageSeed)
        }

        imageUrls.push(imageUrl)
        console.log(`Image ${i + 1} done: ${imageUrl ? 'SUCCESS' : 'FAILED'}`)
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
    console.log(`Seeds used: ${usedSeeds.join(', ')}`)
    if (failedIndices.length > 0) {
      console.log(`Failed pages: ${failedIndices.map(i => i + 1).join(', ')}`)
    }
    console.log(`==============================================\n`)

    // Include failure information in the response
    return NextResponse.json({
      imageUrls,
      seed: storySeed,
      seeds: usedSeeds,
      success: successCount === imagePrompts.length,
      failedCount: failedIndices.length,
      failedPages: failedIndices.map(i => i + 1), // 1-indexed for user display
    })
  } catch (error) {
    console.error('Error in image generation:', error)
    return NextResponse.json(
      { error: 'Failed to generate images' },
      { status: 500 }
    )
  }
}
