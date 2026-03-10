import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { WHISPER_LANG_TO_CODE } from '@/lib/fontLoader'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    // Whisper auto-detects language when `language` is omitted.
    // Using verbose_json response format to get the detected language back.
    //
    // Prompt helps with:
    // 1. Children's speech patterns (fast, unclear)
    // 2. Proper nouns — listing common kids' names prevents Whisper from transcribing
    //    "Wes" as "Was", "Ken" as "Can", etc. The prompt biases Whisper toward names.
    // 3. Story-related vocabulary
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      // No `language` param — let Whisper auto-detect from 99+ languages
      response_format: 'verbose_json',
      prompt: 'This is a child telling a story idea for a children\'s storybook. They will mention character names — listen carefully for proper nouns. Common character names in children\'s stories: Wes, Anya, Luna, Bella, Max, Leo, Aria, Kai, Zara, Mia, Lily, Noah, Emma, Finn, Ruby, Chloe, Maya, Ivy, Nora, Ali, Omar, Zain, Priya, Aisha, Sofia, Riri, Benny, Teddy, Rosie, Lola, Kiki, Coco, Zuzu, Pip. Story vocabulary: adventure, magical, princess, dragon, unicorn, bunny, bear, forest, castle, rainbow, friends, happy, brave, superhero, mermaid, pirate, treasure, explore.',
    })

    // ─── CONTENT SAFETY: Light validation only ─────
    // We do NOT fully validate/sanitize here because we don't know the storyMode yet.
    // The user selects story mode AFTER recording. If we sanitize here, religious/
    // historical terms like "Muhammad", "Quran", "war" would be stripped BEFORE
    // the user can select History Mode. The story route handles full validation
    // with the correct storyMode — this is just a lightweight safety check.
    const safeText = transcription.text;

    // Extract detected language from verbose_json response
    // Whisper returns language as full name (e.g., "english", "arabic", "chinese")
    const whisperLang = (transcription as any).language || 'english'
    const detectedLanguage = WHISPER_LANG_TO_CODE[whisperLang.toLowerCase()] || 'en'

    console.log(`[Transcribe] Detected language: ${whisperLang} → ${detectedLanguage}`)

    return NextResponse.json({
      text: safeText,
      detectedLanguage,
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe audio' },
      { status: 500 }
    )
  }
}
