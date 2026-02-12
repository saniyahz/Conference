import { describe, it, expect } from 'vitest';
import { generatePageSceneCard } from '../../../lib/generatePageSceneCard';
import { extractSceneCard, renderPrompt, buildVisualFingerprint } from '../../../lib/renderPrompt';
import { CharacterBible, PageSceneCard } from '../../../lib/visual-types';

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
  style: { base: "children's picture book", render: ['clean lines'], aspect: 'square' },
  art_style: { medium: 'watercolor', genre: 'children', mood: 'warm', line_detail: 'clean' },
  consistency_rules: [],
};

// ============================================================================
// TEST 1: generatePageSceneCard produces pose-descriptive actions
// ============================================================================

describe('generatePageSceneCard - action extraction produces pose descriptions', () => {
  it('extracts flying with body description', () => {
    const card = generatePageSceneCard(
      'Riri was flying through the clouds, feeling free as a bird.',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/flying|soaring|arms|spread/);
    expect(card.action).not.toBe('Riri flying'); // Must be more descriptive than just verb
  });

  it('extracts swimming with body description', () => {
    const card = generatePageSceneCard(
      'Riri was swimming through the warm ocean waters.',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/swimming|forward|kicking/);
  });

  it('extracts climbing with body description', () => {
    const card = generatePageSceneCard(
      'Riri kept climbing up the steep mountain trail.',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/climbing|upward|arms|reaching/);
  });

  it('extracts blast-off as a compound action with pose', () => {
    const card = generatePageSceneCard(
      'Three, two, one! Riri blasted off into the sky!',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/blasting|excitedly|arms/);
  });

  it('extracts exploring with body description', () => {
    const card = generatePageSceneCard(
      'Riri went exploring through the mysterious jungle.',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/walking|forward|curiously|looking/);
  });

  it('extracts landing with body description', () => {
    const card = generatePageSceneCard(
      'The rocket landed safely on the soft grass.',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/landing|feet|touching/);
  });

  it('uses emotion-based pose when no action verb found', () => {
    const card = generatePageSceneCard(
      'Riri felt excited and thrilled about the big adventure ahead!',
      1, mockBible
    );
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/jumping|excitedly|arms/);
  });

  it('never returns generic "in the scene" action', () => {
    const card = generatePageSceneCard(
      'Riri smiled and felt happy about the adventure.',
      1, mockBible
    );
    expect(card.action).not.toContain('in the scene');
  });

  it('never returns an action without body pose detail', () => {
    // Test a set of common story sentences — all should produce descriptive actions
    const texts = [
      'Riri was playing in the garden.',
      'Riri ran across the field.',
      'Riri saw amazing dolphins jumping.',
      'Riri looked at the beautiful stars.',
      'Riri explored the deep cave.',
    ];

    for (const text of texts) {
      const card = generatePageSceneCard(text, 1, mockBible);
      // Action should have at least 4 words (name + verb + pose detail)
      const wordCount = card.action.split(' ').length;
      expect(wordCount).toBeGreaterThanOrEqual(4);
      expect(card.action).not.toBe(`Riri in the scene`);
    }
  });
});

// ============================================================================
// TEST 2: Different pages produce DIFFERENT actions
// ============================================================================

describe('pose variation - different pages get different actions', () => {
  it('produces distinct actions for a 5-page space adventure', () => {
    const pages = [
      'Riri found a shiny rocket ship in the backyard!',
      'Riri climbed inside and pressed all the colorful buttons.',
      'Three, two, one! The rocket blasted off into the sky!',
      'Riri was flying past the moon, looking at craters below.',
      'With a splash, the rocket landed in the ocean!',
    ];

    const actions = pages.map((text, i) =>
      generatePageSceneCard(text, i + 1, mockBible).action
    );

    // All actions must be unique (no repeated "Riri in the scene")
    const uniqueActions = new Set(actions);
    expect(uniqueActions.size).toBe(actions.length);
  });

  it('produces distinct actions for a 5-page nature adventure', () => {
    const pages = [
      'Riri was walking through the beautiful forest.',
      'Riri discovered a hidden waterfall with sparkling water.',
      'Riri jumped over the rocks and splashed in the stream.',
      'Riri climbed to the top of the tallest hill.',
      'Riri waved goodbye to the forest friends.',
    ];

    const actions = pages.map((text, i) =>
      generatePageSceneCard(text, i + 1, mockBible).action
    );

    const uniqueActions = new Set(actions);
    expect(uniqueActions.size).toBe(actions.length);
  });
});

