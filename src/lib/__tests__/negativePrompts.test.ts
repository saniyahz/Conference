import { describe, it, expect } from 'vitest';
import {
  buildHardBanNegative,
  buildMultiCharPlateNegative,
  buildInpaintCharacterNegative,
  buildPlateNegative,
  sanitizeNegatives,
} from '../negativePrompts';

describe('buildHardBanNegative', () => {
  it('includes top anti-drift animals for rhinoceros', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('cow');
    expect(neg).toContain('bull');
    expect(neg).toContain('hippo');
    expect(neg).toContain('elephant');
    expect(neg).toContain('buffalo');
    expect(neg).toContain('dinosaur');
    expect(neg).toContain('cat');
    expect(neg).toContain('dog');
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
    expect(neg).toContain('cow');
  });

  it('includes duplicate blocking terms', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('multiple animals');
    expect(neg).toContain('two animals');
    expect(neg).toContain('herd');
    expect(neg).toContain('duplicate');
  });

  it('includes crop prevention terms', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('cropped');
    expect(neg).toContain('cut off');
    expect(neg).toContain('close-up');
    expect(neg).toContain('partial body');
  });

  it('includes accessory blocking (condensed)', () => {
    const neg = buildHardBanNegative('rhinoceros');
    // Simplified to just "hat" (covers party hat, top hat, birthday hat)
    expect(neg).toContain('hat');
    expect(neg).toContain('crown');
    expect(neg).toContain('clothing');
    expect(neg).toContain('jacket');
  });

  it('includes horn drift prevention', () => {
    const neg = buildHardBanNegative('rhinoceros');
    expect(neg).toContain('unicorn horn');
  });

  it('anti-drift terms come FIRST in the negative (tokens 1-10)', () => {
    const neg = buildHardBanNegative('rhinoceros');
    const terms = neg.split(', ');
    // First few terms should be the most common misidentifications
    // Ordered by confusion frequency: cow > bull > hippo
    expect(terms[0]).toBe('cow');
    expect(terms[1]).toBe('bull');
    expect(terms[2]).toBe('hippo');
  });

  it('returns reasonable terms when species is unknown', () => {
    const neg = buildHardBanNegative('dragon');
    // Should still include generic bans (no anti-drift for dragon)
    expect(neg).toContain('cropped');
    expect(neg).toContain('text');
    expect(neg).toContain('multiple animals');
  });

  it('total token count stays under 35 terms', () => {
    const neg = buildHardBanNegative('rhinoceros');
    const terms = neg.split(', ');
    // Hard ban should be compact — leaves room for character safety + quality
    expect(terms.length).toBeLessThanOrEqual(35);
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
  it('blocks wrong animals NOT already in hard ban', () => {
    const neg = buildInpaintCharacterNegative();
    // cat/dog/elephant are in hard ban — character safety has different animals
    expect(neg).toContain('horse');
    expect(neg).toContain('monkey');
    expect(neg).toContain('giraffe');
    expect(neg).toContain('wolf');
    expect(neg).toContain('pig');
    expect(neg).toContain('deer');
  });

  it('blocks humans', () => {
    const neg = buildInpaintCharacterNegative();
    expect(neg).toContain('human');
    expect(neg).toContain('person');
    expect(neg).toContain('boy');
    expect(neg).toContain('girl');
  });

  it('includes quality negatives', () => {
    const neg = buildInpaintCharacterNegative();
    expect(neg).toContain('blurry');
    expect(neg).toContain('deformed');
    expect(neg).toContain('black and white');
  });

  it('is compact (under 25 terms)', () => {
    const neg = buildInpaintCharacterNegative();
    const terms = neg.split(', ');
    // Must be short — lands at tokens 30-50 of the combined negative
    expect(terms.length).toBeLessThanOrEqual(25);
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
