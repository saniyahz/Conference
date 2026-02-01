import { NormalizedScene, CharacterCanon } from "./visual-types";

/**
 * Normalize page text into a structured scene specification.
 * This is DETERMINISTIC - same input always produces same output.
 * NEVER throws - always returns a valid scene.
 *
 * EXPLICIT SCENE TYPE DETECTION - specific rules for common story patterns
 */
export function normalizeScene(
  pageText: string,
  canon: CharacterCanon
): NormalizedScene {
  // Safety check
  if (!pageText || pageText.trim().length === 0) {
    console.warn('[normalizeScene] Empty page text, using fallback');
    return createFallbackScene(canon);
  }

  const lowerText = pageText.toLowerCase();
  console.log(`[normalizeScene] Processing: "${lowerText.substring(0, 100)}..."`);

  // EXPLICIT SCENE TYPE DETECTION - check specific patterns FIRST

  // ROCKET + MEADOW = Rocket discovery scene (NOT underwater!)
  if (lowerText.includes('rocket') && lowerText.includes('meadow')) {
    console.log('[normalizeScene] EXPLICIT: Rocket discovery in meadow');
    return {
      sceneType: 'rocket discovery',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center foreground',
        visibility: 'full body visible',
        action: `${canon.name} standing beside an old rocket ship`,
      },
      supportingElements: [
        { type: 'old rusty rocket ship', count: 1, position: 'background center' },
      ],
      environment: {
        setting: 'forest meadow',
        elements: ['grass', 'flowers', 'blue sky', 'trees in distance'],
      },
      exclusions: ['no water', 'no ocean', 'no fish', 'no underwater', 'no scuba gear', 'no coral'],
    };
  }

  // SPACE/COSMOS travel scenes
  if ((lowerText.includes('space') || lowerText.includes('cosmos')) &&
      (lowerText.includes('travel') || lowerText.includes('soar') || lowerText.includes('blast'))) {
    console.log('[normalizeScene] EXPLICIT: Space travel');
    return {
      sceneType: 'space travel',
      camera: 'wide',
      mainCharacter: {
        id: canon.id,
        position: 'center',
        visibility: 'full body visible',
        action: `${canon.name} inside or near a rocket ship`,
      },
      supportingElements: [
        { type: 'rocket ship', count: 1, position: 'around character' },
      ],
      environment: {
        setting: 'outer space',
        elements: ['stars', 'planets', 'dark sky', 'cosmic dust'],
      },
      exclusions: ['no grass', 'no water', 'no fish', 'no trees', 'no land animals', 'no ocean'],
    };
  }

  // ALIENS meeting scene
  if (lowerText.includes('alien')) {
    console.log('[normalizeScene] EXPLICIT: Alien encounter');
    return {
      sceneType: 'alien encounter',
      camera: 'medium-wide',
      mainCharacter: {
        id: canon.id,
        position: 'center left',
        visibility: 'full body visible',
        action: `${canon.name} meeting friendly aliens`,
      },
      supportingElements: [
        { type: 'friendly cute aliens', count: 2, position: 'center right' },
      ],
      environment: {
        setting: 'outer space',
        elements: ['alien planet surface', 'strange plants', 'colorful sky'],
      },
      exclusions: ['no water', 'no ocean', 'no fish', 'no earth animals'],
    };
  }

  // Detect environment type using keyword matching
  const envType = detectEnvironment(lowerText);
  console.log(`[normalizeScene] Detected environment: ${envType}`);

  // Detect supporting elements (animals, objects)
  const supportingElements = detectSupportingElements(lowerText);

  // Detect character action
  const action = detectAction(lowerText, canon.name);

  // Determine camera based on scene complexity
  const camera = supportingElements.length >= 2 ? "wide" : "medium-wide";

  // Build environment elements
  const envElements = getEnvironmentElements(envType);

  // Build exclusions based on environment
  const exclusions = buildExclusions(envType);

  return {
    sceneType: envType,
    camera,
    mainCharacter: {
      id: canon.id,
      position: "center foreground",
      visibility: "full body visible",
      action,
    },
    supportingElements,
    environment: {
      setting: envType,
      elements: envElements,
    },
    exclusions,
  };
}

