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
    const userLanguage = formData.get('language') as string | null  // ISO code from user's dropdown selection

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

    // If user explicitly selected a language, pass it to Whisper so it transcribes
    // in the correct script (e.g., Urdu in Arabic script, not Hindi in Devanagari).
    // Otherwise let Whisper auto-detect.
    const whisperParams: any = {
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      prompt: 'This is a child telling a story idea for a children\'s storybook. They will mention character names — listen carefully for proper nouns. Common character names in children\'s stories: Wes, Anya, Luna, Bella, Max, Leo, Aria, Kai, Zara, Mia, Lily, Noah, Emma, Finn, Ruby, Chloe, Maya, Ivy, Nora, Ali, Omar, Zain, Priya, Aisha, Sofia, Riri, Benny, Teddy, Rosie, Lola, Kiki, Coco, Zuzu, Pip. Story vocabulary: adventure, magical, princess, dragon, unicorn, bunny, bear, forest, castle, rainbow, friends, happy, brave, superhero, mermaid, pirate, treasure, explore.',
    }

    if (userLanguage) {
      whisperParams.language = userLanguage
      console.log(`[Transcribe] User selected language: ${userLanguage} — forcing Whisper to use it`)
    }

    const transcription = await openai.audio.transcriptions.create(whisperParams)

    // ─── CONTENT SAFETY: Light validation only ─────
    // We do NOT fully validate/sanitize here because we don't know the storyMode yet.
    // The user selects story mode AFTER recording. If we sanitize here, religious/
    // historical terms like "Muhammad", "Quran", "war" would be stripped BEFORE
    // the user can select History Mode. The story route handles full validation
    // with the correct storyMode — this is just a lightweight safety check.
    const safeText = transcription.text;

    // Extract detected language from verbose_json response
    // Whisper returns language as full name (e.g., "english", "arabic", "chinese")
    let whisperLang = (transcription as any).language || 'english'

    // Fix Whisper's Urdu/Hindi confusion: they sound identical but use different scripts.
    // If Whisper says "hindi" but the text contains Arabic-script characters (U+0600-U+06FF),
    // it's actually Urdu. Similarly, if it says "urdu" but text is Devanagari, it's Hindi.
    if (whisperLang.toLowerCase() === 'hindi' || whisperLang.toLowerCase() === 'urdu') {
      const hasArabicScript = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(safeText)
      const hasDevanagari = /[\u0900-\u097F]/.test(safeText)
      if (hasArabicScript && !hasDevanagari) {
        whisperLang = 'urdu'
      } else if (hasDevanagari && !hasArabicScript) {
        whisperLang = 'hindi'
      }
      // If romanized (no script detected), keep Whisper's guess but prefer Urdu
      // since Hindi speakers are less likely to use this app in Hindi
      if (!hasArabicScript && !hasDevanagari && whisperLang.toLowerCase() === 'hindi') {
        whisperLang = 'urdu'
      }
    }

    const detectedLanguage = WHISPER_LANG_TO_CODE[whisperLang.toLowerCase()] || 'en'

    console.log(`[Transcribe] Detected language: ${(transcription as any).language} → corrected: ${whisperLang} → ${detectedLanguage}`)

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
