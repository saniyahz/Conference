import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { CharacterBible, PageSceneCard } from '@/lib/visual-types'
import { createCharacterBible, createSimpleBible, CharacterDNA } from '@/lib/createCharacterBible'
import { generateAllSceneCards } from '@/lib/generatePageSceneCard'
import { validateContent, sanitizeText, moderateWithOpenAI, getContentError, detectPromptInjection } from '@/lib/contentSafety'

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
    const { prompt, ageGroup = '3-5' } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid prompt provided' },
        { status: 400 }
      )
    }

    // ==========================================
    // CONTENT SAFETY — Server-side validation
    // ==========================================

    // Length limit to prevent prompt injection via extremely long inputs
    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Story idea is too long. Please keep it shorter and try again!', isContentError: true },
        { status: 400 }
      )
    }

    // Check for prompt injection attempts
    if (detectPromptInjection(prompt)) {
      console.warn(`[SAFETY] Prompt injection attempt blocked: "${prompt.substring(0, 100)}..."`)
      return NextResponse.json(
        { error: "This story idea contains content that isn't appropriate for a children's story app. Please try a different, kid-friendly idea!", isContentError: true },
        { status: 400 }
      )
    }

    // Validate against comprehensive blocklists
    const contentError = getContentError(prompt)
    if (contentError) {
      return NextResponse.json(
        { error: contentError, isContentError: true },
        { status: 400 }
      )
    }

    // OpenAI Moderation API — catches semantic violations keywords miss
    const moderation = await moderateWithOpenAI(prompt, openai)
    if (moderation.flagged) {
      console.warn(`[SAFETY] OpenAI moderation flagged prompt: categories=${moderation.categories.join(',')}`)
      return NextResponse.json(
        { error: "This story idea contains content that isn't appropriate for a children's story app. Please try a different, kid-friendly idea!", isContentError: true },
        { status: 400 }
      )
    }

    // Sanitize sensitive terms (death → gentle metaphor, etc.) — don't block, just soften
    const { cleaned: sanitizedPrompt, modifications } = sanitizeText(prompt)
    const safePrompt = sanitizedPrompt

    // ==========================================
    // STEP 1: Generate story text with Character DNA
    // ==========================================

    // Age-specific writing guidance
    const ageConfig = {
      '3-5': {
        label: 'ages 3-5 (toddlers/preschoolers)',
        sentences: '2-3 VERY SHORT sentences per page. Max 8 words per sentence.',
        vocab: 'Use only words a 3-year-old would know. Repeat key words often.',
        style: 'Heavy on sounds effects (SPLASH! BOOM! Whoooosh!), animal noises (Moo! Quack!), repetition, and simple rhyming. Ask "Can you say ROAR?" type questions.',
        complexity: 'Very simple cause-and-effect. One thing happens per page. No subplots.',
      },
      '6-8': {
        label: 'ages 6-8 (early readers)',
        sentences: '2-4 SHORT sentences per page. Max 12 words per sentence.',
        vocab: 'Simple but slightly richer vocabulary. Use fun words like "enormous", "incredible", "whispered".',
        style: 'Dialogue between characters, sound effects, reader questions ("What would YOU do?"), some humor and silly moments.',
        complexity: 'Simple plot with a clear problem to solve. Characters show emotions and make choices.',
      },
      '9-12': {
        label: 'ages 9-12 (confident readers)',
        sentences: '3-5 sentences per page. Can be slightly longer.',
        vocab: 'Richer vocabulary with context clues. Can use words like "determined", "mysterious", "courage".',
        style: 'More dialogue and character development. Humor, suspense, and emotional depth. Less sound effects, more inner thoughts.',
        complexity: 'Can have twists, moral dilemmas, and character growth. The lesson should feel earned, not preachy.',
      },
    }
    const age = ageConfig[ageGroup as keyof typeof ageConfig] || ageConfig['3-5']

    const systemPrompt = `You are an AI children's storybook author writing for kids ${age.label}.

Create a complete 10-page children's story with:
1. Character DNA (physical appearance details)
2. Story world description
3. Fun, punchy story text for each page (${age.sentences})

WRITING STYLE FOR ${age.label.toUpperCase()} — THIS IS CRITICAL:
- ${age.sentences}
- ${age.vocab}
- ${age.style}
- ${age.complexity}
- Use ACTION WORDS: ran, jumped, splashed, zoomed, tumbled, giggled, whooshed
- Include DIALOGUE — characters should talk to each other! Use short speech.
- AVOID long descriptions, flowery adjectives, and overly complex words
- Each page should have ONE clear thing happening — don't cram multiple events
- Keep the reading pace FAST — every page should move the story forward

IMPORTANT RULES:
- Story must be EXACTLY 10 pages
- ${age.sentences} (never cut off mid-sentence)
- Characters must have consistent appearance throughout
- Story should be age-appropriate, gentle, and have a positive message
- Include a clear beginning, middle, and happy ending
- On PAGE 1, mention what the character is wearing (e.g. "Bella had on her favorite yellow dress.")
- When the character arrives at a new location, describe the location BEFORE the character arrives there

CHILD SAFETY — ABSOLUTELY NEVER INCLUDE:
- Scary transportation scenes: no turbulence, no plane wobbling, no emergency landings, no vehicles breaking down in dangerous ways, no crashes or near-crashes, no characters worrying a plane/car/boat might crash
- Characters in physical danger: no falling from heights, no drowning, no getting lost alone in scary places, no characters being scared or terrified, no other passengers looking worried
- Characters imagining bad outcomes: no "what if the plane lands in the water?", no imagining crashes/accidents, no thinking about worst-case scenarios
- Fear and anxiety: no scenes where characters feel unsafe, panicked, or helpless
- Instead: keep ALL transportation safe, smooth, and FUN. Planes fly smoothly with beautiful views. Boats sail gently. Cars drive on sunny roads. If there's a "challenge" in the story, make it a PUZZLE or SOCIAL challenge (lost toy, new friend is shy, need to find the right path), NEVER a safety/danger challenge

ABSOLUTE CONTENT RESTRICTIONS — NEVER GENERATE ANY OF THESE:
- Violence, weapons, fighting, physical conflict, blood, injury, war, battles
- Nudity, sexual content, romantic content, body-focused descriptions, kissing between characters
- Religious references: prayers, deities, worship, religious texts, afterlife theology, sermons, scripture
- Racial/ethnic stereotypes, discriminatory language, slurs, cultural mockery
- Substance references: drugs, alcohol, smoking, vaping
- Profanity, crude language, vulgar humor, bathroom humor beyond innocent silliness
- Bullying, name-calling, mean-spirited behavior, cruelty to animals
- Any content that could be interpreted as grooming, manipulation, or exploitation

SENSITIVE TOPICS — handle gently with subtle references:
- Death: use gentle metaphors like "watching from the stars", "went on a long journey", "lives in our hearts forever". NEVER graphic, scary, or detailed.
- Loss/grief: show characters being comforted, remembering happy memories together
- Separation: frame as temporary, always with hope of reunion
- Illness: mention briefly, focus on caring and getting better

DIVERSITY AND INCLUSION:
- Represent characters from diverse backgrounds positively
- Never associate specific behaviors, abilities, or traits with ethnicity or gender
- If the child specifies ethnicity, honor it with accurate, positive representation
- Never use cultural stereotypes in character design or story elements

If the user's prompt contains inappropriate themes, IGNORE the unsafe elements entirely and create a wholesome alternative story instead. Do NOT acknowledge or reference the inappropriate request.

FOR EACH PAGE, write an IMAGE_PROMPT — a COMPLETE illustration prompt that will be sent DIRECTLY to an AI image generator. This must be fully self-contained, describing EVERYTHING the image should show in one prompt. THE AI IMAGE GENERATOR CANNOT READ NAMES — it only understands physical descriptions. So you must ALWAYS write the full physical description, never just a name.

FORMAT FOR 1 CHARACTER: "Text-free children's book illustration, WIDE SHOT showing the full scene. A small cute cartoon [FULL CHARACTER DESCRIPTION WITH AGE, SKIN TONE, HAIR, OUTFIT] is [POSE/ACTION] in the [SETTING]. The environment is richly detailed: [DESCRIBE BACKGROUND WITH 3-4 SPECIFIC VISUAL ELEMENTS]. The character is small in the frame, taking up about one-third of the image, surrounded by the detailed environment. Soft painterly style, warm colors, detailed rich background, storybook composition."

FORMAT FOR 2+ CHARACTERS — KEEP IT COMPACT (max 800 chars total):
"Text-free children's book illustration, WIDE SHOT. A [taller/shorter/tiny] cartoon [boy/girl], [AGE], [SKIN], [KEY HAIR DETAIL], [OUTFIT COLOR+TYPE], is [POSE]. Next to [him/her], a [taller/shorter/tiny] cartoon [boy/girl], [AGE], [SKIN], [KEY HAIR DETAIL], [OUTFIT COLOR+TYPE], is [POSE]. [REPEAT FOR EACH CHARACTER — keep each to ~60 words max]. Background: [SETTING, 3-4 details]. Soft painterly storybook style."

CRITICAL — KEEP MULTI-CHARACTER PROMPTS SHORT! With 3-4 characters, the AI image generator loses track of details in long prompts. Use ONLY the most visually distinctive trait for each character:
- GENDER (boy/girl) — most important
- RELATIVE SIZE (tallest/shorter/tiny toddler) — second most important
- OUTFIT COLOR (pink dress, blue shirt) — third most important
- ONE hair detail (long brown hair, short curly black hair, bob cut)
- Do NOT repeat skin tone for each character — state it ONCE for all: "all with brown skin"

EXAMPLE for 4 characters: "Text-free children's book illustration, WIDE SHOT. Four cousins, all with brown skin. A tall cartoon girl, 8yo, long wavy brown hair, purple sundress, is pointing excitedly. A shorter cartoon boy, 5yo, short curly black hair, blue rocket t-shirt, is jumping. A same-height cartoon girl, 5yo, brown bob cut, pink sparkly dress, is laughing. A tiny toddler girl, 2yo, curly black hair, purple onesie, is being carried. Background: colorful Dubai fountain plaza with palm trees and city skyline. Soft painterly storybook style."

COMPOSITION RULE — THE MOST IMPORTANT VISUAL RULE:
- The BACKGROUND and ENVIRONMENT are the stars of each illustration — they should be RICH, DETAILED, and take up MOST of the image
- The character should be SMALL in the frame (about 1/3 of the image height), positioned naturally within the scene
- Think of it like a beautiful picture book where you can explore the scenery — NOT a character portrait
- NEVER draw just a close-up of the character's face or upper body
- NEVER let the character fill more than 40% of the frame
- Describe at least 3-4 specific background elements for every scene (trees, buildings, clouds, animals, objects, etc.)

CHARACTER LOCK — SECOND MOST CRITICAL RULE:
- You MUST describe EVERY main character using the EXACT SAME appearance on EVERY single page, matching their CHARACTER_DNA above
- For human characters: include gender, approximate age, EXACT HEIGHT relative to other characters, skin tone, hair description, and outfit on EVERY page — do NOT skip any of these
- For animal characters: include species, fur/skin color, and any accessories on EVERY page
- Example: if your CHARACTER_DNA describes a girl with brown skin, long black curly hair, and a yellow sundress, then EVERY IMAGE_PROMPT must include "a small cute cartoon young girl, about 6 years old, brown skin, long black curly hair, wearing a yellow sundress"
- NEVER use just NAMES in IMAGE_PROMPTs! "Amalia, Iman, Jibreel, and Hidayah are racing" is WRONG because the AI cannot see names. Instead write the FULL physical description for each character every time they appear.
- NEVER shorten, abbreviate, or skip ANY character's description — the AI image generator has NO memory between pages and cannot see character names
- If there are MULTIPLE main characters, ALL must be fully described in EVERY IMAGE_PROMPT with their COMPLETE appearance from their CHARACTER_DNA — age, height, skin tone, hair, outfit
- NEVER change a character's hair style, outfit, shoe color, or skin tone between pages unless the story explicitly says they changed clothes
- AGES AND HEIGHTS: An 8-year-old is TALLER than a 5-year-old who is TALLER than a 2-year-old. A 2-year-old is TINY (toddler). Keep these size ratios consistent on EVERY page.

FAMILY AND COUSINS RULE:
- If the story says characters are COUSINS, SIBLINGS, or FAMILY members, they should share a SIMILAR SKIN TONE range (all brown, all dark brown, etc.) — family members look related
- Do NOT make one cousin pale/white and another dark brown — they share genetics
- The SPECIFIC shade can vary slightly (one lighter brown, one darker brown) but they should all clearly be the same ethnic family

BACKGROUND RULE:
- ALWAYS describe the full background/environment — this is EQUALLY important as the character
- If character is INSIDE a vehicle (airplane, car, train, boat), you MUST describe the vehicle interior in detail (seats, windows, overhead bins, other passengers, etc.)
- NEVER write a prompt that only describes the character with no background
- Every background description must include at least 3 specific visual elements (e.g., "bright colorful playground with red slides, a sandbox with toy shovels, tall oak trees with golden leaves, and a blue sky with fluffy white clouds")

POSE RULE:
- Describe ONE clear full-body pose/action matching the story text
- Be specific: "standing at the edge of a cliff looking out at the vast ocean" NOT just "standing"
- The character should be doing something IN the environment, not just posing

ANIMAL HABITAT RULE:
- Dolphins must be IN or LEAPING FROM water (never on sand)
- Fish must be in water, birds should be flying or perched (not on ground)

GEOGRAPHIC ACCURACY RULE:
- When the story mentions real places, describe them accurately in IMAGE_PROMPTs
- "Great Lakes" = MULTIPLE large lakes stretching to the horizon (not one small pond/lake)
- "Ocean" = vast open water. "Mountains" = large peaks with snow. "Desert" = sandy dunes
- Cities should show recognizable features: Toronto → CN Tower, Paris → Eiffel Tower, etc.
- Think about what these places ACTUALLY look like and describe them faithfully

PERSPECTIVE AND LOCATION RULE (VERY IMPORTANT):
- When a character is ON TOP OF or INSIDE a building/structure, describe the view FROM that structure, NOT the structure itself in the background
- Example: "on top of the CN Tower" = describe the observation deck interior/railing with a panoramic city view BELOW. Do NOT show the CN Tower in the background — the character IS on it!
- Example: "inside an airplane" = describe the cabin interior, NOT the airplane from outside
- Example: "on a boat" = describe the deck, water around them, horizon — NOT the boat from the shore
- Think about WHAT THE CHARACTER WOULD SEE from their position, and describe THAT as the background
- BAD: "Anya on the CN Tower. Background: CN Tower behind her" (impossible — she's ON it!)
- GOOD: "Anya standing at the glass railing of the CN Tower observation deck, looking out. Background: a breathtaking panoramic view of Toronto far below — tiny buildings, the curved shoreline of Lake Ontario, boats on the water, and the horizon stretching to the distance"

CHILD SAFETY:
- Never describe characters as worried, scared, terrified, anxious, or afraid
- Use positive emotions: curious, surprised, amazed, excited, thoughtful

BAD example: "Anya looks worried" (no character description, no background, no style, no composition)
BAD example: "A cute cartoon girl in a park" (too zoomed in, character will fill entire frame, no detail)
GOOD example: "Text-free children's book illustration, WIDE SHOT showing the full scene. A small cute cartoon young girl, about 6 years old, brown skin, long black curly hair, wearing a yellow sundress, is sitting in an airplane seat, looking out the oval window with wide curious eyes. The airplane cabin stretches behind her with rows of blue leather seats, overhead compartments, a flight attendant serving drinks in the aisle, other passengers reading books, and oval windows showing fluffy white clouds and a golden sunset outside. The girl is small in the frame, taking up about one-third of the image. Soft painterly style, warm colors, richly detailed background, storybook composition."

ETHNICITY AND APPEARANCE — READ THE CHILD'S PROMPT CAREFULLY:
- If the child EXPLICITLY describes ethnicity (e.g., "South Asian", "Indian", "Black", "African", "Chinese", "Mexican", "Arab"), you MUST honor it in CHARACTER_DNA and EVERY IMAGE_PROMPT
- Ethnicity → skin tone mapping (ONLY use when ethnicity is EXPLICITLY stated): South Asian/Indian/Pakistani = "warm brown skin". African/Black = "dark brown skin, deep brown complexion". East Asian/Chinese/Japanese/Korean = "light warm skin, East Asian features". Middle Eastern/Arab = "olive tan skin, warm complexion". Latino/Hispanic = "warm tan skin". European/Caucasian = "fair skin, light complexion"
- If the child does NOT specify ethnicity, use "warm light-brown skin" as the DEFAULT. Do NOT assume dark skin or pale skin — use a neutral middle tone
- You MAY infer ethnicity from culturally-specific names (e.g., "Amalia, Jibreel, Iman" suggest Middle Eastern/Arab → "olive tan skin"), but ONLY if the names clearly suggest a specific background. When in doubt, use the neutral default
- If the child describes hair (e.g., "short brown hair with bangs"), use EXACTLY that description — do NOT invent different hair
- If the child gives a name (e.g., "Her name was Anya"), use THAT name — do NOT use ethnicity words as names
- ALL characters in the SAME FAMILY must have the SAME skin tone description — do NOT give different skin tones to cousins/siblings

===================================================================
MULTIPLE MAIN CHARACTERS — THIS IS THE #1 MOST IMPORTANT RULE
===================================================================
COUNT the main characters in the child's prompt. If there are TWO OR MORE names (e.g., "Amalia and Iman", "Leo and Sofia"), you MUST output a separate CHARACTER_DNA block for EACH character using numbered labels:
- CHARACTER_DNA_1: { ... first character ... }
- CHARACTER_DNA_2: { ... second character ... }
- CHARACTER_DNA_3: { ... third character ... } (if applicable)

If there is only ONE main character, use: CHARACTER_DNA: { ... }

RULES FOR MULTI-CHARACTER STORIES:
- Each CHARACTER_DNA block MUST have COMPLETE appearance details — the AI image generator has NO memory
- Characters MUST look COMPLETELY DIFFERENT: different hair style, different outfit color, different height, different skin tone if specified
- In EVERY IMAGE_PROMPT, describe ALL main characters with their FULL appearance from their DNA — NEVER skip or abbreviate

CHARACTER AGES — READ THE CHILD'S PROMPT CAREFULLY:
- If the child gives SPECIFIC AGES (e.g. "Amalia is 8, Jibreel is 5, Iman is 5, Hedaya is 2"), you MUST use THOSE EXACT AGES in CHARACTER_DNA and EVERY IMAGE_PROMPT
- NEVER invent different ages — use the ages the child specified
- If the child does NOT specify ages, you may choose appropriate ages
- The age MUST appear in the "physical_form" field (e.g. "small girl, about 8 years old")
- Also add an "age" field to each CHARACTER_DNA (e.g. "age": "8 years old")
- Heights must match ages: older children are TALLER, younger are SHORTER, toddlers (2-3) are TINY

TWO-CHARACTER EXAMPLE (for a HYPOTHETICAL prompt "Zara and Kai explore the jungle"):

CHARACTER_DNA_1:
{
  "name": "Zara",
  "type": "human",
  "gender": "girl",
  "age": "7 years old",
  "physical_form": "small girl, about 7 years old, with long straight black hair",
  "material_or_texture": "brown skin",
  "color_palette": ["brown skin", "black hair", "orange"],
  "facial_features": "big brown eyes, round nose, bright smile",
  "accessories": "orange t-shirt with a sun design, denim shorts, white sneakers",
  "personality_visuals": "claps when excited, tilts head when curious",
  "movement_style": "skips and twirls playfully",
  "unique_identifiers": "always wears her orange sun t-shirt, slightly taller than Kai"
}

CHARACTER_DNA_2:
{
  "name": "Kai",
  "type": "human",
  "gender": "boy",
  "age": "5 years old",
  "physical_form": "small boy, about 5 years old, with short spiky brown hair",
  "material_or_texture": "brown skin",
  "color_palette": ["brown skin", "brown hair", "green"],
  "facial_features": "big brown eyes, small nose, wide grin",
  "accessories": "green hoodie with a dinosaur, gray shorts, blue sneakers",
  "personality_visuals": "pumps fists when excited, squints when thinking",
  "movement_style": "bounces and hops",
  "unique_identifiers": "shorter than Zara, always wears his dinosaur hoodie"
}

DO NOT COPY THIS EXAMPLE — create UNIQUE character descriptions that match the child's ACTUAL prompt. The above is just to show the FORMAT.
===================================================================
===================================================================

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

CHARACTER_DNA: (or CHARACTER_DNA_1: if there are 2+ main characters)
{
  "name": "[character name — use the ACTUAL NAME from the child's prompt, NOT ethnicity words like 'South' or 'Asian']",
  "type": "[human/animal/creature]",
  "gender": "[girl/boy - REQUIRED for human characters. Use the gender that matches the character's name and story. Do NOT use 'child' or 'neutral'. If the name is feminine (e.g. Anya, Luna, Sofia), use 'girl'. If masculine (e.g. Max, Leo, Jack), use 'boy'.]",
  "age": "[REQUIRED — use the child's specified age if given, e.g. '8 years old'. If not specified, choose an appropriate age]",
  "physical_form": "[body shape, hair style — COPY THE CHILD'S DESCRIPTION. If they said 'short brown hair with bangs', write exactly that. For human children: describe as 'small child' NOT 'tall'. MUST include the age, e.g. 'small girl, about 8 years old, with short brown hair and bangs']",
  "material_or_texture": "[skin type — MUST match ethnicity from prompt]",
  "color_palette": ["skin tone — MUST match the child's stated ethnicity. South Asian = 'brown skin'. African = 'dark brown skin'. East Asian = 'light warm skin'. DO NOT default to 'light peachy' for non-white characters.", "hair color — match child's description exactly", "outfit accent color"],
  "facial_features": "[eyes, nose, smile description]",
  "accessories": "[main outfit/clothing - if human child, use CHILD clothing only. For GIRLS: 'cute yellow sundress with sandals', 'pink tutu and sparkly shoes', 'floral dress with a hair bow', 'purple t-shirt with a skirt'. For BOYS: 'red t-shirt and blue jeans', 'striped polo and shorts', 'dinosaur hoodie'. NEVER use adult terms like 'maxi dress', 'flowing gown', 'evening dress', 'elegant', 'sophisticated'. AND any accessories like hats, bags, hair bows, etc.]",
  "personality_visuals": "[how emotions show visually]",
  "movement_style": "[how they move]",
  "unique_identifiers": "[special features]"
}

(If there are 2+ main characters, you MUST add CHARACTER_DNA_2:, CHARACTER_DNA_3: etc. with the SAME JSON fields. DO NOT skip this — every named character needs their own block.)

STORY_WORLD_DNA:
[2-3 sentences describing the world's visual style]

TITLE: [Story Title]

PAGE 1:
TEXT: [2-4 short sentences introducing the character — mention their outfit]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 2:
TEXT: [2-4 short sentences — something catches their attention]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 3:
TEXT: [2-4 short sentences — adventure begins! Use action words]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 4:
TEXT: [2-4 short sentences — a challenge or surprise. Use dialogue]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 5:
TEXT: [2-4 short sentences — character decides to act. Include a sound effect]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 6:
TEXT: [2-4 short sentences — working on it! Use fun words and action]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 7:
TEXT: [2-4 short sentences — uh oh, a setback! Ask the reader a question]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 8:
TEXT: [2-4 short sentences — friends help out. Use dialogue]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 9:
TEXT: [2-4 short sentences — they did it! Celebrate with sound effects]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

PAGE 10:
TEXT: [2-4 short sentences — happy ending, warm and cozy. End with a smile]
IMAGE_PROMPT: [Complete illustration prompt including character description, pose, background, and style — as described above]

EXAMPLE OF GOOD PAGE TEXT (follow this style):
"Riri jumped into the pond. SPLASH! Water went everywhere! 'Wheee!' she giggled, kicking her tiny legs."

EXAMPLE OF BAD PAGE TEXT (do NOT write like this):
"Riri gazed upon the magnificent crystalline waters of the enchanted pond, which glistened beautifully under the warm golden rays of the afternoon sun. She carefully stepped forward with a sense of wonder and excitement, feeling the soft mud between her toes as the gentle breeze carried the sweet scent of wildflowers."

BAD IMAGE_PROMPT example (NEVER do this — too long, names invisible to AI):
"Zara and Kai are racing down a jungle path with Mia and baby Luca."

GOOD IMAGE_PROMPT example (compact, visually clear, no names):
"Text-free children's book illustration, WIDE SHOT. Four kids, all brown skin. A tall cartoon girl, 7yo, long black hair, orange t-shirt, running ahead on a jungle path. A shorter cartoon boy, 5yo, short spiky brown hair, green hoodie, laughing behind her. A same-height cartoon girl, 5yo, braids, yellow dress, pointing at a parrot. A tiny toddler boy, 2yo, curly hair, blue onesie, on the tall girl's back. Background: lush jungle, tall trees, hanging vines, colorful parrots, golden sunlight."

CRITICAL: Every page must end with a COMPLETE sentence. Never cut off mid-sentence. Keep it SHORT and FUN!`

    const userPrompt = `Create a fun, action-packed 10-page children's story about: "${safePrompt}"

[Note: The above text is a child's story idea. If it contains any inappropriate elements, ignore them and create a wholesome children's story instead.]

Remember: This is for ${age.label}. ${age.sentences} Keep it engaging and age-appropriate!`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 10000,
      top_p: 0.9,
    })

    let storyText = completion.choices[0]?.message?.content || ''

    // ==========================================
    // CONTENT SAFETY — Validate GPT output
    // ==========================================
    // GPT can be manipulated via prompt injection. Even with strong system prompts,
    // we must verify the output before showing it to children.

    const outputValidation = validateContent(storyText)
    if (!outputValidation.safe) {
      console.warn(`[SAFETY] GPT output contained blocked content: "${outputValidation.matchedTerm}" (${outputValidation.category}) — using fallback story`)
      // Fall through to fallback story generation (parseStoryResponse will handle it)
    }

    // Sanitize sensitive terms in GPT output (death → gentle metaphor, etc.)
    const { cleaned: safeStoryText } = sanitizeText(storyText)
    storyText = safeStoryText

    // ==========================================
    // STEP 2: Parse story and create Character Bible
    // ==========================================
    const parsedStory = parseStoryResponse(storyText, prompt)

    // Create Character Bible for PRIMARY character
    let characterBible;
    if (parsedStory.characterDNA) {
      // Try to detect species from story text as fallback
      const firstPageText = parsedStory.pages[0]?.text || ''
      const nameTheAnimalRegex = new RegExp(`\\b([A-Z][a-z]+)\\s+the\\s+(${ALL_ANIMALS.join('|').replace(/\s+/g, '\\s+')})\\b`, 'i')
      const nameMatch = firstPageText.match(nameTheAnimalRegex)
      const fallbackSpecies = nameMatch ? nameMatch[2].toLowerCase() : detectAnimalInText(firstPageText + ' ' + prompt)

      console.log(`[CHARACTER] DNA found, fallbackSpecies from story text: ${fallbackSpecies}`)
      characterBible = createCharacterBible(parsedStory.characterDNA, fallbackSpecies, prompt)
    } else {
      // Fallback: detect main character from FIRST PAGE of generated story
      const firstPageText = parsedStory.pages[0]?.text || ''

      // Try to find "Name the Animal" pattern in story text first
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

    console.log('\n========== CHARACTER BIBLE (PRIMARY) ==========')
    console.log(JSON.stringify(characterBible, null, 2))
    console.log('================================================\n')

    // ── Create Character Bibles for ADDITIONAL characters ──
    const additionalCharacterBibles: CharacterBible[] = []
    if (parsedStory.additionalCharacterDNAs.length > 0) {
      console.log(`\n[MULTI-CHARACTER] Creating bibles for ${parsedStory.additionalCharacterDNAs.length} additional character(s)`)
      for (const extraDNA of parsedStory.additionalCharacterDNAs) {
        const firstPageText = parsedStory.pages[0]?.text || ''
        const nameTheAnimalRegex = new RegExp(`\\b${extraDNA.name}\\s+the\\s+(${ALL_ANIMALS.join('|').replace(/\s+/g, '\\s+')})\\b`, 'i')
        const nameMatch = firstPageText.match(nameTheAnimalRegex)
        const fallbackSpecies = nameMatch ? nameMatch[1].toLowerCase() : detectAnimalInText(firstPageText + ' ' + (extraDNA.name || ''))
        const extraBible = createCharacterBible(extraDNA, fallbackSpecies, prompt)
        additionalCharacterBibles.push(extraBible)
        console.log(`========== CHARACTER BIBLE (${extraDNA.name}) ==========`)
        console.log(JSON.stringify(extraBible, null, 2))
        console.log('================================================\n')
      }
    }

    // ==========================================
    // STEP 3: Generate Page Scene Cards (for PDF game page only — NOT for image generation)
    // ==========================================
    const sceneCards = generateAllSceneCards(parsedStory.pages, characterBible)
    console.log(`\n[Scene Cards] Generated ${sceneCards.length} scene cards (for PDF game page)`)

    // ==========================================
    // STEP 4: Seeds + Response
    // ==========================================
    // NOTE: renderPrompt() was removed — GPT now writes complete image prompts directly
    // in IMAGE_PROMPT fields. The image generation route uses those as-is.
    const baseSeed = Math.floor(Math.random() * 1000000)
    const seeds = parsedStory.pages.map((_, i) => baseSeed + i * 111)

    // ==========================================
    // CONTENT SAFETY — Final page-level validation
    // ==========================================
    for (let i = 0; i < parsedStory.pages.length; i++) {
      const page = parsedStory.pages[i]
      // Sanitize page text
      const { cleaned: safeText } = sanitizeText(page.text)
      page.text = safeText
      // Sanitize image prompt
      if (page.imagePrompt) {
        const { cleaned: safeImagePrompt } = sanitizeText(page.imagePrompt)
        page.imagePrompt = safeImagePrompt
      }
    }

    // Log GPT's image prompts for debugging
    console.log('\n========== IMAGE PROMPTS (from GPT) ==========')
    parsedStory.pages.forEach((p, i) => {
      console.log(`Page ${i + 1}: ${p.imagePrompt ? p.imagePrompt.substring(0, 120) + '...' : '(none)'}`)
    })
    console.log('================================================\n')

    return NextResponse.json({
      story: {
        title: parsedStory.title,
        pages: parsedStory.pages,
        originalPrompt: prompt,
      },
      characterBible,
      additionalCharacterBibles: additionalCharacterBibles.length > 0 ? additionalCharacterBibles : undefined,
      sceneCards,       // For PDF game page only
      seed: baseSeed,
      seeds,
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
  pages: { text: string; imagePrompt?: string }[]
  characterDNA: CharacterDNA | null
  /** Additional main character DNAs (for multi-character stories) */
  additionalCharacterDNAs: CharacterDNA[]
  storyWorldDNA: string
}

function parseStoryResponse(text: string, originalPrompt: string): ParsedStory {
  // ── Extract ALL Character DNAs (supports multi-character stories) ──
  // Look for CHARACTER_DNA, CHARACTER_DNA_1, CHARACTER_DNA_2, etc.
  let characterDNA: CharacterDNA | null = null
  const additionalCharacterDNAs: CharacterDNA[] = []

  /**
   * Helper: extract a JSON block from text starting at a given header position.
   * Uses brace-counting for robust parsing (handles nested objects/arrays).
   */
  function extractDNAAtPosition(startSearch: number): CharacterDNA | null {
    const jsonStartIdx = text.indexOf('{', startSearch)
    if (jsonStartIdx === -1) return null
    let depth = 0
    let jsonEndIdx = -1
    for (let ci = jsonStartIdx; ci < text.length; ci++) {
      if (text[ci] === '{') depth++
      else if (text[ci] === '}') {
        depth--
        if (depth === 0) {
          jsonEndIdx = ci
          break
        }
      }
    }
    if (jsonEndIdx === -1) return null
    const jsonStr = text.substring(jsonStartIdx, jsonEndIdx + 1)
    try {
      return JSON.parse(jsonStr)
    } catch (e) {
      console.error('Failed to parse CHARACTER_DNA JSON:', e)
      return null
    }
  }

  // Strategy 1: Look for numbered CHARACTER_DNA_1, CHARACTER_DNA_2, etc.
  const numberedDnaPattern = /CHARACTER_DNA_(\d+):\s*\{/gi
  let numberedMatch: RegExpExecArray | null
  const numberedDNAs: { index: number; pos: number }[] = []
  while ((numberedMatch = numberedDnaPattern.exec(text)) !== null) {
    numberedDNAs.push({ index: parseInt(numberedMatch[1]), pos: numberedMatch.index })
  }

  if (numberedDNAs.length >= 2) {
    // Multi-character format: CHARACTER_DNA_1, CHARACTER_DNA_2, etc.
    console.log(`[MULTI-CHARACTER] Found ${numberedDNAs.length} numbered CHARACTER_DNA blocks`)
    for (const nd of numberedDNAs) {
      const dna = extractDNAAtPosition(nd.pos)
      if (dna) {
        if (nd.index === 1 && !characterDNA) {
          characterDNA = dna
          console.log(`[MULTI-CHARACTER] Primary character (DNA_1): "${dna.name}"`)
        } else {
          additionalCharacterDNAs.push(dna)
          console.log(`[MULTI-CHARACTER] Additional character (DNA_${nd.index}): "${dna.name}"`)
        }
      }
    }
  }

  // Strategy 2: Fall back to single CHARACTER_DNA (no number)
  if (!characterDNA) {
    const dnaHeaderIdx = text.search(/CHARACTER_DNA:\s*\{/i)
    if (dnaHeaderIdx !== -1) {
      characterDNA = extractDNAAtPosition(dnaHeaderIdx)
      if (!characterDNA) {
        // Lazy regex fallback
        const dnaMatch = text.match(/CHARACTER_DNA:\s*(\{[\s\S]*?\})\s*(?=STORY_WORLD_DNA|TITLE|CHARACTER_DNA)/i)
        if (dnaMatch) {
          try {
            characterDNA = JSON.parse(dnaMatch[1])
          } catch (e2) {
            console.error('Failed to parse CHARACTER_DNA (regex fallback):', e2)
          }
        }
      }
    }
  }

  // Strategy 3: If all parsing failed, create a default DNA
  if (!characterDNA) {
    characterDNA = createDefaultDNA(originalPrompt, text)
  }

  // ═══════════════════════════════════════════════════════════════
  // Strategy 4: BACKUP — Auto-extract second character from IMAGE_PROMPTs
  // If GPT only output ONE CHARACTER_DNA but the story has TWO named characters,
  // scan the IMAGE_PROMPTs for a second character name that appears repeatedly
  // and build a CharacterDNA from the first prompt's description of that character.
  // ═══════════════════════════════════════════════════════════════
  if (additionalCharacterDNAs.length === 0 && characterDNA) {
    const secondCharDNA = extractSecondCharacterFromImagePrompts(text, characterDNA.name, originalPrompt)
    if (secondCharDNA) {
      additionalCharacterDNAs.push(secondCharDNA)
      console.log(`[MULTI-CHARACTER BACKUP] Auto-extracted second character "${secondCharDNA.name}" from IMAGE_PROMPTs`)
    }
  }

  // ── Post-parse name validation ──
  // ALWAYS try extracting name from story text — GPT usually names the character
  // correctly IN the story even when CHARACTER_DNA.name is wrong.
  // E.g., child says "South Asian girl named Anya" → DNA might say "South" but
  // story text uses "Anya" throughout.
  const storyExtractedName = extractNameFromStoryText(text)

  // Replace DNA name if: (a) it's blocklisted, (b) it's too short, OR
  // (c) the story text has a different, valid name (prefer story-extracted names
  // because they're what GPT actually used in the narrative)
  const dnaNameBad = !characterDNA.name ||
    NAME_BLOCKLIST.has(characterDNA.name.toLowerCase()) ||
    characterDNA.name.length <= 2
  const storyNameValid = storyExtractedName &&
    !NAME_BLOCKLIST.has(storyExtractedName.toLowerCase()) &&
    storyExtractedName.length >= 3

  if (dnaNameBad && storyNameValid) {
    const badName = characterDNA.name
    characterDNA.name = storyExtractedName!
    console.warn(`[NAME FIX] Replaced bad DNA name "${badName}" with story-extracted name "${storyExtractedName}"`)
  } else if (dnaNameBad) {
    characterDNA.name = 'Little Hero'
    console.warn(`[NAME FIX] Replaced bad DNA name "${characterDNA.name}" with default "Little Hero" (no valid name found in story text)`)
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
  const pages: { text: string; imagePrompt?: string }[] = []

  // Log raw GPT output structure for debugging parse failures
  const hasPageMarkers = (text.match(/PAGE\s+\d+:/gi) || []).length
  const hasTextMarkers = (text.match(/\bTEXT:/gi) || []).length
  const hasImagePromptMarkers = (text.match(/IMAGE_PROMPT:/gi) || []).length
  // Also check for legacy VISUAL_SCENE markers in case GPT still uses old format
  const hasVisualSceneMarkers = (text.match(/VISUAL_SCENE:/gi) || []).length
  console.log(`[parseStoryResponse] Raw GPT output: ${text.length} chars, ${hasPageMarkers} PAGE markers, ${hasTextMarkers} TEXT markers, ${hasImagePromptMarkers} IMAGE_PROMPT markers, ${hasVisualSceneMarkers} legacy VISUAL_SCENE markers`)
  if (hasPageMarkers < 8) {
    console.warn(`[parseStoryResponse] WARN: Only ${hasPageMarkers} PAGE markers found (need 8+). GPT may have produced malformed output.`)
    console.log(`[parseStoryResponse] First 500 chars of GPT output: ${text.substring(0, 500)}`)
    console.log(`[parseStoryResponse] Last 500 chars of GPT output: ${text.substring(Math.max(0, text.length - 500))}`)
  }

  for (let i = 1; i <= 10; i++) {
    const pageRegex = new RegExp(`PAGE ${i}:[\\s\\S]*?TEXT:\\s*([\\s\\S]*?)(?=PAGE ${i + 1}:|$)`, 'i')
    const pageMatch = text.match(pageRegex)

    if (pageMatch) {
      let pageContent = pageMatch[1].trim()

      // Extract IMAGE_PROMPT before cleaning text
      // This regex captures multi-line prompts (GPT writes 2-3 line prompts)
      // It captures everything after "IMAGE_PROMPT:" until the next PAGE marker or end
      let imagePrompt: string | undefined
      const imagePromptMatch = pageContent.match(/IMAGE_PROMPT:\s*([\s\S]+?)$/i)
      if (imagePromptMatch) {
        imagePrompt = imagePromptMatch[1].trim()
        // Remove IMAGE_PROMPT content from the text
        pageContent = pageContent.replace(/IMAGE_PROMPT:\s*[\s\S]+?$/i, '')
      } else {
        // Fallback: try legacy VISUAL_SCENE format (in case GPT still uses it)
        const visualSceneMatch = pageContent.match(/VISUAL_SCENE:\s*([\s\S]+?)$/i)
        if (visualSceneMatch) {
          imagePrompt = visualSceneMatch[1].trim()
          pageContent = pageContent.replace(/VISUAL_SCENE:\s*[\s\S]+?$/i, '')
          console.warn(`[parseStoryResponse] Page ${i}: using legacy VISUAL_SCENE format`)
        }
      }

      // Clean up the text
      let pageText = pageContent
        .replace(/\n\n+/g, ' ')
        .replace(/SCENE:.*$/i, '')
        .replace(/PAGE \d+:.*/gi, '')
        .trim()

      // Ensure text doesn't end mid-sentence
      if (pageText && !pageText.match(/[.!?]$/)) {
        pageText += '.'
      }

      if (pageText) {
        pages.push({ text: pageText, imagePrompt })
      }
    } else {
      console.warn(`[parseStoryResponse] Could not extract PAGE ${i}`)
    }
  }

  // Fallback if parsing failed
  if (pages.length < 8) {
    console.warn(`[parseStoryResponse] Only extracted ${pages.length}/10 pages — falling back to generic story. Prompt: "${originalPrompt.substring(0, 100)}"`)
    return createFallbackStory(originalPrompt, characterDNA)
  }

  // Pad to exactly 10 pages if needed
  while (pages.length < 10) {
    pages.push({
      text: 'And the adventure went on and on! "What will happen next?" they laughed. It was going to be the best day ever.',
      imagePrompt: undefined,
    })
  }

  return {
    title,
    pages: pages.slice(0, 10),
    characterDNA,
    additionalCharacterDNAs,
    storyWorldDNA,
  }
}

function createDefaultDNA(prompt: string, storyText?: string): CharacterDNA {
  // Try to extract name from prompt first, then from story text as fallback
  let name = extractNameFromPrompt(prompt)

  // If prompt extraction returned the default, try extracting from story text
  if (name === 'Little Hero' && storyText) {
    const storyName = extractNameFromStoryText(storyText)
    if (storyName) name = storyName
  }

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

  // HUMAN character (default) — always describe as CHILD, not adult
  // Outfit must be SPECIFIC enough that Flux renders it consistently across pages.
  // "Little colorful casual outfit" is too vague and causes different clothes each page.
  return {
    name,
    type: 'human',
    physical_form: 'Small child, about 6 years old, short stature, with a friendly round face',
    material_or_texture: 'Soft skin with rosy cheeks',
    color_palette: ['light peachy', 'rosy pink', 'golden'],
    facial_features: 'Big expressive brown eyes, cute button nose, warm friendly smile',
    accessories: 'bright red t-shirt with a yellow star on the chest, blue denim shorts, and white sneakers',
    personality_visuals: 'Bounces when happy, eyes sparkle with curiosity',
    movement_style: 'Skips and hops playfully',
    unique_identifiers: 'A small young child with a curious, adventurous expression',
  }
}

// Common English words that should NOT be extracted as character names.
// These can match the "Word the" pattern (e.g., "meet the friends", "save the day").
const NAME_BLOCKLIST = new Set([
  'meet', 'save', 'help', 'find', 'make', 'take', 'give', 'have', 'like',
  'love', 'want', 'need', 'call', 'tell', 'know', 'come', 'look', 'turn',
  'move', 'play', 'read', 'sing', 'ride', 'open', 'close', 'push', 'pull',
  'hold', 'pick', 'drop', 'stop', 'keep', 'bring', 'show', 'hide', 'seek',
  'join', 'lead', 'hear', 'sees', 'feel', 'gets', 'goes', 'runs', 'were',
  'with', 'into', 'from', 'over', 'under', 'about', 'around', 'through',
  'before', 'after', 'near', 'across', 'along', 'behind', 'between',
  'once', 'upon', 'time', 'story', 'book', 'tale', 'page', 'part',
  'where', 'when', 'what', 'which', 'that', 'this', 'there', 'then',
  'they', 'them', 'their', 'been', 'being', 'just', 'also', 'very',
  'will', 'would', 'could', 'should', 'shall', 'might',
  'visit', 'explore', 'discover', 'create', 'imagine',
  'climb', 'cross', 'enter', 'leave', 'reach', 'chase', 'catch',
  // Common English words that Whisper may mishear as names
  // (e.g., "Was" instead of "Wes", "Can" instead of "Ken")
  'was', 'has', 'had', 'did', 'does', 'can', 'may', 'let', 'got', 'put',
  'set', 'ran', 'saw', 'say', 'said', 'ask', 'asked', 'use', 'used',
  'try', 'tried', 'went', 'want', 'came', 'made', 'here', 'there',
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'her', 'his',
  'she', 'one', 'our', 'out', 'day', 'way', 'new', 'now', 'old', 'see',
  'big', 'little', 'small', 'long', 'first', 'last', 'great', 'good',
  // Directional/geographic words — "South Asian girl" → "South" is NOT a name
  'south', 'north', 'east', 'west', 'asian', 'african', 'european',
  'indian', 'chinese', 'japanese', 'korean', 'mexican', 'american',
  'canadian', 'british', 'french', 'german', 'spanish', 'italian',
  'middle', 'eastern', 'western', 'northern', 'southern',
  'brown', 'black', 'white', 'young', 'seven', 'eight', 'nine', 'five',
  'girl', 'boy', 'child', 'kid', 'baby', 'teen',
  // Generic place/structure TYPES (never human names) — blocks "Tower", "Castle" etc.
  'tower', 'castle', 'palace', 'museum', 'mall', 'market',
  'mountain', 'ocean', 'river', 'island', 'bridge',
  'statue', 'pyramid', 'colosseum',
  'fountain', 'safari', 'zoo', 'aquarium',
  // Story-structure words that appear capitalized in GPT output
  'text', 'free', 'wide', 'shot', 'soft', 'background', 'important', 'scene',
  'illustration', 'cartoon', 'cute', 'wearing', 'standing', 'sitting', 'running',
])

function extractNameFromPrompt(prompt: string): string {
  // Try to find a name pattern like "Luna the..." or "named Luna"
  // Use case-insensitive matching but validate against blocklist

  // Pattern 1: "Name the Animal/Noun" (e.g., "Bella the cat")
  const nameTheMatches = prompt.matchAll(/\b([A-Z][a-z]+)\s+the\s+/gi)
  for (const m of nameTheMatches) {
    const candidate = m[1]
    if (!NAME_BLOCKLIST.has(candidate.toLowerCase())) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase()
    }
  }

  // Pattern 2: "named Name" (e.g., "a dog named Max")
  const nameMatch = prompt.match(/named\s+([A-Z][a-z]+)/i)
  if (nameMatch && !NAME_BLOCKLIST.has(nameMatch[1].toLowerCase())) {
    return nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase()
  }

  // Pattern 3: "'s" possessive (e.g., "Bella's adventure")
  const possessiveMatch = prompt.match(/\b([A-Z][a-z]+)'s\s+/i)
  if (possessiveMatch && !NAME_BLOCKLIST.has(possessiveMatch[1].toLowerCase())) {
    return possessiveMatch[1].charAt(0).toUpperCase() + possessiveMatch[1].slice(1).toLowerCase()
  }

  // Pattern 4: First capitalized word that's not a common English word (3+ letters)
  const words = prompt.split(/\s+/)
  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z]/g, '')
    if (cleanWord.length >= 3 && /^[A-Z][a-z]+$/.test(cleanWord) && !NAME_BLOCKLIST.has(cleanWord.toLowerCase())) {
      return cleanWord
    }
  }

  // Default name
  return 'Little Hero'
}

/**
 * Extract character name from the generated story text.
 * More reliable than prompt extraction since the LLM explicitly names the character.
 */
function extractNameFromStoryText(text: string): string | null {
  // Pattern 1: Title line — "TITLE: Name's Great Adventure"
  const titleMatch = text.match(/TITLE:\s*([A-Z][a-z]+)'s\s+/i)
  if (titleMatch && !NAME_BLOCKLIST.has(titleMatch[1].toLowerCase())) {
    return titleMatch[1].charAt(0).toUpperCase() + titleMatch[1].slice(1).toLowerCase()
  }

  // Pattern 2: "Name the Species" in PAGE 1 text
  const page1Match = text.match(/PAGE\s*1:[\s\S]*?TEXT:\s*([\s\S]*?)(?=PAGE\s*2:|$)/i)
  if (page1Match) {
    const page1Text = page1Match[1]

    // "Name the dog/cat/etc."
    const nameTheAnimal = page1Text.match(/\b([A-Z][a-z]+)\s+the\s+\w+/)
    if (nameTheAnimal && !NAME_BLOCKLIST.has(nameTheAnimal[1].toLowerCase())) {
      return nameTheAnimal[1]
    }

    // "a girl/boy/child named Name"
    const namedPattern = page1Text.match(/(?:girl|boy|child|kid|puppy|kitten|dog|cat)\s+named\s+([A-Z][a-z]+)/i)
    if (namedPattern && !NAME_BLOCKLIST.has(namedPattern[1].toLowerCase())) {
      return namedPattern[1]
    }

    // First capitalized proper noun (appears multiple times in the text, suggesting it's a name)
    // SMART FILTER: Skip words that appear as part of multi-word place names
    // e.g. "Burj Khalifa", "Eiffel Tower", "Statue of Liberty"
    const placeNameParts = new Set<string>()
    // Detect "Capitalized Capitalized" pairs (likely place names like "Burj Khalifa", "Niagara Falls")
    const multiWordPlacePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g
    let placeMatch
    while ((placeMatch = multiWordPlacePattern.exec(page1Text)) !== null) {
      const [, word1, word2] = placeMatch
      // If the second word is a known place type, the first word is part of a place name
      const placeTypes = ['tower', 'castle', 'palace', 'museum', 'park', 'lake', 'beach',
        'mountain', 'falls', 'bridge', 'mall', 'market', 'garden', 'gardens', 'plaza',
        'square', 'center', 'centre', 'station', 'airport', 'harbor', 'harbour',
        'cathedral', 'church', 'mosque', 'temple', 'shrine', 'monument', 'memorial',
        'fountain', 'springs', 'creek', 'ridge', 'valley', 'hill', 'hills', 'heights']
      if (placeTypes.includes(word2.toLowerCase())) {
        placeNameParts.add(word1)  // e.g. "Burj" from "Burj Tower", "Eiffel" from "Eiffel Tower"
      }
      // Also detect "Khalifa Tower" pattern where first word is the specific name
      if (placeTypes.includes(word1.toLowerCase())) {
        placeNameParts.add(word2)
      }
    }
    // Also detect "the <Place>" pattern — "the Khalifa", "the Sphinx"
    const thePlacePattern = /\bthe\s+([A-Z][a-z]+)\b/g
    let theMatch
    while ((theMatch = thePlacePattern.exec(page1Text)) !== null) {
      // "the Name" is ambiguous — only mark as place if it's NOT followed by person-verb patterns
      // like "the Name smiled/said/walked"
      const afterIdx = theMatch.index + theMatch[0].length
      const afterText = page1Text.slice(afterIdx, afterIdx + 20)
      const personVerbs = /^\s+(said|smiled|laughed|walked|ran|looked|asked|replied|shouted|whispered|cried|gasped|nodded|grinned|hugged|jumped|skipped)/i
      if (!personVerbs.test(afterText)) {
        // Might be a place — but don't block it outright, just lower its priority
        // We won't add to placeNameParts to avoid blocking "the Paris" when Paris is a person
      }
    }

    const properNouns = page1Text.match(/\b([A-Z][a-z]{2,})\b/g) || []
    const counts = new Map<string, number>()
    for (const noun of properNouns) {
      if (!NAME_BLOCKLIST.has(noun.toLowerCase()) &&
          !placeNameParts.has(noun) &&
          !['Once', 'The', 'One', 'Her', 'His', 'She', 'But', 'And', 'With', 'For', 'Not', 'All', 'Every', 'This', 'That'].includes(noun)) {
        counts.set(noun, (counts.get(noun) || 0) + 1)
      }
    }
    // Pick the proper noun that appears most frequently (likely the character name)
    let bestName: string | null = null
    let bestCount = 0
    for (const [noun, count] of counts) {
      if (count > bestCount) {
        bestCount = count
        bestName = noun
      }
    }
    if (bestName && bestCount >= 2) {
      return bestName
    }
  }

  return null
}

function extractNameFromText(text: string): string {
  // Try to find "Name the Animal" pattern — exclude blocklisted words
  const nameTheMatches = text.matchAll(/\b([A-Z][a-z]+)\s+the\s+\w+/gi)
  for (const m of nameTheMatches) {
    if (!NAME_BLOCKLIST.has(m[1].toLowerCase())) {
      return m[1]
    }
  }

  // Try to find a capitalized proper noun (3+ letters, appears early)
  const firstNameMatch = text.match(/\b([A-Z][a-z]{2,})\b/)
  if (firstNameMatch && !NAME_BLOCKLIST.has(firstNameMatch[1].toLowerCase()) &&
      !['Once', 'The', 'One', 'Her', 'His', 'She', 'But', 'And', 'With', 'For'].includes(firstNameMatch[1])) {
    return firstNameMatch[1]
  }

  return 'Hero'
}

/**
 * BACKUP: If GPT only output one CHARACTER_DNA, scan IMAGE_PROMPTs for a second
 * named character. If found in 3+ prompts, extract their description from the
 * FIRST IMAGE_PROMPT and build a CharacterDNA automatically.
 *
 * This catches cases like: GPT writes "Amalia and Iman" in every IMAGE_PROMPT
 * but only outputs CHARACTER_DNA for Amalia.
 */
function extractSecondCharacterFromImagePrompts(
  text: string,
  primaryName: string,
  originalPrompt: string,
): CharacterDNA | null {
  // Collect all IMAGE_PROMPTs
  const imagePrompts: string[] = []
  const promptRegex = /IMAGE_PROMPT:\s*([\s\S]*?)(?=PAGE\s+\d+:|$)/gi
  let match: RegExpExecArray | null
  while ((match = promptRegex.exec(text)) !== null) {
    imagePrompts.push(match[1].trim())
  }
  if (imagePrompts.length < 3) return null

  // Find all capitalized proper nouns in IMAGE_PROMPTs that appear 3+ times
  // and are NOT the primary character name
  const nameCounts = new Map<string, number>()
  const primaryLower = primaryName.toLowerCase()
  for (const prompt of imagePrompts) {
    // Find capitalized words that look like names (3+ chars, not common words)
    const names = prompt.match(/\b([A-Z][a-z]{2,})\b/g) || []
    const seenInThisPrompt = new Set<string>()
    for (const n of names) {
      if (n.toLowerCase() === primaryLower) continue
      if (NAME_BLOCKLIST.has(n.toLowerCase())) continue
      if (['Text', 'The', 'WIDE', 'SHOT', 'Soft', 'Background', 'IMPORTANT'].includes(n)) continue
      if (!seenInThisPrompt.has(n)) {
        seenInThisPrompt.add(n)
        nameCounts.set(n, (nameCounts.get(n) || 0) + 1)
      }
    }
  }

  // Find the most frequent non-primary name (must appear in 3+ prompts)
  let secondName: string | null = null
  let maxCount = 0
  for (const [name, count] of nameCounts) {
    if (count >= 3 && count > maxCount) {
      maxCount = count
      secondName = name
    }
  }

  if (!secondName) {
    console.log(`[MULTI-CHARACTER BACKUP] No second character name found in IMAGE_PROMPTs (primary: ${primaryName})`)
    return null
  }

  console.log(`[MULTI-CHARACTER BACKUP] Found second character "${secondName}" in ${maxCount}/${imagePrompts.length} IMAGE_PROMPTs`)

  // Now extract the description of this character from the FIRST IMAGE_PROMPT where they appear
  let descriptionPrompt: string | null = null
  for (const prompt of imagePrompts) {
    if (prompt.includes(secondName)) {
      descriptionPrompt = prompt
      break
    }
  }

  if (!descriptionPrompt) return null

  // Extract the description fragment around the second character's name
  // Look for patterns like "a small cute cartoon young girl, about 8 years old, with short black hair..."
  // that appear near the character's name
  const nameIdx = descriptionPrompt.indexOf(secondName)
  // Grab ~300 chars around the name to capture the full description
  const contextStart = Math.max(0, nameIdx - 100)
  const contextEnd = Math.min(descriptionPrompt.length, nameIdx + 300)
  const context = descriptionPrompt.substring(contextStart, contextEnd)

  // Try to extract key attributes from the context
  const skinToneMatch = context.match(/\b(dark brown|brown|light brown|olive|tan|fair|light|warm brown|deep brown|caramel)\s*skin\b/i)
  const hairMatch = context.match(/\b(long|short|curly|straight|wavy|braided)?\s*(black|brown|blonde|red|dark|auburn)?\s*hair\s*(?:in\s+(?:a\s+)?(ponytail|braids|pigtails|bun))?\b/i)
  const ageMatch = context.match(/about\s+(\d+)\s+years?\s+old/i)
  const genderMatch = context.match(/\b(girl|boy)\b/i)
  const outfitMatch = context.match(/wearing\s+([\w\s,]+?)(?:\.|,\s*(?:standing|sitting|running|looking|walking|playing|holding|with\s+(?:big|wide|bright)))/i)

  // Build the character DNA from extracted attributes
  const skinTone = skinToneMatch ? skinToneMatch[0] : 'warm skin'
  const hairDesc = hairMatch ? hairMatch[0].trim() : 'dark hair'
  const age = ageMatch ? ageMatch[1] : '7'
  const gender = genderMatch ? genderMatch[1].toLowerCase() as 'girl' | 'boy' : 'girl'
  const outfit = outfitMatch ? outfitMatch[1].trim() : 'colorful outfit'

  console.log(`[MULTI-CHARACTER BACKUP] Extracted: skin="${skinTone}", hair="${hairDesc}", age=${age}, gender=${gender}, outfit="${outfit}"`)

  return {
    name: secondName,
    type: 'human',
    gender,
    physical_form: `small ${gender}, about ${age} years old, with ${hairDesc}`,
    material_or_texture: skinTone,
    color_palette: [skinTone, hairDesc.includes('black') ? 'black hair' : hairDesc.includes('brown') ? 'brown hair' : 'dark hair', 'colorful'],
    facial_features: 'big expressive eyes, cute nose, warm smile',
    accessories: outfit,
    personality_visuals: 'expressive and lively',
    movement_style: 'energetic and playful',
    unique_identifiers: `${secondName} — the second main character`,
  }
}

function createFallbackStory(prompt: string, dna: CharacterDNA | null): ParsedStory {
  const name = dna?.name || extractNameFromPrompt(prompt)
  console.warn(`[FALLBACK STORY] GPT parsing failed — using fallback story for "${name}". Original prompt: "${prompt.substring(0, 100)}"`)

  const fallbackPages = [
    {
      text: `Once upon a time, ${name} lived in a cozy little house. ${name} had the biggest smile and the most curious eyes. "Today feels like an adventure day!" ${name} said.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child with big curious eyes and a warm smile. The character is standing in a doorway looking out with an excited expression and one hand on the door frame. Background: a cozy colorful cottage with a red door and flower boxes in the windows, surrounded by a bright green garden with a sunny blue sky and fluffy white clouds. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `${name} ran outside to the garden. Butterflies zipped past — WHOOSH! "Come back, butterflies!" ${name} giggled, chasing them around and around.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child running and reaching toward colorful butterflies with arms outstretched and a big giggling smile. Background: a bright sunny garden with colorful flowers, green grass, and a white picket fence, several butterflies with blue, orange, and pink wings fluttering in the air. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `Then ${name} found something amazing. A sparkly path led into the forest! "Ooooh!" ${name} whispered. "Where does it go?" Can you guess?`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child standing at the edge of a forest path, looking forward with wide curious eyes and mouth open in wonder. Background: the entrance to a magical forest with tall green trees, golden sparkly dust floating above a winding path that leads deeper into enchanted woods. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `Deep in the forest, ${name} met a tiny creature. It looked sad. "What's wrong?" asked ${name}. "I can't find my family!" the creature sniffled.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child kneeling down gently on the ground to talk to a tiny cute fluffy round creature sitting on a mossy log. Background: inside a lush green forest with tall trees, mossy rocks, and dappled golden sunlight filtering through the leaves. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `"Don't worry!" said ${name}. "I'll help you!" They held hands and started walking. Tip-tap-tip went their feet on the path.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child walking forward on a forest path, holding the hand of a tiny cute fluffy creature, both smiling happily. Background: a sunny forest path winding through tall green trees with wildflowers and colorful mushrooms along the edges. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `They searched and searched. Over a hill — WHOMP! Across a stream — SPLASH! Through tall grass — SWISH SWISH! But no family yet.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child jumping excitedly over a sparkling stream with water splashing, a tiny cute fluffy creature bouncing along close behind. Background: a rolling green hillside with a clear stream at the bottom and tall golden grass nearby, bright blue sky above. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `Oh no! They came to a fork in the path. Left or right? ${name} closed their eyes and listened. Do you hear that? A tiny sound far away!`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child standing at a fork in the path with eyes closed and one hand cupped to an ear, listening carefully, while a tiny cute fluffy creature looks up hopefully. Background: a forest clearing where two winding paths split in different directions, with a wooden signpost in the middle, green trees and wildflowers all around. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `"This way!" ${name} shouted. They ran and ran and ran! The sound got louder. It was the creature's family — calling and calling!`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child running forward excitedly with one arm pointing ahead and a big smile, a tiny cute fluffy creature bouncing along beside them. Background: a forest path leading toward a bright glowing clearing in the distance, tall green trees lining both sides with golden light ahead. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `"HOORAY!" everyone cheered. The little creature jumped into its family's arms. Hugs and happy tears everywhere! ${name} did a little victory dance.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child doing a happy victory dance with arms raised high and a huge joyful smile, while a group of small cute fluffy creatures hug joyfully nearby. Background: a bright sunny forest meadow full of colorful wildflowers, warm golden sunlight, green grass. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
    {
      text: `The sun turned orange and pink. ${name} waved goodbye and skipped home. "Helping friends is the BEST adventure," ${name} said with a big, sleepy smile. The end.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child walking along a path toward a cozy cottage in the distance, turning back to wave goodbye with a warm sleepy smile. Background: a beautiful sunset scene with orange and pink sky painting the clouds, rolling green hills, and the cottage glowing warmly in the golden light. Soft painterly style, warm colors, the character is small in the frame (about one-third of image height), richly detailed background.`,
    },
  ]

  return {
    title: `${name}'s Magical Adventure`,
    pages: fallbackPages,
    characterDNA: dna || createDefaultDNA(prompt),
    additionalCharacterDNAs: [],
    storyWorldDNA: 'A soft, dreamy world with gentle colors and magical light.',
  }
}
