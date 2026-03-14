import { CharacterBible } from "./visual-types";

/**
 * Character DNA from story generation input
 */
export interface CharacterDNA {
  name: string;
  age?: string;
  gender?: 'girl' | 'boy' | 'female' | 'male';  // Explicit gender from GPT
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
export function createCharacterBible(dna: CharacterDNA, fallbackSpecies?: string, originalPrompt?: string): CharacterBible {
  const characterId = dna.name.toLowerCase().replace(/\s+/g, '_');

  // GPT sometimes returns the actual species name as the type (e.g., "dog" instead of "animal").
  // Normalize: if type matches a known animal species, treat it as 'animal' and use the type as species hint.
  const KNOWN_ANIMAL_TYPES = new Set([
    'dog', 'puppy', 'cat', 'kitten', 'rabbit', 'bunny', 'bear', 'fox', 'owl', 'bird',
    'lion', 'tiger', 'elephant', 'giraffe', 'monkey', 'panda', 'penguin', 'dolphin',
    'whale', 'turtle', 'frog', 'deer', 'horse', 'pony', 'zebra', 'hippo', 'rhino',
    'rhinoceros', 'koala', 'kangaroo', 'wolf', 'shark', 'octopus', 'butterfly',
    'dragon', 'unicorn', 'dinosaur', 'mouse', 'rat', 'hamster', 'squirrel',
    'duck', 'duckling', 'goose', 'chicken', 'hen', 'pig', 'piglet', 'cow', 'sheep', 'lamb', 'goat',
    'camel', 'llama', 'alpaca', 'sloth', 'raccoon', 'hedgehog', 'bee', 'ladybug',
    'caterpillar', 'fish', 'seahorse', 'crab', 'snail', 'parrot', 'flamingo', 'peacock', 'swan',
  ]);
  const typeSpeciesHint = KNOWN_ANIMAL_TYPES.has(dna.type?.toLowerCase()) ? dna.type.toLowerCase() : null;
  const isAnimal = dna.type === 'animal' || typeSpeciesHint !== null;
  const isCreature = dna.type === 'creature';

  console.log(`[createCharacterBible] Processing DNA for: ${dna.name}`);
  console.log(`  - type: ${dna.type}`);
  console.log(`  - physical_form: ${dna.physical_form?.substring(0, 100) || 'N/A'}`);

  // Extract species for animals - try multiple sources
  let species: string | undefined = undefined;
  if (isAnimal) {
    // Try 0: If GPT put the species directly in the type field (e.g., type: "dog")
    if (typeSpeciesHint) {
      species = typeSpeciesHint;
      console.log(`  - species from type field: ${species}`);
    }

    // Try 1: Check physical_form (most reliable — may give a more specific species)
    const fromForm = extractSpecies(dna.physical_form);
    console.log(`  - extractSpecies(physical_form): ${fromForm}`);
    if (fromForm !== 'animal') {
      species = fromForm;
    } else if (!species) {
      // Keep 'animal' as a placeholder so the fallback chain continues
      species = 'animal';
    }

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

  // Sanitize physical_form for child characters — remove adult body descriptors
  // GPT sometimes says "tall, with wavy hair" which makes the character look adult
  if (!isAnimal && !isCreature) {
    dna.physical_form = sanitizeChildPhysicalForm(dna.physical_form);
    dna.accessories = sanitizeChildOutfit(dna.accessories);
  }

  // Build appearance details
  // Pass originalPrompt so extractSkinTone can use the child's ethnicity description as fallback
  const skinTone = isAnimal ? extractFurColor(dna.color_palette, dna.material_or_texture) : extractSkinTone(dna.color_palette, originalPrompt);
  const eyes = extractEyes(dna.facial_features);

  // For hair: if the original prompt has an explicit hair description, use it as fallback
  // E.g., child says "short brown hair with bangs" but GPT's DNA physical_form doesn't include it
  let enrichedPhysicalForm = dna.physical_form || '';
  if (originalPrompt && !isAnimal) {
    const promptLower = originalPrompt.toLowerCase();
    const hairMatch = promptLower.match(/\b((?:short|long|medium|curly|straight|wavy|braided|black|brown|blonde|red|dark|light)\s+(?:\w+\s+)*?hair(?:\s+with\s+bangs)?)\b/i);
    if (hairMatch && !enrichedPhysicalForm.toLowerCase().includes('hair')) {
      enrichedPhysicalForm += `, ${hairMatch[1]}`;
      console.log(`[createCharacterBible] Enriched physical_form with hair from prompt: "${hairMatch[1]}"`);
    }
  }
  const hair = isAnimal ? extractFurDescription(dna.physical_form, dna.material_or_texture) : extractHair(enrichedPhysicalForm, dna.color_palette);
  const faceFeatures = extractFaceFeatures(dna.facial_features);
  const outfit = isAnimal ? (dna.accessories !== 'none' ? dna.accessories : '') : extractOutfit(dna.accessories);

  // Extract identity-defining accessories (glasses, hats, bows, etc.)
  // These are distinct from outfit — they affect character identity and must appear in every image.
  const accessoryList = extractAccessories(dna.physical_form || '', dna.accessories || '', dna.facial_features || '');
  const accessories = accessoryList.length > 0 ? accessoryList.join(', ') : '';
  if (accessories) {
    console.log(`  - accessories (identity-defining): ${accessories}`);
  }

  // Build visual fingerprint - KEY for SDXL consistency
  const visual_fingerprint: string[] = [];
  if (isAnimal && species) {
    visual_fingerprint.push(`cartoon ${species}`);
  }
  visual_fingerprint.push(skinTone);
  // NOTE: Eyes deliberately NOT pushed into visual_fingerprint.
  // "big expressive eyes" caused Flux to create oversized anime eyes.
  // Eye color is stored in appearance.eyes for metadata only.
  if (faceFeatures) visual_fingerprint.push(faceFeatures);
  // Add identity-defining accessories (glasses, hats, etc.) to fingerprint
  // so they're included in every image prompt
  if (accessories) visual_fingerprint.push(accessories);

  console.log(`[createCharacterBible] Created bible for ${dna.name}:`);
  console.log(`  - species: ${species}`);
  console.log(`  - visual_fingerprint: ${visual_fingerprint.join(', ')}`);

  // Determine gender for human characters
  const gender = (!isAnimal && !isCreature) ? extractGender(dna) : undefined;
  console.log(`  - gender: ${gender || 'N/A (animal/creature)'}`);

  // Detect ethnicity from original prompt for facial feature rendering
  let ethnicity: string | undefined;
  if (!isAnimal && !isCreature && originalPrompt) {
    const pl = originalPrompt.toLowerCase();
    if (/\b(?:east\s+asian|chinese|japanese|korean|vietnamese|thai|filipino|filipina|taiwanese|cambodian|laotian|burmese|hmong)\b/i.test(pl)) ethnicity = 'east_asian';
    else if (/\b(?:south\s+asian|indian|pakistani|bangladeshi|sri\s+lankan|desi|nepali)\b/i.test(pl)) ethnicity = 'south_asian';
    else if (/\b(?:african|black\s+(?:girl|boy|child|kid)|nigerian|ethiopian|kenyan|ghanaian|somali)\b/i.test(pl)) ethnicity = 'african';
    else if (/\b(?:middle\s+eastern|arab|persian|turkish|kurdish|iraqi|syrian|lebanese|egyptian|moroccan)\b/i.test(pl)) ethnicity = 'middle_eastern';
    else if (/\b(?:latino|latina|hispanic|mexican|brazilian|colombian|peruvian|cuban|puerto\s+rican|dominican)\b/i.test(pl)) ethnicity = 'latino';
    else if (/\b(?:indigenous|native\s+american|first\s+nations|aboriginal)\b/i.test(pl)) ethnicity = 'indigenous';
    if (ethnicity) console.log(`  - ethnicity detected from prompt: ${ethnicity}`);
  }

  return {
    character_id: characterId,
    name: dna.name,
    character_type: isAnimal ? 'animal' : dna.type,  // Normalize: "dog" → "animal" (species field holds the specific animal)
    gender,  // "girl" or "boy" for human characters
    ethnicity,  // Ethnicity for facial feature cues in image generation
    species: species,  // "dog", "cat", "rhinoceros", etc.
    age: isAnimal ? "friendly" : extractAge(dna),

    // NEW: Visual fingerprint for SDXL consistency
    visual_fingerprint,
    outfit,
    accessories,  // Identity-defining accessories (glasses, hats, bows, etc.)

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
      medium: "2D cartoon",
      genre: "children's book illustration",
      mood: "warm, bright, cheerful",
      line_detail: "bold black outlines, flat bright colors",
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
  furOrSkin: string = "light warm",
  hairOrFur: string = "black curly hair"
): CharacterBible {
  const isAnimal = characterType === 'animal';
  const actualSpecies = isAnimal ? (species || 'animal') : undefined;
  const skinTone = isAnimal ? `${furOrSkin} fur` : `${furOrSkin} skin`;

  // Build visual fingerprint
  const visual_fingerprint: string[] = [];
  if (isAnimal && actualSpecies && actualSpecies !== 'animal') {
    visual_fingerprint.push(`cartoon ${actualSpecies}`);
  }
  visual_fingerprint.push(skinTone);
  visual_fingerprint.push("friendly smile");

  console.log(`[createSimpleBible] Created bible for ${name}:`);
  console.log(`  - species: ${actualSpecies}`);
  console.log(`  - visual_fingerprint: ${visual_fingerprint.join(', ')}`);

  return {
    character_id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    character_type: characterType,
    species: actualSpecies,
    age: isAnimal ? "friendly" : "6 years old", // createSimpleBible doesn't have DNA to parse

    // NEW: Visual fingerprint for SDXL consistency
    visual_fingerprint,
    outfit: isAnimal ? "" : "colorful casual clothes",

    appearance: {
      skin_tone: skinTone,
      eyes: "round brown eyes",
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
      medium: "2D cartoon",
      genre: "children's book illustration",
      mood: "warm, bright, cheerful",
      line_detail: "bold black outlines, flat bright colors",
    },
    consistency_rules: [
      `${name} must look identical across all pages.`,
      "Do not change appearance unless the story explicitly changes it.",
      "Maintain the same art style and mood throughout the book.",
    ],
  };
}

// Helper functions

function extractSkinTone(colorPalette: string[], originalPrompt?: string): string {
  const colors = colorPalette.join(' ').toLowerCase();

  // ── Priority 0: Check the ORIGINAL PROMPT for ethnicity descriptors ──
  // This is the most reliable source because the child explicitly said their character's
  // ethnicity. GPT may have ignored it in CHARACTER_DNA, but we can catch it here.
  // E.g., child says "South Asian girl" → GPT writes "light peachy" → we override to "brown skin"
  if (originalPrompt) {
    const promptLower = originalPrompt.toLowerCase();
    // South Asian / Indian / Pakistani / Bangladeshi / Sri Lankan
    if (/\b(?:south\s+asian|indian|pakistani|bangladeshi|sri\s+lankan|desi)\b/i.test(promptLower)) {
      console.log(`[extractSkinTone] Detected South Asian ethnicity from original prompt — using "brown skin"`);
      return 'brown skin';
    }
    // African / Black
    if (/\b(?:african|black\s+(?:girl|boy|child|kid))\b/i.test(promptLower)) {
      console.log(`[extractSkinTone] Detected African ethnicity from original prompt — using "dark brown skin"`);
      return 'dark brown skin';
    }
    // East Asian / Chinese / Japanese / Korean
    if (/\b(?:east\s+asian|chinese|japanese|korean|vietnamese|thai|filipino|filipina)\b/i.test(promptLower)) {
      console.log(`[extractSkinTone] Detected East Asian ethnicity from original prompt — using "light warm skin"`);
      return 'light warm skin';
    }
    // Middle Eastern / Arab
    if (/\b(?:middle\s+eastern|arab|persian|turkish|kurdish|iraqi|syrian|lebanese|egyptian)\b/i.test(promptLower)) {
      console.log(`[extractSkinTone] Detected Middle Eastern ethnicity from original prompt — using "olive tan skin"`);
      return 'olive tan skin';
    }
    // Latino / Hispanic
    if (/\b(?:latino|latina|hispanic|mexican|brazilian|colombian|peruvian|cuban)\b/i.test(promptLower)) {
      console.log(`[extractSkinTone] Detected Latino ethnicity from original prompt — using "warm tan skin"`);
      return 'warm tan skin';
    }
    // Indigenous / Native
    if (/\b(?:indigenous|native\s+american|first\s+nations|aboriginal)\b/i.test(promptLower)) {
      console.log(`[extractSkinTone] Detected Indigenous ethnicity from original prompt — using "warm brown skin"`);
      return 'warm brown skin';
    }
  }

  // ── Priority 1: Check explicit skin-tone descriptors in DNA color_palette ──
  // Use STRONG descriptors so Flux Kontext actually renders the correct skin color
  if (colors.includes('dark brown skin') || colors.includes('deep brown skin') || colors.includes('dark skin')) return 'dark brown skin';
  if (colors.includes('brown skin') || colors.includes('warm brown')) return 'brown skin';
  if (colors.includes('tan skin') || colors.includes('olive skin')) return 'olive tan skin';
  if (colors.includes('peach') || colors.includes('rosy') || colors.includes('pink')) return 'light peachy skin';
  if (colors.includes('pale') || colors.includes('fair') || colors.includes('light skin')) return 'fair skin';
  if (colors.includes('caramel') || colors.includes('honey')) return 'warm caramel brown skin';
  if (colors.includes('light golden-tan') || colors.includes('golden-tan') || colors.includes('golden tan')) return 'light golden-tan skin';

  // Check color words — but be careful: "brown" in palette might refer to hair, not skin
  if (colors.includes('dark brown') || colors.includes('deep brown')) return 'dark brown skin';
  if (colors.includes('tan') || colors.includes('olive')) return 'olive tan skin';
  // "brown" as first color in palette is likely skin tone (GPT puts skin first)
  if (colorPalette.length > 0 && colorPalette[0].toLowerCase().trim().startsWith('brown')) return 'brown skin';

  // Default: light golden-tan skin (matches GPT prompt instructions)
  return 'light golden-tan skin';
}

function extractEyes(facialFeatures: string): string {
  const features = facialFeatures.toLowerCase();
  let eyeColor = 'brown';
  if (features.includes('blue eye')) eyeColor = 'blue';
  else if (features.includes('green eye')) eyeColor = 'green';
  else if (features.includes('hazel')) eyeColor = 'hazel';

  // IMPORTANT: Do NOT use "big expressive eyes" — it made Flux create
  // oversized anime-style eyes. Just return the color.
  return `${eyeColor} eyes`;
}

function extractHair(physicalForm: string, colorPalette: string[]): string {
  const form = physicalForm.toLowerCase();
  const colors = colorPalette.join(' ').toLowerCase();

  // Hair style — be SPECIFIC so Flux renders consistently
  // "soft" is vague → Flux makes it different every time
  // "bob cut" / "straight" / "curly" are explicit and consistent
  let hairStyle = 'straight';  // Default to straight (more specific than "soft")
  if (form.includes('curly') || form.includes('afro') || form.includes('coily')) hairStyle = 'curly';
  else if (form.includes('wavy')) hairStyle = 'wavy';
  else if (form.includes('braided') || form.includes('braid')) hairStyle = 'braided';
  else if (form.includes('ponytail')) hairStyle = 'ponytail';
  else if (form.includes('pigtail')) hairStyle = 'pigtails';
  else if (form.includes('bob')) hairStyle = 'bob cut';
  else if (form.includes('bangs') && form.includes('short')) hairStyle = 'bob cut with bangs';
  else if (form.includes('straight')) hairStyle = 'straight';

  // Hair length — be explicit about what "short" means for consistency
  let hairLength = '';
  if (form.includes('long')) hairLength = 'long ';
  else if (form.includes('short') || form.includes('bob')) {
    hairLength = 'short chin-length ';
    // If no explicit style was set and hair is short, default to bob cut for consistency
    if (hairStyle === 'straight') hairStyle = 'bob cut';
  }

  // Hair color
  let hairColor = 'black';
  if (colors.includes('blonde') || colors.includes('golden')) hairColor = 'golden blonde';
  else if (colors.includes('red') || colors.includes('ginger')) hairColor = 'red';
  else if (colors.includes('brown')) hairColor = 'brown';
  else if (colors.includes('black')) hairColor = 'black';

  // Check physical_form for hair color too (often more reliable than color_palette)
  if (form.includes('brown hair')) hairColor = 'brown';
  else if (form.includes('black hair')) hairColor = 'black';
  else if (form.includes('blonde hair') || form.includes('golden hair')) hairColor = 'golden blonde';
  else if (form.includes('red hair') || form.includes('ginger hair')) hairColor = 'red';

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

/**
 * Extract notable accessories from physical_form + accessories fields.
 * These are items that affect character identity and should be in every image:
 * glasses, hats, bows, headbands, scarves, etc.
 *
 * NOT clothing (shirts, pants, dresses) — those go in outfit.
 * This captures identity-defining accessories that Flux needs to know about.
 */
function extractAccessories(physicalForm: string, accessories: string, facialFeatures: string): string[] {
  const combined = `${physicalForm} ${accessories} ${facialFeatures}`.toLowerCase();
  const found: string[] = [];

  // Glasses (very common, identity-defining)
  if (/\bglasses\b/.test(combined)) {
    if (/\bround\s+glasses\b/.test(combined)) found.push('round glasses');
    else if (/\bbig\s+glasses\b/.test(combined)) found.push('big glasses');
    else if (/\bred\s+glasses\b/.test(combined)) found.push('red glasses');
    else if (/\bblue\s+glasses\b/.test(combined)) found.push('blue glasses');
    else if (/\bpink\s+glasses\b/.test(combined)) found.push('glasses');
    else found.push('glasses');
  }

  // Hats
  if (/\b(?:hat|cap|beanie|beret|helmet|crown|tiara)\b/.test(combined)) {
    const hatMatch = combined.match(/\b(\w+\s+)?(?:hat|cap|beanie|beret|helmet|crown|tiara)\b/);
    if (hatMatch) found.push(hatMatch[0].trim());
  }

  // Hair accessories
  if (/\b(?:hair\s*bow|bow\s+in\s+(?:her|his)\s+hair|headband|hair\s*clip|ribbon)\b/.test(combined)) {
    const accessMatch = combined.match(/\b(?:(\w+\s+)?hair\s*bow|(\w+\s+)?headband|(\w+\s+)?hair\s*clip|(\w+\s+)?ribbon)\b/);
    if (accessMatch) found.push(accessMatch[0].trim());
  }

  // Scarf
  if (/\bscarf\b/.test(combined)) {
    const scarfMatch = combined.match(/\b(\w+\s+)?scarf\b/);
    if (scarfMatch) found.push(scarfMatch[0].trim());
  }

  // Backpack/bag (identity-defining for adventure stories)
  if (/\b(?:backpack|satchel|messenger\s*bag)\b/.test(combined)) {
    const bagMatch = combined.match(/\b(\w+\s+)?(?:backpack|satchel|messenger\s*bag)\b/);
    if (bagMatch) found.push(bagMatch[0].trim());
  }

  return found;
}

function extractOutfit(accessories: string): string {
  if (!accessories || accessories === 'none' || accessories === '') {
    return 'colorful casual clothes';
  }
  return accessories;
}

/**
 * Sanitize physical_form for child characters.
 * Removes adult body descriptors like "tall", "slender", "curvy" and replaces
 * with child-appropriate terms like "small", "little".
 */
function sanitizeChildPhysicalForm(physicalForm: string): string {
  if (!physicalForm) return 'small child, about 6 years old';

  let result = physicalForm;

  // Replace adult height/body descriptors with child-appropriate ones
  const adultBodyReplacements: [RegExp, string][] = [
    [/\btall\b/gi, 'small'],
    [/\bslender\b/gi, 'small'],
    [/\bcurvy\b/gi, 'small'],
    [/\bpetite\b/gi, 'small'],
    [/\bthin\b/gi, 'small'],
    [/\bslim\b/gi, 'small'],
    [/\bgraceful\s+build\b/gi, 'small childlike build'],
    [/\bgraceful\b/gi, 'little'],
    [/\belegant\b/gi, 'little'],
    [/\bathletic\b/gi, 'energetic'],
    [/\bwoman\b/gi, 'girl'],
    [/\blady\b/gi, 'girl'],
    [/\bman\b(?!\w)/gi, 'boy'],
    [/\badult\b/gi, 'child'],
    [/\bmature\b/gi, 'young'],
  ];

  for (const [pattern, replacement] of adultBodyReplacements) {
    result = result.replace(pattern, replacement);
  }

  // Ensure "child" or age indicator is present
  if (!/\b(?:child|kid|young|little|small|years?\s+old|toddler|boy|girl)\b/i.test(result)) {
    result = `small child, ${result}`;
  }

  return result;
}

/**
 * Sanitize outfit/accessories for child characters.
 * Replaces adult clothing terms with child-appropriate alternatives.
 * "flowing turquoise maxi dress" → "little turquoise dress"
 * "elegant evening gown" → "cute dress"
 */
function sanitizeChildOutfit(accessories: string): string {
  if (!accessories || accessories === 'none') return accessories;

  let result = accessories;

  // Replace adult clothing descriptors
  const adultClothingReplacements: [RegExp, string][] = [
    // "maxi dress" → "dress", "mini dress" → "dress"
    [/\bmaxi\s+dress\b/gi, 'dress'],
    [/\bmini\s+dress\b/gi, 'dress'],
    [/\bcocktail\s+dress\b/gi, 'dress'],
    [/\bevening\s+(?:gown|dress)\b/gi, 'dress'],
    [/\bball\s+gown\b/gi, 'dress'],
    // "flowing" → "little" (flowing is adult connotation)
    [/\bflowing\b/gi, 'little'],
    // "elegant" → "cute"
    [/\belegant\b/gi, 'cute'],
    // "sophisticated" → "cute"
    [/\bsophisticated\b/gi, 'cute'],
    // "stilettos", "heels", "pumps" → "shoes"
    [/\b(?:stilettos|high\s+heels|heels|pumps)\b/gi, 'shoes'],
    // "crop top" → "t-shirt"
    [/\bcrop\s+top\b/gi, 't-shirt'],
    // "halter" → remove
    [/\bhalter\b/gi, ''],
    // "strapless" → remove
    [/\bstrapless\b/gi, ''],
    // "khaki pants/shorts" → jeans (modesty + consistency)
    [/\bkhaki\s+pants\b/gi, 'jeans'],
    [/\bkhaki\s+shorts\b/gi, 'jeans'],
    [/\bkhakis\b/gi, 'jeans'],
    // "shorts" → jeans (modesty rule)
    [/\b(?:cargo\s+)?shorts\b/gi, 'jeans'],
    // "plunging" → remove
    [/\bplunging\b/gi, ''],
    // "bodycon" → remove
    [/\bbodycon\b/gi, ''],
    // "tight" → remove
    [/\btight(?:-fitting)?\b/gi, ''],
    // "low-cut" → remove
    [/\blow[- ]cut\b/gi, ''],
    // "form-fitting" → remove
    [/\bform[- ]fitting\b/gi, ''],
    // "sheer" → remove
    [/\bsheer\b/gi, ''],
    // "lace" in adult context → remove (keep for "lace trim" on kids clothes)
    [/\blace\s+(?:dress|gown|top)\b/gi, 'dress'],
    // "satin" → remove
    [/\bsatin\b/gi, ''],
    // "silk" → "soft"
    [/\bsilk(?:en)?\b/gi, 'soft'],
  ];

  for (const [pattern, replacement] of adultClothingReplacements) {
    result = result.replace(pattern, replacement);
  }

  // Clean up double spaces
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

/**
 * Extract age from DNA — checks dna.age field first, then parses physical_form
 * for patterns like "about 4 years old", "5 year old", "4-year-old".
 * Falls back to "6 years old" only if no age found anywhere.
 */
function extractAge(dna: CharacterDNA): string {
  // 1. Explicit age field from GPT
  if (dna.age && dna.age.trim()) return dna.age.trim();

  // 2. Parse age from physical_form ("about 4 years old", "4-year-old", "age 5")
  if (dna.physical_form) {
    const ageMatch = dna.physical_form.match(
      /\b(?:about\s+)?(\d{1,2})\s*[-–]?\s*years?\s*[-–]?\s*old\b/i
    );
    if (ageMatch) return `${ageMatch[1]} years old`;

    const ageMatch2 = dna.physical_form.match(/\bage\s+(\d{1,2})\b/i);
    if (ageMatch2) return `${ageMatch2[1]} years old`;
  }

  // 3. Parse from unique_identifiers as last resort
  if (dna.unique_identifiers) {
    const ageMatch = dna.unique_identifiers.match(
      /\b(?:about\s+)?(\d{1,2})\s*[-–]?\s*years?\s*[-–]?\s*old\b/i
    );
    if (ageMatch) return `${ageMatch[1]} years old`;
  }

  return "6 years old"; // Default fallback
}

/**
 * Extract gender for human characters.
 * Priority: 1) Explicit gender field from GPT  2) Name-based detection  3) Physical form signals
 * NEVER returns "child" or neutral — always picks girl or boy.
 */
function extractGender(dna: CharacterDNA): 'girl' | 'boy' {
  // 1. Explicit gender field from GPT (highest priority)
  if (dna.gender) {
    const g = dna.gender.toLowerCase();
    if (g === 'girl' || g === 'female') return 'girl';
    if (g === 'boy' || g === 'male') return 'boy';
  }

  // 2. Check physical_form for explicit gender words
  const allText = [
    dna.physical_form || '',
    dna.accessories || '',
    dna.facial_features || '',
    dna.unique_identifiers || '',
    dna.personality_visuals || '',
  ].join(' ').toLowerCase();

  // Explicit gender words in description
  if (/\b(?:she|her|girl|daughter|princess|queen|sister|niece|granddaughter|heroine|goddess|lady)\b/i.test(allText)) return 'girl';
  if (/\b(?:he|his|boy|son|prince|king|brother|nephew|grandson|hero|god)\b/i.test(allText)) return 'boy';

  // 3. Name-based detection (comprehensive list)
  const nameLower = dna.name.toLowerCase().split(/\s+/)[0]; // First name only

  const GIRL_NAMES = new Set([
    // Common English
    'emma', 'olivia', 'ava', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper',
    'evelyn', 'abigail', 'emily', 'elizabeth', 'ella', 'avery', 'sofia', 'scarlett', 'victoria',
    'aria', 'grace', 'chloe', 'camila', 'penelope', 'riley', 'layla', 'lillian', 'nora',
    'zoey', 'mila', 'aubrey', 'hannah', 'lily', 'addison', 'eleanor', 'natalie', 'luna',
    'savannah', 'brooklyn', 'leah', 'zoe', 'stella', 'hazel', 'ellie', 'paisley', 'audrey',
    'skylar', 'violet', 'claire', 'bella', 'aurora', 'lucy', 'anna', 'samantha', 'caroline',
    'genesis', 'aaliyah', 'kennedy', 'kinsley', 'allison', 'maya', 'sarah', 'madelyn',
    'adeline', 'alexa', 'ariana', 'elena', 'gabriella', 'naomi', 'alice', 'sadie', 'hailey',
    'eva', 'emilia', 'autumn', 'quinn', 'nevaeh', 'piper', 'ruby', 'serenity', 'willow',
    'everly', 'cora', 'kaylee', 'lydia', 'aubree', 'arianna', 'eliana', 'peyton', 'melanie',
    'gianna', 'isabelle', 'julia', 'valentina', 'nova', 'clara', 'vivian', 'reagan', 'mackenzie',
    'madeline', 'brielle', 'delilah', 'isla', 'rylee', 'katherine', 'sophie', 'josephine', 'ivy',
    'lila', 'lyla', 'daisy', 'rose', 'poppy', 'iris', 'jasmine', 'jade', 'fiona', 'molly',
    'elise', 'margot', 'wren', 'juniper', 'maeve', 'freya', 'esme', 'beatrice', 'cecilia',
    // Arabic / Middle Eastern / South Asian
    'anya', 'aanya', 'anaya', 'amira', 'aisha', 'fatima', 'mariam', 'maryam', 'hana', 'zara',
    'yasmin', 'yasmeen', 'nadia', 'laila', 'leila', 'dina', 'sara', 'sana', 'raya', 'zoya',
    'tara', 'priya', 'meera', 'ananya', 'ishita', 'kavya', 'saanvi', 'aadya', 'diya', 'ira',
    'riya', 'siya', 'myra', 'kiara', 'anika', 'nisha', 'pooja', 'shreya', 'tanvi', 'neha',
    'aadhya', 'avni', 'isha', 'mahira', 'inaya', 'ayesha', 'hadiya', 'zahra', 'safiya', 'noura',
    // East Asian
    'yuki', 'sakura', 'hina', 'mei', 'lin', 'jia', 'xia', 'yuna', 'suki', 'akari',
    'haruka', 'aoi', 'rin', 'miku', 'chiyo', 'keiko', 'yumi', 'miyu', 'sora',
    // African
    'amara', 'nia', 'zuri', 'imani', 'ayana', 'kaya', 'asha', 'nala', 'sade', 'ada',
    'chioma', 'folake', 'adaeze', 'amina', 'halima', 'khadija', 'mariama',
    // Latin / Spanish
    'valentina', 'camila', 'lucia', 'mariana', 'daniela', 'gabriela', 'alejandra',
    'catalina', 'regina', 'paloma', 'sol', 'lola', 'carmen', 'rosa', 'estella',
    // Other common
    'nina', 'rina', 'mina', 'tina', 'lena', 'gina', 'ana', 'diana', 'vera', 'nora',
    'lara', 'kira', 'mara', 'sasha', 'alina', 'polina', 'daria', 'ksenia', 'natasha',
    'olga', 'svetlana', 'tatiana', 'irina', 'marina', 'elena', 'katya', 'anya',
  ]);

  const BOY_NAMES = new Set([
    // Common English
    'liam', 'noah', 'oliver', 'james', 'elijah', 'william', 'henry', 'lucas', 'benjamin',
    'theodore', 'jack', 'levi', 'alexander', 'mason', 'ethan', 'daniel', 'jacob', 'michael',
    'logan', 'jackson', 'sebastian', 'aiden', 'owen', 'samuel', 'ryan', 'nathan', 'luke',
    'matthew', 'david', 'joseph', 'carter', 'wyatt', 'john', 'jayden', 'dylan', 'grayson',
    'caleb', 'isaac', 'andrew', 'thomas', 'joshua', 'ezra', 'hudson', 'charles', 'christopher',
    'jaxon', 'maverick', 'josiah', 'isaiah', 'adam', 'leo', 'max', 'ben', 'sam', 'dan', 'tom',
    'jake', 'finn', 'kai', 'alex', 'charlie', 'theo', 'oscar', 'archie', 'teddy', 'toby',
    'freddie', 'alfie', 'harry', 'george', 'edward', 'arthur', 'freddy', 'tommy',
    // Arabic / Middle Eastern / South Asian
    'omar', 'ali', 'zain', 'zayn', 'amir', 'hassan', 'rami', 'tariq', 'yusuf', 'ibrahim',
    'ahmed', 'khalid', 'hamza', 'bilal', 'faisal', 'kareem', 'rashid', 'samir', 'nabil',
    'mohammed', 'muhammad', 'mohammad', 'mohamad', 'mohamed', 'mehmet', 'mustafa',
    'abdallah', 'abdullah', 'abdelrahman', 'yousef', 'ismail', 'idris', 'jamal', 'malik',
    'suleiman', 'anwar', 'farid', 'hasan', 'hussein', 'isa', 'osman', 'salman', 'walid',
    'arjun', 'dev', 'rahul', 'rohan', 'vivek', 'aditya', 'krishna', 'ravi', 'sanjay', 'vikram',
    'aarav', 'vihaan', 'reyansh', 'ayaan', 'atharv', 'kabir', 'shaurya', 'advait',
    'arnav', 'dhruv', 'ishaan', 'karan', 'nikhil', 'pranav', 'raj', 'sahil', 'varun',
    // East Asian
    'hiro', 'ken', 'yuki', 'ryu', 'jin', 'wei', 'ming', 'tao', 'jun', 'akira',
    'haruto', 'takeshi', 'kenji', 'daisuke', 'chen', 'li', 'wang', 'jian', 'hyun', 'seo',
    // African
    'kofi', 'kwame', 'chidi', 'emeka', 'obinna', 'sekou', 'mamadou', 'ousmane',
    'jabari', 'tendai', 'thabo', 'sipho', 'amadi', 'chinua', 'olu', 'tunde',
    // Latin / Spanish
    'mateo', 'santiago', 'diego', 'carlos', 'miguel', 'rafael', 'pablo', 'andres', 'felipe',
    'alejandro', 'fernando', 'gustavo', 'jorge', 'luis', 'pedro', 'ricardo', 'sergio',
  ]);

  if (GIRL_NAMES.has(nameLower)) return 'girl';
  if (BOY_NAMES.has(nameLower)) return 'boy';

  // 4. Signal-based detection from appearance
  const girlSignals = [
    /\bdress\b/, /\bskirt\b/, /\bblouse\b/, /\btutu\b/, /\bgown\b/,
    /\blong\s+(?:\w+\s+)?hair\b/, /\bcurly\s+hair\b/, /\bwavy\s+hair\b/,
    /\bbraids?\b/, /\bponytail\b/, /\bpigtails?\b/, /\bhair\s+(?:bow|clip|band)\b/,
    /\bbow\b/, /\bribbon\b/, /\btiara\b/, /\bprincess\b/, /\bcrown\b/,
    /\bfloral\b/, /\bflower(?:s|y)?\b/, /\bpink\b/, /\bpurple\b/,
    /\beyelashes\b/, /\blips\b/, /\blipstick\b/,
  ];
  const boySignals = [
    /\bshort\s+(?:\w+\s+)?hair\b/, /\bcrew\s*cut\b/, /\bbuzz\s*cut\b/,
    /\bbaseball\s+cap\b/, /\bcap\b/,
    /\boveralls\b/, /\bsuit\b(?!.*case)/, /\btie\b(?!.*hair)/,
    /\bbowtie\b/, /\bsuspenders\b/,
  ];

  const girlScore = girlSignals.filter(p => p.test(allText)).length;
  const boyScore = boySignals.filter(p => p.test(allText)).length;

  if (girlScore > boyScore) return 'girl';
  if (boyScore > girlScore) return 'boy';

  // 5. Final fallback: check physical_form more broadly for "boy" or "girl" hints
  // GPT's physical_form often says "small boy" or "small girl" even when the explicit
  // gender field is missing. This catches names not in our lists (e.g., unique names).
  const physForm = (dna.physical_form || '').toLowerCase();
  if (/\bboy\b|\bmale\b|\bson\b|\bprince\b|\blad\b|\bhe\b/.test(physForm)) {
    console.log(`[extractGender] Detected "boy" signal in physical_form for "${dna.name}"`);
    return 'boy';
  }
  if (/\bgirl\b|\bfemale\b|\bdaughter\b|\bprincess\b|\blass\b|\bshe\b/.test(physForm)) {
    console.log(`[extractGender] Detected "girl" signal in physical_form for "${dna.name}"`);
    return 'girl';
  }

  // 6. True last resort: default to boy (safer for unknown names — avoids adding
  // "feminine features, pretty eyelashes" to characters where gender is ambiguous,
  // which caused boys named Mohammed to get pierced ears/earrings).
  // "boyish features" produces more gender-neutral cartoon results than "feminine features".
  console.log(`[extractGender] Ambiguous for "${dna.name}" — defaulting to boy`);
  return 'boy';
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
