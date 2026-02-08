import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { CharacterBible, PageSceneCard, StoryImagePack } from '@/lib/visual-types'
import { createCharacterBible, createSimpleBible, CharacterDNA } from '@/lib/createCharacterBible'
import { generateAllSceneCards } from '@/lib/generatePageSceneCard'
import { renderPrompt, renderNegativePrompt, generatePageSeedByNumber } from '@/lib/renderPrompt'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// PRIORITY-ORDERED LIST OF ANIMALS - Check distinctive animals FIRST
// CRITICAL: Rhino/rhinoceros must be before hen/chicken to avoid false matches
const ALL_ANIMALS = [
  // LARGE DISTINCTIVE ANIMALS - CHECK FIRST!
  'rhinoceros', 'rhino',  // RHINO MUST BE FIRST
  'elephant', 'giraffe', 'hippopotamus', 'hippo',
  'dinosaur', 't-rex', 'triceratops', 'stegosaurus', 'brontosaurus', 'velociraptor', 'pterodactyl',
  'dragon', 'unicorn', 'phoenix', 'griffin', 'pegasus',
  'crocodile', 'alligator', 'komodo dragon',
  'gorilla', 'chimpanzee', 'orangutan',
  'lion', 'tiger', 'leopard', 'jaguar', 'cheetah', 'panther',
  'polar bear', 'bear', 'wolf', 'fox', 'coyote',
  'whale', 'dolphin', 'shark', 'octopus', 'squid', 'orca',
  'kangaroo', 'koala', 'platypus', 'wombat', 'echidna',
  'zebra', 'horse', 'pony', 'donkey', 'mule',
  'moose', 'elk', 'deer', 'reindeer', 'caribou', 'buffalo', 'bison',
  // MEDIUM ANIMALS
  'monkey', 'ape', 'baboon', 'lemur',
  'dog', 'puppy', 'cat', 'kitten',
  'rabbit', 'bunny', 'hare',
  'pig', 'piglet', 'cow', 'bull', 'calf', 'ox', 'yak',
  'sheep', 'lamb', 'goat', 'llama', 'alpaca',
  'turtle', 'tortoise', 'snake', 'python', 'cobra', 'boa', 'anaconda', 'viper', 'rattlesnake',
  'lizard', 'gecko', 'iguana', 'chameleon', 'monitor lizard', 'skink',
  'seal', 'sea lion', 'walrus', 'otter', 'sea otter', 'beaver',
  'raccoon', 'skunk', 'badger', 'wolverine', 'weasel', 'mink', 'ferret',
  'squirrel', 'chipmunk', 'hamster', 'guinea pig', 'gerbil', 'mouse', 'rat', 'vole', 'shrew', 'mole',
  'porcupine', 'hedgehog', 'woodchuck', 'groundhog',
  'sloth', 'anteater', 'armadillo', 'capybara', 'tapir',
  'meerkat', 'mongoose', 'warthog', 'hyena', 'jackal',
  'panda', 'red panda', 'binturong', 'civet',
  'frog', 'toad', 'salamander', 'newt', 'axolotl', 'tadpole', 'terrapin', 'gavial',
  'manatee', 'dugong', 'narwhal', 'beluga', 'porpoise',
  'aardvark', 'pangolin', 'okapi',
  'bat', 'flying fox',
  // BIRDS - Put AFTER mammals to avoid false matches
  'eagle', 'hawk', 'falcon', 'owl', 'snowy owl', 'vulture', 'condor',
  'penguin', 'flamingo', 'peacock', 'swan', 'crane', 'heron', 'stork',
  'parrot', 'macaw', 'cockatoo', 'cockatiel', 'parakeet', 'budgie', 'canary', 'lovebird',
  'toucan', 'pelican', 'puffin', 'kingfisher', 'kookaburra', 'lorikeet',
  'crow', 'raven', 'magpie', 'jay', 'bluejay',
  'robin', 'sparrow', 'finch', 'cardinal', 'hummingbird', 'woodpecker',
  'duck', 'duckling', 'goose', 'gosling', 'turkey', 'emu', 'ostrich',
  'seagull', 'albatross', 'pheasant', 'quail', 'pigeon', 'dove',
  'chicken', 'hen', 'rooster', 'chick',  // FARM BIRDS LAST
  'bird',  // Generic bird last
  // OCEAN & MARINE
  'ray', 'stingray', 'manta ray', 'eel',
  'jellyfish', 'starfish', 'seahorse', 'crab', 'hermit crab', 'lobster', 'crayfish', 'shrimp', 'prawn',
  'clam', 'oyster', 'snail', 'slug',
  'fish', 'salmon', 'tuna', 'clownfish', 'angelfish', 'swordfish', 'goldfish', 'betta', 'sea turtle',
  // INSECTS & BUGS
  'butterfly', 'moth', 'bee', 'bumblebee', 'honeybee', 'wasp', 'hornet',
  'dragonfly', 'damselfly', 'firefly', 'lightning bug', 'ladybug', 'ladybird', 'beetle',
  'ant', 'termite', 'spider', 'tarantula', 'black widow', 'scorpion',
  'grasshopper', 'cricket', 'locust', 'katydid', 'mantis', 'praying mantis',
  'caterpillar', 'worm', 'earthworm', 'silkworm', 'glowworm', 'inchworm',
  'fly', 'housefly', 'fruit fly', 'mosquito', 'gnat', 'midge',
  'cockroach', 'cicada', 'aphid', 'flea', 'tick', 'louse', 'stinkbug',
  'stick insect', 'walking stick', 'leaf insect',
  'water strider', 'water beetle', 'dung beetle', 'scarab', 'weevil',
  'centipede', 'millipede', 'pillbug', 'roly poly', 'woodlouse', 'sowbug', 'mite', 'daddy longlegs',
  // MYTHICAL & FANTASY
  'mermaid', 'fairy', 'pixie', 'gnome', 'troll', 'goblin', 'elf', 'centaur', 'hydra',
  'kraken', 'yeti', 'bigfoot',
  // SPECIAL ANIMALS
  'quokka', 'numbat', 'sugar glider', 'tasmanian devil', 'dingo', 'arctic fox', 'lemming', 'musk ox', 'bobcat', 'lynx', 'cougar', 'opossum', 'possum', 'fawn',
]

