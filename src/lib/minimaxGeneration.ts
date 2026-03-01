/**
 * WAN 2.2 I2V FAST — "Living Pictures" video generation via Replicate.
 *
 * Takes a static illustration and generates a short (~5 second) animated
 * video with scene-appropriate motion.
 *
 * Used exclusively by the digital reader (StoryBook component).
 * Print/PDF always uses the original static image.
 *
 * v3: Switched from Minimax video-01-live to Wan 2.2 I2V Fast.
 *   - 10x cheaper (~$0.05 vs ~$0.50 per clip)
 *   - Faster (~20-40s vs ~60-300s per clip)
 *   - Better motion quality for cartoon/storybook illustrations
 *   - 8.1M+ runs on Replicate (most popular I2V model)
 *
 * v2: Scene-aware motion prompts — each page gets a motion description
 * that matches its scene (water splashing, stars twinkling, leaves rustling)
 * instead of a generic "gentle sway" for everything.
 *
 * Model: wan-video/wan-2.2-i2v-fast on Replicate
 *   - Open-source (Apache 2.0) Alibaba Wan 2.2 14B model
 *   - Input: source image URL + motion prompt
 *   - Output: MP4 video URL (480p, ~5 seconds)
 *   - ~20-40 seconds per generation
 */

import Replicate from "replicate";

// ─── CONFIG ──────────────────────────────────────────────────────────────

/** Wan 2.2 I2V Fast model identifier on Replicate */
export const WAN_I2V_MODEL = "wan-video/wan-2.2-i2v-fast" as const;

/** Legacy export for backward compatibility */
export const MINIMAX_LIVE_MODEL = WAN_I2V_MODEL;

/** Retry config — Wan is fast, so 3 retries is fine */
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 3000; // 3s, 6s, 12s exponential backoff

/**
 * Poll timeout: 3 minutes.
 *
 * Wan 2.2 I2V Fast typically completes in 20-40 seconds.
 * 3 minutes gives plenty of room for cold starts without
 * the excessive 8-minute timeout that MiniMax needed.
 */
const MAX_POLL_TIME_MS = 180000; // 3 minutes

// ─── SCENE-AWARE MOTION PROMPTS ─────────────────────────────────────────

/**
 * Scene context extracted from PageSceneCard data.
 * Used to build motion prompts that match what's actually happening on each page.
 */
export interface SceneContext {
  /** Scene location, e.g. "Beach with sand and waves" */
  setting: string;
  /** Character action, e.g. "splashing in water with legs kicking" */
  action: string;
  /** Time of day: "daytime" | "nighttime" */
  timeWeather: string;
  /** Scene objects, e.g. ["rocket ship", "dolphins"] */
  objects: string[];
}

/**
 * Build a motion prompt tailored to the scene content.
 *
 * Maps scene keywords (setting, action, objects) to appropriate motions:
 * - Water/ocean → splashing waves, water ripples
 * - Forest/trees → rustling leaves, dappled light
 * - Space/stars → twinkling stars, gentle floating
 * - Flying → soaring motion, wind effects
 * - Celebration → confetti, joyful bouncing
 * - Sunset → warm shifting light, golden glow
 *
 * Always includes a base "children's storybook" framing and falls back
 * to gentle ambient motion for unrecognized scenes.
 */
export function buildMotionPrompt(scene?: SceneContext): string {
  const motionParts: string[] = [
    "children's storybook illustration coming to life",
    "smooth natural animation",
  ];

  if (!scene) {
    motionParts.push("gentle ambient motion, soft breeze, slight sway");
    return motionParts.join(", ");
  }

  const combined = `${scene.setting} ${scene.action} ${scene.objects.join(" ")}`.toLowerCase();

  // Water scenes
  if (/water|ocean|sea|beach|wave|splash|swim|lake|river|pond|rain|fountain/.test(combined)) {
    motionParts.push("water rippling and shimmering, gentle waves moving, water splashing softly");
  }

  // Forest / nature scenes
  if (/forest|tree|jungle|garden|grass|meadow|flower|leaf|leaves|park/.test(combined)) {
    motionParts.push("leaves gently rustling, dappled sunlight shifting through branches, flowers swaying");
  }

  // Space / sky scenes
  if (/space|star|moon|galaxy|planet|cosmos|rocket|astronaut|sky/.test(combined)) {
    motionParts.push("stars twinkling softly, gentle floating motion, cosmic dust drifting");
  }

  // Flying / soaring
  if (/fly|flying|soar|soaring|glide|float|wing|hover/.test(combined)) {
    motionParts.push("gentle soaring motion, wind flowing through the scene, floating movement");
  }

  // Celebration / party
  if (/celebrat|party|dance|cheer|confetti|festival|birthday|happy|joy/.test(combined)) {
    motionParts.push("joyful bouncing movement, sparkles floating, festive energy");
  }

  // Sunset / sunrise / golden hour
  if (/sunset|sunrise|golden|dawn|dusk|twilight/.test(combined)) {
    motionParts.push("warm golden light slowly shifting, gentle glow pulsing softly");
  }

  // Fire / campfire / warmth
  if (/fire|campfire|flame|candle|torch|warm|cozy/.test(combined)) {
    motionParts.push("flickering warm firelight, soft glowing embers, dancing shadows");
  }

  // Snow / winter / ice
  if (/snow|winter|ice|frost|cold|blizzard|snowflake/.test(combined)) {
    motionParts.push("snowflakes gently falling, frost shimmer, icy sparkle");
  }

  // Wind / stormy
  if (/wind|storm|breeze|blow|gust|hurricane/.test(combined)) {
    motionParts.push("wind blowing through the scene, hair and clothes swaying, leaves carried by breeze");
  }

  // Magic / sparkle
  if (/magic|magical|sparkle|glow|enchant|fairy|wand|spell/.test(combined)) {
    motionParts.push("magical sparkles floating and twinkling, soft glowing aura, enchanted particles");
  }

  // Nighttime ambiance
  if (scene.timeWeather === "nighttime" || /night|dark|moon/.test(combined)) {
    motionParts.push("soft moonlight glow, fireflies or gentle light particles drifting");
  }

  // If no specific keywords matched, add generic ambient motion
  if (motionParts.length === 2) {
    motionParts.push("gentle ambient motion, soft breeze, slight sway, subtle movement");
  }

  return motionParts.join(", ");
}

