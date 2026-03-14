/**
 * Structured JSON types for ALL story generation modes (imagination, history, coping).
 *
 * Architecture:
 *   GPT outputs StructuredStoryJSON (structured JSON with scene cards)
 *   → adaptImaginationDNA() maps CharacterDNAJSON → existing CharacterDNA
 *   → createCharacterBible() converts DNA → CharacterBible (unchanged)
 *   → buildImagePrompt() assembles Flux prompts from CharacterIdentity + SceneCard + StoryWorldDNA
 *
 * All modes use the same structured JSON pipeline. History mode adds
 * history_metadata for factual anchoring.
 */

// ─── Scene Card ─────────────────────────────────────────────────────────────
// One per page. Structured illustration data that replaces GPT-written IMAGE_PROMPTs.
// buildImagePrompt() uses this + character DNA to assemble Flux-ready prompts.

export interface SceneCard {
  shot_type: string;                 // "medium", "wide", "close", "extreme_wide", "birds_eye", "low_angle", etc.
  page_purpose: string;              // What this page achieves narratively
  visual_focus: string;              // What draws the eye first
  emotion: string;                   // Core emotion of the scene
  setting: string;                   // Where the scene takes place
  character_pose_expression: string; // What the character is doing / facial expression
  key_props: string[];               // Important objects in the scene
  foreground: string;                // What's closest to camera
  midground: string;                 // Middle layer
  background: string;                // Farthest layer
  lighting_mood: string;             // e.g. "warm golden afternoon light", "cool moonlight"
  palette_notes: string;             // Color palette guidance for this page
  consistency_notes: string[];       // Reminders for visual consistency
  safety_notes: string[];            // Safety constraints for this page
}

// ─── Story World DNA ────────────────────────────────────────────────────────
// Visual world definition — consistent across all pages.

export interface StoryWorldDNA {
  setting_type: string;              // e.g. "fantasy forest", "suburban neighborhood"
  location_name: string;             // e.g. "Whispering Woods", "Cairo"
  time_of_day_defaults: string;      // e.g. "golden afternoon"
  world_mood: string;                // e.g. "whimsical and magical", "cozy and warm"
  color_palette: string[];           // Dominant colors for the world
  recurring_visual_motifs: string[]; // e.g. ["fireflies", "mushroom houses"]
  geographic_accuracy_notes: string[]; // For real locations
  safety_notes: string[];            // World-level safety constraints
}

// ─── Story Blueprint ────────────────────────────────────────────────────────
// Forces GPT to plan the story arc before writing pages.

export interface StoryBlueprintBeat {
  page: number;
  beat: string;                      // Story beat name e.g. "inciting incident"
  purpose: string;                   // Why this page exists in the arc
  emotional_note: string;            // Target emotion for the reader
  visual_hook: string;               // What makes this page visually interesting
}

// ─── Ethnicity Context ──────────────────────────────────────────────────────

export interface EthnicityContext {
  specified: boolean;
  source_text: string;
  visual_guidance: string[];
}

// ─── Character DNA (JSON format) ────────────────────────────────────────────
// The structured character format GPT outputs in the JSON pipeline.
// adaptImaginationDNA() maps this to the existing CharacterDNA interface.

export interface CharacterDNAJSON {
  name: string;
  character_type: 'human' | 'animal' | 'creature' | 'mixed';
  species: string;                    // For animals: "rhinoceros", "rabbit", etc.
  gender: 'boy' | 'girl' | 'unspecified';
  approx_age: string;                // e.g. "5 years old", "about 7"
  ethnicity_context: EthnicityContext;
  skin_tone: string;                  // e.g. "light golden-tan skin", "dark brown skin"
  hair: string;                       // e.g. "long black straight hair", "short brown curly hair"
  eyes: string;                       // e.g. "big brown eyes"
  face_shape: string;                 // e.g. "round soft cheeks, button nose"
  build: string;                      // e.g. "child-proportioned"
  outfit: string;                     // e.g. "blue t-shirt with a star, jeans, red sneakers"
  footwear: string;                   // e.g. "red sneakers"
  accessories: string[];              // e.g. ["round glasses", "red backpack"]
  personality_traits: string[];       // e.g. ["curious", "brave", "kind"]
  visual_signature: string[];         // e.g. ["always has paint on hands", "missing front tooth"]
  animal_visual_traits: string[];     // For animals: ["soft grey fur", "tiny horn nub"]
  habitat_rules: string[];            // For animals: ["prefers grassy savanna"]
  must_remain_consistent: string[];   // e.g. ["hair color", "glasses", "outfit colors"]
  character_identity_lock: string[];  // 5 locked traits: [gender, skin_tone, hair, outfit, accessories]
}

// ─── Language Config ────────────────────────────────────────────────────────

export interface LanguageConfig {
  output_language: string;
  language_code: string;
  direction: 'ltr' | 'rtl';
  bilingual_mode: boolean;
  secondary_language: string | null;
  image_prompt_language: string;      // Always "English"
}

// ─── Image Generation Plan ──────────────────────────────────────────────────

export interface PageCompositionRule {
  page: number;
  shot_type: string;
  character_scale: string;
  environment_coverage: string;
}

export interface ImageGenerationPlan {
  image_prompt_language: string;
  page_composition_rules: PageCompositionRule[];
  single_character_style_suffix: string;
  multi_character_style_suffix: string;
  negative_prompt: string;
}

// ─── Safety Audit ───────────────────────────────────────────────────────────

export interface SafetyAudit {
  sanitized_input_summary: string;
  unsafe_elements_detected: string[];
  transformations_applied: string[];
}

// ─── History Metadata ────────────────────────────────────────────────────────
// Factual anchor points for history mode. Separates storytelling from facts:
//   story text = child-friendly narrative
//   history_metadata = exact facts your app can trust
//   scene_card = illustration-safe historical visuals
//   page 10 = explicit takeaway facts

export interface HistoryMetadata {
  historical_topic: string;            // e.g. "The Great Wall of China"
  time_period: string;                 // e.g. "Ancient China, Qin Dynasty"
  year_or_range: string;               // e.g. "221-206 BCE"
  primary_location: string;            // e.g. "Northern China"
  historical_figures: string[];        // e.g. ["Emperor Qin Shi Huang"]
  factual_anchor_points: string[];     // Key facts GPT used in the story
  sensitive_elements_softened: string[]; // What harsh realities were softened
  what_was_framed_gently: string[];    // How they were framed for children
}

// ─── Full GPT JSON Response ─────────────────────────────────────────────────
// The complete structured output from GPT in JSON mode.
// Used by ALL modes: imagination, history, coping.

export interface ImaginationStoryJSON {
  title: string;
  mode: 'imagination' | 'history' | 'coping';
  language: LanguageConfig;
  character_dna: {
    main_character: CharacterDNAJSON;
  };
  supporting_character_dna: CharacterDNAJSON[];
  story_world_dna: StoryWorldDNA;
  story_blueprint: StoryBlueprintBeat[];
  pages: Array<{
    page: number;
    text: string;
    scene_card: SceneCard;
  }>;
  image_generation_plan: ImageGenerationPlan;
  safety_audit: SafetyAudit;
  // History mode only — factual anchoring for educational value
  history_metadata?: HistoryMetadata;
}

// ─── Adapter output ─────────────────────────────────────────────────────────
// Result of adaptImaginationDNA() — ready to pass into createCharacterBible().
// This is the existing CharacterDNA interface from createCharacterBible.ts,
// re-exported here for convenience. The adapter maps CharacterDNAJSON → CharacterDNA.

export type { CharacterDNA } from './createCharacterBible';
