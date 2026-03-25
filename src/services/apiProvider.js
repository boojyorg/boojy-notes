import { isElectron, isCapacitor } from "../utils/platform";
import capacitorAPI from "./nativeAPI";

function pickFileWeb(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          fileName: file.name,
          dataBase64: reader.result.split(",")[1],
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

const MIME_MAP = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

const webAPI = {
  pickImageFile: () => pickFileWeb("image/*"),
  pickFile: () => pickFileWeb(),
  saveImage: ({ fileName, dataBase64 }) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    const mime = MIME_MAP[ext] || "image/png";
    return `data:${mime};base64,${dataBase64}`;
  },
  saveAttachment: ({ fileName, dataBase64 }) => {
    return {
      filename: `data:application/octet-stream;base64,${dataBase64}`,
      size: Math.round((dataBase64.length * 3) / 4),
    };
  },
};

export function getAPI() {
  if (isElectron) return window.electronAPI;
  if (isCapacitor) return capacitorAPI;
  return webAPI;
}
