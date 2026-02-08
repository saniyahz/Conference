import { CharacterCanon } from "./visual-types";

// Character DNA from story generation
interface CharacterDNA {
  name: string;
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
 * Create a CHARACTER CANON from DNA - this is generated ONCE per story
 * and reused VERBATIM for every single image.
 *
 * RULE: The description NEVER changes across pages.
 */
export function createCharacterCanon(dna: CharacterDNA): CharacterCanon {
  const id = dna.name.toLowerCase().replace(/\s+/g, '-');

  // Extract key visual features
  const skinTone = extractSkinTone(dna.color_palette);
  const hairDesc = extractHairDescription(dna.physical_form, dna.color_palette);
  const clothing = dna.accessories !== 'none' ? dna.accessories : 'simple colorful clothes';

  // Build immutable description
  const description = buildCanonDescription(dna, skinTone, hairDesc, clothing);

  return {
    id,
    name: dna.name,
    description,
  };
}

function extractSkinTone(colorPalette: string[]): string {
  const colors = colorPalette.join(' ').toLowerCase();
  if (colors.includes('brown') || colors.includes('dark')) return 'warm medium brown skin';
  if (colors.includes('tan') || colors.includes('olive')) return 'tan skin';
  if (colors.includes('rosy') || colors.includes('pink') || colors.includes('peach')) return 'light peachy skin';
  return 'warm skin tone';
}

function extractHairDescription(physicalForm: string, colorPalette: string[]): string {
  const form = physicalForm.toLowerCase();
  const colors = colorPalette.join(' ').toLowerCase();

  let hairType = 'soft hair';
  if (form.includes('curly') || form.includes('afro')) hairType = 'natural curly hair';
  else if (form.includes('straight')) hairType = 'straight hair';
  else if (form.includes('wavy')) hairType = 'wavy hair';
  else if (form.includes('long')) hairType = 'long hair';
  else if (form.includes('short')) hairType = 'short hair';

  let hairColor = 'brown';
  if (colors.includes('blonde') || colors.includes('golden')) hairColor = 'golden blonde';
  else if (colors.includes('black')) hairColor = 'black';
  else if (colors.includes('red') || colors.includes('ginger')) hairColor = 'red';
  else if (colors.includes('pink')) hairColor = 'pink';
  else if (colors.includes('brown')) hairColor = 'dark brown';

  return `${hairColor} ${hairType}`;
}

function buildCanonDescription(
  dna: CharacterDNA,
  skinTone: string,
  hairDesc: string,
  clothing: string
): string {
  if (dna.type === 'human') {
    return `
${dna.name} is a young child aged 6-8.
Skin tone: ${skinTone}.
Hair: ${hairDesc}.
Eyes: large expressive eyes with a friendly look.
Face: soft rounded children's illustration style, rosy cheeks.
Clothing: ${clothing}.
Body proportions: childlike, slightly oversized head.
Expression style: gentle, curious, friendly.
RULE: appearance NEVER changes across pages.
    `.trim();
  }

  if (dna.type === 'animal') {
    return `
${dna.name} is a cute friendly ${dna.physical_form}.
Texture: ${dna.material_or_texture}.
Colors: ${dna.color_palette.join(', ')}.
Face: ${dna.facial_features}.
Style: soft rounded children's illustration style.
${dna.accessories !== 'none' ? `Wearing: ${dna.accessories}.` : ''}
RULE: appearance NEVER changes across pages.
    `.trim();
  }

  // Default for creatures/objects/other
  return `
${dna.name} is a ${dna.type}: ${dna.physical_form}.
Texture: ${dna.material_or_texture}.
Colors: ${dna.color_palette.join(', ')}.
Features: ${dna.facial_features}.
Style: soft rounded children's illustration style.
${dna.accessories !== 'none' ? `Wearing: ${dna.accessories}.` : ''}
RULE: appearance NEVER changes across pages.
  `.trim();
}

/**
 * Create a simple canon from just a name (fallback)
 */
export function createSimpleCanon(name: string, type: 'human' | 'animal' = 'human'): CharacterCanon {
  const id = name.toLowerCase().replace(/\s+/g, '-');

  if (type === 'human') {
    return {
      id,
      name,
      description: `
${name} is a young child aged 6-8.
Skin tone: warm medium brown.
Hair: short dark brown natural curls.
Eyes: large brown eyes.
Face: soft rounded children's illustration style, rosy cheeks.
Clothing: colorful casual clothes.
Body proportions: childlike, slightly oversized head.
Expression style: gentle, curious, friendly.
RULE: appearance NEVER changes across pages.
      `.trim(),
    };
  }

  return {
    id,
    name,
    description: `
${name} is a cute friendly animal character.
Style: soft rounded children's illustration style.
Colors: warm friendly colors.
Face: big expressive eyes, friendly smile.
RULE: appearance NEVER changes across pages.
    `.trim(),
  };
}
