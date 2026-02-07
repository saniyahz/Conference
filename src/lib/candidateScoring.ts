import Replicate from "replicate";
import { scoreClipSimilarity, scoreClipWithCachedAnchor, ClipResult } from "./clipScoring";
import { detectRhinoceros, DetectionResult, DetectorModel } from "./objectDetection";

/**
 * Candidate scoring — kids-book strict, deterministic accept/reject.
 *
 * Accept gate: 5 hard rules, ALL must pass.
 *
 *   Rule 1:  No human/cockpit (expanded: astronaut/helmet/pilot/etc)
 *   Rule 1b: No busy/crowded scenes (crowd/many/group/herd/parade)
 *   Rule 2:  No wrong animal unless rhino confirmed by BLIP or DINO
 *            (CLIP alone cannot rescue — style similarity ≠ species)
 *   Rule 3:  Rhinoceros confirmed by at least one signal
 *   Rule 4:  Character not tiny/background (bbox >= 15% or composition cue)
 *   Rule 5:  Must-include enforcement (at least N items visible)
 *
 * Selection: run ALL candidates per round, pick BEST accepted (not first).
 * Rejected candidates are hard-clamped to -100 so they never beat accepts.
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

type AcceptOpts = {
  mustInclude?: string[];
  requireMustIncludeCount?: number;
};

const BLIP_VERSION =
  "2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746" as const;

const WRONG_ANIMALS = [
  "elephant", "cat", "dog", "bear", "lion", "tiger", "monkey",
  "rabbit", "horse", "cow", "giraffe", "zebra", "hippo",
  "hippopotamus", "camel", "sheep", "goat", "fox", "deer",
  "wolf", "pig", "dolphin", "whale", "bird", "parrot",
  "penguin", "frog", "turtle", "snake", "fish",
];

const HUMAN_PLUS_TERMS = [
  "human", "boy", "girl", "man", "woman", "person", "people",
  "child", "kid", "baby", "astronaut", "pilot", "captain",
  "crew", "spacesuit", "space suit", "helmet visor",
  "helmet", "cosmonaut",
];

const COCKPIT_TERMS = [
  "cockpit", "control panel", "dashboard", "joystick", "steering",
  "airplane cockpit", "spaceship cockpit", "fighter jet",
];

const BUSY_SCENE_TERMS = [
  "crowd", "crowded", "many", "lots", "several", "group", "pack",
  "herd", "dozens", "party", "parade", "procession",
];

/** Must-include keyword expansions for fuzzy matching */
const EXPANSIONS: Record<string, string[]> = {
  "rocket ship": ["rocket", "spaceship"],
  "rhinoceros": ["rhino"],
  "water splash": ["splash", "spray"],
};

/** Minimum bbox area (fraction of frame) to count as foreground character */
const MIN_BBOX_AREA = 0.15;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(c: string, terms: string[]): boolean {
  return terms.some((t) => c.includes(t));
}

/**
 * Normalize a must-include term for searching in captions.
 * Strips "exactly N", adjectives like "playful/friendly/cartoon/cute/colorful".
 */
function normMust(term: string): string {
  return norm(term)
    .replace(/^exactly\s+\d+\s+/, "")
    .replace(/\b(playful|friendly|cartoon|cute|colorful)\b/g, "")
    .trim();
}

/**
 * Count how many must-include items appear in the caption.
 * Basic plural tolerance: "dolphins" matches "dolphin".
 */
function countMustHits(
  captionNorm: string,
  mustInclude: string[]
): { hits: number; hitTerms: string[] } {
  let hits = 0;
  const hitTerms: string[] = [];

  for (const raw of mustInclude) {
    const t = normMust(raw);
    if (!t) continue;

    // Check expansions first
    const variants = [t, ...(EXPANSIONS[t] ?? [])];
    // Add plural-stripped variant
    const t2 = t.endsWith("s") ? t.slice(0, -1) : "";
    if (t2) variants.push(t2);

    if (variants.some((v) => v && captionNorm.includes(v))) {
      hits++;
      hitTerms.push(t);
    }
  }

  return { hits, hitTerms };
}

// ─── DETERMINISTIC ACCEPT GATE ──────────────────────────────────────────

/**
 * Deterministic accept/reject. Five rules, all must pass.
 *
 * Rule 1:  No human/cockpit (expanded list)
 * Rule 1b: No busy/crowded scenes (kids-book = simple)
 * Rule 2:  No wrong animal unless rhino confirmed by BLIP or DINO
 *          (CLIP alone cannot rescue — style similarity ≠ species ID)
 * Rule 3:  Rhinoceros confirmed by at least one signal
 * Rule 4:  Character not tiny/background
 * Rule 5:  Must-include enforcement (at least N items)
 */
