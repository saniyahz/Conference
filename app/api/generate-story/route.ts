import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid prompt provided' },
        { status: 400 }
      )
    }

    // Create an enhanced story - longer and more engaging
    const storyText = generateEnhancedStory(prompt)

    // Parse the story
    const story = parseStory(storyText, prompt)

    // For now, return story without images since Stable Diffusion API is deprecated
    // You can integrate with a paid service like DALL-E or Midjourney for production
    return NextResponse.json({
      story: {
        title: story.title,
        pages: story.pages,
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

function generateEnhancedStory(prompt: string): string {
  // Enhanced story templates with much better narratives
  const templates = [
    {
      title: `The Magical Adventure of ${capitalize(prompt)}`,
      pages: [
        `Once upon a time, in a land filled with wonder and magic, there lived ${prompt}. Every morning, when the sun rose over the sparkling mountains, something extraordinary would happen. The birds would sing special songs, and the flowers would bloom in colors never seen before.`,
        `One beautiful day, ${prompt} discovered a secret path hidden behind a waterfall. Following the mysterious trail through enchanted forests, they met friendly talking animals who became the best companions anyone could wish for. Together, they laughed, played, and shared amazing stories.`,
        `As the adventure continued, they faced an exciting challenge that required courage and kindness. With the help of their new friends and believing in themselves, they found creative solutions to every problem. The journey taught them that friendship and bravery can overcome any obstacle.`,
        `When the stars began to twinkle in the evening sky, ${prompt} returned home with a heart full of joy and wonderful memories. The magical adventure had changed them forever, filling their days with happiness and dreams of new adventures to come. And they lived happily ever after, always ready for the next great story!`,
      ],
    },
    {
      title: `${capitalize(prompt)} and the Secret Garden`,
      pages: [
        `In a cozy little town surrounded by rolling hills, ${prompt} loved to explore and discover new things. One sunny afternoon, while playing near an old stone wall covered in climbing roses, they noticed a tiny golden key half-buried in the soft earth.`,
        `The golden key opened a hidden gate that revealed the most beautiful secret garden anyone had ever seen! Butterflies danced between rainbow-colored flowers, a gentle stream bubbled with crystal-clear water, and friendly creatures welcomed ${prompt} with warm smiles and cheerful songs.`,
        `In the center of the garden stood a magnificent tree with branches that seemed to touch the sky. ${prompt} and their new garden friends worked together to help the tree bloom with magical fruits that granted wishes. Each fruit sparkled with a different color and could make dreams come true.`,
        `As the sun began to set, painting the sky in shades of pink and gold, ${prompt} knew this special place would always be there whenever they needed magic and wonder. With hearts full of gratitude and pockets full of magical seeds to share, they promised to visit often and spread kindness wherever they went.`,
      ],
    },
    {
      title: `The Day ${capitalize(prompt)} Saved the Day`,
      pages: [
        `${capitalize(prompt)} was known throughout the land as someone with a kind heart and creative mind. Every day brought new opportunities to help others and make the world a better place. On this particular morning, something very special was about to happen.`,
        `When the town's most treasured treasure went missing, everyone was worried and didn't know what to do. But ${prompt} remembered stories from wise elders about solving problems with patience, teamwork, and believing in yourself. Gathering friends from near and far, they began an exciting quest filled with riddles and adventures.`,
        `Through forests of whispering trees, across bridges made of rainbows, and past mountains that touched the clouds, the brave team followed clues and helped everyone they met along the way. Each challenge made them stronger, wiser, and brought them closer together as friends.`,
        `Just as the sun reached its highest point in the sky, ${prompt} discovered that the real treasure had been the journey itself - the friends made, the lessons learned, and the joy of working together. Everyone celebrated with a grand feast under the stars, knowing that kindness and courage always lead to the happiest endings.`,
      ],
    },
  ]

  // Select a random template
  const template = templates[Math.floor(Math.random() * templates.length)]

  return `TITLE: ${template.title}
PAGE 1: ${template.pages[0]}
PAGE 2: ${template.pages[1]}
PAGE 3: ${template.pages[2]}
PAGE 4: ${template.pages[3]}`
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
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

  // Fallback if parsing fails
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

  // Final fallback
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
