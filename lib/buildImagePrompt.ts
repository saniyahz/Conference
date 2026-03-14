/**
 * buildImagePrompt.ts — Assembles Flux-ready image prompts from structured data.
 *
 * ARCHITECTURE:
 *   GPT outputs structured JSON (scene cards + character DNA)
 *   → buildImagePrompt() combines CharacterIdentity + SceneCard + StoryWorldDNA
 *   → Produces a complete, correct Flux Kontext prompt
 *
 * This eliminates the 285-line regex correction pipeline in generate-images/route.ts
 * because prompts are assembled from AUTHORITATIVE structured data, not from
 * GPT's free-text IMAGE_PROMPTs that frequently contradict its own CHARACTER_DNA.
 *
 * Assembly order (respecting Flux's ~1200-1500 char attention window):
 *   1. Opener: "Text-free children's book illustration, {SHOT_TYPE}."
 *   2. Environment (scene is star): setting, foreground, midground, background, lighting
 *   3. Character block (from CharacterIdentity — authoritative, never GPT's imagination)
 *   4. Action: character_pose_expression
 *   5. Multi-character: compact height chart + per-character appearance
 *   6. Adult rules: modest clothing enforcement
 *   7. Safety suffix: composition, no-text, anatomy, long-hair-for-girls, no-earrings
 *   8. Style: "Children's book illustration, 2D cartoon style, bold outlines, flat bright colors"
 */

import type { SceneCard, StoryWorldDNA } from './imagination-types';
import { validateContent, sanitizeText } from './contentSafety';

// ─── CharacterIdentity (same interface as generate-images/route.ts) ─────
// We define it here so buildImagePrompt.ts is self-contained.
// The generate-images route also defines this — they must stay in sync.

export interface CharacterIdentity {
  name: string;
  species: string;
  description: string;
  visualTokens: string[];
  hair: string;
  outfit: string;
  genderHint: string;
  age: string;
  skinTone: string;
  hairCue: string;
  accessories: string;
  ethnicityFeatures: string;
}

// ─── Sanitization ───────────────────────────────────────────────────────────