export function acceptCandidate(
  caption: string,
  clipResult: ClipResult | null,
  detectionResult: DetectionResult | null,
  opts?: AcceptOpts
): { accepted: boolean; rejectReason: string } {
  const c = norm(caption);

  // ── Derive confirmation signals ──
  const blipHasRhino = /\brhino\b|\brhinoceros\b/.test(c);
  const dinoHasRhino = !!(detectionResult?.detected && detectionResult.confidence >= 0.5);
  const clipConfirmsRiri = !!(clipResult && clipResult.similarity >= 0.82);

  // IMPORTANT: CLIP alone is not enough if caption strongly says a wrong animal.
  // CLIP measures visual style similarity, not species identity.
  const rhinoConfirmedByVision = blipHasRhino || dinoHasRhino;
  const rhinoConfirmed = rhinoConfirmedByVision || clipConfirmsRiri;

  // ── RULE 1: No human/cockpit (expanded) ──
  if (includesAny(c, HUMAN_PLUS_TERMS) || includesAny(c, COCKPIT_TERMS)) {
    return { accepted: false, rejectReason: "RULE 1: HUMAN/COCKPIT detected" };
  }

  // ── RULE 1b: No busy/crowded scenes (kids-book = simple) ──
  if (includesAny(c, BUSY_SCENE_TERMS)) {
    return { accepted: false, rejectReason: "RULE 1b: BUSY/CROWDED scene detected" };
  }

  // ── RULE 2: Wrong animal gate (tightened) ──
  // If BLIP says wrong animal, CLIP alone cannot save it — need BLIP or DINO rhino.
  const wrongAnimal = WRONG_ANIMALS.find((a) => c.includes(a));
  if (wrongAnimal && !rhinoConfirmedByVision) {
    return {
      accepted: false,
      rejectReason: `RULE 2: WRONG ANIMAL "${wrongAnimal}" and no BLIP/DINO rhino confirmation`,
    };
  }

  // ── RULE 3: Rhinoceros confirmed by at least one signal ──
  if (!rhinoConfirmed) {
    const signals = [
      `BLIP=${blipHasRhino}`,
      `DINO=${detectionResult ? `conf=${detectionResult.confidence.toFixed(2)}` : "off"}`,
      `CLIP=${clipResult ? `sim=${clipResult.similarity.toFixed(3)}` : "off"}`,
    ].join(", ");
    return {
      accepted: false,
      rejectReason: `RULE 3: MISSING CHARACTER (no rhino confirmed: ${signals})`,
    };
  }

  // ── RULE 4: Character not tiny/background ──
  if (detectionResult?.detected) {
    if (detectionResult.bestBboxArea < MIN_BBOX_AREA) {
      return {
        accepted: false,
        rejectReason: `RULE 4: TINY CHARACTER — bbox ${(detectionResult.bestBboxArea * 100).toFixed(1)}% < ${(MIN_BBOX_AREA * 100)}%`,
      };
    }
  } else {
    // If no DINO, require strong CLIP OR strong composition terms
    const hasCompositionCue = /\bstanding\b|\bfull body\b|\bwhole body\b|\bcentered\b|\bforeground\b/.test(c);
    const clipIsStrong = !!(clipResult && clipResult.similarity >= 0.78);
    if (!hasCompositionCue && !clipIsStrong) {
      return {
        accepted: false,
        rejectReason: "RULE 4: SIZE UNVERIFIED (no DINO, weak composition + CLIP)",
      };
    }
  }

  // ── RULE 5: Must-include enforcement ──
  const mustInclude = opts?.mustInclude ?? [];
  const req = Math.max(0, opts?.requireMustIncludeCount ?? 0);

  if (req > 0 && mustInclude.length > 0) {
    const { hits, hitTerms } = countMustHits(c, mustInclude);
    if (hits < req) {
      return {
        accepted: false,
        rejectReason: `RULE 5: MUST-INCLUDE FAILED — ${hits}/${req} hit (${hitTerms.join(", ") || "none"})`,
      };
    }
  }

  return { accepted: true, rejectReason: "" };
}

// ─── SCORE (for ranking among accepted candidates) ──────────────────────

/**
 * Compute a ranking score from BLIP caption.
 * ONLY used to rank accepted candidates against each other.
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

  let score = 6;
  reasons.push("+6 base: rhino/rhinoceros in caption");

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
    const { hits, hitTerms } = countMustHits(c, must);
    reasons.push(`mustInclude: ${hits}/${must.length} (${hitTerms.join(", ") || "none"})`);
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
 * Flow:
 *   1. Run BLIP, CLIP, detection in parallel
 *   2. acceptCandidate() — binary yes/no, five hard rules
 *      (passes mustInclude/requireMustIncludeCount from opts)
 *   3. scoreCaption() — ranking among accepted candidates
 *   4. Rejected → hard-clamped to -100 (never beats any accept)
 */
