import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { isElectron, isCapacitor } from "./platform";

const NOTES_DIR = "BoojyNotes";
const urlCache = new Map();

export async function resolveAttachmentUrl(filename) {
  if (!filename || filename.startsWith("data:")) return filename;
  if (isElectron) return `boojy-att://${filename}`;
  if (isCapacitor) {
    if (urlCache.has(filename)) return urlCache.get(filename);
    try {
      const { uri } = await Filesystem.getUri({
        path: `${NOTES_DIR}/.attachments/${filename}`,
        directory: Directory.Documents,
      });
      const url = Capacitor.convertFileSrc(uri);
      urlCache.set(filename, url);
      return url;
    } catch {
      return filename;
    }
  }
  return filename;
}

export function resolveAttachmentUrlSync(filename) {
  if (!filename || filename.startsWith("data:")) return filename;
  if (isElectron) return `boojy-att://${filename}`;
  return urlCache.get(filename) || null;
}
