import { CharacterBible } from "./visual-types";

/**
 * Character DNA from story generation input
 */
export interface CharacterDNA {
  name: string;
  age?: string;
  type: 'human' | 'animal' | 'object' | 'creature' | 'other';
  physical_form: string;
  material_or_texture: string;
  color_palette: string[];
  facial_features: string;
  accessories: string;
  personality_visuals: string;
  movement_style: string;
  unique_identifiers: string;
}

/**
 * Create a CHARACTER BIBLE from DNA
 * Generated ONCE per story and reused for every page
 */
export function createCharacterBible(dna: CharacterDNA, fallbackSpecies?: string): CharacterBible {
  const characterId = dna.name.toLowerCase().replace(/\s+/g, '_');
  const isAnimal = dna.type === 'animal';
  const isCreature = dna.type === 'creature';

  console.log(`[createCharacterBible] Processing DNA for: ${dna.name}`);
  console.log(`  - type: ${dna.type}`);
  console.log(`  - physical_form: ${dna.physical_form?.substring(0, 100) || 'N/A'}`);

  // Extract species for animals - try multiple sources
  let species: string | undefined = undefined;
  if (isAnimal) {
    // Try 1: Check physical_form (most reliable)
    species = extractSpecies(dna.physical_form);
    console.log(`  - extractSpecies(physical_form): ${species}`);

    // Try 2: If species is generic 'animal', check unique_identifiers
    if (species === 'animal' && dna.unique_identifiers) {
      const fromUnique = extractSpecies(dna.unique_identifiers);
      if (fromUnique !== 'animal') {
        species = fromUnique;
        console.log(`  - extractSpecies(unique_identifiers): ${species}`);
      }
    }

    // Try 3: If still generic, check the character name (e.g., "Riri the Rhino")
    if (species === 'animal' && dna.name) {
      const fromName = extractSpecies(dna.name);
      if (fromName !== 'animal') {
        species = fromName;
        console.log(`  - extractSpecies(name): ${species}`);
      }
    }

    // Try 4: Use fallback species if provided (from story text detection)
    if (species === 'animal' && fallbackSpecies) {
      species = fallbackSpecies;
      console.log(`  - Using fallback species: ${species}`);
    }
  }

  console.log(`  - FINAL species: ${species}`);

  // Build appearance details
  const skinTone = isAnimal ? extractFurColor(dna.color_palette, dna.material_or_texture) : extractSkinTone(dna.color_palette);
  const eyes = extractEyes(dna.facial_features);
  const hair = isAnimal ? extractFurDescription(dna.physical_form, dna.material_or_texture) : extractHair(dna.physical_form, dna.color_palette);
  const faceFeatures = extractFaceFeatures(dna.facial_features);
  const outfit = isAnimal ? (dna.accessories !== 'none' ? dna.accessories : '') : extractOutfit(dna.accessories);

  // Build visual fingerprint - KEY for SDXL consistency
  const visual_fingerprint: string[] = [];
  if (isAnimal && species) {
    visual_fingerprint.push(`cute cartoon ${species}`);
  }
  visual_fingerprint.push(skinTone);
  visual_fingerprint.push(eyes);
  if (faceFeatures) visual_fingerprint.push(faceFeatures);

  console.log(`[createCharacterBible] Created bible for ${dna.name}:`);
  console.log(`  - species: ${species}`);
  console.log(`  - visual_fingerprint: ${visual_fingerprint.join(', ')}`);

  return {
    character_id: characterId,
    name: dna.name,
    character_type: dna.type,
    species: species,  // "dog", "cat", "rhinoceros", etc.
    age: isAnimal ? "friendly" : (dna.age || "6 years old"),

    // NEW: Visual fingerprint for SDXL consistency
    visual_fingerprint,
    outfit,

    appearance: {
      skin_tone: skinTone,
      eyes,
      hair,
      face_features: faceFeatures,
    },
    signature_outfit: outfit,
    personality: extractPersonality(dna.personality_visuals),

    // NEW: Style object
    style: {
      base: "children's picture book illustration",
      render: ["clean lines", "vibrant colors", "soft shading"],
      aspect: "square",
    },

    art_style: {
      medium: "soft watercolor",
      genre: "premium children's picture book",
      mood: "warm, gentle, magical",
      line_detail: "clean, whimsical",
    },
    consistency_rules: [
      `${dna.name} must look identical across all pages.`,
      "Do not change appearance unless the story explicitly changes it.",
      "Maintain the same art style and mood throughout the book.",
    ],
  };
}

