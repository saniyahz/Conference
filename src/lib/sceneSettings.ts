/**
 * Scene-setting resolver for the Riri story pipeline.
 *
 * KEY FIX: The page text is the source of truth. If the story text
 * mentions specific environment words (forest, waterfall, stream, etc.)
 * those MUST be reflected in the setting — never overridden by a
 * generic scene-card fallback like "golden savannah".
 */

interface SceneSetting {
  setting: string;
  settingContext: string;
  mustInclude: string[];
}

/** Keyword → canonical setting mapping (order matters: first match wins) */
const SCENE_RULES: Array<{
  keywords: RegExp;
  setting: string;
  settingContext: string;
  extraMustInclude: string[];
}> = [
  {
    keywords: /forest|trees|woodland|grove|jungle/i,
    setting: "lush forest with streams and waterfall",
    settingContext: "dense green forest, tall trees, dappled sunlight, ferns and moss",
    extraMustInclude: ["trees", "forest"],
  },
  {
    keywords: /waterfall|cascade|falls/i,
    setting: "lush forest with streams and waterfall",
    settingContext: "majestic waterfall, mist, rocks, flowing water, lush vegetation",
    extraMustInclude: ["waterfall"],
  },
  {
    keywords: /stream|creek|brook|river/i,
    setting: "forest clearing with a gentle stream",
    settingContext: "clear stream, smooth stones, gentle current, grassy banks",
    extraMustInclude: ["stream"],
  },
  {
    keywords: /ocean|sea|beach|shore|coast/i,
    setting: "tropical beach by the ocean",
    settingContext: "sandy beach, gentle waves, palm trees, blue sky",
    extraMustInclude: ["ocean", "beach"],
  },
  {
    keywords: /mountain|hill|peak|cliff/i,
    setting: "mountain landscape with rolling hills",
    settingContext: "mountain vista, green hills, blue sky, wildflowers",
    extraMustInclude: ["mountains"],
  },
  {
    keywords: /savannah|grassland|plain|prairie/i,
    setting: "golden African savannah",
    settingContext: "wide golden grassland, acacia trees, warm sunset light",
    extraMustInclude: ["savannah"],
  },
  {
    keywords: /village|town|house|home|hut/i,
    setting: "cozy village with friendly houses",
    settingContext: "small village, colorful houses, warm atmosphere, cobblestone paths",
    extraMustInclude: ["village"],
  },
  {
    keywords: /garden|flower|bloom|meadow/i,
    setting: "colorful flower garden",
    settingContext: "vibrant flower garden, butterflies, warm sunlight, lush greenery",
    extraMustInclude: ["flowers", "garden"],
  },
  {
    keywords: /night|star|moon|dark sky/i,
    setting: "starlit night landscape",
    settingContext: "night sky, stars, moonlight, peaceful darkness, silhouettes",
    extraMustInclude: ["night sky"],
  },
  {
    keywords: /rain|storm|thunder|cloud/i,
    setting: "rainy landscape",
    settingContext: "rain, puddles, overcast sky, glistening surfaces",
    extraMustInclude: ["rain"],
  },
];

const DEFAULT_SETTING: SceneSetting = {
  setting: "colorful storybook landscape",
  settingContext: "bright colors, friendly atmosphere, children's book illustration style",
  mustInclude: [],
};

/**
 * Resolve scene setting from page text. Text-derived keywords always win
 * over any fallback scene card.
 *
 * @param pageText  - The actual story text for this page
 * @param baseMustInclude - Items that must always be included (e.g. ["rhinoceros", "Riri"])
 * @param sceneCardFallback - Optional fallback from a scene-card system;
 *                            ONLY used if the page text doesn't match any rule.
 */
export function resolveSceneSetting(
  pageText: string,
  baseMustInclude: string[] = [],
  sceneCardFallback?: string
): SceneSetting {
  // Check page text against each rule
  for (const rule of SCENE_RULES) {
    if (rule.keywords.test(pageText)) {
      return {
        setting: rule.setting,
        settingContext: rule.settingContext,
        mustInclude: [...baseMustInclude, ...rule.extraMustInclude],
      };
    }
  }

  // No keyword match — use scene card fallback if provided
  if (sceneCardFallback) {
    // Even with a fallback, run it through the rules in case the fallback
    // itself contains relevant keywords
    for (const rule of SCENE_RULES) {
      if (rule.keywords.test(sceneCardFallback)) {
        return {
          setting: rule.setting,
          settingContext: rule.settingContext,
          mustInclude: [...baseMustInclude, ...rule.extraMustInclude],
        };
      }
    }

    return {
      setting: sceneCardFallback,
      settingContext: sceneCardFallback,
      mustInclude: [...baseMustInclude],
    };
  }

  // No match at all — use a safe default
  return {
    ...DEFAULT_SETTING,
    mustInclude: [...baseMustInclude, ...DEFAULT_SETTING.mustInclude],
  };
}

/**
 * Validate that mustInclude items haven't been removed by any
 * downstream "noun gate" or filtering step. If any required item
 * is missing, restore it.
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
