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

    // Handle different output formats from Replicate
    let audioUrl = ''

    try {
      // Case 1: Output is a direct string URL
      if (typeof output === 'string') {
        audioUrl = output
      }
      // Case 2: Output is an async iterable (stream)
      else if (output && typeof output === 'object' && Symbol.asyncIterator in output) {
        console.log('📡 Reading TTS stream...')
        const chunks: string[] = []
        for await (const chunk of output as any) {
          if (typeof chunk === 'string' && chunk.startsWith('http')) {
            // Found the URL directly in the stream
            audioUrl = chunk
            break
          } else if (typeof chunk === 'string') {
            chunks.push(chunk)
          }
        }
        // If we collected chunks, join them
        if (!audioUrl && chunks.length > 0) {
          audioUrl = chunks.join('')
        }
      }
      // Case 3: Output is an array with URL
      else if (Array.isArray(output) && output.length > 0) {
        audioUrl = typeof output[0] === 'string' ? output[0] : String(output[0])
      }
      // Case 4: Output is an object with audio property
      else if (output && typeof output === 'object' && 'audio' in output) {
        const audio = (output as any).audio
        if (typeof audio === 'string') {
          audioUrl = audio
        } else if (audio && Symbol.asyncIterator in audio) {
          // Audio property is a stream
          for await (const chunk of audio as any) {
            if (typeof chunk === 'string' && chunk.startsWith('http')) {
              audioUrl = chunk
              break
            }
          }
        }
      }
    } catch (e) {
      console.error('Error processing TTS output:', e)
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
