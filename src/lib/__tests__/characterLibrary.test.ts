import { describe, it, expect } from "vitest";
import {
  lookupCharacter,
  isInLibrary,
  getAvailableSpecies,
  sanitizeForKids,
  buildBibleFromLibrary,
  LIBRARY_CHARACTERS,
  KID_FRIENDLY_STYLE,
} from "../../../lib/characterLibrary";

// ─── REGISTRY LOOKUP ─────────────────────────────────────────────────────

describe("lookupCharacter", () => {
  it("finds rhinoceros by canonical name", () => {
    const result = lookupCharacter("rhinoceros");
    expect(result).not.toBeNull();
    expect(result!.character.species).toBe("rhinoceros");
    expect(result!.character.defaultName).toBe("Riri");
  });

  it("finds rhinoceros by alias 'rhino'", () => {
    const result = lookupCharacter("rhino");
    expect(result).not.toBeNull();
    expect(result!.character.species).toBe("rhinoceros");
  });

  it("finds dog by alias 'puppy'", () => {
    const result = lookupCharacter("puppy");
    expect(result).not.toBeNull();
    expect(result!.character.species).toBe("dog");
  });

  it("finds cat by alias 'kitten'", () => {
    const result = lookupCharacter("kitten");
    expect(result).not.toBeNull();
    expect(result!.character.species).toBe("cat");
  });

  it("is case-insensitive", () => {
    const result = lookupCharacter("RHINOCEROS");
    expect(result).not.toBeNull();
    expect(result!.character.species).toBe("rhinoceros");
  });

  it("returns null for unknown species", () => {
    const result = lookupCharacter("hairy monster");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = lookupCharacter("");
    expect(result).toBeNull();
  });

  it("returns hasAssets=false when no cached images exist", () => {
    // Library has the character definition, but no PNGs on disk
    const result = lookupCharacter("rhinoceros");
    expect(result).not.toBeNull();
    expect(result!.hasAssets).toBe(false);
  });
});

describe("isInLibrary", () => {
  it("returns true for library species", () => {
    expect(isInLibrary("rhinoceros")).toBe(true);
    expect(isInLibrary("elephant")).toBe(true);
    expect(isInLibrary("dog")).toBe(true);
    expect(isInLibrary("cat")).toBe(true);
  });

  it("returns true for aliases", () => {
    expect(isInLibrary("rhino")).toBe(true);
    expect(isInLibrary("puppy")).toBe(true);
    expect(isInLibrary("kitten")).toBe(true);
    expect(isInLibrary("bunny")).toBe(true);
  });

  it("returns false for unknown species", () => {
    expect(isInLibrary("monster")).toBe(false);
    expect(isInLibrary("alien")).toBe(false);
    expect(isInLibrary("blob")).toBe(false);
  });
});

describe("getAvailableSpecies", () => {
  it("returns all registered species", () => {
    const species = getAvailableSpecies();
    expect(species).toContain("rhinoceros");
    expect(species).toContain("elephant");
    expect(species).toContain("dog");
    expect(species).toContain("cat");
    expect(species).toContain("rabbit");
    expect(species).toContain("lion");
    expect(species).toContain("unicorn");
    expect(species).toContain("dragon");
    expect(species.length).toBeGreaterThanOrEqual(15);
  });
});

// ─── LIBRARY CHARACTER DEFINITIONS ───────────────────────────────────────

describe("LIBRARY_CHARACTERS", () => {
  it("every character has required fields", () => {
    for (const [key, char] of Object.entries(LIBRARY_CHARACTERS)) {
      expect(char.defaultName, `${key}.defaultName`).toBeTruthy();
      expect(char.species, `${key}.species`).toBeTruthy();
      expect(char.aliases, `${key}.aliases`).toBeInstanceOf(Array);
      expect(char.visualFingerprint.length, `${key}.visualFingerprint`).toBeGreaterThanOrEqual(3);
      expect(char.speciesStructure, `${key}.speciesStructure`).toContain("cartoon style");
      expect(char.defaultSkinTone, `${key}.defaultSkinTone`).toBeTruthy();
      expect(char.defaultEyes, `${key}.defaultEyes`).toBeTruthy();
      expect(char.speciesNegatives.length, `${key}.speciesNegatives`).toBeGreaterThanOrEqual(2);
    }
  });

  it("rhinoceros has horn in species structure", () => {
    const rhino = LIBRARY_CHARACTERS.rhinoceros;
    expect(rhino.speciesStructure).toContain("horn");
    expect(rhino.speciesStructure).toContain("thick");
  });

  it("elephant has trunk in species structure", () => {
    const elephant = LIBRARY_CHARACTERS.elephant;
    expect(elephant.speciesStructure).toContain("trunk");
    expect(elephant.speciesStructure).toContain("floppy ears");
  });

  it("no character has scary or realistic terms in visual fingerprint", () => {
    const unsafeTerms = ["realistic", "scary", "menacing", "photorealistic", "3D", "horror"];
    for (const [key, char] of Object.entries(LIBRARY_CHARACTERS)) {
      const fpText = char.visualFingerprint.join(" ").toLowerCase();
      for (const term of unsafeTerms) {
        expect(fpText, `${key} fingerprint should not contain "${term}"`).not.toContain(term);
      }
    }
  });

  it("all characters have cartoon in visual fingerprint", () => {
    for (const [key, char] of Object.entries(LIBRARY_CHARACTERS)) {
      const fpText = char.visualFingerprint.join(" ").toLowerCase();
      expect(fpText, `${key} should have 'cartoon' in fingerprint`).toContain("cartoon");
    }
  });
});

