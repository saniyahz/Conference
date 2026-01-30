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

// Generate a consistent character description to use across all pages
function generateConsistentCharacter(firstPageText: string, originalPrompt: string): string {
  const characterType = extractSimpleCharacterType(firstPageText, originalPrompt)

  // Create VERY detailed, consistent character descriptions for common types
  // Include specific colors, features, clothing, and accessories that won't change
  const characterDescriptions: { [key: string]: string } = {
    'dog': 'a specific golden retriever puppy with fluffy cream-colored fur, large warm brown eyes, a small black nose, wearing a bright red collar with a silver tag, floppy ears, and a constantly wagging tail',
    'cat': 'a specific orange tabby cat with distinctive tiger-like stripes, bright emerald green eyes, white paws and chest, a pink nose, and a long striped tail',
    'dragon': 'a specific small dragon with soft pink scales covering its entire body, cream-colored belly, tiny translucent wings with golden veins, gentle amber eyes, small curved horns, and a friendly smile',
    'unicorn': 'a specific white unicorn with a flowing rainbow-colored mane (red, orange, yellow, green, blue, purple bands), a long golden spiral horn on its forehead, soft purple eyes, white coat, and a rainbow-colored tail',
    'bear': 'a specific brown teddy bear with caramel-colored soft fur, small black button eyes, a large black button nose, a friendly smile, round ears, and a small red bow tie',
    'rabbit': 'a specific white bunny with pure white fluffy fur, very long floppy ears with pink insides, a tiny pink nose, bright blue eyes, a small round fluffy tail, and white whiskers',
    'bunny': 'a specific white bunny with pure white fluffy fur, very long floppy ears with pink insides, a tiny pink nose, bright blue eyes, a small round fluffy tail, and white whiskers',
    'fox': 'a specific red fox with bright orange-red fur on its body, white fur on its chest and belly, black paws and ear tips, a large bushy orange tail with a white tip, amber eyes, and pointy ears',
    'elephant': 'a specific baby elephant with light gray wrinkled skin, large floppy ears with pink insides, small white tusks just starting to grow, a playful curled trunk, small brown eyes, and chunky legs',
    'lion': 'a specific young lion cub with golden-tan fur, a small fluffy orange mane starting to grow, round face, big amber eyes, small pink nose, white whiskers, and a tuft at the end of its tail',
    'mouse': 'a specific small gray mouse with soft gray fur, very large round pink ears, tiny black whiskers, bright black eyes like beads, a long pink tail, and small white paws',
    'princess': 'a specific young princess with long flowing brown hair with small sparkles, wearing a lavender dress with golden embroidery, a small silver tiara with purple gems, kind green eyes, and a gentle smile',
    'prince': 'a specific young prince with neat dark hair, wearing a royal blue jacket with gold buttons, white pants, a small gold crown, brown eyes, and a brave friendly expression',
    'fairy': 'a specific tiny fairy with translucent rainbow wings, wearing a flowing pink dress made of flower petals, long blonde hair with small flowers, holding a silver wand with a star on top, and sparkling blue eyes',
    'wizard': 'a specific young wizard with a long purple robe covered in silver stars and moons, a tall pointed purple hat, a long wooden wand with a crystal on top, kind gray eyes, and a long white beard',
    'knight': 'a specific young knight wearing shining silver armor with gold trim, a flowing blue cape, a small silver helmet with a red feather plume, holding a silver sword, and a friendly smile',
    'pirate': 'a specific young pirate wearing a red bandana with white dots, a brown leather vest, white shirt with rolled-up sleeves, black pants, brown boots, an eye patch over the left eye, and an adventurous grin',
    'skeleton': 'a specific friendly cartoon skeleton with clean white bones, a big cheerful smile with visible teeth, large round friendly eye sockets with a happy expression, wearing a colorful bow tie, dancing pose with arms spread wide, and an overall cute and playful appearance (NOT scary or spooky, kid-friendly cartoon style)'
  }

  // Return the consistent description, or create a detailed generic one
  const description = characterDescriptions[characterType] || `a specific young ${characterType} with distinctive features: kind warm eyes, friendly smile, consistent appearance throughout`
  return description
}

// Create scene descriptions for each page
function createVisualScene(pageIndex: number): string {
  const scenes = [
    'standing in a cozy home interior, warm lighting, peaceful',
    'playing with friends in a sunny garden, flowers around',
    'walking on a forest path, trees and nature, beginning adventure',
    'discovering something, looking surprised and curious',
    'standing tall with determined expression, ready to help',
    'working on a task, focused and trying hard',
    'sitting and thinking, gentle atmosphere, learning',
    'with friends helping together, teamwork and cooperation',
    'celebrating with joy, happy dancing, success',
    'peaceful happy ending scene, surrounded by friends and love'
  ]

  return scenes[pageIndex] || scenes[0]
}

function generateImagePrompts(story: any, originalPrompt: string): string[] {
  // Generate ONE consistent character description to use for all pages
  const firstPageText = story.pages[0]?.text || ''
  const consistentCharacter = generateConsistentCharacter(firstPageText, originalPrompt)

  // Generate prompts for each page with the SAME EXACT character
  const prompts = story.pages.map((page: any, index: number) => {
    const scene = createVisualScene(index)

    // Build prompt with VERY DETAILED consistent character + scene + strong no-text instructions
    // Emphasize "same character" and "consistent appearance"
    return `Professional children's book illustration in soft watercolor style. IMPORTANT: Show the EXACT SAME character throughout - ${consistentCharacter}. The character must have IDENTICAL appearance, colors, and features in every image. Scene: ${scene}. Style: soft pastel colors, gentle lighting, whimsical, kid-friendly. CRITICAL: Pure illustration with absolutely NO text, NO words, NO letters, NO captions, NO labels of any kind.`
  })

  return prompts
}

// Extract just the character type (animal/person) without detailed description
function extractSimpleCharacterType(firstPageText: string, originalPrompt: string): string {
  const lowerText = firstPageText.toLowerCase()
  const lowerPrompt = originalPrompt.toLowerCase()

  // Simple character types (just the animal/person, no details)
  const characters = [
    'mouse', 'rabbit', 'bunny', 'cat', 'dog', 'bear', 'fox', 'dragon',
    'unicorn', 'elephant', 'lion', 'pig', 'duck', 'bird', 'dinosaur',
    'princess', 'prince', 'fairy', 'wizard', 'knight', 'pirate', 'skeleton'
  ]

  for (const char of characters) {
    if (lowerText.includes(char) || lowerPrompt.includes(char)) {
      return char
    }
  }

  return 'child character'
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


function extractCharacterName(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase()

  // Try to find a character type
  const animals = ['dog', 'cat', 'dragon', 'unicorn', 'bear', 'lion', 'elephant', 'monkey', 'rabbit', 'fox', 'dinosaur', 'bird']
  for (const animal of animals) {
    if (lowerPrompt.includes(animal)) {
      return animal
    }
  }

  const people = ['princess', 'prince', 'knight', 'wizard', 'fairy', 'pirate', 'skeleton']
  for (const person of people) {
    if (lowerPrompt.includes(person)) {
      return person
    }
  }

  return 'our hero'
}