// ============================================================================
// TEST 3: renderPrompt.ts extractSceneCard also produces pose actions
// ============================================================================

describe('renderPrompt extractSceneCard - action extraction produces pose descriptions', () => {
  it('extracts flying with pose detail', () => {
    const card = extractSceneCard(1, 'Riri was flying through the clouds.', mockBible);
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/soaring|flying|arms|spread/);
  });

  it('extracts exploring with pose detail', () => {
    const card = extractSceneCard(1, 'Riri went exploring the magical cave.', mockBible);
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/walking|forward|curiously|looking/);
  });

  it('extracts swimming with pose detail', () => {
    const card = extractSceneCard(1, 'Riri was swimming with the dolphins.', mockBible);
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/swimming|forward|kicking/);
  });

  it('never returns generic "in the scene" fallback', () => {
    const card = extractSceneCard(1, 'Riri smiled happily.', mockBible);
    expect(card.action).not.toContain('in the scene');
  });

  it('uses emotion-based pose for wonder/amazement', () => {
    const card = extractSceneCard(1, 'Riri looked around in wonder and amazement.', mockBible);
    expect(card.action).toContain('Riri');
    expect(card.action.toLowerCase()).toMatch(/looking|upward|awe|wonder|gaz/);
  });
});

// ============================================================================
// TEST 4: Template A prompt includes action in the scene section
// ============================================================================

describe('renderPrompt - Template A includes action in scene section', () => {
  it('includes the action in the final prompt', () => {
    const card: PageSceneCard = {
      page_number: 1,
      scene_id: 'page_1',
      setting: 'Ocean with big waves',
      time_weather: 'daytime',
      action: 'Riri swimming forward with legs kicking',
      must_include: ['Riri the rhinoceros full body'],
      must_not_include: [],
      supporting_characters: [],
      key_objects: [],
      mood: 'happy',
      camera: { shot_type: 'medium', composition_notes: '' },
    };

    const prompt = renderPrompt(mockBible, card);
    expect(prompt.toLowerCase()).toContain('swimming');
  });

  it('includes different actions for different scene cards', () => {
    const flyingCard: PageSceneCard = {
      page_number: 1,
      scene_id: 'page_1',
      setting: 'Sky with clouds',
      time_weather: 'daytime',
      action: 'Riri soaring with arms spread wide',
      must_include: ['Riri the rhinoceros full body'],
      must_not_include: [],
      supporting_characters: [],
      key_objects: [],
      mood: 'happy',
      camera: { shot_type: 'medium', composition_notes: '' },
    };

    const climbingCard: PageSceneCard = {
      page_number: 2,
      scene_id: 'page_2',
      setting: 'Mountain landscape',
      time_weather: 'daytime',
      action: 'Riri climbing upward with arms reaching high',
      must_include: ['Riri the rhinoceros full body'],
      must_not_include: [],
      supporting_characters: [],
      key_objects: [],
      mood: 'brave',
      camera: { shot_type: 'medium', composition_notes: '' },
    };

    const flyingPrompt = renderPrompt(mockBible, flyingCard);
    const climbingPrompt = renderPrompt(mockBible, climbingCard);

    expect(flyingPrompt).not.toBe(climbingPrompt);
    expect(flyingPrompt.toLowerCase()).toContain('soaring');
    expect(climbingPrompt.toLowerCase()).toContain('climbing');
  });
});

// ============================================================================
// TEST 5: Fallback actions use setting context
// ============================================================================

describe('generatePageSceneCard - fallback actions use setting context', () => {
  it('uses water-related pose for ocean setting with no action verb', () => {
    const card = generatePageSceneCard(
      'The ocean was beautiful and sparkling under the sun.',
      1, mockBible
    );
    // Should pick a water-related pose, not generic standing
    expect(card.action.toLowerCase()).toMatch(/splash|swimming|water/);
  });

  it('uses space-related pose for moon setting with no action verb', () => {
    const card = generatePageSceneCard(
      'The moon was bright and the stars twinkled above.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/floating|weightlessly|limbs/);
  });

  it('uses curiosity pose for forest setting with no action verb', () => {
    const card = generatePageSceneCard(
      'The forest was tall and mysterious with ancient trees.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/walking|forward|curiously|looking/);
  });
});
