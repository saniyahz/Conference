import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { CharacterBible, PageSceneCard } from '@/lib/visual-types'
import { createCharacterBible, createSimpleBible, CharacterDNA } from '@/lib/createCharacterBible'
import { generateAllSceneCards } from '@/lib/generatePageSceneCard'
import { validateContent, sanitizeText, moderateWithOpenAI, getContentError, detectPromptInjection, isCopingStory } from '@/lib/contentSafety'
import { getLanguageName } from '@/lib/fontLoader'

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
    const { prompt, ageGroup = '3-5', storyMode = 'imagination', language = 'en' } = await request.json()

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
    const contentError = getContentError(prompt, storyMode)
    if (contentError) {
      return NextResponse.json(
        { error: contentError, isContentError: true },
        { status: 400 }
      )
    }

    // ── Coping story detection ──
    // Parents can write about real scary situations (missiles, war, storms) with a
    // coping/hope message. These should NOT be blocked or sanitized — the parent
    // deliberately chose this topic to help their child process real experiences.
    const copingStory = isCopingStory(prompt)

    // OpenAI Moderation API — catches semantic violations keywords miss
    // Skip in history mode — historical content triggers false positives (war, death, etc.)
    // Skip for coping stories — parent deliberately chose a difficult topic with a safety message
    if (storyMode !== 'history' && !copingStory) {
      const moderation = await moderateWithOpenAI(prompt, openai)
      if (moderation.flagged) {
        console.warn(`[SAFETY] OpenAI moderation flagged prompt: categories=${moderation.categories.join(',')}`)
        return NextResponse.json(
          { error: "This story idea contains content that isn't appropriate for a children's story app. Please try a different, kid-friendly idea!", isContentError: true },
          { status: 400 }
        )
      }
    }

    // Sanitize sensitive terms (death → gentle metaphor, etc.) — don't block, just soften
    // SKIP sanitization for: history mode (returns unchanged), coping stories (parent chose these words)
    // For coping stories, GPT's system prompt already handles age-appropriate language.
    const { cleaned: sanitizedPrompt, modifications } = copingStory
      ? { cleaned: prompt, modifications: [] }
      : sanitizeText(prompt, storyMode)
    const safePrompt = sanitizedPrompt

    const pipelineStart = Date.now()
    console.log(`[STORY ROUTE] storyMode="${storyMode}", ageGroup="${ageGroup}", language="${language}", prompt="${prompt.substring(0, 80)}"`)

    // ==========================================
    // STEP 1: Generate story text with Character DNA
    // ==========================================

    // Age-specific writing guidance
    const ageConfig = {
      '3-5': {
        label: 'ages 3-5 (toddlers/preschoolers)',
        sentences: '2-4 SHORT sentences per page. Max 10 words per sentence.',
        vocab: 'Use simple words a 4-year-old would know, but make the STORY exciting. Repeat key words for rhythm.',
        style: 'Include sound effects (SPLASH! BOOM! Whoooosh!), animal noises, AND short dialogue between characters ("Oh no!" said Leila. "Look!" cried the bunny). Make EVERY page have something NEW happening — a discovery, a surprise, a problem, or a funny moment. The story should feel like an ADVENTURE, not a description.',
        complexity: 'Simple but WITH A PLOT: a problem or goal on page 1-2, fun obstacles/surprises in pages 3-8, and a satisfying resolution on pages 9-10. Even 3-year-olds love suspense ("But then... the door opened!"), surprises ("It wasn\'t a rock — it was a sleeping dragon!"), and humor (silly character reactions, funny sounds). NEVER just describe a character doing mundane things page after page — something exciting must happen!',
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

${storyMode === 'history' ? `
Create a complete 10-page HISTORICALLY ACCURATE children's story with:
1. Character DNA (a fictional child character who witnesses or learns about the real event)
2. Story world description (the REAL historical setting with accurate details)
3. Educational, engaging story text for each page (${age.sentences})

THE MOST IMPORTANT RULE: This is HISTORY MODE. The parent selected this because they want their child to learn about a REAL historical event. You MUST:
- Tell the ACTUAL historical event with REAL dates, names, places, and facts
- Include the specific year, location, and key historical details
- Mention real consequences (deaths, destruction, displacement) in age-appropriate language
- Page 10 MUST be titled "What We Learned" and contain 3-4 real historical facts about the event
- Do NOT make up a generic adventure — tell THE REAL HISTORY

WRITING STYLE FOR ${age.label.toUpperCase()}:
- ${age.sentences}
- ${age.vocab}
- ${age.style}
- Mix dialogue with factual narration — the child character can ASK questions that get answered with real facts
- Use phrases like "In the year ___", "This really happened", "The real name of this place was..."

IMPORTANT RULES:
- Story must be EXACTLY 10 pages
- ${age.sentences} (never cut off mid-sentence)
- Characters must have consistent appearance throughout
- Frame through a fictional child character, but the EVENTS must be historically accurate
- On PAGE 1, establish the historical setting with the real date and place
- On PAGE 1, mention what the character is wearing (appropriate to the historical period)
- Include at least 5 real historical facts spread across the story
- Page 10 = "What We Learned" with bullet-point facts
` : `
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
- On PAGE 1, mention what the character is wearing (e.g. "Leo had on his favorite red t-shirt and blue jeans.")
- When the character arrives at a new location, describe the location BEFORE the character arrives there

⚠️ FORBIDDEN STORY THEMES — NEVER GENERATE THESE:
- NEVER create sleepover, slumber party, or pajama party stories. These are NOT appropriate for a children's book.
- NEVER have characters of different genders sleeping in the same room or sharing bedtime/nighttime scenes together (unless they are siblings or family).
- If the user asks for a sleepover or pajama party, redirect to a DAYTIME play date, adventure, or fun activity instead.
- Characters should NEVER change into pajamas, nightgowns, or sleepwear in the story unless it is a bedtime story about ONE child going to sleep in their own bed.

⚠️ CHARACTER NAMES — MANDATORY:
- If the user mentions ANY character names in their story idea, you MUST use those EXACT NAMES as the main character(s). NEVER invent new names when the user already provided names.
- If the user says "Liam goes on an adventure", the main character MUST be named Liam — do NOT create a different character like "Sara" or "Zoe".
- If the user provides gender clues (e.g., "he", "his friend Zoe"), you MUST use the correct gender.
- Only invent character names if the user did NOT specify any names at all.
- When inventing names, use COMMON internationally popular names like: Liam, Emma, Noah, Mia, Leo, Sara, Max, Lily, Oliver, Sophie, Jack, Anna, Lucas, Ella. Do NOT default to culturally-specific names unless the user's prompt explicitly mentions a culture or region.
- Do NOT assume the character's ethnicity or cultural background from the story topic. A story about loud noises or city events does NOT mean the characters are from a specific region.
- NEVER use words from the STORY TITLE as the character's name. If the story is about "The Night the Sky Roared", do NOT name the character "Night" or "Sky". The character name must be a REAL human first name.
- The CHARACTER_DNA "name" field must ALWAYS be a proper human first name — NEVER a concept, title word, adjective, or noun.

⚠️ CHARACTER CLOTHING — NO DRESSES:
- NEVER put any character (child or adult) in a dress, gown, skirt, or any dress-like clothing.
- For girls: use t-shirt and jeans, hoodie and jeans, sweater and leggings, overalls, jumpsuit, tunic and pants. ALWAYS use long pants or leggings — NEVER shorts or short skirts.
- For boys: use t-shirt and jeans, hoodie and jeans, sweater and pants, overalls, polo shirt and pants. ALWAYS use long pants — NEVER shorts.
- ALL clothing must be MODEST: long pants or leggings, sleeves (short sleeves minimum), no bare midriffs, no tank tops.
- This applies to ALL characters — main characters, supporting characters, parents, and background characters.
- In IMAGE_PROMPTs, always describe the outfit explicitly with non-dress clothing items.

⚠️ CHARACTER HAIR AND ACCESSORIES — CRITICAL:
- Girl characters MUST have LONG hair (shoulder length or longer). Use: "long straight hair", "long curly hair", "long wavy hair in a ponytail", "long hair in two braids", "long hair with a headband". NEVER give girls short hair, pixie cuts, bob cuts, or buzzed hair.
- Boy characters can have short or medium hair.
- NEVER give ANY child character earrings, piercings, jewelry, makeup, nail polish, or any accessories that look adult or gender-ambiguous.
- Girls should look clearly FEMININE: long hair, soft features, bright colored clothing.
- Boys should look clearly MASCULINE: short hair, sturdy build.
- NO gender-neutral or androgynous character designs — children should be CLEARLY identifiable as a girl or boy at a glance.
- In CHARACTER_DNA, always specify hair length explicitly: "long black curly hair" not just "black curly hair".
`}

${storyMode === 'history' ? `
HISTORY MODE — EDUCATIONAL HISTORICAL CONTENT (Parent-approved):
The parent has selected "History Mode" — they WANT their child to learn about REAL historical events.

⚠️ CHARACTER NAME VARIETY — MANDATORY FOR HISTORY MODE:
- Do NOT always use "Amina" as the character name. VARY the name based on the culture and region of the story:
  * Arab/Middle Eastern stories: Layla, Noor, Yasmin, Hana, Reem, Salma, Dina, Farah, Maha, Lina, Joud — NOT always Amina
  * South Asian stories: Priya, Meera, Anaya, Kavya, Diya, Riya, Anika — NOT always Amina
  * African stories: Nia, Zuri, Amara, Kaia, Adia, Saba — NOT always Amina
  * East Asian stories: Mei, Sakura, Yuki, Hana, Lin — NOT always Amina
  * European stories: Sofia, Elena, Clara, Elise, Margot — NOT always Amina
  * Latin American stories: Lucia, Camila, Valentina, Isabela — NOT always Amina
- The character name must match the SPECIFIC culture of the historical event, not be a generic default
- If the user provides a name in their prompt, use THAT name

⚠️ GEOGRAPHIC CONSISTENCY — MANDATORY FOR HISTORY MODE:
- Every IMAGE_PROMPT must describe the SAME specific geographic location from the story
- Describe the ACTUAL visual characteristics of that place: architecture style, terrain, vegetation, climate, colors
- Example for Aleppo, Syria: "ancient stone buildings with arched doorways, narrow cobblestone streets, limestone walls, flat rooftops, minarets in the distance, dry warm climate, dusty beige and gold tones"
- Example for Tokyo, Japan: "traditional wooden buildings with curved roofs, cherry blossom trees, paper lanterns, pagodas, narrow streets"
- NEVER use generic random backgrounds — every page must clearly look like the SAME specific place
- The geography, architecture, and vegetation must be CONSISTENT across all 10 pages

YOUR #1 JOB: Tell the ACTUAL historical story the parent asked about using REAL dates, names, places, and facts.
- Do NOT fictionalize, rename, or replace real history with a made-up adventure
- You may frame the story through a child character who witnesses, learns about, or imagines being present during the event
- Wars, battles, natural disasters, and deaths CAN and SHOULD be mentioned factually in an age-appropriate way:
  * For ages 3-5: "Many people had to leave their homes" / "It was a very sad time"
  * For ages 6-8: "Many people lost their lives" / "The eruption destroyed the village"
  * For ages 9-12: "Thousands died in the disaster" / "The battle claimed many lives"
- Religious and cultural context IS allowed when historically relevant (e.g., the Crusades, the Reformation)
- The LAST page MUST be a "What We Learned" summary with 2-3 real historical facts
- Keep the tone EDUCATIONAL and RESPECTFUL — never glorify violence

ISLAMIC STORIES — MANDATORY RULES:
If the story is about Islam, the Quran, the Prophet Muhammad, or any Islamic history:
1. NEVER depict Prophet Muhammad (peace be upon him) as a character who appears, speaks, or is physically described. He must NEVER be shown, seen, met, or interacted with directly.
2. NEVER depict Allah in any form — no physical description, no voice, no dialogue.
3. NEVER write fictional dialogue or conversations attributed to Prophet Muhammad or Allah. Do NOT invent words they supposedly said.
4. NEVER have the child character (or any character) meet, see, talk to, or interact with Prophet Muhammad or Allah directly.
5. Instead, tell Islamic stories through INDIRECT narration:
   - "Amina's uncle told her about the Prophet's teachings..."
   - "The elders explained that the Quran was revealed..."
   - "The community gathered to hear the message that had been shared..."
   - Characters can HEAR ABOUT events, READ about them, or learn from family/teachers
6. Focus on: the historical events, the community, the teachings, the cultural impact — NOT on depicting religious figures
7. IMAGE_PROMPTs for Islamic stories must show ONLY landscapes, architecture (mosques, the Kaaba, markets, desert landscapes), community gatherings seen from afar, or scenes WITHOUT any religious figures. NEVER include Muhammad or Allah in any image prompt.
8. Keep all Islamic content accurate and respectful — do not add fictional elements to Islamic theology or history.

STILL NEVER INCLUDE (even in History Mode):
- Nudity, sexual content, romantic content, body-focused descriptions
- Racial/ethnic stereotypes, discriminatory language, slurs, cultural mockery
- Substance references: drugs, alcohol, smoking, vaping
- Profanity, crude language, vulgar humor
- Any content that could be interpreted as grooming, manipulation, or exploitation
- Graphic gore or torture descriptions — keep violence factual but not graphic
` : `
PARENT-CHOSEN COPING STORIES — RESPECT THE PARENT'S INTENT:
- If the parent's prompt describes a REAL scary situation (loud noises, storms, conflict, war sounds, moving to a new place, loss of a pet, etc.) AND provides a COPING/SAFETY message, you MUST honor their topic.
- Do NOT change the scenario to something unrelated. If the parent says "loud noises and missile attacks" do NOT turn it into "fireworks" or "thunder" — the parent chose this topic because their child is LIVING through it.
- Keep the story age-appropriate using the parent's OWN framing and coping message (e.g., "the city protecting you", "take deep breaths", "stay calm").
- The story should acknowledge the scary sounds WITHOUT graphic violence — describe "loud BOOMS", "rumbling", "shaking" but NOT blood, injury, death, or destruction.
- Focus on: what the child can DO (breathe, pray, play, stay with family), NOT on what is happening outside.
- The tone should be HOPEFUL and EMPOWERING — the child learns they can be brave.

⚠️ SETTING FOR DANGER/ATTACK COPING STORIES:
- If the story involves missiles, attacks, bombs, sirens, or any active danger: the characters MUST be INDOORS the entire story — at home, in a safe room, in a shelter, under a blanket fort, etc.
- NEVER show children playing outside during missile attacks, bombings, or sirens. That is dangerous and sends the wrong message.
- The story should show: hearing sounds while INSIDE → adults comforting them INSIDE → doing calming activities INSIDE (breathing, praying, reading, playing board games, singing, drawing, cuddling with family) → sounds fading → feeling safe and brave.
- For natural disasters (earthquakes, storms, tornadoes): children should be in a safe place (under a table, in a shelter, in a basement, in an interior room).
- For emotional coping stories (bullying, moving, loss): outdoor settings are fine — the danger is not physical.

CHILD SAFETY — STILL NEVER INCLUDE (even in coping stories):
- Graphic violence, blood, injury, death, or destruction scenes
- Characters being physically hurt or in immediate visible danger
- Characters seeing dead bodies, rubble, or graphic war scenes
- Hopeless endings — the story must ALWAYS end with safety, hope, and togetherness
- Instead of showing the CAUSE of scary sounds, focus on the CHILD'S experience: hearing sounds, feeling nervous, then being comforted by adults and friends, breathing, playing, feeling brave

PARENTS AND FAMILY — APPEARANCE CONSISTENCY (CRITICAL):
- Parents/family members MUST look RELATED to the child — same skin tone, similar features, same ethnic appearance.
- If the child has brown skin, the parents MUST also have brown skin. If the child has light skin, the parents MUST also have light skin.
- Pick ONE specific look for each parent and use the EXACT SAME description on EVERY page:
  * DAD: Pick a specific hair (e.g., "short dark brown hair"), clothing (e.g., "green sweater and jeans"), and use those EXACT words every time dad appears.
  * MOM: Pick a specific hair (e.g., "long brown hair in a bun"), clothing (e.g., "cozy blue cardigan and jeans"), and use those EXACT words every time mom appears.
- NEVER leave parents undescribed in IMAGE_PROMPTs. If a parent appears, describe their FULL appearance:
  "[skin tone matching child], [specific hair], wearing [specific outfit]"
- Parents must look the SAME on every page — same hair, same skin, same clothes.

SUPPORTING CHARACTER CLOTHING (CRITICAL FOR CHILDREN'S BOOK):
- ALL adult characters (mom, dad, teacher, grandparent, etc.) must wear FULL, MODEST clothing appropriate for a children's book
- Moms/women: blouse with long sleeves and long pants, cardigan and jeans, sweater and leggings, apron over a long-sleeve top — NEVER dresses, NEVER revealing, tight, short, low-cut, or form-fitting clothing
- Dads/men: shirt and long pants, sweater and jeans, vest and jeans — NEVER shirtless
- In IMAGE_PROMPTs, ALWAYS describe adult clothing explicitly: "wearing a cozy blue cardigan and jeans" or "wearing a warm green sweater and jeans"
- NEVER leave adult clothing unspecified — always describe it in full detail
- NEVER use dresses, gowns, or skirts for ANY character — adult or child
- Adult clothing should look COZY and WARM — think cardigans, sweaters, long pants, aprons, overalls

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

If the user's prompt contains genuinely inappropriate themes (sexual content, graphic gore, drugs, racial slurs), IGNORE those elements and create a wholesome alternative.
BUT if the parent describes a REAL-LIFE situation their child is experiencing (war sounds, natural disasters, illness, loss, moving, divorce) with a COPING message, that is NOT inappropriate — the parent chose this topic for their child. Honor it with age-appropriate, hopeful storytelling.
`}
DIVERSITY AND INCLUSION:
- Represent characters from diverse backgrounds positively
- Never associate specific behaviors, abilities, or traits with ethnicity or gender
- If the child specifies ethnicity, honor it with accurate, positive representation
- Never use cultural stereotypes in character design or story elements

${storyMode === 'history' ? `
FOR EACH PAGE, write an IMAGE_PROMPT — a COMPLETE illustration prompt for an AI image generator. The focus should be on the HISTORICAL SCENE and LANDSCAPE, not the characters.

HISTORY MODE IMAGE FORMAT:
"Text-free children's book illustration, WIDE SHOT of [SPECIFIC LOCATION with its REAL visual characteristics — architecture style, terrain, vegetation]. [DESCRIBE THE HISTORICAL SCENE — the event happening, the environment, 4-5 specific visual details of THIS PLACE]. A small cartoon [GENDER] child, [AGE], [SKIN TONE — COPY FROM DNA], [HAIR — COPY FROM DNA], wearing [OUTFIT — COPY FROM DNA], is [SPECIFIC ACTION matching the story — NOT just watching]. The scene dominates the image. Children's book illustration, 2D cartoon style, bold outlines, flat warm colors, educational tone."

CRITICAL COMPOSITION RULES FOR HISTORY MODE:
- The HISTORICAL SCENE fills most of the image — but the character must be clearly visible and recognizable (about 20-25% of the image)
- ALWAYS describe the SPECIFIC REAL geography with CONSISTENT visual details on EVERY page (same architecture style, same terrain, same vegetation, same climate)
- Example: If set in Aleppo, Syria → "ancient limestone buildings with arched doorways, narrow cobblestone streets, flat rooftops, warm dusty beige tones" on EVERY page
- The character must INTERACT with the scene (not just observe): playing in the street, running through a market, peeking from a doorway, sitting on stone steps
- The character's FULL DNA description (gender, hair, outfit, skin tone) must appear in EVERY IMAGE_PROMPT — this is critical for consistency across pages
- The child character should be described as a "small cartoon child" — NEVER as an adult, teenager, woman, or man
- VARY the character's pose and expression on each page — never the same stance twice
- Use "children's book illustration, 2D cartoon style" — NOT realistic or photographic. It should feel like an illustrated educational picture book

ISLAMIC STORIES — IMAGE RULES:
If the story involves Islam, the Quran, or Islamic history:
- ABSOLUTELY NEVER include Prophet Muhammad in ANY image prompt — not his face, body, silhouette, shadow, or any representation
- ABSOLUTELY NEVER include Allah in ANY image prompt
- NEVER depict any prophets or religious figures in images
- Instead, show: the Kaaba, mosques, desert landscapes, markets, ancient Mecca/Medina architecture, scrolls, community gatherings seen from extreme distance, starry skies, mountain caves (empty), caravans
- For scenes about Quranic revelation: show the landscape (Mount Hira, the cave entrance from outside, the night sky, stars) — with NO person inside the cave
- For community scenes: show architecture and gatherings from very far away — no identifiable religious figures
- IMAGE_PROMPTs can show the child narrator observing landscapes/architecture but NEVER interacting with or near any prophets

EXAMPLE HISTORY IMAGE_PROMPT:
"Text-free children's book illustration, WIDE SHOT of a Japanese village at the foot of Mount Fuji. Traditional wooden houses with curved rooftops line a narrow dirt path, cherry blossom trees bare and covered in grey ash. Enormous columns of dark ash and smoke billow from the volcano above, glowing orange lava streams flowing down the mountainside, ash falling like grey snow. A small cartoon girl, about 8 years old, light warm skin, long black hair in a braid, wearing a blue kimono with white patterns and wooden sandals, is crouching behind a stone wall peeking up at the volcano with wide curious eyes. Children's book illustration, 2D cartoon style, bold outlines, flat warm colors, educational tone."
` : `
FOR EACH PAGE, write an IMAGE_PROMPT — a COMPLETE illustration prompt that will be sent DIRECTLY to an AI image generator. This must be fully self-contained, describing EVERYTHING the image should show in one prompt. THE AI IMAGE GENERATOR CANNOT READ NAMES — it only understands physical descriptions. So you must ALWAYS write the full physical description, never just a name.

FORMAT FOR 1 CHARACTER: "Text-free children's book illustration, WIDE SHOT showing a rich detailed scene. [DESCRIBE THE SETTING/ENVIRONMENT FIRST with 4-5 specific visual details — this is the STAR of the image]. In the scene, a small cartoon [GENDER], [AGE — COPY FROM DNA], [SKIN TONE — COPY FROM DNA], [HAIR — COPY-PASTE FROM DNA], wearing [OUTFIT — COPY-PASTE FROM DNA], is [SPECIFIC DYNAMIC ACTION — crouching, climbing, reaching, splashing, NOT just standing] with [FACIAL EXPRESSION — vary each page]. Full body visible, character blends naturally into the scene. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors."

FORMAT FOR 2+ CHARACTERS — KEEP IT COMPACT (max 800 chars total):
"Text-free children's book illustration, WIDE SHOT. A [taller/shorter/tiny] cartoon [boy/girl], [AGE], [SKIN], [KEY HAIR DETAIL], [OUTFIT COLOR+TYPE], is [POSE]. Next to [him/her], a [taller/shorter/tiny] cartoon [boy/girl], [AGE], [SKIN], [KEY HAIR DETAIL], [OUTFIT COLOR+TYPE], is [POSE]. [REPEAT FOR EACH CHARACTER — keep each to ~60 words max]. Background: [SETTING, 3-4 details]. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors."

CRITICAL — KEEP MULTI-CHARACTER PROMPTS SHORT! With 3-4 characters, the AI image generator loses track of details in long prompts. Use ONLY the most visually distinctive trait for each character:
- GENDER (boy/girl) — most important
- RELATIVE SIZE (tallest/shorter/tiny toddler) — second most important
- OUTFIT COLOR (pink t-shirt, blue shirt) — third most important
- ONE hair detail (long brown hair, short curly black hair, bob cut)
- Do NOT repeat skin tone for each character — state it ONCE for all: "all with brown skin"

EXAMPLE for 4 characters: "Text-free children's book illustration, WIDE SHOT. Four cousins, all with brown skin. A tall cartoon girl, 8yo, long wavy brown hair, purple t-shirt and jeans, is pointing excitedly. A shorter cartoon boy, 5yo, short curly black hair, blue rocket t-shirt and jeans, is jumping. A same-height cartoon girl, 5yo, brown bob cut, pink hoodie and leggings, is laughing. A tiny toddler girl, 2yo, curly black hair, purple onesie, is being carried. Background: colorful Dubai fountain plaza with palm trees and city skyline. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors."

COMPOSITION RULE — THE MOST IMPORTANT VISUAL RULE:
- The BACKGROUND and ENVIRONMENT are the stars of each illustration — they should be RICH, DETAILED, and take up MOST of the image (70%+ of the frame)
- The character should be TINY in the frame — about 20% of the image height, like a small figure in a vast landscape painting
- Think of a Hayao Miyazaki film frame — a rich, detailed world with a small character naturally blending into it
- NEVER draw just a close-up of the character's face or upper body
- NEVER let the character fill more than 25% of the frame — if you can't see the character's feet and lots of sky/ground, you're TOO CLOSE
- Describe at least 5-6 specific background elements for every scene (trees, buildings, clouds, animals, objects, weather, lighting, ground texture, etc.)
- Always include "EXTREME WIDE SHOT" at the beginning of your IMAGE_PROMPT

CAMERA ANGLE VARIETY — CRITICAL FOR VISUAL INTEREST:
- Each page MUST use a DIFFERENT camera angle/perspective. Rotate through these:
  * Page 1: Eye-level establishing shot (character centered in vast scene)
  * Page 2: Bird's-eye view / overhead looking down (see the environment from above, character tiny below)
  * Page 3: Low angle looking up (character small at bottom, sky/trees/buildings towering above)
  * Page 4: Side view / profile (character in silhouette or from the side, panoramic background)
  * Page 5: Distant wide shot (character very small, environment dominates completely)
  * Page 6: Behind the character (over-shoulder view, seeing what the character sees)
  * Page 7: Slight Dutch angle / tilted perspective for energy
  * Page 8+: Cycle through again with variations
- Write the camera angle EXPLICITLY in each IMAGE_PROMPT: "BIRD'S-EYE VIEW looking down on...", "LOW ANGLE looking up at..."
- NEVER use the same camera angle on consecutive pages
- This prevents the "same image over and over" problem — varied angles make every page feel unique

POSE AND EXPRESSION VARIETY — CRITICAL FOR NATURAL-LOOKING ILLUSTRATIONS:
- The character must be doing a DIFFERENT ACTION on every page — never the same pose twice
- NEVER just "standing and looking" or "standing and smiling" — the character must be ACTIVELY ENGAGED with the scene
- Good poses: running, climbing, reaching up, crouching to look at something, splashing in water, hugging a pet, jumping off a rock, sitting cross-legged on the ground, leaning against a tree, pulling a wagon, peeking around a corner, twirling, crawling through a tunnel
- VARY the character's expression across pages: curious wide eyes, laughing with mouth open, surprised with hands on cheeks, focused/concentrating, delighted with arms up, thoughtful with hand on chin, mischievous grin
- The character should INTERACT with the environment: touching objects, sitting on things, hiding behind things, reaching for things — not floating in empty space
- Describe the character's body language, not just their outfit — "crouching down with hands cupped around a tiny frog" is much better than "standing in a meadow"

CHARACTER LOCK — SECOND MOST CRITICAL RULE:
Your IMAGE_PROMPT character descriptions MUST EXACTLY MATCH the CHARACTER_DNA you created above. COPY-PASTE the gender, hair, and outfit from your CHARACTER_DNA — do NOT rewrite, paraphrase, or invent new descriptions.

⚠️ GENDER CONSISTENCY IS THE #1 MOST COMMON ERROR:
- If CHARACTER_DNA says gender "girl", then EVERY IMAGE_PROMPT must say "girl" — NEVER write "boy". And vice versa.
- This is the MOST IMPORTANT rule. Getting the gender wrong makes the entire book inconsistent.
- Double-check: does your CHARACTER_DNA say "girl" or "boy"? Use THAT EXACT WORD in every IMAGE_PROMPT.
- NEVER invent a new character that doesn't exist in your CHARACTER_DNA blocks. If you defined a girl named Maya, do NOT write IMAGE_PROMPTs about a boy with different hair and outfit.

⚠️ HAIR AND OUTFIT MUST BE COPY-PASTED FROM CHARACTER_DNA:
- If CHARACTER_DNA says "golden blonde bob cut hair" and "red t-shirt with yellow star", then EVERY IMAGE_PROMPT must say the EXACT SAME words: "golden blonde bob cut hair" and "red t-shirt with yellow star". NEVER change to "curly brown hair" or "blue t-shirt with rocket" — that is WRONG.
- For human characters: include CORRECT gender (girl/boy), approximate age, EXACT HEIGHT relative to other characters, skin tone, EXACT hair description, and EXACT OUTFIT on EVERY page — do NOT skip any of these
- OUTFIT CONSISTENCY IS CRITICAL: If the character wears a "blue kimono with red patterns" on page 1, they MUST wear "blue kimono with red patterns" on EVERY page. Copy-paste the exact outfit phrase. NEVER change colors (blue → green), NEVER change garment type (kimono → dress), NEVER omit the outfit.
- HAIR CONSISTENCY IS CRITICAL: If CHARACTER_DNA says "short brown bob cut hair", then EVERY IMAGE_PROMPT must say "short brown bob cut hair". NEVER change to "curly black hair" or "long wavy hair" — COPY the EXACT hair description from CHARACTER_DNA.
- For animal characters: include species, fur/skin color, and any accessories on EVERY page
- Example: if your CHARACTER_DNA describes a girl with brown skin, long black curly hair, and a yellow t-shirt with jeans, then EVERY IMAGE_PROMPT must include "a small cute cartoon young girl, about 6 years old, brown skin, long black curly hair, wearing a yellow t-shirt with jeans"
- NEVER use just NAMES in IMAGE_PROMPTs! "Amalia, Iman, Jibreel, and Hidayah are racing" is WRONG because the AI cannot see names. Instead write the FULL physical description for each character every time they appear.
- NEVER shorten, abbreviate, or skip ANY character's description — the AI image generator has NO memory between pages and cannot see character names
- If there are MULTIPLE main characters, ALL must be fully described in EVERY IMAGE_PROMPT with their COMPLETE appearance from their CHARACTER_DNA — age, height, skin tone, hair, outfit
- NEVER change a character's hair style, outfit color, outfit type, shoe color, or skin tone between pages unless the story explicitly says they changed clothes
- AGES AND HEIGHTS: An 8-year-old is TALLER than a 5-year-old who is TALLER than a 2-year-old. A 2-year-old is TINY (toddler). Keep these size ratios consistent on EVERY page.
- ALL characters described as children MUST have child proportions (big head, small body, round face) — NEVER draw children as adults or teenagers
`}

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
- Describe ONE clear DYNAMIC action matching the story text — NEVER "standing and looking" or "standing and smiling"
- Be specific and PHYSICAL: "crouching at the water's edge, dipping fingers into the glowing tide pool" NOT "standing at the beach"
- The character must be INTERACTING with objects in the scene: touching, holding, climbing, sitting on, hiding behind, reaching for
- Each page must have a DIFFERENT pose and body position — sitting, kneeling, running, jumping, crawling, leaning, twirling
- Each page must have a DIFFERENT facial expression — don't repeat the same smile on every page

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
BAD example: "A cute cartoon girl in a park" (too zoomed in, character will fill entire frame, no detail, static pose)
BAD example: "A small cute cartoon girl is standing in a meadow and smiling." (boring static pose, no interaction, no scene detail, same as every other page)
BAD example: "Text-free children's book illustration, WIDE SHOT..." repeated with same eye-level angle every page (monotonous — needs camera variety!)
GOOD example (eye-level): "Text-free children's book illustration, EXTREME WIDE SHOT of a warm airplane cabin. Rows of blue leather seats stretch into the distance, overhead compartments with colorful luggage, oval windows showing fluffy white clouds and a golden sunset, a flight attendant pushing a silver drink cart down the narrow aisle, passengers reading books and sleeping. A small cartoon girl, about 6 years old, brown skin, long black curly hair, wearing a yellow t-shirt and denim jeans, is kneeling on her seat and pressing her nose against the oval window, eyes wide with wonder, hands cupped around her face to see better. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors."
GOOD example (bird's-eye): "Text-free children's book illustration, BIRD'S-EYE VIEW looking straight down on a lush green park with winding stone paths, colorful flower beds in geometric patterns, a pond with lily pads, tiny ducks, benches, and autumn trees in orange and gold. A tiny cartoon girl seen from above, brown skin, long black curly hair, yellow t-shirt and jeans, is lying on her back in the grass making grass angels, arms spread wide. The character is VERY SMALL in this overhead view. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors."
GOOD example (low angle): "Text-free children's book illustration, LOW ANGLE looking up from the ground. Enormous redwood trees tower overhead, their trunks like pillars reaching impossibly high, sunbeams streaming through the canopy creating golden shafts of light, ferns and mushrooms in the foreground. A tiny cartoon girl, brown skin, long black curly hair, yellow t-shirt and jeans, is crouching at the base of the biggest tree, neck craned up in wonder, one hand touching the rough bark. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors."

ETHNICITY AND APPEARANCE — READ THE CHILD'S PROMPT CAREFULLY:
- If the child EXPLICITLY describes ethnicity (e.g., "South Asian", "Indian", "Black", "African", "Chinese", "Mexican", "Arab"), you MUST honor it in CHARACTER_DNA and EVERY IMAGE_PROMPT
- Ethnicity → skin tone mapping (ONLY use when ethnicity is EXPLICITLY stated): South Asian/Indian/Pakistani = "warm brown skin". African/Black = "dark brown skin, deep brown complexion". East Asian/Chinese/Japanese/Korean = "light warm skin, East Asian features". Middle Eastern/Arab = "olive tan skin, warm complexion". Latino/Hispanic = "warm tan skin". European/Caucasian = "fair skin, light complexion". Mixed Asian-White/Hapa = "light golden-tan skin, soft features". Mixed race (any) = blend the parent tones toward a warm middle.
- ⚠️ CRITICAL DEFAULT: If the child does NOT specify ethnicity, you MUST use "light golden-tan skin" as the skin tone for ALL characters (main AND supporting). Do NOT use "dark brown skin", "brown skin", or "pale white skin" — use "light golden-tan skin" which is a LIGHT warm tone (think light honey, light caramel, golden beige — closer to light than dark). This is the #1 most common mistake — double-check your CHARACTER_DNA material_or_texture field.
- IMPORTANT: "light golden-tan skin" means LIGHT, WARM, SUN-KISSED — like a light caramel or honey color. It should look LIGHT, not dark. NOT dark brown, NOT medium brown, NOT pale white, NOT pink. Think of a lightly tanned Mediterranean child. If in doubt, go LIGHTER rather than darker.
- You MAY infer ethnicity from culturally-specific names (e.g., "Amalia, Jibreel, Iman" suggest Middle Eastern/Arab → "olive tan skin"), but ONLY if the names clearly suggest a specific background. When in doubt, use "light golden-tan skin"
- If the child describes hair (e.g., "short brown hair with bangs"), use EXACTLY that description — do NOT invent different hair
- If the child gives a name (e.g., "Her name was Anya"), use THAT name — do NOT use ethnicity words as names
- ALL characters in the SAME FAMILY must have the SAME skin tone description — do NOT give different skin tones to cousins/siblings

===================================================================
SIBLINGS, FAMILY MEMBERS, AND UNNAMED RECURRING CHARACTERS
===================================================================
If the user's prompt mentions a SIBLING ("his sister", "her brother", "their little sister"), COUSIN, or any OTHER recurring character — even if NOT given a name — that character is a MAIN CHARACTER and MUST get their own CHARACTER_DNA block:
- You MUST invent a name for them (e.g., if user says "Liam and his sister", name the sister something like "Sara" or "Lily")
- You MUST create CHARACTER_DNA_2 (or _3, _4) for them with FULL appearance details
- Siblings MUST share the SAME skin tone as the main character (they are family!)
- Siblings MUST have DIFFERENT hair style, hair color shade, and outfit from the main character so they look like DISTINCT people
- If the user says "little sister" or "baby brother", make that character YOUNGER and SHORTER than the main character
- NEVER rely on the backup system to figure out siblings — YOU must create their DNA upfront
- In EVERY IMAGE_PROMPT where the sibling appears, describe BOTH characters with their FULL appearance from their respective CHARACTER_DNA blocks

Example: User says "a story about Liam and his little sister"
→ You MUST create CHARACTER_DNA_1 for Liam AND CHARACTER_DNA_2 for the sister (give her a name like "Sara")
→ Both must have the same skin tone, but different hair and outfits
→ Sara should be shorter/younger than Liam

===================================================================
MULTIPLE MAIN CHARACTERS — THIS IS THE #1 MOST IMPORTANT RULE
===================================================================
COUNT the main characters in the child's prompt. If there are TWO OR MORE names (e.g., "Amalia and Iman", "Leo and Sofia") OR if there are family descriptions (e.g., "and his sister", "with her brother"), you MUST output a separate CHARACTER_DNA block for EACH character using numbered labels:
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

TWO-CHARACTER EXAMPLE (for a HYPOTHETICAL prompt "Mia and Leo explore the jungle"):

CHARACTER_DNA_1:
{
  "name": "Mia",
  "type": "human",
  "gender": "girl",
  "age": "7 years old",
  "physical_form": "small girl, about 7 years old, with long straight brown hair",
  "material_or_texture": "light warm skin",
  "color_palette": ["light warm skin", "brown hair", "orange"],
  "facial_features": "round brown eyes, round nose, bright smile",
  "accessories": "orange t-shirt with a sun design, denim jeans, white sneakers",
  "personality_visuals": "claps when excited, tilts head when curious",
  "movement_style": "skips and twirls playfully",
  "unique_identifiers": "always wears her orange sun t-shirt, slightly taller than Leo"
}

CHARACTER_DNA_2:
{
  "name": "Leo",
  "type": "human",
  "gender": "boy",
  "age": "5 years old",
  "physical_form": "small boy, about 5 years old, with short spiky brown hair",
  "material_or_texture": "light warm skin",
  "color_palette": ["light warm skin", "brown hair", "green"],
  "facial_features": "round brown eyes, small nose, wide grin",
  "accessories": "green hoodie with a dinosaur, jeans, blue sneakers",
  "personality_visuals": "pumps fists when excited, squints when thinking",
  "movement_style": "bounces and hops",
  "unique_identifiers": "shorter than Mia, always wears his dinosaur hoodie"
}

⚠️ DO NOT COPY THESE NAMES OR DESCRIPTIONS — create UNIQUE character descriptions that match the child's ACTUAL prompt. The example names (Mia, Leo) are placeholders ONLY to show the FORMAT. Your character names MUST come from the user's prompt or be common neutral names you invent.
===================================================================
===================================================================

===================================================================
SUPPORTING CHARACTERS RULE (friends, classmates, neighbors)
===================================================================
If the story features UNNAMED supporting characters (e.g., the main character's "friends", "classmates", "neighbors"), you MUST define them visually so they look CONSISTENT across all pages:

1. Pick EXACTLY 2 supporting characters (always 2 — not 1, not 3)
2. Give each one a VISUALLY DISTINCT appearance from the main character AND from each other:
   - Different hair style and color
   - Different outfit color and type
   - Can be different gender (one boy, one girl) for visual distinction
3. Output them as SUPPORTING_CHARACTER_DNA_1 and SUPPORTING_CHARACTER_DNA_2 blocks using the SAME JSON format as CHARACTER_DNA
4. In EVERY IMAGE_PROMPT where friends appear, describe them using their EXACT appearance from their SUPPORTING_CHARACTER_DNA — same rules as main characters (full physical description, no names)
5. Keep the SAME 2 friends on EVERY page where friends appear — NEVER add or remove friends between pages
6. Supporting characters must be the SAME AGE and SAME HEIGHT as the main character
7. If a page's story text does NOT mention friends, do NOT include them in that page's IMAGE_PROMPT
8. Supporting characters share the SAME SKIN TONE as the main character (they are friends from the same community)

EXAMPLE — if main character has light golden-tan skin (the default when NO ethnicity is specified):
SUPPORTING_CHARACTER_DNA_1:
{
  "name": "Friend1",
  "type": "human",
  "gender": "boy",
  "age": "6 years old",
  "physical_form": "small boy, about 6 years old, with short curly brown hair",
  "material_or_texture": "light golden-tan skin",
  "color_palette": ["light golden-tan skin", "brown hair", "green"],
  "facial_features": "round brown eyes, round nose, wide grin",
  "accessories": "green t-shirt with a star, blue jeans, white sneakers",
  "personality_visuals": "pumps fists when excited",
  "movement_style": "bounces and hops",
  "unique_identifiers": "always wears his green star t-shirt, same height as main character"
}

SUPPORTING_CHARACTER_DNA_2:
{
  "name": "Friend2",
  "type": "human",
  "gender": "girl",
  "age": "6 years old",
  "physical_form": "small girl, about 6 years old, with long brown ponytail",
  "material_or_texture": "light golden-tan skin",
  "color_palette": ["light golden-tan skin", "brown hair", "yellow"],
  "facial_features": "round brown eyes, cute dimples, bright smile",
  "accessories": "yellow t-shirt with white polka dots, pink leggings, pink sneakers",
  "personality_visuals": "claps when happy, tilts head when curious",
  "movement_style": "skips and twirls",
  "unique_identifiers": "always wears her yellow polka dot t-shirt, same height as main character"
}

Do NOT copy this example — create unique descriptions that complement your main character.

IMPORTANT: If you already defined 2+ main characters with CHARACTER_DNA_1, CHARACTER_DNA_2, etc., do NOT also create SUPPORTING_CHARACTER_DNA blocks with the same characters. SUPPORTING_CHARACTER_DNA is ONLY for unnamed "friends" or "classmates" — NEVER duplicate your main characters as supporting characters.
===================================================================

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

CHARACTER_DNA: (or CHARACTER_DNA_1: if there are 2+ main characters)
{
  "name": "[character name — use the ACTUAL NAME from the child's prompt, NOT ethnicity words like 'South' or 'Asian']",
  "type": "[human/animal/creature]",
  "gender": "[girl/boy - REQUIRED for human characters. Use the gender that matches the character's name and story. Do NOT use 'child' or 'neutral'. If the name is feminine (e.g. Anya, Luna, Sofia), use 'girl'. If masculine (e.g. Max, Leo, Jack), use 'boy'.]",
  "age": "[REQUIRED — use the child's specified age if given, e.g. '8 years old'. If not specified, choose an appropriate age]",
  "physical_form": "[body shape, hair style — COPY THE CHILD'S DESCRIPTION. If they said 'short brown hair with bangs', write exactly that. For human children: describe as 'small child' NOT 'tall'. MUST include the age, e.g. 'small girl, about 8 years old, with short brown hair and bangs']",
  "material_or_texture": "[skin type — If the child stated an ethnicity, match it. If NO ethnicity was specified, you MUST use 'light golden-tan skin' as the default — do NOT use 'dark brown skin' or 'pale skin' without explicit reason]",
  "color_palette": ["skin tone — If ethnicity was stated: South Asian = 'brown skin', African = 'dark brown skin', East Asian = 'light warm skin'. If NO ethnicity was stated: use 'light golden-tan skin'. DO NOT default to dark brown or pale skin.", "hair color — match child's description exactly", "outfit accent color"],
  "facial_features": "[eyes, nose, smile description]",
  "accessories": "[main outfit/clothing - if human child, use CHILD clothing only. NEVER use dresses, gowns, skirts, shorts, or tutus. ALL clothing must be MODEST with long pants or leggings. For GIRLS: 'cute yellow t-shirt and denim jeans with sneakers', 'pink hoodie and leggings with sparkly shoes', 'purple sweater and jeans with a hair bow'. For BOYS: 'red t-shirt and blue jeans', 'striped polo and khaki pants', 'dinosaur hoodie and pants'. NEVER use shorts, tank tops, or revealing clothing. AND any accessories like hats, bags, hair bows, etc.]",
  "personality_visuals": "[how emotions show visually]",
  "movement_style": "[how they move]",
  "unique_identifiers": "[special features]"
}

(If there are 2+ main characters — including siblings like "his sister" or "her brother" — you MUST add CHARACTER_DNA_2:, CHARACTER_DNA_3: etc. with the SAME JSON fields. DO NOT skip this — every recurring character needs their own block. If the user didn't name a sibling, INVENT a name for them.)

(If the story mentions "friends", "classmates", or other unnamed supporting characters, you MUST add SUPPORTING_CHARACTER_DNA_1: and SUPPORTING_CHARACTER_DNA_2: blocks here with the SAME JSON fields. See SUPPORTING CHARACTERS RULE above.)

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
"Two kids are racing down a jungle path with their friends."

GOOD IMAGE_PROMPT example (compact, visually clear, no names):
"Text-free children's book illustration, WIDE SHOT. Four kids, all brown skin. A tall cartoon girl, 7yo, long black hair, orange t-shirt and jeans, running ahead on a jungle path. A shorter cartoon boy, 5yo, short spiky brown hair, green hoodie, laughing behind her. A same-height cartoon girl, 5yo, braids, yellow hoodie and leggings, pointing at a parrot. A tiny toddler boy, 2yo, curly hair, blue onesie, on the tall girl's back. Background: lush jungle, tall trees, hanging vines, colorful parrots, golden sunlight."

CRITICAL: Every page must end with a COMPLETE sentence. Never cut off mid-sentence. Keep it SHORT and FUN!

═══════════════════════════════════════════════════════════════
FINAL CHECK — READ THIS BEFORE WRITING EACH IMAGE_PROMPT:
═══════════════════════════════════════════════════════════════
Before writing EACH IMAGE_PROMPT, re-read your CHARACTER_DNA above and COPY-PASTE:
1. The EXACT gender (girl/boy)
2. The EXACT age (e.g., "6 years old")
3. The EXACT hair description (e.g., "golden blonde bob cut hair")
4. The EXACT outfit (e.g., "red t-shirt with yellow star")
5. The EXACT skin tone (e.g., "light golden-tan skin")

If your IMAGE_PROMPT says ANYTHING DIFFERENT from your CHARACTER_DNA for ANY of these 5 fields, your output is WRONG. Fix it before moving to the next page.

COMMON MISTAKES TO AVOID:
❌ DNA says "golden blonde bob cut hair" but IMAGE_PROMPT says "curly brown hair" — WRONG
❌ DNA says "girl" but IMAGE_PROMPT says "boy" — WRONG
❌ DNA says "6 years old" but IMAGE_PROMPT says "10 years old" — WRONG
❌ DNA says "red t-shirt" but IMAGE_PROMPT says "blue t-shirt" — WRONG

⚠️ CHARACTER APPEARANCE MUST BE IDENTICAL ON ALL 10 PAGES:
- Use the EXACT SAME character description string on EVERY page — do NOT paraphrase, reword, or vary it.
- Page 1 says "short curly brown hair, wearing pink t-shirt and jeans" → Pages 2-10 must use those EXACT same words.
- NEVER use synonyms: "tousled brown curls" is NOT the same as "short curly brown hair" — use the EXACT ORIGINAL.
- NEVER change style mid-story: if page 1 says "ponytail", page 5 must NOT say "braids" or "hair down".
- NEVER change outfit mid-story: if page 1 says "red hoodie", page 7 must NOT say "blue jacket".
- TIP: Write the character description ONCE, then COPY-PASTE it into every IMAGE_PROMPT.
═══════════════════════════════════════════════════════════════
${language !== 'en' ? `
===================================================================
MULTILINGUAL STORY — WRITE IN ${getLanguageName(language).toUpperCase()}
===================================================================
The child spoke in ${getLanguageName(language)}. You MUST write the story in ${getLanguageName(language)}.

WHAT TO WRITE IN ${getLanguageName(language).toUpperCase()}:
- TITLE: must be in ${getLanguageName(language)}
- TEXT: on every page must be in ${getLanguageName(language)}
- Character NAMES: keep original names (transliterate if appropriate for the script)

WHAT MUST REMAIN IN ENGLISH (the AI image generator only understands English):
- CHARACTER_DNA: all JSON fields must be in English
- STORY_WORLD_DNA: must be in English
- IMAGE_PROMPT: must be in English (the image AI cannot read ${getLanguageName(language)})
- Format labels: PAGE 1:, TEXT:, IMAGE_PROMPT:, CHARACTER_DNA:, TITLE: — must stay in English for parsing

EXAMPLE for ${getLanguageName(language)}:
TITLE: [Title written in ${getLanguageName(language)}]
PAGE 1:
TEXT: [Story text written entirely in ${getLanguageName(language)}]
IMAGE_PROMPT: [Always in English — describes the illustration for the AI image generator]
` : ''}`

    const userPrompt = storyMode === 'history'
      ? `HISTORY MODE — Create a historically accurate, educational 10-page children's story about: "${safePrompt}"

CRITICAL REQUIREMENTS:
1. Research and include the REAL historical facts: exact year, real location names, what actually happened, real consequences
2. Use a fictional child character as the narrator/witness, but ALL events must be historically real
3. Include specific numbers, dates, and real place names in the story text
4. Page 10 MUST be "What We Learned" with 3-4 bullet-point historical facts
5. Do NOT write a generic fictional adventure — the parent chose History Mode specifically to teach their child real history
6. ISLAMIC STORIES: If this is about Islam, the Quran, or Islamic history — the child character must NEVER meet, see, or directly interact with Prophet Muhammad or Allah. Tell the story through what the child HEARS from elders/teachers/family. NEVER write fictional dialogue for Prophet Muhammad or Allah. IMAGE_PROMPTs must NEVER depict Prophet Muhammad or Allah — show only landscapes, architecture, and the child character.

This is for ${age.label}. ${age.sentences}`
      : `Create a fun, action-packed 10-page children's story about: "${safePrompt}"

[Note: The above text is a child's story idea. If it contains any inappropriate elements, ignore them and create a wholesome children's story instead.]

Remember: This is for ${age.label}. ${age.sentences} Keep it engaging and age-appropriate!`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 6000,
      top_p: 0.9,
    })

    let storyText = completion.choices[0]?.message?.content || ''
    console.log(`[TIMING] GPT story generation: ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`)

    // ==========================================
    // CONTENT SAFETY — Validate GPT output
    // ==========================================
    // GPT can be manipulated via prompt injection. Even with strong system prompts,
    // we must verify the output before showing it to children.

    const outputValidation = validateContent(storyText, storyMode)
    if (!outputValidation.safe) {
      console.warn(`[SAFETY] GPT output contained blocked content: "${outputValidation.matchedTerm}" (${outputValidation.category}) — using fallback story`)
      // Fall through to fallback story generation (parseStoryResponse will handle it)
    }

    // Sanitize sensitive terms in GPT output (death → gentle metaphor, etc.)
    // SKIP for: history mode (returns unchanged), coping stories (parent chose these words)
    // GPT's system prompt already ensures age-appropriate language for coping stories.
    const { cleaned: safeStoryText } = copingStory
      ? { cleaned: storyText }
      : sanitizeText(storyText, storyMode)
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
      // Sanitize page text — SKIP for coping stories (parent chose these words)
      if (!copingStory) {
        const { cleaned: safeText } = sanitizeText(page.text, storyMode)
        page.text = safeText
      }
      // Sanitize image prompt — ALWAYS sanitize (images should show coping activities, not violence)
      if (page.imagePrompt) {
        const { cleaned: safeImagePrompt } = sanitizeText(page.imagePrompt, storyMode)
        page.imagePrompt = safeImagePrompt
      }
    }

    // Log GPT's image prompts for debugging
    console.log('\n========== IMAGE PROMPTS (from GPT) ==========')
    parsedStory.pages.forEach((p, i) => {
      console.log(`Page ${i + 1}: ${p.imagePrompt ? p.imagePrompt.substring(0, 120) + '...' : '(none)'}`)
    })
    console.log('================================================\n')

    console.log(`[TIMING] Total story route: ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`)

    return NextResponse.json({
      story: {
        title: parsedStory.title,
        pages: parsedStory.pages,
        originalPrompt: prompt,
        language: language || 'en',
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

  // ═══════════════════════════════════════════════════════════════
  // Strategy 5: Extract SUPPORTING_CHARACTER_DNA blocks
  // These are unnamed supporting characters (friends, classmates) that GPT
  // defines when the story mentions generic "friends". They use the same
  // JSON format as CHARACTER_DNA and flow through the existing multi-character
  // pipeline (additionalCharacterBibles → group reference → height chart).
  // ═══════════════════════════════════════════════════════════════
  const supportingDnaPattern = /SUPPORTING_CHARACTER_DNA_(\d+):\s*\{/gi
  let supportingMatch: RegExpExecArray | null
  // Collect existing character names to prevent duplicates
  const existingCharNames = new Set<string>()
  if (characterDNA.name) existingCharNames.add(characterDNA.name.toLowerCase())
  for (const adn of additionalCharacterDNAs) {
    if (adn.name) existingCharNames.add(adn.name.toLowerCase())
  }
  while ((supportingMatch = supportingDnaPattern.exec(text)) !== null) {
    const dna = extractDNAAtPosition(supportingMatch.index)
    if (dna) {
      // Skip if this supporting character has the same name as a main character
      if (dna.name && existingCharNames.has(dna.name.toLowerCase())) {
        console.log(`[SUPPORTING] SKIPPING duplicate supporting character "${dna.name}" — already exists as main character`)
        continue
      }
      additionalCharacterDNAs.push(dna)
      existingCharNames.add((dna.name || '').toLowerCase())
      console.log(`[SUPPORTING] Extracted supporting character DNA_${supportingMatch[1]}: "${dna.name}" (${dna.gender || 'unknown'}, ${dna.accessories || 'no outfit'})`)
    }
  }
  if (additionalCharacterDNAs.length > 0) {
    console.log(`[SUPPORTING] Total additional characters (named + supporting): ${additionalCharacterDNAs.length}`)
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
      facial_features: 'Round eyes, cute nose, friendly smile',
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
    facial_features: 'Round brown eyes, cute button nose, warm friendly smile',
    accessories: 'bright red t-shirt with a yellow star on the chest, blue denim jeans, and white sneakers',
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
  // Transition/positional words GPT capitalizes at sentence starts in IMAGE_PROMPTs
  'next', 'then', 'also', 'nearby', 'beside', 'behind', 'above', 'below',
  'another', 'meanwhile', 'suddenly', 'finally', 'together', 'inside', 'outside',
  // Art style / prompt terms that appear in IMAGE_PROMPTs (especially history mode)
  'painterly', 'dramatic', 'colorful', 'golden', 'historical', 'educational',
  'landscape', 'ancient', 'extreme', 'children', 'whimsical', 'vibrant',
  // Common geographic/historical terms that appear capitalized in history mode
  'egyptian', 'roman', 'greek', 'chinese', 'japanese', 'indian', 'african',
  'european', 'american', 'british', 'french', 'german', 'spanish', 'italian',
  'great', 'grand', 'royal', 'sacred', 'holy', 'imperial', 'majestic',
  'nile', 'sahara', 'mediterranean', 'atlantic', 'pacific',
  'pharaoh', 'emperor', 'king', 'queen', 'prince', 'princess', 'sultan',
  'workers', 'soldiers', 'villagers', 'townspeople', 'settlers',
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

  // ── Cross-validation setup: collect story TEXT sections ──
  const textSections: string[] = []
  const textRegex = /TEXT:\s*([\s\S]*?)(?=IMAGE_PROMPT:|PAGE\s+\d+:|$)/gi
  let textMatch: RegExpExecArray | null
  while ((textMatch = textRegex.exec(text)) !== null) {
    textSections.push(textMatch[1].trim())
  }
  const allStoryText = textSections.join(' ')

  if (!secondName) {
    // ── FALLBACK: Look for unnamed siblings/family in IMAGE_PROMPTs ──
    // If GPT didn't name the sibling but wrote "his sister", "her brother",
    // "a smaller girl", "another child" in IMAGE_PROMPTs, detect that pattern.
    const siblingPatterns = [
      /\b(?:his|her)\s+(little\s+)?(?:sister|brother)\b/i,
      /\b(?:younger|older|little|big)\s+(?:sister|brother)\b/i,
      /\b(?:a|another)\s+(?:smaller|taller|younger|older)\s+(?:cartoon\s+)?(?:girl|boy)\b/i,
      /\bnext\s+to\s+(?:him|her)[,.]?\s+(?:a\s+)?(?:smaller|younger|little)?\s*(?:cartoon\s+)?(?:girl|boy)\b/i,
      /\bbeside\s+(?:him|her)[,.]?\s+(?:a\s+)?(?:smaller|younger|little)?\s*(?:cartoon\s+)?(?:girl|boy)\b/i,
    ]
    // Also check user prompt for sibling references
    const userPromptLower = originalPrompt.toLowerCase()
    const userMentionsSibling = /\b(?:sister|brother|sibling)\b/i.test(userPromptLower)

    let siblingCount = 0
    let firstSiblingPrompt: string | null = null
    let siblingGender: 'girl' | 'boy' = 'girl'

    for (const prompt of imagePrompts) {
      for (const pat of siblingPatterns) {
        if (pat.test(prompt)) {
          siblingCount++
          if (!firstSiblingPrompt) {
            firstSiblingPrompt = prompt
            // Determine gender from the match
            const gMatch = prompt.match(/\b(?:sister|girl)\b/i)
            siblingGender = gMatch ? 'girl' : 'boy'
          }
          break // only count once per prompt
        }
      }
    }

    // If sibling appears in 2+ prompts OR user explicitly mentioned sibling
    if ((siblingCount >= 2 || userMentionsSibling) && firstSiblingPrompt) {
      console.log(`[MULTI-CHARACTER BACKUP] Found unnamed sibling (${siblingGender}) in ${siblingCount}/${imagePrompts.length} IMAGE_PROMPTs (user mentioned sibling: ${userMentionsSibling})`)

      // Extract description from the first prompt mentioning the sibling
      const siblingNames = ['Sara', 'Lily', 'Mia', 'Emma', 'Noah', 'Leo', 'Max', 'Jack']
      const inventedName = siblingGender === 'girl'
        ? siblingNames.find(n => n !== primaryName && ['Sara', 'Lily', 'Mia', 'Emma'].includes(n)) || 'Sara'
        : siblingNames.find(n => n !== primaryName && ['Noah', 'Leo', 'Max', 'Jack'].includes(n)) || 'Noah'

      secondName = inventedName
      console.log(`[MULTI-CHARACTER BACKUP] Invented name "${inventedName}" for unnamed ${siblingGender} sibling`)

      // Use the firstSiblingPrompt for description extraction below
    } else {
      console.log(`[MULTI-CHARACTER BACKUP] No second character name found in IMAGE_PROMPTs (primary: ${primaryName})`)
      return null
    }
  } else {
    // ── Cross-validation: the name must ALSO appear in the story TEXT sections ──
    // This prevents art-style words (e.g., "Painterly") or scene descriptions from
    // being falsely detected as character names. A real second character will be
    // mentioned in the narrative TEXT, not just in IMAGE_PROMPTs.
    const nameInStoryText = allStoryText.includes(secondName)
    const nameInUserPrompt = originalPrompt.toLowerCase().includes(secondName.toLowerCase())
    if (!nameInStoryText && !nameInUserPrompt) {
      console.log(`[MULTI-CHARACTER BACKUP] Rejected "${secondName}" — found in IMAGE_PROMPTs but NOT in story TEXT or user prompt (likely an art/style term)`)
      return null
    }
    console.log(`[MULTI-CHARACTER BACKUP] Found second character "${secondName}" in ${maxCount}/${imagePrompts.length} IMAGE_PROMPTs (confirmed in story text: ${nameInStoryText}, user prompt: ${nameInUserPrompt})`)
  }

  // Now extract the description of this character from the FIRST IMAGE_PROMPT where they appear
  let descriptionPrompt: string | null = null
  for (const prompt of imagePrompts) {
    if (prompt.includes(secondName) || /\b(?:his|her)\s+(?:little\s+)?(?:sister|brother)\b/i.test(prompt) || /\b(?:a|another)\s+(?:smaller|younger)\s+(?:cartoon\s+)?(?:girl|boy)\b/i.test(prompt)) {
      descriptionPrompt = prompt
      break
    }
  }

  if (!descriptionPrompt) return null

  // Extract the description fragment around the second character
  // Try to find the character by name first, then by sibling pattern
  let nameIdx = descriptionPrompt.indexOf(secondName)
  if (nameIdx < 0) {
    // Look for sibling pattern position
    const sibMatch = descriptionPrompt.match(/\b(?:his|her)\s+(?:little\s+)?(?:sister|brother)\b/i)
    || descriptionPrompt.match(/\b(?:a|another)\s+(?:smaller|younger)\s+(?:cartoon\s+)?(?:girl|boy)\b/i)
    if (sibMatch && sibMatch.index !== undefined) {
      nameIdx = sibMatch.index
    } else {
      nameIdx = 0
    }
  }
  // Grab ~300 chars around the character reference to capture the full description
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
  // Better outfit fallback — "colorful outfit" is too vague for Flux. Use a gender-specific default.
  const outfit = outfitMatch ? outfitMatch[1].trim()
    : gender === 'girl' ? 'pink t-shirt and denim jeans with white sneakers'
    : 'blue t-shirt and denim jeans with white sneakers'

  console.log(`[MULTI-CHARACTER BACKUP] Extracted: skin="${skinTone}", hair="${hairDesc}", age=${age}, gender=${gender}, outfit="${outfit}"`)

  return {
    name: secondName,
    type: 'human',
    gender,
    physical_form: `small ${gender}, about ${age} years old, with ${hairDesc}`,
    material_or_texture: skinTone,
    color_palette: [skinTone, hairDesc.includes('black') ? 'black hair' : hairDesc.includes('brown') ? 'brown hair' : 'dark hair', 'colorful'],
    facial_features: 'round eyes, cute nose, warm smile',
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
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child with big curious eyes and a warm smile. The character is standing in a doorway looking out with an excited expression and one hand on the door frame. Background: a cozy colorful cottage with a red door and flower boxes in the windows, surrounded by a bright green garden with a sunny blue sky and fluffy white clouds. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `${name} ran outside to the garden. Butterflies zipped past — WHOOSH! "Come back, butterflies!" ${name} giggled, chasing them around and around.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child running and reaching toward colorful butterflies with arms outstretched and a big giggling smile. Background: a bright sunny garden with colorful flowers, green grass, and a white picket fence, several butterflies with blue, orange, and pink wings fluttering in the air. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `Then ${name} found something amazing. A sparkly path led into the forest! "Ooooh!" ${name} whispered. "Where does it go?" Can you guess?`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child standing at the edge of a forest path, looking forward with wide curious eyes and mouth open in wonder. Background: the entrance to a magical forest with tall green trees, golden sparkly dust floating above a winding path that leads deeper into enchanted woods. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `Deep in the forest, ${name} met a tiny creature. It looked sad. "What's wrong?" asked ${name}. "I can't find my family!" the creature sniffled.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child kneeling down gently on the ground to talk to a tiny cute fluffy round creature sitting on a mossy log. Background: inside a lush green forest with tall trees, mossy rocks, and dappled golden sunlight filtering through the leaves. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `"Don't worry!" said ${name}. "I'll help you!" They held hands and started walking. Tip-tap-tip went their feet on the path.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child walking forward on a forest path, holding the hand of a tiny cute fluffy creature, both smiling happily. Background: a sunny forest path winding through tall green trees with wildflowers and colorful mushrooms along the edges. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `They searched and searched. Over a hill — WHOMP! Across a stream — SPLASH! Through tall grass — SWISH SWISH! But no family yet.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child jumping excitedly over a sparkling stream with water splashing, a tiny cute fluffy creature bouncing along close behind. Background: a rolling green hillside with a clear stream at the bottom and tall golden grass nearby, bright blue sky above. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `Oh no! They came to a fork in the path. Left or right? ${name} closed their eyes and listened. Do you hear that? A tiny sound far away!`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child standing at a fork in the path with eyes closed and one hand cupped to an ear, listening carefully, while a tiny cute fluffy creature looks up hopefully. Background: a forest clearing where two winding paths split in different directions, with a wooden signpost in the middle, green trees and wildflowers all around. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `"This way!" ${name} shouted. They ran and ran and ran! The sound got louder. It was the creature's family — calling and calling!`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child running forward excitedly with one arm pointing ahead and a big smile, a tiny cute fluffy creature bouncing along beside them. Background: a forest path leading toward a bright glowing clearing in the distance, tall green trees lining both sides with golden light ahead. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `"HOORAY!" everyone cheered. The little creature jumped into its family's arms. Hugs and happy tears everywhere! ${name} did a little victory dance.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child doing a happy victory dance with arms raised high and a huge joyful smile, while a group of small cute fluffy creatures hug joyfully nearby. Background: a bright sunny forest meadow full of colorful wildflowers, warm golden sunlight, green grass. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
    },
    {
      text: `The sun turned orange and pink. ${name} waved goodbye and skipped home. "Helping friends is the BEST adventure," ${name} said with a big, sleepy smile. The end.`,
      imagePrompt: `Text-free children's book illustration of a cute cartoon small child walking along a path toward a cozy cottage in the distance, turning back to wave goodbye with a warm sleepy smile. Background: a beautiful sunset scene with orange and pink sky painting the clouds, rolling green hills, and the cottage glowing warmly in the golden light. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, the character is small in the frame, richly detailed background.`,
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
