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

    // Generate detailed image prompts for each page with character AND scenery
    const imagePrompts = generateImagePrompts(story, prompt)

    return NextResponse.json({
      story: {
        title: story.title,
        pages: story.pages,
      },
      imagePrompts,
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
  // Extract key concepts from the prompt
  const concepts = extractConcepts(prompt.toLowerCase())

  // Generate a story based on the concepts
  if (concepts.character) {
    return generateCharacterStory(concepts)
  } else if (concepts.theme) {
    return generateThemeStory(concepts, prompt)
  } else {
    return generateGeneralStory(prompt)
  }
}

function extractConcepts(prompt: string) {
  const concepts: any = {}

  // Extract character names (looking for patterns like "dog called X", "cat named Y", etc.)
  const characterPatterns = [
    /(?:dog|cat|dragon|unicorn|princess|prince|bear|lion|elephant|monkey|rabbit|fox|wolf|bird|dinosaur|robot|alien|wizard|fairy|mermaid|pirate|knight)\s+(?:called|named)\s+(\w+)/i,
    /(?:called|named)\s+(\w+)/i,
    /about\s+(?:a\s+)?(\w+)/i
  ]

  for (const pattern of characterPatterns) {
    const match = prompt.match(pattern)
    if (match && match[1]) {
      concepts.characterName = capitalize(match[1])
      break
    }
  }

  // Extract character type
  const animals = ['dog', 'cat', 'dragon', 'unicorn', 'bear', 'lion', 'elephant', 'monkey', 'rabbit', 'fox', 'wolf', 'bird', 'dinosaur']
  const magical = ['wizard', 'fairy', 'mermaid', 'dragon', 'unicorn', 'alien']
  const people = ['princess', 'prince', 'pirate', 'knight', 'king', 'queen']

  for (const animal of animals) {
    if (prompt.includes(animal)) {
      concepts.character = animal
      concepts.type = 'animal'
      break
    }
  }

  for (const magic of magical) {
    if (prompt.includes(magic)) {
      concepts.character = magic
      concepts.type = 'magical'
      break
    }
  }

  for (const person of people) {
    if (prompt.includes(person)) {
      concepts.character = person
      concepts.type = 'person'
      break
    }
  }

  // Extract themes/actions
  if (prompt.includes('adventure') || prompt.includes('explore') || prompt.includes('quest')) {
    concepts.theme = 'adventure'
  } else if (prompt.includes('magic') || prompt.includes('spell') || prompt.includes('wish')) {
    concepts.theme = 'magic'
  } else if (prompt.includes('friend') || prompt.includes('help')) {
    concepts.theme = 'friendship'
  } else if (prompt.includes('lost') || prompt.includes('find') || prompt.includes('search')) {
    concepts.theme = 'quest'
  }

  return concepts
}

function generateCharacterStory(concepts: any): string {
  const char = concepts.characterName || capitalize(concepts.character || 'Hero')
  const charType = concepts.character || 'character'

  // Create specific problems and solutions for different character types
  let problem, solution
  if (concepts.type === 'animal') {
    problem = `the magical Crystal of Friendship had lost its sparkle, and without it, all the animals in the forest were becoming lonely and sad`
    solution = `${char} discovered that the crystal would shine again if everyone worked together and showed kindness to each other. By organizing a big friendship festival where everyone helped one another, the crystal began to glow brighter than ever before!`
  } else if (concepts.type === 'magical') {
    problem = `an evil spell had turned all the colors in the rainbow gray, making the whole kingdom sad and gloomy`
    solution = `${char} learned that true magic comes from believing in yourself and spreading joy to others. By performing acts of kindness and making people smile, the colors slowly returned one by one until the rainbow was more beautiful than ever!`
  } else {
    problem = `a mysterious fog had covered the village, making everyone forget how to laugh and play`
    solution = `${char} remembered that laughter and joy come from sharing happy moments with friends. By organizing fun games and telling silly jokes, the fog lifted and everyone remembered how wonderful it is to play together!`
  }

  const title = `The Amazing Adventure of ${char}`

  const pages = [
    `Once upon a time, in a magical land far away, there lived a wonderful ${charType} named ${char}. ${char} had the brightest eyes and the kindest heart anyone had ever seen. Every day was filled with excitement and wonder, and ${char} loved exploring the beautiful world around them. But one day, something unexpected happened that would change everything.`,

    `One morning, ${char} woke up to discover that ${problem}. Everyone was worried and didn't know what to do! ${char} knew they had to help. "I may be just one ${charType}," said ${char}, "but if I try my best and work with my friends, we can solve this together!" So ${char} set out on an important quest, meeting wise old owls, playful squirrels, and friendly butterflies along the way.`,

    `Together, ${char} and the new friends worked as a team to solve the problem. ${solution} ${char} showed great bravery by never giving up, even when things seemed difficult. The friends learned that working together and believing in each other makes anything possible. Through laughter, teamwork, and creative thinking, they saved the day!`,

    `As the golden sun began to set, painting the sky in beautiful colors, ${char} and all their friends celebrated their success. Everyone in the land was happy again! ${char} learned that even small acts of kindness and courage can make a big difference. From that day on, ${char} knew that with good friends and a brave heart, any problem could be solved. And they all lived happily ever after, ready for the next great adventure!`
  ]

  return `TITLE: ${title}
PAGE 1: ${pages[0]}
PAGE 2: ${pages[1]}
PAGE 3: ${pages[2]}
PAGE 4: ${pages[3]}`
}

function generateThemeStory(concepts: any, prompt: string): string {
  const theme = concepts.theme || 'adventure'
  const subject = concepts.characterName || concepts.character || 'our hero'

  const title = `The Magical ${capitalize(theme)} Story`

  const pages = [
    `In a land where dreams come true and anything is possible, something extraordinary was about to happen! ${capitalize(subject)} woke up one morning to discover that today would be the most special day ever. The sun shone brighter, the birds sang sweeter songs, and magic filled the air with sparkles of wonder.`,

    `With excitement bubbling in their heart, ${subject} set out on an incredible journey. Along the winding path through enchanted forests and over rainbow bridges, they met amazing friends who each had special gifts to share. Together, they laughed, played, and discovered that friendship makes every adventure more wonderful.`,

    `When they faced a tricky challenge, ${subject} remembered to be brave and kind. With help from all their new friends, they found creative solutions and worked together like a perfect team. Every obstacle became an opportunity to learn something new and grow stronger. The power of believing in yourself and your friends can overcome anything!`,

    `As stars began to twinkle in the evening sky, ${subject} realized that this magical day had brought the greatest gift of all - wonderful friendships and beautiful memories. With hearts full of happiness and dreams of tomorrow's adventures, everyone celebrated together. And they all lived happily ever after, knowing that every day can be filled with magic when you believe!`
  ]

  return `TITLE: ${title}
PAGE 1: ${pages[0]}
PAGE 2: ${pages[1]}
PAGE 3: ${pages[2]}
PAGE 4: ${pages[3]}`
}

function generateGeneralStory(prompt: string): string {
  const title = 'A Wonderful Adventure'

  // Use the prompt as inspiration for the story
  const words = prompt.split(' ').slice(0, 5).join(' ')

  const pages = [
    `This is a story all about ${words}! Once upon a time in a magical kingdom, something wonderful was about to begin. The day started like any other, but little did anyone know that amazing adventures were waiting just around the corner. Everything sparkled with possibility and magic was in the air!`,

    `Our brave hero discovered something special and decided to go on an exciting quest! Meeting friendly creatures along the way, they formed a team of the best friends anyone could ask for. Together they explored mysterious forests, climbed tall mountains, and crossed sparkling rivers. Every step brought new surprises and joyful laughter.`,

    `When challenges appeared, our hero showed great courage and kindness. With the help of wonderful friends and a belief in doing what's right, they found clever solutions to every problem. They learned that being brave doesn't mean not being scared - it means helping others even when things are difficult. Teamwork and friendship made them unstoppable!`,

    `As the adventure came to an end, our hero returned home with precious memories and lifelong friends. They had learned valuable lessons about courage, kindness, and the power of believing in yourself. Every night before bed, they would remember this magical adventure and smile, knowing that tomorrow might bring another wonderful story. And they all lived happily ever after!`
  ]

  return `TITLE: ${title}
PAGE 1: ${pages[0]}
PAGE 2: ${pages[1]}
PAGE 3: ${pages[2]}
PAGE 4: ${pages[3]}`
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function generateImagePrompts(story: any, originalPrompt: string): string[] {
  // Extract character info from the original prompt
  const concepts = extractConcepts(originalPrompt.toLowerCase())
  const char = concepts.characterName || concepts.character || 'hero'
  const charType = concepts.character || 'character'

  // Define art style for consistency across all images
  const artStyle = "Children's book illustration style, warm and friendly, colorful and vibrant, soft lighting, magical atmosphere"

  // Create detailed prompts for each page with character AND rich scenery
  const prompts = [
    // Page 1: Introduction scene
    `${artStyle}. A ${charType} named ${char} in a beautiful magical land. Show ${char} with bright eyes and a kind expression, surrounded by a enchanted forest with sparkling trees, colorful flowers, butterflies, and a glowing sunrise in the background. The scene is peaceful and full of wonder. Make it look like a professional children's book cover.`,

    // Page 2: Adventure begins
    `${artStyle}. ${char} the ${charType} discovering a mysterious golden sparkling path in an enchanted forest. Show ${char} looking excited and curious, with wise old owls perched on tree branches, playful squirrels nearby, and colorful butterflies flying around. The path glows with magical light, leading through mystical trees with twisted trunks and glowing mushrooms. Rainbow-colored flowers line the path.`,

    // Page 3: Solving the problem together
    `${artStyle}. ${char} the ${charType} and a group of animal friends working together as a team. Show ${char} in the center, surrounded by owls, squirrels, rabbits, and butterflies, all helping each other. A magical crystal or rainbow appears in the sky above them, glowing brightly. The scene shows teamwork and friendship, with everyone smiling. Set in a beautiful clearing in an enchanted forest with magical sparkles everywhere.`,

    // Page 4: Happy ending celebration
    `${artStyle}. ${char} the ${charType} celebrating with all their friends during a beautiful sunset. Show ${char} and many animal friends gathered together in a magical meadow, with the sky painted in beautiful colors of orange, pink, and gold. Sparkles and magical lights fill the air. Everyone looks happy and joyful. In the background, show a magical village or castle in the distance. The scene conveys happiness, friendship, and a perfect happy ending.`,
  ]

  return prompts
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
