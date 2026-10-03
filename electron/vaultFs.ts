import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Entries the vault walk never shows: hidden ones and the attachment store. */
export function isSkippedName(name: string): boolean {
  return name.startsWith(".") || name === "attachments";
}

/** Files a directory may hold and still count as empty. Only exact names; a
 * `._*` AppleDouble file could be a real user file and keeps the folder. */
export function isDeletableOsCruft(name: string): boolean {
  const lower = name.toLowerCase();
  // `Icon\r` is a folder's custom icon, which Finder and Dropbox write; the
  // carriage return is part of the name.
  return (
    lower === ".ds_store" || lower === "thumbs.db" || lower === "desktop.ini" || name === "Icon\r"
  );
}

/** Whether two paths name the same directory entry (false if either is missing). */
export function isSameEntry(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a);
    const sb = fs.statSync(b);
    return sa.ino === sb.ino && sa.dev === sb.dev;
  } catch {
    return false;
  }
}

/** A short key naming a vault in the stores kept outside it (index, history). */
export function vaultKey(notesDir: string): string {
  return crypto.createHash("sha1").update(path.resolve(notesDir)).digest("hex").slice(0, 12);
}
