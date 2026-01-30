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

// Generate a consistent character description to use across all pages
function generateConsistentCharacter(firstPageText: string, originalPrompt: string): string {
  const characterType = extractCharacterType(firstPageText, originalPrompt)

  // Create detailed, consistent character descriptions for common types
  const characterDescriptions: { [key: string]: string } = {
    'squirrel': 'fluffy with reddish-brown fur, a big bushy tail, bright curious eyes, tiny paws, and a cute little nose',
    'chipmunk': 'small with brown fur with distinctive stripes on the back, chubby cheeks, tiny ears, and a small bushy tail',
    'dog': 'a golden retriever puppy with fluffy cream-colored fur, large warm brown eyes, floppy ears, wearing a red collar',
    'puppy': 'a fluffy puppy with soft fur, big round eyes, floppy ears, a wagging tail, and a happy expression',
    'cat': 'an orange tabby cat with tiger-like stripes, bright green eyes, white paws, a pink nose, and a long striped tail',
    'kitten': 'a fluffy kitten with soft fur, big round eyes, tiny pink nose, small pointed ears, and a playful expression',
    'dragon': 'a small friendly dragon with soft purple scales, tiny wings, gentle amber eyes, small curved horns, and a friendly smile',
    'unicorn': 'a white unicorn with a flowing rainbow mane, a golden spiral horn, soft purple eyes, and a rainbow tail',
    'bear': 'a brown teddy bear with soft caramel fur, black button eyes, a big nose, round ears, and a red bow tie',
    'rabbit': 'a white bunny with fluffy fur, long floppy ears with pink insides, a tiny pink nose, and bright blue eyes',
    'bunny': 'a white bunny with fluffy fur, long floppy ears with pink insides, a tiny pink nose, and bright blue eyes',
    'fox': 'a red fox with orange-red fur, white chest, a big bushy tail with a white tip, and amber eyes',
    'owl': 'a wise owl with soft brown and white feathers, big round golden eyes, and a small curved beak',
    'bird': 'a colorful little bird with bright feathers, small beak, tiny feet, and cheerful eyes',
    'deer': 'a young deer with soft brown fur, white spots, big gentle eyes, and small growing antlers',
    'fawn': 'a baby deer with soft brown fur covered in white spots, big innocent eyes, and long legs',
    'elephant': 'a baby elephant with gray skin, large floppy ears, a playful curled trunk, and kind eyes',
    'lion': 'a young lion cub with golden fur, a small fluffy mane, big amber eyes, and a playful expression',
    'tiger': 'a tiger cub with orange fur and black stripes, bright eyes, and a playful stance',
    'monkey': 'a playful monkey with brown fur, a curly tail, big ears, and mischievous eyes',
    'mouse': 'a small gray mouse with large pink ears, tiny whiskers, bright black eyes, and a long pink tail',
    'penguin': 'a cute penguin with black and white feathers, an orange beak, and a waddle walk',
    'turtle': 'a friendly turtle with a green shell, kind eyes, and a slow gentle smile',
    'frog': 'a bright green frog with big round eyes, a wide smile, and long jumping legs',
    'butterfly': 'a beautiful butterfly with colorful wings in pink, blue, and purple',
    'bee': 'a fuzzy bumble bee with yellow and black stripes, tiny wings, and a friendly face',
    'hedgehog': 'a small hedgehog with soft spines, a tiny nose, bright eyes, and little paws',
    'otter': 'a playful otter with sleek brown fur, whiskers, and a happy expression',
    'beaver': 'a friendly beaver with brown fur, a flat tail, big front teeth, and kind eyes',
    'raccoon': 'a raccoon with gray fur, a black mask around the eyes, and a striped tail',
    'sheep': 'a fluffy white sheep with soft wool, gentle eyes, tiny ears, and a sweet smile',
    'lamb': 'a baby lamb with fluffy white wool, big innocent eyes, and a playful bounce',
    'princess': 'a young princess with flowing hair, a sparkly dress, a small tiara, and kind eyes',
    'prince': 'a young prince with neat hair, a royal blue jacket, a small crown, and a brave smile',
    'fairy': 'a tiny fairy with rainbow wings, a flower petal dress, and sparkling eyes',
    'wizard': 'a young wizard with a purple robe with stars, a pointy hat, and a magic wand',
    'knight': 'a young knight in shining silver armor, a blue cape, and a friendly smile',
    'pirate': 'a young pirate with a red bandana, an eye patch, and an adventurous grin',
    'mermaid': 'a young mermaid with a colorful tail, flowing hair, and a seashell top',
    'robot': 'a friendly robot with a boxy body, blinking lights, and a happy screen face',
    'dinosaur': 'a cute baby dinosaur with green scales, big eyes, and a long tail',
    // Inanimate objects that can be characters (Beauty and the Beast style)
    'cup': 'a delicate porcelain teacup with golden trim, rosy cheeks painted on, big sparkling eyes, and a warm smile',
    'teacup': 'a delicate porcelain teacup with golden trim, rosy cheeks painted on, big sparkling eyes, and a warm smile',
    'teapot': 'a round friendly teapot with a curved spout, painted floral designs, kind eyes, and a motherly smile',
    'clock': 'an ornate grandfather clock with a friendly clock face, brass pendulum, and wise expression',
    'candle': 'a tall golden candlestick with a flickering flame, elegant arms, and a charming French mustache',
    'candlestick': 'a tall golden candlestick with a flickering flame, elegant arms, and a charming expression',
    'book': 'a magical leather-bound book with golden pages, sparkling letters, and a wise face on the cover',
    'lamp': 'a friendly brass lamp with a warm glowing light, curved handle, and a gentle smile',
    'spoon': 'a shiny silver spoon with a smiling face, curved handle like arms, and a cheerful expression',
    'fork': 'a polished silver fork with a friendly face and prongs that wave like fingers',
    'plate': 'a decorated dinner plate with a painted face, floral border, and a welcoming smile',
    'toy': 'a beloved stuffed toy with button eyes, soft fabric body, and a heartwarming smile',
    'doll': 'a beautiful porcelain doll with painted rosy cheeks, curly hair, and a pretty dress',
    'train': 'a cheerful toy train with a smiling face on the front, puffing steam, and bright red wheels',
    'car': 'a cute little car with headlight eyes, a bumper smile, and shiny paint',
    'boat': 'a friendly little boat with a painted face on the bow and colorful sails',
    'balloon': 'a bright red balloon with a happy face, floating gently with a curly string',
    'star': 'a twinkling golden star with a glowing face, sparkling points, and a magical glow',
    'sun': 'a warm smiling sun with golden rays, rosy cheeks, and a cheerful expression',
    'moon': 'a gentle crescent moon with a peaceful sleeping face and a soft silver glow',
    'flower': 'a beautiful flower with colorful petals forming a face, green stem arms, and a sweet smile',
    'tree': 'a wise old tree with a kind face in the bark, leafy branches like arms, and deep roots'
  }

  // Return the consistent description, or create a detailed generic one
  const description = characterDescriptions[characterType] || `cute and friendly with big expressive eyes and a warm smile`
  return description
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
  const lowerText = (text + ' ' + originalPrompt).toLowerCase()
  const foundCharacters: string[] = []

  // Check for famous characters first (Disney, Marvel, etc.)
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
      // Capitalize properly
      const properName = char.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      if (!foundCharacters.includes(properName)) {
        foundCharacters.push(properName)
      }
    }
  }

  // Then check for regular animals/characters
  const regularCharacters = [
    'squirrel', 'chipmunk', 'mouse', 'rabbit', 'bunny', 'cat', 'kitten', 'dog', 'puppy',
    'bear', 'fox', 'wolf', 'deer', 'owl', 'bird', 'duck', 'duckling',
    'dragon', 'unicorn', 'horse', 'pony', 'elephant', 'lion', 'tiger', 'monkey',
    'pig', 'chicken', 'cow', 'sheep', 'goat', 'frog', 'turtle', 'fish', 'dolphin',
    'butterfly', 'bee', 'ladybug', 'penguin', 'polar bear', 'otter', 'beaver',
    'hedgehog', 'raccoon', 'dinosaur', 'robot',
    'princess', 'prince', 'fairy', 'wizard', 'witch', 'knight', 'pirate', 'mermaid',
    'boy', 'girl', 'child', 'kid'
  ]

  for (const char of regularCharacters) {
    if (lowerText.includes(char) && !foundCharacters.some(fc => fc.toLowerCase().includes(char))) {
      // Don't add "duck" if we already have "Donald Duck"
      foundCharacters.push('a cute ' + char)
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


function extractCharacterName(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase()

  // Try to find a character type
  const animals = ['dog', 'cat', 'dragon', 'unicorn', 'bear', 'lion', 'elephant', 'monkey', 'rabbit', 'fox', 'dinosaur', 'bird']
  for (const animal of animals) {
    if (lowerPrompt.includes(animal)) {
      return animal
    }
  }

  const people = ['princess', 'prince', 'knight', 'wizard', 'fairy', 'pirate']
  for (const person of people) {
    if (lowerPrompt.includes(person)) {
      return person
    }
  }

  return 'our hero'
}

// Extract character type from text
function extractCharacterType(pageText: string, originalPrompt: string): string {
  const combinedText = `${pageText} ${originalPrompt}`.toLowerCase()

  // Comprehensive list of characters to search for (including objects that can be characters)
  const characterTypes = [
    // Animals
    'squirrel', 'chipmunk', 'dog', 'puppy', 'cat', 'kitten', 'dragon', 'unicorn',
    'bear', 'rabbit', 'bunny', 'fox', 'owl', 'bird', 'deer', 'fawn', 'elephant',
    'lion', 'tiger', 'monkey', 'mouse', 'penguin', 'turtle', 'frog', 'butterfly',
    'bee', 'hedgehog', 'otter', 'beaver', 'raccoon', 'sheep', 'lamb',
    // People/Fantasy
    'princess', 'prince', 'fairy', 'wizard', 'knight', 'pirate', 'mermaid', 'robot', 'dinosaur',
    // Inanimate objects (Beauty and the Beast style characters)
    'teacup', 'cup', 'teapot', 'clock', 'candle', 'candlestick', 'book', 'lamp',
    'spoon', 'fork', 'plate', 'toy', 'doll', 'train', 'car', 'boat', 'balloon',
    'star', 'sun', 'moon', 'flower', 'tree'
  ]

  for (const charType of characterTypes) {
    if (combinedText.includes(charType)) {
      return charType
    }
  }

  // Check for famous characters
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
