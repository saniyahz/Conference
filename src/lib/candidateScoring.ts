import Replicate from "replicate";

/**
 * Candidate scoring with hard rejection gates.
 *
 * The old scorer let elephants/cats/bears pass because it only
 * checked for positive rhino signals. Now scoring is gated:
 *
 *  Gate 1: Wrong animal detected → instant reject (-10)
 *  Gate 2: Species not detected  → reject (-5)
 *  Gate 3: Human detected        → reject (-5)
 *  Gate 4: Text/watermark        → penalty (-2)
 *  Pass:   Species confirmed     → base score 4, with quality bonuses
 */

export interface CandidateResult {
  url: string;
  score: number;
  caption: string;
  reasons: string[];
}

const BLIP_VERSION =
  "2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746" as const;

/** Animals that are NOT Riri. If BLIP sees one of these without also
 *  seeing "rhino"/"rhinoceros", it's a hard reject. */
const WRONG_ANIMALS = [
  "elephant", "cat", "dog", "bear", "lion", "tiger", "monkey",
  "rabbit", "horse", "cow", "giraffe", "zebra", "hippo",
  "hippopotamus", "camel", "sheep", "goat", "fox", "deer",
  "wolf", "pig", "dolphin", "whale", "bird", "parrot",
  "penguin", "frog", "turtle", "snake", "fish",
];

export const SCORE_THRESHOLD = 4;

/**
 * Score a BLIP caption with hard rejection gates.
 *
 * This is a gated scorer, not an additive point system.
 * Wrong animals are instantly rejected regardless of other signals.
 */
export function scoreCaption(caption: string): { score: number; reasons: string[] } {
  const c = caption.toLowerCase();
  const reasons: string[] = [];

  const hasRhino = /\brhino\b|\brhinoceros\b/.test(c);

  // ── GATE 1: Wrong animal without rhino = hard reject ──
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a));
  if (wrongAnimal && !hasRhino) {
    reasons.push(`-10 WRONG ANIMAL: "${wrongAnimal}" (no rhino detected)`);
    return { score: -10, reasons };
  }

  // ── GATE 2: Species must be detected ──
  if (!hasRhino) {
    reasons.push("-5 SPECIES NOT DETECTED (no rhino/rhinoceros in caption)");
    return { score: -5, reasons };
  }

  // ── GATE 3: Human presence = hard reject ──
  if (/\bhuman\b|\bboy\b|\bgirl\b|\bman\b|\bwoman\b|\bperson\b|\bchild\b|\bkid\b/.test(c)) {
    reasons.push("-5 HUMAN DETECTED");
    return { score: -5, reasons };
  }

  // ── Species confirmed — start at base score 4 ──
  let score = 4;
  reasons.push("+4 base: rhino/rhinoceros detected");

  // Quality bonuses
  if (/\bcartoon\b|\billustration\b|\banimated\b|\bdrawing\b/.test(c)) {
    score += 1;
    reasons.push("+1 cartoon/illustration style");
  }
  if (/\bfull\b|\bstanding\b|\bbody\b/.test(c)) {
    score += 1;
    reasons.push("+1 full body / standing");
  }
  if (/\bgr[ae]y\b/.test(c)) {
    score += 1;
    reasons.push("+1 gray/grey color match");
  }
  if (/\bhorn\b/.test(c)) {
    score += 1;
    reasons.push("+1 horn visible");
  }

  // Penalties (non-fatal)
  if (/\btwo\b.*\brhino|\bmultiple\b.*\brhino|\bsecond\b.*\brhino/.test(c)) {
    score -= 3;
    reasons.push("-3 duplicate rhino");
  }
  if (/\btext\b|\bwatermark\b|\bsignature\b|\bwriting\b|\bletters\b/.test(c)) {
    score -= 2;
    reasons.push("-2 text/watermark");
  }
  // Wrong animal present but rhino also present — penalize but don't reject
  if (wrongAnimal) {
    score -= 2;
    reasons.push(`-2 wrong animal "${wrongAnimal}" also present (rhino detected too)`);
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
 * Score a single candidate.
 */
export async function scoreCandidate(
  replicate: Replicate,
  imageUrl: string
): Promise<CandidateResult> {
  const caption = await captionImage(replicate, imageUrl);
  const { score, reasons } = scoreCaption(caption);

  console.log(
    `[Score] caption="${caption}" → score=${score} ` +
    `[${reasons.join(" | ")}]`
  );

  return { url: imageUrl, score, caption, reasons };
}

/**
 * Generate candidates with seed variation, score each, return best.
 *
 * Supports mask escalation: if the caller provides an escalateMaskFn,
 * it's called after the first batch fails to produce a passing candidate.
 * The escalated mask is larger, giving the model more room to paint Riri.
 *
 * @param generateFn - Generates one candidate. Receives (seed, maskDataUrl).
 * @param replicate - For BLIP captioning
 * @param baseSeed - Starting seed
 * @param initialMaskDataUrl - First mask to try
 * @param escalatedMaskDataUrl - Larger mask to try if initial fails (optional)
 * @param numCandidates - Candidates per mask size (default: 3)
 * @param pageIndex - For logging
 */
export async function generateAndSelectBest(
  generateFn: (seed: number, maskDataUrl: string) => Promise<string>,
  replicate: Replicate,
  baseSeed: number,
  initialMaskDataUrl: string,
  escalatedMaskDataUrl?: string,
  numCandidates: number = 3,
  pageIndex: number = 0
): Promise<CandidateResult> {
  const allCandidates: CandidateResult[] = [];

  // ── Round 1: initial mask ──
  console.log(`[Select ${pageIndex}] Round 1: initial mask (${numCandidates} candidates)`);
  for (let i = 0; i < numCandidates; i++) {
    const seed = baseSeed + i * 7;
    const url = await generateFn(seed, initialMaskDataUrl);
    if (!url) {
      console.warn(`[Select ${pageIndex}] Candidate ${i + 1} generation failed`);
      continue;
    }

    const result = await scoreCandidate(replicate, url);
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
      const seed = baseSeed + (numCandidates + i) * 7;
      const url = await generateFn(seed, escalatedMaskDataUrl);
      if (!url) continue;

      const result = await scoreCandidate(replicate, url);
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
