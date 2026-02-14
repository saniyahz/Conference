/**
 * CHARACTER LIBRARY — Pre-built character assets for consistent story generation.
 *
 * WHY: SDXL generates each character from scratch per story, causing inconsistency.
 * The library provides curated reference images, bibles, and CLIP embeddings
 * for common animals. Custom characters (monsters, aliens, made-up creatures)
 * fall back to the on-the-fly generation path.
 *
 * ADDING A NEW CHARACTER:
 *   1. Add an entry to LIBRARY_CHARACTERS below
 *   2. Run: npx ts-node scripts/seedCharacterLibrary.ts --species <species>
 *      (generates reference images, computes CLIP embedding, saves to disk)
 *   3. Or: manually place ref-white.png and ref-neutral.png in
 *      public/characters/<species>/ — the system will compute CLIP on first use.
 *
 * ARCHITECTURE:
 *   - Library check happens BEFORE anchor generation in generate-images route
 *   - If species matches → load cached assets (0s instead of ~25s)
 *   - If no match → generate from DNA on-the-fly (current path)
 *   - Custom characters can be saved to library after generation
 */

import * as fs from "fs";
import * as path from "path";
import { CharacterBible } from "@/lib/visual-types";

// ─── TYPES ───────────────────────────────────────────────────────────────

export interface LibraryCharacter {
  /** Display name (e.g. "Riri") — used as default if story doesn't specify */
  defaultName: string;
  /** Canonical species (e.g. "rhinoceros") */
  species: string;
  /** Aliases that map to this entry (e.g. ["rhino"]) */
  aliases: string[];
  /** Visual fingerprint tokens for SDXL prompt */
  visualFingerprint: string[];
  /** Species structure anatomy string for inpaint prompt */
  speciesStructure: string;
  /** Default skin/fur color */
  defaultSkinTone: string;
  /** Default eye description */
  defaultEyes: string;
  /** Kid-friendly style enforcement tokens added to every prompt */
  styleTokens: string[];
  /** Negative prompt additions specific to this species */
  speciesNegatives: string[];
}

export interface LibraryAssets {
  /** Buffer of white-background reference image */
  refWhiteBuffer: Buffer | null;
  /** Buffer of neutral-background reference image */
  refNeutralBuffer: Buffer | null;
  /** Pre-computed CLIP embedding (averaged from both refs) */
  clipEmbedding: number[] | null;
}

export interface LibraryLookupResult {
  character: LibraryCharacter;
  assets: LibraryAssets;
  /** Whether assets were loaded from disk (true) or need generation (false) */
  hasAssets: boolean;
}

// ─── KID-FRIENDLY SAFETY ─────────────────────────────────────────────────

/** Words that should be filtered from character descriptions for kid safety */
const UNSAFE_WORDS = new Set([
  "scary", "horror", "blood", "bloody", "demon", "devil", "zombie",
  "skeleton", "skull", "dead", "death", "kill", "murder", "weapon",
  "gun", "knife", "sword", "evil", "dark", "creepy", "nightmare",
  "ghost", "vampire", "monster", // "monster" alone is fine when not paired with scary words
  "sharp teeth", "sharp claws", "fangs", "venom", "poison",
  "violent", "angry", "rage", "fury", "attack", "destroy",
]);

/** Words that are only unsafe in combination with other words */
const CONDITIONALLY_UNSAFE: Record<string, string[]> = {
  "monster": ["scary", "evil", "dark", "horror", "creepy", "nightmare", "angry", "violent"],
  "creature": ["scary", "evil", "dark", "horror", "creepy", "nightmare", "angry", "violent"],
  "dragon": ["fire-breathing", "evil", "dark", "destroying"],
};

/** Kid-friendly replacements for unsafe terms */
const SAFE_REPLACEMENTS: Record<string, string> = {
  "scary": "silly",
  "evil": "mischievous",
  "dark": "colorful",
  "creepy": "quirky",
  "angry": "grumpy",
  "sharp teeth": "big smile",
  "sharp claws": "soft paws",
  "fangs": "big smile",
  "blood": "",
  "bloody": "",
  "demon": "imp",
  "devil": "imp",
  "zombie": "sleepy creature",
  "skeleton": "bony creature",
  "ghost": "friendly spirit",
  "vampire": "batty friend",
  "nightmare": "dream",
};

