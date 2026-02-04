import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Helper function to sleep/delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper function to generate a single image with retry logic
async function generateImageWithRetry(
  replicate: Replicate,
  prompt: string,
  customNegativePrompt: string | undefined,
  imageIndex: number,
  imagePromptsLength: number,
  seed: number,
  maxRetries = 4
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
          // Use the prompt as-is - it's already structured properly
          const cleanPrompt = prompt

          // Use passed negative prompt OR fallback to default
          // CRITICAL: Block humans AND ALL common wrong animals that SDXL substitutes
          const negativePrompt = customNegativePrompt ||
            `human, person, child, boy, girl, man, woman, people, face, portrait, chicken, rooster, hen, bird, fox, cat, dog, bunny, rabbit, dragon, furry, feathers, beak, wings, text, watermark, logo, realistic, photorealistic, 3D render, anime`

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
            guidance_scale: 7.5,
            num_inference_steps: 30
          }, null, 2))
          console.log(`===================================\n`)

          // Use standard SDXL - HIGH QUALITY settings for correct character
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
                num_inference_steps: 30,   // Higher for better prompt following
                guidance_scale: 7.5,       // Strong prompt adherence
                seed: seed,
              }
            }
          )

          // Handle output - SDXL returns array of URLs
          // Log raw output for debugging
          console.log(`[IMAGE ${imageIndex + 1}] Raw output type: ${typeof output}, isArray: ${Array.isArray(output)}`)
          if (Array.isArray(output)) {
            console.log(`[IMAGE ${imageIndex + 1}] Array length: ${output.length}, first element type: ${typeof output[0]}`)
            if (output[0]) console.log(`[IMAGE ${imageIndex + 1}] First element preview: ${String(output[0]).substring(0, 100)}`)
          }

          let imageUrl = ''

          // Robust output normalization - handle all Replicate output formats
          // CRITICAL: Replicate SDK returns FileOutput objects with toString() method
          // We must ALWAYS convert to string before using
          if (Array.isArray(output) && output.length > 0) {
            const firstOutput = output[0]
            // ALWAYS convert to string first - FileOutput has toString() that returns URL
            const urlStr = String(firstOutput)
            if (urlStr && urlStr.startsWith('http')) {
              imageUrl = urlStr
            } else if (typeof firstOutput === 'object' && firstOutput !== null) {
              // Fallback: Try common URL properties
              const fo = firstOutput as any
              const possibleUrl = fo.url || fo.output || fo.href
              if (possibleUrl) {
                imageUrl = String(possibleUrl)
              }
            }
          } else if (typeof output === 'string') {
            imageUrl = output
          } else if (output && typeof output === 'object') {
            // Handle object with URL property or toString()
            const urlStr = String(output)
            if (urlStr && urlStr.startsWith('http')) {
              imageUrl = urlStr
            } else {
              const possibleUrl = (output as any).url || (output as any).output
              if (possibleUrl) {
                imageUrl = String(possibleUrl)
              }
            }
          }

          console.log(`[IMAGE ${imageIndex + 1}] Extracted URL: ${imageUrl ? imageUrl.substring(0, 80) + '...' : 'EMPTY'}`)

          if (imageUrl && imageUrl.startsWith('http')) {
            return imageUrl
          } else {
            console.log(`[IMAGE ${imageIndex + 1}] Invalid URL, returning empty`)
            return ''
          }
      } catch (error: any) {
        const errorMsg = error.message || String(error)
        const is429 = errorMsg.includes('429') || errorMsg.includes('Too Many Requests')
        const isRateLimit = errorMsg.includes('rate limit') || is429
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')
        const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')

        console.error(`Image ${imageIndex + 1} attempt ${attempt} failed:`, errorMsg.substring(0, 200))

        if (attempt < maxRetries) {
          // Exponential backoff: 3s, 6s, 12s, 24s
          let waitTime = 3000 * Math.pow(2, attempt - 1)

          // Extra wait for rate limits
          if (isRateLimit) {
            waitTime = Math.max(waitTime, 8000 * attempt)
            console.log(`Rate limited, waiting ${waitTime}ms before retry...`)
          } else if (isServerError || isTimeout) {
            console.log(`Server error/timeout, waiting ${waitTime}ms before retry...`)
          } else {
            console.log(`Error on attempt ${attempt}, waiting ${waitTime}ms before retry...`)
          }

          await sleep(waitTime)
          continue
        } else {
          // Max retries reached
          console.log(`Max retries reached for image ${imageIndex + 1}, giving up`)
          return ''
        }
      }
    }
    return ''
}

export async function POST(request: NextRequest) {
  try {
    const { imagePrompts, negativePrompts, seed, seeds } = await request.json()

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
        // ENGINE RULE B: Use unique seed per page
        // If seeds array provided (from scene_id hash), use it; otherwise compute from base
        const pageSeed = seeds && seeds[i] ? seeds[i] : storySeed + (i * 77)
        usedSeeds.push(pageSeed)

        console.log(`Page ${i + 1} seed: ${pageSeed}`)
        console.log(`Setting: ${prompt.match(/Setting: (.+)/)?.[1]?.substring(0, 50) || 'N/A'}`)

        const imageUrl = await generateImageWithRetry(replicate, prompt, negativePrompt, i, imagePrompts.length, pageSeed)
        imageUrls.push(imageUrl)
        console.log(`Image ${i + 1} done: ${imageUrl ? 'SUCCESS' : 'FAILED'}`)
        console.log(`[ARRAY STATE] imageUrls.length = ${imageUrls.length}, non-empty count = ${imageUrls.filter(u => u).length}`)
      } catch (error) {
        console.error(`Image ${i + 1} error:`, error)
        imageUrls.push('') // Push empty string for failed images
      }

      // Delay between images to avoid rate limiting
      // Longer delay after failed images, shorter after successful ones
      if (i < imagePrompts.length - 1) {
        const delayMs = imageUrls[i] ? 2000 : 4000
        console.log(`Waiting ${delayMs}ms before next image...`)
        await sleep(delayMs)
      }
    }

    const successCount = imageUrls.filter(url => url).length
    console.log(`\n========== IMAGE GENERATION COMPLETE ==========`)
    console.log(`Success: ${successCount}/${imagePrompts.length} images`)
    console.log(`Seeds used: ${usedSeeds.join(', ')}`)
    console.log(`==============================================\n`)

    return NextResponse.json({ imageUrls, seed: storySeed, seeds: usedSeeds })
  } catch (error) {
    console.error('Error in image generation:', error)
    return NextResponse.json(
      { error: 'Failed to generate images' },
      { status: 500 }
    )
  }
}
