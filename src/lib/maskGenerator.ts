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
 * For 1024×1024:
 *   cx = 512 (centered)
 *   cy = 614 (60% down — balanced headroom + foot room)
 *   rx = 379 (74% width coverage)
 *   ry = 420 (82% height coverage — head-to-toe with margins)
 */
export async function makeRiriZoneMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.60;
  const rx = size * 0.37;
  const ry = size * 0.41;

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
 *   cx = 50% centered
 *   cy = 60% (balanced)
 *   rx = 39% (78% width coverage)
 *   ry = 43% (86% height coverage)
 */
export async function makeRiriZoneLargeMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.60;
  const rx = size * 0.39;
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
