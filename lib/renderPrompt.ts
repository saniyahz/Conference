import { CharacterBible, PageSceneCard } from "./visual-types";

/**
 * ENHANCED PROMPT RENDERER FOR STORYBOOK IMAGES
 *
 * KEY FIX: SDXL needs species EXTREMELY strongly emphasized
 * - Species name must appear 3-4 times in first 50 tokens
 * - Animal-specific features (horn, trunk, stripes) must be included
 * - Page text must be analyzed for specific elements (aliens, objects, etc.)
 */

// Animal-specific visual features for accurate generation
const ANIMAL_FEATURES: Record<string, string> = {
  // African Savanna
  'rhinoceros': 'grey rough skin, large horn on nose, thick body, small ears, powerful legs',
  'rhino': 'grey rough skin, large horn on nose, thick body, small ears, powerful legs',
  'elephant': 'grey wrinkled skin, long trunk, big floppy ears, tusks, thick legs',
  'giraffe': 'long neck, spotted pattern, small horns, long legs, brown and yellow patches',
  'zebra': 'black and white stripes, horse-like body, mane, long face',
  'lion': 'golden fur, fluffy mane around face, powerful body, long tail with tuft',
  'hippo': 'grey pink skin, wide mouth, barrel body, small ears, stubby legs',

  // Pets & Common
  'dog': 'fluffy fur, wagging tail, floppy ears, wet nose, friendly face',
  'puppy': 'fluffy soft fur, small body, big eyes, floppy ears, wagging tail',
  'cat': 'soft fur, pointed ears, whiskers, long tail, cute paws',
  'kitten': 'fluffy soft fur, small body, big eyes, tiny paws, whiskers',
  'rabbit': 'fluffy fur, long floppy ears, cotton tail, pink nose, soft paws',
  'bunny': 'fluffy fur, long floppy ears, cotton tail, pink nose, soft paws',
  'hamster': 'fluffy round body, tiny ears, chubby cheeks, small paws, short tail',

  // Forest & Woodland
  'fox': 'orange red fur, fluffy tail, pointed ears, white chest, black paws',
  'bear': 'thick fluffy fur, round ears, big paws, strong body, cute face',
  'deer': 'brown fur, white spots, long legs, big gentle eyes, small tail',
  'owl': 'feathered body, big round eyes, beak, wings, fluffy face',
  'squirrel': 'fluffy bushy tail, small ears, tiny paws, brown fur, cute face',
  'raccoon': 'grey fur, black mask around eyes, striped tail, small paws',
  'hedgehog': 'spiky back, soft belly, small face, tiny paws, button nose',
  'porcupine': 'spiky quills on back, round body, small face, tiny paws',
  'beaver': 'brown fur, flat paddle tail, big front teeth, webbed feet',
  'wolf': 'grey fur, pointed ears, bushy tail, yellow eyes, strong body',

  // Farm Animals
  'pig': 'pink skin, curly tail, snout nose, floppy ears, round body',
  'cow': 'spotted body, horns, udder, big gentle eyes, long tail',
  'horse': 'long mane, strong body, long tail, hooves, long face',
  'sheep': 'fluffy wool coat, soft face, small ears, hooves',
  'goat': 'short fur, small horns, beard, rectangular pupils, hooves',
  'chicken': 'feathers, red comb on head, beak, wings, yellow legs',
  'duck': 'feathers, orange beak, webbed feet, wings, round body',

  // Jungle & Tropical
  'monkey': 'brown fur, long tail, human-like hands, expressive face, big ears',
  'tiger': 'orange fur with black stripes, powerful body, long tail, whiskers',
  'leopard': 'spotted golden fur, sleek body, long tail, whiskers',
  'sloth': 'shaggy fur, long arms, slow moving, peaceful face, curved claws',
  'toucan': 'large colorful beak, black feathers, white chest, bright eyes',
  'parrot': 'colorful feathers, curved beak, wings, long tail feathers',

  // Ocean & Marine
  'dolphin': 'smooth grey skin, curved dorsal fin, smiling mouth, flippers',
  'whale': 'huge body, smooth skin, tail flukes, water spout, gentle eyes',
  'octopus': 'eight tentacles with suckers, round head, big eyes, soft body',
  'fish': 'scales, fins, tail, gills, round eyes',
  'shark': 'grey skin, dorsal fin, sharp teeth, streamlined body, powerful tail',
  'turtle': 'shell on back, flippers, small head, gentle eyes, scaly skin',
  'seahorse': 'curled tail, horse-like head, small fins, bumpy body',
  'crab': 'hard shell, big claws, eight legs, stalked eyes',
  'jellyfish': 'translucent bell body, long flowing tentacles, graceful movement',

  // Birds
  'penguin': 'black and white feathers, orange beak, flippers, waddle feet',
  'eagle': 'brown feathers, hooked beak, powerful wings, sharp talons',
  'swan': 'white feathers, long curved neck, orange beak, graceful',
  'flamingo': 'pink feathers, long curved neck, long thin legs, hooked beak',

  // Arctic & Polar
  'polar bear': 'white thick fur, black nose, powerful body, big paws',
  'arctic fox': 'white fluffy fur, small ears, bushy tail, cute face',
  'walrus': 'brown wrinkled skin, long tusks, whiskers, flippers',
  'seal': 'smooth grey fur, flippers, whiskers, big dark eyes',

  // Australian
  'kangaroo': 'brown fur, long tail, big back legs, pouch, upright posture',
  'koala': 'grey fluffy fur, big round ears, black nose, eucalyptus eater',
  'platypus': 'brown fur, duck bill, beaver tail, webbed feet',
  'wombat': 'brown fur, short legs, round body, small ears',

  // Mythical
  'dragon': 'scales, wings, long tail, horns, fire breathing, powerful',
  'unicorn': 'white coat, rainbow mane, magical horn on forehead, sparkles',
  'phoenix': 'golden red feathers, flaming wings, majestic, glowing',

  // Insects
  'butterfly': 'colorful patterned wings, antennae, small body, graceful',
  'bee': 'fuzzy yellow and black body, wings, antennae, holding flower',
  'ladybug': 'red shell with black spots, small legs, antennae, round',
  'caterpillar': 'long segmented body, many tiny legs, fuzzy, colorful',
  'dragonfly': 'long body, four transparent wings, big eyes, hovering',

  // Reptiles & Amphibians
  'frog': 'green smooth skin, big bulging eyes, long legs, webbed feet',
  'snake': 'long scaled body, forked tongue, no legs, patterns on skin',
  'lizard': 'scaly skin, four legs, long tail, small head',
  'crocodile': 'green scaly skin, long snout, sharp teeth, powerful tail',

  // Other
  'panda': 'black and white fur, round body, black eye patches, eating bamboo',
  'bat': 'wings, furry body, big ears, small eyes, hanging upside down',
  'mouse': 'small grey body, big round ears, long thin tail, whiskers',
  'rat': 'grey fur, long tail, pointed nose, small ears, whiskers',
};

