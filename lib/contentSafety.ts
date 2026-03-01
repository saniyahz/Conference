/**
 * Content Safety Module — Centralized child safety guardrails.
 *
 * Single source of truth for all content filtering, validation, and moderation.
 * Every API route imports from this module.
 *
 * Architecture:
 *   - HARD BLOCK: Content that is always rejected (violence, sexual, slurs, etc.)
 *   - SOFT HANDLE: Sensitive topics gently replaced (death → "watching from the stars")
 *   - OpenAI Moderation API: Catches semantic violations that keywords miss
 *   - Prompt Injection Detection: Blocks attempts to override system instructions
 */

import OpenAI from 'openai';

// ─── TYPES ───────────────────────────────────────────────────────────────

export interface ContentValidationResult {
  safe: boolean;
  category?: string;
  matchedTerm?: string;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export interface SanitizeResult {
  cleaned: string;
  modifications: string[];
}

// ─── HARD-BLOCKED TERMS ──────────────────────────────────────────────────
// Content that is ALWAYS rejected — no exceptions, no workarounds.
// Uses word-boundary matching to avoid false positives (e.g., "class" in "classification").

const BLOCKED_SEXUAL = new Set([
  'sex', 'sexual', 'sexy', 'nude', 'nudity', 'naked', 'porn', 'pornography',
  'xxx', 'erotic', 'nsfw', 'orgasm', 'intercourse', 'genitals', 'genital',
  'penis', 'vagina', 'boobs', 'buttocks',
  'fetish', 'bondage', 'bdsm', 'stripper', 'prostitute', 'prostitution',
  'hooker', 'brothel', 'hentai', 'lewd', 'masturbate',
  'masturbation', 'molest', 'molestation', 'grope', 'groping', 'rape', 'rapist',
  'pedophile', 'pedophilia', 'incest', 'voyeur', 'exhibitionist', 'aroused',
  'arousal', 'seduce', 'seduction', 'fornicate', 'fornication', 'orgy',
  'threesome', 'semen', 'sperm', 'condom', 'dildo', 'vibrator', 'lingerie',
  'thong', 'topless', 'bottomless',
  // Removed: 'strip' (strip of paper), 'escort' (escort to door), 'explicit' (explicit instructions),
  //          'breast/breasts' (chicken breast in food), 'butt' (butt of the joke), 'bikini' (swimwear)
  // These have innocent meanings. OpenAI Moderation API catches sexual context semantically.
]);

const BLOCKED_VIOLENCE = new Set([
  'murder', 'murdered', 'murderer', 'homicide', 'assassin', 'assassination',
  'slaughter', 'massacre', 'genocide', 'torture', 'torment', 'mutilate',
  'mutilation', 'dismember', 'decapitate', 'behead', 'strangle', 'suffocate',
  'stab', 'stabbing', 'gunshot', 'bloodbath', 'bloodshed',
  'gore', 'gory', 'gruesome', 'carnage',
  'bombing', 'terrorist', 'terrorism', 'hostage', 'kidnap', 'kidnapping',
  'abduct', 'abduction',
  'grenade', 'rifle', 'pistol', 'shotgun', 'machete', 'dagger',
  'ammunition', 'ammo', 'explosive', 'dynamite',
  'arson', 'suicide', 'suicidal', 'self-harm', 'self harm',
  // Removed: 'shoot/shooting' (shoot the ball, shooting star), 'bomb' (photobomb, bombastic),
  //          'execute/execution' (execute the plan), 'assault' (assault course), 'batter' (pancake batter),
  //          'abuse' (overuse in tech), 'bullet/bullets' (bullet points), 'molest' (already in sexual)
  // These have innocent meanings. OpenAI Moderation API catches violent context semantically.
]);

const BLOCKED_PROFANITY = new Set([
  'fuck', 'fucking', 'fucker', 'fucked', 'shit', 'shitty', 'bullshit',
  'asshole', 'bitch', 'bitchy', 'bastard',
  'piss', 'pissed', 'dickhead', 'cunt',
  'whore', 'slut', 'douche', 'douchebag', 'motherfucker', 'wtf',
  'stfu', 'jackass', 'dipshit', 'screw you', 'suck my',
  // Removed: 'ass' (donkey, pass, class), 'damn' (dam, common exclamation),
  //          'crap' (mild), 'dick' (name Dick/Moby Dick), 'cock' (rooster/peacock),
  //          'dammit' (mild exclamation), 'lmao' (texting)
  // These have innocent meanings or are too mild. OpenAI Moderation API catches profanity semantically.
]);

const BLOCKED_SLURS = new Set([
  // Racial slurs (abbreviated to avoid reproducing — comprehensive list)
  'nigger', 'nigga', 'chink', 'spic', 'wetback', 'gook', 'kike',
  'beaner', 'cracker', 'honky', 'gringo', 'raghead', 'towelhead',
  'camel jockey', 'sand nigger', 'redskin', 'injun', 'squaw',
  'coon', 'darkie', 'jap', 'nip', 'zipperhead', 'wop', 'dago',
  'mick', 'polack', 'kraut',
  // Homophobic/transphobic slurs
  'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'homo',
  // Ableist slurs
  'retard', 'retarded', 'cripple', 'spaz', 'spastic',
  'mongoloid', 'idiot', 'moron', 'imbecile',
]);

const BLOCKED_SUBSTANCE = new Set([
  'cocaine', 'heroin', 'methamphetamine', 'meth', 'ecstasy',
  'mdma', 'lsd', 'marijuana', 'cannabis',
  'bong', 'intoxicated',
  'vodka', 'whiskey',
  'vaping', 'vape', 'nicotine', 'opioid', 'opiate', 'overdose',
  'syringe', 'cartel',
  // Removed: 'high' (high in the sky!), 'crack' (crack in the wall), 'acid' (acid rain),
  //          'mushrooms' (forest mushrooms), 'weed' (garden weed), 'joint' (joint adventure),
  //          'blunt' (blunt pencil), 'stoned' (stoned path), 'drunk' (mild), 'alcohol' (hand sanitizer),
  //          'beer/wine/cocktail' (mild beverages), 'cigarette/smoking' (smoking chimney),
  //          'inject/needle' (sewing needle), 'dealer' (card dealer)
  // These have common innocent meanings in children's stories. OpenAI Moderation API catches drug context.
]);

const BLOCKED_RELIGIOUS = new Set([
  // Deity names / religious figures in worship context
  'allah', 'jesus christ', 'messiah', 'prophet muhammad',
  // Religious practices/concepts
  'worship', 'worshipping', 'scripture', 'sermon',
  'preach', 'preaching', 'baptism', 'baptize', 'communion',
  'salvation', 'damnation', 'sinful', 'sinner', 'blasphemy',
  'heresy', 'heretic', 'jihad', 'missionary',
  'crucifixion', 'rapture',
  'holy war', 'psalm', 'commandment',
  // Religious texts
  'quran', 'koran', 'torah', 'talmud',
  // Removed: 'buddha/shiva/vishnu/brahma/krishna/ganesh' (cultural names are OK in diverse stories),
  //          'prayer/praying' (characters can pray/wish), 'sin' (single, since, sine),
  //          'confession' (confess feelings), 'convert/conversion' (convert units),
  //          'verse' (verse of a poem!), 'covenant' (mild), 'bible' (common metaphor),
  //          'gospel' (gospel truth), 'church/mosque/synagogue' (buildings in town descriptions),
  //          'priest/imam/rabbi/monk/nun/pope' (characters can exist in stories),
  //          'crusade' (crusade for justice), 'apocalypse' (removed — too common),
  //          'resurrection' (butterfly resurrection metaphor)
  // The GPT system prompt already prevents religious proselytizing.
  // OpenAI Moderation API catches genuinely inappropriate religious content.
]);

// Words that are allowed even though they overlap with religious concepts
// (fantasy/cultural context is OK)
const RELIGIOUS_ALLOWLIST = new Set([
  'angel', 'fairy', 'magic', 'magical', 'wizard', 'witch', 'enchanted',
  'mythical', 'legend', 'legendary', 'miracle', 'spirit', 'spiritual',
  'soul', 'heaven', 'heavenly', 'blessing', 'blessed',
  'christmas', 'hanukkah', 'diwali', 'eid', 'easter',
  'temple', // allowed as generic building (e.g., "ancient temple")
]);

// ─── SENSITIVE TERMS (soft handle — replace, don't reject) ──────────────
// Death and loss handled gently with subtle metaphors.

const SENSITIVE_REPLACEMENTS = new Map<string, string>([
  ['died', 'went on a long journey to the stars'],
  ['dead', 'sleeping forever among the stars'],
  ['death', 'a long journey to the stars'],
  ['killed', 'taken away'],
  ['kill', 'stop'],
  ['killing', 'stopping'],
  ['funeral', 'farewell gathering'],
  ['grave', 'special garden'],
  ['graveyard', 'peaceful garden'],
  ['cemetery', 'peaceful garden'],
  ['coffin', 'special resting place'],
  ['corpse', 'sleeping figure'],
  ['ghost', 'friendly spirit'],
  ['blood', 'paint'],
  ['bloody', 'messy'],
  ['weapon', 'toy'],
  ['sword', 'magic wand'],
  ['gun', 'water squirter'],
  ['fight', 'disagree'],
  ['fighting', 'disagreeing'],
  ['war', 'big disagreement'],
  ['battle', 'challenge'],
  ['enemy', 'rival'],
  ['destroy', 'change'],
  ['destruction', 'big change'],
  ['evil', 'mischievous'],
  ['villain', 'trickster'],
  ['monster', 'silly creature'],
  ['scary', 'surprising'],
  ['horror', 'adventure'],
  ['nightmare', 'wild dream'],
  ['demon', 'imp'],
  ['devil', 'trickster'],
  ['hell', 'a tricky place'],
  ['zombie', 'sleepy creature'],
  ['vampire', 'batty friend'],
  ['skeleton', 'bony friend'],
  ['skull', 'round shape'],
  ['poison', 'yucky stuff'],
  ['toxic', 'yucky'],
  ['hate', 'strongly dislike'],
  ['hatred', 'strong dislike'],
  ['stupid', 'silly'],
  ['dumb', 'quiet'],
  ['ugly', 'unusual-looking'],
  ['fat', 'round'],
  ['skinny', 'thin'],
]);

// ─── ALL BLOCKED TERMS (combined for validation) ─────────────────────────

function getAllBlockedSets(): { set: Set<string>; category: string }[] {
  return [
    { set: BLOCKED_SEXUAL, category: 'sexual_content' },
    { set: BLOCKED_VIOLENCE, category: 'violence' },
    { set: BLOCKED_PROFANITY, category: 'profanity' },
    { set: BLOCKED_SLURS, category: 'discrimination' },
    { set: BLOCKED_SUBSTANCE, category: 'substance' },
    { set: BLOCKED_RELIGIOUS, category: 'religious' },
  ];
}

// ─── CORE FUNCTIONS ──────────────────────────────────────────────────────

/**
 * Validate content against all blocklists.
 * Returns { safe: true } if content passes, or { safe: false, category, matchedTerm }
 * if blocked content is found.
 *
 * Uses word-boundary matching to prevent false positives.
 */
export function validateContent(text: string): ContentValidationResult {
  if (!text) return { safe: true };

  const lower = text.toLowerCase();

  for (const { set, category } of getAllBlockedSets()) {
    for (const term of set) {
      // For multi-word terms, use includes
      if (term.includes(' ')) {
        if (lower.includes(term)) {
          // Check religious allowlist for context-sensitive terms
          if (category === 'religious' && RELIGIOUS_ALLOWLIST.has(term)) continue;
          console.warn(`[SAFETY] BLOCKED: "${term}" (category: ${category})`);
          return { safe: false, category, matchedTerm: term };
        }
      } else {
        // For single words, use word boundary regex
        const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
        if (regex.test(text)) {
          // Check religious allowlist
          if (category === 'religious' && RELIGIOUS_ALLOWLIST.has(term)) continue;
          console.warn(`[SAFETY] BLOCKED: "${term}" (category: ${category})`);
          return { safe: false, category, matchedTerm: term };
        }
      }
    }
  }

  return { safe: true };
}

/**
 * Sanitize text by replacing sensitive terms with gentle alternatives.
 * Does NOT reject — just softens language.
 */
export function sanitizeText(text: string): SanitizeResult {
  if (!text) return { cleaned: text, modifications: [] };

  let cleaned = text;
  const modifications: string[] = [];

  for (const [term, replacement] of SENSITIVE_REPLACEMENTS) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, replacement);
      modifications.push(`"${term}" → "${replacement}"`);
    }
  }

  if (modifications.length > 0) {
    console.log(`[SAFETY] Sanitized ${modifications.length} sensitive terms: ${modifications.join(', ')}`);
  }

  return { cleaned, modifications };
}

