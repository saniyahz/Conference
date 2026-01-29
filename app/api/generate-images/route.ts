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
  maxRetries = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
          // Use FLUX 1.1 Pro for best quality and control
          // Prepend strong no-text instruction - FLUX doesn't support --no syntax
          const cleanPrompt = `Children's book illustration without any text, letters, words, or writing. Pure visual artwork only. ${prompt}. Digital painting style, vibrant colors, no typography, no captions, no watermarks.`

          const output = await replicate.run(
            "black-forest-labs/flux-1.1-pro",
            {
              input: {
                prompt: cleanPrompt,
                aspect_ratio: "1:1",
                output_format: "png",
                output_quality: 90,
                safety_tolerance: 2,
                prompt_upsampling: true
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

    // Generate images for each prompt using Replicate FLUX with delays between requests
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]

      // Generate image with retry logic
      const imageUrl = await generateImageWithRetry(replicate, prompt, i, imagePrompts.length)
      imageUrls.push(imageUrl)

      // Add delay between image generations to avoid rate limits (except after last image)
      if (i < imagePrompts.length - 1) {
        await sleep(3000)
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