/**
 * Sanitize a character description for kid-friendliness.
 * Returns the cleaned text and a flag indicating if anything was changed.
 */
export function sanitizeForKids(text: string): { cleaned: string; wasModified: boolean } {
  let result = text.toLowerCase();
  let modified = false;

  // Check for conditionally unsafe combinations
  for (const [word, triggers] of Object.entries(CONDITIONALLY_UNSAFE)) {
    if (result.includes(word)) {
      for (const trigger of triggers) {
        if (result.includes(trigger)) {
          const replacement = SAFE_REPLACEMENTS[trigger] || "";
          result = result.replace(new RegExp(`\\b${trigger}\\b`, "gi"), replacement);
          modified = true;
        }
      }
    }
  }

  // Replace standalone unsafe words
  for (const word of Array.from(UNSAFE_WORDS)) {
    if (result.includes(word)) {
      // Don't replace "monster" by itself — only when paired with scary words (handled above)
      if (word === "monster" && !modified) continue;
      const replacement = SAFE_REPLACEMENTS[word] || "";
      result = result.replace(new RegExp(`\\b${word}\\b`, "gi"), replacement);
      modified = true;
    }
  }

  // Clean up multiple spaces
  result = result.replace(/\s+/g, " ").trim();

  return { cleaned: result, wasModified: modified };
}

/**
 * Kid-friendly style tokens that get injected into EVERY character's inpaint prompt.
 * These ensure cartoon rendering regardless of what the user described.
 */
export const KID_FRIENDLY_STYLE = {
  positive: [
    "children's picture book illustration",
    "bold outlines",
    "flat vibrant colors",
    "cute round proportions",
    "big expressive eyes",
    "friendly expression",
  ],
  negative: [
    "realistic", "photorealistic", "3D render",
    "scary", "menacing", "sharp teeth", "claws",
    "dark shadows", "horror", "creepy",
    "detailed skin texture", "wrinkles", "rough skin",
    "photograph", "lifelike",
  ],
};

// ─── CHARACTER REGISTRY ──────────────────────────────────────────────────

/**
 * Pre-defined library characters. Each entry contains everything needed
 * to generate consistent images without creating a new character from scratch.
 *
 * TO ADD A NEW CHARACTER: Add an entry here, then run the seed script.
 */
