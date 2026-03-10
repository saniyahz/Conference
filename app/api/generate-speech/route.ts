import { NextRequest, NextResponse } from 'next/server'
import { validateContent } from '@/lib/contentSafety'

// OpenAI TTS voice mapping
const VOICE_MAP: { [key: string]: string } = {
  'mama_beaver': 'nova',      // Warm, friendly female voice
  'papa_beaver': 'onyx',      // Deep, comforting male voice
  'storyteller': 'fable',     // British, expressive voice
  'friendly': 'shimmer',      // Soft, gentle female voice
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice, speed: requestedSpeed, storyMode = 'imagination' } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text provided' },
        { status: 400 }
      )
    }

    // ─── CONTENT SAFETY: Block unsafe text from being spoken ──────
    // This prevents malicious direct API calls from getting TTS to speak
    // inappropriate content. The story route already validates, but this
    // is defense-in-depth against direct endpoint abuse.
    // CRITICAL: Pass storyMode so history mode text (with religious/historical
    // terms like "Muhammad", "Quran", "Allah") doesn't get blocked.
    const validation = validateContent(text, storyMode);
    if (!validation.safe) {
      console.warn(`[SPEECH SAFETY] Blocked unsafe text: "${validation.matchedTerm}" (${validation.category})`);
      return NextResponse.json(
        { error: "This text contains content that isn't appropriate for a children's story app." },
        { status: 400 }
      )
    }

    // Check API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' },
        { status: 500 }
      )
    }

    // Map voice name to OpenAI voice
    const openaiVoice = VOICE_MAP[voice] || 'nova'

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: openaiVoice,
        response_format: 'mp3',
        speed: requestedSpeed || 1.0, // Normal speed
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI TTS error:', errorData)
      return NextResponse.json(
        { error: 'Failed to generate speech' },
        { status: 500 }
      )
    }

    // Get the audio data as a blob
    const audioBuffer = await response.arrayBuffer()

    // Return the audio directly as MP3
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })

  } catch (error: any) {
    console.error('Error generating speech:', error)
    return NextResponse.json(
      { error: `Failed to generate speech: ${error.message}` },
      { status: 500 }
    )
  }
}
