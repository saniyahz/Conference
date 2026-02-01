import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Character DNA interface for visual consistency
interface CharacterDNA {
  name: string
  type: 'human' | 'animal' | 'object' | 'creature' | 'other'
  physical_form: string
  material_or_texture: string
  color_palette: string[]
  facial_features: string
  accessories: string
  personality_visuals: string
  movement_style: string
  unique_identifiers: string
}

// Generate environment-specific negative prompt - EXACT format user specified
function generateNegativePrompt(pageText: string): string {
  const lowerText = pageText.toLowerCase()

  // Base items to always block (user's exact format)
  const baseNegative = 'photorealistic, realistic, 3d render, anime, text, logo, watermark, extra characters'

  // For underwater scenes - block ALL land elements
  if (lowerText.includes('ocean') || lowerText.includes('underwater') || lowerText.includes('sea') ||
      lowerText.includes('shark') || lowerText.includes('fish') || lowerText.includes('coral') ||
      lowerText.includes('whale') || lowerText.includes('dolphin')) {
    return `${baseNegative}, forest, trees, grass, flowers, dogs, cats, farm animals, houses, castles, villages, mountains, daytime sky, land, ground`
  }

  // For space scenes - block ALL earth elements
  if (lowerText.includes('space') || lowerText.includes('star') || lowerText.includes('moon') ||
      lowerText.includes('planet') || lowerText.includes('rocket') || lowerText.includes('cosmic') ||
      lowerText.includes('galaxy') || lowerText.includes('astronaut')) {
    return `${baseNegative}, forest, trees, grass, flowers, dogs, cats, farm animals, houses, castles, villages, mountains, ocean, water, land, ground`
  }

  // For sky scenes
  if (lowerText.includes('cloud') || lowerText.includes('flying') || lowerText.includes('soaring')) {
    return `${baseNegative}, indoor, houses, buildings, underwater, ocean, forest`
  }

  // For indoor scenes
  if (lowerText.includes('house') || lowerText.includes('home') || lowerText.includes('room') ||
      lowerText.includes('inside') || lowerText.includes('kitchen') || lowerText.includes('bedroom')) {
    return `${baseNegative}, forest, trees, wilderness, underwater, ocean, space`
  }

  // Default - block common wrong environments
  return `${baseNegative}, forest, trees, grass, flowers, dogs, cats, farm animals, houses, castles, villages, mountains, daytime sky`
}

