import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { CharacterBible, PageSceneCard, StoryImagePack } from '@/lib/visual-types'
import { createCharacterBible, createSimpleBible, CharacterDNA } from '@/lib/createCharacterBible'
import { generateAllSceneCards } from '@/lib/generatePageSceneCard'
import { renderPrompt, renderNegativePrompt, generatePageSeedByNumber } from '@/lib/renderPrompt'
// New Universal system
import { generateCharacterBibleWithLLM, UniversalCharacterBible } from '@/lib/generateCharacterBible'
import { generateAllSceneCardsWithLLM, UniversalSceneCard } from '@/lib/generateSceneCard'
import { buildImagePrompt, buildNegativePrompt, generateAllImagePrompts } from '@/lib/buildImagePrompt'
// Character Anchor system for guaranteed identity lock
import { generateCharacterAnchor, CharacterAnchor } from '@/lib/characterAnchor'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

// Helper function to sleep/delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Retry wrapper for Replicate API calls
async function runReplicateWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 2000
): Promise<T> {
  let lastError: Error | null = null
  let delay = initialDelay

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const errorMessage = error.message || String(error)
      console.log(`Replicate attempt ${attempt}/${maxRetries} failed: ${errorMessage.substring(0, 100)}`)

      // Check if it's a network error worth retrying
      const isNetworkError =
        errorMessage.includes('Network') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('fetch failed')

      if (isNetworkError && attempt < maxRetries) {
        console.log(`Network error, retrying in ${delay}ms...`)
        await sleep(delay)
        delay *= 2 // Exponential backoff
        continue
      }

      // If it's not a network error or we've exhausted retries, throw
      throw error
    }
  }

  throw lastError || new Error('Max retries reached')
}

