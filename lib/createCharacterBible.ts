import { CharacterBible, AnimalAppearance, HumanAppearance } from "./visual-types";

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
 * ANIMAL-SPECIFIC BODY FEATURES BY SPECIES
 * Prevents human attributes (skin_tone, hair) from leaking into animal characters
 */
const ANIMAL_FEATURES: Record<string, Partial<AnimalAppearance>> = {
  // Large mammals with rough/leathery skin
  'rhinoceros': { skin_texture: 'rough gray leathery skin', body_shape: 'large sturdy body with thick legs', horn: 'small curved horn on nose', ears: 'small rounded ears', tail: 'short thin tail' },
  'rhino': { skin_texture: 'rough gray leathery skin', body_shape: 'large sturdy body with thick legs', horn: 'small curved horn on nose', ears: 'small rounded ears', tail: 'short thin tail' },
  'elephant': { skin_texture: 'wrinkly gray thick skin', body_shape: 'massive round body', ears: 'huge floppy ears', tail: 'thin tail with tuft' },
  'hippo': { skin_texture: 'smooth grayish-pink thick skin', body_shape: 'barrel-shaped body', ears: 'small rounded ears', tail: 'short stubby tail' },
  'hippopotamus': { skin_texture: 'smooth grayish-pink thick skin', body_shape: 'barrel-shaped body', ears: 'small rounded ears', tail: 'short stubby tail' },

  // Furry mammals
  'dog': { skin_texture: 'soft fluffy fur', body_shape: 'friendly four-legged body', ears: 'floppy soft ears', tail: 'wagging tail' },
  'puppy': { skin_texture: 'soft fluffy puppy fur', body_shape: 'small cute four-legged body', ears: 'floppy puppy ears', tail: 'tiny wagging tail' },
  'cat': { skin_texture: 'soft sleek fur', body_shape: 'graceful four-legged body', ears: 'pointed triangular ears', tail: 'long fluffy tail' },
  'kitten': { skin_texture: 'soft fuzzy kitten fur', body_shape: 'tiny cute four-legged body', ears: 'small pointed ears', tail: 'tiny fluffy tail' },
  'rabbit': { skin_texture: 'soft fluffy fur', body_shape: 'round compact body', ears: 'long upright ears', tail: 'fluffy cotton ball tail' },
  'bunny': { skin_texture: 'soft fluffy fur', body_shape: 'round compact body', ears: 'long upright ears', tail: 'fluffy cotton ball tail' },
  'bear': { skin_texture: 'thick shaggy fur', body_shape: 'large round body', ears: 'small rounded ears', tail: 'short stubby tail' },
  'fox': { skin_texture: 'soft fluffy fur', body_shape: 'slender agile body', ears: 'large pointed ears', tail: 'big bushy tail' },
  'wolf': { skin_texture: 'thick wild fur', body_shape: 'strong muscular body', ears: 'pointed alert ears', tail: 'long bushy tail' },
  'lion': { skin_texture: 'short golden fur', body_shape: 'powerful muscular body', ears: 'rounded ears', tail: 'long tail with tuft' },
  'tiger': { skin_texture: 'short striped fur', body_shape: 'powerful muscular body', ears: 'rounded ears', markings: 'black stripes', tail: 'long striped tail' },
  'monkey': { skin_texture: 'short brown fur', body_shape: 'agile climbing body', ears: 'rounded ears', tail: 'long curly tail' },
  'panda': { skin_texture: 'fluffy black and white fur', body_shape: 'round chubby body', ears: 'round black ears', markings: 'black patches around eyes' },
  'koala': { skin_texture: 'fuzzy gray fur', body_shape: 'round compact body', ears: 'big fluffy round ears', tail: 'no visible tail' },
  'squirrel': { skin_texture: 'soft fluffy fur', body_shape: 'small nimble body', ears: 'tiny pointed ears', tail: 'big bushy tail' },
  'mouse': { skin_texture: 'soft short fur', body_shape: 'tiny round body', ears: 'big round ears', tail: 'long thin tail' },
  'hedgehog': { skin_texture: 'spiky quills on back soft belly', body_shape: 'small round body', ears: 'tiny rounded ears', tail: 'tiny stubby tail' },

  // Marine animals
  'dolphin': { skin_texture: 'smooth gray rubbery skin', body_shape: 'sleek streamlined body', tail: 'horizontal tail flukes' },
  'whale': { skin_texture: 'smooth dark rubbery skin', body_shape: 'massive streamlined body', tail: 'huge horizontal tail flukes' },
  'seal': { skin_texture: 'smooth spotted fur', body_shape: 'plump torpedo-shaped body', tail: 'flipper tail' },
  'penguin': { skin_texture: 'smooth waterproof feathers', body_shape: 'round upright body', markings: 'black back white belly', tail: 'short stubby tail' },
  'fish': { skin_texture: 'shiny colorful scales', body_shape: 'streamlined swimming body', tail: 'fan-shaped tail fin' },
  'shark': { skin_texture: 'rough gray skin', body_shape: 'powerful streamlined body', tail: 'tall tail fin' },
  'octopus': { skin_texture: 'soft squishy skin', body_shape: 'round head with eight tentacles' },
  'turtle': { skin_texture: 'hard patterned shell', body_shape: 'round shelled body', tail: 'tiny stubby tail' },
  'frog': { skin_texture: 'smooth moist green skin', body_shape: 'small squat body with long legs' },

  // Birds
  'owl': { skin_texture: 'soft fluffy feathers', body_shape: 'round feathered body', ears: 'feather tufts that look like ears', tail: 'short tail feathers' },
  'eagle': { skin_texture: 'majestic brown feathers', body_shape: 'powerful feathered body', tail: 'broad tail feathers' },
  'parrot': { skin_texture: 'colorful smooth feathers', body_shape: 'medium feathered body', tail: 'long colorful tail feathers' },
  'duck': { skin_texture: 'smooth waterproof feathers', body_shape: 'plump feathered body', tail: 'short curly tail feathers' },
  'chicken': { skin_texture: 'fluffy feathers', body_shape: 'round feathered body', tail: 'short tail feathers' },

  // Reptiles
  'snake': { skin_texture: 'smooth colorful scales', body_shape: 'long slithering body' },
  'lizard': { skin_texture: 'bumpy scaly skin', body_shape: 'small four-legged body with long tail', tail: 'long thin tail' },
  'crocodile': { skin_texture: 'rough bumpy scales', body_shape: 'long armored body', tail: 'powerful muscular tail' },
  'dragon': { skin_texture: 'shiny colorful scales', body_shape: 'powerful winged body', tail: 'long spiky tail' },

  // Insects
  'butterfly': { skin_texture: 'delicate colorful wings', body_shape: 'tiny body with large wings' },
  'bee': { skin_texture: 'fuzzy striped body', body_shape: 'small round body with wings', markings: 'yellow and black stripes' },
  'ladybug': { skin_texture: 'shiny spotted shell', body_shape: 'tiny round body', markings: 'red with black spots' },

  // Fantasy
  'unicorn': { skin_texture: 'soft shimmering fur', body_shape: 'graceful horse-like body', horn: 'spiraling magical horn', tail: 'flowing magical tail' },
};

