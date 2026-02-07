import Replicate from "replicate";

/**
 * Candidate scoring for auto-validation.
 *
 * After inpainting, we score each candidate to decide whether Riri
 * is actually present, full-body, and stylistically correct.
 *
 * Scoring uses BLIP captioning + keyword voting heuristics.
 * BLIP alone is noisy for stylized cartoon images — so the keyword
 * voting system provides a reliable safety net.
 */

export interface CandidateResult {
  url: string;
  score: number;
  caption: string;
  reasons: string[];
}

/**
 * BLIP model for captioning on Replicate.
 * salesforce/blip — generates text descriptions of images.
 */
const BLIP_VERSION =
  "2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746" as const;

/**
 * Score a candidate image using keyword voting.
 *
 * Point system (stricter than the old SCORE_THRESHOLD = 2):
 *   +3  caption contains "rhinoceros" or "rhino"
 *   +2  caption contains "horn"
 *   +1  caption contains "gray" or "grey"
 *   +1  caption contains "standing" or "full body"
 *   +1  caption contains "animal" or "creature"
 *   -5  caption contains "human" | "boy" | "girl" | "man" | "woman" | "person"
 *   -3  caption contains "two" + "rhino" (duplicate character)
 *   -2  caption contains "text" | "watermark" | "signature"
 *
 * Minimum acceptance threshold: 4 (raised from old value of 2)
 */
export const SCORE_THRESHOLD = 4;

export function scoreCaption(caption: string): { score: number; reasons: string[] } {
  const lower = caption.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // Positive signals
  if (/rhinoceros|rhino/.test(lower)) {
    score += 3;
    reasons.push("+3 rhino detected");
  }
  if (/\bhorn\b/.test(lower)) {
    score += 2;
    reasons.push("+2 horn detected");
  }
  if (/\bgr[ae]y\b/.test(lower)) {
    score += 1;
    reasons.push("+1 gray/grey color");
  }
  if (/standing|full body/.test(lower)) {
    score += 1;
    reasons.push("+1 standing/full body");
  }
  if (/\banimal\b|\bcreature\b/.test(lower)) {
    score += 1;
    reasons.push("+1 animal/creature");
  }

  // Negative signals (hard penalties)
  if (/\bhuman\b|\bboy\b|\bgirl\b|\bman\b|\bwoman\b|\bperson\b|\bchild\b|\bkid\b/.test(lower)) {
    score -= 5;
    reasons.push("-5 HUMAN DETECTED");
  }
  if (/\btwo\b.*\brhino|\bmultiple\b.*\brhino/.test(lower)) {
    score -= 3;
    reasons.push("-3 duplicate rhino");
  }
  if (/\btext\b|\bwatermark\b|\bsignature\b|\bwriting\b|\bletters\b/.test(lower)) {
    score -= 2;
    reasons.push("-2 text/watermark");
  }

  return { score, reasons };
}

/**
 * Get a BLIP caption for an image URL.
 * Uses Replicate's BLIP model for image captioning.
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
 * Score a single candidate: caption it + apply keyword voting.
 */
export async function scoreCandidate(
  replicate: Replicate,
  imageUrl: string
): Promise<CandidateResult> {
  const caption = await captionImage(replicate, imageUrl);
  const { score, reasons } = scoreCaption(caption);

  console.log(`[Score] url=${imageUrl} caption="${caption}" score=${score} (${reasons.join(", ")})`);

  return { url: imageUrl, score, caption, reasons };
}

/**
 * Generate multiple candidates, score them, return the best one
 * that meets the threshold. If none meet threshold, return the
 * highest-scoring one anyway (but log a warning).
 *
 * @param generateFn - Function that generates one candidate given a seed
 * @param replicate - Replicate client (for BLIP captioning)
 * @param baseSeed - Starting seed; candidates use baseSeed + offset
 * @param numCandidates - How many candidates to generate (default: 5)
 * @param pageIndex - For logging
 */
export async function generateAndSelectBest(
  generateFn: (seed: number) => Promise<string>,
  replicate: Replicate,
  baseSeed: number,
  numCandidates: number = 5,
  pageIndex: number = 0
): Promise<CandidateResult> {
  const candidates: CandidateResult[] = [];

  for (let i = 0; i < numCandidates; i++) {
    const seed = baseSeed + i * 7; // spread seeds
    const url = await generateFn(seed);

    if (!url) {
      console.warn(`[Select ${pageIndex}] Candidate ${i + 1} generation failed, skipping`);
      continue;
    }

    const result = await scoreCandidate(replicate, url);
    candidates.push(result);

    // Early exit if this candidate is clearly good
    if (result.score >= SCORE_THRESHOLD) {
      console.log(
        `[Select ${pageIndex}] Candidate ${i + 1} accepted early ` +
        `(score ${result.score} >= ${SCORE_THRESHOLD})`
      );
      return result;
    }
  }

  if (candidates.length === 0) {
    return { url: "", score: -999, caption: "", reasons: ["all candidates failed"] };
  }

  // Sort by score descending, return the best
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (best.score < SCORE_THRESHOLD) {
    console.warn(
      `[Select ${pageIndex}] WARNING: Best candidate score ${best.score} ` +
      `is below threshold ${SCORE_THRESHOLD}. Using it anyway. ` +
      `Caption: "${best.caption}"`
    );
  }

  return best;
}
