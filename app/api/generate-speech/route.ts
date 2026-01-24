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
    )

    console.log('🔍 TTS output type:', typeof output)
    console.log('🔍 TTS output is array?:', Array.isArray(output))

    // Try to extract URL - Replicate usually returns a string URL or an object that converts to URL
    let audioUrl = ''

    // Most common case: output is already a string URL
    if (typeof output === 'string') {
      audioUrl = output
      console.log('✓ Got direct string URL')
    }
    // Array of URLs (take first one)
    else if (Array.isArray(output) && output.length > 0) {
      audioUrl = String(output[0])
      console.log('✓ Got URL from array')
    }
    // Object - try converting to string
    else if (output && typeof output === 'object') {
      // FileOutput objects have a toString() that returns the URL
      audioUrl = String(output)
      console.log('✓ Got URL from object toString()')
    }

    console.log('🔍 Final audio URL:', audioUrl)

    if (audioUrl && audioUrl.startsWith('http')) {
      console.log('✅ Speech generated successfully')
      return NextResponse.json({ audioUrl })
    } else {
      console.error('❌ Could not extract valid URL from output')
      console.error('❌ Output details:', {
        type: typeof output,
        isArray: Array.isArray(output),
        keys: output && typeof output === 'object' ? Object.keys(output) : [],
        stringValue: String(output)
      })
      return NextResponse.json(
        { error: 'Failed to extract audio URL from TTS response' },
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
