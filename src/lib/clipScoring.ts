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
 * Score contribution:
 *   similarity >= 0.85 → +3  (very close to anchor)
 *   similarity >= 0.75 → +2  (good match)
 *   similarity >= 0.65 → +1  (moderate match)
 *   similarity  < 0.50 → -3  (doesn't look like Riri at all)
 *
 * Rescue: if BLIP rejected the candidate (score < 0) but CLIP similarity
 * to the anchor is >= 0.80, the candidate can be "rescued" — BLIP was
 * probably wrong about the species on a cartoon image.
 */

const CLIP_FEATURES_VERSION =
  "71addf5a5e7c400e091f33ef8ae1c40d72a25966897d05ebe36a7edb06a86a2c" as const;

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
export async function getClipEmbedding(
  replicate: Replicate,
  imageUrl: string
): Promise<number[]> {
  try {
    // Use versionless call (latest deployment) — pinned versions have returned
    // identical embeddings for all inputs (similarity always 1.000).
    const output = await replicate.run(
      "andreasjansson/clip-features",
      {
        input: {
          image: imageUrl,
        },
      }
    );

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

    console.warn(`[CLIP] Unexpected output format: ${JSON.stringify(output).slice(0, 200)}`);
    throw new Error("Unexpected CLIP output format");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[CLIP] Embedding extraction failed: ${msg}`);
    return [];
  }
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

  let scoreContribution: number;
  let reason: string;

  if (similarity >= 0.85) {
    scoreContribution = 3;
    reason = `CLIP: +3 high similarity (${similarity.toFixed(3)} >= 0.85)`;
  } else if (similarity >= 0.75) {
    scoreContribution = 2;
    reason = `CLIP: +2 good similarity (${similarity.toFixed(3)} >= 0.75)`;
  } else if (similarity >= 0.65) {
    scoreContribution = 1;
    reason = `CLIP: +1 moderate similarity (${similarity.toFixed(3)} >= 0.65)`;
  } else if (similarity < 0.50) {
    scoreContribution = -3;
    reason = `CLIP: -3 LOW similarity (${similarity.toFixed(3)} < 0.50)`;
  } else {
    scoreContribution = 0;
    reason = `CLIP: neutral similarity (${similarity.toFixed(3)})`;
  }

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

  let scoreContribution: number;
  let reason: string;

  if (similarity >= 0.85) {
    scoreContribution = 3;
    reason = `CLIP: +3 high similarity (${similarity.toFixed(3)} >= 0.85)`;
  } else if (similarity >= 0.75) {
    scoreContribution = 2;
    reason = `CLIP: +2 good similarity (${similarity.toFixed(3)} >= 0.75)`;
  } else if (similarity >= 0.65) {
    scoreContribution = 1;
    reason = `CLIP: +1 moderate similarity (${similarity.toFixed(3)} >= 0.65)`;
  } else if (similarity < 0.50) {
    scoreContribution = -3;
    reason = `CLIP: -3 LOW similarity (${similarity.toFixed(3)} < 0.50)`;
  } else {
    scoreContribution = 0;
    reason = `CLIP: neutral similarity (${similarity.toFixed(3)})`;
  }

  console.log(`[CLIP] Similarity: ${similarity.toFixed(3)} → ${reason}`);

  return { similarity, scoreContribution, reason };
}
