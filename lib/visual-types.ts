// Universal types for visual generation pipeline
// Architecture: Character Bible + Page Scene Cards + Prompt Renderer

/**
 * CHARACTER BIBLE - Generated ONCE per book
 * Store this and reuse for every page
 */
export type CharacterBible = {
  character_id: string;
  name: string;
  age: string;
  appearance: {
    skin_tone: string;
    eyes: string;
    hair: string;
    face_features: string;
  };
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
  supporting_characters: string[];
  key_objects: string[];
  required_elements: string[];
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
