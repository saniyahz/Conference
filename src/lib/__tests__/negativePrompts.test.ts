import { describe, it, expect } from 'vitest';
import {
  buildHardBanNegative,
  buildMultiCharPlateNegative,
  buildInpaintCharacterNegative,
  buildPlateNegative,
  sanitizeNegatives,
} from '../negativePrompts';

describe('buildHardBanNegative', () => {
  it('includes cow/bull/buffalo anti-drift for rhinoceros', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('cow');
    expect(neg).toContain('bull');
    expect(neg).toContain('buffalo');
    expect(neg).toContain('bison');
    expect(neg).toContain('zebra');
    expect(neg).toContain('dinosaur');
  });

  it('includes cow/bull anti-drift for "rhino" (alias)', () => {
    const neg = buildHardBanNegative('rhino');
    expect(neg).toContain('cow');
    expect(neg).toContain('bull');
  });

  it('includes elephant-specific anti-drift', () => {
    const neg = buildHardBanNegative('elephant');
    expect(neg).toContain('hippo');
    expect(neg).toContain('rhinoceros');
    expect(neg).toContain('mammoth');
  });

  it('includes duplicate blocking terms', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('multiple rhinos');
    expect(neg).toContain('multiple animals');
    expect(neg).toContain('two animals');
    expect(neg).toContain('group of animals');
    expect(neg).toContain('herd');
  });

  it('includes crop prevention terms', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('cropped');
    expect(neg).toContain('cut off');
    expect(neg).toContain('close-up');
    expect(neg).toContain('partial body');
  });

  it('includes accessory blocking', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('party hat');
    expect(neg).toContain('top hat');
    expect(neg).toContain('clothing');
    expect(neg).toContain('jacket');
  });

  it('includes horn drift prevention', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('unicorn horn');
    expect(neg).toContain('long horn');
  });

  it('anti-drift terms come FIRST in the negative (tokens 1-10)', () => {
    const neg = buildHardBanNegative('rhinoceros');
    const terms = neg.split(', ');
    // First few terms should be anti-drift animals
    expect(terms[0]).toBe('cow');
    expect(terms[1]).toBe('bull');
    expect(terms[2]).toBe('calf');
  });

  it('returns reasonable terms when species is unknown', () => {
    const neg = buildHardBanNegative('dragon');
    // Should still include generic bans (no anti-drift for dragon)
    expect(neg).toContain('cropped');
    expect(neg).toContain('text');
    expect(neg).toContain('multiple animals');
  });
});

describe('buildMultiCharPlateNegative', () => {
  it('blocks rhinoceros with multiple synonyms', () => {
    const neg = buildMultiCharPlateNegative('rhinoceros');
    expect(neg).toContain('rhinoceros');
    expect(neg).toContain('rhino');
    expect(neg).toContain('gray animal with horn');
    expect(neg).toContain('horned animal');
    expect(neg).toContain('gray quadruped');
  });

  it('blocks humans', () => {
    const neg = buildMultiCharPlateNegative('rhinoceros');
    expect(neg).toContain('person');
    expect(neg).toContain('human');
  });

  it('includes quality negatives', () => {
    const neg = buildMultiCharPlateNegative('rhinoceros');
    expect(neg).toContain('low quality');
    expect(neg).toContain('blurry');
  });

  it('falls back to species name when no synonyms defined', () => {
    const neg = buildMultiCharPlateNegative('penguin');
    expect(neg).toContain('penguin');
    expect(neg).toContain('person');
  });
});

describe('buildPlateNegative (solo pages)', () => {
  it('blocks all animals and characters', () => {
    const neg = buildPlateNegative();
    expect(neg).toContain('character');
    expect(neg).toContain('animal');
    expect(neg).toContain('rhinoceros');
    expect(neg).toContain('person');
  });
});

describe('buildInpaintCharacterNegative', () => {
  it('blocks wrong animals', () => {
    const neg = buildInpaintCharacterNegative();
    expect(neg).toContain('cat');
    expect(neg).toContain('dog');
    expect(neg).toContain('horse');
    expect(neg).toContain('giraffe');
  });

  it('blocks humans', () => {
    const neg = buildInpaintCharacterNegative();
    expect(neg).toContain('human');
    expect(neg).toContain('boy');
    expect(neg).toContain('girl');
  });

  it('includes quality negatives', () => {
    const neg = buildInpaintCharacterNegative();
    expect(neg).toContain('blurry');
    expect(neg).toContain('deformed');
    expect(neg).toContain('black and white');
  });
});

describe('sanitizeNegatives', () => {
  it('removes terms that appear in positive prompt', () => {
    const result = sanitizeNegatives(
      'dolphin, cat, dog, blurry',
      'a rhinoceros swimming with a dolphin',
      'ocean scene',
      ['dolphin']
    );
    expect(result).not.toContain('dolphin');
    expect(result).toContain('cat');
    expect(result).toContain('blurry');
  });

  it('removes fish when setting contains ocean (semantic override)', () => {
    const result = sanitizeNegatives(
      'fish, cat, dog',
      'a rhinoceros',
      'underwater ocean scene',
      []
    );
    expect(result).not.toContain('fish');
    expect(result).toContain('cat');
  });

  it('keeps terms that do NOT appear in positive/setting', () => {
    const result = sanitizeNegatives(
      'cow, bull, cat, dog',
      'a rhinoceros on the moon',
      'moon surface',
      ['rhinoceros']
    );
    expect(result).toContain('cow');
    expect(result).toContain('bull');
  });
});
