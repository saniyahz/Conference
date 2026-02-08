/**
 * Scene-setting resolver for the Riri story pipeline.
 *
 * TAXONOMY-CLAMPED: Instead of free-form extraction (which produces mashup
 * settings like "forest with winding streams and waterfall near ocean"),
 * each page is classified into one of a small set of scene types.
 * Each type has a short, clean setting string for use in prompts.
 *
 * This prevents hallucinations caused by overly complex/conflicting settings.
 *
 * The taxonomy is ordered most-specific-first. Compound scenes
 * (forest_waterfall) are checked before generic (forest_clearing).
 * First match wins.
 */

export interface SceneSetting {
  /** Short, clean setting string — from taxonomy, not free-form */
  setting: string;
  /** Taxonomy key (e.g., "forest_waterfall", "space") */
  category: string;
  /** Style hints for plate generation */
  styleHints: string;
  /** Items that must always be present in prompts */
  mustInclude: string[];
}

interface TaxonomyEntry {
  key: string;
  test: (text: string) => boolean;
  setting: string;
  styleHints: string;
  extraMustInclude: string[];
}

/**
 * Scene taxonomy — ordered most-specific first.
 * First match wins. Compound entries before generic.
 */
const SCENE_TAXONOMY: TaxonomyEntry[] = [
  // ── Compound entries (two environment keywords required) ──
  {
    key: "forest_waterfall",
    test: (t) => /forest|tree|woodland|jungle/i.test(t) && /waterfall|cascade|falls/i.test(t),
    setting: "lush forest with a waterfall",
    styleHints: "lush greens, flowing water, mist, dappled sunlight",
    extraMustInclude: ["trees", "waterfall"],
  },
  {
    key: "forest_stream",
    test: (t) => /forest|tree|woodland/i.test(t) && /stream|creek|brook|river/i.test(t),
    setting: "forest path along a gentle stream",
    styleHints: "lush greens, clear water, smooth stones, dappled sunlight",
    extraMustInclude: ["trees", "stream"],
  },
  {
    key: "mountain_meadow",
    test: (t) => /mountain|hill|peak/i.test(t) && /meadow|field|flower|wildflower/i.test(t),
    setting: "mountain meadow with wildflowers",
    styleHints: "elevated terrain, colorful flowers, open sky",
    extraMustInclude: ["mountains", "flowers"],
  },
  {
    key: "mountain_night",
    test: (t) => /mountain|hill|peak/i.test(t) && /night|star|starlit|starry/i.test(t),
    setting: "mountain meadow under a starlit sky",
    styleHints: "night sky, stars, moonlight, mountain silhouette",
    extraMustInclude: ["mountains", "night sky"],
  },
  {
    key: "ocean_cave",
    test: (t) => /ocean|sea|wave|shore/i.test(t) && /cave|cavern|grotto/i.test(t),
    setting: "sea cave behind crashing waves",
    styleHints: "rocky walls, blue water, ocean light",
    extraMustInclude: ["cave", "ocean"],
  },

  // ── Specific entries (single strong keyword match) ──
  {
    key: "rocket_exterior",
    test: (t) => /inside.*(?:rocket|ship|capsule)|(?:rocket|ship|capsule).*inside|cockpit|cabin.*(?:rocket|space)/i.test(t),
    setting: "colorful rocket ship on a bright green meadow under blue sky",
    styleHints: "bright blue sky, white fluffy clouds, green grass, colorful rocket ship",
    extraMustInclude: ["rocket"],
  },
  {
    key: "sky_launch",
    test: (t) => /launch|takeoff|take.?off|liftoff|lift.?off|blast.?off/i.test(t),
    setting: "rocket launching into the sky",
    styleHints: "blue sky, white clouds, rocket trail",
    extraMustInclude: ["rocket", "sky"],
  },
  {
    key: "moon_surface",
    test: (t) => /\bmoon\b|lunar|crater/i.test(t) && !/night|starlit|starry/i.test(t),
    setting: "moon surface with craters and Earth in the sky",
    styleHints: "gray terrain, craters, starry sky, Earth visible",
    extraMustInclude: ["moon"],
  },
  {
    key: "space",
    test: (t) => /\bspace\b|galaxy|nebula|asteroid|comet|\borbit\b|among.*star/i.test(t),
    setting: "colorful alien planet surface with stars and planets in the sky",
    styleHints: "bright colorful ground, starry sky above, colorful planets, vivid colors",
    extraMustInclude: ["stars"],
  },
  {
    key: "ocean_splashdown",
    test: (t) => /splash.*down|splashdown/i.test(t),
    setting: "ocean splashdown with big waves",
    styleHints: "waves, spray, blue water, dramatic moment",
    extraMustInclude: ["ocean"],
  },
  {
    key: "ocean",
    test: (t) => /ocean|sea|\bbeach\b|shore|coast|\bwave\b/i.test(t),
    setting: "ocean shore with gentle waves",
    styleHints: "waves, sand, blue water, horizon",
    extraMustInclude: ["ocean"],
  },
  {
    key: "waterfall",
    test: (t) => /waterfall|cascade|falls/i.test(t),
    setting: "cascading waterfall with mist",
    styleHints: "flowing water, mist, rocks, lush vegetation",
    extraMustInclude: ["waterfall"],
  },

  // ── Generic entries (broad keyword match) ──
  {
    key: "forest_clearing",
    test: (t) => /forest|tree|woodland|grove|jungle|clearing/i.test(t),
    setting: "sunlit forest clearing",
    styleHints: "lush greens, dappled sunlight, tall trees",
    extraMustInclude: ["trees"],
  },
  {
    key: "mountain",
    test: (t) => /mountain|hill|peak|cliff|summit/i.test(t),
    setting: "mountain landscape with distant peaks",
    styleHints: "elevated terrain, wide sky, distant peaks",
    extraMustInclude: ["mountains"],
  },
  {
    key: "cave",
    test: (t) => /cave|cavern|grotto|underground/i.test(t),
    setting: "inside a glowing cave",
    styleHints: "rocky walls, soft glow, stalactites",
    extraMustInclude: ["cave"],
  },
  {
    key: "night_sky",
    test: (t) => /\bnight\b|starlit|starry|dark.*sky/i.test(t),
    setting: "meadow under a starlit sky",
    styleHints: "night sky, stars, moonlight, soft glow",
    extraMustInclude: ["night sky"],
  },
  {
    key: "garden",
    test: (t) => /garden|flower|bloom|meadow|wildflower/i.test(t),
    setting: "colorful flower garden",
    styleHints: "flowers, butterflies, vibrant colors",
    extraMustInclude: ["flowers"],
  },
  {
    key: "village",
    test: (t) => /village|town|house|home|hut/i.test(t),
    setting: "friendly village with colorful houses",
    styleHints: "buildings, paths, warm atmosphere",
    extraMustInclude: ["village"],
  },
  {
    key: "savannah",
    test: (t) => /savannah|grassland|plain|prairie/i.test(t),
    setting: "golden savannah with tall grass",
    styleHints: "golden grass, warm light, wide horizon",
    extraMustInclude: ["savannah"],
  },
  {
    key: "stream",
    test: (t) => /stream|creek|brook|river/i.test(t),
    setting: "gentle stream with smooth stones",
    styleHints: "clear water, smooth stones, gentle current",
    extraMustInclude: ["stream"],
  },
  {
    key: "rain",
    test: (t) => /rain|storm|thunder|\bpour\b/i.test(t),
    setting: "rainy day with puddles",
    styleHints: "rain, overcast, puddles, glistening surfaces",
    extraMustInclude: ["rain"],
  },
  {
    key: "lake",
    test: (t) => /lake|pond/i.test(t),
    setting: "calm lake with reflections",
    styleHints: "still water, reflections, reeds, soft light",
    extraMustInclude: ["lake"],
  },
  {
    key: "desert",
    test: (t) => /desert|sand dune|oasis/i.test(t),
    setting: "sandy desert with distant dunes",
    styleHints: "golden sand, warm tones, wide sky",
    extraMustInclude: ["desert"],
  },
  {
    key: "snow",
    test: (t) => /snow|ice|frozen|winter|arctic/i.test(t),
    setting: "snowy landscape with soft white hills",
    styleHints: "white snow, soft blue shadows, crisp sky",
    extraMustInclude: ["snow"],
  },
];

