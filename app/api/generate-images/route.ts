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
      console.log(`🎨 Generating image ${imageIndex + 1}/${imagePromptsLength} (attempt ${attempt}/${maxRetries})`)

          // EXTREMELY simplified prompt - just essential visual elements
          // Remove all complex descriptions that could be interpreted as text
          const simplePrompt = `watercolor painting ${prompt}`

          // Comprehensive negative prompt to block ALL forms of text
          const negativePrompt = `text, words, letters, numbers, writing, typography, alphabet, characters, symbols, signs, labels, captions, subtitles, titles, watermarks, signatures, handwriting, calligraphy, fonts, glyphs, script, language, speech bubbles, dialogue, quotes, books with visible pages, newspapers, posters with text, readable content, legible text, any written language`

          console.log('📝 Simple prompt:', simplePrompt)
          console.log('🚫 Comprehensive negative prompt:', negativePrompt.substring(0, 100) + '...')

          const output = await replicate.run(
            "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
            {
              input: {
                prompt: simplePrompt,
                negative_prompt: negativePrompt,
                width: 1024,
                height: 1024,
                num_outputs: 1,
                scheduler: "K_EULER",
                num_inference_steps: 30,
                guidance_scale: 8.5,
                refine: "expert_ensemble_refiner",
                high_noise_frac: 0.8
              }
            }
          )

          console.log(`🔍 Raw output from Replicate:`, typeof output, Array.isArray(output), output)

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
                console.error('Error reading stream:', e)
              }
            }
          } else if (typeof output === 'string') {
            imageUrl = output
          }

          console.log(`🔍 Processed image URL:`, imageUrl)

          if (imageUrl && imageUrl.startsWith('http')) {
            console.log(`✅ Image ${imageIndex + 1} generated successfully:`, imageUrl.substring(0, 80) + '...')
          return imageUrl
        } else {
          console.error(`❌ No valid URL for image ${imageIndex + 1}`)
          return ''
        }
      } catch (error: any) {
        const is429 = error.message?.includes('429') || error.message?.includes('Too Many Requests')
        const isRateLimit = error.message?.includes('rate limit') || is429

        console.error(`❌ Error generating image ${imageIndex + 1} (attempt ${attempt}):`, error.message)

        if (isRateLimit && attempt < maxRetries) {
          // Wait longer for rate limits - use exponential backoff
          const waitTime = attempt === 1 ? 5000 : attempt === 2 ? 10000 : 15000
          console.log(`⏳ Rate limited. Waiting ${waitTime/1000} seconds before retry...`)
          await sleep(waitTime)
          continue
        } else if (attempt < maxRetries) {
          // For other errors, wait a bit before retry
          console.log(`⏳ Waiting 3 seconds before retry...`)
          await sleep(3000)
          continue
        } else {
          // Max retries reached
          console.error(`❌ Failed to generate image ${imageIndex + 1} after ${maxRetries} attempts`)
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
      console.error('❌ REPLICATE_API_TOKEN is not set in environment variables')
      return NextResponse.json(
        { error: 'Replicate API token not configured' },
        { status: 500 }
      )
    }

    console.log('✅ Replicate API Token found, generating', imagePrompts.length, 'images with SDXL')

    // Generate images for each prompt using Replicate FLUX with delays between requests
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      console.log('Prompt:', prompt.substring(0, 100) + '...')

      // Generate image with retry logic
      const imageUrl = await generateImageWithRetry(replicate, prompt, i, imagePrompts.length)
      imageUrls.push(imageUrl)

      // Add delay between image generations to avoid rate limits (except after last image)
      if (i < imagePrompts.length - 1) {
        console.log('⏳ Waiting 3 seconds before next image to avoid rate limits...')
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
