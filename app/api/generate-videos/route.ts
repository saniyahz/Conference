/**
 * POST /api/generate-videos
 *
 * "Living Pictures" — generates animated video clips from static illustrations.
 * Takes an array of image URLs + scene cards and returns an array of video URLs (mp4).
 *
 * v4: Switched from Minimax video-01-live to Wan 2.2 I2V Fast.
 *   - 10x cheaper (~$0.05 vs ~$0.50 per clip)
 *   - Faster (~20-40s vs ~60-300s per clip)
 *   - Better motion for cartoon/storybook illustrations
 *
 * v3: Selective page animation — accepts `keyPageIndices` to only animate key pages
 * (e.g., pages 1, 3, 5, 7, 9) instead of all 10. Cuts generation time ~50%.
 *
 * v2: Scene-aware — each video gets a motion prompt that matches the page's actual
 * scene content (water splashing, stars twinkling, leaves rustling) instead of
 * a generic "gentle sway" for everything.
 *
 * Uses wan-video/wan-2.2-i2v-fast on Replicate (same API token as image generation).
 * Runs with bounded concurrency (2 workers) to avoid rate limiting.
 *
 * Failed generations return null in the array — the frontend gracefully
 * falls back to the static image for those pages.
 */

import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { generateLivingImage, SceneContext } from "@/src/lib/minimaxGeneration";

// ─── CONFIG ──────────────────────────────────────────────────────────────

/**
 * Max concurrent video generations.
 * Set to 1 to avoid 429 rate limiting from Replicate when account credit is low.
 * Each video takes ~30-60s, so sequential still completes 5 key pages in ~3-5 min.
 */
const VIDEO_CONCURRENCY = 1;

// ─── HELPERS ─────────────────────────────────────────────────────────────

/**
 * Extract scene context from a PageSceneCard for motion prompt building.
 * Handles missing/partial data gracefully.
 */
function extractSceneContext(sceneCard: any, pageText?: string): SceneContext {
  return {
    setting: sceneCard?.setting || "",
    action: sceneCard?.action || "",
    timeWeather: sceneCard?.time_weather || "daytime",
    objects: [
      ...(sceneCard?.must_include || []),
      ...(sceneCard?.key_objects || []),
      ...(sceneCard?.supporting_characters || []),
    ].filter(Boolean),
  };
}

// ─── ROUTE ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { imageUrls, sceneCards, pageTexts, keyPageIndices } = await request.json();

    if (!imageUrls || !Array.isArray(imageUrls)) {
      return NextResponse.json(
        { error: "imageUrls array is required" },
        { status: 400 }
      );
    }

    const validUrls = imageUrls.filter((url: string) => url && url.length > 0);
    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "No valid image URLs provided" },
        { status: 400 }
      );
    }

    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: "REPLICATE_API_TOKEN not configured" },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: apiToken });

    // Determine which pages to animate
    // If keyPageIndices provided, only animate those (saves ~50% time)
    // Otherwise animate all pages (backward compatible)
    const pagesToAnimate: Set<number> = keyPageIndices
      ? new Set(keyPageIndices as number[])
      : new Set(imageUrls.map((_: string, i: number) => i));

    // Build sorted work queue of valid page indices
    const workQueue = [...pagesToAnimate]
      .filter(i => i >= 0 && i < imageUrls.length)
      .sort((a, b) => a - b);

    console.log(`\n========== LIVING PICTURES GENERATION ==========`);
    console.log(`Total pages: ${imageUrls.length}`);
    console.log(`Pages to animate: ${workQueue.length} ${keyPageIndices ? `(key pages: ${workQueue.map(i => i + 1).join(', ')})` : '(all pages)'}`);
    console.log(`Scene cards provided: ${sceneCards?.length || 0}`);
    console.log(`Concurrency: ${VIDEO_CONCURRENCY}`);
    console.log(`================================================\n`);

    // ── Generate videos with bounded concurrency ──
    const videoUrls: (string | null)[] = new Array(imageUrls.length).fill(null);
    let nextWorkIdx = 0;

    const worker = async () => {
      while (nextWorkIdx < workQueue.length) {
        const i = workQueue[nextWorkIdx++];
        const imageUrl = imageUrls[i];

        // Skip empty/missing image URLs
        if (!imageUrl) {
          console.log(`[Video ${i + 1}] Skipping — no source image`);
          continue;
        }

        // Extract scene context for this page
        const sceneCard = sceneCards?.[i];
        const pageText = pageTexts?.[i];
        const scene = sceneCard ? extractSceneContext(sceneCard, pageText) : undefined;

        console.log(`\n---------- ANIMATING PAGE ${i + 1}/${imageUrls.length} ----------`);
        if (scene) {
          console.log(`[Video ${i + 1}] Setting: "${scene.setting}"`);
          console.log(`[Video ${i + 1}] Action: "${scene.action}"`);
          console.log(`[Video ${i + 1}] Objects: [${scene.objects.join(", ")}]`);
        }

        const url = await generateLivingImage(replicate, {
          imageUrl,
          scene,
          pageIndex: i + 1,
        });

        videoUrls[i] = url || null;
      }
    };

    const workers = Array.from(
      { length: Math.min(VIDEO_CONCURRENCY, workQueue.length) },
      () => worker()
    );
    await Promise.all(workers);

    // ── Build response ──
    const successCount = videoUrls.filter((u) => u).length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n========== LIVING PICTURES COMPLETE ==========`);
    console.log(`Success: ${successCount}/${workQueue.length} videos`);
    console.log(`Skipped: ${imageUrls.length - workQueue.length} pages (static only)`);
    console.log(`Total time: ${elapsed}s`);
    console.log(`==============================================\n`);

    return NextResponse.json({ videoUrls });
  } catch (error) {
    console.error("Error in video generation:", error);
    return NextResponse.json(
      { error: "Failed to generate videos" },
      { status: 500 }
    );
  }
}
