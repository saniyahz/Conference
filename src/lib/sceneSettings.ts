/**
 * Scene-setting resolver for the Riri story pipeline.
 *
 * CRITICAL FIX: The page text IS the setting. We extract it verbatim.
 * We NEVER replace "lush forest with winding streams" with a canonical
 * category like "golden savannah". That was the root cause of scenes
 * not matching the story.
 *
 * Categories (forest/ocean/mountain) are used only for internal routing
 * (e.g., choosing color palettes or style hints). They never replace
 * the actual setting text.
 */

export interface SceneSetting {
  /** The actual setting text — preserved verbatim from page text */
  setting: string;
  /** Category tag for routing (forest/ocean/mountain/etc.) */
  category: string;
  /** Style hints derived from the category */
  styleHints: string;
  /** Items that must always be present in prompts and never noun-gated away */
  mustInclude: string[];
}

interface CategoryRule {
  keywords: RegExp;
  category: string;
  styleHints: string;
  extraMustInclude: string[];
}

/**
 * Category rules — used ONLY for tagging, never for replacing the setting.
 */
const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: /forest|trees|woodland|grove|jungle/i,
    category: "forest",
    styleHints: "lush greens, dappled sunlight, ferns, tall trees",
    extraMustInclude: ["trees"],
  },
  {
    keywords: /waterfall|cascade|falls/i,
    category: "waterfall",
    styleHints: "flowing water, mist, rocks, lush vegetation",
    extraMustInclude: ["waterfall"],
  },
  {
    keywords: /stream|creek|brook|river/i,
    category: "stream",
    styleHints: "clear water, smooth stones, gentle current",
    extraMustInclude: ["stream"],
  },
  {
    keywords: /ocean|sea|beach|shore|coast/i,
    category: "ocean",
    styleHints: "waves, sand, horizon, blue tones",
    extraMustInclude: ["ocean"],
  },
  {
    keywords: /mountain|hill|peak|cliff/i,
    category: "mountain",
    styleHints: "elevated terrain, sky, distant peaks",
    extraMustInclude: ["mountains"],
  },
  {
    keywords: /savannah|grassland|plain|prairie/i,
    category: "savannah",
    styleHints: "golden grass, warm light, wide horizon",
    extraMustInclude: ["savannah"],
  },
  {
    keywords: /village|town|house|home|hut/i,
    category: "village",
    styleHints: "buildings, paths, warm atmosphere",
    extraMustInclude: ["village"],
  },
  {
    keywords: /garden|flower|bloom|meadow/i,
    category: "garden",
    styleHints: "flowers, butterflies, vibrant colors",
    extraMustInclude: ["flowers"],
  },
  {
    keywords: /night|star|moon|dark sky/i,
    category: "night",
    styleHints: "night sky, stars, moonlight, silhouettes",
    extraMustInclude: ["night sky"],
  },
  {
    keywords: /rain|storm|thunder|cloud/i,
    category: "rain",
    styleHints: "rain, overcast, puddles, glistening surfaces",
    extraMustInclude: ["rain"],
  },
];

/**
 * Extract setting-relevant phrases from page text.
 *
 * Looks for common patterns like:
 *   "in a lush forest"
 *   "by the ocean"
 *   "through the winding streams"
 *   "near a cascading waterfall"
 *
 * If no clear pattern is found, uses the full text as context.
 */
function extractSettingFromText(pageText: string): string {
  // Try to extract setting phrases using common preposition patterns
  const settingPatterns = [
    /(?:in|through|across|near|by|beside|along|under|above|around|over)\s+(?:a |the |an )?([^,.!?]+(?:(?:,?\s*(?:and|with|near)\s+)[^,.!?]+)*)/gi,
  ];

  const matches: string[] = [];
  for (const pattern of settingPatterns) {
    let match;
    while ((match = pattern.exec(pageText)) !== null) {
      const phrase = match[0].trim();
      // Only keep if it sounds like a place/environment
      if (/forest|tree|water|stream|river|ocean|sea|beach|mountain|hill|garden|flower|village|savannah|grass|meadow|cave|sky|moon|star|rain|cloud|jungle|path|trail|clearing|rock|cliff|lake|pond|field|valley/i.test(phrase)) {
        matches.push(phrase);
      }
    }
  }

  if (matches.length > 0) {
    return matches.join(", ");
  }

  // Fallback: return the raw text (it's better than a wrong canonical)
  return pageText;
}

/**
 * Detect which category tags apply to the text.
 * Multiple categories can match (e.g., "forest with waterfall" → forest + waterfall).
 */
function detectCategories(text: string): CategoryRule[] {
  return CATEGORY_RULES.filter((rule) => rule.keywords.test(text));
}

/**
 * Resolve scene setting from page text.
 *
 * KEY RULES:
 *  1. The page text is the source of truth. The setting string comes from
 *     the text, not from a lookup table.
 *  2. Categories are tags only — for routing, not for replacement.
 *  3. Scene card fallback is used ONLY when page text has zero
 *     environment keywords. Even then, it's used as-is (not canonicalized).
 *  4. mustInclude items are NEVER removed by noun-gating.
 *
 * @param pageText - The actual story text for this page
 * @param baseMustInclude - Items that must always be included (e.g. ["rhinoceros", "Riri"])
 * @param sceneCardFallback - Optional fallback; only used if text has no setting at all
 */
export function resolveSceneSetting(
  pageText: string,
  baseMustInclude: string[] = [],
  sceneCardFallback?: string
): SceneSetting {
  const textCategories = detectCategories(pageText);

  // If the page text has recognizable environment content, use it directly
  if (textCategories.length > 0) {
    const setting = extractSettingFromText(pageText);
    const allMustInclude = [
      ...baseMustInclude,
      ...textCategories.flatMap((c) => c.extraMustInclude),
    ];
    const styleHints = textCategories.map((c) => c.styleHints).join(", ");
    const category = textCategories.map((c) => c.category).join("+");

    return {
      setting,
      category,
      styleHints,
      mustInclude: dedup(allMustInclude),
    };
  }

  // Page text has no environment keywords — try the scene card fallback
  if (sceneCardFallback) {
    const fallbackCategories = detectCategories(sceneCardFallback);
    const styleHints = fallbackCategories.length > 0
      ? fallbackCategories.map((c) => c.styleHints).join(", ")
      : "bright colors, friendly atmosphere";
    const category = fallbackCategories.length > 0
      ? fallbackCategories.map((c) => c.category).join("+")
      : "generic";

    return {
      // Use the fallback text AS-IS — never canonicalize
      setting: sceneCardFallback,
      category,
      styleHints,
      mustInclude: dedup([
        ...baseMustInclude,
        ...fallbackCategories.flatMap((c) => c.extraMustInclude),
      ]),
    };
  }

  // Nothing at all — use a safe default
  return {
    setting: "colorful storybook landscape",
    category: "generic",
    styleHints: "bright colors, friendly atmosphere, children's book illustration style",
    mustInclude: [...baseMustInclude],
  };
}

/**
 * Enforce that mustInclude items are never removed.
 * Call this after any downstream filtering/noun-gating step.
 */
export function enforceMustInclude(
  currentList: string[],
  required: string[]
): string[] {
  const lower = new Set(currentList.map((s) => s.toLowerCase()));
  const result = [...currentList];
  for (const item of required) {
    if (!lower.has(item.toLowerCase())) {
      result.push(item);
    }
  }
  return result;
}

function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const l = s.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}