function detectEnvironment(text: string): string {
  // Space scenes - CHECK FIRST, includes cosmos and rocket
  if (text.includes('space') || text.includes('star') || text.includes('galaxy') ||
      text.includes('cosmic') || text.includes('cosmos') || text.includes('astronaut') ||
      text.includes('rocket') || text.includes('spaceship') || text.includes('planet')) {
    return 'outer space';
  }

  // Moon scenes
  if (text.includes('moon') || text.includes('lunar')) {
    return 'moon surface';
  }

  // Underwater scenes
  if (text.includes('ocean') || text.includes('underwater') || text.includes('sea') ||
      text.includes('coral') || text.includes('swim')) {
    return 'underwater ocean';
  }

  // Sky scenes
  if (text.includes('cloud') || text.includes('flying') || text.includes('soaring') ||
      text.includes('sky') && !text.includes('night sky')) {
    return 'sky';
  }

  // Indoor scenes
  if (text.includes('room') || text.includes('house') || text.includes('home') ||
      text.includes('inside') || text.includes('bedroom') || text.includes('kitchen')) {
    return 'indoor';
  }

  // Cave scenes
  if (text.includes('cave') || text.includes('cavern') || text.includes('underground')) {
    return 'cave';
  }

  // Forest/meadow
  if (text.includes('forest') || text.includes('tree') || text.includes('meadow') ||
      text.includes('garden') || text.includes('flower')) {
    return 'forest meadow';
  }

  // Default
  return 'magical world';
}

function detectSupportingElements(text: string): { type: string; count: number; position: string }[] {
  const elements: { type: string; count: number; position: string }[] = [];

  // Animals/creatures with counts and positions
  const creatures: { keywords: string[]; type: string; plural: string }[] = [
    { keywords: ['shark'], type: 'friendly shark', plural: 'friendly sharks' },
    { keywords: ['dolphin'], type: 'playful dolphin', plural: 'playful dolphins' },
    { keywords: ['whale'], type: 'gentle whale', plural: 'gentle whales' },
    { keywords: ['octopus'], type: 'cute octopus', plural: 'cute octopuses' },
    { keywords: ['jellyfish'], type: 'glowing jellyfish', plural: 'glowing jellyfish' },
    { keywords: ['fish'], type: 'colorful fish', plural: 'colorful fish' },
    { keywords: ['turtle'], type: 'friendly turtle', plural: 'friendly turtles' },
    { keywords: ['crab'], type: 'cute crab', plural: 'cute crabs' },
    { keywords: ['seahorse'], type: 'tiny seahorse', plural: 'tiny seahorses' },
    { keywords: ['mermaid'], type: 'friendly mermaid', plural: 'friendly mermaids' },
    { keywords: ['dragon'], type: 'friendly dragon', plural: 'friendly dragons' },
    { keywords: ['unicorn'], type: 'magical unicorn', plural: 'magical unicorns' },
    { keywords: ['fairy', 'fairies'], type: 'tiny fairy', plural: 'tiny fairies' },
    { keywords: ['butterfly', 'butterflies'], type: 'colorful butterfly', plural: 'colorful butterflies' },
    { keywords: ['bird'], type: 'singing bird', plural: 'singing birds' },
    { keywords: ['rabbit', 'bunny'], type: 'fluffy rabbit', plural: 'fluffy rabbits' },
    { keywords: ['squirrel'], type: 'cute squirrel', plural: 'cute squirrels' },
    { keywords: ['owl'], type: 'wise owl', plural: 'wise owls' },
    { keywords: ['bear'], type: 'friendly bear', plural: 'friendly bears' },
    { keywords: ['fox'], type: 'clever fox', plural: 'clever foxes' },
    { keywords: ['deer'], type: 'gentle deer', plural: 'gentle deer' },
  ];

  const positions = ['background left', 'background right', 'beside main character', 'swimming around', 'flying above'];
  let posIndex = 0;

  for (const creature of creatures) {
    for (const keyword of creature.keywords) {
      // Check for plural first
      if (text.includes(keyword + 's') || (keyword.endsWith('y') && text.includes(keyword.slice(0, -1) + 'ies'))) {
        elements.push({
          type: creature.plural,
          count: 2,
          position: positions[posIndex % positions.length],
        });
        posIndex++;
        break;
      } else if (text.includes(keyword)) {
        elements.push({
          type: creature.type,
          count: 1,
          position: positions[posIndex % positions.length],
        });
        posIndex++;
        break;
      }
    }
  }

  // Objects
  const objects: { keyword: string; type: string }[] = [
    { keyword: 'rocket', type: 'silver rocket ship' },
    { keyword: 'spaceship', type: 'shiny spaceship' },
    { keyword: 'treasure', type: 'golden treasure chest' },
    { keyword: 'crown', type: 'sparkling crown' },
    { keyword: 'wand', type: 'magical wand' },
    { keyword: 'castle', type: 'majestic castle' },
    { keyword: 'boat', type: 'wooden boat' },
    { keyword: 'balloon', type: 'colorful hot air balloon' },
    { keyword: 'rainbow', type: 'bright rainbow' },
  ];

  for (const obj of objects) {
    if (text.includes(obj.keyword)) {
      elements.push({
        type: obj.type,
        count: 1,
        position: positions[posIndex % positions.length],
      });
      posIndex++;
    }
  }

  // Limit to 4 supporting elements max
  return elements.slice(0, 4);
}

