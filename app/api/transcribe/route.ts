import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Lazy-initialized OpenAI client (avoids build-time errors when OPENAI_API_KEY is not set)
let openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openai
}

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
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      prompt: 'This is a child telling a story idea. They may speak quickly or unclearly. Common words: story, adventure, magic, princess, dragon, unicorn, bunny, bear, forest, castle, rainbow, friends, happy, brave, little, big, scary, funny, silly, play, find, help, save, love.',
    })

    return NextResponse.json({
      text: transcription.text,
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe audio' },
      { status: 500 }
    )
  }
}
