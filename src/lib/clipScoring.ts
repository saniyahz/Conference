import Replicate from "replicate";

/**
 * CLIP similarity scoring — compares a candidate image to a Riri anchor.
 *
 * Uses andreasjansson/clip-features on Replicate to extract CLIP embeddings,
 * then computes cosine similarity. High similarity to the anchor means
 * the candidate visually resembles the reference Riri image.
 *
 * Why this matters:
 *   BLIP captioning is weak on cartoon/illustrated content — it often
 *   misidentifies species ("elephant", "cartoon animal"). CLIP embeddings
 *   compare visual similarity directly, bypassing language entirely.
 *
 * Score contribution (moderate weights — prefer consistency without dominating):
 *   similarity >= 0.82 → +7  (very close to anchor — strong identity lock)
 *   similarity >= 0.78 → +5  (good match)
 *   similarity >= 0.72 → +3  (acceptable match)
 *   similarity >= 0.65 → +1  (borderline — just above reject threshold)
 *   similarity  0.58-0.65 → -1  (weak match — visual drift)
 *   similarity  < 0.58 → -4  (doesn't look like Riri at all)
 *
 * Rescue: if BLIP rejected the candidate (score < 0) but CLIP similarity
 * to the anchor is >= 0.80, the candidate can be "rescued" — BLIP was
 * probably wrong about the species on a cartoon image.
 */

const CLIP_FEATURES_VERSION =
  "75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a" as const;

/**
 * Fallback CLIP model if andreasjansson/clip-features returns 404.
 * openai/clip-vit-large-patch14 is widely deployed and stable.
 */
const CLIP_FALLBACK_MODEL = "andreasjansson/clip-features" as const;
const CLIP_FALLBACK_VERSION =
  "71addf5ae6aa8df89050d98c2564b1a2f16b1071e0972f40b95a57ff0aa9fe64" as const;

export interface ClipResult {
  similarity: number;
  scoreContribution: number;
  reason: string;
}

/**
 * Extract a CLIP embedding vector from an image URL.
 *
 * Returns a float array (typically 512 or 768 dimensions depending on
 * the CLIP variant). Returns empty array on failure so callers can
 * gracefully skip CLIP scoring.
 */
/**
 * Parse CLIP model output into an embedding vector.
 * Handles multiple output formats from different model versions.
 */
function parseClipOutput(output: unknown): number[] | null {
  // clip-features output format varies by version:
  //   1. [{input: "url", embedding: [0.1, 0.2, ...]}]  — named embeddings (current)
  //   2. [[0.1, 0.2, ...]]  — nested array
  //   3. [0.1, 0.2, ...]    — flat array
  //   4. {embedding: [0.1, 0.2, ...]}  — object with embedding key
  if (Array.isArray(output) && output.length > 0) {
    // Format 1: [{input, embedding}] — array of named embedding objects
    const first = output[0];
    if (first && typeof first === "object" && !Array.isArray(first) && "embedding" in first) {
      return (first as { embedding: number[] }).embedding;
    }
    // Format 2: [[0.1, 0.2, ...]] — nested array
    if (Array.isArray(first)) return first as number[];
    // Format 3: [0.1, 0.2, ...] — flat array of numbers
    if (typeof first === "number") return output as number[];
  }

  // Format 4: {embedding: [...]} — object with embedding key
  if (output && typeof output === "object" && !Array.isArray(output) && "embedding" in (output as Record<string, unknown>)) {
    return (output as { embedding: number[] }).embedding;
  }

  return null;
}

