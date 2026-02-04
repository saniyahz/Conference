import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * ENHANCED PROMPT RENDERER FOR STORYBOOK IMAGES
 *
 * Key improvements:
 * 1. Scene-specific prompts that capture the story moment
 * 2. Better SDXL optimization with composition and lighting
 * 3. Character-first approach (species in first 20 tokens)
 * 4. Emotional context from page text
 * 5. Dynamic scene composition based on action
 */

export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  const text = pageText || '';
  const lowerText = text.toLowerCase();

  // 1. CHARACTER DESCRIPTION (FIRST - most important for SDXL)
  const characterDesc = buildCharacterDescription(bible);

  // 2. SCENE & ACTION - Extract what's happening in this specific page
  const sceneAction = extractSceneAndAction(lowerText, card, bible.name);

  // 3. ENVIRONMENT & SETTING - Detailed background
  const environment = buildEnvironment(lowerText, card.setting);

  // 4. MOOD & ATMOSPHERE - Emotional context
  const mood = extractMood(lowerText);

  // 5. SUPPORTING ELEMENTS - Other characters, objects
  const supporting = extractSupportingElements(lowerText, bible.name);

  // 6. VISUAL STYLE - Consistent across all pages
  const style = "Pixar Disney 3D animation style, soft volumetric lighting, vibrant saturated colors, children's picture book illustration, highly detailed, 8k quality";

  // BUILD THE FINAL PROMPT
  // Structure: [Character] [Action] [Environment] [Supporting] [Mood] [Style]
  const prompt = `${characterDesc}, ${sceneAction}, ${environment}. ${supporting}${mood} ${style}`;

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt.substring(0, 200)}...`);
  return prompt;
}

/**
 * Build character description - SPECIES FIRST for SDXL token attention
 */
function buildCharacterDescription(bible: CharacterBible): string {
  const species = bible.species || 'animal';
  const name = bible.name;
  const furColor = bible.appearance?.skin_tone || 'soft';
  const eyes = bible.appearance?.eyes || 'big expressive eyes';

  if (bible.character_type === 'animal' && species !== 'animal') {
    // Animal character - species first, then details
    return `A cute cartoon ${species} character with ${furColor}, ${eyes}, ${name} the adorable ${species}`;
  } else if (bible.character_type === 'human') {
    // Human child character
    const hair = bible.appearance?.hair || 'soft hair';
    return `A cute cartoon child with ${furColor} skin and ${hair}, ${eyes}, ${name}`;
  } else {
    // Generic/creature
    return `A cute cartoon ${species} character named ${name} with ${eyes}`;
  }
}

/**
 * Extract scene and action - What is happening in this specific page
 */
function extractSceneAndAction(text: string, card: PageSceneCard, charName: string): string {
  // SPACE/ROCKET scenes - very specific for SDXL
  if (text.includes('blasted off') || text.includes('blast off') || text.includes('launched')) {
    return `sitting excitedly in rocket ship cockpit, pressing colorful glowing buttons, looking out big window at stars, thrilled expression`;
  }

  if (text.includes('soared over') || text.includes('flew over') || text.includes('flying over')) {
    if (text.includes('crater') || text.includes('moon')) {
      return `looking out rocket ship window in wonder, grey moon craters visible below, stars twinkling outside, amazed joyful expression`;
    }
    return `looking out rocket ship window at the view below, excited curious expression, hands on window`;
  }

  if (text.includes('landed safely') || text.includes('safe landing') || text.includes('touched down')) {
    return `celebrating with arms raised in joy, standing next to landed rocket ship, triumphant happy expression`;
  }

  if (text.includes('climbed inside') || text.includes('got inside') || text.includes('stepped into')) {
    return `climbing into colorful rocket ship with eager expression, one foot on ladder, looking back with excitement`;
  }

  if (text.includes('exploring') && (text.includes('moon') || text.includes('crater'))) {
    return `walking on bumpy moon surface with curious expression, looking at craters, space helmet on, discovering`;
  }

  if (text.includes('walked on the moon') || text.includes('stepped on the moon') || text.includes('bouncing')) {
    return `bouncing happily on moon surface, low gravity floating slightly, delighted expression, arms out for balance`;
  }

  if (text.includes('looking at') && (text.includes('earth') || text.includes('stars') || text.includes('planet'))) {
    return `gazing up in wonder at the starry sky, awe-struck expression, pointing at something amazing`;
  }

  // EMOTION-based actions
  if (text.includes('said goodbye') || text.includes('waved goodbye') || text.includes('waving')) {
    return `waving goodbye with happy but slightly sad expression, warm smile, hand raised`;
  }

  if (text.includes('hugged') || text.includes('hugging') || text.includes('embrace')) {
    return `hugging warmly with closed eyes and big smile, heartwarming moment, showing affection`;
  }

  if (text.includes('cheered') || text.includes('celebrated') || text.includes('hooray')) {
    return `cheering with both arms up, huge joyful smile, jumping slightly, celebrating`;
  }

  if (text.includes('laughed') || text.includes('giggled') || text.includes('laughing')) {
    return `laughing joyfully with eyes crinkled, head tilted back slightly, pure happiness`;
  }

  if (text.includes('smiled') || text.includes('happy')) {
    return `smiling warmly with sparkling eyes, content happy expression`;
  }

  if (text.includes('scared') || text.includes('frightened') || text.includes('afraid')) {
    return `looking slightly nervous but brave, wide eyes, determined expression despite fear`;
  }

  if (text.includes('surprised') || text.includes('amazed') || text.includes('gasped')) {
    return `looking surprised with wide eyes and open mouth, hands on cheeks, delighted amazement`;
  }

  if (text.includes('thinking') || text.includes('wondered') || text.includes('curious')) {
    return `looking thoughtful with finger on chin, curious tilted head, wondering expression`;
  }

  if (text.includes('sleeping') || text.includes('dreaming') || text.includes('asleep')) {
    return `sleeping peacefully with gentle smile, eyes closed, cozy and content`;
  }

  // MOVEMENT-based actions
  if (text.includes('running') || text.includes('ran')) {
    return `running with joyful energy, legs in motion, happy determined expression`;
  }

  if (text.includes('flying') || text.includes('soaring')) {
    return `flying through the air with arms spread wide, wind in fur/hair, exhilarated expression`;
  }

  if (text.includes('swimming') || text.includes('dove into') || text.includes('underwater')) {
    return `swimming gracefully underwater, bubbles around, eyes open and curious`;
  }

  if (text.includes('climbing') || text.includes('climbed')) {
    return `climbing with determination, focused expression, reaching upward`;
  }

  if (text.includes('jumping') || text.includes('leaped') || text.includes('bounced')) {
    return `jumping high with joy, legs tucked, thrilled expression`;
  }

  if (text.includes('dancing') || text.includes('danced')) {
    return `dancing happily with graceful movement, joyful expression, one leg lifted`;
  }

  if (text.includes('playing') || text.includes('played')) {
    return `playing happily with cheerful expression, active and engaged`;
  }

  // DISCOVERY/ADVENTURE actions
  if (text.includes('discovered') || text.includes('found') || text.includes('saw')) {
    return `discovering something amazing with wide excited eyes, pointing, joyful surprise`;
  }

  if (text.includes('exploring') || text.includes('adventure')) {
    return `exploring with curious expression, looking around in wonder, eager to discover`;
  }

  if (text.includes('searching') || text.includes('looking for')) {
    return `searching carefully with focused expression, peering around, determined`;
  }

  // INTERACTION actions
  if (text.includes('helped') || text.includes('helping')) {
    return `helping kindly with warm caring expression, reaching out`;
  }

  if (text.includes('shared') || text.includes('gave')) {
    return `sharing generously with happy kind expression, offering something`;
  }

  if (text.includes('met') || text.includes('meeting') || text.includes('new friend')) {
    return `meeting a new friend with curious friendly expression, waving hello`;
  }

  // BEGINNING/ENDING scenes
  if (text.includes('once upon') || text.includes('lived in') || text.includes('there was')) {
    return `standing proudly in their home environment, friendly welcoming expression, introducing themselves`;
  }

  if (text.includes('the end') || text.includes('happily ever') || text.includes('and so')) {
    return `looking content and happy, warm satisfied smile, peaceful ending moment`;
  }

  // Default based on card action if available
  if (card.main_action && card.main_action.length > 5) {
    return `${card.main_action.replace(charName, '').trim()}, engaged and expressive`;
  }

  // Ultimate fallback
  return `in an engaging pose with expressive face, looking at viewer with friendly expression`;
}

/**
 * Build environment description based on text and setting
 */
function buildEnvironment(text: string, fallbackSetting: string): string {
  // SPACE ENVIRONMENTS
  if (text.includes('crater') || text.includes('lunar')) {
    if (text.includes('soared') || text.includes('flew') || text.includes('flying')) {
      return `inside colorful cartoon rocket ship with large round windows, grey moon craters visible outside, black space with twinkling stars and distant blue Earth`;
    }
    if (text.includes('landed') || text.includes('standing')) {
      return `on grey bumpy moon surface with large craters, colorful rocket ship landed nearby, black starry sky with bright stars and Earth in distance`;
    }
    return `grey moon surface with rocky craters, dark space sky filled with stars, Earth visible as blue marble`;
  }

  if (text.includes('blasted off') || text.includes('launched') || text.includes('take off')) {
    return `inside bright colorful rocket ship cockpit, large windows showing stars and planets, glowing control panel with buttons and lights, cozy pilot seat`;
  }

  if (text.includes('outer space') || text.includes('through space') || text.includes('in space') || text.includes('galaxy')) {
    return `colorful outer space background with swirling purple and blue nebulas, twinkling stars, colorful planets, magical cosmic atmosphere`;
  }

  if (text.includes('rocket') || text.includes('spaceship')) {
    if (text.includes('inside') || text.includes('cockpit') || text.includes('window')) {
      return `inside cozy cartoon rocket ship, big round windows showing space outside, colorful control panels with glowing buttons`;
    }
    return `next to a colorful friendly-looking cartoon rocket ship, ready for adventure`;
  }

  // NATURE ENVIRONMENTS
  if (text.includes('forest') || text.includes('woods') || text.includes('trees')) {
    if (text.includes('magical') || text.includes('enchanted')) {
      return `magical enchanted forest with glowing mushrooms, sparkling fireflies, tall friendly trees with dappled golden sunlight`;
    }
    return `beautiful green forest with tall trees, soft sunlight filtering through leaves, peaceful woodland atmosphere`;
  }

  if (text.includes('meadow') || text.includes('field') || text.includes('flowers')) {
    return `colorful meadow filled with wildflowers, butterflies floating around, soft rolling hills, blue sky with fluffy white clouds`;
  }

  if (text.includes('garden')) {
    return `beautiful garden with colorful flowers in bloom, stone path, butterflies and bees, warm sunny day`;
  }

  if (text.includes('mountain') || text.includes('hill') || text.includes('cliff')) {
    return `scenic mountain landscape with green slopes, distant peaks, blue sky, majestic and peaceful`;
  }

  if (text.includes('waterfall')) {
    return `magical waterfall cascading into crystal clear pool, lush green plants, rainbow in the mist, sparkling water`;
  }

  if (text.includes('river') || text.includes('stream') || text.includes('creek')) {
    return `peaceful stream with smooth rocks, clear water, green plants along banks, gentle flowing water`;
  }

  // WATER ENVIRONMENTS
  if (text.includes('underwater') || text.includes('ocean floor') || text.includes('beneath the waves')) {
    return `magical underwater scene with colorful coral reef, tropical fish swimming by, bubbles rising, soft blue light`;
  }

  if (text.includes('ocean') || text.includes('sea')) {
    if (text.includes('beach') || text.includes('shore')) {
      return `sunny beach with golden sand, gentle waves, blue ocean, seashells scattered around`;
    }
    return `beautiful blue ocean with gentle waves, clear sky, peaceful water`;
  }

  if (text.includes('beach') || text.includes('shore') || text.includes('sand')) {
    return `sunny beach with soft golden sand, gentle turquoise waves, clear blue sky, tropical paradise`;
  }

  if (text.includes('lake') || text.includes('pond')) {
    return `peaceful lake with still reflective water, trees along shore, lily pads floating, serene atmosphere`;
  }

  // SKY ENVIRONMENTS
  if (text.includes('sky') || text.includes('clouds') || text.includes('flying')) {
    if (text.includes('night') || text.includes('stars')) {
      return `night sky filled with twinkling stars, crescent moon glowing, peaceful nighttime atmosphere`;
    }
    return `bright blue sky with fluffy white clouds, warm sunlight, birds flying in distance`;
  }

  if (text.includes('rainbow')) {
    return `bright sky with beautiful colorful rainbow arching across, fluffy clouds, magical atmosphere`;
  }

  // INDOOR ENVIRONMENTS
  if (text.includes('home') || text.includes('house') || text.includes('room')) {
    if (text.includes('bedroom')) {
      return `cozy bedroom with soft bed, toys around, warm lamp light, safe comfortable feeling`;
    }
    if (text.includes('kitchen')) {
      return `warm kitchen with counters and colorful items, homey atmosphere, delicious smells`;
    }
    return `cozy home interior with warm lighting, comfortable furniture, safe welcoming atmosphere`;
  }

  if (text.includes('castle') || text.includes('palace')) {
    return `magical castle interior with tall windows, colorful banners, golden light, grand but friendly`;
  }

  if (text.includes('school') || text.includes('classroom')) {
    return `colorful classroom with desks and books, educational posters, friendly learning environment`;
  }

  // WEATHER/TIME variations
  if (text.includes('night') || text.includes('nighttime') || text.includes('dark sky')) {
    return `${fallbackSetting} at night, starry sky, soft moonlight, peaceful nocturnal atmosphere`;
  }

  if (text.includes('sunset') || text.includes('evening')) {
    return `${fallbackSetting} at golden sunset, orange and pink sky, warm glowing light`;
  }

  if (text.includes('sunrise') || text.includes('morning') || text.includes('dawn')) {
    return `${fallbackSetting} at sunrise, soft pink and orange sky, fresh morning light`;
  }

  if (text.includes('rain') || text.includes('rainy')) {
    return `${fallbackSetting} with gentle rain falling, puddles reflecting, cozy rainy day`;
  }

  if (text.includes('snow') || text.includes('winter') || text.includes('snowy')) {
    return `${fallbackSetting} covered in soft white snow, snowflakes falling, magical winter wonderland`;
  }

  // SPECIAL LOCATIONS
  if (text.includes('cave') || text.includes('cavern')) {
    return `magical cave with glowing crystals on walls, soft mysterious light, rocky formations`;
  }

  if (text.includes('island')) {
    return `tropical island with palm trees, sandy beach, blue water surrounding, paradise setting`;
  }

  if (text.includes('desert') || text.includes('sand dune')) {
    return `golden desert with rolling sand dunes, clear blue sky, warm sunlight`;
  }

  if (text.includes('jungle') || text.includes('tropical')) {
    return `lush tropical jungle with vines and big leaves, colorful exotic flowers, dappled sunlight`;
  }

  // Use fallback setting with enhancement
  if (fallbackSetting && fallbackSetting !== 'Storybook scene') {
    return `${fallbackSetting}, warm inviting atmosphere, beautiful background`;
  }

  return `magical storybook setting with warm colors, friendly atmosphere, soft lighting`;
}

/**
 * Extract mood and atmosphere from page text
 */
function extractMood(text: string): string {
  // Exciting/Adventure
  if (text.includes('adventure') || text.includes('excited') || text.includes('thrilling')) {
    return `Exciting adventurous atmosphere, dynamic energy.`;
  }

  // Happy/Joyful
  if (text.includes('happy') || text.includes('joy') || text.includes('delighted') || text.includes('wonderful')) {
    return `Warm joyful atmosphere, happiness radiating.`;
  }

  // Peaceful/Calm
  if (text.includes('peaceful') || text.includes('calm') || text.includes('quiet') || text.includes('gentle')) {
    return `Peaceful serene atmosphere, soft calming energy.`;
  }

  // Magical/Wonder
  if (text.includes('magical') || text.includes('wonder') || text.includes('amazing') || text.includes('incredible')) {
    return `Magical wondrous atmosphere, sparkles of enchantment.`;
  }

  // Brave/Determined
  if (text.includes('brave') || text.includes('courage') || text.includes('determined')) {
    return `Brave determined atmosphere, inspiring energy.`;
  }

  // Warm/Cozy
  if (text.includes('cozy') || text.includes('warm') || text.includes('comfortable') || text.includes('safe')) {
    return `Cozy warm atmosphere, comforting feeling.`;
  }

  // Curious/Discovering
  if (text.includes('curious') || text.includes('discover') || text.includes('explore') || text.includes('found')) {
    return `Curious explorative atmosphere, sense of discovery.`;
  }

  // Friendship/Love
  if (text.includes('friend') || text.includes('together') || text.includes('love') || text.includes('care')) {
    return `Warm friendship atmosphere, loving energy.`;
  }

  // Triumphant/Success
  if (text.includes('success') || text.includes('did it') || text.includes('triumph') || text.includes('won')) {
    return `Triumphant celebratory atmosphere, victorious energy.`;
  }

  // Default warm children's book mood
  return `Warm friendly atmosphere, inviting and safe.`;
}

/**
 * Extract supporting elements - other characters, friends, objects
 */
function extractSupportingElements(text: string, mainCharName: string): string {
  const elements: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Named character patterns "Name the Animal" or "Name and Name"
  const namedPattern = /\b([A-Z][a-z]+)\s+the\s+(dog|cat|rabbit|bunny|bear|fox|owl|bird|mouse|squirrel|deer|porcupine|hedgehog|raccoon|beaver|frog|turtle|fish|penguin|lion|tiger|elephant|monkey|giraffe|zebra|hippo|koala|kangaroo|dolphin|whale|seal|otter|wolf|pig|cow|horse|sheep|goat|duck|chicken|butterfly|bee|dragon|unicorn)\b/gi;

  let match;
  while ((match = namedPattern.exec(text)) !== null) {
    const name = match[1];
    const animal = match[2].toLowerCase();
    if (name.toLowerCase() !== mainLower) {
      elements.push(`cute cartoon ${animal} friend ${name}`);
    }
  }

  // "Name and Name" pattern for friends
  const friendPattern = /\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\b/g;
  while ((match = friendPattern.exec(text)) !== null) {
    const name1 = match[1];
    const name2 = match[2];
    const skipWords = ['The', 'And', 'But', 'His', 'Her', 'They', 'With', 'Once', 'Then', 'Soon'];
    if (!skipWords.includes(name1) && name1.toLowerCase() !== mainLower) {
      if (!elements.some(e => e.includes(name1))) {
        elements.push(`friend ${name1}`);
      }
    }
    if (!skipWords.includes(name2) && name2.toLowerCase() !== mainLower) {
      if (!elements.some(e => e.includes(name2))) {
        elements.push(`friend ${name2}`);
      }
    }
  }

  // Generic friends/family
  if (text.includes('friends') && elements.length === 0) {
    elements.push('friendly animal companions');
  }
  if (text.includes('family') || text.includes('parents') || text.includes('mother') || text.includes('father')) {
    elements.push('loving family members nearby');
  }

  // Limit to 2 supporting elements
  if (elements.length === 0) return '';
  return `With ${elements.slice(0, 2).join(' and ')}. `;
}

/**
 * Negative prompt - excludes unwanted elements
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean): string {
  // Base negative prompt for SDXL quality
  let negative = "text, watermark, logo, signature, words, letters, photorealistic, realistic, photograph, photo, ugly, deformed, disfigured, bad anatomy, bad proportions, extra limbs, mutated, blurry, low quality, artifacts, grainy";

  // Exclude humans for animal-only stories
  if (isAnimal) {
    negative += ", human, person, boy, girl, child, man, woman, people, humanoid";
  }

  // Environment-specific exclusions
  const setting = card.setting.toLowerCase();

  if (setting.includes('space') || setting.includes('moon') || setting.includes('rocket') || setting.includes('star') || setting.includes('planet')) {
    negative += ", forest, trees, grass, green plants, water, ocean, fish, underwater";
  }

  if (setting.includes('underwater') || setting.includes('ocean') || setting.includes('coral')) {
    negative += ", forest, trees, sky, clouds, space, stars, land animals";
  }

  if (setting.includes('forest') || setting.includes('meadow') || setting.includes('garden')) {
    negative += ", space, rockets, planets, underwater, fish, urban, buildings";
  }

  if (setting.includes('indoor') || setting.includes('room') || setting.includes('home') || setting.includes('house')) {
    negative += ", outdoor, space, underwater, forest, nature";
  }

  // Add forbidden elements from card
  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    negative += `, ${card.forbidden_elements.slice(0, 5).join(', ')}`;
  }

  return negative;
}

/**
 * Generate consistent seed per page
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
