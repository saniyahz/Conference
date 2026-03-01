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
 * Set to 1 (sequential) to prevent cascading 429 rate-limit failures.
 * With <$5 Replicate credit, the rate limit is 6 req/min with burst of 1.
 * Sequential generation is only ~30s slower (60s → 90s for 10 pages) but
 * eliminates 429 cascading failures entirely.
 */
const PAGE_CONCURRENCY = 2;

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
      visualTokens: ["cartoon animal", "big expressive eyes", "friendly smile"],
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
      skinTone = 'warm light-brown skin';
    } else if (rawSkinTone.includes('brown') || rawSkinTone.includes('caramel') || rawSkinTone.includes('warm brown')) {
      skinTone = 'brown skin, brown complexion';
    } else if (rawSkinTone.includes('tan') || rawSkinTone.includes('olive')) {
      skinTone = 'tan olive skin';
    } else if (rawSkinTone.includes('fair') || rawSkinTone.includes('pale') || rawSkinTone.includes('light')) {
      skinTone = 'fair light skin';
    } else if (rawSkinTone) {
      skinTone = rawSkinTone;
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
    const genderCue = genderWord === 'girl' ? ', feminine features, cute girl face' : ', boyish features, young boy face';
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
      prompt = `Text-free children's book illustration, WIDE SHOT. A small cute cartoon young ${genderWord}, ${identity.age || '6 years old'}, ${identity.skinTone || ''}, ${identity.hair || ''}, wearing ${identity.outfit || 'colorful clothes'}, is standing happily in a bright colorful storybook landscape with rolling green hills, a winding path, colorful wildflowers, butterflies, and a bright blue sky with fluffy clouds. The character is small in the frame, about one-third of the image, surrounded by the rich environment. Soft painterly style, warm colors, detailed background.`;
    } else {
      const outfitPart = identity.outfit ? `, wearing ${identity.outfit}` : "";
      prompt = `Text-free children's book illustration, WIDE SHOT. A small cute cartoon ${identity.species}${outfitPart} is standing happily in a bright colorful meadow with tall wildflowers, a babbling brook, butterflies, and distant rolling hills under a bright blue sky with fluffy clouds. The character is small in the frame, about one-third of the image. Soft painterly style, warm colors, detailed background.`;
    }
  }

  console.log(`[Page ${pageIndex + 1}] GPT prompt: "${prompt.substring(0, 200)}..."`);

  // ── 1b. Front-load critical cues (Flux weighs the beginning of the prompt most) ──
  // Skin tone and composition MUST be near the start, not appended at the end.
  if (isHumanChar && identity.skinTone) {
    // Inject skin tone right after the character description in the prompt
    // Replace "light warm skin" or "light skin" with the correct skin tone from bible
    const skinLower = identity.skinTone.toLowerCase();
    if (skinLower.includes('brown') || skinLower.includes('dark')) {
      // Fix GPT's tendency to write "light warm skin" — replace with correct tone
      prompt = prompt
        .replace(/\blight warm skin\b/gi, identity.skinTone)
        .replace(/\blight skin\b/gi, identity.skinTone)
        .replace(/\bfair skin\b/gi, identity.skinTone)
        .replace(/\bpale skin\b/gi, identity.skinTone)
        .replace(/\bpeachy skin\b/gi, identity.skinTone)
        .replace(/\blight complexion\b/gi, 'brown complexion')
        .replace(/\bfair complexion\b/gi, 'brown complexion');
    }
  }

  // ── 2. Content safety validation + word replacements ──
  // First, validate against blocklist (skip the page if severely unsafe)
  const contentCheck = validateContent(prompt);
  if (!contentCheck.safe) {
    console.warn(`[Page ${pageIndex + 1}] BLOCKED content in image prompt: "${contentCheck.matchedTerm}" — using identity fallback`);
    if (isHumanChar) {
      const genderWord = identity.genderHint || "girl";
      prompt = `Text-free children's book illustration, WIDE SHOT. A small cute cartoon young ${genderWord}, ${identity.age || '6 years old'}, ${identity.skinTone || ''}, ${identity.hair || ''}, wearing ${identity.outfit || 'colorful clothes'}, is standing happily in a bright colorful park with swings, a sandbox, tall trees with golden leaves, and a bright blue sky. The character is small in the frame, about one-third of the image. Soft painterly style, warm colors, detailed background.`;
    } else {
      const outfitPart = identity.outfit ? `, wearing ${identity.outfit}` : "";
      prompt = `Text-free children's book illustration, WIDE SHOT. A small cute cartoon ${identity.species}${outfitPart} is standing happily in a bright colorful meadow with wildflowers, a winding stream, butterflies, and distant mountains under a bright sky. The character is small in the frame, about one-third of the image. Soft painterly style, warm colors, detailed background.`;
    }
  }

  // Sanitize sensitive terms (death → gentle alternative, etc.)
  const { cleaned: sanitizedPrompt } = sanitizeText(prompt);
  prompt = sanitizedPrompt;

  // Replace fear/anxiety words with positive equivalents
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
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  // ── 3-6. Suffix construction ──
  // CRITICAL: Flux Kontext has an effective attention window of ~1200-1500 chars.
  // GPT's IMAGE_PROMPT is already ~800-1000 chars for multi-character scenes.
  // We MUST keep suffixes SHORT to stay within Flux's attention.
  //
  // Strategy: For MULTI-CHARACTER stories, use ultra-compact suffixes.
  // For single-character stories, use the full verbose suffixes.
  const genderLabel = identity.genderHint || "girl";
  const hasMultipleMainChars = additionalIdentities && additionalIdentities.length > 0;

  if (hasMultipleMainChars) {
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

    // No-text + style in one compact line
    prompt += '. No text/words/letters in image. Correct anatomy, no extra limbs';

  } else {
    // ═══════ SINGLE CHARACTER MODE — FULL SUFFIX ═══════
    if (isHumanChar) {
      const mentionsOtherPeople = /\b(?:friend|friends|boy|boys|worker|workers|people|children|kids|man|woman|lady|passengers?|attendant|teacher|parent|dad|mom|mother|father|sister|brother|classmate)\b/i.test(prompt);
      const mentionsAdult = /\b(?:dad|father|mom|mother|parent|grandpa|grandma|grandfather|grandmother|uncle|aunt|teacher|adult)\b/i.test(prompt);

      if (mentionsAdult) {
        prompt += `. Adults must be TALL with adult proportions, much taller than the child`;
      }

      if (mentionsOtherPeople) {
        prompt += `. Main character is a young ${genderLabel} with ${identity.skinTone || 'matching skin tone'}`;
      } else {
        prompt += `. Only one young ${genderLabel} with ${identity.skinTone || 'matching skin tone'} in the scene, no other people`;
      }
    } else {
      prompt += '. Only one character in the scene, no humans, no people, animal character only';
    }

    // Skin tone reinforcement (single char — more space to be verbose)
    if (isHumanChar && identity.skinTone) {
      const skinLower = identity.skinTone.toLowerCase();
      if (skinLower.includes('dark brown') || skinLower.includes('deep brown')) {
        prompt += `. CRITICAL: skin is ${identity.skinTone}, NOT white, NOT pale`;
      } else {
        prompt += `. Character must have ${identity.skinTone}`;
      }
    }

    // Hair reinforcement
    if (isHumanChar && identity.hairCue) {
      prompt += `. Character must have ${identity.hairCue}`;
    }

    // Accessories
    if (identity.accessories) {
      prompt += `. Must be wearing ${identity.accessories}`;
    }

    // Anti-limbs + composition + no-text
    prompt += '. Correct anatomy, no extra limbs, no extra fingers';
    prompt += '. WIDE SHOT, character small in frame, richly detailed environment';
    prompt += '. No text, no words, no letters anywhere in the image';
    prompt += '. Bright, cheerful, child-friendly storybook illustration';
  }

  console.log(`[Page ${pageIndex + 1}] Final prompt (${prompt.length} chars): "${prompt.substring(0, 300)}..."`);

  // ── 7. Generate with Kontext ──
  const url = await generateKontextImage(replicate, {
    prompt,
    inputImageUrl: referenceImageUrl,
    seed,
    pageIndex,
  });

  if (!url) {
    // Retry once with a simpler prompt (strip visual cues that might trigger safety filters)
    console.warn(`[Page ${pageIndex + 1}] First attempt failed, retrying with simplified prompt...`);
    const simplifiedPrompt = prompt
      .replace(/feminine features, pretty eyelashes, cute girl face/g, '')
      .replace(/boyish features, young boy face/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const retryUrl = await generateKontextImage(replicate, {
      prompt: simplifiedPrompt,
      inputImageUrl: referenceImageUrl,
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
    const { imagePrompts, seed, seeds, characterBible, additionalCharacterBibles } = await request.json();

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
    const isHumanCharacter = identity.genderHint !== "";
    const libraryResult = isHumanCharacter ? null : lookupCharacter(identity.species);
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
      console.log(`\n[Library] MISS: "${identity.species}" — generating character reference with Kontext...`);

      const libChar = libraryResult?.character;
      const simpleSpeciesName = identity.species === 'rhinoceros' ? 'rhino' : identity.species;
      const isHumanRef = isHumanCharacter;
      const ageDesc = identity.age || "6 years old";
      const animalVisualDesc = identity.visualTokens.length > 0
        ? identity.visualTokens.join(", ")
        : `big expressive eyes, soft round cheeks, friendly smile`;
      const animalOutfit = identity.outfit ? `, wearing ${identity.outfit}` : "";

      const genderWord = identity.genderHint || 'girl';
      const genderCuesRef = genderWord === 'girl'
        ? 'feminine features, pretty eyelashes, cute girl face, clearly a girl'
        : 'boyish features, young boy face, clearly a boy';
      const skinToneRef = identity.skinTone || '';
      const filteredVisualTokens = identity.visualTokens.length > 0
        ? identity.visualTokens.filter(t => !t.toLowerCase().includes('skin')).join(", ")
        : `big expressive brown eyes, soft cheeks, friendly smile`;
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
            skinTone: identity.skinTone || 'warm skin',
          },
          ...(additionalCharacterBibles as CharacterBible[]).map((ab: CharacterBible) => ({
            name: ab.name,
            age: ab.age || '6 years old',
            gender: ab.gender || 'girl',
            hair: ab.appearance?.hair || '',
            outfit: ab.signature_outfit || ab.outfit || 'colorful clothes',
            skinTone: ab.appearance?.skin_tone || 'warm skin',
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
          `Children's picture book illustration of ${allCharsForRef.length} children standing side by side`,
          `all with ${skinDesc}, same family`,
          ...charDescs,
          "standing together in a bright colorful meadow with green grass",
          "full body visible head to toe, correct height differences based on age",
          "soft painterly style, warm vibrant colors",
          "no text, no watermarks",
        ].join(". ");

        console.log(`[Reference] GROUP mode: ${allCharsForRef.length} characters`);
      } else if (isHumanRef) {
        // ═══ SINGLE CHARACTER REFERENCE ═══
        refPrompt = [
          `Children's picture book illustration of a small cute cartoon young ${genderWord}`,
          `${ageDesc}, realistic child proportions`,
          skinToneRef ? `${skinToneRef}, NOT white skin, NOT pale skin` : '',
          genderCuesRef,
          filteredVisualTokens,
          identity.hair ? identity.hair : "",
          identity.accessories ? `wearing ${identity.accessories}` : "",
          identity.outfit ? `wearing ${identity.outfit}` : "",
          "standing in a bright colorful meadow with green grass and wildflowers",
          "the character is small in the frame, about one-third of the image height",
          "full body visible from head to toe",
          "soft painterly style, warm vibrant colors, detailed background",
          "no text, no watermarks",
        ].filter(Boolean).join(", ");
      } else {
        // ═══ ANIMAL REFERENCE ═══
        refPrompt = [
          `Children's picture book illustration of a small cute cartoon ${simpleSpeciesName}`,
          animalVisualDesc + animalOutfit,
          "standing upright in a bright colorful meadow with green grass and wildflowers",
          "the character is small in the frame, about one-third of the image height",
          "full body visible from head to toe",
          "soft painterly style, warm vibrant colors, detailed background",
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
            ? `cute cartoon young ${genderWord}, ${ageDesc}, small child${skinSimple}, ${genderCuesRef}${identity.hair ? ', ' + identity.hair : ''}${accessorySimple}, children's book illustration, friendly smile, big eyes, white background, full body, simple, colorful`
            : `cute cartoon ${simpleSpeciesName}, children's book illustration, friendly smile, big eyes, white background, full body, simple, colorful`;
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
          imagePrompts[i], i, pageSeed, identity, referenceImageUrl || undefined, additionalIdentities
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
