import { CharacterBible, PageSceneCard, HumanAppearance, AnimalAppearance, getSpeciesNegatives } from "./visual-types";

/**
 * UNIVERSAL PROMPT TEMPLATE
 * CHARACTER-FIRST approach - species must be the FIRST words in prompt
 * SDXL only pays attention to first ~77 tokens
 */
export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  const text = pageText || '';
  const lowerText = text.toLowerCase();

  // 1. CHARACTER SPECIES FIRST - This is the most important part!
  const species = bible.species || 'animal';
  const charName = bible.name;

  // 2. SCENE - Extract from page text
  const scene = extractSceneFromText(lowerText, card.setting);

  // 3. SUPPORTING CHARACTERS - only named ones from text
  const supporting = extractNamedCharactersFromText(lowerText, charName);

  // 4. ACTION - What is the character doing?
  const action = extractActionFromText(lowerText, charName);

  // BUILD PROMPT - CHARACTER FIRST, with appearance, then scene + action
  let prompt: string;

  if (bible.character_type === 'animal' && species !== 'animal' && !bible.is_human) {
    // ANIMAL CHARACTER - Use AnimalAppearance fields (NO human attributes!)
    // CRITICAL: Repeat species 3+ times in prompt for SDXL to lock onto it
    const animalAppearance = bible.appearance as AnimalAppearance;
    const bodyDesc = buildAnimalDescription(animalAppearance, species);

    // SDXL needs HEAVY species repetition to maintain character
    prompt = `${species} ${species} ${species}, A cute cartoon ${species} character, ${bodyDesc}, ${charName} the ${species}, the same ${species} as before, ${action}, ${scene}. ${supporting}cute 2D cartoon children's illustration, bold clean outlines, simplified shapes, big expressive eyes, flat cel shading, vibrant pastel colors, ${species} character, no text.`;
  } else {
    // HUMAN CHARACTER - Use HumanAppearance fields
    const humanAppearance = bible.appearance as HumanAppearance;
    const humanDesc = buildHumanDescription(humanAppearance);
    prompt = `A cute cartoon child, ${humanDesc}, ${charName}, ${action}, ${scene}. ${supporting}cute 2D cartoon children's illustration, bold clean outlines, simplified shapes, big expressive eyes, flat cel shading, vibrant pastel colors, no text.`;
  }

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt}`);
  return prompt;
}

/**
 * Build animal description from AnimalAppearance - NO HUMAN ATTRIBUTES
 */
function buildAnimalDescription(appearance: AnimalAppearance, species: string): string {
  const parts: string[] = [];

  // Body color and texture FIRST (most important for species consistency)
  if (appearance.body_color) {
    parts.push(`${appearance.body_color} colored`);
  }
  if (appearance.skin_texture) {
    parts.push(appearance.skin_texture);
  }

  // Eyes
  if (appearance.eyes) {
    parts.push(appearance.eyes);
  }

  // Species-specific features
  if (appearance.horn) {
    parts.push(appearance.horn);
  }
  if (appearance.ears) {
    parts.push(appearance.ears);
  }
  if (appearance.body_shape) {
    parts.push(appearance.body_shape);
  }
  if (appearance.markings) {
    parts.push(appearance.markings);
  }
  if (appearance.tail) {
    parts.push(appearance.tail);
  }

  return parts.join(', ') || `cute cartoon ${species}`;
}

/**
 * Build human description from HumanAppearance
 */
function buildHumanDescription(appearance: HumanAppearance): string {
  const parts: string[] = [];

  if (appearance.skin_tone) {
    parts.push(appearance.skin_tone);
  }
  if (appearance.hair) {
    parts.push(appearance.hair);
  }
  if (appearance.eyes) {
    parts.push(appearance.eyes);
  }
  if (appearance.face_features) {
    parts.push(appearance.face_features);
  }

  return parts.join(', ') || 'friendly face and big expressive eyes';
}

/**
 * Extract action from page text - what is the character doing?
 */
function extractActionFromText(text: string, charName: string): string {
  // Priority actions with specific descriptions
  if (text.includes('blasted off') || text.includes('blast off')) {
    return 'inside rocket ship cockpit pressing buttons';
  }
  if (text.includes('soared over') || text.includes('flew over') || text.includes('flying over')) {
    return 'looking out rocket window at the view below';
  }
  if (text.includes('landed safely') || text.includes('landing')) {
    return 'celebrating with happy expression';
  }
  if (text.includes('climbed inside') || text.includes('got inside')) {
    return 'climbing into rocket ship';
  }
  if (text.includes('exploring')) return 'exploring with curious expression';
  if (text.includes('running')) return 'running with joyful expression';
  if (text.includes('swimming')) return 'swimming happily';
  if (text.includes('flying')) return 'flying through the air';
  if (text.includes('playing')) return 'playing happily';
  if (text.includes('sleeping')) return 'sleeping peacefully';
  if (text.includes('smiling') || text.includes('smiled')) return 'smiling warmly';
  if (text.includes('laughing') || text.includes('laughed')) return 'laughing joyfully';

  return 'with happy curious expression';
}

/**
 * Extract scene/setting directly from page text
 * Looks for location keywords and builds appropriate scene description
 */
function extractSceneFromText(text: string, fallbackSetting: string): string {
  // SPACE / CELESTIAL - Check most specific patterns first

  // CRATER scenes (moon adventures) - VERY SPECIFIC for SDXL
  if (text.includes('crater') || text.includes('lunar crater')) {
    if (text.includes('soared over') || text.includes('fly across') || text.includes('flew over') || text.includes('flying over')) {
      return 'in a colorful cartoon rocket ship flying over grey moon surface with large craters, black starry space background with Earth visible, dramatic angle';
    }
    if (text.includes('landed') || text.includes('other side')) {
      return 'on grey moon surface next to a colorful cartoon rocket ship, large crater nearby, black starry sky with stars twinkling';
    }
    return 'on grey bumpy moon surface with craters all around, bright Earth visible in black starry sky';
  }

  // ROCKET LAUNCH / BLASTOFF scenes - INSIDE ROCKET
  if (text.includes('blasted off') || text.includes('blast off') || text.includes('took off') || text.includes('launched')) {
    if (text.includes('moon') || text.includes('crater') || text.includes('lunar')) {
      return 'inside colorful cartoon rocket ship cockpit with big windows showing moon surface and stars outside, control panel with glowing buttons';
    }
    return 'inside colorful cartoon rocket ship cockpit with big windows showing stars and planets outside, control panel with buttons';
  }

  // SOARING / FLYING in space - EMPHASIZE ROCKET WINDOW VIEW
  if (text.includes('soared') || text.includes('soaring')) {
    if (text.includes('moon') || text.includes('crater')) {
      return 'inside cartoon rocket ship looking out big round window at moon craters passing below, stars in black space';
    }
    return 'inside cartoon rocket ship with big window showing colorful outer space with stars and planets';
  }

  if (text.includes('moon surface') || text.includes('on the moon') || text.includes('lunar surface')) {
    return 'Moon surface with craters, Earth visible in black starry sky';
  }
  if (text.includes('exploring the moon') || text.includes('walked on the moon') || text.includes('stepped on the moon')) {
    return 'Moon surface with craters and rocks, starry space background';
  }
  if (text.includes('landed on the moon') || text.includes('arriving at the moon')) {
    return 'Rocket ship landed on moon surface with craters';
  }
  if (text.includes('mars') || text.includes('red planet')) {
    return 'Mars surface with red rocks and dusty terrain';
  }
  if (text.includes('soared through') || text.includes('through the galaxy') || text.includes('through space') || text.includes('through the stars') || text.includes('flying through')) {
    return 'Rocket ship flying through colorful outer space with stars and planets';
  }
  if (text.includes('outer space') || text.includes('in space') || text.includes('into space') || text.includes('galaxy')) {
    return 'Outer space with colorful nebulas, stars, and planets';
  }

  // NATURE
  if (text.includes('waterfall')) {
    return 'Magical waterfall in lush forest with sparkling water';
  }
  if (text.includes('stream') || text.includes('river') || text.includes('creek')) {
    return 'Peaceful stream in nature with rocks and greenery';
  }
  if (text.includes('forest') || text.includes('woods') || text.includes('trees')) {
    return 'Magical forest with tall trees and dappled sunlight';
  }
  if (text.includes('meadow') || text.includes('field of flowers') || text.includes('garden')) {
    return 'Beautiful meadow with colorful flowers';
  }
  if (text.includes('ocean') || text.includes('sea') || text.includes('underwater')) {
    return 'Underwater ocean scene with coral and fish';
  }
  if (text.includes('beach') || text.includes('shore') || text.includes('sand')) {
    return 'Sunny beach with sand and gentle waves';
  }
  if (text.includes('mountain') || text.includes('hill') || text.includes('cliff')) {
    return 'Mountain landscape with scenic views';
  }

  // CAVES & UNDERGROUND (check BEFORE "cozy" since "cozy cave" exists)
  if (text.includes('cave') || text.includes('cavern') || text.includes('crevice') || text.includes('chasm')) {
    if (text.includes('moon') || text.includes('lunar')) {
      return 'Dark moon cave with rocky walls and glowing crystals';
    }
    return 'Magical cave with rocky walls and soft glowing light';
  }

  // INDOOR
  if (text.includes('home') || text.includes('house') || text.includes('bedroom')) {
    return 'Cozy home interior with warm lighting';
  }
  if (text.includes('castle') || text.includes('palace') || text.includes('throne')) {
    return 'Magical castle interior';
  }
  if (text.includes('cozy') && !text.includes('cave')) {
    return 'Cozy interior with warm lighting';
  }

  // VEHICLES - ROCKET/SPACESHIP
  if (text.includes('rocket') || text.includes('spaceship') || text.includes('ship')) {
    if (text.includes('inside') || text.includes('cockpit') || text.includes('climbed inside') || text.includes('back to')) {
      return 'inside colorful cartoon rocket ship cockpit with big windows, glowing control panel with buttons, cozy seats';
    }
    return 'in colorful cartoon rocket ship flying through space with stars and planets visible through windows';
  }

  // WEATHER/TIME
  if (text.includes('sunset') || text.includes('evening')) {
    return fallbackSetting + ' at golden sunset';
  }
  if (text.includes('night') || text.includes('starry')) {
    return fallbackSetting + ' under starry night sky';
  }

  return fallbackSetting;
}

/**
 * Extract named characters from text like "Benny the dog" or "Fufu the cat"
 * Also detects group animals like "pride of lions" or "pack of wolves"
 * Returns string like "with Benny the dog and cute cartoon lions, "
 */
function extractNamedCharactersFromText(text: string, mainCharName: string): string {
  const found: string[] = [];
  const mainLower = mainCharName.toLowerCase();
  const lowerText = text.toLowerCase();

  // Pattern 1: "[Name] the [animal]"
  const namedAnimalPattern = /\b([A-Z][a-z]+)\s+the\s+(dog|cat|rabbit|bunny|bear|fox|owl|bird|mouse|squirrel|deer|porcupine|hedgehog|raccoon|beaver|frog|turtle|fish|penguin|lion|tiger|elephant|monkey|giraffe|zebra|hippo|koala|kangaroo|dolphin|whale|seal|otter|wolf|pig|cow|horse|sheep|goat|duck|chicken|butterfly|bee|dragon|unicorn|rhino|rhinoceros)\b/gi;

  let match;
  while ((match = namedAnimalPattern.exec(text)) !== null) {
    const name = match[1];
    const animal = match[2].toLowerCase();
    // Skip if it's the main character
    if (name.toLowerCase() === mainLower) continue;
    found.push(`${name} the ${animal}`);
  }

  // Pattern 2: Group animals - "pride of lions", "pack of wolves", "herd of elephants"
  const groupAnimalPatterns: [RegExp, string][] = [
    [/pride of lions/i, 'cute cartoon lions'],
    [/pack of wolves/i, 'cute cartoon wolves'],
    [/herd of elephants/i, 'cute cartoon elephants'],
    [/flock of birds/i, 'cute cartoon birds'],
    [/school of fish/i, 'cute cartoon fish'],
    [/pod of dolphins/i, 'cute cartoon dolphins'],
    [/group of (lions|wolves|bears|elephants|monkeys|penguins)/i, 'cute cartoon $1'],
  ];

  for (const [pattern, replacement] of groupAnimalPatterns) {
    if (pattern.test(lowerText)) {
      const result = replacement.replace('$1', lowerText.match(pattern)?.[1] || '');
      if (!found.includes(result)) found.push(result);
    }
  }

  // Pattern 3: Direct animal mentions without names (singular or plural)
  const animalKeywords: [string, string][] = [
    ['lions', 'cute cartoon lions'],
    ['lion', 'cute cartoon lion'],
    ['wolves', 'cute cartoon wolves'],
    ['wolf', 'cute cartoon wolf'],
    ['bears', 'cute cartoon bears'],
    ['bear', 'cute cartoon bear'],
    ['dolphins', 'cute cartoon dolphins'],
    ['dolphin', 'cute cartoon dolphin'],
    ['elephants', 'cute cartoon elephants'],
    ['elephant', 'cute cartoon elephant'],
    ['monkeys', 'cute cartoon monkeys'],
    ['monkey', 'cute cartoon monkey'],
    ['tigers', 'cute cartoon tigers'],
    ['tiger', 'cute cartoon tiger'],
    ['giraffes', 'cute cartoon giraffes'],
    ['giraffe', 'cute cartoon giraffe'],
    ['zebras', 'cute cartoon zebras'],
    ['zebra', 'cute cartoon zebra'],
    ['penguins', 'cute cartoon penguins'],
    ['penguin', 'cute cartoon penguin'],
  ];

  for (const [keyword, description] of animalKeywords) {
    // Check if the keyword appears (but not as part of main character name)
    if (lowerText.includes(keyword) && !mainLower.includes(keyword)) {
      // Don't add if we already have a similar entry
      const hasAlready = found.some(f => f.toLowerCase().includes(keyword.replace(/s$/, '')));
      if (!hasAlready) {
        found.push(description);
      }
    }
  }

  // Pattern 4: "[Name] and [Name]" or "[Name], [Name] and [Name]" (friends with creative names)
  const friendNamesPattern = /\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\b/g;
  while ((match = friendNamesPattern.exec(text)) !== null) {
    const name1 = match[1];
    const name2 = match[2];
    const skipWords = ['the', 'and', 'but', 'his', 'her', 'they', 'them', 'this', 'that', 'with'];
    if (name1.toLowerCase() !== mainLower && !skipWords.includes(name1.toLowerCase())) {
      if (!found.some(f => f.includes(name1))) found.push(name1);
    }
    if (name2.toLowerCase() !== mainLower && !skipWords.includes(name2.toLowerCase())) {
      if (!found.some(f => f.includes(name2))) found.push(name2);
    }
  }

  // Pattern 5: "his friends" or "her friends" - only if nothing else found
  if (text.includes('friends') && found.length === 0) {
    found.push('friends');
  }

  if (found.length === 0) return '';
  // Limit to 2 supporting characters to keep prompt short
  const chars = Array.from(new Set(found)).slice(0, 2);
  return `with ${chars.join(' and ')}, `;
}

/**
 * Build main character description from bible
 */
function buildMainCharacter(bible: CharacterBible): string {
  const name = bible.name;

  if (bible.character_type === 'animal' && bible.species && !bible.is_human) {
    // Use AnimalAppearance fields
    const animalApp = bible.appearance as AnimalAppearance;
    const bodyColor = animalApp.body_color || 'gray';
    const texture = animalApp.skin_texture || 'soft fur';
    return `${name} the cute cartoon ${bible.species} with ${bodyColor} ${texture}, big expressive eyes`;
  }

  // Human character - use HumanAppearance fields
  const humanApp = bible.appearance as HumanAppearance;
  const hair = humanApp.hair || 'friendly hair';
  return `${name}, cute cartoon child with ${hair}, big expressive eyes`;
}

/**
 * Extract supporting characters from page text
 */
function extractSupportingFromText(text: string, mainCharName: string): string {
  const found: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // COMPREHENSIVE ANIMAL MAP - ALL ANIMALS AND INSECTS
  const animalMap: Record<string, string> = {
    // PETS & DOMESTIC
    'dog': 'cute cartoon dog', 'puppy': 'cute cartoon puppy', 'cat': 'cute cartoon cat',
    'kitten': 'cute cartoon kitten', 'hamster': 'tiny cartoon hamster', 'guinea pig': 'cute cartoon guinea pig',
    'gerbil': 'tiny cartoon gerbil', 'rabbit': 'cute cartoon rabbit', 'bunny': 'cute cartoon bunny',
    'ferret': 'playful cartoon ferret', 'parrot': 'colorful cartoon parrot', 'parakeet': 'colorful cartoon parakeet',
    'budgie': 'cute cartoon budgie', 'canary': 'tiny cartoon canary', 'cockatiel': 'cute cartoon cockatiel',
    'cockatoo': 'fancy cartoon cockatoo', 'macaw': 'colorful cartoon macaw', 'goldfish': 'shiny cartoon goldfish',
    'betta': 'colorful cartoon betta fish', 'turtle': 'gentle cartoon turtle', 'tortoise': 'wise cartoon tortoise',
    'snake': 'friendly cartoon snake', 'lizard': 'cute cartoon lizard', 'gecko': 'tiny cartoon gecko',
    'iguana': 'cool cartoon iguana', 'chameleon': 'colorful cartoon chameleon',
    // FARM ANIMALS
    'horse': 'majestic cartoon horse', 'pony': 'cute cartoon pony', 'donkey': 'friendly cartoon donkey',
    'mule': 'sturdy cartoon mule', 'cow': 'friendly cartoon cow', 'bull': 'strong cartoon bull',
    'calf': 'cute cartoon calf', 'pig': 'pink cartoon pig', 'piglet': 'tiny cartoon piglet',
    'hog': 'big cartoon hog', 'boar': 'wild cartoon boar', 'sheep': 'fluffy cartoon sheep',
    'lamb': 'baby cartoon lamb', 'goat': 'playful cartoon goat', 'chicken': 'cute cartoon chicken',
    'hen': 'mother cartoon hen', 'rooster': 'proud cartoon rooster', 'chick': 'tiny cartoon chick',
    'duck': 'cute cartoon duck', 'duckling': 'baby cartoon duckling', 'goose': 'friendly cartoon goose',
    'gosling': 'baby cartoon gosling', 'turkey': 'funny cartoon turkey', 'llama': 'fluffy cartoon llama',
    'alpaca': 'fuzzy cartoon alpaca', 'buffalo': 'big cartoon buffalo', 'bison': 'majestic cartoon bison',
    'ox': 'strong cartoon ox', 'yak': 'shaggy cartoon yak',
    // FOREST & WOODLAND
    'fox': 'clever cartoon fox', 'wolf': 'friendly cartoon wolf', 'coyote': 'wild cartoon coyote',
    'bear': 'friendly cartoon bear', 'deer': 'gentle cartoon deer', 'doe': 'gentle cartoon doe',
    'fawn': 'baby cartoon fawn', 'buck': 'majestic cartoon buck', 'stag': 'noble cartoon stag',
    'elk': 'majestic cartoon elk', 'moose': 'big cartoon moose', 'caribou': 'noble cartoon caribou',
    'reindeer': 'magical cartoon reindeer', 'hare': 'speedy cartoon hare', 'squirrel': 'busy cartoon squirrel',
    'chipmunk': 'tiny cartoon chipmunk', 'raccoon': 'mischievous cartoon raccoon', 'skunk': 'cute cartoon skunk',
    'opossum': 'shy cartoon opossum', 'possum': 'shy cartoon possum', 'badger': 'grumpy cartoon badger',
    'wolverine': 'fierce cartoon wolverine', 'weasel': 'sneaky cartoon weasel', 'mink': 'sleek cartoon mink',
    'otter': 'playful cartoon otter', 'beaver': 'busy cartoon beaver', 'porcupine': 'spiky cartoon porcupine',
    'hedgehog': 'cute cartoon hedgehog', 'mole': 'tiny cartoon mole', 'shrew': 'tiny cartoon shrew',
    'vole': 'tiny cartoon vole', 'mouse': 'tiny cartoon mouse', 'mice': 'tiny cartoon mice',
    'rat': 'clever cartoon rat', 'woodchuck': 'chubby cartoon woodchuck', 'groundhog': 'cute cartoon groundhog',
    'bobcat': 'wild cartoon bobcat', 'lynx': 'sleek cartoon lynx', 'cougar': 'majestic cartoon cougar',
    'panther': 'sleek cartoon panther', 'mountain lion': 'majestic cartoon mountain lion',
    // JUNGLE & TROPICAL
    'lion': 'majestic cartoon lion', 'tiger': 'majestic cartoon tiger', 'leopard': 'spotted cartoon leopard',
    'jaguar': 'spotted cartoon jaguar', 'cheetah': 'fast cartoon cheetah', 'monkey': 'playful cartoon monkey',
    'ape': 'strong cartoon ape', 'gorilla': 'gentle cartoon gorilla', 'chimpanzee': 'smart cartoon chimpanzee',
    'orangutan': 'wise cartoon orangutan', 'baboon': 'funny cartoon baboon', 'lemur': 'cute cartoon lemur',
    'sloth': 'sleepy cartoon sloth', 'anteater': 'long-nosed cartoon anteater', 'armadillo': 'armored cartoon armadillo',
    'tapir': 'friendly cartoon tapir', 'capybara': 'chill cartoon capybara', 'toucan': 'colorful cartoon toucan',
    'anaconda': 'big cartoon anaconda', 'python': 'long cartoon python', 'boa': 'friendly cartoon boa',
    'crocodile': 'scaly cartoon crocodile', 'alligator': 'scaly cartoon alligator', 'caiman': 'small cartoon caiman',
    // AFRICAN SAVANNA
    'elephant': 'big cartoon elephant', 'giraffe': 'tall cartoon giraffe', 'zebra': 'striped cartoon zebra',
    'hippo': 'big cartoon hippo', 'hippopotamus': 'big cartoon hippopotamus', 'rhino': 'strong cartoon rhino',
    'rhinoceros': 'strong cartoon rhinoceros', 'gazelle': 'graceful cartoon gazelle', 'antelope': 'graceful cartoon antelope',
    'impala': 'leaping cartoon impala', 'hyena': 'laughing cartoon hyena', 'jackal': 'clever cartoon jackal',
    'meerkat': 'cute cartoon meerkat', 'warthog': 'funny cartoon warthog', 'ostrich': 'tall cartoon ostrich',
    'flamingo': 'pink cartoon flamingo', 'vulture': 'soaring cartoon vulture',
    // AUSTRALIAN
    'kangaroo': 'bouncy cartoon kangaroo', 'wallaby': 'small cartoon wallaby', 'koala': 'cuddly cartoon koala',
    'wombat': 'chubby cartoon wombat', 'platypus': 'unique cartoon platypus', 'echidna': 'spiky cartoon echidna',
    'tasmanian devil': 'wild cartoon tasmanian devil', 'dingo': 'wild cartoon dingo', 'emu': 'tall cartoon emu',
    'kookaburra': 'laughing cartoon kookaburra', 'lorikeet': 'colorful cartoon lorikeet', 'sugar glider': 'cute cartoon sugar glider',
    'numbat': 'striped cartoon numbat', 'quokka': 'happy cartoon quokka',
    // ARCTIC & POLAR
    'polar bear': 'white cartoon polar bear', 'penguin': 'cute cartoon penguin', 'seal': 'sleek cartoon seal',
    'sea lion': 'playful cartoon sea lion', 'walrus': 'big cartoon walrus', 'arctic fox': 'white cartoon arctic fox',
    'snowy owl': 'white cartoon snowy owl', 'narwhal': 'magical cartoon narwhal', 'beluga': 'white cartoon beluga',
    'orca': 'majestic cartoon orca', 'whale': 'big cartoon whale', 'puffin': 'colorful cartoon puffin',
    'lemming': 'tiny cartoon lemming', 'musk ox': 'shaggy cartoon musk ox',
    // OCEAN & MARINE
    'dolphin': 'playful cartoon dolphin', 'porpoise': 'friendly cartoon porpoise', 'shark': 'cool cartoon shark',
    'ray': 'flat cartoon ray', 'stingray': 'flat cartoon stingray', 'manta ray': 'majestic cartoon manta ray',
    'eel': 'wiggly cartoon eel', 'octopus': 'smart cartoon octopus', 'squid': 'fast cartoon squid',
    'jellyfish': 'glowing cartoon jellyfish', 'starfish': 'colorful cartoon starfish', 'seahorse': 'tiny cartoon seahorse',
    'crab': 'sideways cartoon crab', 'lobster': 'red cartoon lobster', 'shrimp': 'tiny cartoon shrimp',
    'clam': 'shy cartoon clam', 'oyster': 'pearly cartoon oyster', 'snail': 'slow cartoon snail',
    'slug': 'slimy cartoon slug', 'fish': 'colorful cartoon fish', 'salmon': 'pink cartoon salmon',
    'tuna': 'fast cartoon tuna', 'clownfish': 'orange cartoon clownfish', 'angelfish': 'pretty cartoon angelfish',
    'swordfish': 'fast cartoon swordfish', 'manatee': 'gentle cartoon manatee', 'sea turtle': 'wise cartoon sea turtle',
    'sea otter': 'floating cartoon sea otter', 'hermit crab': 'shy cartoon hermit crab', 'crayfish': 'red cartoon crayfish',
    'prawn': 'small cartoon prawn', 'nautilus': 'spiral cartoon nautilus', 'dugong': 'gentle cartoon dugong',
    // BIRDS
    'bird': 'colorful cartoon bird', 'eagle': 'majestic cartoon eagle', 'hawk': 'sharp cartoon hawk',
    'falcon': 'fast cartoon falcon', 'owl': 'wise cartoon owl', 'condor': 'soaring cartoon condor',
    'crow': 'clever cartoon crow', 'raven': 'dark cartoon raven', 'magpie': 'shiny cartoon magpie',
    'jay': 'blue cartoon jay', 'bluejay': 'blue cartoon bluejay', 'cardinal': 'red cartoon cardinal',
    'robin': 'red-breasted cartoon robin', 'sparrow': 'tiny cartoon sparrow', 'finch': 'tiny cartoon finch',
    'hummingbird': 'tiny cartoon hummingbird', 'woodpecker': 'busy cartoon woodpecker', 'pelican': 'big-beaked cartoon pelican',
    'crane': 'elegant cartoon crane', 'heron': 'tall cartoon heron', 'stork': 'long-legged cartoon stork',
    'swan': 'graceful cartoon swan', 'seagull': 'coastal cartoon seagull', 'albatross': 'soaring cartoon albatross',
    'peacock': 'colorful cartoon peacock', 'pheasant': 'fancy cartoon pheasant', 'quail': 'small cartoon quail',
    'pigeon': 'city cartoon pigeon', 'dove': 'peaceful cartoon dove', 'kingfisher': 'colorful cartoon kingfisher',
    'lovebird': 'cute cartoon lovebird',
    // REPTILES & AMPHIBIANS
    'cobra': 'hooded cartoon cobra', 'viper': 'coiled cartoon viper', 'rattlesnake': 'rattling cartoon rattlesnake',
    'komodo dragon': 'big cartoon komodo dragon', 'monitor lizard': 'big cartoon monitor lizard', 'skink': 'shiny cartoon skink',
    'terrapin': 'spotted cartoon terrapin', 'gavial': 'long-nosed cartoon gavial', 'frog': 'happy cartoon frog',
    'toad': 'bumpy cartoon toad', 'salamander': 'spotted cartoon salamander', 'newt': 'tiny cartoon newt',
    'axolotl': 'smiling cartoon axolotl', 'tadpole': 'baby cartoon tadpole',
    // INSECTS & BUGS
    'butterfly': 'beautiful cartoon butterfly', 'moth': 'fuzzy cartoon moth', 'bee': 'busy cartoon bee',
    'bumblebee': 'fuzzy cartoon bumblebee', 'honeybee': 'golden cartoon honeybee', 'wasp': 'striped cartoon wasp',
    'hornet': 'big cartoon hornet', 'ant': 'tiny cartoon ant', 'termite': 'tiny cartoon termite',
    'beetle': 'shiny cartoon beetle', 'ladybug': 'spotted cartoon ladybug', 'ladybird': 'spotted cartoon ladybird',
    'firefly': 'glowing cartoon firefly', 'lightning bug': 'glowing cartoon lightning bug', 'dragonfly': 'colorful cartoon dragonfly',
    'damselfly': 'delicate cartoon damselfly', 'grasshopper': 'jumping cartoon grasshopper', 'cricket': 'chirping cartoon cricket',
    'locust': 'jumping cartoon locust', 'katydid': 'green cartoon katydid', 'mantis': 'praying cartoon mantis',
    'praying mantis': 'praying cartoon mantis', 'stick insect': 'camouflage cartoon stick insect',
    'walking stick': 'thin cartoon walking stick', 'leaf insect': 'leafy cartoon leaf insect',
    'fly': 'buzzing cartoon fly', 'mosquito': 'tiny cartoon mosquito', 'gnat': 'tiny cartoon gnat',
    'caterpillar': 'fuzzy cartoon caterpillar', 'worm': 'wiggly cartoon worm', 'earthworm': 'pink cartoon earthworm',
    'silkworm': 'white cartoon silkworm', 'glowworm': 'glowing cartoon glowworm', 'inchworm': 'tiny cartoon inchworm',
    'cockroach': 'brown cartoon cockroach', 'cicada': 'singing cartoon cicada', 'aphid': 'tiny cartoon aphid',
    'flea': 'tiny cartoon flea', 'tick': 'tiny cartoon tick', 'stinkbug': 'smelly cartoon stinkbug',
    'water strider': 'skating cartoon water strider', 'dung beetle': 'rolling cartoon dung beetle', 'scarab': 'golden cartoon scarab',
    'weevil': 'long-nosed cartoon weevil',
    // ARACHNIDS & OTHER CRAWLIES
    'spider': 'web-spinning cartoon spider', 'tarantula': 'fuzzy cartoon tarantula', 'black widow': 'dark cartoon spider',
    'scorpion': 'pinchy cartoon scorpion', 'daddy longlegs': 'leggy cartoon daddy longlegs',
    'centipede': 'many-legged cartoon centipede', 'millipede': 'curly cartoon millipede',
    'pillbug': 'rolling cartoon pillbug', 'roly poly': 'rolling cartoon roly poly', 'woodlouse': 'gray cartoon woodlouse',
    // MYTHICAL & FANTASY
    'dragon': 'friendly cartoon dragon', 'unicorn': 'magical cartoon unicorn', 'phoenix': 'fiery cartoon phoenix',
    'griffin': 'majestic cartoon griffin', 'pegasus': 'winged cartoon pegasus', 'mermaid': 'beautiful cartoon mermaid',
    'fairy': 'tiny cartoon fairy', 'fairies': 'tiny cartoon fairies', 'pixie': 'sparkly cartoon pixie',
    'gnome': 'tiny cartoon gnome', 'troll': 'friendly cartoon troll', 'goblin': 'mischievous cartoon goblin',
    'elf': 'pointy-eared cartoon elf', 'centaur': 'half-horse cartoon centaur', 'hydra': 'many-headed cartoon hydra',
    'kraken': 'giant cartoon kraken', 'yeti': 'fluffy cartoon yeti', 'bigfoot': 'fuzzy cartoon bigfoot',
    'dinosaur': 'friendly cartoon dinosaur', 't-rex': 'big cartoon t-rex', 'triceratops': 'horned cartoon triceratops',
    'stegosaurus': 'plated cartoon stegosaurus', 'pterodactyl': 'flying cartoon pterodactyl', 'velociraptor': 'fast cartoon velociraptor',
    'brontosaurus': 'long-necked cartoon brontosaurus',
    // MISCELLANEOUS
    'bat': 'flying cartoon bat', 'flying fox': 'big cartoon flying fox', 'panda': 'cute cartoon panda',
    'red panda': 'fluffy cartoon red panda', 'binturong': 'fuzzy cartoon binturong', 'civet': 'spotted cartoon civet',
    'mongoose': 'quick cartoon mongoose', 'aardvark': 'long-nosed cartoon aardvark', 'pangolin': 'scaly cartoon pangolin',
    'okapi': 'striped cartoon okapi',
    // ROBOTS & OTHER
    'robot': 'friendly cartoon robot', 'alien': 'friendly cartoon alien', 'aliens': 'friendly cartoon aliens',
  };

  for (const [keyword, description] of Object.entries(animalMap)) {
    // Don't include if it's the main character
    if (mainLower.includes(keyword)) continue;
    if (text.includes(keyword)) {
      found.push(description);
    }
  }

  // People
  if (text.includes('friend') && !found.includes('friends')) found.push('friends');
  if (text.includes('family') || text.includes('parent') || text.includes('mother') || text.includes('father')) {
    found.push('family members');
  }

  if (found.length === 0) return '';
  return `Also showing: ${Array.from(new Set(found)).slice(0, 3).join(', ')}.`;
}

/**
 * Extract key objects from page text
 */
function extractObjectsFromText(text: string): string {
  const found: string[] = [];

  const objectMap: Record<string, string> = {
    'rocket': 'rocket ship',
    'spaceship': 'spaceship',
    'telescope': 'telescope',
    'star': 'twinkling stars',
    'planet': 'colorful planets',
    'moon': 'glowing moon',
    'treasure': 'treasure chest',
    'crown': 'golden crown',
    'wand': 'magic wand',
    'rainbow': 'rainbow',
    'balloon': 'colorful balloons',
    'cake': 'birthday cake',
    'present': 'wrapped presents',
    'book': 'magical book',
    'map': 'treasure map',
  };

  for (const [keyword, description] of Object.entries(objectMap)) {
    if (text.includes(keyword)) {
      found.push(description);
    }
  }

  if (found.length === 0) return '';
  return `With ${Array.from(new Set(found)).slice(0, 2).join(' and ')}.`;
}


/**
 * Negative prompt - excludes humans for animal stories + species-specific negatives + scene negatives
 * This is CRITICAL to prevent SDXL from drifting to wrong animals or scenes
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean, species?: string): string {
  let base = "text, watermark, logo, photorealistic, realistic, photograph, ugly, deformed, bad anatomy, bad proportions";

  // CRITICAL: Always exclude humans for animal-only stories
  if (isAnimal) {
    base += ", human, person, boy, girl, child, man, woman, people, hands, fingers";
  }

  // CRITICAL: Add species-specific negatives to prevent drift
  // For example, rhino stories should exclude: cow, bull, hippo, elephant
  if (species) {
    const speciesNegatives = getSpeciesNegatives(species);
    if (speciesNegatives.length > 0) {
      base += `, ${speciesNegatives.join(', ')}`;
    }
  }

  // CRITICAL: Add scene-based negatives to prevent wrong settings
  const sceneNegatives = getSceneNegatives(card.setting);
  if (sceneNegatives.length > 0) {
    base += `, ${sceneNegatives.join(', ')}`;
  }

  // Add scene-specific forbidden elements
  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    base += `, ${card.forbidden_elements.slice(0, 5).join(', ')}`;
  }

  return base;
}

/**
 * Get negatives based on scene type - block incompatible settings
 * If scene is SPACE/MOON, block underwater/ocean
 * If scene is UNDERWATER, block space/moon
 * If scene is FOREST, block underwater/space
 */
function getSceneNegatives(setting: string): string[] {
  const lowerSetting = setting.toLowerCase();

  // SPACE/MOON scenes - block underwater/ocean
  if (lowerSetting.includes('space') || lowerSetting.includes('moon') ||
      lowerSetting.includes('rocket') || lowerSetting.includes('stars') ||
      lowerSetting.includes('planet') || lowerSetting.includes('crater') ||
      lowerSetting.includes('galaxy') || lowerSetting.includes('cosmos')) {
    return ['underwater', 'ocean', 'sea', 'fish', 'coral', 'seaweed', 'aquarium', 'water', 'swimming'];
  }

  // UNDERWATER/OCEAN scenes - block space/land
  if (lowerSetting.includes('underwater') || lowerSetting.includes('ocean') ||
      lowerSetting.includes('sea') || lowerSetting.includes('coral')) {
    return ['space', 'moon', 'rocket', 'stars', 'planet', 'crater'];
  }

  // FOREST/LAND scenes - block underwater
  if (lowerSetting.includes('forest') || lowerSetting.includes('meadow') ||
      lowerSetting.includes('savanna') || lowerSetting.includes('jungle') ||
      lowerSetting.includes('garden') || lowerSetting.includes('field')) {
    return ['underwater', 'ocean', 'sea', 'fish', 'coral', 'seaweed', 'aquarium'];
  }

  // INDOOR/COCKPIT scenes - block outdoor nature
  if (lowerSetting.includes('cockpit') || lowerSetting.includes('inside rocket') ||
      lowerSetting.includes('interior') || lowerSetting.includes('room')) {
    return ['underwater', 'ocean', 'sea', 'fish', 'outdoor wilderness'];
  }

  return [];
}

/**
 * Generate seed for a page - uses SAME seed for all pages to maintain character consistency
 * The prompt differences handle scene variation, seed handles character appearance
 */
export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  // CRITICAL: Return same seed for all pages to maintain character consistency
  // Different seeds cause character drift (rhino becomes cow/bull/hippo)
  return baseSeed;
}