export const LIBRARY_CHARACTERS: Record<string, LibraryCharacter> = {
  rhinoceros: {
    defaultName: "Riri",
    species: "rhinoceros",
    aliases: ["rhino"],
    visualFingerprint: [
      "cartoon rhinoceros",
      "light gray skin",
      "big expressive brown eyes",
      "soft round cheeks",
      "friendly smile",
    ],
    speciesStructure: "rhinoceros with prominent rounded horn on nose, thick barrel-shaped body, four thick legs, cartoon style",
    defaultSkinTone: "light gray skin",
    defaultEyes: "big expressive brown eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["cow", "bull", "hippo", "elephant", "buffalo", "dinosaur"],
  },

  elephant: {
    defaultName: "Ellie",
    species: "elephant",
    aliases: ["elephants"],
    visualFingerprint: [
      "cartoon elephant",
      "soft gray skin",
      "big kind eyes",
      "round cheeks",
      "friendly smile",
    ],
    speciesStructure: "elephant with long trunk, large floppy ears, round body, four thick legs, cartoon style",
    defaultSkinTone: "soft gray skin",
    defaultEyes: "big kind brown eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["hippo", "rhinoceros", "cow", "pig"],
  },

  dog: {
    defaultName: "Buddy",
    species: "dog",
    aliases: ["puppy", "pup", "doggy"],
    visualFingerprint: [
      "cartoon dog",
      "warm golden fur",
      "big happy eyes",
      "floppy ears",
      "wagging tail",
      "friendly smile",
    ],
    speciesStructure: "dog with floppy ears, wagging tail, soft fur, four legs, cartoon style",
    defaultSkinTone: "warm golden fur",
    defaultEyes: "big happy brown eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["wolf", "fox", "coyote", "cat"],
  },

  cat: {
    defaultName: "Whiskers",
    species: "cat",
    aliases: ["kitten", "kitty"],
    visualFingerprint: [
      "cartoon cat",
      "soft orange tabby fur",
      "big green eyes",
      "pointed ears",
      "long fluffy tail",
      "friendly smile",
    ],
    speciesStructure: "cat with pointed ears, long fluffy tail, soft fur, four legs, whiskers, cartoon style",
    defaultSkinTone: "soft orange tabby fur",
    defaultEyes: "big green eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["dog", "fox", "rabbit", "lion", "tiger"],
  },

  rabbit: {
    defaultName: "Clover",
    species: "rabbit",
    aliases: ["bunny", "bunnies"],
    visualFingerprint: [
      "cartoon rabbit",
      "soft white fur",
      "big pink eyes",
      "two long upright ears",
      "fluffy round tail",
      "pink nose",
    ],
    speciesStructure: "rabbit with two long upright ears, round fluffy tail, soft fur, pink nose, cartoon style",
    defaultSkinTone: "soft white fur",
    defaultEyes: "big pink eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["mouse", "hamster", "cat", "dog"],
  },

  lion: {
    defaultName: "Leo",
    species: "lion",
    aliases: ["lions"],
    visualFingerprint: [
      "cartoon lion",
      "golden fur",
      "big fluffy brown mane",
      "big amber eyes",
      "round face",
      "friendly smile",
    ],
    speciesStructure: "lion with big fluffy mane around face, muscular body, tufted tail, cartoon style",
    defaultSkinTone: "golden fur",
    defaultEyes: "big amber eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["tiger", "cat", "bear", "dog"],
  },

  giraffe: {
    defaultName: "Stretch",
    species: "giraffe",
    aliases: ["giraffes"],
    visualFingerprint: [
      "cartoon giraffe",
      "warm yellow fur with brown spots",
      "big gentle eyes",
      "very long neck",
      "small horns on head",
      "friendly smile",
    ],
    speciesStructure: "giraffe with very long neck, spotted pattern, four long legs, cartoon style",
    defaultSkinTone: "warm yellow fur with brown spots",
    defaultEyes: "big gentle brown eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["horse", "deer", "llama"],
  },

  bear: {
    defaultName: "Berry",
    species: "bear",
    aliases: ["bears", "teddy bear"],
    visualFingerprint: [
      "cartoon bear",
      "warm brown fur",
      "big round ears",
      "big dark eyes",
      "round belly",
      "friendly smile",
    ],
    speciesStructure: "bear with round ears, thick fluffy fur, big round body, big paws, cartoon style",
    defaultSkinTone: "warm brown fur",
    defaultEyes: "big dark eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["dog", "raccoon", "wolverine"],
  },

  penguin: {
    defaultName: "Pip",
    species: "penguin",
    aliases: ["penguins"],
    visualFingerprint: [
      "cartoon penguin",
      "black and white feathers",
      "orange beak",
      "big round eyes",
      "round belly",
      "small flippers",
    ],
    speciesStructure: "penguin with round belly, orange beak, two small flippers, cartoon style",
    defaultSkinTone: "black and white feathers",
    defaultEyes: "big round eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["duck", "bird", "puffin"],
  },

  tiger: {
    defaultName: "Tango",
    species: "tiger",
    aliases: ["tigers"],
    visualFingerprint: [
      "cartoon tiger",
      "bright orange fur with black stripes",
      "big golden eyes",
      "round face",
      "long striped tail",
      "friendly smile",
    ],
    speciesStructure: "tiger with bold stripes, round face, long striped tail, cartoon style",
    defaultSkinTone: "bright orange fur with black stripes",
    defaultEyes: "big golden eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["cat", "lion", "leopard", "cheetah"],
  },

  fox: {
    defaultName: "Finn",
    species: "fox",
    aliases: ["foxes"],
    visualFingerprint: [
      "cartoon fox",
      "bright orange fur with white belly",
      "big amber eyes",
      "pointed ears",
      "big fluffy tail with white tip",
      "friendly smile",
    ],
    speciesStructure: "fox with pointed ears, big fluffy tail with white tip, slender body, cartoon style",
    defaultSkinTone: "bright orange fur with white belly",
    defaultEyes: "big amber eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["dog", "wolf", "cat", "coyote"],
  },

  owl: {
    defaultName: "Ollie",
    species: "owl",
    aliases: ["owls"],
    visualFingerprint: [
      "cartoon owl",
      "soft brown feathers",
      "big round yellow eyes",
      "small beak",
      "round head",
      "two small tufted ears",
    ],
    speciesStructure: "owl with big round head, large round eyes, small beak, two wings, feathered body, cartoon style",
    defaultSkinTone: "soft brown feathers",
    defaultEyes: "big round yellow eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["eagle", "hawk", "bird", "parrot"],
  },

  dolphin: {
    defaultName: "Splash",
    species: "dolphin",
    aliases: ["dolphins"],
    visualFingerprint: [
      "cartoon dolphin",
      "smooth blue-gray skin",
      "big cheerful eyes",
      "long snout with smile",
      "curved dorsal fin",
      "sleek body",
    ],
    speciesStructure: "dolphin with long smiling snout, curved dorsal fin, two flippers, sleek body, cartoon style",
    defaultSkinTone: "smooth blue-gray skin",
    defaultEyes: "big cheerful eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["shark", "whale", "fish", "seal"],
  },

  turtle: {
    defaultName: "Shelly",
    species: "turtle",
    aliases: ["turtles", "tortoise"],
    visualFingerprint: [
      "cartoon turtle",
      "green shell with hexagon pattern",
      "soft green skin",
      "big gentle eyes",
      "small round head",
      "friendly smile",
    ],
    speciesStructure: "turtle with round dome shell, four short legs, small round head poking out, cartoon style",
    defaultSkinTone: "green shell with soft green skin",
    defaultEyes: "big gentle eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["frog", "lizard", "snail", "crab"],
  },

  monkey: {
    defaultName: "Milo",
    species: "monkey",
    aliases: ["monkeys", "chimp", "ape"],
    visualFingerprint: [
      "cartoon monkey",
      "warm brown fur",
      "big curious eyes",
      "round ears",
      "long curly tail",
      "friendly smile",
    ],
    speciesStructure: "monkey with round face, big round ears, long curly tail, four limbs, cartoon style",
    defaultSkinTone: "warm brown fur",
    defaultEyes: "big curious brown eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors"],
    speciesNegatives: ["bear", "raccoon", "squirrel"],
  },

  unicorn: {
    defaultName: "Sparkle",
    species: "unicorn",
    aliases: ["unicorns"],
    visualFingerprint: [
      "cartoon unicorn",
      "white fur with rainbow mane",
      "big sparkling purple eyes",
      "shiny spiral horn on forehead",
      "flowing colorful tail",
      "friendly smile",
    ],
    speciesStructure: "unicorn with shiny spiral horn on forehead, flowing rainbow mane and tail, four legs, cartoon style",
    defaultSkinTone: "white fur",
    defaultEyes: "big sparkling purple eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors", "magical sparkles"],
    speciesNegatives: ["horse", "donkey", "deer", "pony"],
  },

  dragon: {
    defaultName: "Ember",
    species: "dragon",
    aliases: ["dragons"],
    visualFingerprint: [
      "cartoon dragon",
      "bright green scales",
      "big friendly orange eyes",
      "small round wings",
      "round belly",
      "friendly smile",
    ],
    speciesStructure: "friendly baby dragon with small round wings, round belly, short tail, cartoon style",
    defaultSkinTone: "bright green scales",
    defaultEyes: "big friendly orange eyes",
    styleTokens: ["cute round proportions", "bold outlines", "flat vibrant colors", "friendly non-scary"],
    speciesNegatives: ["dinosaur", "lizard", "snake", "crocodile"],
  },
};

