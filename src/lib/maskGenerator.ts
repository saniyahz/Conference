import sharp from "sharp";

/**
 * Generate a "Riri zone" mask for SDXL inpainting.
 *
 * White = area to inpaint (character goes here).
 * Black = preserved area (background stays untouched).
 *
 * STANDARD mask — generous full-body coverage with headroom and foot room.
 * Centered slightly below middle to leave sky/background visible above.
 *
 * Increased from 74%×82% to 80%×86% coverage to ensure the character
 * renders large enough to pass the bbox size check on the first attempt.
 * The old smaller mask frequently produced characters with bbox < 8%,
 * wasting API calls on escalation rounds.
 *
 * NOTE: No mask feathering — Gaussian blur was tested (stdDev=18) but
 * it shrinks the effective white area, causing characters to render too
 * small (bbox 1-7%) and triggering massive TINY CHARACTER rejections.
 * Hard-edged masks produce larger, more prominent characters.
 *
 * For 1024×1024:
 *   cx = 512 (centered)
 *   cy = 614 (60% down — balanced headroom + foot room)
 *   rx = 410 (80% width coverage)
 *   ry = 440 (86% height coverage — head-to-toe with margins)
 */
export async function makeRiriZoneMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.60;
  const rx = size * 0.40;
  const ry = size * 0.43;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * LARGE mask — for multi-char round 1 or when standard mask isn't enough.
 * Wider and taller to give the character more room in busy scenes.
 *
 * Increased from 78%×86% to 84%×88% coverage.
 *
 *   cx = 50% centered
 *   cy = 58% (slightly higher for more headroom)
 *   rx = 42% (84% width coverage)
 *   ry = 44% (88% height coverage)
 */
export async function makeRiriZoneLargeMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.58;
  const rx = size * 0.42;
  const ry = size * 0.44;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * EXTRA-LARGE mask — Round 3 fallback when standard/large masks fail.
 * Covers ~88% of the frame, giving the character maximum room.
 *
 *   cx = 50% centered
 *   cy = 56% (slightly above center for headroom)
 *   rx = 44% (88% width coverage)
 *   ry = 44% (88% height coverage)
 */
export async function makeRiriZoneExtraLargeMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.56;
  const rx = size * 0.44;
  const ry = size * 0.44;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * Rectangular Riri zone — for wide-shot compositions.
 * Rounded rectangle in the center-bottom foreground.
 *
 * x: 28% → 72% of width
 * y: 52% → 98% of height
 */
export async function makeRiriZoneRectMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const x = Math.round(size * 0.28);
  const y = Math.round(size * 0.52);
  const w = Math.round(size * 0.44);
  const h = Math.round(size * 0.46);
  const r = Math.round(size * 0.04); // corner radius

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