// Extract fur color for animals
function extractFurColor(colorPalette: string[], texture: string): string {
  const colors = colorPalette.join(' ').toLowerCase();
  if (colors.includes('golden') || colors.includes('yellow')) return 'golden fur';
  if (colors.includes('brown')) return 'brown fur';
  if (colors.includes('white')) return 'white fur';
  if (colors.includes('black')) return 'black fur';
  if (colors.includes('orange')) return 'orange fur';
  if (colors.includes('gray') || colors.includes('grey')) return 'gray fur';
  return 'soft fur';
}

// Extract fur description for animals
function extractFurDescription(physicalForm: string, texture: string): string {
  const form = physicalForm.toLowerCase();
  const tex = texture.toLowerCase();

  if (tex.includes('fluffy') || form.includes('fluffy')) return 'fluffy soft fur';
  if (tex.includes('smooth')) return 'smooth shiny coat';
  if (tex.includes('curly')) return 'curly soft fur';
  return 'soft fur';
}

// Extract species from physical form (dog, cat, rabbit, etc.)
// CRITICAL: Uses word boundaries to avoid matching "hen" in "then" or "when"
function extractSpecies(physicalForm: string): string {
  const form = physicalForm.toLowerCase();

  // PRIORITY ORDER: Check distinctive/larger animals FIRST
  // This prevents matching common words like "hen" before "rhinoceros"
  const PRIORITY_ANIMALS = [
    // LARGE DISTINCTIVE ANIMALS - CHECK FIRST!
    'rhinoceros', 'rhino',  // RHINO MUST BE FIRST
    'elephant', 'giraffe', 'hippopotamus', 'hippo',
    'dinosaur', 't-rex', 'triceratops', 'stegosaurus', 'brontosaurus', 'velociraptor', 'pterodactyl',
    'dragon', 'unicorn', 'phoenix', 'griffin', 'pegasus',
    'crocodile', 'alligator', 'komodo dragon',
    'gorilla', 'chimpanzee', 'orangutan',
    'lion', 'tiger', 'leopard', 'jaguar', 'cheetah', 'panther',
    'polar bear', 'bear', 'wolf', 'fox',
    'whale', 'dolphin', 'shark', 'octopus', 'squid',
    'kangaroo', 'koala', 'platypus',
    'zebra', 'horse', 'pony', 'donkey',
    'moose', 'elk', 'deer', 'reindeer', 'caribou',

    // MEDIUM ANIMALS
    'monkey', 'ape', 'baboon', 'lemur',
    'dog', 'puppy', 'cat', 'kitten',
    'rabbit', 'bunny', 'hare',
    'pig', 'piglet', 'cow', 'bull', 'calf',
    'sheep', 'lamb', 'goat',
    'turtle', 'tortoise', 'snake', 'python', 'cobra', 'lizard', 'gecko', 'iguana', 'chameleon',
    'seal', 'sea lion', 'walrus', 'otter', 'beaver',
    'raccoon', 'skunk', 'badger', 'wolverine', 'weasel',
    'squirrel', 'chipmunk', 'hamster', 'mouse', 'rat',
    'porcupine', 'hedgehog',
    'sloth', 'anteater', 'armadillo', 'capybara',
    'meerkat', 'mongoose', 'warthog',
    'llama', 'alpaca', 'camel',
    'panda', 'red panda',
    'frog', 'toad', 'salamander', 'newt', 'axolotl',

    // BIRDS - Put AFTER mammals to avoid false matches
    'eagle', 'hawk', 'falcon', 'owl', 'vulture', 'condor',
    'penguin', 'flamingo', 'peacock', 'swan', 'crane', 'heron', 'stork',
    'parrot', 'macaw', 'cockatoo', 'toucan',
    'crow', 'raven', 'magpie', 'jay', 'bluejay',
    'robin', 'sparrow', 'finch', 'cardinal', 'hummingbird', 'woodpecker',
    'duck', 'duckling', 'goose', 'gosling', 'turkey',
    'chicken', 'hen', 'rooster', 'chick',  // FARM BIRDS LAST
    'bird',  // Generic bird last

    // INSECTS & BUGS
    'butterfly', 'moth', 'bee', 'bumblebee', 'wasp', 'hornet',
    'dragonfly', 'firefly', 'ladybug', 'beetle',
    'ant', 'spider', 'scorpion', 'caterpillar',
    'grasshopper', 'cricket', 'mantis',

    // OCEAN CREATURES
    'fish', 'salmon', 'clownfish', 'seahorse',
    'jellyfish', 'starfish', 'crab', 'lobster', 'shrimp',
    'snail', 'slug',

    // MYTHICAL
    'mermaid', 'fairy', 'pixie', 'elf', 'gnome', 'troll',
    'yeti', 'bigfoot', 'kraken',
  ];

  // Use WORD BOUNDARY matching to avoid matching "hen" in "then" or "when"
  for (const animal of PRIORITY_ANIMALS) {
    // Create regex with word boundaries
    const regex = new RegExp(`\\b${animal}\\b`, 'i');
    if (regex.test(form)) {
      console.log(`[extractSpecies] Found "${animal}" in physical_form: "${form.substring(0, 100)}..."`);
      return animal;
    }
  }

  console.log(`[extractSpecies] No species found in: "${form.substring(0, 100)}..."`);
  return 'animal'; // fallback
}

