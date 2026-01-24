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

    // Use default voice if not provided
    const speakerPreset = voice || 'v2/en_speaker_6'

    // Check API token
    if (!process.env.REPLICATE_API_TOKEN) {
      console.error('❌ REPLICATE_API_TOKEN not set')
      return NextResponse.json(
        { error: 'Replicate API token not configured. Please set REPLICATE_API_TOKEN environment variable.' },
        { status: 500 }
      )
    }

    console.log('🔊 Generating speech with Replicate TTS')
    console.log('Voice preset:', speakerPreset)
    console.log('Text length:', text.length, 'characters')
    console.log('Text preview:', text.substring(0, 100) + '...')

    // Limit text length to avoid timeouts
    const maxLength = 500
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text

    if (text.length > maxLength) {
      console.log(`⚠️  Text truncated from ${text.length} to ${maxLength} characters for better TTS performance`)
    }

    console.log('🚀 Calling Replicate API...')

    // Use Bark - a reliable, high-quality TTS model
    const output = await replicate.run(
      "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787",
      {
        input: {
          prompt: truncatedText,
          text_temp: 0.7,
          waveform_temp: 0.7,
          output_full: false
        }
      }
    )

    console.log('✅ Replicate API call completed')

    console.log('🔍 TTS output type:', typeof output)
    console.log('🔍 TTS output is array?:', Array.isArray(output))
    console.log('🔍 TTS raw output:', output)

    // Try to extract URL - Bark returns a FileOutput object or URL string
    let audioUrl = ''

    // Case 1: Direct string URL
    if (typeof output === 'string') {
      audioUrl = output
      console.log('✓ Got direct string URL')
    }
    // Case 2: Array of URLs or FileOutput objects
    else if (Array.isArray(output) && output.length > 0) {
      const firstItem = output[0]
      // Try toString() on the first item
      audioUrl = String(firstItem)
      console.log('✓ Got URL from array:', audioUrl)
    }
    // Case 3: FileOutput object - has toString() that returns the URL
    else if (output && typeof output === 'object') {
      // FileOutput objects convert to URL via toString()
      audioUrl = String(output)
      console.log('✓ Got URL from FileOutput object:', audioUrl)

      // Fallback: check for common properties
      if (!audioUrl.startsWith('http')) {
        if ('url' in output) {
          audioUrl = String((output as any).url)
          console.log('✓ Got URL from .url property:', audioUrl)
        } else if ('audio_out' in output) {
          audioUrl = String((output as any).audio_out)
          console.log('✓ Got URL from .audio_out property:', audioUrl)
        }
      }
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
