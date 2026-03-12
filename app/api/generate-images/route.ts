/**
 * Image generation API route — Flux Kontext Pro pipeline.
 *
 * ARCHITECTURE (SIMPLIFIED — GPT writes image prompts directly):
 *   1. Extract character identity from CharacterBible
 *   2. Get/generate character reference image
 *   3. For each page: take GPT's IMAGE_PROMPT → append safety cues → ONE Kontext call
 *   4. Return image URLs
 *
 * The old pipeline had 6 layers of regex transformation between GPT's story
 * output and the final Flux prompt — losing information at every step.
 * Now GPT writes complete Flux-ready prompts directly. This file went from
 * ~1700 lines to ~500 lines.
 *
 * API contract:
 *   POST { imagePrompts, seed?, seeds?, characterBible? }
 *   →    { imageUrls, videoUrls: [], seed, seeds }
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { CharacterBible } from "@/lib/visual-types";
import { generateKontextImage, getCharacterRefUrl } from "@/src/lib/kontextGeneration";
import { validateContent, sanitizeText } from "@/lib/contentSafety";
import { lookupCharacter, saveAssets, sanitizeForKids } from "@/lib/characterLibrary";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ─── CONFIG ──────────────────────────────────────────────────────────────

/**
 * Max concurrent page generations.
 *
 * With <$5 Replicate credit, the rate limit is 6 req/min with burst of 1.
 * Concurrency 3 lets us finish 10 pages in 4 batches (~40s faster than
 * sequential). The retry logic in kontextGeneration.ts handles 429s gracefully.
 */
const PAGE_CONCURRENCY = 3;

// ─── CHARACTER IDENTITY ─────────────────────────────────────────────────

interface CharacterIdentity {
  name: string;
  species: string;
  /** Short description for Kontext prompts */
  description: string;
  /** Visual fingerprint tokens */
  visualTokens: string[];
  /** Hair description (e.g., "long black curly hair") */
  hair: string;
  /** Outfit description (e.g., "colorful dress and a small backpack") */
  outfit: string;
  /** Gender hint for human characters: "girl", "boy", or "" */
  genderHint: string;
  /** Age description for human characters (e.g., "6 years old") */
  age: string;
  /** Explicit skin tone for human characters (e.g., "brown skin", "dark brown skin") */
  skinTone: string;
  /** Concise hair cue for reinforcement at prompt end (e.g., "short brown bob cut hair") */
  hairCue: string;
  /** Identity-defining accessories like glasses, hats, bows (e.g., "glasses", "red hat") */
  accessories: string;
}

/**
 * Extract character identity from CharacterBible.
 * Simplified vs SDXL version — Kontext doesn't need token-budget optimization.
 */
function extractCharacterIdentity(bible?: CharacterBible): CharacterIdentity {
  if (!bible) {
    return {
      name: "Character",
      species: "animal",
      description: "a cute cartoon animal character",
      visualTokens: ["cartoon animal", "friendly smile"],
      hair: "",
      outfit: "",
      genderHint: "",
      age: "",
      skinTone: "",
      hairCue: "",
      accessories: "",
    };
  }

  const name = bible.name || "Character";
  const isHuman = bible.character_type === "human";

  // Extract species for non-human characters
  let species = bible.species || "";
  if (!species && !isHuman && bible.character_type) {
    const ct = String(bible.character_type);
    if (!["human", "animal", "object", "creature", "other"].includes(ct.toLowerCase())) {
      species = ct.toLowerCase();
    }
  }
  if (!species && !isHuman) {
    const fpText = (bible.visual_fingerprint || []).join(" ").toLowerCase();
    const animalMatch = fpText.match(/\b(rhinoceros|rhino|elephant|giraffe|lion|tiger|bear|rabbit|penguin|fox|deer|owl|dolphin|whale|turtle|frog|monkey|panda|zebra|hippo|koala|unicorn|dragon|dog|cat|puppy|kitten)\b/);
    if (animalMatch) species = animalMatch[1];
  }
  if (!species && !isHuman) {
    const nameMatch = name.toLowerCase().match(/\b(rhinoceros|rhino|elephant|giraffe|lion|tiger|bear|rabbit|penguin|fox|deer|owl|dolphin|whale|turtle|frog|monkey|panda|zebra|hippo|koala|unicorn|dragon|dog|cat|puppy|kitten)\b/);
    if (nameMatch) species = nameMatch[1];
  }
  if (!species && !isHuman) species = "animal";

  // Extract hair and outfit from bible
  const hair = bible.appearance?.hair || "";
  // Remove leading "wearing" if present — we add it ourselves in prompts
  let outfit = bible.signature_outfit || bible.outfit || "";
  outfit = outfit.replace(/^wearing\s+/i, "").trim();

  // Detect gender for human characters — use bible.gender field (set by createCharacterBible)
  // NEVER default to "child" — always pick girl or boy for clear visual rendering
  let genderHint = "";
  if (isHuman) {
    if (bible.gender === 'girl' || bible.gender === 'boy') {
      genderHint = bible.gender;
    } else {
      // Fallback: check name against common names
      const nameLower = name.toLowerCase().split(/\s+/)[0];
      const GIRL_NAMES = new Set(['anya','aanya','emma','olivia','sophia','mia','ella','aria','luna','bella','zara','sara','anna','lily','rose','chloe','grace','violet','hazel','ivy','nora','aurora','isla','stella','clara','alice','eva','maya','layla','amira','aisha','fatima','hana','priya','meera','anaya','zoya','raya','jasmine','yasmin','amara','nina','lena','mara','kira','lara','diana','natasha','elena','anya','sakura','yuki','valentina','camila','lucia','naomi','ruby','daisy','poppy','iris','jade','fiona','molly','freya','charlotte','amelia','harper','avery','riley','zoey','mila','aubrey','hannah','addison','ellie','paisley','audrey','skylar','claire','lucy','samantha','caroline','aaliyah','gabriella','gianna','isabelle','valentina','nova','vivian','delilah','sophie','josephine','willow','cora','kaylee','lydia','arianna','peyton','melanie','brielle','isla','katherine','madeline','wren','juniper','maeve','esme','beatrice','diya','riya','siya','myra','kiara','anika','kavya','saanvi','aadhya','mahira','inaya','ayesha','zahra','safiya','noura']);
      const BOY_NAMES = new Set(['max','leo','jack','james','oliver','noah','liam','adam','omar','ali','ryan','ben','sam','dan','tom','jake','luke','finn','kai','zain','amir','hassan','rami','tariq','yusuf','ethan','mason','logan','alex','henry','charlie','theo','oscar','archie','teddy','toby','freddie','alfie','harry','william','lucas','benjamin','theodore','levi','alexander','sebastian','aiden','owen','samuel','nathan','matthew','david','joseph','carter','wyatt','john','jayden','dylan','grayson','caleb','isaac','andrew','thomas','joshua','ezra','hudson','charles','christopher','jaxon','maverick','josiah','isaiah','george','edward','arthur','freddy','tommy','mohammed','muhammad','mohammad','mohamad','mohamed','mehmet','mustafa','abdallah','abdullah','yousef','ismail','idris','jamal','malik','hussein','arjun','dev','rahul','rohan','vivek','aditya','krishna','aarav','vihaan','kabir','hiro','mateo','santiago','diego','carlos','miguel']);

      if (GIRL_NAMES.has(nameLower)) genderHint = 'girl';
      else if (BOY_NAMES.has(nameLower)) genderHint = 'boy';
      else {
        // Last resort: check appearance text for gender signals
        const allText = [hair, outfit, bible.appearance?.face_features || ""].join(" ").toLowerCase();
        if (/\bdress\b|\bskirt\b|\bponytail\b|\bbraids?\b|\bbow\b|\bprincess\b|\btiara\b|\btutu\b|\bpigtails?\b/i.test(allText)) genderHint = 'girl';
        else if (/\bshort\s+hair\b|\bcrew\s*cut\b|\boveralls\b|\bbaseball\s+cap\b/i.test(allText)) genderHint = 'boy';
        else genderHint = 'boy'; // Default to boy — safer than girl (avoids adding feminine features/eyelashes that cause earrings)
      }
    }
    species = genderHint;
    console.log(`[Identity] Gender from bible: "${bible.gender}" → genderHint: "${genderHint}"`);
  }

  // Extract age for human characters — used to enforce child proportions in prompts
  const age = isHuman ? (bible.age || "6 years old") : "";

  // Extract skin tone for human characters — needs to be EXPLICIT and STRONG
  // to prevent Flux from defaulting to pale/light skin.
  let skinTone = "";
  if (isHuman) {
    const rawSkinTone = (bible.appearance?.skin_tone || "").toLowerCase();
    if (rawSkinTone.includes('deep brown') || rawSkinTone.includes('dark brown') || rawSkinTone.includes('dark skin')) {
      skinTone = 'dark brown skin, dark brown complexion';
    } else if (rawSkinTone.includes('light-brown') || rawSkinTone.includes('light brown') || rawSkinTone.includes('warm light')) {
      // Neutral default — don't over-strengthen to avoid pushing Flux too dark
      skinTone = 'light golden-tan skin';
    } else if (rawSkinTone.includes('brown') || rawSkinTone.includes('caramel') || rawSkinTone.includes('warm brown')) {
      skinTone = 'brown skin, brown complexion';
    } else if (rawSkinTone.includes('tan') || rawSkinTone.includes('olive')) {
      skinTone = 'tan olive skin';
    } else if (rawSkinTone.includes('fair') || rawSkinTone.includes('pale') || rawSkinTone.includes('light')) {
      skinTone = 'fair light skin';
    } else if (rawSkinTone) {
      skinTone = rawSkinTone;
    } else {
      // No skin tone specified at all — use the neutral default
      skinTone = 'light golden-tan skin';
      console.log(`[Identity] No skin tone found in bible — using neutral default`);
    }
    console.log(`[Identity] Skin tone from bible: "${rawSkinTone}" → strengthened: "${skinTone}"`);
  }

  // Extract identity-defining accessories (glasses, hats, bows, etc.)
  const accessories = bible.accessories || "";

  console.log(`[Identity] Extracted species: "${species}" (name="${name}", type="${bible.character_type}", gender="${genderHint}", hair="${hair}", outfit="${outfit}", age="${age}", skinTone="${skinTone}", accessories="${accessories}")`);

  // Build visual tokens from bible
  const visualTokens = (bible.visual_fingerprint || [])
    .map(s => s.trim())
    .filter(Boolean);

  // Sanitize for kids
  const rawDescription = visualTokens.join(", ");
  const { cleaned: safeDescription } = sanitizeForKids(rawDescription);

  // Build a concise character description for Kontext prompts
  let description: string;
  if (isHuman) {
    const genderWord = genderHint || "girl";
    const hairDesc = hair ? `, ${hair}` : "";
    const outfitDesc = outfit ? `, wearing ${outfit}` : "";
    const accessoryDesc = accessories ? `, wearing ${accessories}` : "";
    const ageCue = age ? `, ${age}` : ", young child";
    const genderCue = genderWord === 'girl' ? ', clearly a girl' : ', clearly a boy';
    const skinCue = skinTone ? `, ${skinTone}` : "";
    description = `a cute cartoon ${genderWord} named ${name}${ageCue}, small childlike body${skinCue}${genderCue}, ${safeDescription}${hairDesc}${accessoryDesc}${outfitDesc}`;
  } else {
    description = `a cute cartoon ${species} named ${name}, ${safeDescription}`;
  }

  // Build a concise hair cue for prompt reinforcement
  const hairCue = isHuman && hair ? hair : "";
  if (hairCue) {
    console.log(`[Identity] Hair cue for reinforcement: "${hairCue}"`);
  }
  if (accessories) {
    console.log(`[Identity] Accessories cue for reinforcement: "${accessories}"`);
  }

  return { name, species, description, visualTokens, hair, outfit, genderHint, age, skinTone, hairCue, accessories };
}