// Build a fast lookup map: species name OR alias → canonical species key
const _speciesLookup = new Map<string, string>();
for (const [key, char] of Object.entries(LIBRARY_CHARACTERS)) {
  _speciesLookup.set(key, key);
  _speciesLookup.set(char.species, key);
  for (const alias of char.aliases) {
    _speciesLookup.set(alias.toLowerCase(), key);
  }
}

// ─── ASSET DIRECTORY ─────────────────────────────────────────────────────

/** Root directory for cached character assets */
const ASSETS_DIR = path.join(process.cwd(), "public", "characters");

/** Ensure the asset directory exists for a species */
function ensureAssetDir(species: string): string {
  const dir = path.join(ASSETS_DIR, species);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ─── LOOKUP ──────────────────────────────────────────────────────────────

/**
 * Look up a species in the character library.
 * Returns the library character + any cached assets, or null if not in library.
 */
export function lookupCharacter(species: string): LibraryLookupResult | null {
  const key = _speciesLookup.get(species.toLowerCase());
  if (!key) return null;

  const character = LIBRARY_CHARACTERS[key];
  const assets = loadAssets(key);

  return {
    character,
    assets,
    hasAssets: assets.refWhiteBuffer !== null || assets.refNeutralBuffer !== null,
  };
}

/**
 * Load cached assets from disk for a library character.
 */
function loadAssets(speciesKey: string): LibraryAssets {
  const dir = path.join(ASSETS_DIR, speciesKey);

  let refWhiteBuffer: Buffer | null = null;
  let refNeutralBuffer: Buffer | null = null;
  let clipEmbedding: number[] | null = null;

  const whitePath = path.join(dir, "ref-white.png");
  const neutralPath = path.join(dir, "ref-neutral.png");
  const clipPath = path.join(dir, "clip-embedding.json");

  if (fs.existsSync(whitePath)) {
    refWhiteBuffer = fs.readFileSync(whitePath);
  }
  if (fs.existsSync(neutralPath)) {
    refNeutralBuffer = fs.readFileSync(neutralPath);
  }
  if (fs.existsSync(clipPath)) {
    try {
      clipEmbedding = JSON.parse(fs.readFileSync(clipPath, "utf-8"));
    } catch { /* ignore corrupt file */ }
  }

  return { refWhiteBuffer, refNeutralBuffer, clipEmbedding };
}

/**
 * Save generated assets to disk for future reuse.
 * Called after generating anchor images — makes the NEXT story instant.
 */
export function saveAssets(
  speciesKey: string,
  refWhiteBuffer: Buffer | null,
  refNeutralBuffer: Buffer | null,
  clipEmbedding: number[] | null
): void {
  const dir = ensureAssetDir(speciesKey);

  if (refWhiteBuffer) {
    fs.writeFileSync(path.join(dir, "ref-white.png"), refWhiteBuffer);
  }
  if (refNeutralBuffer) {
    fs.writeFileSync(path.join(dir, "ref-neutral.png"), refNeutralBuffer);
  }
  if (clipEmbedding) {
    fs.writeFileSync(path.join(dir, "clip-embedding.json"), JSON.stringify(clipEmbedding));
  }

  console.log(`[Library] Saved assets for "${speciesKey}" to ${dir}`);
}

/**
 * Build a CharacterBible from a library character, optionally overriding
 * the name (kid might name their rhino "Max" instead of default "Riri").
 */
export function buildBibleFromLibrary(
  libChar: LibraryCharacter,
  customName?: string,
  customBible?: Partial<CharacterBible>
): CharacterBible {
  const name = customName || libChar.defaultName;

  // Merge library defaults with any custom bible overrides
  const fingerprint = customBible?.visual_fingerprint?.length
    ? customBible.visual_fingerprint
    : libChar.visualFingerprint;

  return {
    character_id: name.toLowerCase().replace(/\s+/g, "_"),
    name,
    character_type: "animal",
    species: libChar.species,
    age: "young",
    visual_fingerprint: fingerprint,
    outfit: customBible?.outfit,
    appearance: {
      skin_tone: customBible?.appearance?.skin_tone || libChar.defaultSkinTone,
      eyes: customBible?.appearance?.eyes || libChar.defaultEyes,
      hair: customBible?.appearance?.hair || libChar.defaultSkinTone,
      face_features: customBible?.appearance?.face_features || "round cheeks, friendly expression",
    },
    signature_outfit: customBible?.signature_outfit || "none",
    personality: customBible?.personality || ["curious", "brave", "joyful"],
    style: {
      base: "children's picture book illustration",
      render: ["bold outlines", "flat vibrant colors", "soft shading"],
      aspect: "square",
    },
    art_style: {
      medium: "soft watercolor",
      genre: "premium children's picture book",
      mood: "warm, gentle, magical",
      line_detail: "clean, whimsical",
    },
    consistency_rules: [
      `ALWAYS draw ${name} as a ${libChar.species} — never change species`,
      `SAME visual fingerprint every page: ${fingerprint.join(", ")}`,
      "SAME art style: children's picture book, bold outlines",
    ],
  };
}

/**
 * Check if a species is in the library (including aliases).
 */
export function isInLibrary(species: string): boolean {
  return _speciesLookup.has(species.toLowerCase());
}

/**
 * Get all available species in the library.
 */
export function getAvailableSpecies(): string[] {
  return Object.keys(LIBRARY_CHARACTERS);
}
