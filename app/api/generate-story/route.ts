import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
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

    // Use Replicate Llama 3.3 70B (FREE!) to generate story
    const systemPrompt = `You are a creative children's story writer. Create engaging, unique 10-page stories for kids aged 4-8 based on their ideas (like Google Gemini Storybook format).

IMPORTANT RULES:
- Create a UNIQUE story based on what the child says - don't use generic templates
- The story should be EXACTLY 10 pages long
- Each page should be 5-8 sentences - rich, engaging, detailed content
- Include a clear beginning, middle, and end with good pacing
- Include a simple problem and how it's solved
- Keep it kid-friendly, non-religious, non-political
- Make it fun, magical, and age-appropriate
- Use the EXACT character names and details the child mentions
- Each page should describe a vivid visual scene with soft pastel colors

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
TITLE: [Creative title based on their idea]

PAGE 1:
[5-8 sentences - introduction of main character, their personality, and their beautiful world]

PAGE 2:
[5-8 sentences - character's daily life, what they love to do, their friends]

PAGE 3:
[5-8 sentences - something interesting happens, adventure begins]

PAGE 4:
[5-8 sentences - problem or challenge is discovered, character reacts with emotion]

PAGE 5:
[5-8 sentences - character decides to face the challenge, gathers courage]

PAGE 6:
[5-8 sentences - working to solve problem, trying first approach]

PAGE 7:
[5-8 sentences - setback or complication, character learns something important]

PAGE 8:
[5-8 sentences - teamwork and new strategy, friends help]

PAGE 9:
[5-8 sentences - problem solved successfully, moment of triumph]

PAGE 10:
[5-8 sentences - celebration, what they learned, happy ending with friends and family]`

    const userPrompt = `A child wants a story about: "${prompt}". Create a unique, magical 10-page story based on their idea!`

    const output = await replicate.run(
      "meta/meta-llama-3.1-405b-instruct",
      {
        input: {
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          temperature: 0.9,
          max_tokens: 3000,
          top_p: 0.9,
        }
      }
    ) as string[]

    const storyText = output.join('')

    // Parse the story
    const story = parseStory(storyText, prompt)

    // Generate image prompts for each page
    const imagePrompts = generateImagePrompts(story, prompt)

    return NextResponse.json({
      story: {
        title: story.title,
        pages: story.pages,
        originalPrompt: prompt, // Include original speech/prompt from the kid
      },
      imagePrompts,
    })
  } catch (error: any) {
    console.error('Error generating story:', error)

    // Check if it's a content moderation error
    const errorMessage = error.message || String(error)
    const isContentError =
      errorMessage.includes('safety') ||
      errorMessage.includes('content policy') ||
      errorMessage.includes('inappropriate') ||
      errorMessage.includes('moderation') ||
      errorMessage.includes('blocked') ||
      errorMessage.includes('violated')

    if (isContentError) {
      return NextResponse.json(
        {
          error: 'This story idea contains content that isn\'t appropriate for a children\'s story app. Please try a different, kid-friendly idea! Think of fun adventures with animals, magical creatures, or everyday heroes.',
          isContentError: true
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to generate story. Please try again.' },
      { status: 500 }
    )
  }
}

// Generate a consistent character description - let the image model figure out the details
function generateConsistentCharacter(firstPageText: string, originalPrompt: string): string {
  const characterType = extractCharacterType(firstPageText, originalPrompt)

  // Just return a simple, friendly description - the image model knows what characters look like
  return `a cute, friendly ${characterType} with big expressive eyes and a warm smile, child-friendly cartoon style`
}

// Extract key scene details from page text
function extractSceneFromText(pageText: string): string {
  // Get the first 2-3 sentences which usually describe the main action
  const sentences = pageText.split(/[.!?]+/).filter(s => s.trim().length > 10)
  const keyContent = sentences.slice(0, 2).join('. ')

  // Extract action words and settings
  const actionWords = keyContent.match(/\b(walking|running|flying|swimming|climbing|playing|dancing|singing|crying|laughing|hugging|helping|finding|discovering|exploring|hiding|chasing|jumping|sitting|standing|looking|watching|eating|sleeping|dreaming|building|creating|painting|reading|talking|whispering|shouting|celebrating|fighting|saving|rescuing|meeting|greeting)\b/gi) || []

  const settingWords = keyContent.match(/\b(forest|garden|castle|house|home|mountain|river|lake|ocean|beach|sky|clouds|rainbow|cave|village|town|city|school|park|meadow|field|kitchen|bedroom|library|tower|bridge|path|road|tree|flowers|stars|moon|sun)\b/gi) || []

  const emotionWords = keyContent.match(/\b(happy|sad|excited|worried|scared|brave|curious|surprised|amazed|proud|nervous|hopeful|determined|joyful|peaceful|magical)\b/gi) || []

  // Build a condensed scene description
  let scene = keyContent.slice(0, 150) // Take first 150 chars of content

  if (actionWords.length > 0) {
    scene += `, ${actionWords[0]} action`
  }
  if (settingWords.length > 0) {
    scene += `, ${settingWords.join(' and ')} setting`
  }
  if (emotionWords.length > 0) {
    scene += `, ${emotionWords[0]} mood`
  }

  return scene
}

function generateImagePrompts(story: any, originalPrompt: string): string[] {
  // Extract ALL characters mentioned in the story (may have multiple)
  const allText = story.pages.map((p: any) => p.text).join(' ')
  const characters = extractAllCharacters(allText, originalPrompt)

  // Simple, clear prompts that match the actual page content
  const prompts = story.pages.map((page: any, index: number) => {
    const pageText = page.text || ''

    // Get the key scene from this specific page
    const sceneDescription = extractSceneDescription(pageText)

    // Build prompt with ALL characters and the actual scene
    const charactersPart = characters.length > 0
      ? characters.join(' and ')
      : 'the main character'

    return `Children's book illustration showing ${charactersPart}. Scene: ${sceneDescription}. Disney Pixar 3D animation style, cute, friendly, colorful, warm lighting, storybook art. No text, no words, no letters.`
  })

  return prompts
}

// Extract ALL characters mentioned (supports multiple characters like "Spiderman and Donald Duck")
function extractAllCharacters(text: string, originalPrompt: string): string[] {
  const combinedText = text + ' ' + originalPrompt
  const lowerText = combinedText.toLowerCase()
  const foundCharacters: string[] = []

  // Check for famous characters first (Disney, Marvel, etc.) - these need exact matching
  const famousCharacters = [
    'spiderman', 'spider-man', 'spider man', 'batman', 'superman', 'ironman', 'iron man',
    'donald duck', 'mickey mouse', 'minnie mouse', 'goofy', 'pluto', 'daisy duck',
    'elsa', 'anna', 'olaf', 'moana', 'maui', 'simba', 'nala', 'mufasa', 'timon', 'pumbaa',
    'woody', 'buzz lightyear', 'buzz', 'nemo', 'dory', 'marlin',
    'peppa pig', 'george pig', 'paw patrol', 'chase', 'marshall', 'skye',
    'pikachu', 'pokemon', 'mario', 'luigi', 'sonic', 'tails',
    'spongebob', 'patrick', 'squidward', 'winnie the pooh', 'pooh bear', 'piglet', 'tigger', 'eeyore',
    'thomas the train', 'thomas', 'bluey', 'bingo', 'cocomelon', 'jj'
  ]

  for (const char of famousCharacters) {
    if (lowerText.includes(char)) {
      const properName = char.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      if (!foundCharacters.includes(properName)) {
        foundCharacters.push(properName)
      }
    }
  }

  // Dynamic character extraction - find characters from patterns in the text
  // Pattern 1: "[Name] the [creature]" - e.g., "Rosie the Cup", "Annie the Ant"
  const namedCharacterPattern = /\b([A-Z][a-z]+)\s+the\s+([A-Za-z]+)/g
  let match
  while ((match = namedCharacterPattern.exec(combinedText)) !== null) {
    const name = match[1]
    const creature = match[2].toLowerCase()
    const character = `${name} the ${creature}`
    if (!foundCharacters.some(fc => fc.toLowerCase().includes(creature))) {
      foundCharacters.push(character)
    }
  }

  // Pattern 2: "a/an [adjective]? [Creature] named [Name]" - e.g., "a massive Rhinoceros named Romy"
  const creatureNamedPattern = /\b(?:a|an)\s+(?:\w+\s+)?([A-Z][a-z]+)\s+named\s+([A-Z][a-z]+)/g
  while ((match = creatureNamedPattern.exec(combinedText)) !== null) {
    const creature = match[1].toLowerCase()
    const name = match[2]
    if (!foundCharacters.some(fc => fc.toLowerCase().includes(creature))) {
      foundCharacters.push(`${name} the ${creature}`)
    }
  }

  // Pattern 3: "[Creature] named [Name]" - e.g., "Rhinoceros named Romy"
  const simpleCreatureNamedPattern = /\b([A-Z][a-z]+)\s+named\s+([A-Z][a-z]+)/g
  while ((match = simpleCreatureNamedPattern.exec(combinedText)) !== null) {
    const creature = match[1].toLowerCase()
    const name = match[2]
    const skipWords = ['friend', 'place', 'story', 'adventure', 'home', 'house', 'one', 'day']
    if (!skipWords.includes(creature) && !foundCharacters.some(fc => fc.toLowerCase().includes(creature))) {
      foundCharacters.push(`${name} the ${creature}`)
    }
  }

  // Pattern 4: "a/an/the [adjective]? [creature]" from the original prompt
  // This captures what the user actually asked for
  const promptCreaturePattern = /\b(?:a|an|the)\s+(?:little|tiny|big|small|friendly|cute|brave|magical|young)?\s*([a-z]+)\b/gi
  while ((match = promptCreaturePattern.exec(originalPrompt)) !== null) {
    const creature = match[1].toLowerCase()
    // Skip common non-character words
    const skipWords = ['story', 'adventure', 'tale', 'book', 'day', 'time', 'place', 'way', 'thing', 'lot', 'bit', 'world', 'land', 'home', 'house', 'forest', 'garden', 'name', 'friend']
    if (!skipWords.includes(creature) && creature.length > 2) {
      if (!foundCharacters.some(fc => fc.toLowerCase().includes(creature))) {
        foundCharacters.push('a cute ' + creature)
      }
    }
  }

  // Pattern 3: Look for plural creatures (ants, bees, butterflies, etc.)
  const pluralPattern = /\b(?:the|some|many|little|tiny)\s+([a-z]+s)\b/gi
  while ((match = pluralPattern.exec(combinedText)) !== null) {
    const creature = match[1].toLowerCase()
    const skipWords = ['stories', 'adventures', 'tales', 'books', 'days', 'times', 'places', 'ways', 'things', 'friends', 'colors', 'eyes', 'words', 'pages']
    if (!skipWords.includes(creature) && creature.length > 3) {
      if (!foundCharacters.some(fc => fc.toLowerCase().includes(creature))) {
        foundCharacters.push('cute ' + creature)
      }
    }
  }

  // Limit to max 3 characters to keep image focused
  return foundCharacters.slice(0, 3)
}

// Extract the actual scene description from page text
function extractSceneDescription(pageText: string): string {
  // Get the key action/scene from the text
  const sentences = pageText.split(/[.!?]+/).filter(s => s.trim().length > 10)
  if (sentences.length === 0) return 'in a magical scene'

  // Take first 1-2 sentences and clean them up
  let scene = sentences.slice(0, 2).join('. ').trim()

  // Shorten if too long
  if (scene.length > 200) {
    scene = scene.substring(0, 200) + '...'
  }

  // Extract key visual elements
  const settingMatch = pageText.match(/\b(forest|garden|castle|meadow|ocean|beach|mountain|village|home|house|cave|river|lake|sky|clouds|tree|woods|park|playground|room|kitchen|bedroom)\b/i)
  const setting = settingMatch ? settingMatch[0] : ''

  const actionMatch = pageText.match(/\b(playing|running|flying|swimming|dancing|singing|helping|hugging|celebrating|exploring|walking|jumping|climbing|cheering|laughing|smiling)\b/i)
  const action = actionMatch ? actionMatch[0] : ''

  // Build a focused scene description
  if (action && setting) {
    return `${action} in a beautiful ${setting}. ${scene.substring(0, 100)}`
  } else if (scene) {
    return scene.substring(0, 150)
  }

  return 'in a magical adventure scene'
}

function parseStory(text: string, originalPrompt: string) {
  // Extract title
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|PAGE)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'My Amazing Story'

  // Extract pages (looking for 10 pages)
  const pages: { text: string }[] = []

  for (let i = 1; i <= 10; i++) {
    const pageRegex = new RegExp(`PAGE ${i}:\\s*(.+?)(?=PAGE ${i + 1}:|$)`, 'is')
    const pageMatch = text.match(pageRegex)

    if (pageMatch) {
      const pageText = pageMatch[1].trim()
      // Clean up any extra whitespace
      const cleanedText = pageText.replace(/\n\n+/g, ' ').trim()
      pages.push({ text: cleanedText })
    }
  }

  // Fallback if parsing fails - split into 10 pages
  if (pages.length < 8) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20)
    const sentencesPerPage = Math.max(5, Math.floor(sentences.length / 10))

    pages.length = 0 // Clear any partial pages
    for (let i = 0; i < 10; i++) {
      const start = i * sentencesPerPage
      const end = start + sentencesPerPage
      const pageText = sentences.slice(start, end).join('. ') + '.'
      if (pageText.trim().length > 10) {
        pages.push({ text: pageText.trim() })
      }
    }
  }

  // Final fallback - create 10 rich pages
  if (pages.length < 8) {
    const char = extractCharacterName(originalPrompt)
    pages.length = 0
    pages.push(
      { text: `Once upon a time in a soft, dreamy land painted in gentle pastel colors, there lived a wonderful ${char} with the brightest eyes and kindest heart. Their home was filled with warmth and love, surrounded by flowering meadows in shades of lavender and peach. Every day was filled with wonder and excitement as ${char} explored the beautiful world around them. The sun always seemed to shine with a soft golden glow whenever ${char} was near.` },
      { text: `Each morning, ${char} would wake up to the sweet songs of bluebirds and butterflies dancing outside the window. They loved to spend time with their best friends, playing gentle games and sharing stories. The days were peaceful and happy, filled with laughter and joy. ${char} felt grateful for all the beauty and friendship that surrounded them every single day.` },
      { text: `One special morning, something unusual caught ${char}'s attention - a gentle shimmer in the air, like tiny sparkles of soft light. The sparkles seemed to be calling out, inviting ${char} to follow them on an adventure. ${char} felt curious and excited, wondering where this magical trail might lead. With a deep breath and a hopeful smile, ${char} decided to follow the gentle lights.` },
      { text: `As ${char} followed the sparkles deeper into the enchanted forest, they discovered that something important was happening. A beautiful rainbow had lost its colors and had faded to pale gray. The forest creatures gathered around, looking worried and sad. ${char} felt their heart fill with determination - they knew they had to help bring back the rainbow's beautiful colors. This was going to be an important adventure.` },
      { text: `${char} stood tall and brave, even though the task seemed big and challenging. They remembered all the kind things their friends had taught them about courage and helping others. Taking a deep breath, ${char} decided to search for the magic that could restore the rainbow's colors. They packed a small bag with supplies and set off with hope in their heart, ready to do whatever it took to help.` },
      { text: `Along the winding path, ${char} tried to gather colors from flowers and butterflies, thinking they could paint the rainbow back to life. They collected petals of pink roses, yellow daisies, and blue forget-me-nots in a gentle basket. ${char} climbed up to where the rainbow touched the ground and carefully tried to sprinkle the colors onto it. The rainbow glowed softly for a moment, but the colors didn't quite stick. ${char} realized they needed to try something different.` },
      { text: `Sitting down to rest and think, ${char} felt a little discouraged but not defeated. A wise old owl landed nearby and spoke in a gentle voice: "True colors come from joy and love shared with friends." ${char} understood now - they needed to bring their friends together! This wasn't a challenge to face alone. ${char} felt excited and hopeful again, learning that asking for help is a sign of wisdom, not weakness.` },
      { text: `${char} hurried back and gathered all their dear friends - the rabbits, the deer, the squirrels, and the birds. Each friend brought their own special gift: songs of joy, dances of happiness, stories of love, and acts of kindness. Together, they formed a circle beneath the faded rainbow and shared all the beautiful, warm feelings in their hearts. The air began to shimmer and glow with gentle light as their friendship and love filled the space around them.` },
      { text: `Suddenly, like magic born from pure love and friendship, colors began to bloom across the rainbow! Soft pink, gentle yellow, peaceful blue, lovely green, and warm purple spread across the sky in the most beautiful arch anyone had ever seen. The colors were even more beautiful than before - softer, warmer, more magical. ${char} and all their friends cheered and danced with joy! They had done it together! The rainbow sparkled with happiness, grateful for the love that had brought it back to life.` },
      { text: `The whole forest celebrated with a wonderful party filled with music, dancing, and delicious treats. ${char} realized something very important: the most powerful magic in the world comes from friendship, kindness, and working together. The rainbow would forever remember the love that saved it, and ${char} would forever remember this magical adventure. As the sun set in beautiful pastel colors, ${char} hugged all their friends tightly, knowing that together, they could overcome anything. And they all lived happily ever after, ready for whatever adventures tomorrow might bring!` }
    )
  }

  // Ensure exactly 10 pages
  while (pages.length < 10) {
    pages.push({ text: 'And the magical adventure continued with wonder, love, and joy...' })
  }

  return {
    title,
    pages: pages.slice(0, 10),
  }
}