export function renderPrompt(bible: CharacterBible, card: PageSceneCard, pageText?: string): string {
  const text = pageText?.toLowerCase() || '';
  const isAnimal = bible.character_type === 'animal';
  const species = bible.species || 'animal';
  const name = bible.name;

  // 1. CHARACTER DESCRIPTION - Species FIRST and REPEATED for SDXL
  const characterDesc = buildStrongCharacterDescription(bible, isAnimal, species, name);

  // 2. PAGE-SPECIFIC ACTION & ELEMENTS - Extract from actual page text
  const pageAction = extractPageSpecificAction(text, name, species);

  // 3. PAGE-SPECIFIC ELEMENTS - Aliens, objects, etc. from story text
  const pageElements = extractPageElements(text);

  // 4. ENVIRONMENT - Based on page text
  const environment = buildEnvironment(text, card.setting);

  // 5. MOOD
  const mood = extractMood(text);

  // 6. ART STYLE - Consistent children's book style
  const style = "Pixar Disney 3D animation style, soft volumetric lighting, vibrant saturated colors, children's picture book illustration, highly detailed, professional quality";

  // BUILD FINAL PROMPT
  let prompt = `${characterDesc}, ${pageAction}, ${environment}`;

  // Add page-specific elements if found
  if (pageElements) {
    prompt += `. ${pageElements}`;
  }

  prompt += `. ${mood} ${style}`;

  console.log(`[PROMPT] Page ${card.page_number}: ${prompt.substring(0, 300)}...`);
  return prompt;
}

