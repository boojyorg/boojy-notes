import { crc32, deflateSync } from "node:zlib";

/**
 * A valid grey PNG of `width` × `height` pixels, with a `pHYs` chunk giving
 * `dpi` when one is asked for (a 2× Mac screenshot says 144). Shared by the
 * image-size unit tests and the Electron image specs.
 */
export function makePng(width: number, height: number, dpi?: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const rows = Buffer.alloc((width + 1) * height, 0x80);
  for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0; // filter: none
  const chunks = [chunk("IHDR", ihdr)];
  if (dpi) {
    const phys = Buffer.alloc(9);
    const perMetre = Math.round(dpi / 0.0254);
    phys.writeUInt32BE(perMetre, 0);
    phys.writeUInt32BE(perMetre, 4);
    phys[8] = 1; // unit: metre
    chunks.push(chunk("pHYs", phys));
  }
  chunks.push(chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}