/**
 * Create a simple Character Bible from just name and basic info (fallback)
 */
export function createSimpleBible(
  name: string,
  characterType: 'human' | 'animal' | 'object' | 'creature' | 'other' = 'human',
  species?: string,  // For animals: "dog", "cat", "rhinoceros", etc.
  furOrSkin: string = "warm brown",
  hairOrFur: string = "black curly hair"
): CharacterBible {
  const isAnimal = characterType === 'animal';
  const actualSpecies = isAnimal ? (species || 'animal') : undefined;
  const skinTone = isAnimal ? `${furOrSkin} fur` : `${furOrSkin} skin`;

  // Build visual fingerprint
  const visual_fingerprint: string[] = [];
  if (isAnimal && actualSpecies && actualSpecies !== 'animal') {
    visual_fingerprint.push(`cute cartoon ${actualSpecies}`);
  }
  visual_fingerprint.push(skinTone);
  visual_fingerprint.push("big expressive eyes");
  visual_fingerprint.push("friendly smile");

  console.log(`[createSimpleBible] Created bible for ${name}:`);
  console.log(`  - species: ${actualSpecies}`);
  console.log(`  - visual_fingerprint: ${visual_fingerprint.join(', ')}`);

  return {
    character_id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    character_type: characterType,
    species: actualSpecies,
    age: isAnimal ? "friendly" : "6 years old",

    // NEW: Visual fingerprint for SDXL consistency
    visual_fingerprint,
    outfit: isAnimal ? "" : "colorful casual clothes",

    appearance: {
      skin_tone: skinTone,
      eyes: "big expressive eyes",
      hair: hairOrFur,
      face_features: "friendly smile, cute face",
    },
    signature_outfit: isAnimal ? "" : "colorful casual clothes",
    personality: ["curious", "joyful", "brave"],

    // NEW: Style object
    style: {
      base: "children's picture book illustration",
      render: ["clean lines", "vibrant colors", "soft shading"],
      aspect: "square",
    },

    art_style: {
      medium: "soft watercolor",
      genre: "premium children's picture book",
      mood: "warm, gentle, magical",
      line_detail: "clean, whimsical",
    },
    consistency_rules: [
      `${name} must look identical across all pages.`,
      "Do not change appearance unless the story explicitly changes it.",
      "Maintain the same art style and mood throughout the book.",
    ],
  };
}

