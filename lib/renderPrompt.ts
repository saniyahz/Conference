import { CharacterBible, PageSceneCard } from "./visual-types";

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

  // BUILD PROMPT - CHARACTER FIRST, then scene
  // Format: "A cute [species], [name], in [scene]. Disney Pixar style."
  let prompt: string;

  if (bible.character_type === 'animal' && species !== 'animal') {
    // ANIMAL CHARACTER - species is FIRST and REPEATED
    prompt = `A cute cartoon ${species} with big eyes, ${charName} the ${species}, in ${scene}. ${supporting}Disney Pixar 3D animated style.`;
  } else {
    // HUMAN or unknown - generic child
    prompt = `A cute cartoon child, ${charName}, in ${scene}. ${supporting}Disney Pixar 3D animated style.`;
  }

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt}`);
  return prompt;
}

/**
 * Extract scene/setting directly from page text
 * Looks for location keywords and builds appropriate scene description
 */
function extractSceneFromText(text: string, fallbackSetting: string): string {
  // SPACE / CELESTIAL - Check most specific patterns first

  // CRATER scenes (moon adventures)
  if (text.includes('crater') || text.includes('lunar crater')) {
    if (text.includes('soared over') || text.includes('fly across') || text.includes('flew over') || text.includes('flying over')) {
      return 'Rocket ship flying over moon crater in outer space, stars in background';
    }
    if (text.includes('landed') || text.includes('other side')) {
      return 'Moon surface near large crater, rocket ship landed, starry sky';
    }
    return 'Moon surface with craters, Earth visible in black starry sky';
  }

  // ROCKET LAUNCH / BLASTOFF scenes
  if (text.includes('blasted off') || text.includes('blast off') || text.includes('took off') || text.includes('launched')) {
    if (text.includes('moon') || text.includes('crater') || text.includes('lunar')) {
      return 'Rocket ship blasting off from moon surface into starry space';
    }
    return 'Rocket ship blasting off into colorful outer space with stars';
  }

  // SOARING / FLYING in space
  if (text.includes('soared') || text.includes('soaring')) {
    if (text.includes('moon') || text.includes('crater')) {
      return 'Rocket ship soaring over moon landscape with craters below';
    }
    return 'Rocket ship soaring through colorful outer space';
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

  // VEHICLES
  if (text.includes('rocket') || text.includes('spaceship')) {
    if (text.includes('inside') || text.includes('cockpit')) {
      return 'Inside a rocket ship cockpit with controls and windows showing space';
    }
    return 'Rocket ship in colorful outer space';
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
 * Also detects "[Name] and [Name]" patterns for friends with creative names
 * Returns string like "with Benny the dog and Fufu the cat, "
 */
function extractNamedCharactersFromText(text: string, mainCharName: string): string {
  const found: string[] = [];
  const mainLower = mainCharName.toLowerCase();

  // Pattern 1: "[Name] the [animal]"
  const namedAnimalPattern = /\b([A-Z][a-z]+)\s+the\s+(dog|cat|rabbit|bunny|bear|fox|owl|bird|mouse|squirrel|deer|porcupine|hedgehog|raccoon|beaver|frog|turtle|fish|penguin|lion|tiger|elephant|monkey|giraffe|zebra|hippo|koala|kangaroo|dolphin|whale|seal|otter|wolf|pig|cow|horse|sheep|goat|duck|chicken|butterfly|bee|dragon|unicorn)\b/gi;

  let match;
  while ((match = namedAnimalPattern.exec(text)) !== null) {
    const name = match[1];
    const animal = match[2].toLowerCase();
    // Skip if it's the main character
    if (name.toLowerCase() === mainLower) continue;
    found.push(`${name} the ${animal}`);
  }

  // Pattern 2: "[Name] and [Name]" or "[Name], [Name] and [Name]" (friends with creative names)
  // Common in children's stories: "Susu and Piku cheered" or "Luna, Max and Ruby played"
  const friendNamesPattern = /\b([A-Z][a-z]{2,})\s+and\s+([A-Z][a-z]{2,})\b/g;
  while ((match = friendNamesPattern.exec(text)) !== null) {
    const name1 = match[1];
    const name2 = match[2];
    // Skip main character, skip common words
    const skipWords = ['the', 'and', 'but', 'his', 'her', 'they', 'them', 'this', 'that', 'with'];
    if (name1.toLowerCase() !== mainLower && !skipWords.includes(name1.toLowerCase())) {
      if (!found.some(f => f.includes(name1))) found.push(name1);
    }
    if (name2.toLowerCase() !== mainLower && !skipWords.includes(name2.toLowerCase())) {
      if (!found.some(f => f.includes(name2))) found.push(name2);
    }
  }

  // Pattern 3: "his friends" or "her friends" or "three friends" - generic friends
  if (text.includes('friends') && found.length === 0) {
    found.push('friends');
  }

  if (found.length === 0) return '';
  // Limit to 2 supporting characters to keep prompt short
  const chars = [...new Set(found)].slice(0, 2);
  return `with ${chars.join(' and ')}, `;
}

/**
 * Build main character description from bible
 */
function buildMainCharacter(bible: CharacterBible): string {
  const name = bible.name;

  if (bible.character_type === 'animal' && bible.species) {
    const fur = bible.appearance.skin_tone || 'soft fur';
    return `${name} the cute cartoon ${bible.species} with ${fur}, big expressive eyes`;
  }

  // Human character
  return `${name}, cute cartoon child with friendly face, big expressive eyes`;
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
  return `Also showing: ${[...new Set(found)].slice(0, 3).join(', ')}.`;
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
  return `With ${[...new Set(found)].slice(0, 2).join(' and ')}.`;
}


/**
 * Negative prompt - excludes humans for animal stories, realistic style always
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean): string {
  let base = "text, watermark, logo, photorealistic, realistic, photograph";

  // Always exclude humans for animal-only stories
  if (isAnimal) {
    base += ", human, person, boy, girl, child, man, woman";
  }

  if (card.forbidden_elements && card.forbidden_elements.length > 0) {
    return `${base}, ${card.forbidden_elements.slice(0, 5).join(', ')}`;
  }

  return base;
}

export function generatePageSeedByNumber(pageNumber: number, baseSeed: number): number {
  return baseSeed + (pageNumber * 77);
}
