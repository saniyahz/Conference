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

// ── PAST-TENSE VERB MATCHING ──

describe('generatePageSceneCard - past-tense verb matching', () => {
  it('matches "danced" to dancing pose', () => {
    const card = generatePageSceneCard(
      'Riri danced joyfully with the moon creatures.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/danc/);
  });

  it('matches "swam" to swimming pose', () => {
    const card = generatePageSceneCard(
      'Riri swam to the shore and climbed out of the water.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/swim/);
  });

  it('matches "climbed" to climbing pose', () => {
    const card = generatePageSceneCard(
      'Riri climbed up the tall mountain.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/climb/);
  });

  it('matches "played" to playing pose', () => {
    const card = generatePageSceneCard(
      'Riri played with his new friends all day long.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/play|bounc/);
  });

  it('matches "explored" to exploring pose', () => {
    const card = generatePageSceneCard(
      'Riri explored the deep cave filled with crystals.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/explor|walk|forward|curiously/);
  });

  it('matches "laughed" to laughing pose', () => {
    const card = generatePageSceneCard(
      'Riri laughed at the silly clown fish.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/laugh/);
  });

  it('matches "exclaimed" to exclaiming pose', () => {
    const card = generatePageSceneCard(
      'Riri exclaimed with delight at the beautiful rainbow.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/exclaim|arms raised/);
  });

  it('matches "jumped" to jumping pose', () => {
    const card = generatePageSceneCard(
      'Riri jumped over the puddle with a big smile.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/jump/);
  });

  it('matches "flew" to flying pose', () => {
    const card = generatePageSceneCard(
      'Riri flew through the clouds on a magic carpet.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/fly|soar|arms|spread/);
  });

  it('matches "soared" to soaring pose', () => {
    const card = generatePageSceneCard(
      'Riri soared above the treetops.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/soar/);
  });

  it('matches "ran" to running pose', () => {
    const card = generatePageSceneCard(
      'Riri ran across the meadow as fast as he could.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/run/);
  });
});

// ── NEW COMPOUND ACTION PATTERNS ──

describe('generatePageSceneCard - new compound actions', () => {
  it('matches "froze" to frozen/scared pose', () => {
    const card = generatePageSceneCard(
      'Riri suddenly froze when he saw a pride of lions.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/frozen|stiff|scared/);
  });

  it('matches "pressed a button" to pressing pose', () => {
    const card = generatePageSceneCard(
      'Riri pressed a big red button and the rocket began to lift off.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/press|button/);
  });

  it('matches "squeezed inside" to squeezing pose', () => {
    const card = generatePageSceneCard(
      'Riri squeezed himself inside the rocket ship.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/squeez/);
  });

  it('matches "picnic" to sitting/eating pose', () => {
    const card = generatePageSceneCard(
      'The picnic was delightful with delicious fruits and laughter.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/picnic|sitting|eating/);
  });

  it('matches "shared stories" to sitting/talking pose', () => {
    const card = generatePageSceneCard(
      'Riri shared stories about the moon while everyone listened.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/shared stories|sitting|talking/);
  });

  it('matches "spotted" to looking/pointing pose', () => {
    const card = generatePageSceneCard(
      'Riri spotted something unusual in the sky above.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/looking|surprised|point/);
  });

  it('matches "worried" to nervous pose', () => {
    const card = generatePageSceneCard(
      'Riri worried that the lions might be scary.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/worried|nervous/);
  });

  it('matches "stepped outside" to stepping/exploring pose', () => {
    const card = generatePageSceneCard(
      'Riri stepped outside and saw the magical moon surface.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/step|forward|awe/);
  });

  it('matches "waddled" to waddling pose', () => {
    const card = generatePageSceneCard(
      'Riri waddled over to the shiny rocket ship.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/waddl/);
  });
});

// ── CHARACTER PROXIMITY FILTERING ──

describe('generatePageSceneCard - character proximity filtering', () => {
  it('does NOT match "bouncing" from "bouncing bunnies" as Riri action', () => {
    const card = generatePageSceneCard(
      'Riri stepped outside the rocket. The moon was magical with bouncing bunnies and dancing bears.',
      1, mockBible
    );
    // Should match "stepped outside" (Riri's action), NOT "bouncing" (bunnies' action)
    expect(card.action.toLowerCase()).toMatch(/step/);
    expect(card.action.toLowerCase()).not.toMatch(/bouncing/);
  });

  it('matches verbs near the character name, not near supporting characters', () => {
    const card = generatePageSceneCard(
      'The dolphins were jumping high. Riri laughed and clapped his feet.',
      1, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/laugh/);
  });
});

// ── RIRI MOON ADVENTURE REGRESSION TEST ──

describe('generatePageSceneCard - Riri Moon Adventure regression', () => {
  it('Page 1: detects "spotted" or "exclaimed" — not generic emotion fallback', () => {
    const card = generatePageSceneCard(
      'one sunny day, while wandering near a shimmering lake, riri spotted something unusual in the sky. it was a shiny rocket ship, glimmering under the bright sun. "wow! i wonder where that rocket goes!" riri exclaimed with excitement in his big round eyes.',
      1, mockBible
    );
    // Both "spotted" and "exclaimed" are valid Riri actions — either is better than emotion fallback
    expect(card.action.toLowerCase()).toMatch(/spot|looking|surprised|point|exclaim|arms raised/);
  });

  it('Page 2: detects "pressed a button" or "squeezed" — not gazing', () => {
    const card = generatePageSceneCard(
      'without a second thought, riri decided to investigate. he waddled over to the rocket ship, which stood tall and sparkly, with a door invitingly open. riri squeezed himself inside, amazed by all the buttons and blinking lights. riri pressed a big red button, and with a loud whoosh, the rocket began to lift off the ground!',
      2, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/squeez|press|button/);
  });

  it('Page 3: detects Riri stepping onto moon, NOT bouncing bunnies', () => {
    const card = generatePageSceneCard(
      'up, up, up riri went, past fluffy clouds and dazzling stars. the rocket ship zoomed through space, and soon, riri could see a bright shining moon ahead. as the rocket landed with a soft thud, riri opened the door and stepped outside. the moon was magical, with sparkling dust and friends he had never met before. there were bouncing bunnies and dancing bears, all welcoming riri with smiles.',
      3, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/step/);
    expect(card.action.toLowerCase()).not.toMatch(/bouncing/);
  });

  it('Page 4: detects hopping/dancing/playing — NOT floating weightlessly', () => {
    const card = generatePageSceneCard(
      'riri felt a rush of happiness as he played with his new friends. they hopped, danced, and explored the moon\'s craters together. but soon, riri realized it was time to go home.',
      4, mockBible
    );
    // Should detect hop/play/dance/explore — not floating (moon fallback)
    expect(card.action.toLowerCase()).toMatch(/hop|play|danc|explor|bounc/);
    expect(card.action.toLowerCase()).not.toMatch(/floating weightlessly/);
  });

  it('Page 7: detects "froze" (fear) — NOT generic walking', () => {
    const card = generatePageSceneCard(
      'after a fun swim, riri had a great idea. "let\'s explore the forest!" he shouted, and his friends cheered in agreement. they swam to the shore and climbed out of the water, shaking off droplets like happy puppies. as they wandered into the lush forest, riri suddenly froze. in the distance, he saw a pride of lions resting under a big shady tree. "oh no! what if they\'re scary?" riri worried, his heart beating fast.',
      7, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/frozen|froze|stiff|scared/);
  });

  it('Page 9: detects picnic — NOT bouncing joyfully', () => {
    const card = generatePageSceneCard(
      'the picnic was delightful, with delicious fruits and lots of laughter. riri shared stories about the moon, while the lions told tales of the forest. everyone learned something new, and soon they all felt like one big happy family.',
      9, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/picnic|sitting|eating/);
  });

  it('Page 10: detects dancing/singing — not generic', () => {
    const card = generatePageSceneCard(
      'as the sun began to set, painting the sky in shades of orange and pink, riri and his friends celebrated their wonderful day together. they danced, sang songs, and promised to always stay in touch.',
      10, mockBible
    );
    expect(card.action.toLowerCase()).toMatch(/celebrat|danc|sing|sang/);
  });
});
