import sharp from "sharp";

/**
 * Generate a "Riri zone" mask for SDXL inpainting.
 *
 * White = area to inpaint (character goes here).
 * Black = preserved area (background stays untouched).
 *
 * STANDARD mask — SCENE-PRESERVING: character in the center with
 * visible plate edges for story context (sky, ground, environment).
 *
 * Sized at 80%×82% — increased from 72%×78% after production testing
 * showed characters rendering too small (bbox 3-7%) at the old size.
 * With the larger mask, characters have enough room to render at
 * bbox > 8% on Round 1 without needing escalation to Round 2/3.
 *
 *   Top 13%:   sky/ceiling (plate preserved)
 *   Bottom 5%: ground/floor (plate preserved)
 *   Left/right 10%: environment (plate preserved)
 *   Center 80%×82%: character inpaint zone
 *
 * For 1024×1024:
 *   cx = 512 (centered)
 *   cy = 563 (55% down — balanced headroom + visible ground)
 *   rx = 410 (80% width coverage)
 *   ry = 420 (82% height coverage)
 */
export async function makeRiriZoneMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.55;
  const rx = size * 0.40;
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
 * LARGE mask — escalation path when standard mask produces tiny characters.
 * Covers 86%×88% of the frame.
 *
 * Also used as round 1 mask for multi-character pages where secondary
 * actors in the plate compete with the main character for visual space.
 *
 *   cx = 50% centered
 *   cy = 55% (slightly below center for foot room)
 *   rx = 43% (86% width coverage)
 *   ry = 44% (88% height coverage)
 */
export async function makeRiriZoneLargeMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.55;
  const rx = size * 0.43;
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