export async function scoreCandidate(
  replicate: Replicate,
  imageUrl: string,
  opts?: ScoreOptions
): Promise<CandidateResult> {
  const hasClip = !!(opts?.anchorImageUrl || opts?.cachedAnchorEmbedding?.length);
  const hasDetection = opts?.enableDetection ?? false;

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

  // 1. Deterministic accept/reject WITH mustInclude
  const { accepted, rejectReason } = acceptCandidate(
    caption,
    clipResult,
    detectionResult,
    {
      mustInclude: opts?.mustInclude,
      requireMustIncludeCount: opts?.requireMustIncludeCount,
    }
  );

  // 2. Ranking score (only among accepted)
  let { score, reasons } = scoreCaption(caption, opts);

  if (clipResult) {
    reasons.push(`CLIP: ${clipResult.similarity.toFixed(3)}`);
    if (accepted) score += clipResult.scoreContribution;
  }
  if (detectionResult) {
    reasons.push(`DINO: conf=${detectionResult.confidence.toFixed(2)} bbox=${(detectionResult.bestBboxArea * 100).toFixed(1)}%`);
    if (accepted) score += detectionResult.scoreContribution;
  }

  // Hard-clamp rejected so rejects never beat accepts
  if (!accepted) {
    reasons.push(`REJECTED: ${rejectReason}`);
    score = -100;
  } else {
    reasons.push("ACCEPTED");
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

// ─── SELECTION: BEST ACCEPTED, NOT FIRST ACCEPTED ───────────────────────

/**
 * Generate all candidates per round, pick BEST accepted (not first).
 *
 * Why not "first accepted"?
 *   First-accepted locks in "technically accepted but ugly/weird" pages.
 *   Running all candidates and picking the highest-scored accepted
 *   gets consistently better results for kids-book quality.
 *
 * If none accepted after both rounds, returns least-bad rejected
 * (all rejected are clamped to -100, so failure is deterministic).
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
  const all: CandidateResult[] = [];

  async function runRound(maskDataUrl: string, seedBase: number, roundLabel: string) {
    console.log(`[Select ${pageIndex}] ${roundLabel} (${numCandidates} candidates)`);
    for (let i = 0; i < numCandidates; i++) {
      const seed = seedBase + i * 29;
      const url = await generateFn(seed, maskDataUrl);
      if (!url) {
        console.warn(`[Select ${pageIndex}] Candidate ${i + 1} generation failed`);
        continue;
      }

      const result = await scoreCandidate(replicate, url, scoreOpts);
      all.push(result);

      console.log(
        `[Select ${pageIndex}] Candidate ${i + 1}: ${result.accepted ? "ACCEPTED" : "REJECTED"} ` +
        `score=${result.score}${result.rejectReason ? ` reason="${result.rejectReason}"` : ""}`
      );
    }
  }

  // ── Round 1: initial mask ──
  await runRound(initialMaskDataUrl, baseSeed, "Round 1: initial mask");

  // Pick best accepted from round 1
  const accepted1 = all.filter((x) => x.accepted);
  if (accepted1.length > 0) {
    accepted1.sort((a, b) => b.score - a.score);
    console.log(
      `[Select ${pageIndex}] Best accepted from round 1: score=${accepted1[0].score} ` +
      `(${accepted1.length} accepted of ${all.length} total)`
    );
    return accepted1[0];
  }

  // ── Round 2: escalated (larger) mask ──
  if (escalatedMaskDataUrl) {
    await runRound(escalatedMaskDataUrl, baseSeed + numCandidates * 29, "Round 2: ESCALATED mask");

    const accepted2 = all.filter((x) => x.accepted);
    if (accepted2.length > 0) {
      accepted2.sort((a, b) => b.score - a.score);
      console.log(
        `[Select ${pageIndex}] Best accepted from round 2: score=${accepted2[0].score} ` +
        `(${accepted2.length} accepted of ${all.length} total)`
      );
      return accepted2[0];
    }
  }

  // ── None accepted — return least-bad rejected ──
  if (all.length === 0) {
    return {
      url: "", score: -999, accepted: false,
      rejectReason: "all candidates failed to generate",
      caption: "", reasons: ["all candidates failed"],
    };
  }

  all.sort((a, b) => b.score - a.score);
  const best = all[0];

  console.warn(
    `[Select ${pageIndex}] WARNING: No candidate accepted. ` +
    `Returning best rejected (score=${best.score}, reason="${best.rejectReason}"). ` +
    `${all.length} total candidates tried.`
  );

  return best;
}
