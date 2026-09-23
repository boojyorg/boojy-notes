/**
 * How wide an image block is drawn, and the width an image added in the app
 * is given.
 *
 * A width in the file (`![[shot.png|524]]`, `![alt|524](url)`) is CSS pixels,
 * as Obsidian reads it, capped at the column. With none, the picture is drawn
 * at its own size, capped at the column and never enlarged, as Obsidian and
 * Notion draw it. Until 2026-09-23 every image without a width filled the
 * column, so a small picture was stretched and blurred.
 *
 * A Retina screenshot holds twice the pixels it showed on screen, so drawn at
 * its own size it is twice the size it was captured at. The PNG says so in
 * its `pHYs` chunk (144 dpi on a 2× Mac), and an image added in the app is
 * given the width it had on screen, written into the file so every reader
 * agrees. An image already in a note is never rewritten.
 */

/** The block fields that carry a width. */
interface ImageWidthFields {
  width?: number;
  widthPx?: number;
}

/** The legacy per-cent unit: `width` is a percentage of a 700px column. */
const PX_PER_PERCENT = 7;

/** The width a block is drawn at in CSS pixels, or null for the picture's own size. */
export function imageDisplayWidth(block: ImageWidthFields): number | null {
  if (block.widthPx) return block.widthPx;
  if (block.width && block.width < 100) return Math.round(block.width * PX_PER_PERCENT);
  return null;
}

/** The block fields for no width at all: the picture drawn at its own size, `|px` gone from the file. */
export function imageNoWidthFields(): ImageWidthFields {
  return { width: 100, widthPx: undefined };
}

/** The block fields for a width of `px` CSS pixels, as the parser would read `|px` back. */
export function imageWidthFields(px: number): Required<ImageWidthFields> {
  const widthPx = Math.max(1, Math.round(px));
  const width = Math.min(Math.max(Math.round(widthPx / PX_PER_PERCENT), 10), 100);
  return { width, widthPx };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Metadata chunks sit before the pixels; this much of the file always holds them. */
const HEAD_BYTES = 64 * 1024;
const METRES_PER_INCH = 0.0254;
/** 72 dpi is one point per pixel, the Mac's 1×. */
const BASE_DPI = 72;

/**
 * The width a PNG was on screen when it was captured, in CSS pixels, or null
 * when it is an ordinary 1× picture (no `pHYs`, or under 2×) or not a PNG.
 * Reads only the head of the file.
 */
export function onScreenWidth(dataBase64: string): number | null {
  let bytes: Uint8Array;
  try {
    // A multiple of four characters decodes cleanly on its own.
    const head = dataBase64.slice(0, Math.ceil((HEAD_BYTES * 4) / 3 / 4) * 4);
    bytes = Uint8Array.from(atob(head), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer);
  let pixelWidth = 0;
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = at + 8;
    if (type === "IHDR" && data + 4 <= bytes.length) pixelWidth = view.getUint32(data);
    if (type === "pHYs" && data + 9 <= bytes.length) {
      const perMetre = view.getUint32(data);
      if (bytes[data + 8] !== 1 || !pixelWidth || !perMetre) return null;
      // Screen scales are whole (2× Retina, 3×): 143.99 dpi is 2×, and 96 dpi,
      // Windows' ordinary 1×, stays 1×.
      const scale = Math.round((perMetre * METRES_PER_INCH) / BASE_DPI);
      return scale >= 2 ? Math.round(pixelWidth / scale) : null;
    }
    if (type === "IDAT" || type === "IEND") return null;
    at = data + length + 4;
  }
  return null;
}

/** The width fields for an image added in the app: its on-screen width, or none. */
export function insertedImageWidth(dataBase64: string): ImageWidthFields {
  const px = onScreenWidth(dataBase64);
  return px ? imageWidthFields(px) : {};
}
