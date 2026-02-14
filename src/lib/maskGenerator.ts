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
 * Sized at 72%×78% — a middle ground between:
 *   - 80%×86% (original): destroyed plate scene, only thin strips survived
 *   - 64%×72% (tested): too small, caused TINY CHARACTER rejections (bbox 3.7%)
 *
 * With 72%×78%, the plate scene is visible:
 *   Top 17%:  sky/ceiling (plate preserved)
 *   Bottom 5%: ground/floor (plate preserved)
 *   Left/right 14%: environment (plate preserved)
 *   Center 72%×78%: character inpaint zone
 *
 * At prompt_strength=0.85, the character renders prominently within the
 * mask. If the character is too small (bbox < 8%), rounds 2-3 escalate
 * to larger masks (80%×86% and 88%×88%) as fallback.
 *
 * For 1024×1024:
 *   cx = 512 (centered)
 *   cy = 573 (56% down — balanced headroom + visible ground)
 *   rx = 369 (72% width coverage)
 *   ry = 400 (78% height coverage)
 */
export async function makeRiriZoneMaskDataUrl(
  size: number = 1024
): Promise<string> {
  const cx = size * 0.50;
  const cy = size * 0.56;
  const rx = size * 0.36;
  const ry = size * 0.39;

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
 * Uses the old standard dimensions (80%×86% coverage).
 *
 * Also used as round 1 mask for multi-character pages where secondary
 * actors in the plate compete with the main character for visual space.
 *
 *   cx = 50% centered
 *   cy = 60% (slightly below center for foot room)
 *   rx = 40% (80% width coverage)
 *   ry = 43% (86% height coverage)
 */
export async function makeRiriZoneLargeMaskDataUrl(
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