/**
 * Build STRONG character description with species repeated multiple times
 */
function buildStrongCharacterDescription(bible: CharacterBible, isAnimal: boolean, species: string, name: string): string {
  if (isAnimal && species !== 'animal') {
    // Get animal-specific features
    const features = ANIMAL_FEATURES[species.toLowerCase()] || 'soft fur, expressive face, cute features';

    // CRITICAL: Repeat species name multiple times for SDXL to understand
    // Format: "A [species], cute cartoon [species] character, [name] the [species], with [features]"
    return `A ${species}, cute cartoon ${species} character, ${name} the adorable ${species}, anthropomorphic ${species} with ${features}, big expressive cartoon eyes`;
  } else if (bible.character_type === 'human') {
    const skinTone = bible.appearance?.skin_tone || 'warm skin';
    const hair = bible.appearance?.hair || 'soft hair';
    return `A cute cartoon child, ${name} the young child, with ${skinTone} and ${hair}, big expressive cartoon eyes, friendly smile`;
  } else {
    return `A cute cartoon character named ${name}, with big expressive eyes and friendly expression`;
  }
}

/**
 * Extract action specifically from the page text
 */
function extractPageSpecificAction(text: string, charName: string, species: string): string {
  // SPACE ACTIONS
  if (text.includes('stumbled upon') && text.includes('rocket')) {
    return `discovering a shiny rocket ship with amazed expression, eyes sparkling with excitement, reaching toward the rocket`;
  }
  if (text.includes('climbed aboard') || text.includes('put on') && text.includes('spacesuit')) {
    return `wearing a colorful spacesuit and helmet, climbing into rocket ship cockpit, excited expression`;
  }
  if (text.includes('blasted off') || text.includes('roar of engines') || text.includes('soared into')) {
    return `inside rocket ship cockpit, pressing buttons, looking out window at stars, thrilled expression`;
  }
  if (text.includes('traveled through the stars') || text.includes('earth get smaller')) {
    return `looking out rocket ship window in wonder, watching stars and planets pass by, amazed expression`;
  }
  if (text.includes('landed') && text.includes('moon')) {
    return `stepping out onto moon surface, looking around at grey dusty ground, curious excited expression`;
  }
  if (text.includes('stepped out onto') || text.includes('dusty') && text.includes('ground')) {
    return `standing on grey moon surface near landed rocket, looking around with wonder, space helmet on`;
  }
  if (text.includes('aliens') || text.includes('alien')) {
    return `meeting friendly cartoon aliens, surprised but happy expression, waving hello`;
  }
  if (text.includes('crater') && (text.includes('explored') || text.includes('exploring'))) {
    return `exploring moon craters, bouncing in low gravity, delighted curious expression`;
  }
  if (text.includes('flew') && text.includes('around')) {
    return `flying in rocket ship with new friends, looking out window joyfully`;
  }
  if (text.includes('waved goodbye') || text.includes('said goodbye')) {
    return `waving goodbye to alien friends, happy but slightly sad, warm smile`;
  }
  if (text.includes('headed home') || text.includes('back to earth')) {
    return `in rocket ship heading home, looking back at moon through window, peaceful happy expression`;
  }
  if (text.includes('landed safely') || text.includes('back in the savannah')) {
    return `standing next to landed rocket, back home, happy satisfied expression`;
  }
  if (text.includes('couldn\'t wait') && text.includes('next adventure')) {
    return `looking up at night sky full of stars, dreaming of more adventures, hopeful excited expression`;
  }

  // EMOTION-BASED ACTIONS
  if (text.includes('sparkled with excitement') || text.includes('eyes sparkled')) {
    return `eyes sparkling with pure excitement, huge smile, bouncing with anticipation`;
  }
  if (text.includes('surprised but happy') || text.includes('surprised')) {
    return `looking surprised with wide eyes and open mouth, then breaking into happy smile`;
  }
  if (text.includes('laughed') || text.includes('laughing')) {
    return `laughing joyfully, head tilted back, pure happiness`;
  }
  if (text.includes('hugged') || text.includes('hugging')) {
    return `hugging warmly, eyes closed with content smile`;
  }
  if (text.includes('proud') || text.includes('brave')) {
    return `standing tall and proud, confident happy expression`;
  }

  // DISCOVERY ACTIONS
  if (text.includes('discovered') || text.includes('found')) {
    return `discovering something amazing, wide excited eyes, pointing`;
  }
  if (text.includes('exploring') || text.includes('explore')) {
    return `exploring with curious expression, looking around in wonder`;
  }
  if (text.includes('looking around') || text.includes('looked around')) {
    return `looking around curiously, taking in all the sights`;
  }

  // MOVEMENT ACTIONS
  if (text.includes('bouncing') || text.includes('bounced')) {
    return `bouncing happily, weightless and joyful`;
  }
  if (text.includes('flying') || text.includes('flew')) {
    return `flying through the air, arms spread wide, exhilarated`;
  }
  if (text.includes('running') || text.includes('ran')) {
    return `running with joyful energy, happy expression`;
  }
  if (text.includes('walking') || text.includes('walked')) {
    return `walking with curious purpose, looking around`;
  }

  // Default based on text content
  if (text.includes('happy') || text.includes('joy')) {
    return `looking happy and content, warm friendly smile`;
  }

  return `in an engaging pose, expressive and friendly`;
}

