import Replicate from "replicate";
import { scoreClipSimilarity, scoreClipWithCachedAnchor, ClipResult } from "./clipScoring";
import { detectRhinoceros, DetectionResult, DetectorModel } from "./objectDetection";

/**
 * Candidate scoring with deterministic accept/reject gate.
 *
 * The accept gate is a single function with four hard rules.
 * A candidate is ACCEPTED if and only if ALL four pass:
 *
 *   Rule 1: No human/cockpit in BLIP caption
 *   Rule 2: No wrong animal UNLESS rhinoceros is confirmed
 *   Rule 3: Rhinoceros confirmed by at least ONE signal:
 *           - BLIP caption contains "rhino"/"rhinoceros"
 *           - GroundingDINO conf >= 0.5
 *           - CLIP similarity >= 0.80
 *   Rule 4: Character is not tiny/background:
 *           - If GroundingDINO active: best bbox >= 15% of frame
 *           - If GroundingDINO not active: BLIP must say "standing"/"full body"
 *             or CLIP similarity >= 0.70
 *
 * If ANY rule fails → REJECT. No rescue, no override, no ambiguity.
 *
 * Score is still computed for ranking among accepted candidates,
 * but the accept/reject decision is binary and separate.
 */

export interface CandidateResult {
  url: string;
  score: number;
  accepted: boolean;
  rejectReason: string;
  caption: string;
  reasons: string[];
  clipSimilarity?: number;
  detectionConfidence?: number;
  detectionBboxArea?: number;
}

export interface ScoreOptions {
  mustInclude?: string[];
  requireMustIncludeCount?: number;

  /** Riri anchor image URL for CLIP similarity comparison */
  anchorImageUrl?: string;

  /** Pre-cached CLIP anchor embedding (avoids redundant Replicate calls) */
  cachedAnchorEmbedding?: number[];

  /** Enable GroundingDINO/OWL-ViT rhinoceros detection. Default: false */
  enableDetection?: boolean;

  /** Preferred detector model. Default: "grounding-dino" */
  detectorModel?: DetectorModel;
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

/** Minimum bbox area (fraction of frame) to count as foreground character */
const MIN_BBOX_AREA = 0.15;

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

// ─── DETERMINISTIC ACCEPT GATE ──────────────────────────────────────────

/**
 * Deterministic accept/reject. Four rules, all must pass.
 *
 * Rule 1: No human/cockpit           → hard reject, never rescuable
 * Rule 2: No wrong animal            → unless rhinoceros confirmed by ANY signal
 * Rule 3: Rhinoceros must be present → confirmed by BLIP, DINO, or CLIP
 * Rule 4: Character must be visible  → not tiny/background
 *
 * Returns { accepted, rejectReason }.
 */
export function acceptCandidate(
  caption: string,
  clipResult: ClipResult | null,
  detectionResult: DetectionResult | null
): { accepted: boolean; rejectReason: string } {
  const c = norm(caption);

  // ── Derive confirmation signals ──
  const blipHasRhino = /\brhino\b|\brhinoceros\b/.test(c);
  const dinoHasRhino = !!(detectionResult?.detected && detectionResult.confidence >= 0.5);
  const clipConfirmsRiri = !!(clipResult && clipResult.similarity >= 0.80);
  const rhinoConfirmed = blipHasRhino || dinoHasRhino || clipConfirmsRiri;

  // ── RULE 1: No human/cockpit ──
  if (includesAny(c, HUMAN_TERMS) || includesAny(c, COCKPIT_TERMS)) {
    return { accepted: false, rejectReason: "RULE 1: HUMAN/COCKPIT detected in caption" };
  }

  // ── RULE 2: No wrong animal unless rhino confirmed ──
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a));
  if (wrongAnimal && !rhinoConfirmed) {
    return {
      accepted: false,
      rejectReason: `RULE 2: WRONG ANIMAL "${wrongAnimal}" — no signal confirmed rhinoceros`,
    };
  }

  // ── RULE 3: Rhinoceros must be confirmed by at least one signal ──
  if (!rhinoConfirmed) {
    const signals = [
      `BLIP=${blipHasRhino}`,
      `DINO=${detectionResult ? `conf=${detectionResult.confidence.toFixed(2)}` : "off"}`,
      `CLIP=${clipResult ? `sim=${clipResult.similarity.toFixed(3)}` : "off"}`,
    ].join(", ");
    return {
      accepted: false,
      rejectReason: `RULE 3: MISSING CHARACTER — no signal confirmed rhinoceros (${signals})`,
    };
  }

  // ── RULE 4: Character must not be tiny/background ──
  if (detectionResult?.detected) {
    // GroundingDINO is active — use bbox area as ground truth
    if (detectionResult.bestBboxArea < MIN_BBOX_AREA) {
      return {
        accepted: false,
        rejectReason: `RULE 4: TINY CHARACTER — bbox area ${(detectionResult.bestBboxArea * 100).toFixed(1)}% < ${MIN_BBOX_AREA * 100}% of frame`,
      };
    }
  } else {
    // GroundingDINO not active — use BLIP composition cues + CLIP as fallback
    const hasCompositionCue = /\bstanding\b|\bfull body\b|\bwhole body\b|\bcentered\b|\bforeground\b/.test(c);
    const clipIsStrong = !!(clipResult && clipResult.similarity >= 0.70);

    if (!hasCompositionCue && !clipIsStrong) {
      return {
        accepted: false,
        rejectReason: `RULE 4: CHARACTER SIZE UNVERIFIED — no "standing/full body" in caption and CLIP ${clipResult ? clipResult.similarity.toFixed(3) : "off"} < 0.70`,
      };
    }
  }

  return { accepted: true, rejectReason: "" };
}