// Base image prompt - includes scene vs portrait instruction
const BASE_IMAGE_PROMPT = `Children's picture book illustration, soft watercolor style.

This is a story scene illustration, not a character portrait.`

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid prompt provided' },
        { status: 400 }
      )
    }

    // Use Replicate Llama to generate story with Character DNA
    const systemPrompt = `You are an AI children's storybook author and visual director.

Your job is to:
1. Generate a complete children's story with a clear beginning, middle, end, and moral.
2. Create visually consistent characters that may be human, animal, object, or magical beings.
3. Ensure every story page has a matching image scene description suitable for illustration.
4. Maintain strict visual consistency across all pages.

IMPORTANT RULES:
- Characters must NEVER change appearance, materials, colors, or accessories.
- Do NOT introduce new characters unless explicitly mentioned in the child's idea.
- The story must be age-appropriate, gentle, kind, and emotionally safe.
- Themes should include kindness, curiosity, courage, and not fearing the unknown.
- Objects and animals may have expressive faces ONLY if defined in character DNA.
- The visual description for each page must match the story text exactly.
- The story should be EXACTLY 10 pages long.
- Each page should be 5-8 sentences - rich, engaging, detailed content.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

CHARACTER_DNA:
{
  "name": "[character name]",
  "type": "[human/animal/object/creature/other]",
  "physical_form": "[body shape and size description]",
  "material_or_texture": "[fur/skin/fabric/material type]",
  "color_palette": ["primary color", "secondary color", "accent color"],
  "facial_features": "[big round sparkly eyes, small cute nose, rosy cheeks, warm smile]",
  "accessories": "[any clothing, hats, glasses, etc. or 'none']",
  "personality_visuals": "[how emotions show - bouncy when happy, droopy when sad]",
  "movement_style": "[how they move - waddles, hops, floats, etc.]",
  "unique_identifiers": "[special marks, patterns, or features that make them unique]"
}

STORY_WORLD_DNA:
[2-3 sentences describing the world's visual style - colors, lighting, atmosphere, setting type]

TITLE: [Creative title based on their idea]

PAGE 1:
TEXT: [5-8 sentences - introduction of main character, their personality, and their beautiful world]
SCENE: [Visual description of exactly what to illustrate - character pose, expression, setting, lighting]

PAGE 2:
TEXT: [5-8 sentences - character's daily life, what they love to do, their friends]
SCENE: [Visual description for illustration]

PAGE 3:
TEXT: [5-8 sentences - something interesting happens, adventure begins]
SCENE: [Visual description for illustration]

PAGE 4:
TEXT: [5-8 sentences - problem or challenge is discovered, character reacts with emotion]
SCENE: [Visual description for illustration]

PAGE 5:
TEXT: [5-8 sentences - character decides to face the challenge, gathers courage]
SCENE: [Visual description for illustration]

PAGE 6:
TEXT: [5-8 sentences - working to solve problem, trying first approach]
SCENE: [Visual description for illustration]

PAGE 7:
TEXT: [5-8 sentences - setback or complication, character learns something important]
SCENE: [Visual description for illustration]

PAGE 8:
TEXT: [5-8 sentences - teamwork and new strategy, friends help]
SCENE: [Visual description for illustration]

PAGE 9:
TEXT: [5-8 sentences - problem solved successfully, moment of triumph]
SCENE: [Visual description for illustration]

PAGE 10:
TEXT: [5-8 sentences - celebration, what they learned, happy ending with friends and family]
SCENE: [Visual description for illustration]`

    const userPrompt = `A child wants a story about: "${prompt}". Create a unique, magical 10-page story with complete Character DNA and scene descriptions!`

    const output = await replicate.run(
      "meta/meta-llama-3.1-405b-instruct",
      {
        input: {
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          temperature: 0.9,
          max_tokens: 4000,
          top_p: 0.9,
        }
      }
    ) as string[]

    const storyText = output.join('')

    // Parse the story with Character DNA
    const story = parseStoryWithDNA(storyText, prompt)

    // Generate image prompts using Character DNA template
    const { prompts: imagePrompts, negativePrompts } = generateImagePromptsWithDNA(story)

    // DEBUG: Log first image prompt to verify environment detection
    console.log(`\n========== STORY GENERATED ==========`)
    console.log(`Title: ${story.title}`)
    console.log(`\n--- PAGE 1 TEXT ---`)
    console.log(story.pages[0]?.text?.substring(0, 200))
    console.log(`\n--- PAGE 1 IMAGE PROMPT ---`)
    console.log(imagePrompts[0])
    console.log(`\n--- PAGE 1 NEGATIVE PROMPT ---`)
    console.log(negativePrompts[0])
    console.log(`=====================================\n`)

    return NextResponse.json({
      story: {
        title: story.title,
        pages: story.pages,
        originalPrompt: prompt,
        characterDNA: story.characterDNA,
        storyWorldDNA: story.storyWorldDNA,
      },
      imagePrompts,
      negativePrompts, // Now page-specific!
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

// Generate image prompts using Character DNA template
// Formula: FINAL_IMAGE_PROMPT = BASE_IMAGE_PROMPT + PAGE_IMAGE_SCENE
function generateImagePromptsWithDNA(story: any): { prompts: string[]; negativePrompts: string[] } {
  const characterDNA = story.characterDNA
  const storyWorldDNA = story.storyWorldDNA

  const prompts: string[] = []
  const negativePrompts: string[] = []

  story.pages.forEach((page: any, index: number) => {
    const pageText = page.text || ''
    const sceneDescription = page.scene || extractSceneFromText(pageText)

    // Build the page-specific scene content WITH environment detection
    const pageImageScene = buildPageImageScene(characterDNA, storyWorldDNA, sceneDescription, pageText)

    // Combine: BASE_IMAGE_PROMPT + PAGE_IMAGE_SCENE
    prompts.push(BASE_IMAGE_PROMPT + "\n\n" + pageImageScene)

    // Generate environment-specific negative prompt for this page
    negativePrompts.push(generateNegativePrompt(pageText))
  })

  return { prompts, negativePrompts }
}

// Build the page-specific image scene description
// SIMPLIFIED: Character lock FIRST (most attention), then scene, then style
// Models only pay attention to first ~77 tokens - keep it SHORT
function buildPageImageScene(characterDNA: CharacterDNA, storyWorldDNA: string, sceneDescription: string, pageText: string): string {
  // Extract the ACTUAL environment from the page text
  const environment = extractEnvironmentFromText(pageText, storyWorldDNA)

  // Extract key objects that MUST appear
  const keyObjects = extractKeyObjects(pageText)

  // Build SHORT character lock - this goes FIRST (gets most attention)
  const charLock = buildShortCharacterLock(characterDNA)

  // Build SHORT scene description with key objects
  const sceneShort = buildShortScene(keyObjects, environment.type, sceneDescription)

  // SIMPLE PROMPT FORMAT:
  // 1. Character (FIRST - most attention)
  // 2. Scene with key objects (SECOND)
  // 3. Style (LAST)
  return `${charLock}

${sceneShort}

Children's book illustration, soft watercolor, cute rounded style, gentle colors.`
}

// Build SHORT character lock - under 30 words
function buildShortCharacterLock(dna: CharacterDNA): string {
  // Extract the most important visual features only
  const skinTone = extractSkinTone(dna)
  const hairDesc = extractHairDescription(dna)
  const clothingDesc = dna.accessories !== 'none' ? dna.accessories : 'simple colorful clothes'

  return `Young ${dna.type === 'human' ? 'child' : dna.type}, ${skinTone}, ${hairDesc}, big round eyes, rosy cheeks, ${clothingDesc}.`
}

// Extract skin tone from DNA
function extractSkinTone(dna: CharacterDNA): string {
  const colors = dna.color_palette.join(' ').toLowerCase()
  if (colors.includes('brown') || colors.includes('dark')) return 'dark brown skin'
  if (colors.includes('tan') || colors.includes('olive')) return 'tan skin'
  if (colors.includes('rosy') || colors.includes('pink')) return 'light rosy skin'
  return 'warm skin tone'
}

// Extract hair description from DNA
function extractHairDescription(dna: CharacterDNA): string {
  const form = dna.physical_form.toLowerCase()
  const colors = dna.color_palette.join(' ').toLowerCase()

  // Try to extract hair info
  if (form.includes('curly') || form.includes('afro')) {
    if (colors.includes('pink')) return 'big pink curly hair'
    if (colors.includes('brown')) return 'brown curly hair'
    return 'curly hair'
  }
  if (form.includes('straight')) return 'straight hair'
  if (form.includes('long')) return 'long hair'

  // Default based on color
  if (colors.includes('golden') || colors.includes('blonde')) return 'golden blonde hair'
  if (colors.includes('brown')) return 'brown hair'
  if (colors.includes('black')) return 'black hair'
  if (colors.includes('red') || colors.includes('ginger')) return 'red hair'

  return 'soft hair'
}

// Extract KEY objects from text that must appear in image
function extractKeyObjects(pageText: string): string[] {
  const objects: string[] = []
  const lowerText = pageText.toLowerCase()

  // High-priority objects (vehicles, major items)
  const priorityObjects: { [key: string]: string } = {
    'rocket': 'silver rocket ship',
    'spaceship': 'silver spaceship',
    'ship': 'ship',
    'moon': 'glowing moon',
    'planet': 'colorful planet',
    'star': 'twinkling stars',
    'shark': '2 friendly sharks',
    'dolphin': '3 playful dolphins',
    'whale': 'big friendly whale',
    'octopus': 'cute octopus',
    'jellyfish': 'glowing jellyfish',
    'fish': 'colorful fish',
    'treasure': 'golden treasure chest',
    'crown': 'sparkling crown',
    'castle': 'magical castle',
    'dragon': 'friendly dragon',
    'unicorn': 'magical unicorn',
    'rainbow': 'bright rainbow',
    'butterfly': 'colorful butterflies',
    'balloon': 'colorful balloons',
  }

  for (const [key, desc] of Object.entries(priorityObjects)) {
    if (lowerText.includes(key)) {
      objects.push(desc)
    }
  }

  return objects.slice(0, 3) // Max 3 key objects
}

// Build SHORT scene description
function buildShortScene(keyObjects: string[], envType: string, sceneDesc: string): string {
  // Environment setting
  let env = ''
  switch (envType) {
    case 'underwater ocean':
      env = 'Underwater ocean scene, blue water, bubbles.'
      break
    case 'outer space':
      env = 'Outer space scene, dark starry sky.'
      break
    case 'sky':
      env = 'High in the sky, fluffy clouds.'
      break
    case 'forest meadow':
      env = 'Forest meadow, green grass, flowers.'
      break
    default:
      env = 'Magical storybook world.'
  }

  // Add key objects
  const objectsStr = keyObjects.length > 0
    ? `With: ${keyObjects.join(', ')}.`
    : ''

  return `${env} ${objectsStr}`
}

// Extract scene elements WITH COUNTS for production-grade prompts
interface SceneElement {
  name: string
  count: number
  type: 'character' | 'object' | 'nature'
}

interface SceneElements {
  characters: SceneElement[]
  objects: SceneElement[]
  nature: SceneElement[]
  action: string | null
}

function extractSceneElementsWithCounts(pageText: string): SceneElements {
  const lowerText = pageText.toLowerCase()
  const result: SceneElements = { characters: [], objects: [], nature: [], action: null }

  // Character definitions with singular/plural forms
  const characters: { singular: string; plural: string; friendly: boolean }[] = [
    { singular: 'shark', plural: 'sharks', friendly: true },
    { singular: 'dolphin', plural: 'dolphins', friendly: true },
    { singular: 'whale', plural: 'whales', friendly: true },
    { singular: 'fish', plural: 'fish', friendly: true },
    { singular: 'octopus', plural: 'octopuses', friendly: true },
    { singular: 'turtle', plural: 'turtles', friendly: true },
    { singular: 'crab', plural: 'crabs', friendly: true },
    { singular: 'jellyfish', plural: 'jellyfish', friendly: true },
    { singular: 'seahorse', plural: 'seahorses', friendly: true },
    { singular: 'mermaid', plural: 'mermaids', friendly: true },
    { singular: 'bird', plural: 'birds', friendly: true },
    { singular: 'owl', plural: 'owls', friendly: true },
    { singular: 'butterfly', plural: 'butterflies', friendly: true },
    { singular: 'bee', plural: 'bees', friendly: true },
    { singular: 'rabbit', plural: 'rabbits', friendly: true },
    { singular: 'bunny', plural: 'bunnies', friendly: true },
    { singular: 'fox', plural: 'foxes', friendly: true },
    { singular: 'deer', plural: 'deer', friendly: true },
    { singular: 'bear', plural: 'bears', friendly: true },
    { singular: 'squirrel', plural: 'squirrels', friendly: true },
    { singular: 'dragon', plural: 'dragons', friendly: true },
    { singular: 'unicorn', plural: 'unicorns', friendly: true },
    { singular: 'fairy', plural: 'fairies', friendly: true },
    { singular: 'dog', plural: 'dogs', friendly: true },
    { singular: 'cat', plural: 'cats', friendly: true },
    { singular: 'puppy', plural: 'puppies', friendly: true },
    { singular: 'kitten', plural: 'kittens', friendly: true },
  ]

  // Check for characters with counts
  for (const char of characters) {
    if (lowerText.includes(char.plural)) {
      // Plural found - default to 2-3
      result.characters.push({
        name: `friendly ${char.plural}`,
        count: 2,
        type: 'character'
      })
    } else if (lowerText.includes(char.singular)) {
      // Singular found
      result.characters.push({
        name: `friendly ${char.singular}`,
        count: 1,
        type: 'character'
      })
    }
  }

  // Objects
  const objectList = ['rocket', 'spaceship', 'treasure', 'chest', 'crown', 'wand', 'book', 'map', 'castle', 'tower', 'boat', 'ship', 'balloon']
  for (const obj of objectList) {
    if (lowerText.includes(obj)) {
      result.objects.push({ name: obj, count: 1, type: 'object' })
    }
  }

  // Nature elements
  const natureList = ['rainbow', 'waterfall', 'mountain', 'river', 'lake', 'flower', 'tree', 'cloud', 'star', 'moon', 'planet', 'sun']
  for (const item of natureList) {
    if (lowerText.includes(item + 's')) {
      result.nature.push({ name: item + 's', count: 3, type: 'nature' })
    } else if (lowerText.includes(item)) {
      result.nature.push({ name: item, count: 1, type: 'nature' })
    }
  }

  // Extract action
  const actions = ['swimming', 'flying', 'jumping', 'running', 'dancing', 'hugging', 'waving', 'splash', 'floating', 'climbing']
  for (const action of actions) {
    if (lowerText.includes(action)) {
      result.action = action
      break
    }
  }

  return result
}

// Determine camera framing based on scene complexity
function determineCameraFraming(elements: SceneElements): string {
  const totalElements = elements.characters.length + elements.objects.length

  if (totalElements >= 3) {
    return 'Wide shot showing full scene'
  } else if (totalElements >= 1) {
    return 'Medium-wide shot showing main character plus surrounding elements'
  } else {
    return 'Medium shot focused on main character with environment visible'
  }
}

// Extract emotion from page text
function extractEmotion(pageText: string): string {
  const lowerText = pageText.toLowerCase()

  if (lowerText.includes('excited') || lowerText.includes('thrilled') || lowerText.includes('joy')) {
    return 'Looking excited and happy, big smile'
  }
  if (lowerText.includes('scared') || lowerText.includes('afraid') || lowerText.includes('fear')) {
    return 'Looking slightly nervous but brave'
  }
  if (lowerText.includes('curious') || lowerText.includes('wonder')) {
    return 'Looking curious with wide eyes'
  }
  if (lowerText.includes('sad') || lowerText.includes('cry')) {
    return 'Looking sad with gentle expression'
  }
  if (lowerText.includes('surprised') || lowerText.includes('amazed')) {
    return 'Looking surprised with mouth slightly open'
  }
  if (lowerText.includes('brave') || lowerText.includes('determined')) {
    return 'Looking determined and confident'
  }
  if (lowerText.includes('happy') || lowerText.includes('laugh')) {
    return 'Looking happy and joyful'
  }

  return 'Looking friendly and engaged'
}

// Generate position descriptions for elements
function generatePositions(mainCharName: string, elements: SceneElements): string {
  const positions: string[] = []

  positions.push(`- ${mainCharName} in the center of the image`)

  if (elements.characters.length === 1) {
    positions.push(`- ${elements.characters[0].name} clearly visible beside ${mainCharName}`)
  } else if (elements.characters.length === 2) {
    positions.push(`- ${elements.characters[0].name} on the left side`)
    positions.push(`- ${elements.characters[1].name} on the right side`)
  } else if (elements.characters.length > 2) {
    positions.push(`- Characters arranged around ${mainCharName} in a loose circle`)
    positions.push(`- All characters clearly visible, not hidden or cut off`)
  }

  if (elements.objects.length > 0) {
    positions.push(`- ${elements.objects.map(o => o.name).join(', ')} visible in the scene`)
  }

  if (elements.nature.length > 0) {
    positions.push(`- Background includes: ${elements.nature.map(n => n.name).join(', ')}`)
  }

  return positions.join('\n')
}

// Format character DNA into a clean block for the prompt
function formatCharacterBlock(dna: CharacterDNA): string {
  const colors = dna.color_palette.join(', ')
  return `${dna.name} - a cute ${dna.type} with ${dna.physical_form}. ${dna.material_or_texture}. Colors: ${colors}. ${dna.facial_features}. ${dna.accessories !== 'none' ? `Wearing: ${dna.accessories}.` : ''} ${dna.unique_identifiers}.`
}

// Get environment-specific STRICT restrictions
function getStrictRestrictions(envType: string): string {
  switch (envType) {
    case 'underwater ocean':
      return 'No extra characters. No land, trees, grass, or buildings. No sky visible. No text, logos, or watermarks.'
    case 'outer space':
      return 'No extra characters. No land, trees, grass, or buildings. No water or ocean. No text, logos, or watermarks.'
    case 'sky':
      return 'No extra characters. Minimal ground visible. No underwater elements. No text, logos, or watermarks.'
    case 'indoor':
      return 'No extra characters. No outdoor wilderness. No text, logos, or watermarks.'
    case 'forest meadow':
      return 'No extra characters. No space or underwater elements. No text, logos, or watermarks.'
    default:
      return 'No extra characters. No text, logos, or watermarks.'
  }
}

// Get simple, direct environment statement - EXACT user format
function getEnvironmentStatement(envType: string): string {
  switch (envType) {
    case 'underwater ocean':
      return 'This scene takes place underwater in the ocean, not on land.'
    case 'outer space':
      return 'This scene takes place in outer space, not on land.'
    case 'sky':
      return 'This scene takes place high in the sky among clouds.'
    case 'indoor':
      return 'This scene takes place inside a cozy room.'
    case 'forest meadow':
      return 'This scene takes place in a peaceful forest meadow.'
    default:
      return 'This scene takes place in a magical storybook world.'
  }
}

// Extract environment type and description from page text
// CRITICAL: Returns explicit, literal environment descriptions
function extractEnvironmentFromText(pageText: string, fallbackWorld: string): { type: string; description: string } {
  const lowerText = pageText.toLowerCase()

  // Check for underwater/ocean environment
  if (lowerText.includes('ocean') || lowerText.includes('underwater') || lowerText.includes('sea') ||
      lowerText.includes('coral') || lowerText.includes('fish') || lowerText.includes('shark') ||
      lowerText.includes('whale') || lowerText.includes('dolphin') || lowerText.includes('swim')) {
    return {
      type: 'underwater ocean',
      description: 'Deep blue underwater ocean scene. Blue-green water everywhere. Light rays filtering from above. Coral reef, seaweed, bubbles, small fish swimming. This is UNDERWATER - no sky, no land, no trees, no grass, no buildings visible.'
    }
  }

  // Check for space environment
  if (lowerText.includes('space') || lowerText.includes('star') || lowerText.includes('moon') ||
      lowerText.includes('planet') || lowerText.includes('rocket') || lowerText.includes('galaxy') ||
      lowerText.includes('cosmic') || lowerText.includes('astronaut')) {
    return {
      type: 'outer space',
      description: 'Dark outer space scene. Black/navy sky filled with twinkling stars. Moon or planets visible in background. This is OUTER SPACE - no trees, no grass, no water, no buildings, no earth scenery.'
    }
  }

  // Check for sky/cloud environment
  if (lowerText.includes('cloud') || lowerText.includes('sky') || lowerText.includes('flying') ||
      lowerText.includes('above the') || lowerText.includes('bird')) {
    return {
      type: 'sky',
      description: 'High in the sky scene. Blue sky with white fluffy clouds. Aerial view, flying perspective. Minimal ground visible far below.'
    }
  }

  // Check for indoor environment
  if (lowerText.includes('house') || lowerText.includes('home') || lowerText.includes('room') ||
      lowerText.includes('kitchen') || lowerText.includes('bedroom') || lowerText.includes('inside')) {
    return {
      type: 'indoor',
      description: 'Cozy indoor room scene. Warm lighting, furniture visible. Inside a house or building.'
    }
  }

  // Check for forest/meadow environment (default for many stories)
  if (lowerText.includes('forest') || lowerText.includes('tree') || lowerText.includes('meadow') ||
      lowerText.includes('garden') || lowerText.includes('flower') || lowerText.includes('grass')) {
    return {
      type: 'forest meadow',
      description: 'Peaceful forest meadow scene. Green trees, colorful flowers, soft grass. Warm sunlight, nature setting.'
    }
  }

  // Default - use story world DNA but mark as generic
  return {
    type: 'magical world',
    description: fallbackWorld
  }
}

// Generate restrictions based on what environment type we DON'T want
function generateEnvironmentRestrictions(envType: string): string {
  const baseRestrictions = '- No extra characters not listed above\n- No random animals in background'

  switch (envType) {
    case 'underwater':
      return `${baseRestrictions}
- No humans
- No land animals (cats, dogs, rabbits, bears)
- No forests or trees
- No grass or land
- No castles or buildings
- No sky (we are underwater)`

    case 'space':
      return `${baseRestrictions}
- No humans unless specified
- No land animals
- No forests or trees
- No water or ocean
- No grass or ground scenery
- No earthly buildings`

    case 'sky':
      return `${baseRestrictions}
- No ground-level details
- No buildings unless flying past
- Minimal land visible (aerial view)`

    case 'indoor':
      return `${baseRestrictions}
- No outdoor scenery through windows unless specified
- No wild animals
- No forests or nature scenes`

    case 'forest':
      return `${baseRestrictions}
- No ocean or underwater elements
- No space elements
- No buildings unless specified`

    default:
      return `${baseRestrictions}
- Match the environment described in the text exactly
- Do not add unrelated scenery`
  }
}

// Format character DNA into clean prompt text
function formatCharacterForPrompt(dna: CharacterDNA): string {
  const colors = dna.color_palette.join(', ')

  return `1. ${dna.name} – a friendly ${dna.type}
   - Color: ${colors}
   - Shape: ${dna.physical_form}
   - Texture: ${dna.material_or_texture}
   - Face: ${dna.facial_features}
   - Accessories: ${dna.accessories}
   - Movement: ${dna.movement_style}
   - Unique features: ${dna.unique_identifiers}`
}

// Parse story response that includes Character DNA
function parseStoryWithDNA(text: string, originalPrompt: string) {
  // Extract Character DNA JSON
  let characterDNA: CharacterDNA | null = null
  const dnaMatch = text.match(/CHARACTER_DNA:\s*(\{[\s\S]*?\})\s*(?=STORY_WORLD_DNA|TITLE)/i)
  if (dnaMatch) {
    try {
      characterDNA = JSON.parse(dnaMatch[1])
    } catch (e) {
      // If JSON parsing fails, create default DNA
      characterDNA = createDefaultCharacterDNA(originalPrompt)
    }
  } else {
    characterDNA = createDefaultCharacterDNA(originalPrompt)
  }

  // Extract Story World DNA
  let storyWorldDNA = 'A soft, dreamy world painted in gentle pastel colors with warm golden sunlight, fluffy clouds, and magical sparkles floating in the air. Cozy cottages, friendly forests, and rainbow-touched meadows.'
  const worldMatch = text.match(/STORY_WORLD_DNA:\s*([\s\S]*?)(?=TITLE:)/i)
  if (worldMatch) {
    storyWorldDNA = worldMatch[1].trim()
  }

  // Extract title
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|PAGE)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'My Amazing Story'

  // Extract pages with TEXT and SCENE
  const pages: { text: string; scene: string }[] = []

  for (let i = 1; i <= 10; i++) {
    const pageRegex = new RegExp(`PAGE ${i}:[\\s\\S]*?TEXT:\\s*([\\s\\S]*?)(?:SCENE:\\s*([\\s\\S]*?))?(?=PAGE ${i + 1}:|$)`, 'i')
    const pageMatch = text.match(pageRegex)

    if (pageMatch) {
      const pageText = pageMatch[1].trim().replace(/\n\n+/g, ' ').replace(/SCENE:.*$/i, '').trim()
      const sceneText = pageMatch[2] ? pageMatch[2].trim().replace(/\n\n+/g, ' ') : ''
      pages.push({ text: pageText, scene: sceneText })
    } else {
      // Fallback: try old format without TEXT:/SCENE: markers
      const oldPageRegex = new RegExp(`PAGE ${i}:\\s*(.+?)(?=PAGE ${i + 1}:|$)`, 'is')
      const oldPageMatch = text.match(oldPageRegex)
      if (oldPageMatch) {
        const pageText = oldPageMatch[1].trim().replace(/\n\n+/g, ' ')
        pages.push({ text: pageText, scene: '' })
      }
    }
  }

  // Fallback if parsing fails
  if (pages.length < 8) {
    return parseStoryFallback(text, originalPrompt, characterDNA, storyWorldDNA)
  }

  // Ensure exactly 10 pages
  while (pages.length < 10) {
    pages.push({ text: 'And the magical adventure continued with wonder, love, and joy...', scene: 'A beautiful magical scene with the main character smiling happily.' })
  }

  return {
    title,
    pages: pages.slice(0, 10),
    characterDNA,
    storyWorldDNA,
  }
}

// Create default Character DNA from prompt
function createDefaultCharacterDNA(prompt: string): CharacterDNA {
  const characterInfo = extractCharacterInfo(prompt)

  return {
    name: characterInfo.name,
    type: characterInfo.type as any,
    physical_form: `Small, cute, rounded ${characterInfo.creature} body with soft proportions`,
    material_or_texture: characterInfo.texture,
    color_palette: characterInfo.colors,
    facial_features: 'Big round sparkly eyes with large pupils, tiny cute nose, rosy pink cheeks, warm friendly smile',
    accessories: 'none',
    personality_visuals: 'Bounces slightly when happy, ears/body droop when sad, eyes sparkle when curious',
    movement_style: characterInfo.movement,
    unique_identifiers: `A lovable ${characterInfo.creature} with an especially warm and friendly expression`
  }
}

// Extract character info from prompt for DNA
function extractCharacterInfo(prompt: string): { name: string; type: string; creature: string; texture: string; colors: string[]; movement: string } {
  const lowerPrompt = prompt.toLowerCase()

  // Check for named character pattern
  const namedMatch = prompt.match(/\b([A-Z][a-z]+)\s+the\s+([A-Za-z]+)/i)
  const name = namedMatch ? namedMatch[1] : 'Little Friend'
  const creature = namedMatch ? namedMatch[2].toLowerCase() : extractCreatureType(prompt)

  // Determine type and attributes based on creature
  let type = 'animal'
  let texture = 'soft fluffy fur'
  let colors = ['warm brown', 'cream', 'pink']
  let movement = 'waddles and hops playfully'

  if (['ant', 'bee', 'bug', 'butterfly', 'ladybug', 'caterpillar'].some(c => lowerPrompt.includes(c))) {
    type = 'creature'
    texture = 'smooth shiny shell or soft fuzzy body'
    colors = ['bright red', 'sunny yellow', 'black spots']
    movement = 'scurries and flutters with tiny legs/wings'
  } else if (['cup', 'spoon', 'book', 'toy', 'ball', 'lamp'].some(c => lowerPrompt.includes(c))) {
    type = 'object'
    texture = 'smooth ceramic or soft plush material'
    colors = ['cheerful blue', 'warm cream', 'golden yellow']
    movement = 'bounces and wobbles with personality'
  } else if (['dragon', 'unicorn', 'fairy', 'mermaid', 'wizard'].some(c => lowerPrompt.includes(c))) {
    type = 'creature'
    texture = 'soft scales or magical sparkly skin'
    colors = ['magical purple', 'shimmery pink', 'golden sparkles']
    movement = 'floats and glides gracefully'
  } else if (['cat', 'kitten'].some(c => lowerPrompt.includes(c))) {
    texture = 'soft fluffy fur'
    colors = ['orange tabby', 'cream white', 'pink nose']
    movement = 'pounces and prances gracefully'
  } else if (['dog', 'puppy'].some(c => lowerPrompt.includes(c))) {
    texture = 'soft fluffy fur'
    colors = ['golden brown', 'cream white', 'black nose']
    movement = 'bounds and wags tail happily'
  } else if (['bear', 'beaver'].some(c => lowerPrompt.includes(c))) {
    texture = 'soft fluffy brown fur'
    colors = ['warm brown', 'tan belly', 'dark brown nose']
    movement = 'waddles and lumbers gently'
  } else if (['bunny', 'rabbit'].some(c => lowerPrompt.includes(c))) {
    texture = 'soft fluffy fur'
    colors = ['fluffy white', 'soft pink', 'cotton tail']
    movement = 'hops and bounces joyfully'
  } else if (['bird', 'owl', 'duck'].some(c => lowerPrompt.includes(c))) {
    texture = 'soft colorful feathers'
    colors = ['sky blue', 'sunny yellow', 'orange beak']
    movement = 'flutters and hops lightly'
  } else if (['elephant', 'hippo', 'rhino'].some(c => lowerPrompt.includes(c))) {
    texture = 'smooth soft gray skin'
    colors = ['gentle gray', 'soft pink', 'warm cream']
    movement = 'stomps gently and sways'
  } else if (['princess', 'prince', 'girl', 'boy', 'child'].some(c => lowerPrompt.includes(c))) {
    type = 'human'
    texture = 'soft rosy skin'
    colors = ['rosy pink', 'golden hair', 'blue dress']
    movement = 'skips and twirls gracefully'
  }

  return { name, type, creature, texture, colors, movement }
}

// Extract creature type from prompt
function extractCreatureType(prompt: string): string {
  const creatures = ['ant', 'bee', 'bear', 'beaver', 'bunny', 'rabbit', 'cat', 'dog', 'puppy', 'kitten', 'bird', 'owl', 'duck', 'elephant', 'lion', 'tiger', 'fox', 'mouse', 'squirrel', 'dragon', 'unicorn', 'fairy', 'frog', 'turtle', 'fish', 'butterfly', 'ladybug']

  for (const creature of creatures) {
    if (prompt.toLowerCase().includes(creature)) {
      return creature
    }
  }
  return 'little friend'
}

// Fallback story parser
function parseStoryFallback(text: string, originalPrompt: string, characterDNA: CharacterDNA | null, storyWorldDNA: string) {
  const char = characterDNA?.name || 'our hero'

  const defaultPages = [
    { text: `Once upon a time in a soft, dreamy land painted in gentle pastel colors, there lived a wonderful ${char} with the brightest eyes and kindest heart. Their home was filled with warmth and love, surrounded by flowering meadows in shades of lavender and peach. Every day was filled with wonder and excitement as ${char} explored the beautiful world around them. The sun always seemed to shine with a soft golden glow whenever ${char} was near.`, scene: `${char} standing in a beautiful pastel meadow, looking happy and curious, surrounded by flowers` },
    { text: `Each morning, ${char} would wake up to the sweet songs of bluebirds and butterflies dancing outside the window. They loved to spend time with their best friends, playing gentle games and sharing stories. The days were peaceful and happy, filled with laughter and joy. ${char} felt grateful for all the beauty and friendship that surrounded them every single day.`, scene: `${char} waking up happily in a cozy bedroom, sunlight streaming through the window` },
    { text: `One special morning, something unusual caught ${char}'s attention - a gentle shimmer in the air, like tiny sparkles of soft light. The sparkles seemed to be calling out, inviting ${char} to follow them on an adventure. ${char} felt curious and excited, wondering where this magical trail might lead. With a deep breath and a hopeful smile, ${char} decided to follow the gentle lights.`, scene: `${char} looking curiously at magical sparkles floating in the air, eyes wide with wonder` },
    { text: `As ${char} followed the sparkles deeper into the enchanted forest, they discovered that something important was happening. A beautiful rainbow had lost its colors and had faded to pale gray. The forest creatures gathered around, looking worried and sad. ${char} felt their heart fill with determination - they knew they had to help bring back the rainbow's beautiful colors.`, scene: `${char} discovering a faded gray rainbow, looking determined to help, forest animals gathered around` },
    { text: `${char} stood tall and brave, even though the task seemed big and challenging. They remembered all the kind things their friends had taught them about courage and helping others. Taking a deep breath, ${char} decided to search for the magic that could restore the rainbow's colors. They packed a small bag with supplies and set off with hope in their heart.`, scene: `${char} looking brave and determined, ready to embark on a quest, small bag packed` },
    { text: `Along the winding path, ${char} tried to gather colors from flowers and butterflies, thinking they could paint the rainbow back to life. They collected petals of pink roses, yellow daisies, and blue forget-me-nots in a gentle basket. ${char} climbed up to where the rainbow touched the ground and carefully tried to sprinkle the colors onto it. The rainbow glowed softly for a moment, but the colors didn't quite stick.`, scene: `${char} collecting colorful flower petals, trying to restore the rainbow, hopeful expression` },
    { text: `Sitting down to rest and think, ${char} felt a little discouraged but not defeated. A wise old owl landed nearby and spoke in a gentle voice: "True colors come from joy and love shared with friends." ${char} understood now - they needed to bring their friends together! This wasn't a challenge to face alone.`, scene: `${char} sitting and talking with a wise owl, having a moment of realization, soft lighting` },
    { text: `${char} hurried back and gathered all their dear friends - the rabbits, the deer, the squirrels, and the birds. Each friend brought their own special gift: songs of joy, dances of happiness, stories of love, and acts of kindness. Together, they formed a circle beneath the faded rainbow and shared all the beautiful, warm feelings in their hearts.`, scene: `${char} surrounded by forest friends in a circle, all looking happy and hopeful together` },
    { text: `Suddenly, like magic born from pure love and friendship, colors began to bloom across the rainbow! Soft pink, gentle yellow, peaceful blue, lovely green, and warm purple spread across the sky in the most beautiful arch anyone had ever seen. ${char} and all their friends cheered and danced with joy! They had done it together!`, scene: `${char} and friends celebrating as a beautiful colorful rainbow appears in the sky, everyone cheering` },
    { text: `The whole forest celebrated with a wonderful party filled with music, dancing, and delicious treats. ${char} realized something very important: the most powerful magic in the world comes from friendship, kindness, and working together. As the sun set in beautiful pastel colors, ${char} hugged all their friends tightly, knowing that together, they could overcome anything. And they all lived happily ever after!`, scene: `${char} hugging friends at a celebration party, sunset with pastel colors, everyone happy` },
  ]

  return {
    title: 'My Amazing Story',
    pages: defaultPages,
    characterDNA: characterDNA || createDefaultCharacterDNA(originalPrompt),
    storyWorldDNA,
  }
}

// Extract scene from text (fallback when SCENE not provided)
function extractSceneFromText(pageText: string): string {
  const sentences = pageText.split(/[.!?]+/).filter(s => s.trim().length > 10)
  if (sentences.length === 0) return 'A magical scene with the main character'

  const scene = sentences.slice(0, 2).join('. ').trim()
  return scene.length > 200 ? scene.substring(0, 200) + '...' : scene
}

