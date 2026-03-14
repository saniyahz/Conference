// Universal types for visual generation pipeline
// Architecture: Character Bible + Page Scene Cards + Prompt Renderer

/**
 * CHARACTER BIBLE - Generated ONCE per book
 * Store this and reuse for every page
 *
 * The visual_fingerprint is the KEY to consistency:
 * - Short, precise descriptors that SDXL can reliably reproduce
 * - Same fingerprint used on EVERY page prompt
 */
export type CharacterBible = {
  // Core identity
  id?: string;             // e.g. "riri" — used by normalizeScene & createCharacterCanon
  character_id?: string;   // legacy alias
  name: string;
  character_type?: 'human' | 'animal' | 'object' | 'creature' | 'other';
  gender?: 'girl' | 'boy';  // Explicit gender for human characters
  species?: string;  // For animals: "rhinoceros", "rabbit", etc.
  age?: string;
  ethnicity?: string; // e.g., "east_asian", "south_asian", "african", "middle_eastern", "latino", "indigenous"

  // Immutable text description (createCharacterCanon builds this)
  description?: string;

  // NEW: Visual fingerprint - precise, consistent descriptors
  visual_fingerprint?: string[];  // e.g. ["cute baby rhinoceros", "light gray skin", "big teal eyes"]
  outfit?: string;  // e.g. "simple blue space helmet"
  accessories?: string;  // Identity-defining accessories: "glasses", "red hat", etc.

  // Legacy appearance (kept for backward compatibility)
  appearance?: {
    skin_tone: string;  // or fur color for animals
    eyes: string;
    hair: string;       // or fur description for animals
    face_features: string;
  };
  signature_outfit?: string;
  personality?: string[];

  // NEW: Style object for consistent rendering
  style?: {
    base: string;      // e.g. "children's picture book illustration"
    render: string[];  // e.g. ["clean lines", "vibrant colors", "soft shading"]
    aspect: string;    // e.g. "square"
  };

  art_style?: {
    medium: string;
    genre: string;
    mood: string;
    line_detail: string;
  };
  consistency_rules?: string[];
};

/**
 * PAGE SCENE CARD - One per page
 * This is the only part that changes per page
 *
 * CRITICAL: must_include items are NON-NEGOTIABLE
 * The prompt renderer MUST include these in the prompt
 */
export type PageSceneCard = {
  page_number: number;
  scene_id: string;
  setting: string;           // e.g. "moon surface with craters and stars"
  time_weather: string;
  action: string;            // e.g. "Riri waves at two moon rabbits beside a small flag"

  // EXPLICIT must-include list - these MUST appear in the image
  must_include: string[];    // e.g. ["Riri full body", "two rabbits", "moon craters", "small flag"]
  must_not_include: string[]; // e.g. ["humans", "text", "watermark"]

  // Supporting data
  supporting_characters: string[];
  key_objects: string[];
  mood: string;              // e.g. "wonder, playful"

  // Camera/composition — string (normalizeScene) or object (structured)
  camera: string | {
    shot_type: "wide" | "medium" | "close-up";
    composition_notes: string;
  };

  // ── Extended fields used by normalizeScene / assembleImagePrompt ──
  sceneType?: string;
  mainCharacter?: {
    id?: string;
    position: string;
    visibility: string;
    action: string;
  };
  supportingElements?: Array<{
    type: string;
    count: number;
    position: string;
  }>;
  environment?: {
    setting: string;
    elements: string[];
  };
  exclusions?: string[];

  // Legacy fields (for backward compatibility)
  main_action?: string;
  required_elements?: string[];
  forbidden_elements?: string[];
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

// Re-export new structured types from imagination pipeline
export type { SceneCard as ImaginationSceneCard, StoryWorldDNA } from './imagination-types';
