import Replicate from "replicate";

/**
 * Candidate scoring with hard rejection gates + must-include enforcement.
 *
 * Gate order (early exit on reject):
 *   Gate 0: Human/astronaut/pilot/cockpit cues → -20
 *   Gate 1: Wrong animal without rhino          → -15
 *   Gate 2: No rhino/rhinoceros detected        → -10
 *   Gate 3: Must-include enforcement (optional)  → -20
 *   Pass:   Base score 6, with quality bonuses
 */

export interface CandidateResult {
  url: string;
  score: number;
  caption: string;
  reasons: string[];
}

export interface ScoreOptions {
  mustInclude?: string[];
  requireMustIncludeCount?: number;
}

const BLIP_VERSION =
  "2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746" as const;

const WRONG_ANIMALS = [
  "elephant", "cat", "dog", "bear", "lion", "tiger", "monkey",
  "rabbit", "horse", "cow", "giraffe", "zebra", "hippo",
  "hippopotamus", "camel", "sheep", "goat", "fox", "deer",
  "wolf", "pig", "dolphin", "whale", "bird", "parrot",
  "penguin", "frog", "turtle", "snake", "fish",
];

const HUMAN_TERMS = [
  "human", "boy", "girl", "man", "woman", "person", "people",
  "child", "kid", "baby", "astronaut", "pilot", "captain",
  "crew", "spacesuit", "space suit", "helmet visor",
];

const COCKPIT_TERMS = [
  "cockpit", "control panel", "dashboard", "joystick", "steering",
  "airplane cockpit", "spaceship cockpit", "fighter jet",
];

/** Must-include keyword expansions for fuzzy matching */
const EXPANSIONS: Record<string, string[]> = {
  "rocket ship": ["rocket", "spaceship"],
  "rhinoceros": ["rhino"],
  "water splash": ["splash", "spray"],
};

export const SCORE_THRESHOLD = 6;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(c: string, terms: string[]): boolean {
  return terms.some((t) => c.includes(t));
}

function countMustIncludes(
  c: string,
  mustInclude: string[]
): { hits: number; hitList: string[]; total: number } {
  const cleaned = mustInclude
    .map((m) =>
      norm(m)
        .replace(/\bexactly\b/g, "")
        .replace(/\b\d+\b/g, "")
        .trim()
    )
    .filter(Boolean);

  let hits = 0;
  const hitList: string[] = [];

  for (const item of cleaned) {
    const variants = [item, ...(EXPANSIONS[item] ?? [])].filter(Boolean);
    if (variants.some((v) => c.includes(v))) {
      hits++;
      hitList.push(item);
    }
  }

  return { hits, hitList, total: cleaned.length };
}

/**
 * Score a BLIP caption with hard rejection gates.
 *
 * Gate 0: Human/astronaut/pilot/cockpit → instant reject (-20)
 * Gate 1: Wrong animal without rhino → reject (-15)
 * Gate 2: No rhino detected → reject (-10)
 * Gate 3: Must-includes not met → reject (-20)
 * Pass: Base 6 + bonuses for cartoon/full-body/gray/horn
 */
export function scoreCaption(
  caption: string,
  opts?: ScoreOptions
): { score: number; reasons: string[] } {
  const c = norm(caption);
  const reasons: string[] = [];

  const hasRhino = /\brhino\b|\brhinoceros\b/.test(c);
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a));

  // ── GATE 0: Human/astronaut/pilot/cockpit = hard reject ──
  if (includesAny(c, HUMAN_TERMS) || includesAny(c, COCKPIT_TERMS)) {
    reasons.push("-20 HUMAN/COCKPIT CUE DETECTED");
    return { score: -20, reasons };
  }

  // ── GATE 1: Wrong animal without rhino = hard reject ──
  if (wrongAnimal && !hasRhino) {
    reasons.push(`-15 WRONG ANIMAL: "${wrongAnimal}" (no rhino detected)`);
    return { score: -15, reasons };
  }

  // ── GATE 2: Species must be detected ──
  if (!hasRhino) {
    reasons.push("-10 SPECIES NOT DETECTED (no rhino/rhinoceros)");
    return { score: -10, reasons };
  }

  // ── GATE 3: Must-include enforcement ──
  const must = opts?.mustInclude ?? [];
  const requireCount = opts?.requireMustIncludeCount ?? 0;

  if (must.length > 0 && requireCount > 0) {
    const { hits, total, hitList } = countMustIncludes(c, must);
    reasons.push(`mustInclude: ${hits}/${total} (${hitList.join(", ") || "none"})`);
    if (hits < requireCount) {
      reasons.push(`-20 MISSING MUST-INCLUDES (need ${requireCount}, got ${hits})`);
      return { score: -20, reasons };
    }
  }

  // ── Species confirmed — base score 6 ──
  let score = 6;
  reasons.push("+6 base: rhino/rhinoceros detected");

  // Quality bonuses
  if (/\bcartoon\b|\billustration\b|\banimated\b|\bdrawing\b/.test(c)) {
    score += 1;
    reasons.push("+1 cartoon/illustration");
  }
  if (/\bfull body\b|\bstanding\b|\bwhole body\b/.test(c)) {
    score += 2;
    reasons.push("+2 full body / standing");
  }
  if (/\bgr[ae]y\b/.test(c)) {
    score += 1;
    reasons.push("+1 gray/grey");
  }
  if (/\bhorn\b/.test(c)) {
    score += 1;
    reasons.push("+1 horn");
  }

  // Penalties (non-fatal — rhino is present but quality issues)
  if (/\btwo\b.*\brhino|\bmultiple\b.*\brhino|\bsecond\b.*\brhino/.test(c)) {
    score -= 4;
    reasons.push("-4 duplicate rhino");
  }
  if (/\btext\b|\bwatermark\b|\bsignature\b|\bwriting\b|\bletters\b/.test(c)) {
    score -= 2;
    reasons.push("-2 text/watermark");
  }
  if (wrongAnimal) {
    score -= 3;
    reasons.push(`-3 wrong animal "${wrongAnimal}" also present`);
  }

  // Must-include bonus (if checked and passed)
  if (must.length > 0 && requireCount > 0) {
    score += 1;
    reasons.push("+1 must-includes satisfied");
  }

  return { score, reasons };
}

