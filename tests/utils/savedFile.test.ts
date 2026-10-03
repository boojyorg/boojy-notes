import { describe, expect, it, vi } from "vitest";
import { fileExtension, saveFileAsBlock } from "../../src/utils/savedFile";

const api = () => ({
  saveImage: vi.fn(async ({ fileName }: { fileName: string }) => `stored-${fileName}`),
  saveAttachment: vi.fn(async ({ fileName }: { fileName: string }) => ({
    filename: `stored-${fileName}`,
    size: 42,
  })),
});

describe("fileExtension", () => {
  it("is the last dot onwards, lower-cased, or nothing", () => {
    expect(fileExtension("Photo.Final.PNG")).toBe(".png");
    expect(fileExtension("README")).toBe("");
  });
});

describe("saveFileAsBlock", () => {
  it("saves an image under its image name and answers an image block", async () => {
    const a = api();
    const block = await saveFileAsBlock(
      a,
      { fileName: "image.png", dataBase64: "" },
      "paste-1.png",
    );
    expect(a.saveImage).toHaveBeenCalledWith({ fileName: "paste-1.png", dataBase64: "" });
    expect(block).toEqual({
      type: "image",
      src: "stored-paste-1.png",
      alt: "paste-1",
      width: 0,
      text: "",
    });
  });

  it("saves anything else as an attachment under its own name", async () => {
    const a = api();
    const block = await saveFileAsBlock(
      a,
      { fileName: "Notes.pdf", dataBase64: "" },
      "ignored.pdf",
    );
    expect(a.saveAttachment).toHaveBeenCalledWith({ fileName: "Notes.pdf", dataBase64: "" });
    expect(block).toEqual({
      type: "file",
      src: "stored-Notes.pdf",
      filename: "stored-Notes.pdf",
      size: 42,
      text: "",
    });
  });
});