// ─── SINGLE PAGE GENERATION (SIMPLIFIED) ─────────────────────────────────
//
// NEW ARCHITECTURE: GPT writes complete IMAGE_PROMPT directly for each page.
// This function's only job: take GPT's prompt → append safety cues → send to Flux.
// No more regex extraction, pose mapping, scene card parsing, or keyword soup.
//

/**
 * Generate a single page illustration from GPT's IMAGE_PROMPT.
 *
 * GPT writes complete Flux-ready prompts including character description,
 * pose, background, and art style. We only add:
 *   1. Child safety word replacements (worried → curious)
 *   2. Species guard (prevent character type drift)
 *   3. Skin tone reinforcement (prevent Flux lightening)
 *   4. Hair reinforcement (prevent style changes across pages)
 *   5. No-text guard
 */
async function generateOnePage(
  imagePrompt: string,
  pageIndex: number,
  seed: number,
  identity: CharacterIdentity,
  referenceImageUrl?: string,
  additionalIdentities?: CharacterIdentity[],
  storyMode: string = 'imagination',
): Promise<{ url: string; accepted: boolean }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Page ${pageIndex + 1}] Character: ${identity.name} (${identity.species})`);
  if (additionalIdentities?.length) {
    console.log(`[Page ${pageIndex + 1}] Additional characters: ${additionalIdentities.map(id => id.name).join(', ')}`);
  }

  const isHumanChar = identity.genderHint !== "";

  // ── 1. Start with GPT's IMAGE_PROMPT (or build a minimal fallback) ──
  let prompt = imagePrompt.trim();
  if (!prompt) {
    // Fallback: GPT didn't produce an IMAGE_PROMPT for this page
    console.warn(`[Page ${pageIndex + 1}] No IMAGE_PROMPT from GPT — using identity fallback`);
    if (isHumanChar) {
      const genderWord = identity.genderHint || "girl";
      prompt = `Text-free children's book illustration, EXTREME WIDE SHOT. A small cute cartoon young ${genderWord}, ${identity.age || '6 years old'}, ${identity.skinTone || ''}, ${identity.hair || ''}, wearing ${identity.outfit || 'colorful clothes'}, is standing happily in a bright colorful storybook landscape with rolling green hills, a winding path, colorful wildflowers, butterflies, a small cottage in the distance, and a bright blue sky with fluffy clouds. The character is TINY in the frame, about one-quarter of the image height. The landscape dominates the image. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes.`;
    } else {
      const outfitPart = identity.outfit ? `, wearing ${identity.outfit}` : "";
      prompt = `Text-free children's book illustration, EXTREME WIDE SHOT. A small cute cartoon ${identity.species}${outfitPart} is standing happily in a bright colorful meadow with tall wildflowers, a babbling brook, butterflies, ladybugs, and distant rolling hills under a bright blue sky with fluffy clouds. The character is TINY in the frame, about one-quarter of the image height. The meadow dominates the image. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes.`;
    }
  }

  console.log(`[Page ${pageIndex + 1}] GPT prompt: "${prompt.substring(0, 200)}..."`);

  // ── 1a. Per-field corrections (fix GPT's wrong descriptions FIRST) ──
  // IMPORTANT: These corrections run BEFORE the DNA hint insertion.
  // If we insert the DNA hint first, the hair/outfit corrections match WITHIN
  // the hint text and corrupt it (e.g., "short brown curlyshort brown curly hair").
  // Skin tone, hair, outfit, and GENDER MUST match the CHARACTER_DNA identity — not
  // GPT's paraphrased version. GPT often writes IMAGE_PROMPTs that don't match its
  // own DNA (e.g., DNA says "girl" with "golden blonde bob cut" but IMAGE_PROMPT
  // says "boy" with "curly brown hair"). We search-replace GPT's wrong descriptions
  // with the correct ones from identity.
  if (isHumanChar) {
    // ── Gender replacement (fixes boy/girl mismatch) ──
    // After the pre-scan in the POST handler overrides identity.genderHint when
    // IMAGE_PROMPTs consistently disagree with DNA, this per-page fix handles
    // remaining mismatches (e.g., mixed-gender prompts or edge cases).
    const correctGender = identity.genderHint; // "girl" or "boy"
    const wrongGender = correctGender === 'girl' ? 'boy' : 'girl';
    // Match patterns like "cartoon boy", "small boy", "cute boy", "young boy"
    // IMPORTANT: Use regex for replacement (not string.replace) to avoid
    // substring matching — e.g., "cartoon girls" should NOT become "cartoon boys"
    const genderPatterns = [
      new RegExp(`\\bcartoon\\s+${wrongGender}\\b`, 'i'),
      new RegExp(`\\bsmall\\s+${wrongGender}\\b`, 'i'),
      new RegExp(`\\bcute\\s+${wrongGender}\\b`, 'i'),
      new RegExp(`\\byoung\\s+${wrongGender}\\b`, 'i'),
    ];
    for (const pattern of genderPatterns) {
      if (pattern.test(prompt)) {
        const match = prompt.match(pattern)!;
        const replacement = match[0].replace(new RegExp(`\\b${wrongGender}\\b`, 'i'), correctGender);
        console.log(`[Page ${pageIndex + 1}] Gender mismatch: GPT="${match[0]}" → fixed="${replacement}"`);
        // Use REGEX for replacement to respect word boundaries (avoids "girls" → "boys")
        prompt = prompt.replace(pattern, replacement);
        break;
      }
    }
    // NOTE: We intentionally do NOT fix pronouns (his/her/he/she) — Flux uses
    // visual keywords, not grammar. Pronoun replacement is too aggressive and
    // can create contradictory prompts when there are multiple characters.

    // ── Skin tone replacement (BIDIRECTIONAL — works in ALL directions) ──
    // GPT often writes a different skin tone than DNA. This must fix ANY direction:
    // DNA darker than prompt, DNA lighter than prompt, or DNA neutral vs prompt extreme.
    // Strategy: Find the FIRST skin tone phrase in the prompt and replace with DNA's value.
    if (identity.skinTone) {
      const dnaSkin = identity.skinTone;
      const dnaSkinLower = dnaSkin.toLowerCase();
      // Match any skin tone description — ordered from most specific to least
      const skinPattern = /\b(?:dark\s+brown\s+skin,?\s*(?:dark\s+brown|deep\s+brown)\s+complexion|deep\s+brown\s+skin(?:\s+tone)?|dark\s+brown\s+skin(?:\s+tone)?|rich\s+brown\s+skin(?:\s+tone)?|warm\s+brown\s+skin(?:\s+tone)?|warm\s+light[- ]brown\s+skin(?:\s+tone)?|light[- ]brown\s+skin(?:\s+tone)?|medium\s+brown\s+skin(?:\s+tone)?|olive\s+tan\s+skin(?:\s+tone)?|tan\s+olive\s+skin(?:\s+tone)?|light\s+warm\s+skin(?:\s+tone)?|fair\s+light\s+skin(?:\s+tone)?|fair\s+skin(?:\s+tone)?|pale\s+skin(?:\s+tone)?|peachy\s+skin(?:\s+tone)?|brown\s+skin(?:\s+tone)?|tan\s+skin(?:\s+tone)?|olive\s+skin(?:\s+tone)?|caramel\s+skin(?:\s+tone)?)\b/gi;
      const skinMatches = [...prompt.matchAll(skinPattern)];
      if (skinMatches.length > 0) {
        // Replace FIRST occurrence (primary character's skin tone)
        const firstSkinMatch = skinMatches[0];
        if (firstSkinMatch[0].toLowerCase().trim() !== dnaSkinLower.trim()) {
          console.log(`[Page ${pageIndex + 1}] Skin tone mismatch: GPT="${firstSkinMatch[0]}" → DNA="${dnaSkin}"`);
          prompt = prompt.substring(0, firstSkinMatch.index!) + dnaSkin + prompt.substring(firstSkinMatch.index! + firstSkinMatch[0].length);
        }
      }
      // Also fix complexion references that might be separate from the main skin phrase
      const complexionPattern = /\b(?:dark\s+brown|brown|light|fair|pale|olive|tan|warm)\s+complexion\b/gi;
      const complexionTarget = dnaSkinLower.includes('dark brown') ? 'dark brown complexion'
        : dnaSkinLower.includes('brown') ? 'brown complexion'
        : dnaSkinLower.includes('fair') || dnaSkinLower.includes('light') ? 'light complexion'
        : dnaSkinLower.includes('olive') || dnaSkinLower.includes('tan') ? 'olive complexion'
        : '';
      if (complexionTarget) {
        prompt = prompt.replace(complexionPattern, complexionTarget);
      }
    }

    // ── Hair replacement (CRITICAL for consistency) ──
    // GPT often writes different hair in IMAGE_PROMPT vs CHARACTER_DNA.
    // Strategy: Find any hair description in the prompt and replace with DNA's version.
    // IMPORTANT: The regex must match hair adjectives in ANY ORDER because GPT writes
    // "brown curly hair" sometimes and "curly brown hair" other times. The old regex
    // assumed a fixed order (length→style→color) and missed matches like "brown curly hair"
    // where color came before style — only matching " curly hair" and losing the color.
    if (identity.hair) {
      // Match any sequence of hair-related adjectives (in ANY order) followed by a hair noun.
      // This handles "curly brown hair", "brown curly hair", "long straight black hair", etc.
      const hairPattern = /\b(?:(?:short|long|medium|shoulder[- ]length|waist[- ]length|chin[- ]length|straight|curly|wavy|coily|kinky|messy|spiky|braided|black|brown|blonde|golden|red|auburn|ginger|dark|light|pink|blue|purple|white|gray|grey|silver|strawberry|bob\s*cut)\s+)+(?:hair|ponytail|pigtails?|braids?|bun|afro|mohawk|dreads|locks|curls)\b/gi;
      const dnaHair = identity.hair;

      // Find all hair descriptions in the prompt
      const matches = [...prompt.matchAll(hairPattern)];
      if (matches.length > 0) {
        // Replace FIRST occurrence (the main character's hair description)
        // with the correct DNA hair
        const firstMatch = matches[0];
        if (firstMatch[0].toLowerCase().trim() !== dnaHair.toLowerCase().trim()) {
          console.log(`[Page ${pageIndex + 1}] Hair mismatch: GPT="${firstMatch[0]}" → DNA="${dnaHair}"`);
          prompt = prompt.substring(0, firstMatch.index!) + dnaHair + prompt.substring(firstMatch.index! + firstMatch[0].length);
        }
      }
    }

    // ── Outfit replacement (CRITICAL for consistency) ──
    // GPT often invents new outfits in IMAGE_PROMPT that don't match CHARACTER_DNA.
    // Strategy 1: Match "wearing [OUTFIT]" pattern
    // Strategy 2: Match abbreviated pattern "[hair], [OUTFIT], is [ACTION]" (multi-char mode)
    if (identity.outfit) {
      const dnaOutfit = identity.outfit;
      let outfitFixed = false;

      // Strategy 1: Match "wearing [outfit description]"
      const wearingPattern = /wearing\s+([^,.]+(?:,\s*(?:and\s+)?[^,.]+)*?)(?=\s*(?:,\s*(?:is|are|was|were|has|stands?|sits?|walks?|runs?|looks?|holds?|plays?)\b|[.!]|\s*(?:in|at|on|near|by|under|inside|outside|beside|next|with)\s+(?:a|an|the|her|his)\b))/i;
      const outfitMatch = prompt.match(wearingPattern);
      if (outfitMatch) {
        const gptOutfit = outfitMatch[1].trim();
        if (gptOutfit.toLowerCase() !== dnaOutfit.toLowerCase()) {
          console.log(`[Page ${pageIndex + 1}] Outfit mismatch (wearing): GPT="${gptOutfit}" → DNA="${dnaOutfit}"`);
          prompt = prompt.replace(`wearing ${gptOutfit}`, `wearing ${dnaOutfit}`);
          outfitFixed = true;
        }
      }

      // Strategy 2: Match abbreviated outfit in multi-char format
      // Pattern: "[hair description], [OUTFIT], is [action]" — no "wearing" prefix
      // e.g., "short curly black hair, blue t-shirt, is bouncing"
      // The first character in the prompt gets their outfit fixed here
      if (!outfitFixed && identity.hair) {
        // Look for: [hair], [abbreviated_outfit], is/are [action]
        // The abbreviated outfit is the text between the hair match and ", is"
        const dnaHairEscaped = identity.hair.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const abbrevPattern = new RegExp(
          `${dnaHairEscaped},\\s*([^,]+?)\\s*,\\s*(?:is|are)\\s`,
          'i'
        );
        const abbrevMatch = prompt.match(abbrevPattern);
        if (abbrevMatch) {
          const gptAbbrevOutfit = abbrevMatch[1].trim();
          // Check if this looks like an outfit (clothing words)
          if (/\b(?:t-shirt|shirt|dress|pants|shorts|jeans|hoodie|jacket|coat|sweater|skirt|overalls|onesie|outfit|uniform|jersey|vest|blouse|tunic|romper|cardigan)\b/i.test(gptAbbrevOutfit)) {
            // Extract just the core outfit type from DNA for abbreviated replacement
            // e.g., "pink dress with white polka dots, white sneakers" → use first item "pink dress with white polka dots"
            const dnaOutfitShort = dnaOutfit.split(',')[0].trim();
            if (gptAbbrevOutfit.toLowerCase() !== dnaOutfitShort.toLowerCase()) {
              console.log(`[Page ${pageIndex + 1}] Outfit mismatch (abbrev): GPT="${gptAbbrevOutfit}" → DNA="${dnaOutfitShort}"`);
              prompt = prompt.replace(gptAbbrevOutfit, dnaOutfitShort);
            }
          }
        }
      }
    }

    // ── Age replacement (prevent age drift between DNA and prompt) ──
    // GPT often writes a different age in IMAGE_PROMPTs than what CHARACTER_DNA specifies.
    // e.g., DNA says "6 years old" but GPT writes "about 10 years old".
    if (identity.age) {
      const dnaAge = identity.age; // e.g., "6 years old"
      const dnaAgeNum = parseInt(dnaAge.replace(/[^\d]/g, ''), 10) || 6;
      // Match age patterns: "about 10 years old", "10-year-old", "10yo", "10 years old"
      const agePattern = /\b(?:about\s+)?(\d{1,2})(?:\s*-?\s*years?\s*-?\s*old|\s*yo)\b/gi;
      const ageMatches = [...prompt.matchAll(agePattern)];
      if (ageMatches.length > 0) {
        // Replace FIRST occurrence (primary character's age)
        const firstAgeMatch = ageMatches[0];
        const promptAge = parseInt(firstAgeMatch[1], 10);
        if (promptAge !== dnaAgeNum) {
          const original = firstAgeMatch[0];
          const fixed = original.replace(firstAgeMatch[1], String(dnaAgeNum));
          console.log(`[Page ${pageIndex + 1}] Age mismatch: GPT="${original}" (${promptAge}) → DNA="${fixed}" (${dnaAgeNum})`);
          prompt = prompt.substring(0, firstAgeMatch.index!) + fixed + prompt.substring(firstAgeMatch.index! + original.length);
        }
      }
    }
  }

  // ── 1c. Additional character corrections (multi-char mode) ──
  // In multi-character prompts, GPT often gives ALL characters the same wrong description.
  // The primary character was fixed above (first occurrence of hair/outfit/gender).
  // Now fix additional characters (subsequent occurrences) with their correct DNA values.
  if (isHumanChar && additionalIdentities && additionalIdentities.length > 0) {
    for (let ei = 0; ei < additionalIdentities.length; ei++) {
      const extraId = additionalIdentities[ei];
      if (!extraId.hair && !extraId.outfit) continue;

      // Re-scan for ALL hair descriptions (indices may shift after each iteration)
      // Uses any-order adjective matching (same as primary character fix above)
      const hairPatternG = /\b(?:(?:short|long|medium|shoulder[- ]length|waist[- ]length|chin[- ]length|straight|curly|wavy|coily|kinky|messy|spiky|braided|black|brown|blonde|golden|red|auburn|ginger|dark|light|pink|blue|purple|white|gray|grey|silver|strawberry|bob\s*cut)\s+)+(?:hair|ponytail|pigtails?|braids?|bun|afro|mohawk|dreads|locks|curls)\b/gi;
      const allHairMatches = [...prompt.matchAll(hairPatternG)];
      const matchIdx = ei + 1; // Skip primary character (index 0, already fixed)

      // ── Fix additional character's hair ──
      if (extraId.hair && allHairMatches.length > matchIdx) {
        const target = allHairMatches[matchIdx];
        if (target[0].trim().length > 4 && target[0].trim().toLowerCase() !== extraId.hair.toLowerCase().trim()) {
          console.log(`[Page ${pageIndex + 1}] Char "${extraId.name}" hair: GPT="${target[0]}" → DNA="${extraId.hair}"`);
          prompt = prompt.substring(0, target.index!) + extraId.hair + prompt.substring(target.index! + target[0].length);
        }
      }

      // ── Fix additional character's outfit (anchored by corrected hair) ──
      if (extraId.outfit && extraId.hair) {
        const hairEsc = extraId.hair.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const dnaOutfitShort = extraId.outfit.split(',')[0].trim();
        let extraOutfitFixed = false;

        // Strategy 1: "wearing [OUTFIT]" near this character's hair (within 80 chars)
        const wearNear = new RegExp(`${hairEsc}[^.]{0,80}?wearing\\s+([^,.]+(?:,\\s*(?:and\\s+)?[^,.]+)*?)(?=\\s*(?:,\\s*(?:is|are|was|were|has|stands?|sits?|walks?|runs?|looks?|holds?|plays?)\\b|[.!]))`, 'i');
        const wMatch = prompt.match(wearNear);
        if (wMatch) {
          const gptOutfit = wMatch[1].trim();
          if (gptOutfit.toLowerCase() !== extraId.outfit.toLowerCase() && gptOutfit.toLowerCase() !== dnaOutfitShort.toLowerCase()) {
            console.log(`[Page ${pageIndex + 1}] Char "${extraId.name}" outfit (wearing): GPT="${gptOutfit}" → DNA="${dnaOutfitShort}"`);
            prompt = prompt.replace(`wearing ${gptOutfit}`, `wearing ${dnaOutfitShort}`);
            extraOutfitFixed = true;
          }
        }

        // Strategy 2: abbreviated format "[hair], [outfit], is/are [action]"
        if (!extraOutfitFixed) {
          const abbrevP = new RegExp(`${hairEsc},\\s*([^,]+?)\\s*,\\s*(?:is|are)\\s`, 'i');
          const aMatch = prompt.match(abbrevP);
          if (aMatch) {
            const gptOutfit = aMatch[1].trim();
            if (/\b(?:t-shirt|shirt|dress|pants|shorts|jeans|hoodie|jacket|coat|sweater|skirt|overalls|onesie|outfit|uniform|jersey|vest|blouse|tunic|romper|cardigan|sneakers)\b/i.test(gptOutfit)) {
              if (gptOutfit.toLowerCase() !== dnaOutfitShort.toLowerCase()) {
                console.log(`[Page ${pageIndex + 1}] Char "${extraId.name}" outfit (abbrev): GPT="${gptOutfit}" → DNA="${dnaOutfitShort}"`);
                // Replace within the full matched context to avoid affecting other parts
                const fixedMatch = aMatch[0].replace(gptOutfit, dnaOutfitShort);
                prompt = prompt.replace(aMatch[0], fixedMatch);
                extraOutfitFixed = true;
              }
            }
          }
        }
      }

      // ── Fix additional character's gender ──
      // Only fix if this character's gender differs from what the primary already corrected to.
      // E.g., if primary is "girl" and additional is also "girl" but prompt says "boy",
      // the remaining "cartoon boy" should be fixed.
      if (extraId.genderHint && extraId.genderHint !== identity.genderHint) {
        // Different gender from primary — the remaining wrong-gender matches may be correct
        // (e.g., primary=girl fixed "cartoon boy"→"girl", remaining "cartoon boy" is the boy character)
        // Don't touch these.
      } else if (extraId.genderHint && extraId.genderHint === identity.genderHint) {
        // Same gender as primary — if there are remaining wrong-gender matches, they need fixing
        const wGender = extraId.genderHint === 'girl' ? 'boy' : 'girl';
        const gPattern = new RegExp(`\\b(?:cartoon|cute|small|young)\\s+${wGender}\\b`, 'i');
        if (gPattern.test(prompt)) {
          const gMatch = prompt.match(gPattern)!;
          const replacement = gMatch[0].replace(new RegExp(`\\b${wGender}\\b`, 'i'), extraId.genderHint);
          console.log(`[Page ${pageIndex + 1}] Char "${extraId.name}" gender: GPT="${gMatch[0]}" → fixed="${replacement}"`);
          prompt = prompt.replace(gPattern, replacement);
        }
      }
    }
  }

  // ── 1d. DNA identity hint (compact, scene-blended) ──
  // Inserted AFTER all per-field corrections so corrections don't match inside the hint.
  // GPT-4o-mini often ignores its own CHARACTER_DNA. We inject a SHORT identity
  // hint so Flux knows the character's look — but keep it minimal for scene focus.
  if (isHumanChar && storyMode !== 'history') {
    const g = identity.genderHint || 'girl';
    const hairShort = identity.hair || '';
    const outfitShort = identity.outfit ? identity.outfit.split(',')[0].trim() : '';
    const dnaHint = `The child is a ${g}${hairShort ? ' with ' + hairShort : ''}${outfitShort ? ', wearing ' + outfitShort : ''}. `;
    console.log(`[Page ${pageIndex + 1}] DNA hint: "${dnaHint.trim()}"`);
    const openerMatch = prompt.match(/^(Text-free children's book illustration[^.]*\.)\s*/i);
    if (openerMatch) {
      prompt = openerMatch[1] + ' ' + dnaHint + prompt.substring(openerMatch[0].length);
    } else {
      prompt = dnaHint + prompt;
    }
  }

  // ── 1e. FINAL CLEANUP PASS — Replace ALL remaining mismatched hair/outfit ──
  // The per-field corrections above only fix the FIRST occurrence. But GPT sometimes
  // describes the character in MULTIPLE places with DIFFERENT descriptions (e.g.,
  // "a girl with brown curly hair" near the start, then "her long straight black hair"
  // later). This creates conflicting signals for Flux, causing the character to change
  // appearance mid-story. This pass replaces ALL remaining mismatches.
  if (isHumanChar && identity.hair) {
    const cleanupHairPattern = /\b(?:(?:short|long|medium|shoulder[- ]length|waist[- ]length|chin[- ]length|straight|curly|wavy|coily|kinky|messy|spiky|braided|tousled|thick|thin|wispy|fluffy|frizzy|sleek|shiny|glossy|black|brown|blonde|golden|red|auburn|ginger|dark|light|pink|blue|purple|white|gray|grey|silver|strawberry|dirty|sandy|honey|chestnut|jet|raven|copper|platinum|bob\s*cut)\s+)+(?:hair|ponytail|pigtails?|braids?|bun|afro|mohawk|dreads|locks|curls)\b/gi;
    const dnaHairLower = identity.hair.toLowerCase().trim();
    let cleanupMatch: RegExpExecArray | null;
    const hairReplacements: { start: number; end: number; old: string }[] = [];
    while ((cleanupMatch = cleanupHairPattern.exec(prompt)) !== null) {
      if (cleanupMatch[0].toLowerCase().trim() !== dnaHairLower) {
        hairReplacements.push({ start: cleanupMatch.index, end: cleanupMatch.index + cleanupMatch[0].length, old: cleanupMatch[0] });
      }
    }
    // Replace from END to START to preserve indices
    for (let ri = hairReplacements.length - 1; ri >= 0; ri--) {
      const rep = hairReplacements[ri];
      console.log(`[Page ${pageIndex + 1}] CLEANUP hair: "${rep.old}" → "${identity.hair}"`);
      prompt = prompt.substring(0, rep.start) + identity.hair + prompt.substring(rep.end);
    }
  }

  // Also cleanup ALL outfit mismatches for the primary character
  if (isHumanChar && identity.outfit) {
    const dnaOutfitCore = identity.outfit.split(',')[0].trim();
    const dnaOutfitLower = dnaOutfitCore.toLowerCase();
    // Find all "wearing [X]" patterns and fix them to DNA outfit
    const outfitCleanupPattern = /wearing\s+([^,.]+(?:,\s*(?:and\s+)?[^,.]+)*?)(?=\s*(?:,\s*(?:is|are|was|were|has|stands?|sits?|walks?|runs?|looks?|holds?|plays?|who)\b|[.!]|\s*(?:in|at|on|near|by|under|inside|outside|beside|next|with)\s+(?:a|an|the|her|his)\b))/gi;
    let outfitMatch: RegExpExecArray | null;
    const outfitReplacements: { fullMatch: string; captured: string }[] = [];
    while ((outfitMatch = outfitCleanupPattern.exec(prompt)) !== null) {
      const capturedOutfit = outfitMatch[1].trim().toLowerCase();
      // Only replace if it looks like a WRONG outfit (doesn't match DNA)
      if (capturedOutfit !== dnaOutfitLower && capturedOutfit !== identity.outfit.toLowerCase()) {
        // Make sure it's actually clothing and not a scene description
        if (/\b(?:t-shirt|shirt|dress|pants|shorts|jeans|hoodie|jacket|coat|sweater|skirt|overalls|onesie|outfit|uniform|jersey|vest|blouse|tunic|romper|cardigan|sneakers|shoes|boots|sandals|leggings|kimono|jumpsuit)\b/i.test(outfitMatch[1])) {
          outfitReplacements.push({ fullMatch: outfitMatch[0], captured: outfitMatch[1].trim() });
        }
      }
    }
    for (const rep of outfitReplacements) {
      console.log(`[Page ${pageIndex + 1}] CLEANUP outfit: "${rep.captured}" → "${dnaOutfitCore}"`);
      prompt = prompt.replace(`wearing ${rep.captured}`, `wearing ${dnaOutfitCore}`);
    }
  }

  // ── 2. Content safety validation + word replacements ──
  // CRITICAL: Pass storyMode so history mode prompts (with religious/historical terms)
  // don't get falsely flagged and replaced with a generic park fallback.
  const isHistoryMode = storyMode === 'history';
  const contentCheck = validateContent(prompt, storyMode);
  if (!contentCheck.safe) {
    console.warn(`[Page ${pageIndex + 1}] BLOCKED content in image prompt: "${contentCheck.matchedTerm}" — using identity fallback`);
    if (isHistoryMode) {
      // History mode fallback: still landscape-dominant, painterly style, historically themed
      const genderWord = identity.genderHint || "girl";
      prompt = `Text-free children's book illustration, EXTREME WIDE SHOT, landscape-dominant. A beautiful ancient landscape with historical architecture, markets, and paths stretching into the distance under a warm golden sky. In the far distance, a tiny cartoon ${genderWord}, about ${identity.age || '8 years old'}, ${identity.skinTone || ''}, ${identity.hair || ''}, wearing ${identity.outfit || 'simple traditional clothing'}, stands looking at the scene. The child is VERY SMALL, less than 15% of the image. Painterly children's book illustration style, rich warm colors, dramatic lighting, educational tone. No text, no words.`;
    } else if (isHumanChar) {
      const genderWord = identity.genderHint || "girl";
      prompt = `Text-free children's book illustration, EXTREME WIDE SHOT. A small cute cartoon young ${genderWord}, ${identity.age || '6 years old'}, ${identity.skinTone || ''}, ${identity.hair || ''}, wearing ${identity.outfit || 'colorful clothes'}, is standing happily in a bright colorful park with swings, a sandbox, tall trees with golden leaves, a winding stone path, and a bright blue sky with fluffy clouds. The character is TINY in the frame, about one-quarter of the image height. The park environment dominates the image. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes.`;
    } else {
      const outfitPart = identity.outfit ? `, wearing ${identity.outfit}` : "";
      prompt = `Text-free children's book illustration, EXTREME WIDE SHOT. A small cute cartoon ${identity.species}${outfitPart} is standing happily in a bright colorful meadow with wildflowers, a winding stream, butterflies, ladybugs on tall grass, and distant mountains under a bright sky with wispy clouds. The character is TINY in the frame, about one-quarter of the image height. The meadow environment dominates the image. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes.`;
    }
  }

  // Sanitize sensitive terms (death → gentle alternative, etc.)
  // CRITICAL: Pass storyMode so history mode terms aren't sanitized
  const { cleaned: sanitizedPrompt } = sanitizeText(prompt, storyMode);
  prompt = sanitizedPrompt;

  // Replace fear/anxiety words with positive equivalents
  // SKIP these replacements in history mode — historical events need accurate language
  if (!isHistoryMode) {
    prompt = prompt
      .replace(/\bworried\b/gi, 'curious')
      .replace(/\bscared\b/gi, 'surprised')
      .replace(/\bterrified\b/gi, 'amazed')
      .replace(/\bpanick(?:ed|ing|y)?\b/gi, 'excited')
      .replace(/\bfrightened\b/gi, 'surprised')
      .replace(/\banxious\b/gi, 'curious')
      .replace(/\bafraid\b/gi, 'curious')
      .replace(/\bnervous\b/gi, 'curious')
      // Violence → peaceful
      .replace(/\bfighting\b/gi, 'playing')
      .replace(/\bweapons?\b/gi, 'toy')
      .replace(/\bswords?\b/gi, 'magic wand')
      .replace(/\bguns?\b/gi, 'water squirter')
      .replace(/\bknife\b/gi, 'stick')
      .replace(/\bknives\b/gi, 'sticks')
      // Dark moods → cozy
      .replace(/\bgloomy\b/gi, 'cozy')
      .replace(/\bsinister\b/gi, 'mysterious')
      .replace(/\bhaunted\b/gi, 'enchanted')
      .replace(/\bcreepy\b/gi, 'quirky')
      .replace(/\bscary\b/gi, 'surprising')
      // Adult descriptors → child-appropriate
      .replace(/\bsexy\b/gi, 'cute')
      .replace(/\brevealing\b/gi, 'colorful')
      // Remove genuinely dangerous visual elements
      .replace(/\b(?:danger|emergency|wobbl|turbulence|crash(?:ing|ed|es)?|sink(?:ing|s)?)\b[^,.]*[,.]?/gi, '')
      .replace(/\bimagin(?:es?|ing|ed)\s+(?:the\s+)?(?:airplane|plane|car|boat|ship|rocket)\s+(?:crash|splash|fall|sink|break|burn|explod)[^,.]*[,.]?/gi, '')
      .replace(/,\s*,/g, ',');
  }

  // Clean up whitespace for all modes
  prompt = prompt.replace(/\s+/g, ' ').trim();

  // ── 2b. Religious figure filtering (ALL modes) ──
  // NEVER depict Prophet Muhammad or Allah in any image — this is a hard rule
  // for Islamic content sensitivity. Strip any references to these figures
  // from the image prompt before sending to the image model.
  // This is a safety net — GPT should already avoid this, but we enforce it here.
  prompt = prompt
    .replace(/\b(?:the\s+)?(?:Prophet\s+)?Muhammad(?:\s+\(.*?\))?/gi, 'the community elders')
    .replace(/\bthe\s+Prophet\b/gi, 'the community')
    .replace(/\bProphet\s+[A-Z][a-z]+/gi, 'a wise elder')
    .replace(/\bAllah\b/gi, 'the sky')
    .replace(/\bGod(?:'s)?\s+(?:words?|messages?|voice|light|guidance)\b/gi, 'ancient wisdom')
    .replace(/\breceiv(?:es?|ing|ed)\s+(?:messages?|words?|revelations?)\s+from\s+God\b/gi, 'studying ancient scrolls')
    .replace(/\s+/g, ' ').trim();

  // ── 3-6. Suffix construction ──
  // CRITICAL: Flux Kontext has an effective attention window of ~1200-1500 chars.
  // GPT's IMAGE_PROMPT is already ~800-1000 chars for multi-character scenes.
  // We MUST keep suffixes SHORT to stay within Flux's attention.
  //
  // Strategy: For HISTORY mode, landscape-dominant with tiny characters.
  // For MULTI-CHARACTER stories, use ultra-compact suffixes.
  // For single-character stories, use the full verbose suffixes.
  const genderLabel = identity.genderHint || "girl";
  const hasMultipleMainChars = additionalIdentities && additionalIdentities.length > 0;

  if (storyMode === 'history') {
    // ═══════ HISTORY MODE — SCENE-DOMINANT BUT CHARACTER VISIBLE ═══════
    // Historical scene is the star, but character must be RECOGNIZABLE (not microscopic).
    // Previously we made characters 15% of the image which broke consistency entirely.

    // Scene-dominant but character still visible
    prompt += '. WIDE SHOT, the historical scene dominates the image';
    prompt += '. The child character is small but clearly visible and recognizable, about 20-25% of the image';
    prompt += '. ALL human figures must look like cartoon CHILDREN — NEVER draw realistic adults';

    // Character identity reinforcement (same as other modes)
    if (identity.skinTone) {
      prompt += `. The child has ${identity.skinTone}`;
    }
    const identityCues: string[] = [];
    if (identity.hairCue) identityCues.push(identity.hairCue);
    if (identity.outfit) identityCues.push(`wearing ${identity.outfit.split(',')[0].trim()}`);
    if (identityCues.length > 0) {
      prompt += `. ${identityCues.join(', ')}`;
    }

    prompt += '. Girl characters must have LONG hair, NO earrings, NO jewelry';
    prompt += '. ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO writing, NO signs with text anywhere in the image';
    prompt += '. Children\'s book illustration, 2D cartoon style, bold outlines, flat warm colors, educational tone';

  } else if (hasMultipleMainChars) {
    // ═══════ MULTI-CHARACTER MODE — COMPACT SUFFIX ═══════
    // GPT's prompt already describes each character in detail.
    // We add ONLY the most critical reinforcements in minimal chars.

    // Height chart: build a single compact height reference
    const allChars = [
      { name: identity.name, age: identity.age, gender: identity.genderHint },
      ...additionalIdentities.map(id => ({ name: id.name, age: id.age, gender: id.genderHint }))
    ];

    // Sort by age descending for height chart
    const sortedByAge = [...allChars].sort((a, b) => {
      const ageA = parseFloat((a.age || '6').replace(/[^\d.]/g, '')) || 6;
      const ageB = parseFloat((b.age || '6').replace(/[^\d.]/g, '')) || 6;
      return ageB - ageA;
    });

    // Build compact height+gender chart: "HEIGHTS: Amalia(8,girl,tallest) > Jibreel(5,boy) = Iman(5,girl) > Hedaya(2,girl,tiny toddler)"
    const heightParts: string[] = [];
    let prevAge = -1;
    for (const ch of sortedByAge) {
      const ageNum = parseFloat((ch.age || '6').replace(/[^\d.]/g, '')) || 6;
      const sizeHint = ageNum <= 3 ? ',tiny toddler' : ageNum >= 8 ? ',tallest' : '';
      const connector = heightParts.length === 0 ? '' : (ageNum === prevAge ? ' = ' : ' > ');
      heightParts.push(`${connector}${ch.name}(${Math.round(ageNum)},${ch.gender}${sizeHint})`);
      prevAge = ageNum;
    }
    prompt += `. HEIGHTS: ${heightParts.join('')}`;

    // Skin tone — one line for all
    if (identity.skinTone) {
      prompt += `. All same family, same skin: ${identity.skinTone}`;
    }

    // Outfit + hair reinforcement for ALL characters (multi-char mode)
    if (identity.outfit) {
      prompt += `. ${identity.name}(${identity.genderHint}): wears ${identity.outfit.split(',')[0].trim()}, has ${identity.hair || 'matching hair'}`;
    }
    // Reinforce EACH additional character's distinct appearance
    if (additionalIdentities) {
      for (const extraId of additionalIdentities) {
        if (extraId.genderHint && (extraId.outfit || extraId.hair)) {
          const parts: string[] = [];
          if (extraId.outfit) parts.push(`wears ${extraId.outfit.split(',')[0].trim()}`);
          if (extraId.hair) parts.push(`has ${extraId.hair}`);
          prompt += `. ${extraId.name}(${extraId.genderHint}): ${parts.join(', ')}`;
        }
      }
    }

    // Children + scene-blending + style
    prompt += '. All characters are children, naturally engaged in the action, full body visible head to feet';
    prompt += '. WIDE SHOT — each child is about 20-25% of the image height, environment fills most of the frame';
    prompt += '. Girl characters must have LONG hair, NO earrings, NO jewelry. Correct anatomy';
    prompt += '. ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO writing anywhere in the image';
    prompt += '. Children\'s book illustration, 2D cartoon style, bold outlines, flat bright colors';

  } else {
    // ═══════ SINGLE CHARACTER MODE — SCENE-FOCUSED SUFFIX ═══════
    // Key principle: the SCENE is the star, the character is part of it.
    // Keep character identity cues SHORT. Spend budget on composition + style.
    if (isHumanChar) {
      const mentionsAdult = /\b(?:dad|father|mom|mother|parent|grandpa|grandma|grandfather|grandmother|uncle|aunt|teacher|adult)\b/i.test(prompt);

      if (mentionsAdult) {
        prompt += `. Adults are the child's FAMILY — same ${identity.skinTone || 'skin tone'}, looking related`;
        prompt += '. Adults wear cozy modest clothing (cardigan, sweater, long pants), taller than children';
      }

      // Compact identity: gender + skin tone in one short line
      prompt += `. The ${genderLabel} has ${identity.skinTone || 'warm skin'}`;

      // Dark skin needs extra emphasis to prevent Flux lightening
      if (isHumanChar && identity.skinTone) {
        const skinLower = identity.skinTone.toLowerCase();
        if (skinLower.includes('dark brown') || skinLower.includes('deep brown')) {
          prompt += `, NOT white, NOT pale`;
        }
      }
    } else {
      prompt += '. No humans, animal character only';
    }

    // Compact outfit + hair reinforcement (one line, not three)
    const identityCues: string[] = [];
    if (identity.hairCue) identityCues.push(identity.hairCue);
    if (identity.outfit) identityCues.push(`wearing ${identity.outfit.split(',')[0].trim()}`);
    if (identity.accessories) identityCues.push(identity.accessories);
    if (identityCues.length > 0) {
      prompt += `. ${identityCues.join(', ')}`;
    }

    // Scene-dominant composition + style (the key change)
    prompt += '. Correct anatomy (two arms, two legs, no extra limbs, five fingers per hand)';
    prompt += '. EXTREME WIDE SHOT composition — character is TINY, only 15-20% of image height, full body visible head to feet';
    prompt += '. The environment fills 80%+ of the image — detailed backgrounds with depth and atmosphere';
    prompt += '. Girl characters must have LONG hair (shoulder length or longer), NO earrings, NO jewelry, NO piercings';
    prompt += '. ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO writing, NO signs with text anywhere in the image';
    prompt += '. Children\'s book illustration, 2D cartoon style, bold outlines, flat bright colors';
  }

  console.log(`[Page ${pageIndex + 1}] Final prompt (${prompt.length} chars): "${prompt.substring(0, 300)}..."`);

  // ── 7. Generate with Kontext ──
  // ALL modes use reference image for character consistency — including history mode.
  const useRefImage = referenceImageUrl;
  const url = await generateKontextImage(replicate, {
    prompt,
    inputImageUrl: useRefImage,
    seed,
    pageIndex,
  });

  if (!url) {
    // Retry once with a simpler prompt (strip visual cues that might trigger safety filters)
    console.warn(`[Page ${pageIndex + 1}] First attempt failed, retrying with simplified prompt...`);
    const simplifiedPrompt = prompt
      .replace(/clearly a girl/g, '')
      .replace(/clearly a boy/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const retryUrl = await generateKontextImage(replicate, {
      prompt: simplifiedPrompt,
      inputImageUrl: useRefImage,
      seed: seed + 1,
      pageIndex,
      safetyTolerance: 4,  // Retry with slightly more permissive tolerance (capped by MAX_PAGE_SAFETY_TOLERANCE)
    });
    if (retryUrl) {
      console.log(`[Page ${pageIndex + 1}] RETRY SUCCESS: ${retryUrl.substring(0, 80)}...`);
      return { url: retryUrl, accepted: true };
    }

    console.error(`[Page ${pageIndex + 1}] GENERATION FAILED after retry`);
    return { url: "", accepted: false };
  }

  console.log(`[Page ${pageIndex + 1}] SUCCESS: ${url.substring(0, 80)}...`);
  return { url, accepted: true };
}

// ─── API ROUTE ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { imagePrompts, seed, seeds, characterBible, additionalCharacterBibles, storyMode = 'imagination' } = await request.json();

    if (!imagePrompts || !Array.isArray(imagePrompts)) {
      return NextResponse.json({ error: "Invalid image prompts provided" }, { status: 400 });
    }
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: "Replicate API token not configured" }, { status: 500 });
    }

    const startTime = Date.now();

    // ── Extract character identity (primary) ──
    const identity = extractCharacterIdentity(characterBible as CharacterBible | undefined);
    console.log(`[Book] Character: ${identity.name} (${identity.species})`);
    console.log(`[Book] Description: "${identity.description}"`);

    // ── PRE-SCAN: Detect majority gender from IMAGE_PROMPTs ──
    // GPT sometimes puts the wrong name/gender in CHARACTER_DNA (e.g., uses the
    // story title as the character name), but writes correct IMAGE_PROMPTs.
    // When IMAGE_PROMPTs consistently use a different gender than DNA, trust the prompts.
    if (identity.genderHint) {
      const promptGenderVote = { girl: 0, boy: 0 };
      for (const p of imagePrompts) {
        if (/\b(?:cartoon|cute|small|young)\s+girl\b/i.test(p)) promptGenderVote.girl++;
        if (/\b(?:cartoon|cute|small|young)\s+boy\b/i.test(p)) promptGenderVote.boy++;
      }
      const majorGender = promptGenderVote.girl > promptGenderVote.boy ? 'girl'
        : promptGenderVote.boy > promptGenderVote.girl ? 'boy' : null;

      if (majorGender && majorGender !== identity.genderHint && promptGenderVote[majorGender] >= 3) {
        // ── SAFETY CHECK: Does DNA's outfit/hair strongly confirm its own gender? ──
        // If DNA says "girl" with outfit "pink dress" or hair "ponytail with bows",
        // the DNA gender is likely correct — GPT just wrote wrong gender in IMAGE_PROMPTs.
        // If DNA outfit is neutral (t-shirt, shorts), trust the prompt majority instead.
        const dnaOutfitLower = (identity.outfit || '').toLowerCase();
        const dnaHairLower = (identity.hair || '').toLowerCase();

        const girlSignals = /\b(?:dress|skirt|tutu|tiara|gown|leggings|tights|ballet)\b/.test(dnaOutfitLower)
          || /\b(?:ponytail|pigtails?|braids?|bows?|ribbons?|barrettes?|headband)\b/.test(dnaHairLower);
        const boySignals = /\b(?:overalls|cargo\s+pants|baseball\s+cap|suspenders|bow\s*tie)\b/.test(dnaOutfitLower);

        const dnaGenderConfirmedByOutfit =
          (identity.genderHint === 'girl' && girlSignals) ||
          (identity.genderHint === 'boy' && boySignals);

        if (dnaGenderConfirmedByOutfit) {
          // DNA's outfit matches DNA's gender — trust DNA, DON'T override
          const majority = promptGenderVote[majorGender];
          const total = imagePrompts.length;
          console.log(`[Book] ⚠️ GENDER OVERRIDE BLOCKED: DNA says "${identity.genderHint}" and outfit/hair confirms it ("${dnaOutfitLower}"). ${majority}/${total} prompts say "${majorGender}" but trusting DNA.`);
        } else {
          // DNA's outfit is neutral — trust prompt majority (DNA probably has wrong character)
          const majority = promptGenderVote[majorGender];
          const total = imagePrompts.length;
          console.log(`[Book] ⚠️ GENDER OVERRIDE: DNA says "${identity.genderHint}" but ${majority}/${total} IMAGE_PROMPTs say "${majorGender}" — trusting prompts`);

          identity.genderHint = majorGender;
          identity.species = majorGender;
          // Update the description to use the correct gender
          identity.description = identity.description
            .replace(/\bcartoon\s+(boy|girl)\b/i, `cartoon ${majorGender}`)
            .replace(/\b(clearly a boy|clearly a girl)\b/i,
              majorGender === 'girl' ? 'clearly a girl' : 'clearly a boy');

          // ── ALSO extract hair/outfit from IMAGE_PROMPTs ──
          // When DNA is unreliable (wrong gender), its hair/outfit are probably wrong too.
          // Extract hair and outfit from the first prompt that has clear descriptions,
          // so per-page replacement doesn't overwrite correct prompt values with wrong DNA values.
          const hairExtractPattern = /\b(?:(?:short|long|medium|shoulder[- ]length|waist[- ]length)\s+)?(?:(?:straight|curly|wavy|coily|kinky|messy|spiky|braided)\s+)?(?:(?:black|brown|blonde|golden|red|auburn|ginger|dark|light|pink|blue|purple|white|gray|grey|silver|strawberry)\s+)?(?:bob\s*cut\s*)?(?:hair|ponytail|pigtails?|braids?|bun|afro|mohawk|dreads|locks|curls)\b/i;
          for (const p of imagePrompts) {
            const hairMatch = p.match(hairExtractPattern);
            if (hairMatch && hairMatch[0].trim().length > 5) { // Skip bare "hair" / "curls"
              console.log(`[Book]   → Extracting hair from prompts: "${hairMatch[0]}" (replaces DNA: "${identity.hair}")`);
              identity.hair = hairMatch[0].trim();
              identity.hairCue = identity.hair;
              break;
            }
          }

          // Extract outfit — look for "wearing [OUTFIT]" in prompts
          const outfitExtractPattern = /wearing\s+([^,.]+(?:,\s*(?:and\s+)?[^,.]+)*?)(?=\s*(?:,\s*(?:is|are|was|were|has|stands?|sits?|walks?|runs?|looks?|holds?|plays?)\b|[.!]|\s*(?:in|at|on|near|by|under|inside|outside|beside|next|with)\s+(?:a|an|the|her|his)\b))/i;
          for (const p of imagePrompts) {
            const outfitMatch = p.match(outfitExtractPattern);
            if (outfitMatch && outfitMatch[1].trim().length > 3) {
              console.log(`[Book]   → Extracting outfit from prompts: "${outfitMatch[1]}" (replaces DNA: "${identity.outfit}")`);
              identity.outfit = outfitMatch[1].trim();
              break;
            }
          }

          console.log(`[Book]   → Post-override identity: gender="${identity.genderHint}", hair="${identity.hair}", outfit="${identity.outfit}"`);
        }
      }
      console.log(`[Book] Gender vote: girl=${promptGenderVote.girl}, boy=${promptGenderVote.boy}, identity="${identity.genderHint}"`);
    }

    // ── Extract additional character identities (multi-character stories) ──
    const additionalIdentities: CharacterIdentity[] = [];
    if (additionalCharacterBibles && Array.isArray(additionalCharacterBibles)) {
      for (const extraBible of additionalCharacterBibles) {
        const extraIdentity = extractCharacterIdentity(extraBible as CharacterBible);
        additionalIdentities.push(extraIdentity);
        console.log(`[Book] Additional character: ${extraIdentity.name} (${extraIdentity.species})`);
        console.log(`[Book]   Description: "${extraIdentity.description}"`);
      }
    }

    const storySeed = seed || Math.floor(Math.random() * 1000000);
    console.log(`[Book] Base seed: ${storySeed}, ${imagePrompts.length} pages`);
    console.log(`[Book] Pipeline: FLUX KONTEXT PRO — GPT writes prompts directly (simplified)`);
    if (additionalIdentities.length > 0) {
      console.log(`[Book] Multi-character mode: ${1 + additionalIdentities.length} characters total`);
    }

    // ── Get or generate character reference image ──
    let referenceImageUrl: string | null = null;

    // For human characters, don't use cached references — each human character looks unique
    // (different hair, outfit, skin tone). For animals, species-level caching works fine.
    // NOTE: History mode ALSO gets a reference image now — character consistency requires it.
    const isHumanCharacter = identity.genderHint !== "";
    const libraryResult = !isHumanCharacter ? lookupCharacter(identity.species) : null;
    if (libraryResult?.hasAssets) {
      // FAST PATH: Use cached reference image from library (animals only)
      console.log(`\n[Library] HIT: "${identity.species}" — using cached reference image`);
      const refBuffer = libraryResult.assets.refWhiteBuffer || libraryResult.assets.refNeutralBuffer;
      referenceImageUrl = getCharacterRefUrl(refBuffer, identity.species);
      if (referenceImageUrl) {
        console.log(`[Library] Reference image loaded (${Math.round((refBuffer?.length || 0) / 1024)}KB)`);
      }
    }

    if (!referenceImageUrl) {
      // GENERATE PATH: Create a clean reference image using Kontext txt2img.
      // NOTE: History mode ALSO needs a reference image for character consistency.
      // Previously we skipped it ("landscapes don't need refs") but that broke
      // character consistency completely — the kid looked different on every page.
      console.log(`\n[Library] MISS: "${identity.species}" — generating character reference with Kontext...`);

      const libChar = libraryResult?.character;
      const simpleSpeciesName = identity.species === 'rhinoceros' ? 'rhino' : identity.species;
      const isHumanRef = isHumanCharacter;
      const ageDesc = identity.age || "6 years old";
      const animalVisualDesc = identity.visualTokens.length > 0
        ? identity.visualTokens.join(", ")
        : `round eyes, soft round cheeks, friendly smile`;
      const animalOutfit = identity.outfit ? `, wearing ${identity.outfit}` : "";

      const genderWord = identity.genderHint || 'girl';
      const genderCuesRef = genderWord === 'girl'
        ? 'clearly a girl'
        : 'clearly a boy';
      const skinToneRef = identity.skinTone || '';
      const filteredVisualTokens = identity.visualTokens.length > 0
        ? identity.visualTokens.filter(t => !t.toLowerCase().includes('skin') && !t.toLowerCase().includes('eyes')).join(", ")
        : `soft cheeks, friendly smile`;
      // IMPORTANT: Reference image composition directly affects ALL page images.
      // Flux Kontext preserves the reference's layout — if the reference has a white bg
      // and big character, pages will trend toward white bg and big character.
      // Solution: Reference shows character SMALL in a simple colorful scene, with
      // REALISTIC child proportions (not chibi/big-head), so pages inherit good composition.
      //
      // FOR MULTI-CHARACTER STORIES: Generate a GROUP reference showing ALL characters
      // together with correct heights, genders, and outfits. This gives Flux a visual
      // template for the entire cast — without this, only the primary character is
      // consistent and all others drift wildly.
      const hasMultiCharRef = isHumanRef && additionalCharacterBibles && additionalCharacterBibles.length > 0;

      let refPrompt: string;
      if (hasMultiCharRef) {
        // ═══ GROUP REFERENCE IMAGE — all characters together ═══
        // Build a compact group portrait showing all characters side-by-side
        // with correct height ratios, genders, and distinguishing features.
        interface GroupChar {
          name: string;
          age: string;
          gender: string;
          hair: string;
          outfit: string;
          skinTone: string;
        }

        const allCharsForRef: GroupChar[] = [
          {
            name: identity.name,
            age: identity.age || '6 years old',
            gender: genderWord,
            hair: identity.hair || '',
            outfit: identity.outfit || 'colorful clothes',
            skinTone: identity.skinTone || 'light golden-tan skin',
          },
          ...(additionalCharacterBibles as CharacterBible[]).map((ab: CharacterBible) => ({
            name: ab.name,
            age: ab.age || '6 years old',
            gender: ab.gender || 'girl',
            hair: ab.appearance?.hair || '',
            outfit: ab.signature_outfit || ab.outfit || 'colorful clothes',
            skinTone: ab.appearance?.skin_tone || 'light golden-tan skin',
          })),
        ];

        // Sort by age descending (tallest first) for the group portrait
        allCharsForRef.sort((a, b) => {
          const ageA = parseFloat(a.age.replace(/[^\d.]/g, '')) || 6;
          const ageB = parseFloat(b.age.replace(/[^\d.]/g, '')) || 6;
          return ageB - ageA;
        });

        // Build compact character descriptions
        const charDescs = allCharsForRef.map((ch, idx) => {
          const ageNum = parseFloat(ch.age.replace(/[^\d.]/g, '')) || 6;
          const sizeWord = idx === 0 ? 'tallest' : (ageNum <= 3 ? 'tiny toddler' : 'shorter');
          return `a ${sizeWord} cartoon ${ch.gender}, ${Math.round(ageNum)}yo, ${ch.hair}, wearing ${ch.outfit}`;
        });

        const skinDesc = allCharsForRef[0].skinTone;
        refPrompt = [
          `Children's book illustration of ${allCharsForRef.length} cartoon children standing together in a simple outdoor scene`,
          `all with ${skinDesc}, same family`,
          ...charDescs,
          "characters take up about half the image height, full body visible head to feet",
          "standing on green grass with colorful flowers, blue sky with white clouds behind",
          "each character's face, hair, and clothing clearly visible",
          "children's book illustration, 2D cartoon style, bold black outlines, flat bright colors",
          "no text, no watermarks",
        ].join(". ");

        console.log(`[Reference] GROUP mode: ${allCharsForRef.length} characters`);
      } else if (isHumanRef) {
        // ═══ SINGLE CHARACTER REFERENCE — MEDIUM SIZE IN SCENE ═══
        // Balance between two competing needs:
        //   A) Character big enough for Flux to SEE features (face, hair, outfit)
        //   B) Character NOT so big that pages inherit a portrait composition
        // Solution: ~40-50% of frame, in a simple scene, features clearly visible.
        // Previously: 20% (too tiny → Flux couldn't see → character changed every page)
        // Previously: 90% portrait (too big → pages all became close-ups)
        refPrompt = [
          `Children's book illustration of a cartoon ${genderWord} in a simple outdoor scene`,
          `${ageDesc}`,
          skinToneRef ? `${skinToneRef}` : '',
          genderCuesRef,
          identity.hair ? identity.hair : "",
          identity.accessories ? `wearing ${identity.accessories}` : "",
          identity.outfit ? `wearing ${identity.outfit}` : "",
          "the character takes up about half the image height, full body visible head to feet",
          "standing on green grass with colorful flowers, blue sky with white clouds behind",
          "face, hair, and clothing clearly visible and recognizable",
          genderWord === 'girl' ? "girl has LONG hair (shoulder length or longer), NO earrings, NO jewelry, NO piercings" : "",
          "children's book illustration, 2D cartoon style, bold black outlines, flat bright colors",
          "no text, no watermarks, no letters, no writing",
        ].filter(Boolean).join(", ");
      } else {
        // ═══ ANIMAL REFERENCE ═══
        refPrompt = [
          `Children's picture book illustration of a small cute cartoon ${simpleSpeciesName}`,
          animalVisualDesc + animalOutfit,
          "standing upright in a bright colorful meadow with green grass and wildflowers",
          "the character is SMALL in the frame, about one-quarter of the image height, surrounded by lots of detailed scenery",
          "full body visible from head to toe",
          "Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes, detailed background",
          "cute round proportions",
          "no text, no watermarks",
        ].join(", ");
      }

      console.log(`[Reference] Prompt: "${refPrompt.substring(0, 200)}..."`);

      try {
        let refUrl = await generateKontextImage(replicate, {
          prompt: refPrompt,
          seed: storySeed,
          pageIndex: 99,
          safetyTolerance: 4,  // Reference images: character portraits (capped by MAX_REF_SAFETY_TOLERANCE)
        });

        // If that failed, try an even simpler prompt
        if (!refUrl) {
          console.log(`[Reference] First attempt failed, trying simplified prompt...`);
          const skinSimple = skinToneRef ? `, ${skinToneRef}` : '';
          const accessorySimple = identity.accessories ? `, wearing ${identity.accessories}` : '';
          const simplePrompt = isHumanRef
            ? `cartoon ${genderWord}, ${ageDesc}${skinSimple}, ${genderCuesRef}${identity.hair ? ', ' + identity.hair : ''}${accessorySimple}, children's book illustration, standing on green grass, blue sky, full body visible, character about half the image, 2D cartoon style, bold outlines`
            : `cartoon ${simpleSpeciesName}, children's book illustration, standing on green grass, blue sky, full body visible, character about half the image, 2D cartoon style, bold outlines`;
          refUrl = await generateKontextImage(replicate, {
            prompt: simplePrompt,
            seed: storySeed + 1,
            pageIndex: 99,
            safetyTolerance: 5,  // Retry reference with more permissive (capped by MAX_REF_SAFETY_TOLERANCE)
          });
        }

        if (refUrl) {
          referenceImageUrl = refUrl;
          console.log(`[Reference] Generated clean reference: ${refUrl.substring(0, 60)}...`);

          // Cache for next time (animals only — human characters are unique)
          if (!isHumanRef) {
            try {
              const resp = await fetch(refUrl);
              if (resp.ok) {
                const refBuffer = Buffer.from(await resp.arrayBuffer());
                const speciesKey = libraryResult?.character.species || identity.species;
                saveAssets(speciesKey, refBuffer, null, null);
                console.log(`[Library] Cached reference for "${speciesKey}" — next story will be instant`);
              }
            } catch (e) {
              console.warn(`[Library] Failed to cache reference:`, e);
            }
          } else {
            console.log(`[Library] Skipping cache for human character — each character is unique`);
          }
        }
      } catch (e) {
        console.warn(`[Reference] Kontext reference generation failed:`, e);
      }
    }

    if (referenceImageUrl) {
      console.log(`[Book] Reference image ready — character consistency enabled`);
    } else {
      console.warn(`[Book] WARNING: No reference image — character consistency will be limited`);
    }

    // ── Generate pages with bounded concurrency ──
    // No more precomputed poses, scene card processing, or visual scene extraction.
    // GPT's IMAGE_PROMPT is the complete prompt — we just add safety cues.
    const imageUrls: string[] = new Array(imagePrompts.length).fill("");
    const usedSeeds: number[] = [];
    let nextIdx = 0;

    const imageWorker = async () => {
      while (nextIdx < imagePrompts.length) {
        const i = nextIdx++;
        const pageSeed = seeds?.[i] ?? storySeed + i * 1000;
        usedSeeds[i] = pageSeed;

        console.log(`\n========== GENERATING PAGE ${i + 1}/${imagePrompts.length} ==========`);

        const result = await generateOnePage(
          imagePrompts[i], i, pageSeed, identity, referenceImageUrl || undefined, additionalIdentities, storyMode
        );
        imageUrls[i] = result.url;
      }
    };

    // Launch image workers
    const imageWorkers = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, imagePrompts.length) },
      () => imageWorker()
    );

    await Promise.all(imageWorkers);

    // ── Build response ──
    const imgSuccessCount = imageUrls.filter((u) => u).length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========== GENERATION COMPLETE ==========`);
    console.log(`Pipeline: FLUX KONTEXT PRO (GPT writes prompts directly)`);
    console.log(`Images: ${imgSuccessCount}/${imagePrompts.length} succeeded`);
    console.log(`Total time: ${elapsed}s`);
    console.log(`Seeds: ${usedSeeds.join(", ")}`);
    console.log(`==============================================\n`);

    return NextResponse.json({ imageUrls, videoUrls: [], seed: storySeed, seeds: usedSeeds });
  } catch (error) {
    console.error("Error in image generation:", error);
    return NextResponse.json({ error: "Failed to generate images" }, { status: 500 });
  }
}
