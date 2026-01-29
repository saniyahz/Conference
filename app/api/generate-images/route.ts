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
  imageIndex: number,
  imagePromptsLength: number,
  maxRetries = 2
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
          // Use Stable Diffusion XL - optimized for speed
          const cleanPrompt = `${prompt}, children's book illustration, soft watercolor style, vibrant colors, whimsical, kid-friendly, pure visual artwork`

          // Strong negative prompt to prevent ANY text
          const negativePrompt = `text, words, letters, writing, caption, label, watermark, signature, logo, typography, font, numbers`

          const output = await replicate.run(
            "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
            {
              input: {
                prompt: cleanPrompt,
                negative_prompt: negativePrompt,
                width: 768,
                height: 768,
                num_outputs: 1,
                scheduler: "K_EULER",
                num_inference_steps: 20,
                guidance_scale: 7.5
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
          // Wait longer for rate limits - use exponential backoff
          const waitTime = attempt === 1 ? 5000 : attempt === 2 ? 10000 : 15000
          await sleep(waitTime)
          continue
        } else if (attempt < maxRetries) {
          // For other errors, wait a bit before retry
          await sleep(3000)
          continue
        } else {
          // Max retries reached
          return ''
        }
      }
    }
    return ''
}

export async function POST(request: NextRequest) {
  try {
    const { imagePrompts } = await request.json()

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

    // Generate images in parallel batches of 3 for speed
    const imageUrls: string[] = new Array(imagePrompts.length).fill('')
    const batchSize = 3

    for (let i = 0; i < imagePrompts.length; i += batchSize) {
      const batch = imagePrompts.slice(i, i + batchSize)
      const batchPromises = batch.map((prompt, idx) =>
        generateImageWithRetry(replicate, prompt, i + idx, imagePrompts.length)
      )

      const batchResults = await Promise.all(batchPromises)
      batchResults.forEach((url, idx) => {
        imageUrls[i + idx] = url
      })

      // Small delay between batches to avoid rate limits
      if (i + batchSize < imagePrompts.length) {
        await sleep(2000)
      }
    }

    return NextResponse.json({ imageUrls })
  } catch (error) {
    console.error('Error in image generation:', error)
    return NextResponse.json(
      { error: 'Failed to generate images' },
      { status: 500 }
    )
  }
}
