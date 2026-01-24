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

    console.log('🔊 Generating speech with Replicate TTS (Suno Bark)')
    console.log('Voice:', voice || 'default')
    console.log('Text length:', text.length, 'characters')

    // Limit text length to avoid timeouts (Bark works best with shorter text)
    const maxLength = 200
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text

    if (text.length > maxLength) {
      console.log(`⚠️  Text truncated from ${text.length} to ${maxLength} characters for better TTS performance`)
    }

    // Use Suno Bark - simpler and more reliable than Parler TTS
    // It uses speaker presets instead of voice descriptions
    const output = await replicate.run(
      "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787",
      {
        input: {
          prompt: truncatedText,
          text_temp: 0.7,
          waveform_temp: 0.7,
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
