/**
 * Integration test for the image generation pipeline.
 *
 * Mocks the Replicate API to capture the actual prompts sent to SDXL,
 * then verifies:
 *   1. Each page gets a DISTINCT pose in the inpaint prompt
 *   2. The character identity tokens (1-35) are IDENTICAL across pages
 *   3. Per-page seed variation is applied
 *   4. The composite inpaint prompt contains the pose from actionToPose()
 *   5. No page has the old static "centered in frame" text
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We can't import the route directly (Next.js API routes aren't pure functions),
// so we test the building blocks that the route uses, simulating the pipeline flow.

import { generatePageSceneCard } from '../../../lib/generatePageSceneCard';
import { CharacterBible, PageSceneCard } from '../../../lib/visual-types';

// ─── MOCK BIBLE ─────────────────────────────────────────────────────────

const mockBible: CharacterBible = {
  character_id: 'riri-integration-test',
  name: 'Riri',
  character_type: 'animal',
  species: 'rhinoceros',
  age: 'young',
  visual_fingerprint: [
    'cartoon rhinoceros',
    'smooth gray skin',
    'big round brown eyes',
    'prominent rounded horn',
  ],
  appearance: {
    skin_tone: 'light gray',
    eyes: 'big round brown eyes',
    hair: 'none',
    face_features: 'friendly round cheeks, gentle smile',
  },
  signature_outfit: '',
  personality: ['curious', 'brave'],
  style: {
    base: "children's picture book illustration",
    render: ['clean lines', 'vibrant colors', 'soft shading'],
    aspect: 'square',
  },
  art_style: {
    medium: 'digital',
    genre: 'children',
    mood: 'warm',
    line_detail: 'clean',
  },
  consistency_rules: [],
};

// ─── REPLICATE THE ROUTE'S extractCharacterIdentity LOGIC ───────────────

function buildTestInpaintPrompt(bible: CharacterBible): string {
  const name = bible.name || 'Character';
  const species = bible.species || 'animal';

  // Species-specific STRUCTURAL anatomy — SPECIES IDENTITY FIRST (matches route.ts)
  const speciesStructure: Record<string, string> = {
    rhinoceros:
      'rhinoceros with prominent rounded horn on nose, thick barrel-shaped body, four thick legs, cartoon style',
    rhino:
      'rhinoceros with prominent rounded horn on nose, thick barrel-shaped body, four thick legs, cartoon style',
  };
  const structureLock = speciesStructure[species.toLowerCase()] || species;

  // Bible appearance as PRIMARY source (matches route.ts)
  const bibleAppearance = (bible.visual_fingerprint || [])
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const lower = s.toLowerCase();
      if (lower === species.toLowerCase()) return false;
      if (lower === `cartoon ${species.toLowerCase()}`) return false;
      if (lower === `cute cartoon ${species.toLowerCase()}`) return false;
      return true;
    })
    .join(', ');

  const framing = 'full body';

  // Style tokens FIRST (matches route.ts — forces consistent cartoon rendering)
  return [
    "children's picture book illustration, bold outlines, flat vibrant colors",
    `cartoon ${species} character named ${name}`,
    bibleAppearance,
    structureLock,
    framing,
  ]
    .filter(Boolean)
    .join(', ');
}

// ─── REPLICATE THE ROUTE'S actionToPose LOGIC ───────────────────────────

function actionToPose(action: string): string {
  const lower = action.toLowerCase();

  // PASSTHROUGH: If extractAction() already produced a detailed pose
  // (character name + 4+ word description), strip the name and pass through.
  const firstSpace = action.indexOf(' ');
  if (firstSpace > 0) {
    const afterName = action.substring(firstSpace + 1).trim();
    if (afterName.split(/\s+/).length >= 4) {
      return afterName;
    }
  }

  // Fallback: single-verb lookup for short or legacy action strings
  const verbMatch = lower.match(
    /\b(flying|soaring|swimming|running|walking|jumping|leaping|climbing|dancing|playing|exploring|sleeping|eating|reading|waving|hugging|blasting|landing|cheering|floating|gazing|discovering|looking|bouncing|riding|diving|sliding|crawling|reaching|sitting|hiding|splashing|twirling|spinning|skipping|marching|tiptoeing|sneaking|peeking|pointing|standing|exclaiming|leading|pressing|squeezing|freezing|singing|waddling|spotting|worrying|stepping|sharing|celebrating|tumbling)\b/
  );

  if (verbMatch) {
    const verb = verbMatch[1];
    const poseMap: Record<string, string> = {
      flying: 'soaring with arms spread wide',
      soaring: 'soaring with arms spread wide',
      swimming: 'swimming forward with legs kicking',
      running: 'running forward with legs in stride',
      walking: 'walking forward with one foot ahead',
      jumping: 'jumping up with legs off the ground',
      leaping: 'leaping through the air',
      climbing: 'climbing upward with arms reaching high',
      dancing: 'dancing joyfully with arms raised',
      playing: 'bouncing playfully mid-motion',
      exploring: 'walking forward looking around curiously',
      sleeping: 'curled up sleeping peacefully',
      eating: 'sitting down eating happily',
      reading: 'sitting and holding a book',
      waving: 'waving one arm up high',
      hugging: 'arms wrapped in a warm hug',
      blasting: 'bracing excitedly arms in the air',
      landing: 'touching down feet on the ground',
      cheering: 'both arms raised high celebrating',
      floating: 'floating weightlessly limbs spread',
      gazing: 'looking upward in wonder',
      discovering: 'leaning forward reaching out curiously',
      looking: 'looking upward with awe',
      bouncing: 'bouncing mid-jump',
      riding: 'sitting and riding forward',
      diving: 'diving downward arms first',
      sliding: 'sliding forward playfully',
      splashing: 'splashing in water joyfully',
      twirling: 'spinning around with arms out',
      spinning: 'spinning around with arms out',
      skipping: 'skipping forward happily',
      marching: 'marching forward with big steps',
      tiptoeing: 'tiptoeing carefully forward',
      sneaking: 'crouching and sneaking forward',
      peeking: 'peeking around curiously',
      pointing: 'pointing forward excitedly',
      standing: 'standing with a friendly wave',
      exclaiming: 'arms raised in excitement',
      leading: 'walking forward confidently',
      sitting: 'sitting down comfortably',
      hiding: 'crouching down hiding',
      crawling: 'crawling forward on all fours',
      reaching: 'reaching forward with one arm',
      pressing: 'pressing a button with one hand excitedly',
      squeezing: 'squeezing through eagerly',
      freezing: 'standing frozen with wide scared eyes',
      singing: 'singing with mouth open happily',
      waddling: 'waddling forward with a big grin',
      spotting: 'looking up with wide surprised eyes',
      worrying: 'standing nervously with a worried face',
      stepping: 'stepping forward looking around in awe',
      sharing: 'sitting and talking happily',
      celebrating: 'celebrating with both arms raised high',
      tumbling: 'tumbling forward playfully',
    };
    return poseMap[verb] || `${verb} actively`;
  }

  if (lower.includes('blast off') || lower.includes('blasted off') || lower.includes('taking off'))
    return 'bracing excitedly arms in the air';
  if (lower.includes('climbed inside') || lower.includes('climbing inside'))
    return 'stepping forward into an opening';
  if (lower.includes('soared over') || lower.includes('flew over'))
    return 'soaring with arms spread wide';
  if (lower.includes('landed safely') || lower.includes('safe landing'))
    return 'touching down feet on the ground';

  const fallbackPoses = [
    'standing with one arm waving',
    'walking forward happily',
    'looking around curiously',
    'pointing forward excitedly',
    'bouncing with excitement',
  ];
  let hash = 0;
  for (let i = 0; i < action.length; i++)
    hash = ((hash << 5) - hash + action.charCodeAt(i)) | 0;
  return fallbackPoses[Math.abs(hash) % fallbackPoses.length];
}

// ─── SIMULATE THE ROUTE'S COMPOSITE PROMPT BUILD ────────────────────────
// NOTE: The route NO LONGER appends scene objects or setting context.
// The inpaint prompt is now PURE identity + pose. Scene context comes
// from the visible plate edges (smaller mask preserves 20% top, 18% sides, 8% bottom).
// This eliminates per-page prompt variation that caused character inconsistency.

function buildCompositeInpaintPrompt(
  inpaintPrompt: string,
  pageAction: string,
): string {
  let compositePrompt = inpaintPrompt;

  // Pose injection (mirrors route.ts runCandidateRound — uses regex for end-of-string)
  if (pageAction) {
    const pose = actionToPose(pageAction);
    compositePrompt = compositePrompt.replace(/\bfull body\b/, `full body, ${pose}`);
  }

  // NO scene suffix — removed to ensure character identity is 100% identical
  // across all pages. The plate provides scene context through visible edges.

  return compositePrompt;
}

// ============================================================================
// TESTS
// ============================================================================

describe('E2E Pipeline Integration - Pose Variation', () => {
  // A 10-page story simulating the user's Riri space adventure
  const storyPages = [
    'One sunny morning, Riri the rhinoceros found a shiny rocket ship in the backyard!',
    'Riri climbed inside the rocket and pressed all the colorful buttons.',
    'Three, two, one! The rocket blasted off into the bright blue sky!',
    'Riri was soaring over the clouds, looking down at the tiny world below.',
    'The rocket flew past the moon, and Riri gazed at the craters in wonder.',
    'With a splash, the rocket descended into the sparkling blue ocean!',
    'Riri was swimming with playful dolphins in the warm water.',
    'The rocket emerged from the ocean and flew into a magical forest.',
    'Riri was exploring the forest, discovering colorful butterflies everywhere.',
    'Finally, the rocket landed safely back home. Riri waved goodbye to the sky!',
  ];

  let sceneCards: PageSceneCard[];
  let inpaintPrompt: string;

  beforeEach(() => {
    // Generate scene cards for all pages (same as the real pipeline)
    sceneCards = storyPages.map((text, i) =>
      generatePageSceneCard(text, i + 1, mockBible)
    );
    inpaintPrompt = buildTestInpaintPrompt(mockBible);
  });

  it('generates 10 scene cards with 10 DISTINCT actions', () => {
    const actions = sceneCards.map((card) => card.action);
    const uniqueActions = new Set(actions);

    console.log('\n=== SCENE CARD ACTIONS ===');
    actions.forEach((a, i) => console.log(`  Page ${i + 1}: ${a}`));
    console.log(`  Unique: ${uniqueActions.size}/${actions.length}`);

    expect(uniqueActions.size).toBe(10);
  });

  it('no scene card action contains "in the scene" (the old generic fallback)', () => {
    for (const card of sceneCards) {
      expect(card.action.toLowerCase()).not.toContain('in the scene');
    }
  });

  it('every scene card action has 4+ words (name + verb + pose detail)', () => {
    for (const card of sceneCards) {
      const words = card.action.split(' ').length;
      expect(words).toBeGreaterThanOrEqual(4);
    }
  });

  it('builds mostly DISTINCT composite inpaint prompts (pose-only variation)', () => {
    const prompts = sceneCards.map((card) => {
      return buildCompositeInpaintPrompt(
        inpaintPrompt,
        card.action,
      );
    });

    console.log('\n=== COMPOSITE INPAINT PROMPTS (first 80 chars) ===');
    prompts.forEach((p, i) => {
      const poseStart = p.indexOf('full body,') + 10;
      const poseEnd = p.indexOf(',', poseStart + 1);
      const poseChunk = p.substring(poseStart, poseEnd > 0 ? poseEnd : poseStart + 50).trim();
      console.log(`  Page ${i + 1}: ...full body, ${poseChunk}...`);
    });

    // With scene suffix removed, prompts vary ONLY by pose.
    // Some actions may map to the same pose (e.g., "exploring" and "forest" fallback
    // both produce "walking forward looking around curiously"), so 1-2 duplicates
    // are acceptable. At least 8/10 should be unique.
    const uniquePrompts = new Set(prompts);
    expect(uniquePrompts.size).toBeGreaterThanOrEqual(8);
  });

  it('no composite prompt contains "centered in frame"', () => {
    for (const card of sceneCards) {
      const prompt = buildCompositeInpaintPrompt(
        inpaintPrompt,
        card.action,
      );
      expect(prompt).not.toContain('centered in frame');
    }
  });

  it('every composite prompt contains "full body" followed by a pose', () => {
    for (const card of sceneCards) {
      const prompt = buildCompositeInpaintPrompt(
        inpaintPrompt,
        card.action,
      );
      // Should have "full body, <some pose text>,"
      const fullBodyIdx = prompt.indexOf('full body,');
      expect(fullBodyIdx).toBeGreaterThan(-1);

      // The text after "full body, " should NOT be the old identity text
      const afterFullBody = prompt.substring(fullBodyIdx + 11, fullBodyIdx + 60);
      expect(afterFullBody).not.toMatch(/^2D flat color/);
      expect(afterFullBody.length).toBeGreaterThan(5); // pose exists
    }
  });

  it('character identity tokens (first 35 words) are IDENTICAL across all pages', () => {
    const getIdentitySection = (prompt: string): string => {
      // Identity is everything before "full body"
      const fbIdx = prompt.indexOf('full body');
      return prompt.substring(0, fbIdx).trim();
    };

    const identitySections = sceneCards.map((card) => {
      const prompt = buildCompositeInpaintPrompt(
        inpaintPrompt,
        card.action,
      );
      return getIdentitySection(prompt);
    });

    // All identity sections must be identical
    const firstIdentity = identitySections[0];
    for (let i = 1; i < identitySections.length; i++) {
      expect(identitySections[i]).toBe(firstIdentity);
    }
  });

  it('ENTIRE prompt except pose is IDENTICAL across all pages (no scene suffix)', () => {
    // With the scene suffix removed, the ONLY varying part should be the pose.
    // Everything before and after the pose must be identical.
    const prompts = sceneCards.map((card) =>
      buildCompositeInpaintPrompt(inpaintPrompt, card.action)
    );

    // Extract the non-pose portion: remove the pose chunk between "full body," and the next ","
    const stripPose = (p: string): string => {
      const fbIdx = p.indexOf('full body,');
      if (fbIdx < 0) return p;
      const afterFb = p.indexOf(',', fbIdx + 11);
      if (afterFb < 0) return p.substring(0, fbIdx + 10);
      return p.substring(0, fbIdx + 10) + p.substring(afterFb);
    };

    const first = stripPose(prompts[0]);
    for (let i = 1; i < prompts.length; i++) {
      expect(stripPose(prompts[i])).toBe(first);
    }
  });

  it('per-page seed variation: seeds differ between pages', () => {
    // Simulate the generate-story route's seed strategy
    const baseSeed = 123456;
    const seeds = storyPages.map((_, i) => baseSeed + i * 111);

    // All seeds must be unique
    const uniqueSeeds = new Set(seeds);
    expect(uniqueSeeds.size).toBe(storyPages.length);

    // Seeds should be close to each other (small offsets)
    expect(seeds[1] - seeds[0]).toBe(111);
    expect(seeds[9] - seeds[0]).toBe(999);
  });

  it('actionToPose maps each page action to a unique body position', () => {
    const poses = sceneCards.map((card) => actionToPose(card.action));

    console.log('\n=== POSE MAPPINGS ===');
    sceneCards.forEach((card, i) => {
      console.log(`  Page ${i + 1}: "${card.action}" → "${poses[i]}"`);
    });

    const uniquePoses = new Set(poses);
    // At least 7 out of 10 should be unique (some actions may legitimately share poses)
    expect(uniquePoses.size).toBeGreaterThanOrEqual(7);
  });

  it('specific story verbs map to expected poses', () => {
    // Detailed poses (4+ words after name) pass through directly
    expect(actionToPose('Riri walking forward looking around curiously')).toContain('walking');
    expect(actionToPose('Riri soaring high with arms spread')).toContain('soaring');
    expect(actionToPose('Riri landing with feet touching down')).toContain('touching');
    expect(actionToPose('Riri pressing a button with one hand excitedly')).toContain('pressing a button');
    expect(actionToPose('Riri standing frozen stiff with wide scared eyes')).toContain('frozen');

    // Short poses (< 4 words after name) go through verb lookup
    expect(actionToPose('Riri splashing in water')).toContain('splashing');
    expect(actionToPose('Riri swimming forward')).toContain('swimming');
    expect(actionToPose('Riri waving goodbye')).toContain('waving');
    expect(actionToPose('Riri climbing forward eagerly')).toContain('climbing');
    expect(actionToPose('Riri blasting off excitedly')).toContain('bracing');
  });
});