// COMPREHENSIVE LIST OF ALL ANIMALS AND INSECTS
const ALL_ANIMALS = [
  // PETS & DOMESTIC
  'dog', 'puppy', 'cat', 'kitten', 'hamster', 'guinea pig', 'gerbil', 'rabbit', 'bunny',
  'ferret', 'parrot', 'parakeet', 'budgie', 'canary', 'cockatiel', 'cockatoo', 'macaw',
  'goldfish', 'betta', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko', 'iguana', 'chameleon',
  // FARM ANIMALS
  'horse', 'pony', 'donkey', 'mule', 'cow', 'bull', 'calf', 'pig', 'piglet', 'hog', 'boar',
  'sheep', 'lamb', 'goat', 'chicken', 'hen', 'rooster', 'chick', 'duck', 'duckling',
  'goose', 'gosling', 'turkey', 'llama', 'alpaca', 'buffalo', 'bison', 'ox', 'yak',
  // FOREST & WOODLAND
  'fox', 'wolf', 'coyote', 'bear', 'deer', 'fawn', 'elk', 'moose', 'caribou', 'reindeer',
  'hare', 'squirrel', 'chipmunk', 'raccoon', 'skunk', 'opossum', 'possum', 'badger',
  'wolverine', 'weasel', 'mink', 'otter', 'beaver', 'porcupine', 'hedgehog', 'mole',
  'shrew', 'vole', 'mouse', 'rat', 'woodchuck', 'groundhog', 'bobcat', 'lynx', 'cougar',
  // JUNGLE & TROPICAL
  'lion', 'tiger', 'leopard', 'jaguar', 'cheetah', 'monkey', 'ape', 'gorilla', 'chimpanzee',
  'orangutan', 'baboon', 'lemur', 'sloth', 'anteater', 'armadillo', 'tapir', 'capybara',
  'toucan', 'anaconda', 'python', 'boa', 'crocodile', 'alligator', 'caiman',
  // AFRICAN SAVANNA
  'elephant', 'giraffe', 'zebra', 'hippo', 'hippopotamus', 'rhino', 'rhinoceros',
  'gazelle', 'antelope', 'impala', 'hyena', 'jackal', 'meerkat', 'warthog', 'ostrich', 'flamingo',
  // AUSTRALIAN
  'kangaroo', 'wallaby', 'koala', 'wombat', 'platypus', 'echidna', 'dingo', 'emu', 'quokka',
  'kookaburra', 'lorikeet', 'sugar glider', 'numbat', 'tasmanian devil',
  // ARCTIC & POLAR
  'polar bear', 'penguin', 'seal', 'sea lion', 'walrus', 'arctic fox', 'snowy owl',
  'narwhal', 'beluga', 'orca', 'whale', 'puffin', 'lemming', 'musk ox',
  // OCEAN & MARINE
  'dolphin', 'porpoise', 'shark', 'ray', 'stingray', 'manta ray', 'eel', 'octopus', 'squid',
  'jellyfish', 'starfish', 'seahorse', 'crab', 'lobster', 'shrimp', 'clam', 'oyster',
  'snail', 'slug', 'fish', 'salmon', 'tuna', 'clownfish', 'angelfish', 'swordfish', 'manatee',
  'sea turtle', 'sea otter', 'hermit crab', 'crayfish', 'prawn',
  // BIRDS
  'bird', 'eagle', 'hawk', 'falcon', 'owl', 'vulture', 'condor', 'crow', 'raven',
  'magpie', 'jay', 'bluejay', 'cardinal', 'robin', 'sparrow', 'finch',
  'hummingbird', 'woodpecker', 'pelican', 'crane', 'heron', 'stork', 'swan',
  'seagull', 'albatross', 'peacock', 'pheasant', 'quail', 'pigeon', 'dove', 'kingfisher', 'lovebird',
  // REPTILES & AMPHIBIANS
  'cobra', 'viper', 'rattlesnake', 'komodo dragon', 'monitor lizard', 'skink',
  'terrapin', 'gavial', 'frog', 'toad', 'salamander', 'newt', 'axolotl', 'tadpole',
  // INSECTS & BUGS
  'butterfly', 'moth', 'bee', 'bumblebee', 'honeybee', 'wasp', 'hornet',
  'ant', 'termite', 'beetle', 'ladybug', 'ladybird', 'firefly', 'lightning bug',
  'dragonfly', 'damselfly', 'grasshopper', 'cricket', 'locust', 'katydid',
  'mantis', 'praying mantis', 'stick insect', 'walking stick', 'leaf insect',
  'fly', 'housefly', 'fruit fly', 'mosquito', 'gnat', 'midge',
  'caterpillar', 'worm', 'earthworm', 'silkworm', 'glowworm', 'inchworm',
  'cockroach', 'cicada', 'aphid', 'flea', 'tick', 'louse', 'stinkbug',
  'water strider', 'water beetle', 'dung beetle', 'scarab', 'weevil',
  // ARACHNIDS & OTHER CRAWLIES
  'spider', 'tarantula', 'black widow', 'scorpion', 'mite', 'daddy longlegs',
  'centipede', 'millipede', 'pillbug', 'roly poly', 'woodlouse', 'sowbug',
  // MYTHICAL & FANTASY
  'dragon', 'unicorn', 'phoenix', 'griffin', 'pegasus', 'mermaid', 'fairy', 'pixie',
  'gnome', 'troll', 'goblin', 'elf', 'centaur', 'hydra', 'kraken', 'yeti', 'bigfoot',
  'dinosaur', 't-rex', 'triceratops', 'stegosaurus', 'pterodactyl', 'velociraptor', 'brontosaurus',
  // MISCELLANEOUS
  'bat', 'flying fox', 'panda', 'red panda', 'binturong', 'civet', 'mongoose',
  'aardvark', 'pangolin', 'okapi', 'dugong'
]

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid prompt provided' },
        { status: 400 }
      )
    }

    // ==========================================
    // STEP 1: Generate story text with Character DNA
    // ==========================================
    const systemPrompt = `You are an AI children's storybook author.

Create a complete 10-page children's story with:
1. Character DNA (physical appearance details)
2. Story world description
3. Full story text for each page (5-8 sentences per page)

IMPORTANT RULES:
- Story must be EXACTLY 10 pages
- Each page must have 5-8 COMPLETE sentences (never cut off mid-sentence)
- Characters must have consistent appearance throughout
- Story should be age-appropriate, gentle, and have a positive message
- Include a clear beginning, middle, and happy ending

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

CHARACTER_DNA:
{
  "name": "[character name]",
  "type": "[human/animal/creature]",
  "physical_form": "[body shape, hair style, height]",
  "material_or_texture": "[skin type, fur, etc.]",
  "color_palette": ["primary color", "secondary color", "accent color"],
  "facial_features": "[eyes, nose, smile description]",
  "accessories": "[clothing, items, or 'none']",
  "personality_visuals": "[how emotions show visually]",
  "movement_style": "[how they move]",
  "unique_identifiers": "[special features]"
}

STORY_WORLD_DNA:
[2-3 sentences describing the world's visual style]

TITLE: [Story Title]

PAGE 1:
TEXT: [5-8 complete sentences introducing the character and setting]

PAGE 2:
TEXT: [5-8 complete sentences continuing the story]

PAGE 3:
TEXT: [5-8 complete sentences - adventure begins]

PAGE 4:
TEXT: [5-8 complete sentences - challenge appears]

PAGE 5:
TEXT: [5-8 complete sentences - character decides to act]

PAGE 6:
TEXT: [5-8 complete sentences - working on the challenge]

PAGE 7:
TEXT: [5-8 complete sentences - setback and learning]

PAGE 8:
TEXT: [5-8 complete sentences - friends help]

PAGE 9:
TEXT: [5-8 complete sentences - success and triumph]

PAGE 10:
TEXT: [5-8 complete sentences - celebration and lesson learned, COMPLETE happy ending]

CRITICAL: Every page must end with a COMPLETE sentence. Never cut off mid-sentence.`

    const userPrompt = `Create a magical 10-page children's story about: "${prompt}"`

    // Call Replicate with retry logic for network errors
    const output = await runReplicateWithRetry(async () => {
      return await replicate.run(
        "meta/meta-llama-3.1-405b-instruct",
        {
          input: {
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            temperature: 0.9,
            max_tokens: 8000,
            top_p: 0.9,
          }
        }
      ) as string[]
    })

    const storyText = output.join('')

    // ==========================================
    // STEP 2: Parse story text
    // ==========================================
    const parsedStory = parseStoryResponse(storyText, prompt)

    // Convert pages to include pageNumber
    const pagesWithNumbers = parsedStory.pages.map((page, index) => ({
      pageNumber: index + 1,
      text: page.text
    }))

    // ==========================================
    // STEP 3: Generate Universal Character Bible with LLM
    // This properly distinguishes animals from humans
    // ==========================================
    console.log('\n========== GENERATING CHARACTER BIBLE WITH LLM ==========')
    const universalBible = await generateCharacterBibleWithLLM(
      replicate,
      parsedStory.title,
      pagesWithNumbers,
      prompt
    )

    console.log('\n========== UNIVERSAL CHARACTER BIBLE ==========')
    console.log(JSON.stringify(universalBible, null, 2))
    console.log('================================================\n')

    // ==========================================
    // STEP 3.5: Generate Character Anchor for identity lock
    // This creates a reference image for img2img consistency
    // ==========================================
    const baseSeed = Math.floor(Math.random() * 1000000)
    let characterAnchor: CharacterAnchor | null = null

    // FAIL FAST: Anchor is REQUIRED for character consistency
    console.log('\n========== GENERATING CHARACTER ANCHOR ==========')
    characterAnchor = await generateCharacterAnchor(replicate, universalBible, baseSeed)

    if (!characterAnchor || !characterAnchor.imageUrl) {
      throw new Error('Failed to generate character anchor - cannot proceed without anchor')
    }

    console.log(`Character Anchor URL: ${characterAnchor.imageUrl}`)
    console.log('==================================================\n')

    // ==========================================
    // STEP 4: Generate Universal Scene Cards with LLM
    // This extracts proper scene details per page
    // ==========================================
    const universalSceneCards = await generateAllSceneCardsWithLLM(
      replicate,
      pagesWithNumbers,
      universalBible.name
    )

    console.log('\n========== UNIVERSAL SCENE CARDS ==========')
    universalSceneCards.forEach((card, i) => {
      console.log(`Page ${i + 1}: ${card.setting.substring(0, 60)}...`)
      console.log(`  must_include: ${card.must_include.slice(0, 3).join(', ')}`)
    })
    console.log('============================================\n')

    // ==========================================
    // STEP 5: Build image prompts using new Universal system
    // ==========================================
    const { prompts: imagePrompts, negativePrompts } = generateAllImagePrompts(universalBible, universalSceneCards)

    // Use same seed for all pages (character consistency)
    const seeds = universalSceneCards.map(() => baseSeed)

    console.log('\n========== IMAGE PROMPTS ==========')
    imagePrompts.forEach((p, i) => {
      console.log(`\n--- PAGE ${i + 1} PROMPT ---`)
      console.log(p.substring(0, 400) + '...')
      console.log(`NEGATIVE: ${negativePrompts[i].substring(0, 100)}...`)
    })
    console.log('====================================\n')

    // Also create legacy characterBible for backward compatibility
    const characterBible = createSimpleBible(
      universalBible.name,
      universalBible.is_human ? 'human' : 'animal',
      universalBible.species_or_type,
      'gray'
    )

    // Create legacy sceneCards for backward compatibility
    const sceneCards: PageSceneCard[] = universalSceneCards.map(card => ({
      page_number: card.page_index,
      scene_id: `page_${card.page_index}`,
      setting: card.setting,
      time_weather: card.mood,
      main_action: card.action,
      foreground_must_include: [universalBible.name, ...card.must_include.slice(0, 2)],
      background_must_include: card.must_include.slice(2),
      supporting_characters: card.supporting_characters.map(c => c.type),
      key_objects: card.must_include,
      required_elements: card.must_include,
      forbidden_elements: [] as string[],
      camera: { shot_type: card.camera, composition_notes: '' }
    }))

    // ==========================================
    // STEP 5: Build Story Image Pack
    // ==========================================
    const storyImagePack: StoryImagePack = {
      story_id: `story_${Date.now()}`,
      character_bible: characterBible,
      pages: sceneCards,
      rendering: {
        size: '1024x1024',
        num_images_per_page: 1,
        seed_strategy: 'consistent_per_story',  // Same seed for all pages = consistent character
      },
    }

    return NextResponse.json({
      story: {
        title: parsedStory.title,
        pages: parsedStory.pages,
        originalPrompt: prompt,
      },
      imagePrompts,
      negativePrompts,
      seed: baseSeed,
      seeds,
      storyImagePack,
      characterBible,
      sceneCards,
      // Character Anchor for img2img identity lock
      characterAnchorUrl: characterAnchor?.imageUrl || null,
    })

  } catch (error: any) {
    console.error('Error generating story:', error)

    const errorMessage = error.message || String(error)
    const isContentError =
      errorMessage.includes('safety') ||
      errorMessage.includes('content policy') ||
      errorMessage.includes('inappropriate') ||
      errorMessage.includes('moderation')

    if (isContentError) {
      return NextResponse.json(
        {
          error: 'This story idea contains content that isn\'t appropriate for a children\'s story app. Please try a different, kid-friendly idea!',
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

// ==========================================
// PARSING FUNCTIONS
// ==========================================

interface ParsedStory {
  title: string
  pages: { text: string }[]
  characterDNA: CharacterDNA | null
  storyWorldDNA: string
}

function parseStoryResponse(text: string, originalPrompt: string): ParsedStory {
  // Extract Character DNA
  let characterDNA: CharacterDNA | null = null
  const dnaMatch = text.match(/CHARACTER_DNA:\s*(\{[\s\S]*?\})\s*(?=STORY_WORLD_DNA|TITLE)/i)
  if (dnaMatch) {
    try {
      characterDNA = JSON.parse(dnaMatch[1])
    } catch (e) {
      console.error('Failed to parse CHARACTER_DNA:', e)
      characterDNA = createDefaultDNA(originalPrompt)
    }
  } else {
    characterDNA = createDefaultDNA(originalPrompt)
  }

  // Extract Story World DNA
  let storyWorldDNA = 'A magical world with soft colors and friendly atmosphere.'
  const worldMatch = text.match(/STORY_WORLD_DNA:\s*([\s\S]*?)(?=TITLE:)/i)
  if (worldMatch) {
    storyWorldDNA = worldMatch[1].trim()
  }

  // Extract title
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|PAGE)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'My Amazing Adventure'

  // Extract pages
  const pages: { text: string }[] = []
  for (let i = 1; i <= 10; i++) {
    const pageRegex = new RegExp(`PAGE ${i}:[\\s\\S]*?TEXT:\\s*([\\s\\S]*?)(?=PAGE ${i + 1}:|$)`, 'i')
    const pageMatch = text.match(pageRegex)

    if (pageMatch) {
      let pageText = pageMatch[1].trim()
      // Clean up the text
      pageText = pageText
        .replace(/\n\n+/g, ' ')
        .replace(/SCENE:.*$/i, '')
        .replace(/PAGE \d+:.*/gi, '')
        .trim()

      // Ensure text doesn't end mid-sentence
      if (pageText && !pageText.match(/[.!?]$/)) {
        pageText += '.'
      }

      if (pageText) {
        pages.push({ text: pageText })
      }
    }
  }

  // Fallback if parsing failed
  if (pages.length < 8) {
    return createFallbackStory(originalPrompt, characterDNA)
  }

  // Pad to exactly 10 pages if needed
  while (pages.length < 10) {
    pages.push({
      text: 'And the magical adventure continued with wonder and joy. The friends smiled at each other, knowing this was just the beginning of many more wonderful stories to come.'
    })
  }

  return {
    title,
    pages: pages.slice(0, 10),
    characterDNA,
    storyWorldDNA,
  }
}

function createDefaultDNA(prompt: string): CharacterDNA {
  const name = extractNameFromPrompt(prompt)
  const lowerPrompt = prompt.toLowerCase()

  // Detect if this is an animal story
  const detectedAnimal = ALL_ANIMALS.find(animal => lowerPrompt.includes(animal))

  if (detectedAnimal) {
    // ANIMAL character
    return {
      name,
      type: 'animal',
      physical_form: `friendly ${detectedAnimal} with soft fur`,
      material_or_texture: 'soft fluffy fur',
      color_palette: ['golden', 'brown', 'cream'],
      facial_features: 'Big expressive eyes, cute nose, friendly smile',
      accessories: 'none',
      personality_visuals: 'Wags tail when happy, ears perk up when curious',
      movement_style: 'Bounds and trots playfully',
      unique_identifiers: `A lovable ${detectedAnimal} with an especially warm expression`,
    }
  }

  // HUMAN character (default)
  return {
    name,
    type: 'human',
    physical_form: 'Small child, about 6 years old, with a friendly build',
    material_or_texture: 'Soft skin with rosy cheeks',
    color_palette: ['warm brown', 'rosy pink', 'golden'],
    facial_features: 'Big expressive brown eyes, cute button nose, warm friendly smile',
    accessories: 'Colorful casual clothes',
    personality_visuals: 'Bounces when happy, eyes sparkle with curiosity',
    movement_style: 'Skips and hops playfully',
    unique_identifiers: 'Always has a curious, adventurous expression',
  }
}

function extractNameFromPrompt(prompt: string): string {
  // Try to find a name pattern like "Luna the..." or "named Luna"
  const namedMatch = prompt.match(/\b([A-Z][a-z]+)\s+the\s+/i)
  if (namedMatch) return namedMatch[1]

  const nameMatch = prompt.match(/named\s+([A-Z][a-z]+)/i)
  if (nameMatch) return nameMatch[1]

  // Default name
  return 'Little Hero'
}

function extractNameFromText(text: string): string {
  // Try to find "Name the Animal" pattern
  const nameTheMatch = text.match(/\b([A-Z][a-z]+)\s+the\s+\w+/i)
  if (nameTheMatch) return nameTheMatch[1]

  // Try to find a capitalized name at start of story
  const firstNameMatch = text.match(/\b([A-Z][a-z]{2,})\b/)
  if (firstNameMatch) return firstNameMatch[1]

  return 'Hero'
}

function createFallbackStory(prompt: string, dna: CharacterDNA | null): ParsedStory {
  const name = dna?.name || extractNameFromPrompt(prompt)

  const fallbackPages = [
    { text: `Once upon a time, there was a wonderful child named ${name} who lived in a cozy little house surrounded by beautiful flowers and tall, friendly trees. ${name} had the brightest smile and the most curious eyes you've ever seen. Every day was a new adventure waiting to happen, and ${name} couldn't wait to explore the magical world around them.` },
    { text: `${name} loved to spend time in the garden, watching butterflies dance among the flowers and listening to birds sing their sweet songs. There were so many colors and sounds to discover! The sun always seemed to shine a little brighter when ${name} was outside playing and exploring.` },
    { text: `One magical morning, ${name} discovered something amazing - a path that led into the enchanted forest! The trees sparkled with golden light, and tiny fireflies danced in the air. ${name}'s heart filled with excitement as they decided to follow this mysterious and beautiful path.` },
    { text: `As ${name} walked deeper into the forest, they met a friendly little creature who looked lost and sad. "What's wrong, little friend?" ${name} asked gently. The creature explained that they couldn't find their way home. ${name} knew exactly what to do - they would help!` },
    { text: `With determination in their heart, ${name} decided to help the little creature find its home. "Don't worry," ${name} said with a warm smile, "we'll find your family together!" The creature's eyes lit up with hope, and together they began their journey.` },
    { text: `Through meadows of wildflowers and across a sparkling stream, ${name} and their new friend searched and searched. They asked the wise owl for directions and followed the rainbow that appeared in the sky. Every step brought them closer to their goal.` },
    { text: `Just when they thought they might never find it, ${name} remembered something important - sometimes the best way to find what you're looking for is to listen with your heart. They closed their eyes, took a deep breath, and listened carefully to the sounds of the forest.` },
    { text: `Suddenly, they heard it - the joyful sounds of the creature's family calling out! ${name} and their friend followed the sounds over one more hill, and there they were - a whole family of friendly creatures, waiting with open arms!` },
    { text: `The reunion was filled with hugs, happy tears, and so much joy! The creature's family thanked ${name} again and again for bringing their little one home safely. ${name} felt so proud and happy to have helped make this wonderful moment happen.` },
    { text: `As the sun began to set, painting the sky in beautiful shades of orange and pink, ${name} waved goodbye to their new friends and headed home with a heart full of joy. They had learned that the greatest adventures come from helping others, and that kindness is the most magical power of all. The end.` },
  ]

  return {
    title: `${name}'s Magical Adventure`,
    pages: fallbackPages,
    characterDNA: dna || createDefaultDNA(prompt),
    storyWorldDNA: 'A soft, dreamy world with gentle colors and magical light.',
  }
}
