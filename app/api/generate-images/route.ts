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
  maxRetries = 2
): Promise<string> {
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
        const is429 = error.message?.includes('429') || error.message?.includes('Too Many Requests')
        const isRateLimit = error.message?.includes('rate limit') || is429

        if (isRateLimit && attempt < maxRetries) {
          // Wait for rate limits
          const waitTime = attempt === 1 ? 5000 : 10000
          console.log(`Rate limited, waiting ${waitTime}ms before retry...`)
          await sleep(waitTime)
          continue
        } else if (attempt < maxRetries) {
          // For other errors, quick retry
          console.log(`Error on attempt ${attempt}, retrying in 3s...`)
          await sleep(3000)
          continue
        } else {
          // Max retries reached
          console.log(`Max retries reached for image ${imageIndex + 1}`)
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
      } catch (error) {
        console.error(`Image ${i + 1} error:`, error)
        imageUrls.push('') // Push empty string for failed images
      }

      // Short delay between images
      if (i < imagePrompts.length - 1) {
        await sleep(1000)
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
