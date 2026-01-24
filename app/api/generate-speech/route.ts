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

    console.log('🔍 TTS output type:', typeof output, output)

    // Handle stream output - TTS might return a stream
    let audioUrl = ''

    if (output && typeof output === 'object') {
      // Check if it has an audio property
      if ('audio' in output && typeof (output as any).audio === 'string') {
        audioUrl = (output as any).audio
      } else if ('audio' in output && (output as any).audio) {
        // Try to read the stream
        try {
          const chunks: string[] = []
          for await (const chunk of (output as any).audio as any) {
            if (typeof chunk === 'string') {
              chunks.push(chunk)
            }
          }
          audioUrl = chunks.join('')
        } catch (e) {
          console.error('Error reading audio stream:', e)
        }
      } else {
        // The output itself might be a stream or the URL
        try {
          const chunks: string[] = []
          for await (const chunk of output as any) {
            if (typeof chunk === 'string') {
              chunks.push(chunk)
            } else if (chunk && typeof chunk === 'object' && 'audio' in chunk) {
              audioUrl = String(chunk.audio)
              break
            }
          }
          if (!audioUrl && chunks.length > 0) {
            audioUrl = chunks.join('')
          }
        } catch (e) {
          console.error('Error reading TTS stream:', e)
        }
      }
    } else if (typeof output === 'string') {
      audioUrl = output
    }

    console.log('🔍 Processed audio URL:', audioUrl?.substring(0, 80))

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
