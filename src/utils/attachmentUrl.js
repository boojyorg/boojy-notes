import { isElectron } from "./platform";

export async function resolveAttachmentUrl(filename) {
  if (!filename || filename.startsWith("data:")) return filename;
  if (isElectron) return `boojy-att://${filename}`;
  return filename;
}

export function resolveAttachmentUrlSync(filename) {
  if (!filename || filename.startsWith("data:")) return filename;
  if (isElectron) return `boojy-att://${filename}`;
  return filename;
}
