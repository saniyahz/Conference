import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { validateContent, sanitizeText } from '@/lib/contentSafety'

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

    // Convert File to the format OpenAI expects
    // Whisper prompt helps with:
    // 1. Children's speech patterns (fast, unclear)
    // 2. Proper nouns — listing common kids' names prevents Whisper from transcribing
    //    "Wes" as "Was", "Ken" as "Can", etc. The prompt biases Whisper toward names.
    // 3. Story-related vocabulary
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      prompt: 'This is a child telling a story idea for a children\'s storybook. They will mention character names — listen carefully for proper nouns. Common character names in children\'s stories: Wes, Anya, Luna, Bella, Max, Leo, Aria, Kai, Zara, Mia, Lily, Noah, Emma, Finn, Ruby, Chloe, Maya, Ivy, Nora, Ali, Omar, Zain, Priya, Aisha, Sofia, Riri, Benny, Teddy, Rosie, Lola, Kiki, Coco, Zuzu, Pip. Story vocabulary: adventure, magical, princess, dragon, unicorn, bunny, bear, forest, castle, rainbow, friends, happy, brave, superhero, mermaid, pirate, treasure, explore.',
    })

    // ─── CONTENT SAFETY: Validate and sanitize transcribed text ─────
    // Children may accidentally say blocked words, or Whisper may mis-transcribe
    // innocuous speech as inappropriate words. Sanitize before returning.
    let safeText = transcription.text;

    // Check for hard-blocked content
    const validation = validateContent(safeText);
    if (!validation.safe) {
      console.warn(`[TRANSCRIBE SAFETY] Blocked content in transcription: "${validation.matchedTerm}" (${validation.category})`);
      // Don't reject — sanitize and return what we can. The story route will
      // also validate, providing a second layer of defense.
    }

    // Soft-sanitize sensitive terms (death → gentle alternatives)
    const { cleaned, modifications } = sanitizeText(safeText);
    if (modifications.length > 0) {
      console.log(`[TRANSCRIBE SAFETY] Sanitized ${modifications.length} terms in transcription`);
      safeText = cleaned;
    }

    return NextResponse.json({
      text: safeText,
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe audio' },
      { status: 500 }
    )
  }
}
