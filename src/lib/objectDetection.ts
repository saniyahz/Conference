import Replicate from "replicate";

/**
 * Object detection for "rhinoceros" using GroundingDINO or OWL-ViT.
 *
 * Why this is better than BLIP for cartoons:
 *   BLIP generates a free-text caption and often misidentifies cartoon
 *   rhinoceroses as "elephant", "gray animal", or "cartoon creature".
 *   Object detectors return bounding boxes + confidence per class,
 *   and are trained on localization — they're more reliable at saying
 *   "yes, there is a rhinoceros at these coordinates" even for
 *   illustrated/stylized content.
 *
 * Detection flow:
 *   1. Send image + text query "rhinoceros" to GroundingDINO
 *   2. Get back bounding boxes with confidence scores
 *   3. If any box has confidence >= 0.3, rhinoceros is detected
 *
 * Score contribution:
 *   confidence >= 0.7  → +3 (strong detection)
 *   confidence >= 0.5  → +2 (good detection)
 *   confidence >= 0.3  → +1 (weak but present)
 *   not detected       → -2 (rhinoceros missing)
 *
 * Rescue: if BLIP rejected (no rhino in caption) but GroundingDINO
 * detects rhinoceros with confidence >= 0.5, the candidate is rescued
 * with base score 4. BLIP was wrong about the species.
 */

/**
 * GroundingDINO model on Replicate.
 *
 * Update this version hash if a newer deployment is available.
 * The model accepts { image, query, box_threshold, text_threshold }
 * and returns detections with bounding boxes + confidence scores.
 *
 * NOTE: The correct Replicate username is "adirik", NOT "schananas".
 * "schananas/grounding-dino" does not exist on Replicate (422 errors).
 */
const GROUNDING_DINO_MODEL = "adirik/grounding-dino" as const;
const GROUNDING_DINO_VERSION =
  "efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa" as const;

/**
 * OWL-ViT fallback model on Replicate.
 * Used if GroundingDINO is unavailable.
 *
 * NOTE: The correct Replicate username is "adirik", NOT "alaradirik".
 * "alaradirik" is the GitHub username; Replicate username is "adirik".
 * Uses versionless call (latest deployment) for resilience.
 */
const OWLVIT_MODEL = "adirik/owlvit-base-patch32" as const;

export type DetectorModel = "grounding-dino" | "owlvit";

export interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  detections: Detection[];
  scoreContribution: number;
  reason: string;
  /** Area of the best detection bbox as fraction of frame (0.0–1.0) */
  bestBboxArea: number;
}

/**
 * Parse GroundingDINO output into a normalized Detection array.
 *
 * GroundingDINO outputs vary by deployment but typically return:
 *   - Array of detections with { label, confidence/score, box/bbox }
 *   - Or a structured object with detections array
 */
function parseGroundingDinoOutput(output: unknown): Detection[] {
  const detections: Detection[] = [];

  if (!output) return detections;

  // Handle array of detection objects
  if (Array.isArray(output)) {
    for (const det of output) {
      if (det && typeof det === "object") {
        const d = det as Record<string, unknown>;
        const confidence = Number(d.confidence ?? d.score ?? 0);
        const label = String(d.label ?? d.class ?? "unknown");
        const bbox = (d.bbox ?? d.box ?? [0, 0, 0, 0]) as [number, number, number, number];
        detections.push({ label, confidence, bbox });
      }
    }
    return detections;
  }

  // Handle object with nested detections
  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;

    // { detections: [...] }
    if (Array.isArray(obj.detections)) {
      return parseGroundingDinoOutput(obj.detections);
    }

    // { boxes: [...], scores: [...], labels: [...] }
    if (Array.isArray(obj.boxes) && Array.isArray(obj.scores)) {
      const boxes = obj.boxes as number[][];
      const scores = obj.scores as number[];
      const labels = (obj.labels ?? obj.phrases ?? []) as string[];

      for (let i = 0; i < boxes.length; i++) {
        detections.push({
          label: labels[i] ?? "rhinoceros",
          confidence: scores[i] ?? 0,
          bbox: (boxes[i] ?? [0, 0, 0, 0]) as [number, number, number, number],
        });
      }
      return detections;
    }
  }

  return detections;
}

/**
 * Parse OWL-ViT output into a normalized Detection array.
 */
function parseOwlVitOutput(output: unknown): Detection[] {
  // OWL-ViT on Replicate typically returns similar structure
  return parseGroundingDinoOutput(output);
}

/**
 * Detect "rhinoceros" in an image using GroundingDINO.
 *
 * Returns all detections matching the query, with the best
 * confidence score used for scoring.
 */
