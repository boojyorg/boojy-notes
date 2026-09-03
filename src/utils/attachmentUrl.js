import { isElectron } from "./platform";

export function resolveAttachmentUrl(filename) {
  if (!filename || filename.startsWith("data:")) return filename;
  if (isElectron) return `boojy-att://${filename}`;
  return filename;
}
