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

    // Generate images for each prompt using Replicate FLUX
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      console.log(`🎨 Generating image ${i + 1}/${imagePrompts.length} with FLUX`)
      console.log('Prompt:', prompt.substring(0, 100) + '...')

      try {
        // Use FLUX Schnell - fast and great for children's book illustrations
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
          console.log(`✅ Image ${i + 1} generated successfully with FLUX`)
          imageUrls.push(output[0])
        } else {
          console.error(`❌ No output from FLUX for image ${i + 1}`)
          imageUrls.push('') // Empty string if generation fails
        }
      } catch (error: any) {
        console.error(`❌ Error generating image ${i + 1} with FLUX:`, error.message)
        if (error.response) {
          console.error('Error details:', JSON.stringify(error.response.data, null, 2))
        }
        console.error('Full error:', error)
        imageUrls.push('') // Continue with other images
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