export async function detectWithGroundingDino(
  replicate: Replicate,
  imageUrl: string,
  query: string = "rhinoceros",
  boxThreshold: number = 0.25,
  textThreshold: number = 0.25
): Promise<Detection[]> {
  try {
    const output = await replicate.run(
      `${GROUNDING_DINO_MODEL}:${GROUNDING_DINO_VERSION}`,
      {
        input: {
          image: imageUrl,
          query,
          box_threshold: boxThreshold,
          text_threshold: textThreshold,
        },
      }
    );

    return parseGroundingDinoOutput(output);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[GroundingDINO] Detection failed: ${msg}`);
    return [];
  }
}

/**
 * Detect "rhinoceros" in an image using OWL-ViT (fallback).
 */
export async function detectWithOwlVit(
  replicate: Replicate,
  imageUrl: string,
  query: string = "rhinoceros"
): Promise<Detection[]> {
  try {
    const output = await replicate.run(
      OWLVIT_MODEL,
      {
        input: {
          image: imageUrl,
          query,
        },
      }
    );

    return parseOwlVitOutput(output);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[OWL-ViT] Detection failed: ${msg}`);
    return [];
  }
}

/**
 * Detect rhinoceros in an image. Tries GroundingDINO first, falls back
 * to OWL-ViT if GroundingDINO fails.
 *
 * Returns a DetectionResult with:
 *   - detected: whether rhinoceros was found (confidence >= 0.3)
 *   - confidence: best detection confidence
 *   - scoreContribution: bonus/penalty for the scoring pipeline
 *   - reason: human-readable explanation
 */
export async function detectRhinoceros(
  replicate: Replicate,
  imageUrl: string,
  preferredModel: DetectorModel = "grounding-dino"
): Promise<DetectionResult> {
  let detections: Detection[] = [];

  if (preferredModel === "grounding-dino") {
    detections = await detectWithGroundingDino(replicate, imageUrl);
    if (detections.length === 0) {
      console.log("[Detection] GroundingDINO returned nothing, trying OWL-ViT fallback");
      detections = await detectWithOwlVit(replicate, imageUrl);
    }
  } else {
    detections = await detectWithOwlVit(replicate, imageUrl);
    if (detections.length === 0) {
      console.log("[Detection] OWL-ViT returned nothing, trying GroundingDINO fallback");
      detections = await detectWithGroundingDino(replicate, imageUrl);
    }
  }

  // Find best rhinoceros detection
  const rhinoDetections = detections.filter(
    (d) => /rhino/i.test(d.label) || d.confidence > 0
  );
  const bestConfidence = rhinoDetections.length > 0
    ? Math.max(...rhinoDetections.map((d) => d.confidence))
    : 0;

  // Compute bbox area of best detection as fraction of frame.
  // bbox is [x1, y1, x2, y2] normalized to 0–1.
  // If coords look like pixels (>1), normalize against 1024.
  const bestDetection = rhinoDetections.reduce<Detection | null>((best, d) =>
    !best || d.confidence > best.confidence ? d : best, null);
  let bestBboxArea = 0;
  if (bestDetection) {
    let [x1, y1, x2, y2] = bestDetection.bbox;
    // Normalize pixel coords to 0–1 if needed
    if (x1 > 1 || y1 > 1 || x2 > 1 || y2 > 1) {
      x1 /= 1024; y1 /= 1024; x2 /= 1024; y2 /= 1024;
    }
    bestBboxArea = Math.abs(x2 - x1) * Math.abs(y2 - y1);
  }

  const detected = bestConfidence >= 0.3;

  let scoreContribution: number;
  let reason: string;

  if (bestConfidence >= 0.7) {
    scoreContribution = 3;
    reason = `Detection: +3 strong rhinoceros (conf=${bestConfidence.toFixed(2)}, bbox=${(bestBboxArea * 100).toFixed(1)}%)`;
  } else if (bestConfidence >= 0.5) {
    scoreContribution = 2;
    reason = `Detection: +2 good rhinoceros (conf=${bestConfidence.toFixed(2)}, bbox=${(bestBboxArea * 100).toFixed(1)}%)`;
  } else if (bestConfidence >= 0.3) {
    scoreContribution = 1;
    reason = `Detection: +1 weak rhinoceros (conf=${bestConfidence.toFixed(2)}, bbox=${(bestBboxArea * 100).toFixed(1)}%)`;
  } else {
    scoreContribution = -2;
    reason = detections.length === 0
      ? "Detection: -2 no detections returned (model may have failed)"
      : `Detection: -2 rhinoceros NOT detected (best conf=${bestConfidence.toFixed(2)})`;
  }

  console.log(
    `[Detection] ${detected ? "FOUND" : "MISSING"} rhinoceros ` +
    `(${rhinoDetections.length} detections, best conf=${bestConfidence.toFixed(2)}, ` +
    `bbox=${(bestBboxArea * 100).toFixed(1)}%) → ${reason}`
  );

  return {
    detected,
    confidence: bestConfidence,
    detections: rhinoDetections,
    scoreContribution,
    reason,
    bestBboxArea,
  };
}