// Helper functions

function extractSkinTone(colorPalette: string[]): string {
  const colors = colorPalette.join(' ').toLowerCase();
  if (colors.includes('dark brown') || colors.includes('deep brown')) return 'deep brown skin';
  if (colors.includes('brown') || colors.includes('warm')) return 'warm brown skin';
  if (colors.includes('tan') || colors.includes('olive')) return 'olive tan skin';
  if (colors.includes('peach') || colors.includes('rosy') || colors.includes('pink')) return 'light peachy skin';
  if (colors.includes('pale') || colors.includes('fair')) return 'fair skin';
  return 'warm brown skin';
}

function extractEyes(facialFeatures: string): string {
  const features = facialFeatures.toLowerCase();
  let eyeColor = 'brown';
  if (features.includes('blue eye')) eyeColor = 'blue';
  else if (features.includes('green eye')) eyeColor = 'green';
  else if (features.includes('hazel')) eyeColor = 'hazel';

  return `big expressive ${eyeColor} eyes`;
}

function extractHair(physicalForm: string, colorPalette: string[]): string {
  const form = physicalForm.toLowerCase();
  const colors = colorPalette.join(' ').toLowerCase();

  // Hair style
  let hairStyle = 'soft';
  if (form.includes('curly') || form.includes('afro') || form.includes('coily')) hairStyle = 'curly';
  else if (form.includes('straight')) hairStyle = 'straight';
  else if (form.includes('wavy')) hairStyle = 'wavy';
  else if (form.includes('braided') || form.includes('braid')) hairStyle = 'braided';

  // Hair length
  let hairLength = '';
  if (form.includes('long')) hairLength = 'long ';
  else if (form.includes('short')) hairLength = 'short ';

  // Hair color
  let hairColor = 'black';
  if (colors.includes('blonde') || colors.includes('golden')) hairColor = 'golden blonde';
  else if (colors.includes('red') || colors.includes('ginger')) hairColor = 'red';
  else if (colors.includes('brown')) hairColor = 'brown';
  else if (colors.includes('black')) hairColor = 'black';

  return `${hairLength}${hairColor} ${hairStyle} hair`;
}

function extractFaceFeatures(facialFeatures: string): string {
  const features = facialFeatures.toLowerCase();
  const parts: string[] = [];

  if (features.includes('freckle')) parts.push('cute freckles');
  if (features.includes('dimple')) parts.push('sweet dimples');
  if (features.includes('round')) parts.push('round cheeks');
  else parts.push('soft cheeks');

  parts.push('friendly smile');

  return parts.join(', ');
}

function extractOutfit(accessories: string): string {
  if (!accessories || accessories === 'none' || accessories === '') {
    return 'colorful casual clothes';
  }
  return accessories;
}

function extractPersonality(personalityVisuals: string): string[] {
  const visuals = personalityVisuals.toLowerCase();
  const traits: string[] = [];

  if (visuals.includes('curious') || visuals.includes('wonder')) traits.push('curious');
  if (visuals.includes('brave') || visuals.includes('courageous')) traits.push('brave');
  if (visuals.includes('happy') || visuals.includes('joyful') || visuals.includes('cheerful')) traits.push('joyful');
  if (visuals.includes('kind') || visuals.includes('gentle')) traits.push('kind');
  if (visuals.includes('adventur')) traits.push('adventurous');

  // Default traits if none found
  if (traits.length === 0) {
    return ['curious', 'joyful', 'brave'];
  }

  return traits.slice(0, 3);
}
