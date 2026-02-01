import { NormalizedScene, CharacterCanon } from "./visual-types";

/**
 * Normalize page text into a structured scene specification.
 * PRIORITY: Ground-level scenes FIRST, then space scenes
 * A rocket in a forest = FOREST scene, not space scene
 */
export function normalizeScene(
  pageText: string,
  canon: CharacterCanon
): NormalizedScene {
  if (!pageText || pageText.trim().length === 0) {
    console.warn('[normalizeScene] Empty page text, using fallback');
    return createFallbackScene(canon);
  }

  const lowerText = pageText.toLowerCase();
  console.log(`[normalizeScene] Processing: "${lowerText.substring(0, 100)}..."`);

  // PRIORITY 1: GROUND-LEVEL SCENES (check FIRST)

  // DESERT scene
  if (lowerText.includes('desert') || lowerText.includes('dune') || lowerText.includes('sandy')) {
    console.log('[normalizeScene] EXPLICIT: Desert scene');
    const hasCamels = lowerText.includes('camel');
    return {
      sceneType: 'desert',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center foreground',
        visibility: 'full body visible',
        action: `${canon.name} in the desert`,
      },
      supportingElements: hasCamels ? [
        { type: 'camels walking', count: 3, position: 'background' },
      ] : [],
      environment: {
        setting: 'desert',
        elements: ['sandy dunes', 'warm sky', 'distant horizon'],
      },
      exclusions: ['no water', 'no ocean', 'no trees', 'no snow', 'no fish', 'no space'],
    };
  }

  // FOREST/WOODS scene - EVEN IF ROCKET IS MENTIONED
  if (lowerText.includes('forest') || lowerText.includes('woods') || lowerText.includes('tree')) {
    console.log('[normalizeScene] EXPLICIT: Forest scene');
    const hasRocket = lowerText.includes('rocket');
    const hasWaterfall = lowerText.includes('waterfall');
    return {
      sceneType: 'forest',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center foreground',
        visibility: 'full body visible',
        action: `${canon.name} exploring the forest`,
      },
      supportingElements: [
        ...(hasRocket ? [{ type: 'shiny rocket ship', count: 1, position: 'background' }] : []),
        ...(hasWaterfall ? [{ type: 'waterfall', count: 1, position: 'side' }] : []),
      ],
      environment: {
        setting: 'forest meadow',
        elements: ['green trees', 'forest path', 'sunlight'],
      },
      exclusions: ['no space', 'no planets', 'no stars', 'no ocean', 'no fish', 'no underwater'],
    };
  }

  // VILLAGE/MEADOW scene
  if (lowerText.includes('village') || lowerText.includes('hill') || lowerText.includes('meadow')) {
    console.log('[normalizeScene] EXPLICIT: Village/meadow scene');
    const hasRocket = lowerText.includes('rocket');
    return {
      sceneType: 'village',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center foreground',
        visibility: 'full body visible',
        action: `${canon.name} in the countryside`,
      },
      supportingElements: hasRocket ? [
        { type: 'rocket ship', count: 1, position: 'background' },
      ] : [],
      environment: {
        setting: 'forest meadow',
        elements: ['rolling hills', 'green grass', 'blue sky'],
      },
      exclusions: ['no space', 'no planets', 'no ocean', 'no fish', 'no underwater'],
    };
  }

  // PRIORITY 2: SPACE SCENES - only when actually IN space
  const spaceKeywords = ['floated', 'floating', 'stars around', 'through space',
    'outer space', 'into space', 'cosmos', 'galaxy', 'asteroid', 'planet'];
  const isInSpace = spaceKeywords.some(k => lowerText.includes(k));

  // Also check for blast off / soaring into sky
  const isLaunching = (lowerText.includes('blast') && lowerText.includes('off')) ||
                      (lowerText.includes('soar') && lowerText.includes('sky'));

  if (isInSpace || isLaunching) {
    console.log('[normalizeScene] EXPLICIT: Space scene');
    return {
      sceneType: 'outer space',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center',
        visibility: 'full body visible',
        action: `${canon.name} in space`,
      },
      supportingElements: [
        { type: 'rocket ship', count: 1, position: 'nearby' },
      ],
      environment: {
        setting: 'outer space',
        elements: ['stars', 'planets', 'dark sky'],
      },
      exclusions: ['no trees', 'no grass', 'no water', 'no animals', 'no forest'],
    };
  }

  // UNDERWATER scene
  if (lowerText.includes('ocean') || lowerText.includes('underwater') ||
      lowerText.includes('sea') || lowerText.includes('coral')) {
    console.log('[normalizeScene] EXPLICIT: Underwater scene');
    const hasFish = lowerText.includes('fish') || lowerText.includes('shark') || lowerText.includes('dolphin');
    return {
      sceneType: 'underwater',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center',
        visibility: 'full body visible',
        action: `${canon.name} swimming`,
      },
      supportingElements: hasFish ? [
        { type: 'colorful fish', count: 5, position: 'around' },
      ] : [],
      environment: {
        setting: 'underwater ocean',
        elements: ['blue water', 'coral', 'bubbles'],
      },
      exclusions: ['no trees', 'no grass', 'no sky', 'no land', 'no space'],
    };
  }

  // DEFAULT: Magical storybook scene
  console.log('[normalizeScene] Using default magical world');
  return createFallbackScene(canon);
}

function createFallbackScene(canon: CharacterCanon): NormalizedScene {
  return {
    sceneType: 'magical world',
    camera: 'medium-wide',
    mainCharacter: {
      id: canon.id,
      position: 'center foreground',
      visibility: 'full body visible',
      action: `${canon.name} in the scene`,
    },
    supportingElements: [],
    environment: {
      setting: 'magical world',
      elements: ['soft colors', 'dreamy lighting'],
    },
    exclusions: ['no portraits', 'no text', 'no logos'],
  };
}