// ─── SCORE (for ranking among accepted candidates) ──────────────────────

/**
 * Compute a ranking score from BLIP caption.
 * This is ONLY used to rank accepted candidates against each other.
 * The accept/reject decision is made by acceptCandidate() above.
 */
export function scoreCaption(
  caption: string,
  opts?: ScoreOptions
): { score: number; reasons: string[] } {
  const c = norm(caption);
  const reasons: string[] = [];

  const hasRhino = /\brhino\b|\brhinoceros\b/.test(c);

  if (!hasRhino) {
    reasons.push("0 base: rhino not in caption (may be confirmed by other signals)");
    return { score: 0, reasons };
  }

  // ── Species in caption — base score 6 ──
  let score = 6;
  reasons.push("+6 base: rhino/rhinoceros in caption");

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

  // Penalties
  if (/\btwo\b.*\brhino|\bmultiple\b.*\brhino|\bsecond\b.*\brhino/.test(c)) {
    score -= 4;
    reasons.push("-4 duplicate rhino");
  }
  if (/\btext\b|\bwatermark\b|\bsignature\b|\bwriting\b|\bletters\b/.test(c)) {
    score -= 2;
    reasons.push("-2 text/watermark");
  }
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a));
  if (wrongAnimal) {
    score -= 3;
    reasons.push(`-3 wrong animal "${wrongAnimal}" also present`);
  }

  // Must-include bonus
  const must = opts?.mustInclude ?? [];
  const requireCount = opts?.requireMustIncludeCount ?? 0;
  if (must.length > 0 && requireCount > 0) {
    const { hits, total, hitList } = countMustIncludes(c, must);
    reasons.push(`mustInclude: ${hits}/${total} (${hitList.join(", ") || "none"})`);
    if (hits >= requireCount) {
      score += 1;
      reasons.push("+1 must-includes satisfied");
    }
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

// ─── MAIN SCORING FUNCTION ──────────────────────────────────────────────

/**
 * Score a single candidate with deterministic accept/reject.
 *
 * Runs BLIP, CLIP, and detection in parallel.
 *
 * Flow:
 *   1. Run all signals in parallel
 *   2. acceptCandidate() — binary yes/no, four hard rules
 *   3. scoreCaption() — ranking score for ordering accepted candidates
 *   4. Add CLIP/detection bonuses to ranking score
 *
 * The `accepted` field is the ONLY thing that matters for the pipeline.
 * The `score` field is ONLY for choosing between multiple accepted candidates.
 */
export async function scoreCandidate(
  replicate: Replicate,
  imageUrl: string,
  opts?: ScoreOptions
): Promise<CandidateResult> {
  const hasClip = !!(opts?.anchorImageUrl || opts?.cachedAnchorEmbedding?.length);
  const hasDetection = opts?.enableDetection ?? false;

  // Run all signals in parallel
  const [caption, clipResult, detectionResult] = await Promise.all([
    captionImage(replicate, imageUrl),
    hasClip
      ? (opts?.cachedAnchorEmbedding?.length
          ? scoreClipWithCachedAnchor(replicate, imageUrl, opts.cachedAnchorEmbedding)
          : scoreClipSimilarity(replicate, imageUrl, opts!.anchorImageUrl!))
      : Promise.resolve(null as ClipResult | null),
    hasDetection
      ? detectRhinoceros(replicate, imageUrl, opts?.detectorModel)
      : Promise.resolve(null as DetectionResult | null),
  ]);

  // ── 1. Deterministic accept/reject ──
  const { accepted, rejectReason } = acceptCandidate(caption, clipResult, detectionResult);

  // ── 2. Compute ranking score ──
  let { score, reasons } = scoreCaption(caption, opts);

  // Add signal info to reasons regardless of accept/reject
  if (clipResult) {
    reasons.push(`CLIP: ${clipResult.similarity.toFixed(3)}`);
    if (accepted) score += clipResult.scoreContribution;
  }
  if (detectionResult) {
    reasons.push(`DINO: conf=${detectionResult.confidence.toFixed(2)} bbox=${(detectionResult.bestBboxArea * 100).toFixed(1)}%`);
    if (accepted) score += detectionResult.scoreContribution;
  }

  // If rejected, force score negative so rejected candidates always rank below accepted ones
  if (!accepted) {
    score = Math.min(score, -1);
    reasons.push(`REJECTED: ${rejectReason}`);
  }

  console.log(
    `[Score] ${accepted ? "ACCEPTED" : "REJECTED"}: ` +
    `caption="${caption}" score=${score} ` +
    `BLIP-rhino=${/\brhino|\brhinoceros/.test(norm(caption))} ` +
    `CLIP=${clipResult ? clipResult.similarity.toFixed(3) : "off"} ` +
    `DINO=${detectionResult ? `conf=${detectionResult.confidence.toFixed(2)},bbox=${(detectionResult.bestBboxArea * 100).toFixed(1)}%` : "off"}` +
    (rejectReason ? ` reason="${rejectReason}"` : "")
  );

  return {
    url: imageUrl,
    score,
    accepted,
    rejectReason,
    caption,
    reasons,
    clipSimilarity: clipResult?.similarity,
    detectionConfidence: detectionResult?.confidence,
    detectionBboxArea: detectionResult?.bestBboxArea,
  };
}

/**
 * Generate candidates with seed variation, score each, return best.
 *
 * Uses the deterministic `accepted` field — not the score threshold.
 * Score is only used to rank among accepted candidates.
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

    if (result.accepted) {
      console.log(
        `[Select ${pageIndex}] ACCEPTED candidate ${i + 1} (score ${result.score})`
      );
      return result;
    }

    console.log(
      `[Select ${pageIndex}] REJECTED candidate ${i + 1}: ${result.rejectReason}`
    );
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

      if (result.accepted) {
        console.log(
          `[Select ${pageIndex}] ACCEPTED escalated candidate ${i + 1} (score ${result.score})`
        );
        return result;
      }

      console.log(
        `[Select ${pageIndex}] REJECTED escalated candidate ${i + 1}: ${result.rejectReason}`
      );
    }
  }

  // ── No candidate accepted — return highest-scored rejected ──
  if (allCandidates.length === 0) {
    return {
      url: "", score: -999, accepted: false,
      rejectReason: "all candidates failed to generate",
      caption: "", reasons: ["all candidates failed"],
    };
  }

  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates[0];

  console.warn(
    `[Select ${pageIndex}] WARNING: No candidate accepted. ` +
    `Returning best rejected (score=${best.score}, reason="${best.rejectReason}"). ` +
    `${allCandidates.length} total candidates tried.`
  );

  return best;
}