/**
 * Get a BLIP caption for an image URL.
 */
export async function captionImage(
  replicate: Replicate,
  imageUrl: string
): Promise<string> {
  try {
    const output = await replicate.run(
      `salesforce/blip:${BLIP_VERSION}`,
      {
        input: {
          image: imageUrl,
          task: "image_captioning",
        },
      }
    );

    if (typeof output === "string") return output;
    if (Array.isArray(output) && output.length > 0) return String(output[0]);
    return String(output);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[BLIP] Caption failed: ${msg}`);
    return "";
  }
}

/**
 * Score a single candidate. Now accepts ScoreOptions so callers
 * can pass mustInclude items for enforcement.
 */
export async function scoreCandidate(
  replicate: Replicate,
  imageUrl: string,
  opts?: ScoreOptions
): Promise<CandidateResult> {
  const caption = await captionImage(replicate, imageUrl);
  const { score, reasons } = scoreCaption(caption, opts);

  console.log(
    `[Score] caption="${caption}" → score=${score} ` +
    `[${reasons.join(" | ")}]`
  );

  return { url: imageUrl, score, caption, reasons };
}

/**
 * Generate candidates with seed variation, score each, return best.
 * Supports mask escalation and must-include scoring.
 */
export async function generateAndSelectBest(
  generateFn: (seed: number, maskDataUrl: string) => Promise<string>,
  replicate: Replicate,
  baseSeed: number,
  initialMaskDataUrl: string,
  escalatedMaskDataUrl?: string,
  numCandidates: number = 3,
  pageIndex: number = 0,
  scoreOpts?: ScoreOptions
): Promise<CandidateResult> {
  const allCandidates: CandidateResult[] = [];

  // ── Round 1: initial mask ──
  console.log(`[Select ${pageIndex}] Round 1: initial mask (${numCandidates} candidates)`);
  for (let i = 0; i < numCandidates; i++) {
    const seed = baseSeed + i * 29;
    const url = await generateFn(seed, initialMaskDataUrl);
    if (!url) {
      console.warn(`[Select ${pageIndex}] Candidate ${i + 1} generation failed`);
      continue;
    }

    const result = await scoreCandidate(replicate, url, scoreOpts);
    allCandidates.push(result);

    if (result.score >= SCORE_THRESHOLD) {
      console.log(
        `[Select ${pageIndex}] ACCEPTED candidate ${i + 1} ` +
        `(score ${result.score} >= ${SCORE_THRESHOLD})`
      );
      return result;
    }
  }

  // ── Round 2: escalated (larger) mask ──
  if (escalatedMaskDataUrl) {
    console.log(`[Select ${pageIndex}] Round 2: ESCALATED mask (${numCandidates} candidates)`);
    for (let i = 0; i < numCandidates; i++) {
      const seed = baseSeed + (numCandidates + i) * 29;
      const url = await generateFn(seed, escalatedMaskDataUrl);
      if (!url) continue;

      const result = await scoreCandidate(replicate, url, scoreOpts);
      allCandidates.push(result);

      if (result.score >= SCORE_THRESHOLD) {
        console.log(
          `[Select ${pageIndex}] ACCEPTED escalated candidate ${i + 1} ` +
          `(score ${result.score} >= ${SCORE_THRESHOLD})`
        );
        return result;
      }
    }
  }

  // ── No candidate passed — return best of all ──
  if (allCandidates.length === 0) {
    return { url: "", score: -999, caption: "", reasons: ["all candidates failed"] };
  }

  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates[0];

  console.warn(
    `[Select ${pageIndex}] WARNING: No candidate met threshold ${SCORE_THRESHOLD}. ` +
    `Best score: ${best.score}. Caption: "${best.caption}". ` +
    `Returning best of ${allCandidates.length} candidates.`
  );

  return best;
}