// Dynamically extract character name from prompt
function extractCharacterName(prompt: string): string {
  // Pattern 1: "[Name] the [creature]" - e.g., "Rosie the Cup", "Annie the Ant"
  const namedPattern = /\b([A-Z][a-z]+)\s+the\s+([A-Za-z]+)/i
  const namedMatch = prompt.match(namedPattern)
  if (namedMatch) {
    return namedMatch[2].toLowerCase() // Return the creature type
  }

  // Pattern 2: "a/an/the [adjective]? [creature]"
  const creaturePattern = /\b(?:a|an|the)\s+(?:little|tiny|big|small|friendly|cute|brave|magical|young)?\s*([a-z]+)\b/i
  const creatureMatch = prompt.match(creaturePattern)
  if (creatureMatch) {
    const creature = creatureMatch[1].toLowerCase()
    const skipWords = ['story', 'adventure', 'tale', 'book', 'day', 'time', 'place', 'way', 'thing']
    if (!skipWords.includes(creature) && creature.length > 2) {
      return creature
    }
  }

  return 'our hero'
}

// Dynamically extract character type from text - no hardcoded list needed
function extractCharacterType(pageText: string, originalPrompt: string): string {
  const combinedText = `${originalPrompt} ${pageText}`

  // Pattern 1: "[Name] the [creature]" - highest priority (handles "Annie the Ant")
  const namedPattern = /\b([A-Z][a-z]+)\s+the\s+([A-Za-z]+)/
  const namedMatch = combinedText.match(namedPattern)
  if (namedMatch) {
    return namedMatch[2].toLowerCase()
  }

  // Pattern 2: "a/an [adjective]? [Creature] named [Name]" - e.g., "a massive Rhinoceros named Romy"
  const creatureNamedPattern = /\b(?:a|an)\s+(?:\w+\s+)?([A-Z][a-z]+)\s+named\s+[A-Z][a-z]+/
  const creatureNamedMatch = combinedText.match(creatureNamedPattern)
  if (creatureNamedMatch) {
    return creatureNamedMatch[1].toLowerCase()
  }

  // Pattern 3: "[Creature] named [Name]" - e.g., "Rhinoceros named Romy"
  const simpleCreatureNamedPattern = /\b([A-Z][a-z]+)\s+named\s+[A-Z][a-z]+/
  const simpleCreatureNamedMatch = combinedText.match(simpleCreatureNamedPattern)
  if (simpleCreatureNamedMatch) {
    const creature = simpleCreatureNamedMatch[1].toLowerCase()
    const skipWords = ['friend', 'place', 'story', 'adventure', 'home', 'house', 'one', 'day']
    if (!skipWords.includes(creature)) {
      return creature
    }
  }

  // Pattern 4: "a/an [adjective]? [creature]" from prompt
  const creaturePattern = /\b(?:a|an)\s+(?:little|tiny|big|small|friendly|cute|brave|magical|young|hardworking|massive|gentle)?\s*([a-z]+)\b/i
  const creatureMatch = originalPrompt.match(creaturePattern)
  if (creatureMatch) {
    const creature = creatureMatch[1].toLowerCase()
    const skipWords = ['story', 'adventure', 'tale', 'book', 'day', 'time', 'place', 'way', 'thing', 'lot', 'bit']
    if (!skipWords.includes(creature) && creature.length > 2) {
      return creature
    }
  }

  // Pattern 5: Look for "the [creatures]" (plural)
  const pluralPattern = /\b(?:the|some|many)\s+([a-z]+s)\b/i
  const pluralMatch = combinedText.match(pluralPattern)
  if (pluralMatch) {
    const creature = pluralMatch[1].toLowerCase()
    const skipWords = ['stories', 'adventures', 'tales', 'books', 'days', 'times', 'places', 'ways', 'things', 'friends']
    if (!skipWords.includes(creature) && creature.length > 3) {
      return creature
    }
  }

  // Check for famous characters as fallback
  const famousCharacters: { [key: string]: string } = {
    'spiderman': 'superhero',
    'spider-man': 'superhero',
    'batman': 'superhero',
    'superman': 'superhero',
    'donald duck': 'duck',
    'mickey mouse': 'mouse',
    'minnie mouse': 'mouse',
    'winnie': 'bear',
    'pooh': 'bear',
    'elsa': 'princess',
    'anna': 'princess',
    'moana': 'princess',
    'rapunzel': 'princess',
    'cinderella': 'princess'
  }

  for (const [name, type] of Object.entries(famousCharacters)) {
    if (combinedText.includes(name)) {
      return type
    }
  }

  return 'character'
}