// ─── HELPERS ─────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function is429Error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("Too Many Requests");
}

/**
 * Extract the retry_after value (in seconds) from a 429 error message.
 * Replicate errors include JSON like `"retry_after":8` or text like `retry_after: 9`.
 * Falls back to 0 if not found.
 */
function extractRetryAfter(e: unknown): number {
  const msg = e instanceof Error ? e.message : String(e);
  const match = msg.match(/retry[_-]after["']?\s*[:=]\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Check if an error is a 402 Payment Required / Insufficient credit error.
 */
function is402Error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("402") || msg.includes("Payment Required") || msg.includes("nsufficient credit") || msg.includes("nsufficient balance");
}

/**
 * Extract video URL from prediction output.
 * Wan 2.2 returns a single URL string, but handle arrays and objects for safety.
 */
function extractVideoUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === "string") {
    return output[0];
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.href === "string") return obj.href;
    if (typeof obj.url === "function") return (obj.url as () => string)();
  }
  return "";
}

/**
 * Poll a Replicate prediction until it completes.
 * Wan 2.2 is fast (~20-40s), so we poll every 2 seconds.
 */
async function pollPrediction(
  replicate: Replicate,
  prediction: { id: string; status: string; output?: unknown; error?: unknown }
): Promise<{ output?: unknown; status: string; error?: unknown }> {
  let result = prediction;
  const pollInterval = 2000; // 2s between polls (Wan is fast)
  const startTime = Date.now();

  while (
    result.status !== "succeeded" &&
    result.status !== "failed" &&
    result.status !== "canceled"
  ) {
    if (Date.now() - startTime > MAX_POLL_TIME_MS) {
      throw new Error(`Video prediction timed out after ${MAX_POLL_TIME_MS / 1000}s`);
    }
    await delay(pollInterval);
    result = await replicate.predictions.get(result.id);
  }

  if (result.status === "failed") {
    const msg = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
    throw new Error(`Video prediction failed: ${msg}`);
  }
  if (result.status === "canceled") {
    throw new Error("Video prediction was canceled");
  }

  return result;
}

// ─── CORE GENERATION ─────────────────────────────────────────────────────

export interface LivingImageOptions {
  /** Static source image URL to animate */
  imageUrl: string;
  /** Scene context for building a scene-aware motion prompt */
  scene?: SceneContext;
  /** Page index for logging */
  pageIndex?: number;
}

/**
 * Generate a "living image" video from a static illustration.
 *
 * Takes the AI-generated page illustration and creates a short animated
 * video with scene-appropriate motion (water splashing, stars twinkling, etc.).
 *
 * Uses Wan 2.2 I2V Fast — ~$0.05 per clip, ~20-40s generation time.
 *
 * @returns Video URL string (mp4), or "" on failure
 */
export async function generateLivingImage(
  replicate: Replicate,
  options: LivingImageOptions
): Promise<string> {
  const {
    imageUrl,
    scene,
    pageIndex = 0,
  } = options;

  const prompt = buildMotionPrompt(scene);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Wan ${pageIndex}] Attempt ${attempt}/${MAX_RETRIES} — generating living image`
      );
      console.log(`[Wan ${pageIndex}] Motion prompt: "${prompt.substring(0, 120)}..."`);

      const prediction = await replicate.predictions.create({
        model: WAN_I2V_MODEL,
        input: {
          image: imageUrl,
          prompt,
        },
      });

      const completed = await pollPrediction(replicate, prediction);
      console.log(
        `[Wan ${pageIndex}] Raw output type: ${typeof completed.output}, ` +
        `value: ${JSON.stringify(completed.output).substring(0, 200)}`
      );

      const url = extractVideoUrl(completed.output);
      if (!url) throw new Error("No video URL in Wan output");

      console.log(`[Wan ${pageIndex}] Success: ${url.substring(0, 80)}...`);
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Wan ${pageIndex}] Attempt ${attempt} failed: ${msg}`);

      // 402 = out of credit — fail immediately, retrying won't help
      if (is402Error(e)) {
        console.error(`[Wan ${pageIndex}] 402 INSUFFICIENT CREDIT — skipping retries`);
        break;
      }

      if (attempt < MAX_RETRIES) {
        let waitMs: number;
        if (is429Error(e)) {
          const retryAfterSec = extractRetryAfter(e);
          waitMs = retryAfterSec > 0
            ? (retryAfterSec + 3) * 1000
            : attempt * 15000; // 15s, 30s fallback
          console.log(`[Wan ${pageIndex}] 429 rate limited (retry_after=${retryAfterSec}s).`);
        } else {
          waitMs = RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s
        }
        console.log(`[Wan ${pageIndex}] Waiting ${waitMs / 1000}s before retry...`);
        await delay(waitMs);
      }
    }
  }

  console.error(`[Wan ${pageIndex}] All ${MAX_RETRIES} attempts failed`);
  return "";
}