/**
 * Extract page-specific elements like aliens, objects, etc.
 */
function extractPageElements(text: string): string {
  const elements: string[] = [];

  // ALIENS
  if (text.includes('aliens') || text.includes('alien')) {
    if (text.includes('big, round eyes') || text.includes('wiggly arms')) {
      elements.push('cute friendly cartoon aliens with big round eyes and long wiggly arms approaching');
    } else if (text.includes('small')) {
      elements.push('small cute friendly cartoon aliens nearby');
    } else {
      elements.push('friendly cartoon alien creatures');
    }
  }

  // ROCKET SHIP
  if (text.includes('rocket ship') || text.includes('rocket')) {
    if (text.includes('shiny') || text.includes('silver')) {
      elements.push('shiny silver rocket ship with big red button');
    } else if (text.includes('cockpit') || text.includes('inside')) {
      elements.push('colorful rocket ship cockpit with glowing buttons and big windows');
    } else {
      elements.push('colorful cartoon rocket ship');
    }
  }

  // SPACE ELEMENTS
  if (text.includes('stars') && text.includes('planet')) {
    elements.push('beautiful stars and colorful planets in background');
  } else if (text.includes('stars')) {
    elements.push('twinkling stars in background');
  }

  if (text.includes('earth') && (text.includes('smaller') || text.includes('view'))) {
    elements.push('Earth visible in distance as blue marble');
  }

  if (text.includes('asteroid')) {
    elements.push('sparkling asteroids floating nearby');
  }

  if (text.includes('crater')) {
    elements.push('large grey moon craters');
  }

  // MOON SURFACE
  if (text.includes('moon') && (text.includes('surface') || text.includes('dusty') || text.includes('ground'))) {
    elements.push('grey dusty moon surface');
  }

  // SAVANNAH
  if (text.includes('savannah')) {
    elements.push('African savannah with golden grass and acacia trees');
  }

  // FRIENDS/OTHERS
  if (text.includes('new friends') || text.includes('friends')) {
    elements.push('friendly companions nearby');
  }

  return elements.join(', ');
}

/**
 * Build environment from page text
 */
