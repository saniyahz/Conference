import { NextRequest, NextResponse } from 'next/server'

// OpenAI TTS voice mapping
const VOICE_MAP: { [key: string]: string } = {
  'mama_beaver': 'nova',      // Warm, friendly female voice
  'papa_beaver': 'onyx',      // Deep, comforting male voice
  'storyteller': 'fable',     // British, expressive voice
  'friendly': 'shimmer',      // Soft, gentle female voice
}

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 2000 // 2 seconds
const MAX_RETRY_DELAY = 16000 // 16 seconds

// Helper function to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper function to check if error is retryable
function isRetryableError(error: any): boolean {
  // Network errors (timeout, DNS issues, connection refused)
  if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') return true
  if (error.cause?.code === 'ENOTFOUND') return true
  if (error.cause?.code === 'ECONNREFUSED') return true
  if (error.cause?.code === 'ECONNRESET') return true
  if (error.cause?.code === 'ETIMEDOUT') return true
  if (error.message?.includes('fetch failed')) return true
  if (error.message?.includes('network')) return true
  return false
}

// Fetch with retry logic
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null
  let retryDelay = INITIAL_RETRY_DELAY

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      })
      return response
    } catch (error: any) {
      lastError = error
      console.error(`Speech generation attempt ${attempt + 1}/${retries + 1} failed:`, error.message || error)

      // Only retry on network errors
      if (attempt < retries && isRetryableError(error)) {
        console.log(`Retrying in ${retryDelay}ms...`)
        await delay(retryDelay)
        // Exponential backoff with jitter
        retryDelay = Math.min(retryDelay * 2 + Math.random() * 1000, MAX_RETRY_DELAY)
      } else {
        throw error
      }
    }
  }

  throw lastError
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text provided' },
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

    // Call OpenAI TTS API with retry logic
    const response = await fetchWithRetry('https://api.openai.com/v1/audio/speech', {
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
        speed: 0.9, // Slightly slower for kids
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI TTS error:', errorData)

      // Check for rate limiting
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited. Please try again in a moment.' },
          { status: 429 }
        )
      }

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

    // Provide more specific error messages
    if (isRetryableError(error)) {
      return NextResponse.json(
        { error: 'Network error connecting to speech service. Please check your internet connection and try again.' },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: `Failed to generate speech: ${error.message}` },
      { status: 500 }
    )
  }
}
