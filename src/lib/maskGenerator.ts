import sharp from "sharp";

/**
 * Generate a center-ellipse mask as a data URL for SDXL inpainting.
 *
 * White = editable area (where the character will be painted).
 * Black = preserved area (background stays untouched).
 *
 * Tune ellipseW / ellipseH to control how much of the frame
 * the character occupies. 760×760 on a 1024 canvas ≈ ~55% coverage
 * which targets the "40–55% of frame" sweet spot for Riri.
 */
export async function makeCenterEllipseMaskDataUrl(
  size: number = 1024,
  ellipseW: number = 760,
  ellipseH: number = 760
): Promise<string> {
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <ellipse cx="${size / 2}" cy="${size / 2}" rx="${ellipseW / 2}" ry="${ellipseH / 2}" fill="white"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * Variant: bottom-heavy ellipse for ground-standing compositions.
 * Shifts the ellipse center downward so Riri's feet touch the ground
 * and there's more headroom above.
 */
export async function makeGroundedEllipseMaskDataUrl(
  size: number = 1024,
  ellipseW: number = 720,
  ellipseH: number = 800,
  verticalOffset: number = 80
): Promise<string> {
  const cy = size / 2 + verticalOffset;

  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="black"/>
    <ellipse cx="${size / 2}" cy="${cy}" rx="${ellipseW / 2}" ry="${ellipseH / 2}" fill="white"/>
  </svg>`;

  const png = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}
