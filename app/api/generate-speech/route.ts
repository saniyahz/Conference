import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export async function POST(request: NextRequest) {
  try {
    const { text, voice } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text provided' },
        { status: 400 }
      )
    }

    console.log('🔊 Generating speech with Replicate TTS')
    console.log('Voice:', voice || 'default')
    console.log('Text length:', text.length, 'characters')

    // Use Replicate's high-quality text-to-speech model
    // Using Parler TTS - excellent quality, multiple voices
    const output = await replicate.run(
      "parler-tts/parler-tts-expresso:b05af55cffd8bb7c92a35cf3f71e86d4a25f97bcb8c98f3d2e3adb9b5a2e6f8e",
      {
        input: {
          text: text,
          description: voice || "A warm, friendly, gentle female voice perfect for children's stories, speaking slowly and clearly with expression and enthusiasm",
        }
      }
    ) as { audio: string }

    if (output && output.audio) {
      console.log('✅ Speech generated successfully')
      return NextResponse.json({ audioUrl: output.audio })
    } else {
      console.error('❌ No audio output from TTS')
      return NextResponse.json(
        { error: 'Failed to generate speech' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Error generating speech:', error)
    console.error('Error details:', error.message)
    if (error.response) {
      console.error('API response:', error.response)
    }
    return NextResponse.json(
      { error: `Failed to generate speech: ${error.message}` },
      { status: 500 }
    )
  }
}
