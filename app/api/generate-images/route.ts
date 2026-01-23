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

    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY is not set in environment variables')
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    console.log('✅ OpenAI API Key found, generating', imagePrompts.length, 'images')

    // Generate images for each prompt using DALL-E 3
    const imageUrls: string[] = []

    for (let i = 0; i < imagePrompts.length; i++) {
      const prompt = imagePrompts[i]
      console.log(`🎨 Generating image ${i + 1}/${imagePrompts.length}`)
      console.log('Prompt length:', prompt.length, 'characters')

      try {
        // DALL-E 3 has a max prompt length of 4000 characters
        const truncatedPrompt = prompt.length > 3900 ? prompt.substring(0, 3900) : prompt

        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: truncatedPrompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid', // More detailed and hyper-real
        })

        if (response.data && response.data[0].url) {
          console.log(`✅ Image ${i + 1} generated successfully`)
          imageUrls.push(response.data[0].url)
        } else {
          console.error(`❌ No URL in response for image ${i + 1}`)
          imageUrls.push('') // Empty string if generation fails
        }
      } catch (error: any) {
        console.error(`❌ Error generating image ${i + 1}:`, error.message)
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
