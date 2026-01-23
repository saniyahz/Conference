import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

    // Generate images for each prompt using DALL-E 3
    const imageUrls: string[] = []

    for (const prompt of imagePrompts) {
      try {
        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid', // More detailed and hyper-real
        })

        if (response.data && response.data[0].url) {
          imageUrls.push(response.data[0].url)
        } else {
          imageUrls.push('') // Empty string if generation fails
        }
      } catch (error) {
        console.error('Error generating image:', error)
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
