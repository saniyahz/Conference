import { describe, it, expect } from 'vitest';
import { generatePageSceneCard } from '../../../lib/generatePageSceneCard';
import { CharacterBible } from '../../../lib/visual-types';

// Minimal bible for testing
const mockBible: CharacterBible = {
  character_id: 'riri',
  name: 'Riri',
  character_type: 'animal',
  species: 'rhinoceros',
  age: 'friendly',
  visual_fingerprint: ['cute cartoon rhinoceros', 'light gray skin', 'big teal eyes'],
  appearance: { skin_tone: 'light gray', eyes: 'big teal eyes', hair: 'none', face_features: 'friendly' },
  signature_outfit: '',
  personality: ['curious', 'brave'],
  style: { base: 'children\'s picture book', render: ['clean lines'], aspect: 'square' },
  art_style: { medium: 'watercolor', genre: 'children', mood: 'warm', line_detail: 'clean' },
  consistency_rules: [],
};

describe('generatePageSceneCard - setting extraction', () => {
  // ── MOON SCENES ──

  it('extracts moon setting from "reached the moon"', () => {
    const card = generatePageSceneCard(
      'As Riri reached the moon, he gasped in wonder. The surface sparkled like powdered sugar.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  it('extracts moon setting from "flew to the moon"', () => {
    const card = generatePageSceneCard(
      'Riri flew to the moon in his bright rocket ship.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  it('extracts moon setting from "arrived at the moon"', () => {
    const card = generatePageSceneCard(
      'After a long journey, Riri arrived at the moon.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  it('extracts moon setting from "on the moon"', () => {
    const card = generatePageSceneCard(
      'Riri was standing on the moon, looking at Earth.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  it('extracts moon setting from "landed on the moon"', () => {
    const card = generatePageSceneCard(
      'The rocket landed on the moon with a gentle bump.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  it('extracts moon setting from "moon rabbits"', () => {
    const card = generatePageSceneCard(
      'Riri met friendly moon rabbits hopping about on the surface.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  it('extracts moon setting from "crater" keyword', () => {
    const card = generatePageSceneCard(
      'Riri explored the deep crater, finding colorful rocks inside.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toContain('moon');
  });

  // ── SPACE SCENES ──

  it('extracts space setting from "blasted off"', () => {
    const card = generatePageSceneCard(
      'With a roar of engines, Riri blasted off into the sky!',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/rocket|blast|space|sky/);
  });

  it('extracts space setting from "into space"', () => {
    const card = generatePageSceneCard(
      'The rocket flew into space, past the clouds and atmosphere.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/space|star|planet/);
  });

  // ── OCEAN/WATER SCENES ──

  it('extracts ocean setting from "splash"', () => {
    const card = generatePageSceneCard(
      'With a big splash, the rocket landed right in the water!',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/ocean|water|wave|splash/);
  });

  it('extracts ocean setting from "toward the ocean"', () => {
    const card = generatePageSceneCard(
      'They found themselves descending rapidly toward the ocean.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/ocean|water|wave/);
  });

  it('extracts ocean setting from "dolphins" keyword', () => {
    const card = generatePageSceneCard(
      'Riri saw beautiful dolphins leaping through the sparkling waves.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/ocean|water|wave|dolphin/);
  });

  it('extracts underwater setting from "under the water"', () => {
    const card = generatePageSceneCard(
      'Riri dove under the water and saw colorful coral reefs.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/underwater|ocean/);
  });

  // ── INDOOR SCENES ──

  it('extracts cockpit setting from "climbed inside"', () => {
    const card = generatePageSceneCard(
      'Riri climbed inside the rocket and sat in the captain\'s seat.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/rocket|cockpit|inside/);
  });

  it('extracts cockpit setting from "inside the rocket"', () => {
    const card = generatePageSceneCard(
      'Riri looked around inside the rocket at all the colorful buttons.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/rocket|cockpit|inside/);
  });

  // ── NATURE SCENES ──

  it('extracts forest setting from "in the forest"', () => {
    const card = generatePageSceneCard(
      'Riri walked in the forest, hearing birds singing in the trees.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/forest/);
  });

  it('extracts beach setting from "at the beach"', () => {
    const card = generatePageSceneCard(
      'Riri played at the beach, building sandcastles.',
      1, mockBible
    );
    expect(card.setting.toLowerCase()).toMatch(/beach/);
  });

  // ── FALLBACK ──

  it('returns "Storybook scene" for generic text with no location', () => {
    const card = generatePageSceneCard(
      'Riri smiled and felt happy about the adventure.',
      1, mockBible
    );
    expect(card.setting).toBe('Storybook scene');
  });

  // ── KEY OBJECTS ──

  it('extracts rocket ship as key object', () => {
    const card = generatePageSceneCard(
      'Riri found a colorful rocket ship in the backyard.',
      1, mockBible
    );
    expect(card.key_objects).toContain('rocket ship');
  });

  it('extracts rainbow as key object', () => {
    const card = generatePageSceneCard(
      'A beautiful rainbow appeared in the sky after the rain.',
      1, mockBible
    );
    expect(card.key_objects).toContain('rainbow');
  });

  // ── SUPPORTING CHARACTERS ──

  it('extracts dolphins as supporting characters', () => {
    const card = generatePageSceneCard(
      'Riri swam with playful dolphins in the ocean.',
      1, mockBible
    );
    expect(card.supporting_characters).toContain('dolphins');
  });

  it('extracts rabbit/bunny as supporting characters for moon story', () => {
    const card = generatePageSceneCard(
      'Riri met friendly rabbit friends hopping on the moon.',
      1, mockBible
    );
    expect(card.supporting_characters).toContain('rabbit');
  });

  it('does not extract rhinoceros as supporting character (main character)', () => {
    const card = generatePageSceneCard(
      'Riri the rhinoceros waved goodbye.',
      1, mockBible
    );
    // rhinoceros is main character, should not be in supporting
    expect(card.supporting_characters).not.toContain('rhinoceros');
  });
});