function buildEnvironment(text: string, fallbackSetting: string): string {
  // SPACE/ROCKET INTERIORS
  if (text.includes('inside') && (text.includes('rocket') || text.includes('cockpit'))) {
    return `inside colorful cartoon rocket ship cockpit, big round windows showing space, glowing control panel with buttons`;
  }

  if (text.includes('traveled through') && text.includes('stars')) {
    return `outer space background with swirling galaxies, colorful nebulas, twinkling stars, Earth visible in distance`;
  }

  // MOON SURFACE
  if (text.includes('moon') && (text.includes('surface') || text.includes('landed') || text.includes('stepped'))) {
    return `grey dusty moon surface with craters, black starry space sky, Earth visible in distance, rocket ship nearby`;
  }

  if (text.includes('crater') && (text.includes('moon') || text.includes('explore'))) {
    return `moon surface with large grey craters, dark space sky with stars, low gravity environment`;
  }

  // SPACE GENERAL
  if (text.includes('space') || text.includes('stars') || text.includes('galaxy')) {
    return `outer space with colorful nebulas, twinkling stars, floating asteroids, magical cosmic atmosphere`;
  }

  // SAVANNAH
  if (text.includes('savannah')) {
    return `African savannah landscape, golden grass, warm sunset colors, acacia trees in distance`;
  }

  // SKY
  if (text.includes('night sky') || text.includes('looking up') && text.includes('stars')) {
    return `beautiful night sky filled with bright stars, peaceful evening atmosphere`;
  }

  if (text.includes('sky') && text.includes('soared')) {
    return `bright blue sky with fluffy clouds, rocket trail behind`;
  }

  // HOME/LANDING
  if (text.includes('back home') || text.includes('back in')) {
    return `familiar home environment, warm welcoming atmosphere, sunset colors`;
  }

  // Use fallback with enhancement
  if (fallbackSetting && fallbackSetting !== 'Magical storybook scene') {
    return `${fallbackSetting}, warm inviting atmosphere`;
  }

  return `magical storybook setting, warm colors, soft lighting`;
}

/**
 * Extract mood from page text
 */
function extractMood(text: string): string {
  if (text.includes('excited') || text.includes('excitement') || text.includes('sparkled')) {
    return `Exciting adventurous atmosphere, dynamic energy.`;
  }
  if (text.includes('wonder') || text.includes('amazed') || text.includes('amazing')) {
    return `Magical wondrous atmosphere, sense of awe.`;
  }
  if (text.includes('happy') || text.includes('joy') || text.includes('joyful')) {
    return `Warm joyful atmosphere, happiness radiating.`;
  }
  if (text.includes('surprised')) {
    return `Surprising magical atmosphere, unexpected delight.`;
  }
  if (text.includes('proud') || text.includes('brave')) {
    return `Triumphant proud atmosphere, accomplishment.`;
  }
  if (text.includes('peaceful') || text.includes('gentle')) {
    return `Peaceful serene atmosphere, calm and safe.`;
  }
  if (text.includes('curious') || text.includes('exploring')) {
    return `Curious explorative atmosphere, discovery.`;
  }
  return `Warm friendly atmosphere, inviting and magical.`;
}

/**
 * ENHANCED NEGATIVE PROMPT - Much stronger human exclusion for animal stories
 */
export function renderNegativePrompt(card: PageSceneCard, isAnimal?: boolean): string {
  // Base quality negatives
  let negative = "text, watermark, logo, signature, photorealistic, realistic photo, photograph, ugly, deformed, disfigured, bad anatomy, bad proportions, extra limbs, mutated, blurry, low quality, artifacts, grainy, amateur";

  // CRITICAL: Strong human exclusion for animal stories
  if (isAnimal) {
    negative += ", human, person, human face, human body, human hands, human skin, boy, girl, child, kid, baby, man, woman, people, humanoid, human features, realistic human, cartoon human, human character";
  }

  // Environment-specific exclusions
  const setting = card.setting.toLowerCase();

  if (setting.includes('space') || setting.includes('moon') || setting.includes('rocket') || setting.includes('star')) {
    negative += ", forest, trees, grass, green plants, water, ocean, underwater, fish, beach";
  }

  if (setting.includes('underwater') || setting.includes('ocean') || setting.includes('coral')) {
    negative += ", forest, sky, clouds, space, stars, trees, land, desert";
  }

  if (setting.includes('savannah') || setting.includes('africa')) {
    negative += ", snow, ice, underwater, space, forest";
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