/**
 * Classify page text against the taxonomy.
 * Returns the first matching entry (most specific first).
 */
export function classifyScene(text: string): TaxonomyEntry | null {
  for (const entry of SCENE_TAXONOMY) {
    if (entry.test(text)) return entry;
  }
  return null;
}

/**
 * Resolve scene setting from page text using taxonomy clamping.
 *
 * KEY RULES:
 *  1. Page text is matched against a fixed taxonomy of scene types.
 *  2. The taxonomy's short setting string is used in prompts — NOT
 *     the raw page text. This prevents mashup settings.
 *  3. The taxonomy is ordered most-specific-first; first match wins.
 *  4. Scene card fallback is used if page text matches nothing.
 *  5. mustInclude items are NEVER removed by downstream filtering.
 *
 * @param pageText - The actual story text for this page
 * @param baseMustInclude - Items that must always be included (e.g. ["rhinoceros", "Riri"])
 * @param sceneCardFallback - Optional fallback; only used if text matches nothing
 */
export function resolveSceneSetting(
  pageText: string,
  baseMustInclude: string[] = [],
  sceneCardFallback?: string
): SceneSetting {
  // Try to classify page text against taxonomy
  const match = classifyScene(pageText);

  if (match) {
    console.log(`[Scene] Classified as "${match.key}" → "${match.setting}"`);
    return {
      setting: match.setting,
      category: match.key,
      styleHints: match.styleHints,
      mustInclude: dedup([...baseMustInclude, ...match.extraMustInclude]),
    };
  }

  // Try scene card fallback
  if (sceneCardFallback) {
    const fallbackMatch = classifyScene(sceneCardFallback);
    if (fallbackMatch) {
      console.log(`[Scene] Fallback classified as "${fallbackMatch.key}" → "${fallbackMatch.setting}"`);
      return {
        setting: fallbackMatch.setting,
        category: fallbackMatch.key,
        styleHints: fallbackMatch.styleHints,
        mustInclude: dedup([...baseMustInclude, ...fallbackMatch.extraMustInclude]),
      };
    }

    // Fallback text didn't match taxonomy — use as-is but log a warning
    console.warn(`[Scene] No taxonomy match for fallback: "${sceneCardFallback}"`);
    return {
      setting: sceneCardFallback,
      category: "generic",
      styleHints: "bright colors, friendly atmosphere",
      mustInclude: [...baseMustInclude],
    };
  }

  // Nothing matched — safe default
  console.warn(`[Scene] No taxonomy match for: "${pageText.substring(0, 80)}..."`);
  return {
    setting: "colorful storybook landscape",
    category: "generic",
    styleHints: "bright colors, friendly atmosphere",
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