/** Replace scary/violent words with kid-friendly equivalents */
function sanitizeForKidsLocal(text: string): string {
  return text
    .replace(/\bworried\b/gi, 'curious')
    .replace(/\bscared\b/gi, 'surprised')
    .replace(/\bterrified\b/gi, 'amazed')
    .replace(/\bpanick(?:ed|ing|y)?\b/gi, 'excited')
    .replace(/\bfrightened\b/gi, 'surprised')
    .replace(/\banxious\b/gi, 'curious')
    .replace(/\bafraid\b/gi, 'curious')
    .replace(/\bnervous\b/gi, 'curious')
    .replace(/\bfighting\b/gi, 'playing')
    .replace(/\bweapons?\b/gi, 'toy')
    .replace(/\bswords?\b/gi, 'magic wand')
    .replace(/\bguns?\b/gi, 'water squirter')
    .replace(/\bknife\b/gi, 'stick')
    .replace(/\bknives\b/gi, 'sticks')
    .replace(/\bgloomy\b/gi, 'cozy')
    .replace(/\bsinister\b/gi, 'mysterious')
    .replace(/\bhaunted\b/gi, 'enchanted')
    .replace(/\bcreepy\b/gi, 'quirky')
    .replace(/\bscary\b/gi, 'surprising')
    .replace(/\bsexy\b/gi, 'cute')
    .replace(/\brevealing\b/gi, 'colorful')
    .replace(/\b(?:danger|emergency|wobbl|turbulence|crash(?:ing|ed|es)?|sink(?:ing|s)?)\b[^,.]*[,.]?/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filter religious figures from image prompts */
function filterReligiousFigures(text: string): string {
  return text
    .replace(/\b(?:the\s+)?(?:Prophet\s+)?Muhammad(?:\s+\(.*?\))?/gi, 'the community elders')
    .replace(/\bthe\s+Prophet\b/gi, 'the community')
    .replace(/\bProphet\s+[A-Z][a-z]+/gi, 'a wise elder')
    .replace(/\bAllah\b/gi, 'the sky')
    .replace(/\bGod(?:'s)?\s+(?:words?|messages?|voice|light|guidance)\b/gi, 'ancient wisdom')
    .replace(/\breceiv(?:es?|ing|ed)\s+(?:messages?|words?|revelations?)\s+from\s+God\b/gi, 'studying ancient scrolls')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Skin tone consistency enforcement ──────────────────────────────────────

/** Conflicting skin descriptors that must be removed if they contradict character DNA */
const CONFLICTING_SKIN_DESCRIPTORS = [
  /\bfair skin\b/gi,
  /\bpale skin\b/gi,
  /\blight skin\b/gi,
  /\bporcelain skin\b/gi,
  /\bpeach skin\b/gi,
  /\bivory skin\b/gi,
  /\brosy skin\b/gi,
  /\bcream(?:y)? skin\b/gi,
  /\bwhite skin\b/gi,
  /\bpinkish skin\b/gi,
  /\bglowing pale\b/gi,
  /\bpale complexion\b/gi,
  /\blight complexion\b/gi,
];

/**
 * Strip skin descriptors from the prompt that conflict with the character's
 * actual skin tone from DNA. Prevents GPT scene cards or lighting language
 * from overriding the character's established skin color.
 */
export function stripConflictingSkinDescriptors(text: string, actualSkinTone: string): string {
  if (!actualSkinTone) return text;
  const skinLower = actualSkinTone.toLowerCase();

  // Only strip if the character is NOT fair/light-skinned
  // (if they ARE fair, these descriptors are correct and should stay)
  if (skinLower.includes('fair') || skinLower.includes('pale') || skinLower.includes('light skin') || skinLower.includes('ivory') || skinLower.includes('porcelain')) {
    return text;
  }

  let result = text;
  for (const pattern of CONFLICTING_SKIN_DESCRIPTORS) {
    result = result.replace(pattern, '');
  }
  // Clean up double spaces/commas from removal
  return result.replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Rewrite lighting language so it affects the SCENE, not the character's skin.
 * "bathed in golden light" → "golden light across the scene"
 * "glowing under moonlight" → "moonlight across the environment"
 */
export function sanitizeLightingForSkinTone(text: string): string {
  return text
    .replace(/\bbathed\s+in\s+(\w+)\s+light\b/gi, '$1 light across the scene')
    .replace(/\bglowing\s+(?:under|in|with)\s+(\w+)\s*(?:light|glow)?\b/gi, '$1 light in the environment')
    .replace(/\bskin\s+(?:glows?|shines?|gleams?|radiates?)\b/gi, 'scene glows')
    .replace(/\b(?:golden|warm|silver|pale|cool)\s+light\s+on\s+(?:skin|face|body)\b/gi, (match) => {
      const lightType = match.match(/^(\w+\s+light)/i)?.[1] || 'light';
      return `${lightType} across the scene`;
    });
}

// ─── Shot type mapping ──────────────────────────────────────────────────────

const SHOT_TYPE_MAP: Record<string, string> = {
  extreme_wide: 'EXTREME WIDE SHOT',
  birds_eye: "BIRD'S EYE VIEW",
  low_angle: 'LOW ANGLE SHOT',
  worms_eye: "WORM'S EYE VIEW",
  over_shoulder: 'OVER THE SHOULDER SHOT',
  medium: 'MEDIUM SHOT',
  close_up: 'CLOSE-UP SHOT',
  wide: 'WIDE SHOT',
  // Pass through if already formatted
};

function mapShotType(shot: string): string {
  const key = shot.toLowerCase().replace(/[\s-]+/g, '_');
  return SHOT_TYPE_MAP[key] || shot.toUpperCase();
}

// ─── Main builder ───────────────────────────────────────────────────────────

export interface BuildImagePromptOptions {
  additionalIdentities?: CharacterIdentity[];
  mentionsAdult?: boolean;
  storyMode?: string;  // 'imagination' | 'history' | 'coping'
  ageGroup?: string;   // '3-5' | '6-8' | '9-12'
}

/**
 * Build a complete Flux-ready image prompt from structured data.
 *
 * This replaces GPT writing IMAGE_PROMPTs directly (which frequently
 * contradicted its own CHARACTER_DNA). Every character attribute comes from
 * the authoritative CharacterIdentity extracted from CHARACTER_DNA.
 */
export function buildImagePrompt(
  identity: CharacterIdentity,
  sceneCard: SceneCard,
  worldDNA: StoryWorldDNA,
  pageIndex: number,
  options?: BuildImagePromptOptions,
): string {
  const isHumanChar = identity.genderHint !== '';
  const hasMultipleMainChars = options?.additionalIdentities && options.additionalIdentities.length > 0;
  const genderLabel = identity.genderHint || 'girl';

  // ── 1. Opener + SKIN TONE ANCHOR (front-loaded for Flux attention) ──
  // Flux's effective attention window is ~1200-1500 chars. Skin tone MUST appear
  // in the first 200 chars AND at the very end of the prompt to prevent drift.
  const shotLabel = mapShotType(sceneCard.shot_type);
  const isGraphicNovel = options?.ageGroup === '9-12';
  const styleOpener = isGraphicNovel ? 'Text-free graphic novel illustration' : "Text-free children's book illustration";
  let prompt: string;
  if (isHumanChar && identity.skinTone) {
    prompt = `${styleOpener}, ${shotLabel}, a ${genderLabel} with ${identity.skinTone}.`;
  } else {
    prompt = `${styleOpener}, ${shotLabel}.`;
  }

  // ── 2. Environment (scene is star) ──
  prompt += ` ${sceneCard.setting}.`;
  if (sceneCard.foreground) prompt += ` ${sceneCard.foreground}.`;
  if (sceneCard.midground) prompt += ` ${sceneCard.midground}.`;
  if (sceneCard.background) prompt += ` ${sceneCard.background}.`;
  if (sceneCard.lighting_mood) {
    // Sanitize lighting so it affects the SCENE, not the character's skin
    const safeLighting = sanitizeLightingForSkinTone(sceneCard.lighting_mood);
    prompt += ` ${safeLighting}.`;
  }

  // ── 3. Character block (from authoritative CharacterIdentity) ──
  if (isHumanChar) {
    const ageCue = identity.age ? `, ${identity.age}` : ', young child';
    const skinCue = identity.skinTone ? `, ${identity.skinTone}` : '';
    const ethCue = identity.ethnicityFeatures ? `, ${identity.ethnicityFeatures}` : '';
    const hairCue = identity.hair ? `, ${identity.hair}` : '';
    const outfitCue = identity.outfit ? `, wearing ${identity.outfit}` : '';
    const accessoryCue = identity.accessories ? `, ${identity.accessories}` : '';

    // CRITICAL: Use "child" not just "girl/boy" — Flux renders "girl" as teenager/adult.
    // "small child" + age forces Flux into child proportions: big head, short limbs, no curves.
    prompt += ` A small cute cartoon ${genderLabel} child named ${identity.name}${ageCue}, small childlike body, big round head, short stubby limbs, NO adult body proportions${skinCue}${ethCue}${hairCue}${accessoryCue}${outfitCue}`;
  } else {
    // Animal/creature character
    const outfitPart = identity.outfit ? `, wearing ${identity.outfit}` : '';
    const visualDesc = identity.visualTokens.join(', ');
    prompt += ` A cute cartoon ${identity.species} named ${identity.name}, ${visualDesc}${outfitPart}`;
  }

  // ── 4. Action (pose + expression from scene card) ──
  if (sceneCard.character_pose_expression) {
    prompt += `, is ${sceneCard.character_pose_expression}`;
  }
  prompt += '.';

  // ── 5. Key props (filtered — remove items that confuse Flux) ──
  if (sceneCard.key_props && sceneCard.key_props.length > 0) {
    // Filter out props that Flux misinterprets as literal objects or that
    // add clutter (abstract concepts, writing tools that become random objects)
    const SPURIOUS_PROPS = /\b(pen|pencil|quill|feather pen|notebook|journal|diary|scroll|paper|letter|envelope|book|writing|note|ink)\b/i;
    const filteredProps = sceneCard.key_props.filter(p => !SPURIOUS_PROPS.test(p));
    if (filteredProps.length > 0) {
      prompt += ` Key elements: ${filteredProps.join(', ')}.`;
    }
  }

  // ── 5b. Multi-character: height chart + per-character appearance ──
  if (hasMultipleMainChars && options!.additionalIdentities) {
    // Check if this is an all-animal cast (no humans at all)
    const allAreAnimals = !isHumanChar && options!.additionalIdentities.every(id => !id.genderHint);

    if (allAreAnimals) {
      // ═══ ANIMAL MULTI-CHARACTER — species-based descriptions ═══
      // No height chart (animals don't have age-based heights like humans).
      // Instead, list each animal with species + visual traits so Flux knows what to draw.
      prompt += ` Multiple animal characters in this scene:`;
      // Main character already described above — list supporting animals
      for (const extraId of options!.additionalIdentities) {
        const extraSpecies = extraId.species || 'animal';
        const extraVisual = extraId.visualTokens.length > 0 ? extraId.visualTokens.join(', ') : '';
        const extraOutfit = extraId.outfit ? `, wearing ${extraId.outfit}` : '';
        prompt += ` ${extraId.name} is a cute cartoon ${extraSpecies}${extraVisual ? ', ' + extraVisual : ''}${extraOutfit}.`;
      }
      prompt += ` Each animal is a DIFFERENT species — do NOT make them look the same.`;
    } else {
      // ═══ HUMAN / MIXED MULTI-CHARACTER — height chart + per-character ═══
      const allChars = [
        { name: identity.name, age: identity.age, gender: identity.genderHint, species: identity.species },
        ...options!.additionalIdentities.map(id => ({ name: id.name, age: id.age, gender: id.genderHint, species: id.species }))
      ];

      // Sort by age descending for height chart (humans only)
      const humanChars = allChars.filter(c => c.gender);
      const animalChars = allChars.filter(c => !c.gender);

      if (humanChars.length > 0) {
        const sortedByAge = [...humanChars].sort((a, b) => {
          const ageA = parseFloat((a.age || '6').replace(/[^\d.]/g, '')) || 6;
          const ageB = parseFloat((b.age || '6').replace(/[^\d.]/g, '')) || 6;
          return ageB - ageA;
        });

        const heightParts: string[] = [];
        let prevAge = -1;
        for (const ch of sortedByAge) {
          const ageNum = parseFloat((ch.age || '6').replace(/[^\d.]/g, '')) || 6;
          const sizeHint = ageNum <= 3 ? ',tiny toddler' : ageNum >= 8 ? ',tallest' : '';
          const connector = heightParts.length === 0 ? '' : (ageNum === prevAge ? ' = ' : ' > ');
          heightParts.push(`${connector}${ch.name}(${Math.round(ageNum)},${ch.gender}${sizeHint})`);
          prevAge = ageNum;
        }
        prompt += ` HEIGHTS: ${heightParts.join('')}.`;
      }

      // Skin tone — family consistency (humans only)
      if (identity.skinTone) {
        prompt += ` All same family, same skin: ${identity.skinTone}.`;
      }

      // Each additional character's distinct appearance
      for (const extraId of options!.additionalIdentities) {
        if (extraId.genderHint) {
          // Human additional character
          const parts: string[] = [];
          if (extraId.outfit) parts.push(`wears ${extraId.outfit.split(',')[0].trim()}`);
          if (extraId.hair) parts.push(`has ${extraId.hair}`);
          if (parts.length > 0) {
            prompt += ` ${extraId.name}(${extraId.genderHint}): ${parts.join(', ')}.`;
          }
        } else {
          // Animal additional character — MUST describe species explicitly
          const extraSpecies = extraId.species || 'animal';
          const extraVisual = extraId.visualTokens.length > 0 ? extraId.visualTokens.join(', ') : '';
          const extraOutfit = extraId.outfit ? `, wearing ${extraId.outfit}` : '';
          prompt += ` ${extraId.name} is a cute cartoon ${extraSpecies}${extraVisual ? ', ' + extraVisual : ''}${extraOutfit}.`;
        }
      }

      // Describe any animal companions in the mixed cast
      if (animalChars.length > 0) {
        prompt += ` Each animal is a DIFFERENT species — do NOT make them look the same as other characters.`;
      }
    }
  }

  // ── 6. Adult rules ──
  if (options?.mentionsAdult && isHumanChar) {
    prompt += ` Adults are the child's FAMILY — same ${identity.skinTone || 'skin tone'}, looking related.`;
    prompt += ' Adults must be TALL with adult proportions, wearing FULL modest clothing — long sleeves, covered shoulders, long pants or long skirt, cardigan or sweater. No revealing, tight, or short clothing.';
    prompt += ' Adult must keep the SAME face, hair, and clothing across all pages — do not change adult appearance between pages.';
  }

  // ── 7. Safety suffix ──
  const isHistoryMode = options?.storyMode === 'history';

  if (isHistoryMode) {
    // ═══════ HISTORY MODE — SCENE + ENVIRONMENT DOMINANT ═══════
    // History mode is about the PLACE, the ERA, the ARCHITECTURE, the LANDSCAPE.
    // Characters are tiny observers, NOT the focus. The historical scene is the star.
    prompt += ' EXTREME WIDE SHOT — the historical scene, architecture, landscape, and environment dominate the ENTIRE image.';
    prompt += ' The child character is TINY, only 10-15% of the image height, placed at the edge or corner observing the scene.';
    prompt += ' Focus on historical details: architecture, clothing of the era, tools, vehicles, landscape, cultural artifacts.';
    prompt += ' Minimize people — show the PLACE and SETTING, not crowds or character close-ups.';

    // Minimal character identity (they're tiny anyway)
    if (identity.skinTone) {
      prompt += ` The small child has ${identity.skinTone}.`;
    }

    prompt += ' Girl characters must have LONG hair, NO earrings, NO jewelry.';
  } else if (hasMultipleMainChars) {
    // Multi-character: compact suffix
    prompt += ' All characters are CHILDREN — small childlike bodies, big round heads, short stubby limbs, NO adult bodies, NO teenager proportions, NO curves.';
    prompt += ' WIDE SHOT — each child is about 20-25% of the image height, environment fills most of the frame.';
    prompt += ' Girl characters must have LONG hair, NO earrings, NO jewelry. Correct anatomy.';
  } else if (isHumanChar) {
    // Single character: scene-focused suffix
    // NOTE: Skin tone reinforcement moved to section 9 (final anchor) for maximum Flux attention.

    // Compact identity reinforcement (hair, outfit, accessories)
    const identityCues: string[] = [];
    if (identity.hairCue) identityCues.push(identity.hairCue);
    if (identity.outfit) identityCues.push(`wearing ${identity.outfit.split(',')[0].trim()}`);
    if (identity.accessories) identityCues.push(identity.accessories);
    if (identityCues.length > 0) {
      prompt += ` ${identityCues.join(', ')}.`;
    }

    prompt += ' Correct anatomy (two arms, two legs, no extra limbs, five fingers per hand).';
    prompt += ' The character is a CHILD — small childlike body, big round head, short stubby limbs. NO adult body, NO teenager body, NO curves, NO mature proportions.';
    prompt += ' EXTREME WIDE SHOT composition — character is TINY, only 15-20% of image height, full body visible head to feet.';
    prompt += ' The environment fills 80%+ of the image — detailed backgrounds with depth and atmosphere.';
    prompt += ' Girl characters must have LONG hair (shoulder length or longer), NO earrings, NO jewelry, NO piercings.';
  } else {
    // Animal character
    prompt += ' No humans, animal character only.';
    // Explicit anatomy for quadrupeds — "correct anatomy" alone is too vague for Flux
    const speciesLower = (identity.species || '').toLowerCase();
    const isQuadruped = /\b(fox|dog|cat|puppy|kitten|bear|deer|wolf|lion|tiger|rabbit|bunny|horse|pony|elephant|giraffe|zebra|hippo|rhino|rhinoceros|panda|koala|squirrel|raccoon|beaver|mouse|rat|hamster)\b/.test(speciesLower);
    const isBird = /\b(owl|eagle|parrot|penguin|duck|swan|chicken|hawk|robin|crow|flamingo|peacock|toucan|pigeon)\b/.test(speciesLower);
    if (isQuadruped) {
      prompt += ' Correct animal anatomy: FOUR legs (two front legs, two back legs), all legs clearly visible, proper animal body proportions.';
    } else if (isBird) {
      prompt += ' Correct bird anatomy: TWO wings, TWO feet/talons, feathered body, beak, proper bird proportions.';
    } else {
      prompt += ' Correct anatomy for this species.';
    }
    prompt += ' EXTREME WIDE SHOT composition — character is TINY, only 15-20% of image height, full body visible.';
    prompt += ' The environment fills 80%+ of the image.';
  }

  // No-text guard (ALL modes)
  prompt += ' ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO writing, NO signs with text anywhere in the image.';

  // ── 8. Style ──
  const isOlderKids = options?.ageGroup === '9-12';

  if (isHistoryMode && isOlderKids) {
    prompt += " Graphic novel illustration, bold ink outlines, dramatic shading, cinematic lighting, rich warm color palette, detailed historical environment, dynamic composition.";
  } else if (isHistoryMode) {
    prompt += " Children's book illustration, 2D cartoon style, bold outlines, flat warm colors, educational tone.";
  } else if (isOlderKids) {
    prompt += " Graphic novel illustration, bold ink outlines, dramatic shading and shadows, cinematic lighting, rich saturated colors, dynamic action poses, detailed environments, comic book energy.";
  } else {
    prompt += " Children's book illustration, 2D cartoon style, bold outlines, flat bright colors.";
  }

  // ── 9. FINAL CONSISTENCY LOCK (last thing Flux reads — highest attention) ──
  // Flux pays strongest attention to the END of the prompt. By placing skin tone
  // at both the START and END, we bracket the entire prompt with the correct color.
  // This also includes the explicit consistency requirement from the user's rules.
  if (isHumanChar && identity.skinTone) {
    const skinLower = identity.skinTone.toLowerCase();
    if (skinLower.includes('dark brown') || skinLower.includes('deep brown')) {
      prompt += ` Exact consistency requirement: the ${genderLabel} must keep ${identity.skinTone}. NOT white, NOT pale, NOT light skin. Do not lighten skin due to lighting, mood, or scene.`;
    } else if (skinLower.includes('brown') || skinLower.includes('caramel')) {
      prompt += ` Exact consistency requirement: the ${genderLabel} must keep ${identity.skinTone}. NOT white, NOT pale. Do not lighten skin due to lighting, mood, or scene.`;
    } else {
      prompt += ` Exact consistency requirement: the ${genderLabel} must keep ${identity.skinTone}. Do not change skin tone due to lighting, mood, or scene.`;
    }
  }

  // ── Post-processing: safety sanitization ──

  // Strip any conflicting skin descriptors that crept in from scene cards or lighting
  if (isHumanChar && identity.skinTone) {
    prompt = stripConflictingSkinDescriptors(prompt, identity.skinTone);
  }

  // SKIP fear/violence word replacements for history mode — historical events need accurate language
  if (!isHistoryMode) {
    prompt = sanitizeForKidsLocal(prompt);
  }
  // Religious figure filtering applies to ALL modes
  prompt = filterReligiousFigures(prompt);

  // Content safety validation — pass storyMode so history terms don't get falsely flagged
  const contentCheck = validateContent(prompt, options?.storyMode);
  if (!contentCheck.safe) {
    console.warn(`[buildImagePrompt] Page ${pageIndex + 1} BLOCKED: "${contentCheck.matchedTerm}" — using safe fallback`);
    prompt = buildSafeFallback(identity, pageIndex);
  }

  // Final sanitize via shared utility — pass storyMode for history mode awareness
  const { cleaned } = sanitizeText(prompt, options?.storyMode);
  prompt = cleaned;

  // Clean up whitespace
  prompt = prompt.replace(/\s+/g, ' ').trim();

  console.log(`[buildImagePrompt] Page ${pageIndex + 1} (${prompt.length} chars): "${prompt.substring(0, 200)}..."`);

  return prompt;
}

// ─── Safe fallback ──────────────────────────────────────────────────────────

function buildSafeFallback(identity: CharacterIdentity, pageIndex: number): string {
  const isHumanChar = identity.genderHint !== '';
  if (isHumanChar) {
    const genderWord = identity.genderHint || 'girl';
    return `Text-free children's book illustration, EXTREME WIDE SHOT. A small cute cartoon young ${genderWord}, ${identity.age || '6 years old'}, ${identity.skinTone || ''}, ${identity.hair || ''}, wearing ${identity.outfit || 'colorful clothes'}, is standing happily in a bright colorful park with swings, a sandbox, tall trees with golden leaves, a winding stone path, and a bright blue sky with fluffy clouds. The character is TINY in the frame, about one-quarter of the image height. The park environment dominates the image. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes.`;
  } else {
    const outfitPart = identity.outfit ? `, wearing ${identity.outfit}` : '';
    return `Text-free children's book illustration, EXTREME WIDE SHOT. A small cute cartoon ${identity.species}${outfitPart} is standing happily in a bright colorful meadow with wildflowers, a winding stream, butterflies, ladybugs on tall grass, and distant mountains under a bright sky with wispy clouds. The character is TINY in the frame, about one-quarter of the image height. The meadow environment dominates the image. Children's book illustration, 2D cartoon style, bold black outlines, flat bright colors, simple rounded shapes.`;
  }
}
