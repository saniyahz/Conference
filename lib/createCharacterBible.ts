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

  return {
    character_id: characterId,
    name: dna.name,
    age: dna.age || "6 years old",
    appearance: {
      skin_tone: extractSkinTone(dna.color_palette),
      eyes: extractEyes(dna.facial_features),
      hair: extractHair(dna.physical_form, dna.color_palette),
      face_features: extractFaceFeatures(dna.facial_features),
    },
    signature_outfit: extractOutfit(dna.accessories),
    personality: extractPersonality(dna.personality_visuals),
    art_style: {
      medium: "soft watercolor",
      genre: "premium children's picture book",
      mood: "warm, gentle, magical",
      line_detail: "clean, whimsical",
    },
    consistency_rules: [
      `${dna.name} must look identical across all pages (same face, hair, age, outfit).`,
      "Do not change outfit unless the story explicitly changes it.",
      "Maintain the same art style and mood throughout the book.",
    ],
  };
}

/**
 * Create a simple Character Bible from just name and basic info (fallback)
 */
export function createSimpleBible(
  name: string,
  skinTone: string = "warm brown",
  hairColor: string = "black",
  hairStyle: string = "curly"
): CharacterBible {
  return {
    character_id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    age: "6 years old",
    appearance: {
      skin_tone: skinTone,
      eyes: "big expressive brown eyes",
      hair: `${hairColor} ${hairStyle} hair`,
      face_features: "soft rounded cheeks, friendly smile",
    },
    signature_outfit: "colorful casual clothes",
    personality: ["curious", "joyful", "brave"],
    art_style: {
      medium: "soft watercolor",
      genre: "premium children's picture book",
      mood: "warm, gentle, magical",
      line_detail: "clean, whimsical",
    },
    consistency_rules: [
      `${name} must look identical across all pages (same face, hair, age, outfit).`,
      "Do not change outfit unless the story explicitly changes it.",
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
