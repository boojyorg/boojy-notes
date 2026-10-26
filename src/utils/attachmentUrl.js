import { isElectron, isPhone } from "./platform";

const encodePath = (rel) => rel.split("/").map(encodeURIComponent).join("/");

/**
 * The address the renderer loads a vault file from, given its vault path
 * (`useAttachment` finds it). On the desktop that is the `boojy-att` protocol
 * (`electron/main.js`), with the path percent-encoded into the URL's *path*.
 * Left raw, the name is read as the URL's host, where Chromium refuses a
 * space, `[` or `]` and never asks the protocol at all: every
 * `Screenshot … at ….png` drew "Image not found". The phone's files are
 * served by Capacitor from the vault's own address. Inline data, and a path
 * with nowhere to load it from (the web build), are left alone.
 */
export function resolveAttachmentUrl(rel) {
  if (!rel || rel.startsWith("data:")) return rel;
  if (isElectron) return `boojy-att://vault/${encodePath(rel)}`;
  const base = isPhone ? window.boojyPhoneAPI?.vaultAddress : null;
  return base ? `${base}/${encodePath(rel)}` : rel;
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