// ─── KID-FRIENDLY SAFETY ─────────────────────────────────────────────────

describe("sanitizeForKids", () => {
  it("passes through safe descriptions unchanged", () => {
    const { cleaned, wasModified } = sanitizeForKids("hairy monster with blue ears");
    expect(wasModified).toBe(false);
    expect(cleaned).toBe("hairy monster with blue ears");
  });

  it("replaces scary + monster combination", () => {
    const { cleaned, wasModified } = sanitizeForKids("scary monster with sharp teeth");
    expect(wasModified).toBe(true);
    expect(cleaned).not.toContain("scary");
    expect(cleaned).not.toContain("sharp teeth");
  });

  it("replaces evil terms", () => {
    const { cleaned, wasModified } = sanitizeForKids("evil dark creature");
    expect(wasModified).toBe(true);
    expect(cleaned).not.toContain("evil");
    expect(cleaned).not.toContain("dark");
  });

  it("keeps monster alone (without scary words)", () => {
    const { cleaned, wasModified } = sanitizeForKids("friendly monster with spots");
    expect(wasModified).toBe(false);
    expect(cleaned).toContain("monster");
  });

  it("replaces blood and weapon terms", () => {
    const { cleaned, wasModified } = sanitizeForKids("dragon with blood and knife");
    expect(wasModified).toBe(true);
    expect(cleaned).not.toContain("blood");
    expect(cleaned).not.toContain("knife");
  });

  it("replaces ghost with friendly spirit", () => {
    const { cleaned, wasModified } = sanitizeForKids("a ghost in a haunted house");
    expect(wasModified).toBe(true);
    expect(cleaned).toContain("friendly spirit");
  });

  it("handles empty string", () => {
    const { cleaned, wasModified } = sanitizeForKids("");
    expect(wasModified).toBe(false);
    expect(cleaned).toBe("");
  });

  it("cleans up extra spaces after removal", () => {
    const { cleaned } = sanitizeForKids("a  blood  covered  zombie");
    expect(cleaned).not.toMatch(/\s{2,}/);
  });
});

describe("KID_FRIENDLY_STYLE", () => {
  it("has positive style tokens", () => {
    expect(KID_FRIENDLY_STYLE.positive).toContain("children's picture book illustration");
    expect(KID_FRIENDLY_STYLE.positive).toContain("bold outlines");
    expect(KID_FRIENDLY_STYLE.positive.length).toBeGreaterThanOrEqual(4);
  });

  it("has negative style tokens blocking realism", () => {
    expect(KID_FRIENDLY_STYLE.negative).toContain("realistic");
    expect(KID_FRIENDLY_STYLE.negative).toContain("photorealistic");
    expect(KID_FRIENDLY_STYLE.negative).toContain("scary");
    expect(KID_FRIENDLY_STYLE.negative.length).toBeGreaterThanOrEqual(8);
  });
});

// ─── BIBLE BUILDING ──────────────────────────────────────────────────────

describe("buildBibleFromLibrary", () => {
  it("builds a bible with library defaults", () => {
    const rhino = LIBRARY_CHARACTERS.rhinoceros;
    const bible = buildBibleFromLibrary(rhino);

    expect(bible.name).toBe("Riri");
    expect(bible.species).toBe("rhinoceros");
    expect(bible.character_type).toBe("animal");
    expect(bible.visual_fingerprint).toEqual(rhino.visualFingerprint);
    expect(bible.style!.base).toBe("children's picture book illustration");
  });

  it("allows custom name override", () => {
    const rhino = LIBRARY_CHARACTERS.rhinoceros;
    const bible = buildBibleFromLibrary(rhino, "Max");

    expect(bible.name).toBe("Max");
    expect(bible.character_id).toBe("max");
    expect(bible.species).toBe("rhinoceros");
  });

  it("allows custom bible overrides", () => {
    const rhino = LIBRARY_CHARACTERS.rhinoceros;
    const bible = buildBibleFromLibrary(rhino, "Riri", {
      visual_fingerprint: ["cartoon rhinoceros", "golden fur", "big blue eyes"],
      outfit: "space helmet",
    });

    expect(bible.visual_fingerprint).toEqual(["cartoon rhinoceros", "golden fur", "big blue eyes"]);
    expect(bible.outfit).toBe("space helmet");
  });

  it("uses library fingerprint when custom bible has empty fingerprint", () => {
    const rhino = LIBRARY_CHARACTERS.rhinoceros;
    const bible = buildBibleFromLibrary(rhino, undefined, {
      visual_fingerprint: [],
    });

    expect(bible.visual_fingerprint).toEqual(rhino.visualFingerprint);
  });

  it("includes consistency rules mentioning species", () => {
    const elephant = LIBRARY_CHARACTERS.elephant;
    const bible = buildBibleFromLibrary(elephant);

    const rulesText = bible.consistency_rules!.join(" ");
    expect(rulesText).toContain("elephant");
    expect(rulesText).toContain("never change species");
  });
});
