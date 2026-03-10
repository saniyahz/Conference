/**
 * Client-safe blocked terms list.
 *
 * This file is safe to import from 'use client' components — it has NO
 * server-only dependencies (no OpenAI, no Node.js APIs).
 *
 * The canonical blocklists live in contentSafety.ts (server-side).
 * This file re-exports a flat set for client-side instant validation.
 * Keep in sync with contentSafety.ts — both files define the same terms.
 *
 * Client-side validation is ADVISORY ONLY — the server enforces the real rules.
 * This just provides immediate user feedback.
 *
 * IMPORTANT: Only include terms that are UNAMBIGUOUSLY inappropriate.
 * Words with common innocent meanings (high, shoot, crack, mushrooms, etc.)
 * are deliberately excluded — the OpenAI Moderation API on the server handles
 * context-dependent meanings. False positives here block valid children's stories.
 */

// ─── HISTORY MODE ALLOWED TERMS ──────────────────────────────────────
// Terms from violence/religious categories that are OK in History Mode
// (parents explicitly opted in to real historical content).
const HISTORY_ALLOWED_TERMS = new Set([
  'bombing', 'hostage', 'kidnap', 'kidnapping',
  'allah', 'jesus christ', 'messiah', 'prophet muhammad',
  'scripture', 'sermon', 'preach', 'preaching',
  'baptism', 'baptize', 'communion', 'missionary',
  'crucifixion', 'psalm', 'commandment',
  'quran', 'koran', 'torah', 'talmud',
]);

// ─── ALL BLOCKED TERMS (flat set for client-side matching) ────────────
// Mirrors the categorized sets in contentSafety.ts.

const BLOCKED_TERMS: string[] = [
  // Sexual content
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

  // Violence
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

  // Profanity
  'fuck', 'fucking', 'fucker', 'fucked', 'shit', 'shitty', 'bullshit',
  'asshole', 'bitch', 'bitchy', 'bastard',
  'piss', 'pissed', 'dickhead', 'cunt',
  'whore', 'slut', 'douche', 'douchebag', 'motherfucker', 'wtf',
  'stfu', 'jackass', 'dipshit', 'screw you', 'suck my',

  // Slurs (racial, homophobic, ableist)
  'nigger', 'nigga', 'chink', 'spic', 'wetback', 'gook', 'kike',
  'beaner', 'cracker', 'honky', 'gringo', 'raghead', 'towelhead',
  'camel jockey', 'sand nigger', 'redskin', 'injun', 'squaw',
  'coon', 'darkie', 'jap', 'nip', 'zipperhead', 'wop', 'dago',
  'mick', 'polack', 'kraut',
  'faggot', 'fag', 'dyke', 'tranny', 'shemale', 'homo',
  'retard', 'retarded', 'cripple', 'spaz', 'spastic',
  'mongoloid',

  // Substance (only unambiguous drug terms)
  'cocaine', 'heroin', 'methamphetamine', 'meth', 'ecstasy',
  'mdma', 'lsd', 'marijuana', 'cannabis',
  'bong', 'intoxicated',
  'vodka', 'whiskey',
  'vaping', 'vape', 'nicotine', 'opioid', 'opiate', 'overdose',
  'syringe', 'cartel',

  // Religious (only proselytizing/doctrine — cultural references are fine)
  'allah', 'jesus christ', 'messiah', 'prophet muhammad',
  'worship', 'worshipping', 'scripture', 'sermon',
  'preach', 'preaching', 'baptism', 'baptize', 'communion',
  'salvation', 'damnation', 'sinful', 'sinner', 'blasphemy',
  'heresy', 'heretic', 'jihad', 'missionary',
  'crucifixion', 'rapture',
  'holy war', 'psalm', 'commandment',
  'quran', 'koran', 'torah', 'talmud',
];

/**
 * Check if text contains any blocked terms.
 * Uses word-boundary matching to avoid false positives.
 * Returns the matched term if found, or null if clean.
 */
export function clientValidateContent(text: string, storyMode: string = 'imagination'): string | null {
  if (!text) return null;

  const isHistoryMode = storyMode === 'history';
  const lower = text.toLowerCase();

  for (const term of BLOCKED_TERMS) {
    // In history mode, skip terms on the allowlist
    if (isHistoryMode && HISTORY_ALLOWED_TERMS.has(term)) continue;

    if (term.includes(' ')) {
      // Multi-word terms: simple includes check
      if (lower.includes(term)) return term;
    } else {
      // Single words: word-boundary regex to avoid false positives
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) return term;
    }
  }

  return null;
}