/**
 * Create a CHARACTER BIBLE from DNA
 * Generated ONCE per story and reused for every page
 *
 * CRITICAL: If character is an animal, do NOT output hair or skin_tone
 * Use body_color, skin_texture, horn, etc. instead
 */
export function createCharacterBible(dna: CharacterDNA): CharacterBible {
  const characterId = dna.name.toLowerCase().replace(/\s+/g, '_');
  const isAnimal = dna.type === 'animal';
  const isCreature = dna.type === 'creature';

  // Extract species for animals (dog, cat, rabbit, rhinoceros, etc.)
  const species = (isAnimal || isCreature) ? extractSpecies(dna.physical_form) : undefined;

  if (isAnimal || isCreature) {
    // ANIMAL CHARACTER - use animal-specific appearance
    return {
      character_id: characterId,
      name: dna.name,
      character_type: dna.type,
      species: species,
      age: "young",  // Don't use human age for animals
      is_human: false,
      appearance: createAnimalAppearance(species || 'animal', dna),
      signature_outfit: dna.accessories !== 'none' ? dna.accessories : '',
      personality: extractPersonality(dna.personality_visuals),
      art_style: {
        medium: "soft watercolor",
        genre: "premium children's picture book",
        mood: "warm, gentle, magical",
        line_detail: "clean, whimsical",
      },
      consistency_rules: [
        `${dna.name} is a ${species || 'animal'} - NOT a human.`,
        `${dna.name} must look identical across all pages.`,
        "Do not change appearance unless the story explicitly changes it.",
        "Maintain the same art style and mood throughout the book.",
      ],
    };
  }

  // HUMAN CHARACTER - use human appearance
  return {
    character_id: characterId,
    name: dna.name,
    character_type: 'human',
    species: undefined,
    age: dna.age || "6 years old",
    is_human: true,
    appearance: createHumanAppearance(dna),
    signature_outfit: extractOutfit(dna.accessories),
    personality: extractPersonality(dna.personality_visuals),
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

/**
 * Create ANIMAL appearance - NO human attributes like hair or skin_tone
 */
function createAnimalAppearance(species: string, dna: CharacterDNA): AnimalAppearance {
  const lowerSpecies = species.toLowerCase();
  const defaults = ANIMAL_FEATURES[lowerSpecies] || {};

  // Extract body color from DNA color palette
  const bodyColor = extractBodyColor(dna.color_palette, dna.material_or_texture);

  return {
    body_color: bodyColor,
    skin_texture: defaults.skin_texture || extractSkinTexture(dna.material_or_texture, lowerSpecies),
    eyes: extractAnimalEyes(dna.facial_features),
    horn: defaults.horn,
    ears: defaults.ears || 'small ears',
    markings: defaults.markings || extractMarkings(dna.unique_identifiers),
    body_shape: defaults.body_shape || 'cute cartoon body',
    tail: defaults.tail,
  };
}

/**
 * Create HUMAN appearance
 */
function createHumanAppearance(dna: CharacterDNA): HumanAppearance {
  return {
    skin_tone: extractSkinTone(dna.color_palette),
    eyes: extractHumanEyes(dna.facial_features),
    hair: extractHair(dna.physical_form, dna.color_palette),
    face_features: extractFaceFeatures(dna.facial_features),
  };
}

/**
 * Extract body color for animals (NOT skin_tone)
 */
function extractBodyColor(colorPalette: string[], texture: string): string {
  const colors = colorPalette.join(' ').toLowerCase();

  if (colors.includes('gray') || colors.includes('grey')) return 'gray';
  if (colors.includes('golden') || colors.includes('yellow')) return 'golden';
  if (colors.includes('brown')) return 'brown';
  if (colors.includes('white')) return 'white';
  if (colors.includes('black')) return 'black';
  if (colors.includes('orange')) return 'orange';
  if (colors.includes('pink')) return 'pink';
  if (colors.includes('blue')) return 'blue';
  if (colors.includes('green')) return 'green';
  if (colors.includes('red')) return 'red';

  return 'gray'; // Default for many animals
}

/**
 * Extract skin texture based on species type
 */
function extractSkinTexture(texture: string, species: string): string {
  const tex = texture.toLowerCase();

  // Leathery animals
  if (['rhino', 'rhinoceros', 'elephant', 'hippo', 'hippopotamus'].includes(species)) {
    return 'rough leathery skin';
  }

  // Furry animals
  if (tex.includes('fluffy') || tex.includes('fur')) return 'soft fluffy fur';
  if (tex.includes('smooth')) return 'smooth skin';
  if (tex.includes('scaly') || tex.includes('scales')) return 'shiny scales';
  if (tex.includes('feather')) return 'soft feathers';

  return 'soft fur'; // Default
}

/**
 * Extract eyes for animals
 */
function extractAnimalEyes(facialFeatures: string): string {
  const features = facialFeatures.toLowerCase();

  let eyeColor = 'brown';
  if (features.includes('blue eye')) eyeColor = 'blue';
  else if (features.includes('green eye')) eyeColor = 'green';
  else if (features.includes('golden eye')) eyeColor = 'golden';
  else if (features.includes('black eye')) eyeColor = 'black';

  return `big friendly ${eyeColor} eyes`;
}

/**
 * Extract eyes for humans
 */
function extractHumanEyes(facialFeatures: string): string {
  const features = facialFeatures.toLowerCase();
  let eyeColor = 'brown';
  if (features.includes('blue eye')) eyeColor = 'blue';
  else if (features.includes('green eye')) eyeColor = 'green';
  else if (features.includes('hazel')) eyeColor = 'hazel';

  return `big expressive ${eyeColor} eyes`;
}

/**
 * Extract any unique markings
 */
function extractMarkings(uniqueIdentifiers: string): string | undefined {
  if (!uniqueIdentifiers || uniqueIdentifiers === 'none') return undefined;
  return uniqueIdentifiers;
}

// Extract species from physical form (comprehensive list)
function extractSpecies(physicalForm: string): string {
  const form = physicalForm.toLowerCase();

  const animals = [
    // Large mammals (check longer names first)
    'rhinoceros', 'hippopotamus', 'elephant', 'giraffe',
    // Then shorter versions
    'rhino', 'hippo',
    // Pets & Domestic
    'dog', 'puppy', 'cat', 'kitten', 'hamster', 'guinea pig', 'rabbit', 'bunny',
    'parrot', 'goldfish', 'turtle', 'tortoise', 'snake', 'lizard', 'gecko',
    // Farm
    'horse', 'pony', 'donkey', 'cow', 'pig', 'sheep', 'goat', 'chicken', 'duck', 'goose',
    // Forest
    'fox', 'wolf', 'bear', 'deer', 'squirrel', 'raccoon', 'beaver', 'hedgehog', 'mouse', 'owl',
    // Jungle
    'lion', 'tiger', 'leopard', 'monkey', 'gorilla', 'sloth', 'toucan', 'crocodile',
    // African
    'zebra', 'cheetah', 'hyena', 'meerkat', 'ostrich', 'flamingo',
    // Australian
    'kangaroo', 'koala', 'platypus', 'emu',
    // Arctic
    'polar bear', 'penguin', 'seal', 'walrus', 'arctic fox',
    // Ocean
    'whale', 'dolphin', 'shark', 'octopus', 'jellyfish', 'seahorse', 'crab', 'fish',
    // Birds
    'eagle', 'hawk', 'falcon', 'crow', 'robin', 'hummingbird', 'peacock', 'swan',
    // Reptiles & Amphibians
    'frog', 'toad', 'salamander', 'chameleon',
    // Insects
    'butterfly', 'bee', 'ladybug', 'dragonfly', 'ant', 'caterpillar',
    // Fantasy
    'dragon', 'unicorn', 'phoenix', 'griffin', 'dinosaur',
    // Other
    'panda', 'red panda', 'bat',
  ];

  for (const animal of animals) {
    if (form.includes(animal)) {
      return animal;
    }
  }

  return 'animal'; // fallback
}

/**
 * Create a simple Character Bible from just name and basic info (fallback)
 */
export function createSimpleBible(
  name: string,
  characterType: 'human' | 'animal' | 'object' | 'creature' | 'other' = 'human',
  species?: string,
  bodyColor: string = "gray",
): CharacterBible {
  const isAnimal = characterType === 'animal' || characterType === 'creature';

  if (isAnimal) {
    const speciesLower = (species || 'animal').toLowerCase();
    const defaults = ANIMAL_FEATURES[speciesLower] || {};

    return {
      character_id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      character_type: characterType,
      species: species || 'animal',
      age: "young",
      is_human: false,
      appearance: {
        body_color: bodyColor,
        skin_texture: defaults.skin_texture || 'soft fur',
        eyes: "big friendly eyes",
        horn: defaults.horn,
        ears: defaults.ears,
        markings: defaults.markings,
        body_shape: defaults.body_shape || 'cute cartoon body',
        tail: defaults.tail,
      } as AnimalAppearance,
      signature_outfit: "",
      personality: ["curious", "joyful", "brave"],
      art_style: {
        medium: "soft watercolor",
        genre: "premium children's picture book",
        mood: "warm, gentle, magical",
        line_detail: "clean, whimsical",
      },
      consistency_rules: [
        `${name} is a ${species || 'animal'} - NOT a human.`,
        `${name} must look identical across all pages.`,
        "Maintain the same art style and mood throughout the book.",
      ],
    };
  }

  // Human character
  return {
    character_id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    character_type: 'human',
    species: undefined,
    age: "6 years old",
    is_human: true,
    appearance: {
      skin_tone: "warm brown skin",
      eyes: "big expressive eyes",
      hair: "curly black hair",
      face_features: "friendly smile, cute face",
    } as HumanAppearance,
    signature_outfit: "colorful casual clothes",
    personality: ["curious", "joyful", "brave"],
    art_style: {
      medium: "soft watercolor",
      genre: "premium children's picture book",
      mood: "warm, gentle, magical",
      line_detail: "clean, whimsimal",
    },
    consistency_rules: [
      `${name} must look identical across all pages.`,
      "Maintain the same art style and mood throughout the book.",
    ],
  };
}

// Helper functions for human appearance
function extractSkinTone(colorPalette: string[]): string {
  const colors = colorPalette.join(' ').toLowerCase();
  if (colors.includes('dark brown') || colors.includes('deep brown')) return 'deep brown skin';
  if (colors.includes('brown') || colors.includes('warm')) return 'warm brown skin';
  if (colors.includes('tan') || colors.includes('olive')) return 'olive tan skin';
  if (colors.includes('peach') || colors.includes('rosy') || colors.includes('pink')) return 'light peachy skin';
  if (colors.includes('pale') || colors.includes('fair')) return 'fair skin';
  return 'warm brown skin';
}

function extractHair(physicalForm: string, colorPalette: string[]): string {
  const form = physicalForm.toLowerCase();
  const colors = colorPalette.join(' ').toLowerCase();

  let hairStyle = 'soft';
  if (form.includes('curly') || form.includes('afro') || form.includes('coily')) hairStyle = 'curly';
  else if (form.includes('straight')) hairStyle = 'straight';
  else if (form.includes('wavy')) hairStyle = 'wavy';
  else if (form.includes('braided') || form.includes('braid')) hairStyle = 'braided';

  let hairLength = '';
  if (form.includes('long')) hairLength = 'long ';
  else if (form.includes('short')) hairLength = 'short ';

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

  if (traits.length === 0) {
    return ['curious', 'joyful', 'brave'];
  }

  return traits.slice(0, 3);
}
