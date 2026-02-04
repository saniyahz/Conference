// Universal types for visual generation pipeline
// Architecture: Character Bible + Page Scene Cards + Prompt Renderer

/**
 * APPEARANCE SCHEMA - Different for humans vs animals
 */
export type HumanAppearance = {
  skin_tone: string;
  eyes: string;
  hair: string;
  face_features: string;
};

export type AnimalAppearance = {
  body_color: string;        // "gray", "brown", "golden"
  skin_texture: string;      // "rough leathery skin", "soft fur", "smooth scales"
  eyes: string;              // "big friendly brown eyes"
  horn?: string;             // For rhinos, unicorns, etc.
  ears?: string;             // "small rounded ears", "large floppy ears"
  markings?: string;         // "white belly patch", "black stripes"
  body_shape: string;        // "round chubby body", "sleek athletic body"
  tail?: string;             // "short stubby tail", "long fluffy tail"
};

/**
 * CHARACTER BIBLE - Generated ONCE per book
 * Store this and reuse for every page
 */
export type CharacterBible = {
  character_id: string;
  name: string;
  character_type: 'human' | 'animal' | 'object' | 'creature' | 'other';
  species?: string;  // For animals: "rhinoceros", "dog", "cat", etc.
  age: string;
  is_human: boolean;
  // Appearance differs based on character type
  appearance: HumanAppearance | AnimalAppearance;
  signature_outfit: string;
  personality: string[];
  art_style: {
    medium: string;
    genre: string;
    mood: string;
    line_detail: string;
  };
  consistency_rules: string[];
};

/**
 * PAGE SCENE CARD - One per page
 * This is the only part that changes per page
 */
export type PageSceneCard = {
  page_number: number;
  scene_id: string;
  setting: string;
  time_weather: string;
  main_action: string;
  // Separated foreground/background for SDXL clarity
  foreground_must_include: string[];  // Character + immediate objects
  background_must_include: string[];  // Environment elements
  supporting_characters: string[];
  key_objects: string[];
  required_elements: string[];        // Legacy - combined list
  forbidden_elements: string[];
  camera: {
    shot_type: "wide" | "medium" | "close-up";
    composition_notes: string;
  };
};

/**
 * STORY IMAGE PACK - Full structure stored per story
 */
export type StoryImagePack = {
  story_id: string;
  character_bible: CharacterBible;
  pages: PageSceneCard[];
  rendering: {
    size: string;
    num_images_per_page: number;
    seed_strategy: string;
  };
};

// Legacy types for backward compatibility
export type CharacterCanon = CharacterBible;
export type NormalizedScene = PageSceneCard;

/**
 * SPECIES-SPECIFIC NEGATIVE PROMPTS
 * Used to prevent SDXL from drifting to similar animals
 */
export const SPECIES_NEGATIVES: Record<string, string[]> = {
  'rhinoceros': ['cow', 'bull', 'ox', 'calf', 'hippo', 'hippopotamus', 'elephant', 'unicorn', 'horse', 'deer', 'goat', 'pig', 'boar'],
  'rhino': ['cow', 'bull', 'ox', 'calf', 'hippo', 'hippopotamus', 'elephant', 'unicorn', 'horse', 'deer', 'goat', 'pig', 'boar'],
  'elephant': ['hippo', 'rhino', 'mammoth', 'pig'],
  'hippo': ['rhino', 'elephant', 'pig', 'cow', 'bull'],
  'hippopotamus': ['rhino', 'elephant', 'pig', 'cow', 'bull'],
  'dog': ['wolf', 'fox', 'coyote', 'cat'],
  'cat': ['dog', 'fox', 'wolf', 'tiger', 'lion'],
  'rabbit': ['hare', 'mouse', 'rat', 'hamster'],
  'bunny': ['hare', 'mouse', 'rat', 'hamster'],
  'bear': ['dog', 'pig', 'gorilla'],
  'lion': ['tiger', 'cat', 'leopard', 'dog'],
  'tiger': ['lion', 'cat', 'leopard', 'dog'],
  'fox': ['dog', 'wolf', 'cat', 'coyote'],
  'wolf': ['dog', 'fox', 'coyote', 'husky'],
  'horse': ['donkey', 'zebra', 'deer', 'cow'],
  'zebra': ['horse', 'donkey', 'deer'],
  'giraffe': ['horse', 'deer', 'llama'],
  'monkey': ['ape', 'human', 'gorilla', 'chimp'],
  'penguin': ['bird', 'duck', 'seal'],
  'owl': ['bird', 'eagle', 'hawk'],
  'duck': ['goose', 'swan', 'bird', 'chicken'],
  'frog': ['toad', 'lizard', 'turtle'],
  'turtle': ['tortoise', 'frog', 'snail'],
};

/**
 * Helper to get species-specific negatives
 */
export function getSpeciesNegatives(species: string): string[] {
  const lowerSpecies = species.toLowerCase();
  return SPECIES_NEGATIVES[lowerSpecies] || [];
}