/**
 * Call OpenAI Moderation API for semantic content analysis.
 * Catches violations that keyword matching misses (e.g., euphemisms,
 * implicit references, context-dependent meaning).
 *
 * For a children's app, ANY moderation flag triggers rejection.
 */
export async function moderateWithOpenAI(text: string, openai: OpenAI): Promise<ModerationResult> {
  try {
    const moderation = await openai.moderations.create({
      input: text,
    });

    const result = moderation.results[0];
    if (result.flagged) {
      const flaggedCategories = Object.entries(result.categories)
        .filter(([_, flagged]) => flagged)
        .map(([category]) => category);

      console.warn(`[MODERATION] OpenAI flagged content — categories: ${flaggedCategories.join(', ')}`);
      return { flagged: true, categories: flaggedCategories };
    }

    return { flagged: false, categories: [] };
  } catch (error) {
    // If moderation API fails, log but don't block (fail open for availability)
    // The keyword blocklists and GPT's own safety still provide protection
    console.error('[MODERATION] OpenAI Moderation API error:', error);
    return { flagged: false, categories: [] };
  }
}

/**
 * Detect prompt injection attempts.
 * Returns true if the text appears to contain instructions trying to
 * override the system prompt or manipulate GPT behavior.
 */
export function detectPromptInjection(text: string): boolean {
  const lower = text.toLowerCase();

  const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions|rules|guidelines)/i,
    /ignore\s+everything/i,
    /you\s+are\s+now\s+/i,
    /new\s+instructions?\s*:/i,
    /system\s+prompt\s*:/i,
    /forget\s+(your|all|the)\s+(rules|instructions|guidelines)/i,
    /disregard\s+(all|the|your|previous)/i,
    /override\s+(safety|content|all)/i,
    /\bjailbreak\b/i,
    /\bDAN\s+mode\b/i,
    /\bdo\s+anything\s+now\b/i,
    /pretend\s+(you\s+are|to\s+be|you're)\s+/i,
    /act\s+as\s+if\s+/i,
    /roleplay\s+as\s+/i,
    /bypass\s+(the\s+)?(safety|filter|content|moderation)/i,
    /remove\s+(all\s+)?(restrictions|limits|filters|safety)/i,
    /no\s+(rules|restrictions|limits|filters)/i,
    /unfiltered\s+mode/i,
    /developer\s+mode/i,
    /admin\s+mode/i,
    /god\s+mode/i,
  ];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(`[SAFETY] PROMPT INJECTION detected: "${text.substring(0, 100)}..."`);
      return true;
    }
  }

  return false;
}

/**
 * Combined validation: blocklist check + prompt injection check.
 * Returns a user-friendly error message if content is unsafe, or null if safe.
 */
export function getContentError(text: string): string | null {
  // Check for prompt injection
  if (detectPromptInjection(text)) {
    return "This story idea contains content that isn't appropriate for a children's story app. Please try a different, kid-friendly idea!";
  }

  // Check blocklists
  const validation = validateContent(text);
  if (!validation.safe) {
    return "This story idea contains content that isn't appropriate for a children's story app. Please try a different, kid-friendly idea!";
  }

  return null;
}

/**
 * Get a flat set of ALL blocked terms for client-side use.
 * Returns all terms across all categories (for app/page.tsx).
 */
export function getAllBlockedTerms(): Set<string> {
  const all = new Set<string>();
  for (const { set } of getAllBlockedSets()) {
    for (const term of set) {
      all.add(term);
    }
  }
  return all;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