// Helper function to detect animal using word boundaries
function detectAnimalInText(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  for (const animal of ALL_ANIMALS) {
    // Use word boundary regex to avoid matching "hen" in "then"
    const regex = new RegExp(`\\b${animal}\\b`, 'i');
    if (regex.test(lowerText)) {
      return animal;
    }
  }
  return undefined;
}

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 8000,
      top_p: 0.9,
    })

    const storyText = completion.choices[0]?.message?.content || ''

    // ==========================================
    // STEP 2: Parse story and create Character Bible
    // ==========================================
    const parsedStory = parseStoryResponse(storyText, prompt)

    // Create Character Bible (ONCE for entire book)
    let characterBible;
    if (parsedStory.characterDNA) {
      // Try to detect species from story text as fallback
      const firstPageText = parsedStory.pages[0]?.text || ''
      const nameTheAnimalRegex = new RegExp(`\\b([A-Z][a-z]+)\\s+the\\s+(${ALL_ANIMALS.join('|').replace(/\s+/g, '\\s+')})\\b`, 'i')
      const nameMatch = firstPageText.match(nameTheAnimalRegex)
      const fallbackSpecies = nameMatch ? nameMatch[2].toLowerCase() : detectAnimalInText(firstPageText + ' ' + prompt)

      console.log(`[CHARACTER] DNA found, fallbackSpecies from story text: ${fallbackSpecies}`)
      characterBible = createCharacterBible(parsedStory.characterDNA, fallbackSpecies)
    } else {
      // Fallback: detect main character from FIRST PAGE of generated story
      const firstPageText = parsedStory.pages[0]?.text || ''
      const lowerFirstPage = firstPageText.toLowerCase()
      const lowerPrompt = prompt.toLowerCase()

      // Try to find "Name the Animal" pattern in story text first
      // Use ALL_ANIMALS to build comprehensive pattern for species detection
      const animalPattern = ALL_ANIMALS.join('|').replace(/\s+/g, '\\s+')
      const nameTheAnimalRegex = new RegExp(`\\b([A-Z][a-z]+)\\s+the\\s+(${animalPattern})\\b`, 'i')
      const nameTheAnimalMatch = firstPageText.match(nameTheAnimalRegex)

      if (nameTheAnimalMatch) {
        const charName = nameTheAnimalMatch[1]
        const species = nameTheAnimalMatch[2].toLowerCase()
        console.log(`[CHARACTER DETECTION] Found "${charName} the ${species}" in story`)
        characterBible = createSimpleBible(
          charName,
          'animal',
          species,
          'soft',
          'soft fur'
        )
      } else {
        // Fallback: search for any animal keyword in story or prompt
        // CRITICAL: Use word boundary detection to avoid matching "hen" in "then"
        const searchText = firstPageText + ' ' + prompt
        const detectedAnimal = detectAnimalInText(searchText)

        if (detectedAnimal) {
          const charName = extractNameFromPrompt(prompt) || extractNameFromText(firstPageText)
          console.log(`[CHARACTER DETECTION] Found animal "${detectedAnimal}" in text`)
          characterBible = createSimpleBible(
            charName,
            'animal',
            detectedAnimal,
            'golden',
            'soft fluffy fur'
          )
        } else {
          characterBible = createSimpleBible(extractNameFromPrompt(prompt) || 'Hero')
        }
      }
    }

    console.log('\n========== CHARACTER BIBLE ==========')
    console.log(JSON.stringify(characterBible, null, 2))
    console.log('=====================================\n')

    // ==========================================
    // STEP 3: Generate Page Scene Cards
    // ==========================================
    const sceneCards = generateAllSceneCards(parsedStory.pages, characterBible)

    console.log('\n========== SCENE CARDS ==========')
    sceneCards.forEach((card, i) => {
      console.log(`Page ${i + 1}: ${card.scene_id} | Setting: ${card.setting.substring(0, 50)}...`)
    })
    console.log('=================================\n')

    // ==========================================
    // STEP 4: Render prompts using universal template
    // ==========================================
    // CRITICAL: Use SAME seed for ALL pages to maintain character identity
    // Different seeds = different character interpretations = drift
    const baseSeed = Math.floor(Math.random() * 1000000)
    const imagePrompts: string[] = []
    const negativePrompts: string[] = []
    const seeds: number[] = []

    const isAnimalStory = characterBible.character_type === 'animal'

    console.log(`\n[SEED STRATEGY] Using SAME seed ${baseSeed} for ALL pages (reduces identity drift)`)

    sceneCards.forEach((card, index) => {
      // Pass page text so renderPrompt can detect animals from story
      const pageText = parsedStory.pages[index]?.text || ''
      const prompt = renderPrompt(characterBible, card, pageText)
      // Pass species to negative prompt so it can block wrong animals
      const negativePrompt = renderNegativePrompt(card, isAnimalStory, characterBible.species)
      // SAME seed for all pages - critical for character consistency
      const seed = baseSeed

      imagePrompts.push(prompt)
      negativePrompts.push(negativePrompt)
      seeds.push(seed)

      console.log(`\n--- PAGE ${index + 1} PROMPT ---`)
      console.log(prompt.substring(0, 600) + '...')
    })

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
        seed_strategy: 'page_number_based',
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

  // Detect if this is an animal story using word boundary detection
  const detectedAnimal = detectAnimalInText(prompt)

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