export async function getClipEmbedding(
  replicate: Replicate,
  imageUrl: string
): Promise<number[]> {
  // Try primary CLIP version first, then fallback version on 404/failure.
  const attempts: Array<{ model: string; version: string; label: string }> = [
    {
      model: "andreasjansson/clip-features",
      version: CLIP_FEATURES_VERSION,
      label: "primary (75b33f25)",
    },
    {
      model: CLIP_FALLBACK_MODEL,
      version: CLIP_FALLBACK_VERSION,
      label: "fallback (71addf5a)",
    },
  ];

  for (const attempt of attempts) {
    try {
      const output = await replicate.run(
        `${attempt.model}:${attempt.version}`,
        {
          input: {
            inputs: imageUrl,
          },
        }
      );

      const embedding = parseClipOutput(output);
      if (embedding && embedding.length > 0) {
        return embedding;
      }

      console.warn(`[CLIP] ${attempt.label}: unexpected output format: ${JSON.stringify(output).slice(0, 200)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const is404 = msg.includes("404") || msg.includes("not found");
      const is422 = msg.includes("422");
      console.warn(`[CLIP] ${attempt.label} failed${is404 ? " (404)" : is422 ? " (422)" : ""}: ${msg}`);
      // Continue to fallback
    }
  }

  console.error(`[CLIP] All CLIP model attempts failed for: ${imageUrl.substring(0, 60)}...`);
  return [];
}

/**
 * Cosine similarity between two embedding vectors.
 * Returns 0 on invalid input (empty, mismatched length).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Convert CLIP similarity to a score contribution.
 * Shared logic for both anchor-url and cached-anchor scoring paths.
 *
 * Moderately increased weights to prefer consistent candidates without
 * being so extreme that marginal CLIP differences dominate selection.
 * The 0.65 reject threshold handles hard rejections; these weights
 * handle soft ranking within accepted candidates.
 */
function clipSimilarityToScore(similarity: number): { scoreContribution: number; reason: string } {
  if (similarity >= 0.82) {
    return { scoreContribution: 7, reason: `CLIP: +7 strong identity lock (${similarity.toFixed(3)} >= 0.82)` };
  } else if (similarity >= 0.78) {
    return { scoreContribution: 5, reason: `CLIP: +5 good similarity (${similarity.toFixed(3)} >= 0.78)` };
  } else if (similarity >= 0.72) {
    return { scoreContribution: 3, reason: `CLIP: +3 acceptable similarity (${similarity.toFixed(3)} >= 0.72)` };
  } else if (similarity >= 0.65) {
    return { scoreContribution: 1, reason: `CLIP: +1 borderline similarity (${similarity.toFixed(3)} >= 0.65)` };
  } else if (similarity >= 0.58) {
    return { scoreContribution: -1, reason: `CLIP: -1 weak similarity (${similarity.toFixed(3)} < 0.65)` };
  } else {
    return { scoreContribution: -4, reason: `CLIP: -4 LOW similarity (${similarity.toFixed(3)} < 0.58)` };
  }
}

/**
 * Score a candidate image against a Riri anchor using CLIP similarity.
 *
 * Runs both embeddings in parallel for speed.
 * Returns score contribution (bonus or penalty) and reasoning string.
 */
export async function scoreClipSimilarity(
  replicate: Replicate,
  candidateUrl: string,
  anchorUrl: string
): Promise<ClipResult> {
  const [candidateEmb, anchorEmb] = await Promise.all([
    getClipEmbedding(replicate, candidateUrl),
    getClipEmbedding(replicate, anchorUrl),
  ]);

  if (candidateEmb.length === 0 || anchorEmb.length === 0) {
    return {
      similarity: 0,
      scoreContribution: 0,
      reason: "CLIP: embedding extraction failed, skipping",
    };
  }

  const similarity = cosineSimilarity(candidateEmb, anchorEmb);
  const { scoreContribution, reason } = clipSimilarityToScore(similarity);

  console.log(`[CLIP] Similarity: ${similarity.toFixed(3)} → ${reason}`);

  return { similarity, scoreContribution, reason };
}

/**
 * Cache an anchor embedding to avoid re-computing it for every candidate.
 *
 * Call once with the anchor image URL, then pass the cached embedding
 * to scoreClipWithCachedAnchor() for each candidate.
 */
export async function cacheAnchorEmbedding(
  replicate: Replicate,
  anchorUrl: string
): Promise<number[]> {
  console.log(`[CLIP] Caching anchor embedding for: ${anchorUrl}`);
  const embedding = await getClipEmbedding(replicate, anchorUrl);
  if (embedding.length === 0) {
    console.warn("[CLIP] Failed to cache anchor embedding");
  } else {
    console.log(`[CLIP] Anchor embedding cached (${embedding.length} dimensions)`);
  }
  return embedding;
}

/**
 * Score a candidate using a pre-cached anchor embedding.
 * Avoids redundant Replicate calls for the anchor image.
 */
export async function scoreClipWithCachedAnchor(
  replicate: Replicate,
  candidateUrl: string,
  anchorEmbedding: number[]
): Promise<ClipResult> {
  if (anchorEmbedding.length === 0) {
    return {
      similarity: 0,
      scoreContribution: 0,
      reason: "CLIP: anchor embedding not available, skipping",
    };
  }

  const candidateEmb = await getClipEmbedding(replicate, candidateUrl);

  if (candidateEmb.length === 0) {
    return {
      similarity: 0,
      scoreContribution: 0,
      reason: "CLIP: candidate embedding failed, skipping",
    };
  }

  const similarity = cosineSimilarity(candidateEmb, anchorEmbedding);
  const { scoreContribution, reason } = clipSimilarityToScore(similarity);

  console.log(`[CLIP] Similarity: ${similarity.toFixed(3)} → ${reason}`);

  return { similarity, scoreContribution, reason };
}
