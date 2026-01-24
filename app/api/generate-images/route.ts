import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

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

    console.log('✅ Replicate API Token found, generating', imagePrompts.length, 'images with FLUX')

    // Helper function to sleep/delay
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Helper function to generate a single image with retry logic
    async function generateImageWithRetry(prompt: string, imageIndex: number, maxRetries = 3): Promise<string> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🎨 Generating image ${imageIndex + 1}/${imagePrompts.length} (attempt ${attempt}/${maxRetries})`)

          const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
              input: {
                prompt: prompt,
                num_outputs: 1,
                aspect_ratio: "1:1",
                output_format: "png",
                output_quality: 90,
              }
            }
          ) as string[]

          if (output && output.length > 0 && output[0]) {
            console.log(`✅ Image ${imageIndex + 1} generated successfully`)
            return output[0]
          } else {
            console.error(`❌ No output for image ${imageIndex + 1}`)
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

    // Generate images for each prompt using Replicate FLUX with delays between requests
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      console.log('Prompt:', prompt.substring(0, 100) + '...')

      // Generate image with retry logic
      const imageUrl = await generateImageWithRetry(prompt, i)
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
