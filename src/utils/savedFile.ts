import { insertedImageWidth } from "./imageSize";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

/** A name's extension, lower-case with its dot; "" when it has none. */
export const fileExtension = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

interface SaveAPI {
  saveImage: (file: { fileName: string; dataBase64: string }) => Promise<string>;
  saveAttachment: (file: {
    fileName: string;
    dataBase64: string;
  }) => Promise<{ filename: string; size: number }>;
}

/**
 * Save a pasted, dropped or picked file into the vault and answer the block
 * that shows it (without an id): an image when its name says so, else a file
 * block. `imageName` is the name an image is saved under (a clipboard paste
 * is renamed); a file keeps its own.
 */
export async function saveFileAsBlock(
  api: SaveAPI,
  { fileName, dataBase64 }: { fileName: string; dataBase64: string },
  imageName = fileName,
) {
  if (IMAGE_EXTS.has(fileExtension(fileName))) {
    const src = await api.saveImage({ fileName: imageName, dataBase64 });
    const alt = imageName.replace(/\.[^.]+$/, "");
    return { type: "image", src, alt, width: 0, ...insertedImageWidth(dataBase64), text: "" };
  }
  const { filename, size } = await api.saveAttachment({ fileName, dataBase64 });
  return { type: "file", src: filename, filename, size, text: "" };
}
