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
