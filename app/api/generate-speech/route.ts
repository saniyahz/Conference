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

    console.log('🔍 TTS raw output:', JSON.stringify(output, null, 2))
    console.log('🔍 TTS output type:', typeof output)
    console.log('🔍 TTS output constructor:', output?.constructor?.name)

    // Replicate typically returns FileOutput objects for audio
    // These can be URLs (strings) or FileOutput objects with a url() method
    let audioUrl = ''

    try {
      // Case 1: Output is a direct string URL
      if (typeof output === 'string') {
        console.log('✓ Output is direct string URL')
        audioUrl = output
      }
      // Case 2: Output is an object with toString() that gives URL
      else if (output && typeof output === 'object') {
        // Try getting URL from toString() method (common for FileOutput)
        const stringOutput = String(output)
        console.log('✓ String conversion:', stringOutput)
        if (stringOutput.startsWith('http')) {
          audioUrl = stringOutput
        }
        // Try accessing .url property or method
        else if ('url' in output) {
          const urlProp = (output as any).url
          audioUrl = typeof urlProp === 'function' ? urlProp() : urlProp
          console.log('✓ Got URL from .url property/method:', audioUrl)
        }
        // Try direct property access
        else if ('audio' in output) {
          audioUrl = String((output as any).audio)
          console.log('✓ Got URL from .audio property:', audioUrl)
        }
      }

      // Final validation
      if (!audioUrl || !audioUrl.startsWith('http')) {
        console.error('❌ Could not extract valid URL from output')
        console.error('Raw output:', output)
        throw new Error('Invalid audio URL format from TTS model')
      }
    } catch (e) {
      console.error('Error processing TTS output:', e)
      throw e
    }

    console.log('🔍 Final audio URL:', audioUrl?.substring(0, 100))

    if (audioUrl && audioUrl.startsWith('http')) {
      console.log('✅ Speech generated successfully')
      return NextResponse.json({ audioUrl })
    } else {
      console.error('❌ No valid audio URL from TTS')
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
