import { describe, expect, it } from "vitest";
import {
  imageDisplayWidth,
  imageWidthFields,
  insertedImageWidth,
  onScreenWidth,
} from "../../src/utils/imageSize";
import { makePng } from "../fixtures/makePng";

const b64 = (buf: Buffer) => buf.toString("base64");

describe("onScreenWidth", () => {
  it("halves a 2× Mac screenshot (144 dpi) to the width it had on screen", () => {
    expect(onScreenWidth(b64(makePng(1048, 20, 144)))).toBe(524);
  });

  it("thirds a 3× picture (216 dpi)", () => {
    expect(onScreenWidth(b64(makePng(900, 10, 216)))).toBe(300);
  });

  it("leaves a 1× picture at its own size: no pHYs, 72 dpi or Windows' 96 dpi", () => {
    expect(onScreenWidth(b64(makePng(400, 10)))).toBeNull();
    expect(onScreenWidth(b64(makePng(400, 10, 72)))).toBeNull();
    expect(onScreenWidth(b64(makePng(400, 10, 96)))).toBeNull();
  });

  it("reads nothing from a file that is not a PNG", () => {
    expect(onScreenWidth(Buffer.from("GIF89a-not-a-png").toString("base64"))).toBeNull();
    expect(onScreenWidth("")).toBeNull();
  });
});

describe("the width an image is drawn at", () => {
  it("is the file's pixel width when it has one", () => {
    expect(imageDisplayWidth({ width: 75, widthPx: 524 })).toBe(524);
  });

  it("is the old per-cent width in pixels for a block made before widthPx", () => {
    expect(imageDisplayWidth({ width: 50 })).toBe(350);
  });

  it("is the picture's own size with no width, or a full per-cent width", () => {
    expect(imageDisplayWidth({ width: 0 })).toBeNull();
    expect(imageDisplayWidth({ width: 100 })).toBeNull();
    expect(imageDisplayWidth({})).toBeNull();
  });

  it("round-trips through the fields a resize writes", () => {
    expect(imageWidthFields(524)).toEqual({ width: 75, widthPx: 524 });
    expect(imageDisplayWidth(imageWidthFields(840))).toBe(840);
  });

  it("gives an added Retina PNG its on-screen width and a 1× picture none", () => {
    expect(insertedImageWidth(b64(makePng(1048, 20, 144)))).toEqual({ width: 75, widthPx: 524 });
    expect(insertedImageWidth(b64(makePng(200, 20)))).toEqual({});
  });
});
