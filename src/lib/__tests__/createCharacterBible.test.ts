import { describe, it, expect } from 'vitest';
import { createCharacterBible, createSimpleBible, CharacterDNA } from '../../../lib/createCharacterBible';

describe('createCharacterBible', () => {
  const rhinoDNA: CharacterDNA = {
    name: 'Riri',
    type: 'animal',
    physical_form: 'small cute baby rhinoceros',
    material_or_texture: 'smooth gray skin',
    color_palette: ['gray', 'teal'],
    facial_features: 'big teal eyes, friendly smile',
    accessories: 'none',
    personality_visuals: 'curious, brave, joyful',
    movement_style: 'waddle',
    unique_identifiers: 'small horn on nose',
  };

  it('extracts rhinoceros as species from physical_form', () => {
    const bible = createCharacterBible(rhinoDNA);
    expect(bible.species).toBe('rhinoceros');
  });

  it('sets character_type to animal', () => {
    const bible = createCharacterBible(rhinoDNA);
    expect(bible.character_type).toBe('animal');
  });

  it('includes species in visual_fingerprint', () => {
    const bible = createCharacterBible(rhinoDNA);
    expect(bible.visual_fingerprint!.some(fp => fp.includes('rhinoceros'))).toBe(true);
  });

  it('includes skin/fur color in visual_fingerprint', () => {
    const bible = createCharacterBible(rhinoDNA);
    expect(bible.visual_fingerprint!.some(fp => fp.includes('gray'))).toBe(true);
  });

  it('extracts species from name when physical_form is generic', () => {
    const genericDNA: CharacterDNA = {
      ...rhinoDNA,
      physical_form: 'small cute animal',
      unique_identifiers: 'none',
      name: 'Riri the Rhino',
    };
    const bible = createCharacterBible(genericDNA);
    expect(bible.species).toBe('rhino');
  });

  it('extracts species from unique_identifiers as fallback', () => {
    const fallbackDNA: CharacterDNA = {
      ...rhinoDNA,
      physical_form: 'small cute animal',
      unique_identifiers: 'baby rhinoceros features',
    };
    const bible = createCharacterBible(fallbackDNA);
    expect(bible.species).toBe('rhinoceros');
  });

  it('uses fallbackSpecies when all other sources fail', () => {
    const vagueDNA: CharacterDNA = {
      ...rhinoDNA,
      physical_form: 'small cute creature',
      unique_identifiers: 'horn on nose',
      name: 'Riri',
    };
    const bible = createCharacterBible(vagueDNA, 'rhinoceros');
    expect(bible.species).toBe('rhinoceros');
  });
});

describe('createSimpleBible', () => {
  it('creates a bible with species set correctly', () => {
    const bible = createSimpleBible('Riri', 'animal', 'rhinoceros');
    expect(bible.species).toBe('rhinoceros');
    expect(bible.name).toBe('Riri');
  });

  it('includes species in visual_fingerprint', () => {
    const bible = createSimpleBible('Riri', 'animal', 'rhinoceros');
    expect(bible.visual_fingerprint!.some(fp => fp.includes('rhinoceros'))).toBe(true);
  });

  it('sets style to children\'s picture book', () => {
    const bible = createSimpleBible('Riri', 'animal', 'rhinoceros');
    expect(bible.style!.base).toContain('children');
  });
});
