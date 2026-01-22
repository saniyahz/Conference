import { NextRequest, NextResponse } from 'next/server'
import { HfInference } from '@huggingface/inference'

const hf = new HfInference(process.env.HUGGING_FACE_API_KEY, {
  use_cache: false,
})

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid prompt provided' },
        { status: 400 }
      )
    }

    if (!process.env.HUGGING_FACE_API_KEY) {
      return NextResponse.json(
        { error: 'Hugging Face API key not configured' },
        { status: 500 }
      )
    }

    // Create a story prompt for the LLM
    const storyPrompt = `You are a creative children's story writer. Based on the following ideas from a child, write a short, engaging story for kids aged 5-10. The story should be:
- Age-appropriate and fun
- Have a clear beginning, middle, and end
- Be divided into exactly 4 pages
- Each page should be 2-3 sentences long
- Include a creative title

Format your response EXACTLY as follows:
TITLE: [Story Title]
PAGE 1: [First part of the story]
PAGE 2: [Second part of the story]
PAGE 3: [Third part of the story]
PAGE 4: [Final part of the story]

Child's ideas: ${prompt}

Write the story now:`

    // Use Mistral or another available model
    let storyText = ''

    try {
      // Try using Mistral-7B-Instruct
      const response = await hf.textGeneration({
        model: 'mistralai/Mistral-7B-Instruct-v0.2',
        inputs: storyPrompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.8,
          top_p: 0.95,
          return_full_text: false,
        },
      })

      storyText = response.generated_text
    } catch (error) {
      // Fallback to a simpler model if Mistral fails
      console.log('Mistral failed, trying fallback model')

      const response = await hf.textGeneration({
        model: 'google/flan-t5-large',
        inputs: storyPrompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.8,
        },
      })

      storyText = response.generated_text
    }

    // Parse the story
    const story = parseStory(storyText, prompt)

    // Generate images for each page
    const pagesWithImages = await Promise.all(
      story.pages.map(async (page, index) => {
        try {
          const imagePrompt = `children's book illustration, colorful, friendly, cartoon style: ${page.text.substring(0, 100)}`

          const imageBlob = await hf.textToImage({
            model: 'stabilityai/stable-diffusion-2-1',
            inputs: imagePrompt,
            parameters: {
              negative_prompt: 'scary, dark, violent, adult, realistic',
            },
          })

          // Convert blob to base64
          const arrayBuffer = await imageBlob.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          const imageUrl = `data:image/png;base64,${base64}`

          return {
            ...page,
            imageUrl,
          }
        } catch (error) {
          console.error(`Failed to generate image for page ${index + 1}:`, error)
          // Return page without image if generation fails
          return page
        }
      })
    )

    return NextResponse.json({
      story: {
        title: story.title,
        pages: pagesWithImages,
      },
    })
  } catch (error) {
    console.error('Error generating story:', error)
    return NextResponse.json(
      { error: 'Failed to generate story. Please try again.' },
      { status: 500 }
    )
  }
}

function parseStory(text: string, originalPrompt: string) {
  // Extract title
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|PAGE)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'My Amazing Story'

  // Extract pages
  const pages: { text: string }[] = []

  for (let i = 1; i <= 4; i++) {
    const pageRegex = new RegExp(`PAGE ${i}:\\s*(.+?)(?=PAGE ${i + 1}:|$)`, 'is')
    const pageMatch = text.match(pageRegex)

    if (pageMatch) {
      pages.push({ text: pageMatch[1].trim() })
    }
  }

  // Fallback if parsing fails - split the text into chunks
  if (pages.length === 0) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const sentencesPerPage = Math.ceil(sentences.length / 4)

    for (let i = 0; i < 4; i++) {
      const start = i * sentencesPerPage
      const end = start + sentencesPerPage
      const pageText = sentences.slice(start, end).join('. ') + '.'
      if (pageText.trim().length > 1) {
        pages.push({ text: pageText.trim() })
      }
    }
  }

  // If still no pages, create a simple story from the prompt
  if (pages.length === 0) {
    pages.push(
      { text: `Once upon a time, there was an adventure about ${originalPrompt}.` },
      { text: 'Amazing things started to happen, and everyone was excited!' },
      { text: 'The journey was full of surprises and wonderful moments.' },
      { text: 'And they all lived happily ever after. The End!' }
    )
  }

  // Ensure we have exactly 4 pages
  while (pages.length < 4) {
    pages.push({ text: 'And the adventure continued...' })
  }

  return {
    title,
    pages: pages.slice(0, 4),
  }
}
