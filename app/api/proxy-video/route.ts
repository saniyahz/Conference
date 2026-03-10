/**
 * GET /api/proxy-video?url=...
 *
 * CORS proxy for Replicate video URLs.
 * Fetches the video server-side and streams it back with proper CORS headers
 * so the client can draw it on Canvas without tainted-canvas errors.
 *
 * Only allows proxying from known safe domains (Replicate CDN).
 */

import { NextRequest, NextResponse } from "next/server";

// Allowed domains for proxying (Replicate CDN and related)
const ALLOWED_DOMAINS = [
  "replicate.delivery",
  "replicate.com",
  "pbxt.replicate.delivery",
  "tjzk.replicate.delivery",
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Security: only proxy from allowed domains
  const isAllowed = ALLOWED_DOMAINS.some(
    (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
  );

  if (!isAllowed) {
    return NextResponse.json(
      { error: `Domain not allowed: ${parsed.hostname}` },
      { status: 403 }
    );
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LittleStoryBear/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get("content-type") || "video/mp4";
    const contentLength = response.headers.get("content-length");

    // Stream the response back
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    };

    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[proxy-video] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch video" },
      { status: 500 }
    );
  }
}
