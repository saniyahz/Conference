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
export function createCharacterBible(dna: CharacterDNA): CharacterBible {
  const characterId = dna.name.toLowerCase().replace(/\s+/g, '_');
  const isAnimal = dna.type === 'animal';
  const isCreature = dna.type === 'creature';

  // Extract species for animals (dog, cat, rabbit, etc.)
  const species = isAnimal ? extractSpecies(dna.physical_form) : undefined;

  return {
    character_id: characterId,
    name: dna.name,
    character_type: dna.type,
    species: species,  // "dog", "cat", "rabbit", etc.
    age: isAnimal ? "friendly" : (dna.age || "6 years old"),
    appearance: {
      skin_tone: isAnimal ? extractFurColor(dna.color_palette, dna.material_or_texture) : extractSkinTone(dna.color_palette),
      eyes: extractEyes(dna.facial_features),
      hair: isAnimal ? extractFurDescription(dna.physical_form, dna.material_or_texture) : extractHair(dna.physical_form, dna.color_palette),
      face_features: extractFaceFeatures(dna.facial_features),
    },
    signature_outfit: isAnimal ? (dna.accessories !== 'none' ? dna.accessories : '') : extractOutfit(dna.accessories),
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
function extractSpecies(physicalForm: string): string {
  const form = physicalForm.toLowerCase();

  const animals = [
    'dog', 'puppy', 'cat', 'kitten', 'rabbit', 'bunny', 'bear', 'fox',
    'owl', 'bird', 'elephant', 'lion', 'tiger', 'mouse', 'squirrel',
    'deer', 'wolf', 'penguin', 'duck', 'frog', 'turtle', 'fish',
    'dolphin', 'whale', 'shark', 'butterfly', 'bee', 'dragon', 'unicorn'
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
  species?: string,  // For animals: "dog", "cat", etc.
  furOrSkin: string = "warm brown",
  hairOrFur: string = "black curly hair"
): CharacterBible {
  const isAnimal = characterType === 'animal';

  return {
    character_id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    character_type: characterType,
    species: isAnimal ? (species || 'animal') : undefined,
    age: isAnimal ? "friendly" : "6 years old",
    appearance: {
      skin_tone: isAnimal ? `${furOrSkin} fur` : `${furOrSkin} skin`,
      eyes: "big expressive eyes",
      hair: hairOrFur,
      face_features: "friendly smile, cute face",
    },
    signature_outfit: isAnimal ? "" : "colorful casual clothes",
    personality: ["curious", "joyful", "brave"],
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