function detectAction(text: string, characterName: string): string {
  const name = characterName.toLowerCase();

  // Specific actions
  if (text.includes('landed') || text.includes('landing')) return `${characterName} landing/just landed`;
  if (text.includes('swimming') || text.includes('swam')) return `${characterName} swimming`;
  if (text.includes('flying') || text.includes('flew') || text.includes('soar')) return `${characterName} flying`;
  if (text.includes('running') || text.includes('ran')) return `${characterName} running`;
  if (text.includes('jumping') || text.includes('jumped')) return `${characterName} jumping`;
  if (text.includes('climbing') || text.includes('climbed')) return `${characterName} climbing`;
  if (text.includes('dancing') || text.includes('danced')) return `${characterName} dancing`;
  if (text.includes('hugging') || text.includes('hugged')) return `${characterName} hugging`;
  if (text.includes('waving') || text.includes('waved')) return `${characterName} waving`;
  if (text.includes('looking') || text.includes('gazing') || text.includes('staring')) return `${characterName} looking with wonder`;
  if (text.includes('exploring') || text.includes('discovered')) return `${characterName} exploring curiously`;
  if (text.includes('standing')) return `${characterName} standing`;
  if (text.includes('sitting') || text.includes('sat')) return `${characterName} sitting`;

  // Emotional states as actions
  if (text.includes('excited') || text.includes('thrilled')) return `${characterName} looking excited`;
  if (text.includes('surprised') || text.includes('amazed')) return `${characterName} looking amazed`;
  if (text.includes('happy') || text.includes('joyful')) return `${characterName} smiling happily`;
  if (text.includes('curious') || text.includes('wonder')) return `${characterName} looking curious`;

  // Default
  return `${characterName} in the scene`;
}

function getEnvironmentElements(envType: string): string[] {
  switch (envType) {
    case 'outer space':
      return ['dark starry sky', 'distant planets', 'twinkling stars', 'cosmic dust'];
    case 'moon surface':
      return ['gray moon surface', 'craters', 'Earth in the distance', 'starry black sky'];
    case 'underwater ocean':
      return ['blue water', 'bubbles', 'coral reef', 'rays of light from above'];
    case 'sky':
      return ['fluffy white clouds', 'blue sky', 'birds in distance', 'sunshine'];
    case 'indoor':
      return ['cozy room', 'warm lighting', 'furniture', 'homey details'];
    case 'cave':
      return ['rocky walls', 'mysterious glow', 'stalactites', 'adventure feeling'];
    case 'forest meadow':
      return ['green trees', 'colorful flowers', 'soft grass', 'warm sunlight'];
    default:
      return ['magical atmosphere', 'soft colors', 'dreamy lighting'];
  }
}

function buildExclusions(envType: string): string[] {
  const base = [
    'no portraits',
    'no close-ups',
    'no outfit changes',
    'no alternate hairstyles',
    'no text',
    'no logos',
    'no watermarks',
  ];

  switch (envType) {
    case 'outer space':
    case 'moon surface':
      return [...base, 'no trees', 'no grass', 'no water', 'no animals', 'no buildings', 'no earth scenery'];
    case 'underwater ocean':
      return [...base, 'no trees', 'no grass', 'no sky', 'no land', 'no buildings'];
    case 'sky':
      return [...base, 'no ground details', 'no underwater', 'no space'];
    case 'indoor':
      return [...base, 'no outdoor scenery', 'no wilderness'];
    case 'forest meadow':
      return [...base, 'no space', 'no underwater', 'no buildings'];
    default:
      return base;
  }
}

/**
 * Create a fallback scene when parsing fails
 */
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
      elements: ['magical atmosphere', 'soft colors', 'dreamy lighting'],
    },
    exclusions: ['no portraits', 'no close-ups', 'no text', 'no logos', 'no watermarks'],
  };
}
