import { isElectron } from "./platform";

/**
 * The address the renderer loads an attachment from. On the desktop that is
 * the `boojy-att` protocol (`electron/main.js`), with the vault-relative name
 * percent-encoded into the URL's *path*. Left raw, the name is read as the
 * URL's host, where Chromium refuses a space, `[` or `]` and never asks the
 * protocol at all: every `Screenshot … at ….png` drew "Image not found".
 */
export function resolveAttachmentUrl(filename) {
  if (!filename || filename.startsWith("data:")) return filename;
  if (isElectron)
    return `boojy-att://vault/${filename.split("/").map(encodeURIComponent).join("/")}`;
  return filename;
}

/**
 * The name a picture is shown under (the full-size view's title): the last
 * segment of its path or address, decoded, so `attachments/Captura%20de….png`
 * reads as the file Finder shows. Inline data has no name.
 */
export function attachmentName(src) {
  if (!src || src.startsWith("data:")) return "";
  const last = src.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
